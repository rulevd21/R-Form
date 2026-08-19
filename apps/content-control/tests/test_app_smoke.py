from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd
from streamlit.testing.v1 import AppTest


APP_ROOT = Path(__file__).resolve().parents[1]


class AppSmokeTests(unittest.TestCase):
    def test_fixture_dashboard_renders_without_exception(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        self.assertEqual(list(app.exception), [])
        self.assertEqual(len(app.metric), 4)
        self.assertEqual(
            list(app.radio[0].options),
            ["Контроль", "Предложения", "Очередь", "События", "Диагностика"],
        )
        self.assertTrue(any("синтетические данные" in warning.value for warning in app.warning))

    def test_all_navigation_pages_render(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        for page in ("Предложения", "Очередь", "События", "Диагностика"):
            with self.subTest(page=page):
                app.radio[0].set_value(page).run()
                self.assertEqual(list(app.exception), [])

    def test_suggestions_page_is_simple_and_prompt_is_available(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        app.radio[0].set_value("Предложения").run()
        labels = [button.label for button in app.button]
        self.assertIn("Сохранить изменения", labels)
        self.assertIn("Промпт для инфографики", labels)
        self.assertIn("В публикацию", labels)
        self.assertIn("В Weekly", labels)
        self.assertIn("Пропустить", labels)

    def test_queue_defaults_to_russian_operational_view(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        app.radio[0].set_value("Очередь").run()

        self.assertFalse(app.toggle[0].value)
        self.assertEqual(
            list(app.dataframe[0].value.columns),
            ["Код материала", "Статус", "Дата публикации", "Рубрика", "Тип материала"],
        )
        self.assertNotIn("Опубликовано", set(app.dataframe[0].value["Статус"]))
        self.assertTrue(
            any("закрытые материалы скрыты" in caption.value for caption in app.caption)
        )

    def test_controlled_gateway_shows_four_confirmed_actions(self) -> None:
        queue = pd.read_csv(APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False)
        events = pd.read_csv(APP_ROOT / "fixtures" / "data_events.csv", keep_default_na=False)
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "ok": True,
            "version": "0.3.0",
            "capabilities": ["content.read", "content.action"],
            "generated_at": "2026-08-19T10:00:00Z",
            "queue_fields": list(queue.columns),
            "event_fields": list(events.columns),
            "queue": queue.to_dict(orient="records"),
            "events": events.to_dict(orient="records"),
        }
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30)
        app.secrets = {
            "app": {
                "data_mode": "apps_script",
                "apps_script_url": "https://script.google.com/macros/s/demo-deployment/exec",
            },
            "content_api": {"secret": "test-secret"},
        }
        with patch("rform_content.repository.requests.post", return_value=response):
            app.run()
            navigation = next(radio for radio in app.radio if radio.label == "Раздел")
            navigation.set_value("Очередь").run()

        action = next(radio for radio in app.radio if radio.label == "Выберите действие")
        self.assertEqual(
            list(action.options),
            ["Утвердить", "Вернуть на доработку", "Поставить на паузу", "Готово к публикации"],
        )
        submit = next(button for button in app.button if button.label == "Применить действие")
        self.assertTrue(submit.disabled)


if __name__ == "__main__":
    unittest.main()
