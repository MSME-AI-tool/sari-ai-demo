import copy
import io
import json
import unittest
from unittest.mock import patch

import agents
import main


class ConversationTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = {'today': '2026-11-27', 'products': [{'id': 'coffee', 'name': 'Coffee', 'unit': 'sachet', 'stock': 20, 'threshold': 5, 'cost': 500}],
                         'sales': [], 'items': [], 'payments': [], 'expenses': [], 'movements': []}
        model = patch('agents.llm.complete', return_value=(None, 'unavailable'))
        self.complete = model.start()
        self.addCleanup(model.stop)

    def test_greetings_have_useful_fallbacks_without_charts_in_every_mode(self):
        before = copy.deepcopy(self.snapshot)
        for message in ['Hi', 'HI!!!', 'Hello Sari', 'Hey there', 'Hello there', 'Hi again', 'Helo', 'Hi po 😊', '👋', 'Good morning', 'Kumusta?', 'Kamusta ka?', 'Magandang gabi', 'Are you there?', 'Sari']:
            for mode in ['auto', *sorted(agents.AGENTS)]:
                with self.subTest(message=message, mode=mode):
                    reply = agents.ask(self.snapshot, message, 7, mode)
                    self.assertEqual(reply['source'], 'conversation')
                    self.assertEqual(reply['intent'], 'greeting')
                    self.assertIn('Sari', reply['text'])
                    self.assertNotIn('draft', reply)
                    self.assertNotIn('facts', reply)
                    self.assertNotIn('view', reply)
        self.assertEqual(self.snapshot, before)
        self.assertEqual(self.complete.call_count, 75)

    def test_thanks_help_identity_acknowledgements_and_goodbyes(self):
        for message, intent in [('Thanks!', 'thanks'), ('Thanks for your help', 'thanks'), ('Maraming salamat po', 'thanks'), ('Who are you?', 'identity'),
                                ('What can you do?', 'help'), ('Can you help me?', 'help'), ('Help', 'help'), ('Tulong', 'help'),
                                ('Okay', 'acknowledgement'), ('yes', 'acknowledgement'), ('How are you?', 'wellbeing'), ('Bye', 'goodbye')]:
            with self.subTest(message=message):
                reply = agents.ask(self.snapshot, message, 7, 'auto')
                self.assertEqual(reply['intent'], intent)
                self.assertEqual(reply['source'], 'conversation')
                self.assertNotIn('draft', reply)
        self.assertEqual(self.complete.call_count, 12)

    def test_filipino_responses_and_useful_help_suggestions(self):
        greeting = agents.ask(self.snapshot, 'Hi', 7, 'auto', 'fil')
        thanks = agents.ask(self.snapshot, 'Salamat po', 7, 'auto', 'fil')
        help_reply = agents.ask(self.snapshot, 'Help me', 7, 'auto', 'fil')
        self.assertIn('Ako si Sari', greeting['text'])
        self.assertIn('Walang anuman', thanks['text'])
        self.assertTrue(help_reply['suggestions'])
        self.assertLessEqual(len(help_reply['suggestions']), 4)

    def test_greeting_prefix_keeps_the_actual_store_request(self):
        reply = agents.ask(self.snapshot, 'Hi Sari, what is my stock right now?', 7, 'auto')
        self.assertEqual(reply['source'], 'records')
        self.assertIn('20 sachet', reply['text'])
        draft = agents.ask(self.snapshot, 'Hello, sold 2 Coffee', 7, 'auto')
        self.assertEqual(draft['draft']['kind'], 'sale')
        self.assertEqual(draft['draft']['lines'][0]['quantity'], '2')
        self.assertEqual(agents.ask(self.snapshot, 'Hi there, sold 2 Coffee', 7, 'auto')['draft']['kind'], 'sale')
        self.assertEqual(agents.ask(self.snapshot, 'Can you add 2 Coffee to stock?', 7, 'auto')['draft']['reason'], 'restock')

    def test_help_with_a_specific_task_uses_the_current_manual_and_sari_workflow(self):
        reply = agents.ask(self.snapshot, 'Can you help me record a sale?', 7, 'auto')
        self.assertEqual(reply['source'], 'guide')
        self.assertIn('With Sari', reply['text'])
        self.assertNotIn('facts', reply)
        self.complete.assert_not_called()

    def test_conversation_does_not_reuse_an_old_recording_request(self):
        for message in ['Hi', 'Thanks', 'yes', 'Okay', 'Why?', 'What do you mean?']:
            reply = agents.ask(self.snapshot, message, 7, 'auto', context='Add 2 Coffee to stock')
            self.assertEqual(reply['source'], 'conversation')
            self.assertNotIn('draft', reply)
        self.assertEqual(self.complete.call_count, 4)
        self.complete.reset_mock()
        for message in ['yes', 'Okay']:
            reply = agents.ask(self.snapshot, message, 7, 'auto', context='Add 2 Coffee to stock')
            self.assertIn('Confirm and save', reply['text'])
            self.assertNotIn('draft', reply)
        self.complete.assert_not_called()

    def test_unrelated_or_unclear_messages_do_not_create_sales_summaries(self):
        for message in ['asdf', 'Tell me a joke', 'What is the capital of France?', 'What do you mean?', '🙂']:
            with self.subTest(message=message):
                reply = agents.ask(self.snapshot, message, 7, 'auto')
                self.assertEqual(reply['source'], 'conversation')
                self.assertNotIn('facts', reply)
        self.assertEqual(self.complete.call_count, 5)

    def test_definitions_explain_the_term_without_inventing_store_figures(self):
        for message, expected in [('What is gross profit?', 'operating expenses'), ('What does credit mean?', 'later'), ('Ano ang stock on hand?', 'stock')]:
            reply = agents.ask(self.snapshot, message, 7, 'auto')
            self.assertEqual(reply['intent'], 'definition')
            self.assertIn(expected, reply['text'].lower())
            self.assertNotIn('facts', reply)
        self.assertEqual(self.complete.call_count, 3)

    def test_json_and_stream_api_keep_greetings_as_text(self):
        for path in ['/api/v1/ask', '/api/v1/ask/stream']:
            payload = json.dumps({'question': 'Hi', 'period': 7}).encode()
            status = []
            with patch('main.store.snapshot', return_value=self.snapshot):
                chunks = main.application({'PATH_INFO': path, 'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': 'application/json',
                                           'CONTENT_LENGTH': str(len(payload)), 'wsgi.input': io.BytesIO(payload)},
                                          lambda response, headers: status.append(response))
                response = b''.join(chunks).decode()
            self.assertEqual(status, ['200 OK'])
            self.assertIn('"source": "conversation"', response)
            self.assertNotIn('"view"', response)
            self.assertNotIn('"draft"', response)
        self.assertEqual(self.complete.call_count, 2)
