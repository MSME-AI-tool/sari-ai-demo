import json
import base64
import binascii
import mimetypes
import logging
from datetime import date
from pathlib import Path
from socketserver import ThreadingMixIn
from queue import Empty, Full, Queue
from threading import Event, Thread
from wsgiref.simple_server import WSGIServer, make_server

import agents
import llm
import store


DIST = Path(__file__).with_name("dist").resolve()
API = "/api/v1/"


def text(entry, name, maximum=100, required=True):
    value = entry.get(name, "")
    if not isinstance(value, str):
        raise store.StoreError(f"Enter text for {name.replace('_', ' ')}.")
    value = value.strip()
    if len(value) > maximum or (required and not value):
        raise store.StoreError(f"Enter up to {maximum} characters for {name.replace('_', ' ')}.")
    return value


def number(entry, name, minimum=0, maximum=1_000_000):
    value = entry.get(name)
    if type(value) is not int or not minimum <= value <= maximum:
        raise store.StoreError(f"Enter a valid value for {name}.")
    return value


def record_day(entry):
    try:
        day = date.fromisoformat(text(entry, "day", 10))
    except ValueError as error:
        raise store.StoreError("Enter a valid date.") from error
    if day > store.today():
        raise store.StoreError("Choose today or an earlier date.")
    return day.isoformat()


def lines(entry, minimum, include_note=False):
    rows = entry.get("entries")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 50 or any(not isinstance(row, dict) for row in rows):
        raise store.StoreError("Enter between one and 50 product lines.")
    return [{"product_id": text(row, "product_id"), "quantity": number(row, "quantity", minimum),
             "note": text(row, "note", 500, required=False) if include_note else ""} for row in rows]


def create_product(entry):
    return store.add_product(record_day(entry), text(entry, "name"), text(entry, "category"), text(entry, "unit"),
                      number(entry, "price", maximum=10_000_000), number(entry, "cost", maximum=10_000_000),
                      number(entry, "stock"), number(entry, "threshold"), text(entry, "note", 500, required=False),
                      product_photo(entry))


def product_photo(entry):
    photo = text(entry, "photo", 250_000, required=False)
    if not photo:
        return ""
    header, _, content = photo.partition(",")
    try:
        if header != "data:image/jpeg;base64" or not base64.b64decode(content, validate=True).startswith(b"\xff\xd8\xff"):
            raise ValueError
    except (ValueError, binascii.Error) as error:
        raise store.StoreError("Choose a valid product photo.") from error
    return photo


def revise_product(entry):
    return store.update_product(text(entry, "product_id"), number(entry, "cost", maximum=10_000_000),
                                product_photo(entry))


def create_stock_entry(entry):
    reason = text(entry, "reason")
    if reason not in ("restock", "count", "waste"):
        raise store.StoreError("Choose a valid stock entry type.")
    return store.add_movements(record_day(entry), reason, lines(entry, 0 if reason == "count" else 1, include_note=True))


def create_sale(entry):
    method = text(entry, "method")
    if method not in ("cash", "credit"):
        raise store.StoreError("Choose cash or credit.")
    customer = text(entry, "customer") if method == "credit" else ""
    return store.add_sale(record_day(entry), method, customer, lines(entry, 1))


def revise_sale(entry):
    return store.correct_sale(text(entry, "sale_id"), number(entry, "revision"),
                              lines(entry, 1), text(entry, "note", 200))


def create_expense(entry):
    return store.add_expense(record_day(entry), text(entry, "category"), text(entry, "description"),
                      number(entry, "amount", 1, 10_000_000))


def create_payment(entry):
    return store.add_payment(record_day(entry), text(entry, "customer"), number(entry, "amount", 1, 10_000_000))


def prepare_ask(entry):
    question = text(entry, "question", 4000)
    length = number(entry, "period", 1, 14)
    mode = text(entry, "agent", 20, required=False) or "auto"
    language = "fil" if entry.get("language") == "fil" else "en"
    context = text(entry, "context", 4000, required=False)
    if length not in {1, 7, 14}:
        raise store.StoreError("Choose today, 7 days, or 14 days.")
    if mode != "auto" and mode not in agents.AGENTS:
        raise store.StoreError("Choose a valid agent.")
    snapshot = store.snapshot()
    return snapshot, question, length, mode, language, context


def ask_store(entry, on_delta=None, prepared=None):
    snapshot, question, length, mode, language, context = prepared if prepared is not None else prepare_ask(entry)
    record_type = entry.get("record_type", "auto")
    if record_type not in ("auto", "sale", "restock", "count", "waste"):
        raise store.StoreError("Choose a valid entry type.")
    if entry.get("capture") in ("receipt", "record", "product") or record_type != "auto":
        return agents.capture(snapshot, question, entry.get("capture", "record"), language, record_type)
    answer = agents.ask(snapshot, question, length, mode, language, context=context, on_delta=on_delta)
    if answer["agent"] in ("insights", "forecast") and answer["source"] != "guide" and not answer.get("draft"):
        answer["view"] = agents.response_view(snapshot, length, answer["agent"], question)
    return answer


