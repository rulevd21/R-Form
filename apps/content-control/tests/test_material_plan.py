from __future__ import annotations

import unittest
from datetime import date

import pandas as pd

from rform_content.material_plan import classify_materials


class MaterialPlanTests(unittest.TestCase):
    def test_only_current_and_future_rows_reach_the_working_plan(self) -> None:
        queue = pd.DataFrame([
            {"Content_ID": "TODAY", "Date": "21.08.2026", "Publication_Status": "PLANNED"},
            {"Content_ID": "FUTURE", "Date": "25.08.2026", "Publication_Status": "PLANNED"},
            {"Content_ID": "OLD", "Date": "18.08.2026", "Publication_Status": "HOLD"},
            {"Content_ID": "DONE", "Date": "17.08.2026", "Publication_Status": "PUBLISHED"},
            {"Content_ID": "TEST-ROW", "Date": "25.08.2026", "Rubric": "TECH_TEST"},
        ])

        plan = classify_materials(queue, today=date(2026, 8, 21))

        self.assertEqual(plan.today["Content_ID"].tolist(), ["TODAY"])
        self.assertEqual(plan.future["Content_ID"].tolist(), ["FUTURE"])
        self.assertEqual(plan.stale["Content_ID"].tolist(), ["OLD"])
        self.assertEqual(plan.published["Content_ID"].tolist(), ["DONE"])
        self.assertEqual(plan.technical["Content_ID"].tolist(), ["TEST-ROW"])

    def test_closed_and_superseded_rows_are_archived(self) -> None:
        queue = pd.DataFrame([
            {
                "Content_ID": "CLOSED",
                "Date": "25.08.2026",
                "Publication_Status": "NOT_READY",
                "Pipeline_Status": "ЗАКРЫТО · WEEKLY INPUT",
            },
            {
                "Content_ID": "SUPERSEDED",
                "Date": "25.08.2026",
                "Text_Status": "SUPERSEDED",
                "Publication_Status": "NOT_READY",
            },
        ])

        plan = classify_materials(queue, today=date(2026, 8, 21))

        self.assertEqual(set(plan.archived["Content_ID"]), {"CLOSED", "SUPERSEDED"})
        self.assertTrue(plan.future.empty)


if __name__ == "__main__":
    unittest.main()
