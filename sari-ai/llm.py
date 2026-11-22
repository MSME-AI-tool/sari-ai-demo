import json
import logging
import os
from http.client import HTTPException
from threading import BoundedSemaphore
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


logger = logging.getLogger(__name__)
inference_slot = BoundedSemaphore(1)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def complete(instructions, context):
    """Return model text and a status suitable for displaying with a fallback."""
    base_url = os.getenv("FREELLMAPI_BASE_URL", "").strip().rstrip("/")
    key = os.getenv("FREELLMAPI_API_KEY", "").strip()
    if not base_url or not key:
        return None, "unconfigured"

    try:
        base = urlsplit(base_url)
        local = base.hostname in {"localhost", "127.0.0.1", "::1"}
        if (not base.hostname or base.username or base.password or base.query or base.fragment
                or not (base.scheme == "https" or (base.scheme == "http" and local))):
            raise ValueError("Use an HTTPS gateway or a local HTTP gateway.")
        endpoint = base_url if base.path.endswith("/v1") else base_url + "/v1"
        request = Request(endpoint + "/chat/completions", headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }, data=json.dumps({
            "model": os.getenv("FREELLMAPI_MODEL", "").strip() or "auto",
            "messages": [
                {"role": "system", "content": instructions},
                {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
            ],
            "stream": False,
            "max_tokens": 550,
        }).encode("utf-8"))
        if not inference_slot.acquire(blocking=False):
            return None, "busy"
        try:
            with build_opener(NoRedirect).open(request, timeout=15) as response:
                raw = response.read(65537)
            if len(raw) > 65536:
                raise ValueError("Oversized AI response.")
            choice = json.loads(raw)["choices"][0]
            if choice.get("finish_reason") in {"length", "content_filter"}:
                raise ValueError("Incomplete AI response.")
            message = choice["message"]["content"]
            if not isinstance(message, str) or not message.strip() or len(message) > 5000:
                raise ValueError("Invalid AI response.")
            return message.strip(), "external"
        finally:
            inference_slot.release()
    except (URLError, OSError, HTTPException, ValueError, KeyError, IndexError, TypeError, AttributeError) as error:
        logger.warning("FreeLLMAPI response unavailable (%s)", type(error).__name__)
        return None, "unavailable"
