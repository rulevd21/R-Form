from __future__ import annotations

import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
GATEWAY = REPO_ROOT / "automation" / "content_control_api_v0_3.gs"


class GatewayContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.code = GATEWAY.read_text(encoding="utf-8")

    def test_gateway_has_no_telegram_transport(self) -> None:
        self.assertNotIn("UrlFetchApp", self.code)
        self.assertNotIn("sendMessage", self.code)
        self.assertNotIn("sendPhoto", self.code)

    def test_action_allowlist_cannot_schedule_or_publish(self) -> None:
        action_block = self.code.split("const RFORM_CONTENT_ACTIONS", 1)[1].split(";\n\n", 1)[0]
        self.assertNotIn("'SCHEDULED'", action_block)
        self.assertNotIn("'PUBLISHING'", action_block)
        self.assertNotIn("'PUBLISHED'", action_block)
        for action in ("APPROVE", "RETURN_FOR_REVISION", "HOLD", "READY_TO_PUBLISH"):
            self.assertIn(action, action_block)

    def test_gateway_requires_signed_idempotent_audit(self) -> None:
        for marker in (
            "CONTENT_ACTION_LOG",
            "LockService.getScriptLock",
            "action_id",
            "Request_Nonce",
            "computeHmacSha256Signature",
            "commentHash",
            "FAILED_ROLLED_BACK",
        ):
            self.assertIn(marker, self.code)


if __name__ == "__main__":
    unittest.main()
