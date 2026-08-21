from __future__ import annotations

import unittest
from pathlib import Path

import pandas as pd

from rform_content.daily_publications import (
    build_publication_proposals,
    session_source_hash,
)
from rform_content.repository import prepare_queue, prepare_sessions


APP_ROOT = Path(__file__).resolve().parents[1]


class DailyPublicationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.queue = prepare_queue(pd.read_csv(
            APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False
        ))
        self.sessions = prepare_sessions(pd.read_csv(
            APP_ROOT / "fixtures" / "training_sessions.csv", keep_default_na=False
        ))

    def test_latest_training_creates_two_ready_options(self) -> None:
        session, proposals = build_publication_proposals(self.queue, self.sessions)
        self.assertIsNotNone(session)
        self.assertEqual(session["Session_ID"], "S-20260821-C")
        self.assertEqual(len(proposals), 2)
        self.assertEqual(proposals[0].mode, "UPDATE_EXISTING")
        self.assertEqual(proposals[0].target_content_id, "DEMO-20260821-DIARIES")
        self.assertTrue(proposals[0].recommended)
        self.assertEqual(proposals[1].mode, "CREATE_NEW")

    def test_generated_text_uses_only_current_session_numbers(self) -> None:
        session, proposals = build_publication_proposals(self.queue, self.sessions)
        self.assertEqual(proposals[0].source_hash, session_source_hash(session))
        for proposal in proposals:
            self.assertIn("80×3×3", proposal.telegram_text)
            self.assertIn("RIR 5/4/4", proposal.telegram_text)
            self.assertIn("10/10", proposal.telegram_text)
            self.assertIn("0/10", proposal.telegram_text)
            self.assertNotIn("80×4×4", proposal.telegram_text)

    def test_scheduled_session_is_not_proposed_again(self) -> None:
        linked = self.queue.copy()
        linked["Session_ID"] = ""
        linked.loc[0, "Session_ID"] = "S-20260821-C"
        linked.loc[0, "Publication_Status"] = "SCHEDULED"
        linked = prepare_queue(linked)
        session, proposals = build_publication_proposals(linked, self.sessions)
        self.assertIsNone(session)
        self.assertEqual(proposals, [])

    def test_scheduled_latest_session_does_not_reopen_older_backlog(self) -> None:
        linked = self.queue.copy()
        linked["Session_ID"] = ""
        linked.loc[0, "Session_ID"] = "S-20260821-C"
        linked.loc[0, "Publication_Status"] = "SCHEDULED"
        linked = prepare_queue(linked)
        older = self.sessions.copy()
        prior = older.iloc[0].copy()
        prior["Session_ID"] = "S-20260819-C"
        prior["Date"] = "19.08.2026"
        older = prepare_sessions(pd.DataFrame([prior, older.iloc[0]]))

        session, proposals = build_publication_proposals(linked, older)

        self.assertIsNone(session)
        self.assertEqual(proposals, [])


if __name__ == "__main__":
    unittest.main()
