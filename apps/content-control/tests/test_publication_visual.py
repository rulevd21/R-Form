from __future__ import annotations

import hashlib
from io import BytesIO
import unittest
from pathlib import Path

import pandas as pd
from PIL import Image

from rform_content.daily_publications import build_publication_proposals
from rform_content.publication_visual import HEIGHT, VARIANT_COUNT, WIDTH, _font, render_publication_visual
from rform_content.repository import prepare_queue, prepare_sessions


APP_ROOT = Path(__file__).resolve().parents[1]


class PublicationVisualTests(unittest.TestCase):
    def setUp(self) -> None:
        queue = prepare_queue(pd.read_csv(
            APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False
        ))
        sessions = prepare_sessions(pd.read_csv(
            APP_ROOT / "fixtures" / "training_sessions.csv", keep_default_na=False
        ))
        self.session, proposals = build_publication_proposals(queue, sessions)
        self.proposal = proposals[0]

    def test_three_mobile_png_variants_are_rendered(self) -> None:
        visuals = [
            render_publication_visual(self.session, self.proposal, index)
            for index in range(VARIANT_COUNT)
        ]
        self.assertEqual(len({item.label for item in visuals}), VARIANT_COUNT)
        self.assertEqual(
            len({hashlib.sha256(item.data).hexdigest() for item in visuals}),
            VARIANT_COUNT,
        )
        for visual in visuals:
            with self.subTest(variant=visual.variant):
                self.assertEqual(visual.mime_type, "image/png")
                self.assertLess(len(visual.data), 5 * 1024 * 1024)
                image = Image.open(BytesIO(visual.data))
                self.assertEqual(image.size, (WIDTH, HEIGHT))
                self.assertEqual(image.format, "PNG")

    def test_variant_number_cycles_safely(self) -> None:
        first = render_publication_visual(self.session, self.proposal, 0)
        cycled = render_publication_visual(self.session, self.proposal, VARIANT_COUNT)
        self.assertEqual(first.data, cycled.data)

    def test_cyrillic_font_is_bundled_with_the_application(self) -> None:
        font = _font(24, bold=True)
        self.assertIn("assets/fonts/DejaVuSans-Bold.ttf", str(font.path).replace("\\", "/"))
        self.assertIsNotNone(font.getbbox("ТРЕНИРОВКА НЕДЕЛЯ"))


if __name__ == "__main__":
    unittest.main()
