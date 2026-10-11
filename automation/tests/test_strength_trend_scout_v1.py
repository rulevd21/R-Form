import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "strength_trend_scout_v1.py"
SPEC = importlib.util.spec_from_file_location("strength_trend_scout_v1", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


NOW = "2026-10-11T12:00:00Z"


def signal(i, platform, authority=0.8, days=1, primary=False, source_key=None):
    day = 11 - days
    published = f"2026-10-{day:02d}T12:00:00Z"
    payload = {
        "signal_id": f"s{i}",
        "platform": platform,
        "url": f"https://example.com/{i}",
        "published_at": published,
        "discovered_at": NOW,
        "authority": authority,
        "primary_evidence": primary,
    }
    if source_key:
        payload["source_key"] = source_key
    return payload


class StrengthTrendScoutTests(unittest.TestCase):
    def test_breakout_requires_multi_platform_diffusion(self):
        cluster = {
            "cluster_key": "rir",
            "audience_fit": 1,
            "rform_fit": 1,
            "reader_value": 1,
            "rform_position_available": True,
            "signals": [
                signal(1, "youtube"),
                signal(2, "youtube"),
                signal(3, "reddit"),
                signal(4, "x"),
                signal(5, "web"),
                signal(6, "reddit"),
            ],
        }
        result = MODULE.score_payload({"now": NOW, "clusters": [cluster]})["clusters"][0]
        self.assertEqual(result["trend_class"], "BREAKOUT")
        self.assertEqual(result["editorial_disposition"], "CONTENT_CANDIDATE")
        self.assertGreaterEqual(result["trend_score"], 80)

    def test_single_platform_viral_item_cannot_become_trend(self):
        cluster = {
            "cluster_key": "viral",
            "audience_fit": 1,
            "rform_fit": 1,
            "reader_value": 1,
            "rform_position_available": True,
            "signals": [signal(i, "youtube", authority=1) for i in range(1, 9)],
        }
        result = MODULE.score_payload({"now": NOW, "clusters": [cluster]})["clusters"][0]
        self.assertNotIn(result["trend_class"], {"TREND", "BREAKOUT"})

    def test_source_key_collapses_cross_platform_syndication(self):
        cluster = {
            "cluster_key": "same-study",
            "audience_fit": 1,
            "rform_fit": 1,
            "reader_value": 1,
            "rform_position_available": True,
            "signals": [
                signal(1, "web", source_key="paper-doi-1"),
                signal(2, "x", source_key="paper-doi-1"),
                signal(3, "youtube", source_key="paper-doi-1"),
            ],
        }
        result = MODULE.score_payload({"now": NOW, "clusters": [cluster]})["clusters"][0]
        self.assertEqual(result["independent_sources"], 1)
        self.assertEqual(result["platforms"], ["web"])
        self.assertNotIn(result["trend_class"], {"TREND", "BREAKOUT"})

    def test_primary_evidence_can_be_watch_before_diffusion(self):
        cluster = {
            "cluster_key": "new-paper",
            "audience_fit": 0.8,
            "rform_fit": 0.8,
            "reader_value": 0.9,
            "rform_position_available": True,
            "signals": [signal(1, "web", authority=1.0, primary=True)],
        }
        result = MODULE.score_payload({"now": NOW, "clusters": [cluster]})["clusters"][0]
        self.assertEqual(result["trend_class"], "WATCH")
        self.assertEqual(result["editorial_disposition"], "WATCH")

    def test_top_candidates_are_capped_at_three(self):
        clusters = []
        for name in ("a", "b", "c", "d"):
            clusters.append(
                {
                    "cluster_key": name,
                    "audience_fit": 1,
                    "rform_fit": 1,
                    "reader_value": 1,
                    "rform_position_available": True,
                    "signals": [
                        signal(f"{name}1", "youtube"),
                        signal(f"{name}2", "reddit"),
                        signal(f"{name}3", "x"),
                        signal(f"{name}4", "web"),
                        signal(f"{name}5", "reddit"),
                        signal(f"{name}6", "youtube"),
                    ],
                }
            )
        result = MODULE.score_payload({"now": NOW, "clusters": clusters})
        self.assertEqual(len(result["top_editorial_candidates"]), 3)


if __name__ == "__main__":
    unittest.main()
