import json
import logging
import os
from http.client import HTTPException
from threading import BoundedSemaphore
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


logger = logging.getLogger(__name__)
inference_slot = BoundedSemaphore(1)
PROVIDERS = (
    ("Groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1/chat/completions", "openai/gpt-oss-20b"),
    ("OpenRouter", "OPENROUTER_API_KEY", "https://openrouter.ai/api/v1/chat/completions", "nvidia/nemotron-3.5-super-vl:free"),
)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class StreamCancelled(Exception):
    """The browser disconnected; release the provider response and inference slot."""


def configured_providers():
    selected = os.getenv("AI_PROVIDER", "groq").strip().lower()
    return [(name, key, endpoint, model) for name, variable, endpoint, model in PROVIDERS
            if selected in ("auto", name.lower()) and (key := os.getenv(variable, "").strip())]


def complete(instructions, context, on_delta=None):
    """Return model text and a status suitable for displaying with a fallback."""
    configured = configured_providers()
    if not configured:
        return None, "unconfigured"
    if not inference_slot.acquire(blocking=False):
        return None, "busy"
    try:
        emitted = False
        def forward(chunk):
            nonlocal emitted
            emitted = True
            on_delta(chunk)
        for name, key, endpoint, model in configured:
            try:
                result = request_completion(name, key, endpoint, model, instructions, context,
                                            forward if on_delta else None)
                logger.info("%s completion succeeded (model=%s, streamed=%s)", name, model, bool(on_delta))
                return result, "external"
            except HTTPError as error:
                logger.warning("%s completion returned HTTP %s", name, error.code)
                error.close()
            except (URLError, OSError, HTTPException, ValueError, KeyError, IndexError, TypeError, AttributeError) as error:
                logger.warning("%s completion unavailable (%s)", name, type(error).__name__)
            if emitted:
                break  # Never mix partial text from two different providers.
    finally:
        inference_slot.release()
    return None, "unavailable"


def request_completion(name, key, endpoint, model, instructions, context, on_delta=None):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
        ],
        "stream": bool(on_delta),
    }
    if name == "Groq":
        payload.update(max_completion_tokens=2048, reasoning_effort="low")
    else:
        payload["max_tokens"] = 2048
    request = Request(endpoint, headers={
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Accept": "text/event-stream" if on_delta else "application/json",
        "User-Agent": "Sari-AI/1.0",
    }, data=json.dumps(payload).encode("utf-8"))
    with build_opener(NoRedirect).open(request, timeout=20) as response:
        if on_delta:
            return read_stream(response, on_delta)
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError("Oversized AI response.")
    choice = json.loads(raw)["choices"][0]
    if choice.get("finish_reason") in {"length", "content_filter"}:
        raise ValueError("Incomplete AI response.")
    message = choice["message"]["content"]
    if not isinstance(message, str) or not message.strip() or len(message) > 5000:
        raise ValueError("Invalid AI response.")
    return message.strip()


def read_stream(response, on_delta):
    parts, size, total = [], 0, 0
    finished = False
    while True:
        line = response.readline(65537)
        total += len(line)
        if len(line) > 65536 or total > 1_000_000:
            raise ValueError("Oversized AI stream.")
        if not line:
            break
        if not line.startswith(b"data:"):
            continue
        data = line[5:].strip()
        if data == b"[DONE]":
            break
        event = json.loads(data)
        if event.get("error"):
            raise ValueError("AI stream failed.")
        choices = event.get("choices", [])
        if not choices:
            continue
        choice = choices[0]
        reason = choice.get("finish_reason")
        if reason is not None:
            if reason != "stop":
                raise ValueError("Incomplete AI response.")
            finished = True
        content = choice.get("delta", {}).get("content")
        if content:
            if not isinstance(content, str):
                raise ValueError("Invalid AI response.")
            size += len(content)
            if size > 5000:
                raise ValueError("Oversized AI response.")
            parts.append(content)
            on_delta(content)
    message = "".join(parts).strip()
    if not finished or not message:
        raise ValueError("Incomplete AI response.")
    return message
