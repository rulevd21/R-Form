from __future__ import annotations

import hashlib
import base64
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd

from rform_content.repository import (
    DataSourceError,
    build_api_request_auth,
    build_content_action_request,
    build_event_decision_request,
    build_event_media_request,
    build_event_review_request,
    build_publication_approval_request,
    build_queue_publication_approval_request,
    build_queue_publication_assets_request,
    diagnostics,
    execute_content_action,
    execute_publication_approval,
    execute_queue_publication_approval,
    fetch_queue_publication_assets,
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
        self.assertGreater(report["session_rows"], 0)
        self.assertFalse(report["session_missing"])

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

    def test_event_review_envelope_is_deterministic(self) -> None:
        request = build_event_review_request(
            "test-secret",
            "EVT-001",
            "Факт",
            "Главная мысль",
            "Комментарий",
            timestamp=1_700_000_000,
            nonce="ab" * 16,
            action_id="cd" * 16,
        )
        self.assertEqual(request["operation"], "event_review")
        self.assertEqual(request["signature"], "CqMOzdF541vD7s9CGX7Pxk6-SQr3f9pjDrhpUWVKx-o")

    def test_event_decision_envelope_is_deterministic(self) -> None:
        request = build_event_decision_request(
            "test-secret",
            "EVT-001",
            "TO_PUBLICATION",
            "Факт",
            "Главная мысль",
            "Комментарий",
            timestamp=1_700_000_000,
            nonce="ab" * 16,
            action_id="cd" * 16,
        )
        self.assertEqual(request["operation"], "event_decision")
        self.assertEqual(request["decision"], "TO_PUBLICATION")
        self.assertEqual(request["signature"], "a7SqcLtgyLkXJTv4ih6T0YlwldGK8W3Z1QJ4OelasLA")

    def test_event_media_envelope_is_deterministic(self) -> None:
        request = build_event_media_request(
            "test-secret",
            "EVT-001",
            "photo.jpg",
            "image/jpeg",
            b"abc",
            timestamp=1_700_000_000,
            nonce="ab" * 16,
            action_id="cd" * 16,
        )
        self.assertEqual(request["operation"], "event_media")
        self.assertEqual(request["size"], 3)
        self.assertEqual(request["signature"], "nsdHZ1FRQGgU1m19nvwDGWqbXSQX55oW03zKBnG4Sio")

    def test_publication_approval_envelope_is_signed_and_exact(self) -> None:
        request = build_publication_approval_request(
            "test-secret",
            "PROP-S-20260821-C-CREATE-REPORT",
            "S-20260821-C",
            "ab" * 32,
            "CREATE_NEW",
            "",
            "Тренировка C: факт и решение",
            "Сильный сигнал без автоматического ускорения.",
            "Готовый текст публикации",
            timestamp=1_700_000_000,
            nonce="ab" * 16,
            action_id="cd" * 16,
        )
        self.assertEqual(request["operation"], "publication_approval")
        self.assertEqual(request["mode"], "CREATE_NEW")
        self.assertEqual(request["session_id"], "S-20260821-C")
        self.assertNotIn("visual_sha256", request)
        self.assertNotIn("test-secret", str(request))

    def test_publication_approval_can_attach_one_signed_visual(self) -> None:
        request = build_publication_approval_request(
            "test-secret",
            "PROP-S-20260821-C-CREATE-REPORT",
            "S-20260821-C",
            "ab" * 32,
            "CREATE_NEW",
            "",
            "Тренировка C: факт и решение",
            "Сильный сигнал без автоматического ускорения.",
            "Готовый текст публикации",
            "rform-training-c.png",
            "image/png",
            b"visual-bytes",
            timestamp=1_700_000_000,
            nonce="ab" * 16,
            action_id="cd" * 16,
        )
        self.assertEqual(request["visual_mime_type"], "image/png")
        self.assertEqual(request["visual_size"], len(b"visual-bytes"))
        self.assertEqual(
            request["visual_sha256"], hashlib.sha256(b"visual-bytes").hexdigest()
        )
        self.assertTrue(request["visual_data_base64"])
        self.assertEqual(request["signature"], "yc4N57ZHWSP9aM2ITjIMfqcWEW_UyL0Q8129F0r7JOc")

    def test_publication_visual_metadata_requires_bytes(self) -> None:
        with self.assertRaises(ValueError):
            build_publication_approval_request(
                "test-secret", "PROP-1", "S-1", "ab" * 32, "CREATE_NEW", "",
                "Название", "Главная мысль", "Текст", "visual.png", "image/png", None,
            )

    def test_existing_queue_approval_is_signed_and_exact(self) -> None:
        request = build_queue_publication_approval_request(
            "test-secret",
            "AUTO-WEEKLY-20260823",
            "Готовый недельный отчёт",
            "https://drive.google.com/drive/folders/example",
            "ALBUM_CAPTION",
            timestamp=1_700_000_000,
            nonce="ab" * 16,
            action_id="cd" * 16,
        )
        self.assertEqual(request["operation"], "queue_publication_approval")
        self.assertEqual(request["content_id"], "AUTO-WEEKLY-20260823")
        self.assertEqual(request["telegram_post_mode"], "ALBUM_CAPTION")
        self.assertNotIn("test-secret", str(request))

    def test_visual_queue_approval_requires_a_visual_url(self) -> None:
        with self.assertRaises(ValueError):
            build_queue_publication_approval_request(
                "secret", "CNT-001", "Текст", "", "ALBUM_CAPTION"
            )

    def test_queue_assets_envelope_is_signed_and_exact(self) -> None:
        request = build_queue_publication_assets_request(
            "test-secret",
            "AUTO-WEEKLY-20260823",
            timestamp=1_700_000_000,
            nonce="ab" * 16,
        )
        self.assertEqual(request["operation"], "queue_publication_assets")
        self.assertEqual(request["content_id"], "AUTO-WEEKLY-20260823")
        self.assertEqual(
            set(request),
            {"timestamp", "nonce", "signature", "operation", "content_id"},
        )
        self.assertNotIn("test-secret", str(request))

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

    def test_execute_publication_approval_sends_exact_selected_option(self) -> None:
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "ok": True,
            "status": "APPLIED",
            "content_id": "CNT-20260821-S-20260821-C",
            "publication_status": "SCHEDULED",
        }
        with patch("rform_content.repository.requests.post", return_value=response) as post:
            result = execute_publication_approval(
                "https://script.google.com/macros/s/demo-deployment/exec",
                "live-secret",
                "PROP-S-20260821-C-CREATE-REPORT",
                "S-20260821-C",
                "ab" * 32,
                "CREATE_NEW",
                "",
                "Тренировка C: факт и решение",
                "Сильный сигнал без автоматического ускорения.",
                "Точный выбранный текст",
                timeout_seconds=12,
            )

        self.assertEqual(result["publication_status"], "SCHEDULED")
        request = post.call_args.kwargs["json"]
        self.assertEqual(request["operation"], "publication_approval")
        self.assertEqual(request["session_id"], "S-20260821-C")
        self.assertEqual(request["telegram_text"], "Точный выбранный текст")
        self.assertNotIn("live-secret", str(request))

    def test_queue_assets_are_decoded_and_sorted_for_preview(self) -> None:
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "ok": True,
            "assets": [
                {
                    "filename": "weekly_v03_card-03.png",
                    "mime_type": "image/png",
                    "size": 5,
                    "version": 3,
                    "order": 3,
                    "data_base64": base64.b64encode(b"three").decode("ascii"),
                },
                {
                    "filename": "weekly_v03_card-01.png",
                    "mime_type": "image/png",
                    "size": 3,
                    "version": 3,
                    "order": 1,
                    "data_base64": base64.b64encode(b"one").decode("ascii"),
                },
            ],
        }
        with patch("rform_content.repository.requests.post", return_value=response) as post:
            assets = fetch_queue_publication_assets(
                "https://script.google.com/macros/s/demo-deployment/exec",
                "live-secret",
                "AUTO-WEEKLY-20260823",
            )

        self.assertEqual([asset.order for asset in assets], [1, 3])
        self.assertEqual([asset.data for asset in assets], [b"one", b"three"])
        self.assertEqual(post.call_args.kwargs["json"]["operation"], "queue_publication_assets")


if __name__ == "__main__":
    unittest.main()
