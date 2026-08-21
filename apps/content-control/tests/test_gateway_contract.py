from __future__ import annotations

import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
GATEWAY_V03 = REPO_ROOT / "automation" / "content_control_api_v0_3.gs"
GATEWAY_V04 = REPO_ROOT / "automation" / "content_control_api_v0_4.gs"


class GatewayContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.v03 = GATEWAY_V03.read_text(encoding="utf-8")
        cls.code = GATEWAY_V04.read_text(encoding="utf-8")

    def test_v05_gateway_has_no_telegram_transport(self) -> None:
        for marker in ("UrlFetchApp", "sendMessage", "sendPhoto", "sendVideo", "api.telegram.org"):
            self.assertNotIn(marker, self.code)

    def test_regular_content_actions_still_cannot_schedule_or_publish(self) -> None:
        action_block = self.code.split("const RFORM_CONTENT_ACTIONS_V04", 1)[1].split(";\n\n", 1)[0]
        self.assertNotIn("'SCHEDULED'", action_block)
        self.assertNotIn("'PUBLISHING'", action_block)
        self.assertNotIn("'PUBLISHED'", action_block)
        for action in ("APPROVE", "RETURN_FOR_REVISION", "HOLD", "READY_TO_PUBLISH"):
            self.assertIn(action, action_block)

    def test_v04_event_promotion_starts_only_as_planned(self) -> None:
        promote = self.code.split("function rformContentApiV04PromoteEvent_", 1)[1].split(
            "function rformContentApiV04CandidateId_", 1
        )[0]
        self.assertIn("set('Publication_Status', 'PLANNED')", promote)
        self.assertIn("set('Pipeline_Status', 'PLANNED')", promote)
        self.assertIn("set('AutoPost_Allowed', 'NO')", promote)
        self.assertNotIn("'SCHEDULED'", promote)
        self.assertNotIn("'PUBLISHING'", promote)
        self.assertNotIn("'PUBLISHED'", promote)

    def test_v05_explicit_publication_approval_hands_off_to_autopost(self) -> None:
        block = self.code.split("function rformContentApiV04ApplyPublicationApproval_", 1)[1].split(
            "function rformContentApiV04SessionSourceHash_", 1
        )[0]
        self.assertIn("Publication_Status: 'SCHEDULED'", block)
        self.assertIn("AutoPost_Allowed: 'YES'", block)
        self.assertIn("Telegram_Post_Mode: 'TEXT_ONLY'", block)
        self.assertIn("sourceHash", block)
        self.assertNotIn("UrlFetchApp", block)

    def test_v05_preflight_requires_explicit_owner_approval_for_scheduling(self) -> None:
        self.assertIn("version: '0.5.0'", self.code)
        self.assertIn("publication.approve_schedule", self.code)
        self.assertIn("scheduledRequiresExplicitOwnerApproval: true", self.code)

    def test_v04_gateway_requires_signed_audited_event_operations(self) -> None:
        for marker in (
            "CONTENT_ACTION_LOG",
            "EVENT_ACTION_LOG",
            "LockService.getScriptLock",
            "action_id",
            "Request_Nonce",
            "computeHmacSha256Signature",
            "event_review",
            "event_decision",
            "event_media",
            "Owner_Fact",
            "Owner_Review_Status",
            "assetsRootFolderId",
            "sha256",
        ):
            self.assertIn(marker, self.code)

    def test_v03_remains_available_as_previous_version(self) -> None:
        self.assertIn("version: '0.3.0'", self.v03)
        self.assertNotIn("UrlFetchApp", self.v03)


if __name__ == "__main__":
    unittest.main()
