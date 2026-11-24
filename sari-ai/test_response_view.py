import unittest
from unittest.mock import patch

import agents
import main


class ResponseViewTests(unittest.TestCase):
    def setUp(self):
        self.store = {
            "today": "2026-11-24",
            "products": [{"id": "coffee", "name": "Coffee", "unit": "sachet",
                          "stock": 4, "threshold": 5, "cost": 600}],
            "sales": [
                {"id": "cash", "day": "2026-11-24", "method": "cash", "total": 1000},
                {"id": "credit", "day": "2026-11-23", "method": "credit", "total": 2000},
                {"id": "future", "day": "2026-11-25", "method": "cash", "total": 9000},
            ],
            "items": [
                {"sale_id": "cash", "product_id": "coffee", "quantity": 1, "price": 1000, "cost": 600},
                {"sale_id": "credit", "product_id": "coffee", "quantity": 2, "price": 1000, "cost": 600},
                {"sale_id": "future", "product_id": "coffee", "quantity": 9, "price": 1000, "cost": 600},
            ],
            "payments": [{"day": "2026-11-24", "amount": 500}],
            "expenses": [{"day": "2026-11-24", "category": "Transport", "amount": 100}],
            "movements": [],
        }

    def test_collections_and_credit_remain_separate(self):
        view = agents.response_view(self.store, 7, "insights", "Why was cash lower than sales?")
        self.assertEqual(view["kind"], "cash")
        self.assertEqual((view["sales"], view["cashSales"], view["creditSales"]), (3000, 1000, 2000))
        self.assertEqual((view["repayments"], view["outstanding"]), (500, 1500))
        self.assertEqual(view["gross"], 1200)
        self.assertEqual(sum(row["sales"] for row in view["trend"]), 3000)
        self.assertEqual(view["products"][0]["quantity"], 3)

    def test_restock_evidence_requires_sufficient_history(self):
        view = agents.response_view(self.store, 7, "forecast", "What should I restock?")
        self.assertEqual(view["kind"], "restock")
        self.assertEqual(view["stocks"][0]["stock"], 4)
        self.assertIsNone(view["stocks"][0]["daily"])

    def test_empty_records_produce_empty_charts(self):
        for key in ("sales", "items", "payments", "expenses"):
            self.store[key] = []
        view = agents.response_view(self.store, 1, "insights", "Show sales")
        self.assertEqual(view["sales"], 0)
        self.assertEqual(view["products"], [])
        self.assertEqual(view["expenseCategories"], [])

    def test_api_attaches_snapshot_figures_to_answers(self):
        with patch("main.store.snapshot", return_value=self.store), patch("agents.llm.complete", return_value=(None, "unavailable")):
            reply = main.ask_store({"question": "Show my sales", "period": 7})
        self.assertEqual(reply["view"]["sales"], 3000)
        self.assertEqual(reply["view"]["kind"], "overview")

    def test_stock_question_and_product_filter(self):
        view = agents.response_view(self.store, 7, "insights", "What is my coffee stock right now?")
        self.assertEqual(view["kind"], "stock")
        self.assertEqual([row["name"] for row in view["stocks"]], ["Coffee"])


if __name__ == "__main__":
    unittest.main()
