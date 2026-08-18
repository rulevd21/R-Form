from __future__ import annotations

import unittest

from rform_content.lifecycle import derive_lifecycle_state, is_action_required, readiness_issues


class LifecycleTests(unittest.TestCase):
    def test_state_precedence_matches_channel_control(self) -> None:
        cases = [
            ({"Content_ID": "1", "Publication_Status": "ERROR"}, "ERROR"),
            ({"Content_ID": "1", "Publication_Status": "SUPERSEDED"}, "SUPERSEDED"),
            ({"Content_ID": "1", "Publication_Status": "CANCELLED"}, "CANCELLED"),
            ({"Content_ID": "1", "Publication_Status": "HOLD"}, "HOLD"),
            ({"Content_ID": "1", "Publication_Status": "PUBLISHED"}, "PUBLISHED"),
            ({"Content_ID": "1", "Publication_Status": "SCHEDULED"}, "SCHEDULED"),
            ({"Content_ID": "1", "Approval_Status": "APPROVED"}, "APPROVED"),
            ({"Content_ID": "1", "Text_Status": "READY"}, "REVIEW"),
            ({"Content_ID": "1", "Pipeline_Status": "PLANNED"}, "PLANNED"),
            ({"Content_ID": "1"}, "DRAFT"),
            ({}, "IDEA"),
        ]
        for row, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(derive_lifecycle_state(row), expected)

    def test_text_only_does_not_require_visual(self) -> None:
        row = {
            "Public_Data_Allowed": "YES",
            "Text_Status": "APPROVED",
            "Approval_Status": "APPROVED",
            "Visual_Status": "DRAFT",
            "Distribution_Mode": "TEXT_ONLY",
            "Telegram_Text": "Ready",
        }
        self.assertEqual(readiness_issues(row), [])

    def test_media_requires_visual_approval(self) -> None:
        row = {
            "Public_Data_Allowed": "YES",
            "Text_Status": "APPROVED",
            "Approval_Status": "APPROVED",
            "Visual_Status": "DRAFT",
            "Distribution_Mode": "MEDIA_CAPTION",
            "Telegram_Text": "Ready",
        }
        self.assertIn("Визуал не утверждён", readiness_issues(row))

    def test_scheduled_but_not_ready_requires_action(self) -> None:
        row = {
            "Content_ID": "1",
            "Publication_Status": "SCHEDULED",
            "Public_Data_Allowed": "NO",
            "Text_Status": "APPROVED",
            "Approval_Status": "APPROVED",
            "Distribution_Mode": "TEXT_ONLY",
            "Telegram_Text": "Ready",
        }
        self.assertTrue(is_action_required(row))

    def test_preview_recheck_requires_action(self) -> None:
        self.assertTrue(
            is_action_required({"Content_ID": "1", "Preview_Review_Status": "RECHECK_REQUIRED"})
        )


if __name__ == "__main__":
    unittest.main()
