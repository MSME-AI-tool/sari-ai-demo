import os
import tempfile
import unittest
from unittest.mock import patch

import agents
import main
import store


class CaptureTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        settings = patch.dict(os.environ, {"SARI_AI_DB": folder.name + "/capture.sqlite3"}, clear=True)
        settings.start()
        self.addCleanup(settings.stop)
        model = patch("agents.llm.complete", return_value=(None, "unconfigured"))
        model.start()
        self.addCleanup(model.stop)
        store.initialize()
        self.before = store.snapshot()

    def read(self, text, kind="auto", mode="record"):
        result = agents.capture(self.before, text, mode, "en", kind)
        self.assertEqual(store.snapshot(), self.before, "Reading must never post an entry")
        return result

    def test_sold_note_cannot_become_restock_even_on_legacy_receipt_route(self):
        for mode in ("record", "receipt"):
            with self.subTest(mode=mode):
                draft = self.read("16 Sardines sold today", mode=mode)["draft"]
                self.assertEqual((draft["kind"], draft["method"], draft["lines"][0]["quantity"]), ("sale", "cash", "16"))

    def test_sold_photo_only_decreases_stock_after_confirmation(self):
        draft = self.read("16 Sardines sold today")["draft"]
        product = draft["lines"][0]["product_id"]
        before = next(p["stock"] for p in self.before["products"] if p["id"] == product)
        lines = [{**line, "quantity": int(line["quantity"])} for line in draft["lines"]]
        receipt = store.add_sale(draft["day"], draft["method"], "", lines)
        after = store.snapshot()
        self.assertEqual(next(p["stock"] for p in after["products"] if p["id"] == product), before - 16)
        self.assertEqual(len(after["sales"]), len(self.before["sales"]) + 1)
        self.assertEqual(receipt["stock"][0]["change"], -16)

    def test_unlabelled_log_requires_selection_and_conflicting_selection_is_rejected(self):
        self.assertNotIn("draft", self.read("16 Sardines"))
        self.assertEqual(self.read("16 Sardines", "sale")["draft"]["kind"], "sale")
        self.assertNotIn("draft", self.read("16 Sardines sold today", "restock"))

    def test_english_and_filipino_spoken_quantities(self):
        for text, quantity in (("Sold sixteen Sardines today", "16"),
                               ("Nabenta ang labing-anim na sardinas", "16"),
                               ("Sold twenty four Sardines", "24"),
                               ("Nabenta ang dalawang Sardines", "2"),
                               ("Nabenta ang dalawampu't apat na Sardines", "24")):
            with self.subTest(text=text):
                reply = agents.recording(self.before, text)
                self.assertEqual(reply["draft"]["lines"][0]["quantity"], quantity)

    def test_chat_routes_quantity_first_sales_to_the_same_recording_parser(self):
        for text in ("16 Sardines sold today", "Sixteen Sardines sold today"):
            reply = agents.ask(self.before, text, 7, "auto")
            self.assertEqual(reply["agent"], "recording")
            self.assertEqual(reply["draft"]["lines"][0]["quantity"], "16")
        self.assertNotEqual(agents.choose_agent("How many Sardines sold today?"), "recording")

    def test_deliveries_counts_and_wastage_have_distinct_effects(self):
        for text, reason, quantity in (("Received 16 Sardines today", "restock", "16"),
                                       ("Physical count\n0 Sardines", "count", "0"),
                                       ("3 Sardines expired", "waste", "3")):
            with self.subTest(text=text):
                draft = self.read(text)["draft"]
                self.assertEqual((draft["kind"], draft["reason"], draft["lines"][0]["quantity"]), ("stock", reason, quantity))

    def test_whole_log_is_reviewed_without_silently_skipping_bad_rows(self):
        draft = self.read("Sales today\n2 Instant noodles\n3 Sardines")["draft"]
        self.assertEqual(len(draft["lines"]), 2)
        for text in ("Sales\n2 Instant noodles\n3 Unknown item", "2 Sardines sold\n3 Sardines received",
                     "Sales\n2 Sardines\n3 Sardines", "Sales\n2 Sardines\nTotal 30.00",
                     "Sold two Unknown\n2 Sardines"):
            with self.subTest(text=text):
                self.assertNotIn("draft", self.read(text))

    def test_uncertain_quantity_date_unit_and_credit_need_manual_details(self):
        for text in ("Sold 2 cases Sardines", "Sold 2.5 Sardines", "Sold -2 Sardines",
                     "Sold two hundred Sardines", "Sold 2 Sardines yesterday", "Sold 2 Sardines 11/20/2026",
                     "Sold 2 Sardines on credit", "Did not sell 2 Sardines", "Will sell 2 Sardines",
                     "Sold 2 or 3 Sardines", "Sold 2 x 12 Sardines"):
            with self.subTest(text=text):
                self.assertNotIn("draft", self.read(text, "sale"))

    def test_record_api_uses_selected_type_and_validates_it(self):
        request = {"question": "2 Instant noodles", "period": 7, "agent": "recording", "capture": "record", "record_type": "sale"}
        self.assertEqual(main.ask_store(request)["draft"]["kind"], "sale")
        with self.assertRaises(store.StoreError):
            main.ask_store({**request, "record_type": "invalid"})


if __name__ == "__main__":
    unittest.main()
