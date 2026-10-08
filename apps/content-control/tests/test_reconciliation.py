import hashlib
import hmac
import base64
import json
import unittest
from unittest.mock import patch, Mock

from rform_content.repository import (OWNER_PREVIEW_FIELDS, build_owner_workspace_request,
                                      execute_owner_workspace, DataSourceError)
from rform_content.lifecycle import derive_lifecycle_state, is_action_required


class ReconciliationTests(unittest.TestCase):
    def row(self):
        row = dict.fromkeys(OWNER_PREVIEW_FIELDS + ("Session_ID", "Proof_Source"), "")
        row.update(Content_ID="CNT-TEST", Telegram_Text="Русский текст", Publication_Status="PLANNED")
        return row

    def test_signed_workspace_wire_contract(self):
        payload = {"action": "archive", "reason": "CANCELLED_BY_OWNER"}
        row = self.row()
        req = build_owner_workspace_request("fixture", row, payload, timestamp=1800000000,
                                             nonce="a" * 32, action_id="b" * 32)
        fields = OWNER_PREVIEW_FIELDS + ("Session_ID", "Proof_Source")
        digest = lambda s: hashlib.sha256(s.encode()).hexdigest()
        expected_hash = digest(json.dumps([row[f] for f in fields], ensure_ascii=False, separators=(",", ":")))
        self.assertEqual(req["source_hash"], expected_hash)
        message = "\n".join([str(req["timestamp"]), req["nonce"], "owner_workspace", req["action_id"],
                             req["content_id"], expected_hash,
                             digest(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))])
        sig = base64.urlsafe_b64encode(hmac.new(b"fixture", message.encode(), hashlib.sha256).digest()).decode().rstrip("=")
        self.assertEqual(req["signature"], sig)

    def test_missing_fields_and_arbitrary_operations_rejected(self):
        with self.assertRaises(ValueError):
            build_owner_workspace_request("fixture", {"Content_ID": "CNT"}, {"action": "archive"})
        with self.assertRaises(ValueError):
            build_owner_workspace_request("fixture", self.row(), {"action": "channel_record"})

    def test_execute_requires_verified_action_id_and_never_retries(self):
        with patch("rform_content.repository._post_signed", return_value={"status": "APPLIED", "action_id": "other"}) as send:
            with self.assertRaises(DataSourceError):
                execute_owner_workspace("fixture", "fixture", self.row(), {"action": "archive"})
            self.assertEqual(send.call_count, 1)

    def test_archived_and_editorial_closed_are_terminal(self):
        for changes in [{"Publication_Status": "ARCHIVED"}, {"Current_Stage": "EDITORIAL_GATE_CLOSED"},
                        {"Pipeline_Status": "ЗАКРЫТО · WEEKLY INPUT"}, {"Content_ID": "TEST-QA"}]:
            row = {"Content_ID": "CNT", "Publication_Status": "NOT_READY", **changes}
            self.assertEqual(derive_lifecycle_state(row), "ARCHIVED")
            self.assertFalse(is_action_required(row))

    def test_published_fact_wins_over_legacy_archive_marker(self):
        self.assertEqual(derive_lifecycle_state({"Publication_Status": "PUBLISHED", "Pipeline_Status": "ARCHIVED"}), "PUBLISHED")


if __name__ == "__main__":
    unittest.main()
