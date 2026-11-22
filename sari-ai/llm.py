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


def complete(instructions, context):
    """Return model text and a status suitable for displaying with a fallback."""
    configured = [
        (name, key, endpoint, model)
        for name, variable, endpoint, model in PROVIDERS
        if (key := os.getenv(variable, "").strip())
    ]
    if not configured:
        return None, "unconfigured"
    if not inference_slot.acquire(blocking=False):
        return None, "busy"
    try:
        for name, key, endpoint, model in configured:
            try:
                return request_completion(name, key, endpoint, model, instructions, context), "external"
            except HTTPError as error:
                logger.warning("%s completion returned HTTP %s", name, error.code)
                error.close()
            except (URLError, OSError, HTTPException, ValueError, KeyError, IndexError, TypeError, AttributeError) as error:
                logger.warning("%s completion unavailable (%s)", name, type(error).__name__)
    finally:
        inference_slot.release()
    return None, "unavailable"


def request_completion(name, key, endpoint, model, instructions, context):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
        ],
        "stream": False,
    }
    if name == "Groq":
        payload.update(max_completion_tokens=2048, reasoning_effort="low")
    else:
        payload["max_tokens"] = 2048
    request = Request(endpoint, headers={
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }, data=json.dumps(payload).encode("utf-8"))
    with build_opener(NoRedirect).open(request, timeout=10) as response:
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
