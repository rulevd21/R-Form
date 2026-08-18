from __future__ import annotations

import unittest
from pathlib import Path

import pandas as pd

from rform_content.repository import diagnostics, load_bundle, prepare_queue


APP_ROOT = Path(__file__).resolve().parents[1]


class RepositoryTests(unittest.TestCase):
    def test_fixture_bundle_is_schema_complete(self) -> None:
        bundle = load_bundle(APP_ROOT)
        report = diagnostics(bundle)
        self.assertEqual(bundle.source, "DEMO / FIXTURE")
        self.assertFalse(report["queue_missing"])
        self.assertFalse(report["event_missing"])
        self.assertGreater(report["queue_rows"], 0)
        self.assertGreater(report["event_rows"], 0)

    def test_incomplete_google_config_falls_back_explicitly(self) -> None:
        bundle = load_bundle(APP_ROOT, {"data_mode": "google"}, {})
        self.assertEqual(bundle.source, "DEMO / FIXTURE")
        self.assertIn("секреты", bundle.note.lower())

    def test_prepare_queue_handles_missing_optional_dates(self) -> None:
        prepared = prepare_queue(pd.DataFrame([{"Content_ID": "A-1"}]))
        self.assertEqual(prepared.iloc[0]["Lifecycle_State"], "DRAFT")
        self.assertTrue(pd.isna(prepared.iloc[0]["Publish_Sort"]))


if __name__ == "__main__":
    unittest.main()
