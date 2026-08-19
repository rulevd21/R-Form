from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd

from rform_content.repository import (
    DataSourceError,
    build_api_request_auth,
    build_content_action_request,
    diagnostics,
    execute_content_action,
    load_bundle,
    prepare_queue,
)


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

    def test_incomplete_apps_script_config_falls_back_explicitly(self) -> None:
        bundle = load_bundle(APP_ROOT, {"data_mode": "apps_script"}, {})
        self.assertEqual(bundle.source, "DEMO / FIXTURE")
        self.assertIn("url или секрет", bundle.note.lower())

    def test_prepare_queue_handles_missing_optional_dates(self) -> None:
        prepared = prepare_queue(pd.DataFrame([{"Content_ID": "A-1"}]))
        self.assertEqual(prepared.iloc[0]["Lifecycle_State"], "DRAFT")
        self.assertTrue(pd.isna(prepared.iloc[0]["Publish_Sort"]))

    def test_prepare_queue_assigns_operational_priority(self) -> None:
        prepared = prepare_queue(
            pd.DataFrame(
                [
                    {"Content_ID": "published", "Publication_Status": "PUBLISHED"},
                    {"Content_ID": "planned", "Publication_Status": "PLANNED"},
                    {"Content_ID": "error", "Publication_Status": "ERROR"},
                ]
            )
        )
        priorities = prepared.set_index("Content_ID")["Lifecycle_Priority"]
        self.assertLess(priorities["error"], priorities["planned"])
        self.assertLess(priorities["planned"], priorities["published"])

    def test_hmac_envelope_is_deterministic(self) -> None:
        auth = build_api_request_auth(
            "test-secret",
            timestamp=1_700_000_000,
            nonce="ab" * 16,
        )
        self.assertEqual(auth["timestamp"], 1_700_000_000)
        self.assertEqual(auth["nonce"], "ab" * 16)
        self.assertEqual(auth["signature"], "4KXLnQtfIXcvHUrlDOoR_FfZpx_DuKjxF8hFSTa8AfI")

    def test_content_action_envelope_is_deterministic(self) -> None:
        request = build_content_action_request(
            "test-secret",
            "CNT-001",
            "APPROVE",
            "Проверено",
            timestamp=1_700_000_000,
            nonce="ab" * 16,
            action_id="cd" * 16,
        )
        self.assertEqual(request["operation"], "content_action")
        self.assertEqual(request["action_id"], "cd" * 16)
        self.assertEqual(request["content_id"], "CNT-001")
        self.assertEqual(request["action"], "APPROVE")
        self.assertEqual(request["comment"], "Проверено")
        self.assertEqual(
            request["signature"],
            "lHmEkuLRlVKmeRrJEKG43Mk7AKZvdAMwls5gwVXsruU",
        )

    def test_content_action_rejects_unknown_action(self) -> None:
        with self.assertRaises(ValueError):
            build_content_action_request("secret", "CNT-001", "PUBLISH")

    def test_apps_script_live_bundle_uses_signed_post(self) -> None:
        queue = pd.read_csv(APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False)
        events = pd.read_csv(APP_ROOT / "fixtures" / "data_events.csv", keep_default_na=False)
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "ok": True,
            "generated_at": "2026-08-18T18:00:00.000Z",
            "queue_fields": list(queue.columns),
            "event_fields": list(events.columns),
            "queue": queue.to_dict(orient="records"),
            "events": events.to_dict(orient="records"),
        }

        with patch("rform_content.repository.requests.post", return_value=response) as post:
            bundle = load_bundle(
                APP_ROOT,
                {
                    "data_mode": "apps_script",
                    "apps_script_url": "https://script.google.com/macros/s/demo-deployment/exec",
                    "request_timeout_seconds": 12,
                },
                {"secret": "live-secret"},
            )

        self.assertEqual(bundle.source, "APPS SCRIPT / READ ONLY")
        self.assertEqual(len(bundle.queue), len(queue))
        self.assertEqual(len(bundle.events), len(events))
        request = post.call_args.kwargs
        self.assertEqual(request["timeout"], 12)
        self.assertNotIn("live-secret", str(request))
        self.assertEqual(set(request["json"]), {"timestamp", "nonce", "signature"})

    def test_apps_script_endpoint_is_allowlisted(self) -> None:
        with self.assertRaises(DataSourceError):
            load_bundle(
                APP_ROOT,
                {
                    "data_mode": "apps_script",
                    "apps_script_url": "https://example.com/content",
                },
                {"secret": "live-secret"},
            )

    def test_execute_content_action_uses_signed_allowlisted_request(self) -> None:
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "ok": True,
            "status": "APPLIED",
            "content_id": "CNT-001",
            "action": "HOLD",
        }
        with patch("rform_content.repository.requests.post", return_value=response) as post:
            result = execute_content_action(
                "https://script.google.com/macros/s/demo-deployment/exec",
                "live-secret",
                "CNT-001",
                "HOLD",
                "Ждём решение",
                timeout_seconds=12,
            )

        self.assertEqual(result["status"], "APPLIED")
        request = post.call_args.kwargs["json"]
        self.assertEqual(request["operation"], "content_action")
        self.assertEqual(request["content_id"], "CNT-001")
        self.assertEqual(request["action"], "HOLD")
        self.assertNotIn("live-secret", str(request))


if __name__ == "__main__":
    unittest.main()
