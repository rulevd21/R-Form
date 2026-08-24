from __future__ import annotations

import base64
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd
from streamlit.testing.v1 import AppTest

from rform_content.suggestions import _display_date as _display_event_date
from rform_content.suggestions import _event_type_label


APP_ROOT = Path(__file__).resolve().parents[1]


class AppSmokeTests(unittest.TestCase):
    def test_fixture_dashboard_renders_without_exception(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        self.assertEqual(list(app.exception), [])
        navigation = next(item for item in app.radio if item.label == "Раздел")
        self.assertEqual(
            list(navigation.options),
            ["Сегодня", "План", "Система"],
        )
        self.assertEqual(app.subheader[0].value, "Готово к согласованию")
        self.assertTrue(any("синтетические данные" in warning.value for warning in app.warning))

    def test_all_navigation_pages_render(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        for page in ("План", "Система"):
            with self.subTest(page=page):
                navigation = next(item for item in app.radio if item.label == "Раздел")
                navigation.set_value(page).run()
                self.assertEqual(list(app.exception), [])

    def test_today_page_leads_with_ready_publication_choices(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        labels = [button.label for button in app.button]
        self.assertIn("Согласовать и отправить", labels)
        choice = next(item for item in app.radio if item.label == "Выберите публикацию")
        self.assertEqual(len(choice.options), 2)
        self.assertEqual(len(app.metric), 0)
        self.assertTrue(any("Новая тренировка найдена автоматически" in item.value for item in app.caption))

    def test_event_types_are_shown_in_russian(self) -> None:
        self.assertEqual(_event_type_label("PROGRAM_DEVIATION"), "Отклонение от программы")
        self.assertEqual(_event_type_label("CONTROL_POINT"), "Контрольная точка")
        self.assertEqual(_event_type_label("DECISION_CHANGED"), "Решение изменено")
        self.assertEqual(_event_type_label("DECISION_RECORDED"), "Решение зафиксировано")
        self.assertEqual(_display_event_date("12.08.2026"), "12.08.2026")
        self.assertEqual(_display_event_date("2026-08-12"), "12.08.2026")

    def test_event_material_has_a_human_readable_name(self) -> None:
        queue = pd.read_csv(APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False)
        events = pd.read_csv(APP_ROOT / "fixtures" / "data_events.csv", keep_default_na=False)
        content_id = "CNT-20260814-EVENT-D2E4464DA3"
        queue.loc[0, [
            "Content_ID", "Date", "Rubric", "Content_Type", "Publication_Status",
            "Pipeline_Status", "Publish_At",
        ]] = [content_id, "25.08.2026", "TRAINING_LOG", "PROOF", "PLANNED", "PLANNED", ""]
        events.loc[0, ["Candidate_Content_ID", "Entity", "Date"]] = [
            content_id, "S-20260814-C", "14.08.2026",
        ]
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
                "apps_script_url": "https://script.google.com/macros/s/demo-v04-name/exec",
            },
            "content_api": {"secret": "test-secret"},
        }
        with patch("rform_content.repository.requests.post", return_value=response):
            app.run()
            navigation = next(item for item in app.radio if item.label == "Раздел")
            navigation.set_value("План").run()
            expected = "14.08.2026 · Тренировка C · Итоги и решение"
            self.assertIn(expected, set(app.dataframe[0].value["Материал"]))
            self.assertNotIn(content_id, app.dataframe[0].value.to_string())

    def test_old_event_decisions_are_not_shown_in_daily_mode(self) -> None:
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

        labels = [button.label for button in app.button]
        self.assertNotIn("Добавить в публикации", labels)
        self.assertNotIn("Сохранить для недельного обзора", labels)
        self.assertNotIn("Не использовать", labels)
        self.assertEqual(len(app.metric), 0)

    def test_v053_owner_ready_weekly_precedes_training_proposals(self) -> None:
        queue = pd.read_csv(APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False)
        events = pd.read_csv(APP_ROOT / "fixtures" / "data_events.csv", keep_default_na=False)
        sessions = pd.read_csv(APP_ROOT / "fixtures" / "training_sessions.csv", keep_default_na=False)
        queue.loc[0, [
            "Content_ID", "Date", "Rubric", "Public_Data_Allowed", "Text_Status",
            "Visual_Status", "Approval_Status", "Publication_Status", "Pipeline_Status",
            "Current_Stage", "Updated_At", "Proof_Source", "Telegram_Post_Mode",
            "Telegram_Text", "Telegram_Visual_URL",
        ]] = [
            "AUTO-WEEKLY-20260823", "23.08.2026", "WEEKLY_CONTROL", "YES", "REVIEW",
            "REVIEW", "NOT_READY", "PLANNED", "FINAL PREVIEW READY · 2 CARDS",
            "OWNER_FINAL_PREVIEW", "23.08.2026 13:04",
            "COVERS:S-20260817-A,S-20260819-B,S-20260821-C", "ALBUM_CAPTION",
            "Готовый недельный отчёт", "https://drive.google.com/drive/folders/example",
        ]
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "ok": True,
            "version": "0.5.3",
            "capabilities": [
                "content.read", "training.read", "publication.propose",
                "publication.visual", "publication.approve_schedule",
                "publication.queue_approve_schedule",
            ],
            "generated_at": "2026-08-24T08:00:00Z",
            "queue_fields": list(queue.columns),
            "event_fields": list(events.columns),
            "training_session_fields": list(sessions.columns),
            "queue": queue.to_dict(orient="records"),
            "events": events.to_dict(orient="records"),
            "training_sessions": sessions.to_dict(orient="records"),
        }
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30)
        app.secrets = {
            "app": {
                "data_mode": "apps_script",
                "apps_script_url": "https://script.google.com/macros/s/demo-v053-ready/exec",
            },
            "content_api": {"secret": "test-secret"},
        }
        with patch("rform_content.repository.requests.post", return_value=response):
            app.run()

        self.assertEqual(app.subheader[0].value, "Готово к согласованию")
        self.assertTrue(any("готовый редакционный материал" in item.value for item in app.caption))
        self.assertFalse(any(item.label == "Выберите публикацию" for item in app.radio))
        approve = next(item for item in app.button if item.label == "Согласовать и отправить")
        self.assertFalse(approve.disabled)
        self.assertIn("Изменить текст", [button.label for button in app.button])

    def test_v054_weekly_preview_shows_three_current_cards_and_text(self) -> None:
        queue = pd.read_csv(APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False)
        events = pd.read_csv(APP_ROOT / "fixtures" / "data_events.csv", keep_default_na=False)
        sessions = pd.read_csv(APP_ROOT / "fixtures" / "training_sessions.csv", keep_default_na=False)
        queue.loc[0, [
            "Content_ID", "Date", "Rubric", "Public_Data_Allowed", "Text_Status",
            "Visual_Status", "Approval_Status", "Publication_Status", "Pipeline_Status",
            "Current_Stage", "Updated_At", "Proof_Source", "Telegram_Post_Mode",
            "Telegram_Text", "Telegram_Visual_URL", "Blocking_Issue",
        ]] = [
            "AUTO-WEEKLY-20260823", "23.08.2026", "WEEKLY_CONTROL", "YES", "REVIEW",
            "APPROVED", "NOT_READY", "PLANNED", "READY · CHANNEL CONTROL · VISUAL v03 APPROVED",
            "CHANNEL_CONTROL_REVIEW", "24.08.2026 11:31",
            "COVERS:S-20260817-A,S-20260819-B,S-20260821-C", "ALBUM_CAPTION",
            "Готовый недельный отчёт", "https://drive.google.com/drive/folders/example", "",
        ]
        read_response = Mock()
        read_response.raise_for_status.return_value = None
        read_response.json.return_value = {
            "ok": True,
            "version": "0.5.4",
            "capabilities": [
                "content.read", "training.read", "publication.propose",
                "publication.visual", "publication.approve_schedule",
                "publication.queue_approve_schedule", "publication.queue_assets",
            ],
            "generated_at": "2026-08-24T10:00:00Z",
            "queue_fields": list(queue.columns),
            "event_fields": list(events.columns),
            "training_session_fields": list(sessions.columns),
            "queue": queue.to_dict(orient="records"),
            "events": events.to_dict(orient="records"),
            "training_sessions": sessions.to_dict(orient="records"),
        }
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
        asset_response = Mock()
        asset_response.raise_for_status.return_value = None
        asset_response.json.return_value = {
            "ok": True,
            "content_id": "AUTO-WEEKLY-20260823",
            "version": 3,
            "assets": [
                {
                    "filename": f"weekly_v03_card-0{index}.png",
                    "mime_type": "image/png",
                    "size": len(png),
                    "version": 3,
                    "order": index,
                    "data_base64": base64.b64encode(png).decode("ascii"),
                }
                for index in range(1, 4)
            ],
        }

        def response_for_request(*args, **kwargs):
            operation = kwargs["json"].get("operation", "read")
            return asset_response if operation == "queue_publication_assets" else read_response

        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30)
        app.secrets = {
            "app": {
                "data_mode": "apps_script",
                "apps_script_url": "https://script.google.com/macros/s/demo-v054-inline/exec",
            },
            "content_api": {"secret": "test-secret"},
        }
        with patch("rform_content.repository.requests.post", side_effect=response_for_request) as post:
            app.run()

        self.assertTrue(any(
            "Альбом: 3 карточки · версия v03" in item.value for item in app.caption
        ))
        self.assertEqual(post.call_count, 2)
        self.assertIn("Изменить текст", [button.label for button in app.button])
        self.assertFalse(any(item.label == "Выберите публикацию" for item in app.radio))

    def test_v052_gateway_enables_editable_text_and_visual_approval(self) -> None:
        queue = pd.read_csv(APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False)
        events = pd.read_csv(APP_ROOT / "fixtures" / "data_events.csv", keep_default_na=False)
        sessions = pd.read_csv(APP_ROOT / "fixtures" / "training_sessions.csv", keep_default_na=False)
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "ok": True,
            "version": "0.5.2",
            "capabilities": [
                "content.read", "training.read", "publication.propose",
                "publication.visual", "publication.approve_schedule",
            ],
            "generated_at": "2026-08-21T10:00:00Z",
            "queue_fields": list(queue.columns),
            "event_fields": list(events.columns),
            "training_session_fields": list(sessions.columns),
            "queue": queue.to_dict(orient="records"),
            "events": events.to_dict(orient="records"),
            "training_sessions": sessions.to_dict(orient="records"),
        }
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30)
        app.secrets = {
            "app": {
                "data_mode": "apps_script",
                "apps_script_url": "https://script.google.com/macros/s/demo-v05-approval/exec",
            },
            "content_api": {"secret": "test-secret"},
        }
        with patch("rform_content.repository.requests.post", return_value=response):
            app.run()
        approve = next(item for item in app.button if item.label == "Согласовать и отправить")
        self.assertFalse(approve.disabled)
        self.assertEqual(app.subheader[0].value, "Готово к согласованию")
        self.assertTrue(next(item for item in app.checkbox if item.label == "Добавить визуал к публикации").value)
        labels = [button.label for button in app.button]
        self.assertIn("Изменить текст", labels)
        self.assertIn("Сформировать другое изображение", labels)

        edit = next(item for item in app.button if item.label == "Изменить текст")
        edit.click().run()
        self.assertTrue(any(item.label == "Текст публикации" for item in app.text_area))

    def test_v052_approval_sends_the_previewed_visual(self) -> None:
        queue = pd.read_csv(APP_ROOT / "fixtures" / "content_queue.csv", keep_default_na=False)
        events = pd.read_csv(APP_ROOT / "fixtures" / "data_events.csv", keep_default_na=False)
        sessions = pd.read_csv(APP_ROOT / "fixtures" / "training_sessions.csv", keep_default_na=False)
        read_response = Mock()
        read_response.raise_for_status.return_value = None
        read_response.json.return_value = {
            "ok": True,
            "version": "0.5.2",
            "capabilities": [
                "content.read", "training.read", "publication.propose",
                "publication.visual", "publication.approve_schedule",
            ],
            "generated_at": "2026-08-21T10:00:00Z",
            "queue_fields": list(queue.columns),
            "event_fields": list(events.columns),
            "training_session_fields": list(sessions.columns),
            "queue": queue.to_dict(orient="records"),
            "events": events.to_dict(orient="records"),
            "training_sessions": sessions.to_dict(orient="records"),
        }
        approval_response = Mock()
        approval_response.raise_for_status.return_value = None
        approval_response.json.return_value = {
            "ok": True,
            "status": "APPLIED",
            "publication_status": "SCHEDULED",
            "visual_attached": True,
        }
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30)
        app.secrets = {
            "app": {
                "data_mode": "apps_script",
                "apps_script_url": "https://script.google.com/macros/s/demo-v052-visual/exec",
            },
            "content_api": {"secret": "test-secret"},
        }
        with patch(
            "rform_content.repository.requests.post",
            side_effect=[read_response, approval_response, read_response],
        ) as post:
            app.run()
            approve = next(item for item in app.button if item.label == "Согласовать и отправить")
            approve.click().run()

        approval_payload = post.call_args_list[1].kwargs["json"]
        self.assertEqual(approval_payload["operation"], "publication_approval")
        self.assertEqual(approval_payload["visual_mime_type"], "image/png")
        self.assertGreater(approval_payload["visual_size"], 0)
        self.assertTrue(approval_payload["visual_data_base64"])

    def test_today_does_not_fall_back_to_technical_dashboard(self) -> None:
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

        self.assertEqual(len(app.metric), 0)
        self.assertFalse(any(item.value == "Следующая публикация" for item in app.subheader))
        self.assertTrue(any(
            item.value in {
                "Материал на сегодня найден",
                "На сегодня решений нет",
                "На сегодня всё согласовано",
            }
            for item in app.subheader
        ))

    def test_plan_shows_only_future_owner_facing_rows(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        navigation = next(item for item in app.radio if item.label == "Раздел")
        navigation.set_value("План").run()

        self.assertEqual(
            list(app.dataframe[0].value.columns),
            ["Дата", "Материал", "Что произойдёт"],
        )
        self.assertFalse(any("DEMO-" in value for value in app.dataframe[0].value.astype(str).to_numpy().flatten()))
        self.assertEqual(len(app.multiselect), 0)
        self.assertEqual(len(app.selectbox), 0)

    def test_future_series_have_plain_language_names(self) -> None:
        app = AppTest.from_file(str(APP_ROOT / "app.py"), default_timeout=30).run()
        navigation = next(item for item in app.radio if item.label == "Раздел")
        navigation.set_value("План").run()

        names = set(app.dataframe[0].value["Материал"])
        self.assertIn("25.08.2026 · Недельный разбор", names)

    def test_plan_has_no_manual_status_controls(self) -> None:
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
            navigation.set_value("План").run()

        self.assertFalse(any(radio.label == "Выберите действие" for radio in app.radio))
        self.assertFalse(any(button.label == "Применить действие" for button in app.button))


if __name__ == "__main__":
    unittest.main()
