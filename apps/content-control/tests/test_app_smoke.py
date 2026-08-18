from __future__ import annotations

import unittest
from pathlib import Path

from streamlit.testing.v1 import AppTest


APP_ROOT = Path(__file__).resolve().parents[1]


class AppSmokeTests(unittest.TestCase):
    def test_fixture_dashboard_renders_without_exception(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        self.assertEqual(list(app.exception), [])
        self.assertEqual(len(app.metric), 4)
        self.assertEqual(
            list(app.radio[0].options),
            ["Контроль", "Очередь", "События", "Диагностика"],
        )
        self.assertTrue(any("синтетические данные" in warning.value for warning in app.warning))

    def test_all_navigation_pages_render(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        for page in ("Очередь", "События", "Диагностика"):
            with self.subTest(page=page):
                app.radio[0].set_value(page).run()
                self.assertEqual(list(app.exception), [])


if __name__ == "__main__":
    unittest.main()
