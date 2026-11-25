import io
import json
import os
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

import llm


def frame(delta=None, finish=None):
    return b"data: " + json.dumps({"choices": [{"delta": delta or {}, "finish_reason": finish}]}).encode() + b"\n\n"


class StreamResponse(io.BytesIO):
    def __init__(self, data, before_read=None):
        super().__init__(data)
        self.before_read = before_read

    def readline(self, size=-1):
        if self.before_read:
            self.before_read(self.tell())
        return super().readline(size)

    def __iter__(self):
        return self

    def __next__(self):
        row = self.readline()
        if not row:
            raise StopIteration
        return row


class CompletionStreamTests(unittest.TestCase):
    def setUp(self):
        settings = patch.dict(os.environ, {"GROQ_API_KEY": "test-groq-secret", "AI_PROVIDER": "groq"}, clear=True)
        settings.start()
        self.addCleanup(settings.stop)
        self.opener = Mock()
        network = patch("llm.build_opener", return_value=self.opener)
        network.start()
        self.addCleanup(network.stop)

    def test_streams_content_before_next_upstream_event_and_ignores_reasoning(self):
        received = []
        first = frame({"reasoning": "Internal analysis"}) + frame({"content": "Sales "})
        remaining = frame({"content": "are ₱20."}) + frame(finish="stop") + b"data: [DONE]\n\n"

        def inspect(position):
            if position == len(first):
                self.assertEqual(received, ["Sales "])

        self.opener.open.return_value = StreamResponse(first + remaining, inspect)
        answer = llm.complete("Explain records", {"sales": 2000}, on_delta=received.append)
        self.assertEqual(answer, ("Sales are ₱20.", "external"))
        self.assertEqual(received, ["Sales ", "are ₱20."])
        request = self.opener.open.call_args.args[0]
        payload = json.loads(request.data)
        self.assertTrue(payload["stream"])
        self.assertEqual(payload["model"], "openai/gpt-oss-20b")
        self.assertEqual(request.full_url, "https://api.groq.com/openai/v1/chat/completions")
        self.assertEqual(request.get_header("User-agent"), "Sari-AI/1.0")

    def test_truncated_stream_is_not_reported_as_success(self):
        self.opener.open.return_value = StreamResponse(frame({"content": "Partial"}) + frame(finish="length") + b"data: [DONE]\n\n")
        with self.assertLogs("llm", level="WARNING"):
            answer = llm.complete("Explain", {}, on_delta=lambda text: None)
        self.assertEqual(answer, (None, "unavailable"))

    def test_stream_without_finish_event_is_not_reported_as_success(self):
        self.opener.open.return_value = StreamResponse(frame({"content": "Partial"}) + b"data: [DONE]\n\n")
        with self.assertLogs("llm", level="WARNING"):
            answer = llm.complete("Explain", {}, on_delta=lambda text: None)
        self.assertEqual(answer, (None, "unavailable"))

    def test_http_failure_returns_fallback_status_without_logging_credentials(self):
        self.opener.open.side_effect = HTTPError("https://api.groq.com/openai/v1/chat/completions", 401,
                                               "test-groq-secret", {}, io.BytesIO(b"test-groq-secret"))
        with self.assertLogs("llm", level="WARNING") as logs:
            answer = llm.complete("Explain", {}, on_delta=lambda text: None)
        self.assertEqual(answer, (None, "unavailable"))
        self.assertIn("401", " ".join(logs.output))
        self.assertNotIn("test-groq-secret", " ".join(logs.output))

    def test_json_completion_remains_available_for_validated_drafts(self):
        self.opener.open.return_value = io.BytesIO(json.dumps({"choices": [{
            "finish_reason": "stop", "message": {"content": '{"kind":"clarify"}'},
        }]}).encode())
        self.assertEqual(llm.complete("Make a draft", {}), ('{"kind":"clarify"}', "external"))
        payload = json.loads(self.opener.open.call_args.args[0].data)
        self.assertFalse(payload["stream"])

    def test_explicit_groq_selection_does_not_call_old_provider_after_failure(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-old-provider-secret"}):
            self.opener.open.side_effect = HTTPError("https://api.groq.com/openai/v1/chat/completions", 401,
                                                   "Unauthorized", {}, io.BytesIO(b""))
            with self.assertLogs("llm", level="WARNING"):
                answer = llm.complete("Explain", {})
        self.assertEqual(answer, (None, "unavailable"))
        self.assertEqual(self.opener.open.call_count, 1)


if __name__ == "__main__":
    unittest.main()
