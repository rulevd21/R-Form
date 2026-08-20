from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd
from streamlit.testing.v1 import AppTest

from rform_content.suggestions import _event_type_label


APP_ROOT = Path(__file__).resolve().parents[1]


class AppSmokeTests(unittest.TestCase):
    def test_fixture_dashboard_renders_without_exception(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        self.assertEqual(list(app.exception), [])
        self.assertEqual(
            list(app.radio[0].options),
            ["Сегодня", "Материалы", "История", "Система"],
        )
        self.assertEqual(app.subheader[0].value, "Что решить сейчас")
        self.assertTrue(any("синтетические данные" in warning.value for warning in app.warning))

    def test_all_navigation_pages_render(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        for page in ("Материалы", "История", "Система"):
            with self.subTest(page=page):
                app.radio[0].set_value(page).run()
                self.assertEqual(list(app.exception), [])

    def test_today_page_leads_with_one_editorial_decision(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        labels = [button.label for button in app.button]
        self.assertIn("Добавить в публикации", labels)
        self.assertIn("Сохранить для недельного обзора", labels)
        self.assertIn("Не использовать", labels)
        self.assertIn("Сохранить черновик", labels)
        self.assertIn("Задание для инфографики", labels)
        self.assertEqual(len(app.metric), 0)
        self.assertTrue(any("Одно предложение за раз" in item.value for item in app.caption))

    def test_event_types_are_shown_in_russian(self) -> None:
        self.assertEqual(_event_type_label("PROGRAM_DEVIATION"), "Отклонение от программы")
        self.assertEqual(_event_type_label("CONTROL_POINT"), "Контрольная точка")
        self.assertEqual(_event_type_label("DECISION_CHANGED"), "Решение изменено")
        self.assertEqual(_event_type_label("DECISION_RECORDED"), "Решение зафиксировано")

    def test_v04_gateway_enables_the_three_daily_decisions(self) -> None:
        queue = pd.read_csv(APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False)
        events = pd.read_csv(APP_ROOT / "fixtures" / "data_events.csv", keep_default_na=False)
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "ok": True,
            "version": "0.4.0",
            "capabilities": [
                "content.read", "content.action", "event.review",
                "event.decision", "event.media",
            ],
            "generated_at": "2026-08-20T10:00:00Z",
            "queue_fields": list(queue.columns),
            "event_fields": list(events.columns),
            "queue": queue.to_dict(orient="records"),
            "events": events.to_dict(orient="records"),
        }
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30)
        app.secrets = {
            "app": {
                "data_mode": "apps_script",
                "apps_script_url": "https://script.google.com/macros/s/demo-v04-deployment/exec",
            },
            "content_api": {"secret": "test-secret"},
        }
        with patch("rform_content.repository.requests.post", return_value=response):
            app.run()

        for label in ("Добавить в публикации", "Сохранить для недельного обзора", "Не использовать"):
            button = next(item for item in app.button if item.label == label)
            self.assertFalse(button.disabled)
        self.assertEqual(len(app.metric), 0)

    def test_today_falls_back_to_publication_control_when_proposals_are_done(self) -> None:
        queue = pd.read_csv(APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False)
        events = pd.read_csv(APP_ROOT / "fixtures" / "data_events.csv", keep_default_na=False)
        events["Candidate_Content_ID"] = [f"DONE-{index}" for index in range(len(events))]
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "ok": True,
            "version": "0.4.0",
            "capabilities": ["content.read", "content.action", "event.decision"],
            "generated_at": "2026-08-20T10:00:00Z",
            "queue_fields": list(queue.columns),
            "event_fields": list(events.columns),
            "queue": queue.to_dict(orient="records"),
            "events": events.to_dict(orient="records"),
        }
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30)
        app.secrets = {
            "app": {
                "data_mode": "apps_script",
                "apps_script_url": "https://script.google.com/macros/s/demo-v04-empty/exec",
            },
            "content_api": {"secret": "test-secret"},
        }
        with patch("rform_content.repository.requests.post", return_value=response):
            app.run()

        self.assertEqual(len(app.metric), 4)
        self.assertTrue(any(item.value == "Следующая публикация" for item in app.subheader))

    def test_queue_defaults_to_russian_operational_view(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        app.radio[0].set_value("Материалы").run()

        self.assertFalse(app.toggle[0].value)
        rubric_filter = next(item for item in app.multiselect if item.label == "Рубрика")
        self.assertEqual(rubric_filter.placeholder, "Выберите рубрику")
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
            navigation.set_value("Материалы").run()

        action = next(radio for radio in app.radio if radio.label == "Выберите действие")
        self.assertEqual(
            list(action.options),
            ["Утвердить", "Вернуть на доработку", "Поставить на паузу", "Готово к публикации"],
        )
        submit = next(button for button in app.button if button.label == "Применить действие")
        self.assertTrue(submit.disabled)


if __name__ == "__main__":
    unittest.main()
