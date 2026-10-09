import unittest
from rform_content.lifecycle import preview_blockers

class PreviewReadinessTests(unittest.TestCase):
    def ready(self):
        return dict(Publication_Status="PLANNED", Public_Data_Allowed="YES", Source_Packet_Status="READY",
                    Text_Status="READY", Telegram_Text="Текст", Telegram_Post_Mode="TEXT_ONLY", AutoPost_Allowed="NO")

    def test_empty_training_explains_preparation(self):
        row=self.ready(); row.update(Telegram_Text="", Text_Status="NOT_READY", Telegram_Post_Mode="")
        issues=preview_blockers(row)
        self.assertIn("Текст ещё не подготовлен", issues[0])
        self.assertTrue(any("формат" in issue for issue in issues))

    def test_ready_text_does_not_require_approval_before_preview(self):
        self.assertEqual(preview_blockers(self.ready()), [])

    def test_photos_privacy_source_and_held_state_are_blocked(self):
        for change in [dict(Telegram_Post_Mode="PHOTO_CAPTION"), dict(Public_Data_Allowed="NO"),
                       dict(Source_Packet_Status="NOT_READY"),dict(Publication_Status="HOLD"),dict(AutoPost_Allowed="YES")]:
            with self.subTest(change=change):
                self.assertTrue(preview_blockers(self.ready() | change))
