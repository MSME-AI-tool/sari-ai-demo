import os
import tempfile
import unittest
from unittest.mock import patch

import agents
import store


class RevisionTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        settings = patch.dict(os.environ, {"SARI_AI_DB": folder.name + "/store.sqlite3"}, clear=True)
        settings.start()
        self.addCleanup(settings.stop)
        store.initialize()
        self.day = str(store.today())

    def test_filipino_repayment_draft_uses_existing_customer(self):
        with patch("agents.llm.complete", return_value=(None, "unconfigured")):
            reply = agents.ask(store.snapshot(), "Bayad ni Customer A na 20 pesos", 7, "auto", "fil")
        self.assertEqual(reply["draft"]["kind"], "payment")
        self.assertEqual(reply["draft"]["customer"], "Customer A")
        self.assertEqual(reply["draft"]["amount"], "20.00")
        self.assertIn("Suriin", reply["text"])

    def test_correction_updates_stock_and_credit_and_rejects_stale_draft(self):
        product = "product-1"
        lines = [{"product_id": product, "quantity": 2}]
        sale = store.add_sale(self.day, "credit", "Test Customer", lines)
        receipt = store.correct_sale(sale["id"], 0, [{"product_id": product, "quantity": 1}], "Wrong quantity")
        self.assertEqual(receipt["total"], 1000)
        self.assertEqual(receipt["stock"][0]["change"], 1)
        with self.assertRaises(store.StoreError):
            store.correct_sale(sale["id"], 0, lines, "Outdated form")
        store.add_payment(self.day, "Test Customer", 1000)
        with self.assertRaises(store.StoreError):
            store.add_payment(self.day, "Test Customer", 1)

    def test_photo_lookup_requires_unique_evidence(self):
        products = store.snapshot()["products"]
        self.assertEqual(agents.photo_matches(products, "Instant Noodles\n85 grams")[0]["id"], "product-2")
        self.assertFalse(agents.photo_matches(products, "weight 85 grams"))

    def test_receipt_drafts_quantity_and_price_without_posting(self):
        before = store.snapshot()
        reply = agents.capture(before, "2 Instant noodles 15.00 30.00", "receipt", "fil")
        line = reply["draft"]["lines"][0]
        self.assertEqual((line["product_id"], line["quantity"], line["supplier_cost"]), ("product-2", "2", "15.00"))
        with patch("agents.llm.complete", return_value=(None, "unconfigured")):
            review = agents.capture(before, "2 cases Instant noodles 15.00 30.00", "receipt", "fil")
        self.assertNotIn("draft", review)
        self.assertEqual(store.snapshot(), before)

    def test_draft_quantity_can_be_corrected_in_filipino(self):
        with patch("agents.llm.complete", return_value=(None, "unconfigured")):
            reply = agents.ask(store.snapshot(), "Gawing 12", 7, "auto", "fil", context="Dagdag 24 na kape.")
        self.assertEqual(reply["draft"]["lines"][0]["quantity"], "12")

    def test_sales_correction_cannot_unwind_a_newer_count(self):
        product = "product-1"
        sale = store.add_sale(self.day, "cash", "", [{"product_id": product, "quantity": 2}])
        store.add_movements(self.day, "count", [{"product_id": product, "quantity": 10, "note": ""}])
        before = store.snapshot()
        with self.assertRaisesRegex(store.StoreError, "later physical count"):
            store.correct_sale(sale["id"], 0, [{"product_id": product, "quantity": 1}], "Wrong quantity")
        self.assertEqual(store.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
