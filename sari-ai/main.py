import json
import mimetypes
from datetime import date
from pathlib import Path
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, make_server

import agents
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
    store.add_product(record_day(entry), text(entry, "name"), text(entry, "category"), text(entry, "unit"),
                      number(entry, "price", maximum=10_000_000), number(entry, "cost", maximum=10_000_000),
                      number(entry, "stock"), number(entry, "threshold"), text(entry, "note", 500, required=False))


def create_stock_entry(entry):
    reason = text(entry, "reason")
    if reason not in ("restock", "count", "waste"):
        raise store.StoreError("Choose a valid stock entry type.")
    store.add_movements(record_day(entry), reason, lines(entry, 0 if reason == "count" else 1, include_note=True))


def create_sale(entry):
    method = text(entry, "method")
    if method not in ("cash", "credit"):
        raise store.StoreError("Choose cash or credit.")
    customer = text(entry, "customer") if method == "credit" else ""
    store.add_sale(record_day(entry), method, customer, lines(entry, 1))


def create_expense(entry):
    store.add_expense(record_day(entry), text(entry, "category"), text(entry, "description"),
                      number(entry, "amount", 1, 10_000_000))


def create_payment(entry):
    store.add_payment(record_day(entry), text(entry, "customer"), number(entry, "amount", 1, 10_000_000))


def ask_store(entry):
    question = text(entry, "question", 500)
    length = number(entry, "period", 1, 14)
    mode = text(entry, "agent", 20)
    if length not in {1, 7, 14}:
        raise store.StoreError("Choose today, 7 days, or 14 days.")
    if mode != "auto" and mode not in agents.AGENTS:
        raise store.StoreError("Choose a valid agent.")
    return agents.ask(store.snapshot(), question, length, mode)


WRITES = {
    API + "products": create_product,
    API + "stock": create_stock_entry,
    API + "sales": create_sale,
    API + "expenses": create_expense,
    API + "payments": create_payment,
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
        if not 1 <= length <= 65536:
            raise ValueError
        payload = json.loads(environ["wsgi.input"].read(length))
        if not isinstance(payload, dict):
            raise ValueError
    except (ValueError, UnicodeDecodeError) as error:
        raise store.StoreError("Enter a valid record of up to 64 KB.") from error
    return payload


def application(environ, start):
    path = environ["PATH_INFO"]
    method = environ["REQUEST_METHOD"]
    head = method == "HEAD"
    if path == "/api" or path.startswith("/api/"):
        if method in ("GET", "HEAD") and path == API + "health":
            return json_output(start, "200 OK", {"status": "ok"}, head)
        if method in ("GET", "HEAD") and path == API + "store":
            return json_output(start, "200 OK", store.snapshot(), head)
        if method == "POST" and (path in WRITES or path == API + "ask"):
            if environ.get("CONTENT_TYPE", "").split(";")[0].strip().lower() != "application/json":
                return json_output(start, "415 Unsupported Media Type", {"detail": "Send the record as JSON."})
            try:
                entry = request_body(environ)
                if path == API + "ask":
                    return json_output(start, "200 OK", ask_store(entry))
                WRITES[path](entry)
            except store.StoreError as error:
                return json_output(start, "422 Unprocessable Entity", {"detail": str(error)})
            return json_output(start, "201 Created", {"saved": True})
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
