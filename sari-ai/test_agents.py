import unittest
from unittest.mock import patch

import agents


class AssistantTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = {
            'today': '2026-11-22',
            'products': [{'id': 'coffee', 'name': 'Coffee sachets', 'unit': 'sachet',
                          'stock': 4, 'threshold': 5, 'cost': 0}],
            'sales': [{'id': 'sale', 'day': '2026-11-22', 'method': 'credit', 'total': 1000}],
            'items': [{'sale_id': 'sale', 'product_id': 'coffee', 'quantity': 2, 'price': 500, 'cost': 0}],
            'payments': [{'day': '2026-11-22', 'amount': 300}],
            'expenses': [], 'movements': [],
        }
        mock = patch('agents.llm.complete', return_value=(None, 'unavailable'))
        self.complete = mock.start()
        self.addCleanup(mock.stop)

    def test_navigation_is_available_in_every_mode_with_no_model(self):
        for mode in ('auto', *sorted(agents.AGENTS)):
            with self.subTest(mode=mode):
                answer = agents.ask(self.snapshot, 'Paano mag-record ng bayad sa utang?', 7, mode)
                self.assertEqual(answer['source'], 'guide')
                self.assertEqual(answer['destination'], 'ledger')
                self.assertIn('Record repayment', answer['text'])
                self.assertNotIn('draft', answer)
        self.complete.assert_not_called()

    def test_insights_reports_outstanding_credit_and_links_to_ledger(self):
        answer = agents.ask(self.snapshot, 'Magkano pa ang utang?', 7, 'auto')
        self.assertEqual(answer['agent'], 'insights')
        self.assertEqual(answer['destination'], 'ledger')
        self.assertIn('₱7.00', answer['text'])

    def test_forecast_and_health_link_to_the_records_behind_the_answer(self):
        forecast = agents.ask(self.snapshot, 'What needs restocking?', 7, 'auto')
        health = agents.ask(self.snapshot, 'Check my records for missing costs.', 7, 'auto')
        self.assertEqual((forecast['agent'], forecast['destination']), ('forecast', 'stock'))
        self.assertIn('Insufficient sales history', forecast['text'])
        self.assertEqual((health['agent'], health['destination']), ('health', 'stock/history'))
        self.assertIn('Coffee sachets', str(health['facts']))

    def test_recording_drafts_filipino_stock_request(self):
        answer = agents.ask(self.snapshot, 'Dagdag 24 na kape.', 7, 'auto')
        self.assertEqual(answer['agent'], 'recording')
        self.assertEqual(answer['draft']['reason'], 'restock')
        self.assertEqual(answer['draft']['lines'][0]['product_id'], 'coffee')
        self.assertEqual(answer['draft']['lines'][0]['quantity'], '24')


if __name__ == '__main__':
    unittest.main()
