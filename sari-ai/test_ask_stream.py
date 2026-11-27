import io
import json
import unittest
from threading import Event
from unittest.mock import patch

import main


class AskStreamTests(unittest.TestCase):
    def request(self, entry, path="/api/v1/ask/stream"):
        body = json.dumps(entry).encode()
        response = {}
        environ = {"PATH_INFO": path, "REQUEST_METHOD": "POST",
                   "CONTENT_TYPE": "application/json", "CONTENT_LENGTH": str(len(body)),
                   "wsgi.input": io.BytesIO(body)}
        def start(status, headers):
            response.update(status=status, headers=dict(headers))
        return response, main.application(environ, start)

    def test_stream_sends_text_before_completion_and_keeps_final_metadata(self):
        received = Event()
        answer = {"agent": "insights", "source": "external", "text": "Sales are recorded.",
                  "facts": [{"label": "Sales", "value": "P10"}], "destination": "sales"}
        def ask(entry, on_delta=None, **kwargs):
            on_delta("Sales ")
            if not received.wait(2):
                raise RuntimeError("The response was buffered")
            on_delta("are recorded.")
            return answer
        with patch("main.prepare_ask", return_value=()), patch("main.ask_store", side_effect=ask):
            response, chunks = self.request({"question": "Show sales", "period": 7})
            iterator = iter(chunks)
            first = next(iterator)
            self.assertIn("text/event-stream", response["headers"]["Content-Type"])
            self.assertNotIn("Content-Length", response["headers"])
            self.assertEqual(response["status"], "200 OK")
            data = first
            while b'event: delta' not in data:
                data += next(iterator)
            self.assertNotIn(b'event: done', data)
            received.set()
            data += b''.join(iterator)
        self.assertIn(b'event: done', data)
        self.assertIn(b'"destination": "sales"', data)
        self.assertIn(b'"facts"', data)

    def test_invalid_request_is_rejected_before_stream_headers(self):
        response, chunks = self.request({"question": "Show sales", "period": 0})
        self.assertEqual(response["status"], "422 Unprocessable Entity")
        self.assertIn(b'valid value for period', b''.join(chunks))

    def test_disconnected_stream_stops_production(self):
        stopped = Event()
        def ask(entry, on_delta=None, **kwargs):
            try:
                for _ in range(1000):
                    on_delta("chunk")
            finally:
                stopped.set()
            return {"agent": "insights", "source": "external", "text": "done"}
        with patch("main.prepare_ask", return_value=()), patch("main.ask_store", side_effect=ask):
            _, chunks = self.request({"question": "Show sales", "period": 7})
            next(chunks)
            next(chunks)
            chunks.close()
            self.assertTrue(stopped.wait(2))

    def test_legacy_json_route_is_preserved(self):
        with patch("main.store.snapshot", return_value={}), patch("main.agents.ask", return_value={
                "agent": "recording", "source": "guide", "text": "Review the draft."}):
            response, chunks = self.request({"question": "Record a sale", "period": 7}, path="/api/v1/ask")
        self.assertEqual(response["status"], "200 OK")
        self.assertEqual(json.loads(b''.join(chunks))["text"], "Review the draft.")
