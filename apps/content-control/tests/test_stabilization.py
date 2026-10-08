import json
import unittest
from pathlib import Path
from unittest.mock import patch
import pandas as pd
from streamlit.testing.v1 import AppTest
from rform_content.lifecycle import material_section
from rform_content.repository import (execute_owner_workspace, read_action_status, OperationOutcomeUnknown,
                                     OWNER_PREVIEW_FIELDS, DataSourceError, ApiRequestRejected)
ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / 'apps/content-control'

class StabilizationTests(unittest.TestCase):
    def row(self):
        return {**dict.fromkeys(OWNER_PREVIEW_FIELDS + ('Session_ID', 'Proof_Source'), ''),
                'Content_ID': 'CNT-FIXTURE', 'Publication_Status': 'PLANNED'}

    def test_shared_section_contract(self):
        fixtures = json.loads((ROOT / 'automation/tests/material_sections.json').read_text())
        for fixture in fixtures:
            with self.subTest(fixture=fixture):
                self.assertEqual(material_section(fixture['row']), fixture['section'])

    def test_timeout_reads_receipt_without_replaying_mutation(self):
        aid = 'a' * 32
        with patch('rform_content.repository._post_signed', side_effect=[DataSourceError('timeout'),
              {'status': 'APPLIED', 'action_id': aid}]) as post:
            result = execute_owner_workspace('fixture', 'fixture', self.row(), {'action': 'archive'}, action_id=aid)
            self.assertTrue(result['recovered'])
            self.assertEqual([call.args[1]['operation'] for call in post.call_args_list], ['owner_workspace', 'action_status'])
            self.assertEqual(post.call_args_list[0].args[1]['action_id'], post.call_args_list[1].args[1]['action_id'])

    def test_unknown_action_exposes_stable_receipt_identity(self):
        aid = 'a' * 32
        with patch('rform_content.repository._post_signed', side_effect=[DataSourceError('timeout'),
              {'status': 'PENDING', 'action_id': aid}]) as post:
            with self.assertRaises(OperationOutcomeUnknown) as caught:
                execute_owner_workspace('fixture', 'fixture', self.row(), {'action': 'archive'}, action_id=aid)
            self.assertEqual(caught.exception.action_id, aid)
            self.assertEqual(caught.exception.status, 'PENDING')
            self.assertEqual(post.call_count, 2)

    def test_business_rejection_is_not_an_unknown_mutation(self):
        with patch('rform_content.repository._post_signed', side_effect=ApiRequestRejected('source changed')) as post:
            with self.assertRaises(ApiRequestRejected):
                execute_owner_workspace('fixture', 'fixture', self.row(), {'action': 'archive'})
            self.assertEqual(post.call_count, 1)

    def test_receipt_mismatch_rejected(self):
        with patch('rform_content.repository._post_signed', return_value={'action_id': 'other'}):
            with self.assertRaises(DataSourceError):
                read_action_status('fixture', 'fixture', 'a' * 32, 'CNT-FIXTURE')

    def test_mobile_sections_and_system_render(self):
        app = AppTest.from_file(str(APP / 'app.py'), default_timeout=30).run()
        nav = next(r for r in app.radio if r.label == 'Раздел')
        nav.set_value('Материалы').run()
        for section in ['В работе', 'Отложено', 'Опубликовано', 'Архив', 'Все']:
            with self.subTest(section=section):
                next(r for r in app.radio if r.label == 'Материалы').set_value(section).run()
                self.assertEqual(list(app.exception), [])
        next(r for r in app.radio if r.label == 'Раздел').set_value('Система').run()
        self.assertEqual(list(app.exception), [])

if __name__ == '__main__':
    unittest.main()