def stream_answer(start, entry):
    prepared = prepare_ask(entry)  # Validate before committing the streaming headers.
    start("200 OK", [("Content-Type", "text/event-stream; charset=utf-8"),
                     ("Cache-Control", "no-cache, no-transform"), ("X-Accel-Buffering", "no"),
                     ("X-Content-Type-Options", "nosniff")])
    def generate():
        events = Queue(maxsize=32)
        cancelled = Event()
        def send(kind, data):
            while not cancelled.is_set():
                try:
                    events.put((kind, data), timeout=.1)
                    return
                except Full:
                    continue
            raise llm.StreamCancelled()
        def produce():
            try:
                answer = ask_store(entry, on_delta=lambda chunk: send("delta", {"text": chunk}), prepared=prepared)
                send("done", answer)
            except llm.StreamCancelled:
                pass
            except Exception as error:
                logging.getLogger(__name__).error("Sari stream failed (%s)", type(error).__name__)
                try:
                    send("error", {"detail": "The response was interrupted. Please try again."})
                except llm.StreamCancelled:
                    pass
        try:
            yield b": ready\n\n"
            Thread(target=produce, daemon=True).start()
            while not cancelled.is_set():
                try:
                    kind, data = events.get(timeout=5)
                except Empty:
                    yield b": waiting\n\n"
                    continue
                yield ("event: " + kind + "\ndata: " + json.dumps(data, ensure_ascii=False) + "\n\n").encode("utf-8")
                if kind in ("done", "error"):
                    return
        finally:
            cancelled.set()
    return generate()


WRITES = {
    API + "products": create_product,
    API + "stock": create_stock_entry,
    API + "sales": create_sale,
    API + "expenses": create_expense,
    API + "payments": create_payment,
    API + "sales/correction": revise_sale,
    API + "products/details": revise_product,
}


def output(start, status, body, content_type, cache="no-store", head=False):
    start(status, [("Content-Type", content_type), ("Content-Length", str(len(body))),
                   ("Cache-Control", cache), ("X-Content-Type-Options", "nosniff")])
    return [] if head else [body]


def json_output(start, status, data, head=False):
    return output(start, status, json.dumps(data).encode("utf-8"), "application/json; charset=utf-8", head=head)


def request_body(environ):
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
        if not 1 <= length <= 262144:
            raise ValueError
        payload = json.loads(environ["wsgi.input"].read(length))
        if not isinstance(payload, dict):
            raise ValueError
    except (ValueError, UnicodeDecodeError) as error:
        raise store.StoreError("Enter a valid record of up to 256 KB.") from error
    return payload


def application(environ, start):
    path = environ["PATH_INFO"]
    method = environ["REQUEST_METHOD"]
    head = method == "HEAD"
    if path == "/api" or path.startswith("/api/"):
        if method in ("GET", "HEAD") and path == API + "health":
            return json_output(start, "200 OK", {"status": "ok"}, head)
        if method in ("GET", "HEAD") and path == API + "store":
            ai_configured = bool(llm.configured_providers())
            return json_output(start, "200 OK", {**store.snapshot(), "ai_configured": ai_configured}, head)
        if method == "POST" and (path in WRITES or path in (API + "ask", API + "ask/stream")):
            if environ.get("CONTENT_TYPE", "").split(";")[0].strip().lower() != "application/json":
                return json_output(start, "415 Unsupported Media Type", {"detail": "Send the record as JSON."})
            try:
                entry = request_body(environ)
                if path == API + "ask/stream":
                    return stream_answer(start, entry)
                if path == API + "ask":
                    return json_output(start, "200 OK", ask_store(entry))
                receipt = WRITES[path](entry)
            except store.StoreError as error:
                return json_output(start, "422 Unprocessable Entity", {"detail": str(error)})
            return json_output(start, "201 Created", {"saved": True, **receipt})
        return json_output(start, "404 Not Found", {"detail": "Route not found."}, head)
    if method not in ("GET", "HEAD"):
        return json_output(start, "405 Method Not Allowed", {"detail": "Method not allowed."})
    asset = (DIST / path.lstrip("/")).resolve()
    if not asset.is_relative_to(DIST):
        return json_output(start, "404 Not Found", {"detail": "Page not found."}, head)
    if not asset.is_file() and "." not in asset.name:
        asset = DIST / "index.html"
    if not asset.is_file():
        return json_output(start, "404 Not Found", {"detail": "Page not found. Build the frontend first."}, head)
    kind = "application/manifest+json" if asset.suffix == ".webmanifest" else (
        mimetypes.guess_type(asset.name)[0] or "application/octet-stream")
    if asset.suffix == ".js":
        kind = "text/javascript"
    cache = "public, max-age=31536000, immutable" if asset.parent == DIST / "assets" else "no-cache"
    return output(start, "200 OK", asset.read_bytes(), kind, cache, head)


class LocalServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


if __name__ == "__main__":
    store.initialize()
    with make_server("127.0.0.1", 8000, application, server_class=LocalServer) as server:
        print("SARI-AI is listening at http://127.0.0.1:8000", flush=True)
        server.serve_forever()
