import base64
import hashlib
import hmac
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests
import pandas as pd
from streamlit.testing.v1 import AppTest
from rform_content.repository import (
    OWNER_PREVIEW_FIELDS, DataSourceError, build_owner_preview_prepare_request,
    execute_owner_preview_prepare, owner_preview_source_hash,
)

ROOT = Path(__file__).resolve().parents[3]

def material():
    row = dict.fromkeys(OWNER_PREVIEW_FIELDS, '')
    row.update(Content_ID='CNT-TEST-06', Current_Stage='CHANNEL_CONTROL_REVIEW',
               Telegram_Text='ПЛАН → ФАКТ → РЕШЕНИЕ\nЛичный дневник.',
               Telegram_Post_Mode='TEXT_ONLY')
    return row

class OwnerPreviewPrepareTests(unittest.TestCase):
    def ready_app(self, capabilities):
        app_root = ROOT / 'apps/content-control'
        queue = pd.read_csv(app_root / 'fixtures/content_queue.csv', keep_default_na=False).iloc[:1].copy()
        row = material()
        row.update(Pipeline_Status='READY · CHANNEL CONTROL', Source_Packet_Status='READY',
                   Public_Data_Allowed='YES',Text_Status='READY',Visual_Status='NOT_REQUIRED',
                   Approval_Status='NOT_READY',Publication_Status='PLANNED',AutoPost_Allowed='NO',
                   Preview_Review_Status='NOT_REVIEWED')
        for field, value in row.items(): queue[field] = value
        events = pd.read_csv(app_root / 'fixtures/data_events.csv', keep_default_na=False)
        response = Mock()
        response.json.return_value = dict(ok=True, version='0.5.5', capabilities=capabilities,
            queue_fields=list(queue.columns), event_fields=list(events.columns),
            queue=queue.to_dict(orient='records'),events=events.to_dict(orient='records'))
        app = AppTest.from_file(str(app_root / 'app.py'), default_timeout=30)
        app.secrets = {'app': {'data_mode': 'apps_script',
                       'apps_script_url':'https://script.google.com/macros/s/preview-test-' + '-'.join(capabilities).replace('.', '-') + '/exec'},
                       'content_api':{'secret':'test-secret'}}
        return app, response

    def test_ui_preparation_uses_separate_operation_and_never_calls_approval(self):
        app, response = self.ready_app(['publication.owner_preview_prepare'])
        with patch('rform_content.repository.requests.post', return_value=response), \
             patch('rform_content.daily_review.execute_owner_preview_prepare', return_value={'ok':True,'status':'APPLIED'}) as prepare, \
             patch('rform_content.daily_review.execute_queue_publication_approval') as approve:
            app.run()
            self.assertEqual(list(app.exception), [])
            button = next(b for b in app.button if b.label == 'Передать на предпросмотр в Owner Bot')
            self.assertFalse(button.disabled)
            button.click().run()
            self.assertEqual(list(app.exception), [])
            prepare.assert_called_once(); approve.assert_not_called()
            self.assertRegex(prepare.call_args.kwargs['action_id'], r'^[a-f0-9]{32}$')

    def test_old_gateway_does_not_expose_new_write(self):
        app, response = self.ready_app(['publication.queue_approve_schedule'])
        with patch('rform_content.repository.requests.post', return_value=response): app.run()
        self.assertEqual(list(app.exception), [])
        self.assertNotIn('Передать на предпросмотр в Owner Bot', [b.label for b in app.button])

    def test_local_text_edit_disables_preparation(self):
        app, response = self.ready_app(['publication.owner_preview_prepare'])
        with patch('rform_content.repository.requests.post', return_value=response):
            app.run()
            next(b for b in app.button if b.label == 'Изменить текст').click().run()
            next(a for a in app.text_area if a.label == 'Текст публикации').set_value('Локальная правка').run()
            next(b for b in app.button if b.label == 'Сохранить изменения').click().run()
        self.assertEqual(list(app.exception), [])
        self.assertTrue(next(b for b in app.button if b.label == 'Передать на предпросмотр в Owner Bot').disabled)

    def test_python_signature_and_hash_match_actual_apps_script(self):
        row = material()
        request = build_owner_preview_prepare_request('test-secret', row, timestamp=123,
                     nonce='b'*32, action_id='a'*32)
        js = '''const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const ctx=vm.createContext({Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()]}});
vm.runInContext(fs.readFileSync('automation/content_control_api_v0_4.gs','utf8'),ctx);
console.log(JSON.stringify({hash:ctx.rformContentApiV04OwnerPreviewHash_(f=>input.row[f].trim()),
message:ctx.rformContentApiV04SignedMessage_(input.request)}));'''
        result = json.loads(subprocess.check_output(['node', '-e', js], input=json.dumps(
            {'row': row, 'request': request}, ensure_ascii=False).encode(), cwd=ROOT))
        self.assertEqual(result['hash'], request['source_hash'])
        expected = base64.urlsafe_b64encode(hmac.new(b'test-secret', result['message'].encode(),
                         hashlib.sha256).digest()).decode().rstrip('=')
        self.assertEqual(expected, request['signature'])
        for field in OWNER_PREVIEW_FIELDS:
            changed = dict(row, **{field: str(row[field]) + 'changed'})
            self.assertNotEqual(owner_preview_source_hash(changed), request['source_hash'], field)

    def test_missing_schema_fails_before_any_request(self):
        row = material(); del row['AutoPost_Allowed']
        with patch('rform_content.repository.requests.post') as post:
            with self.assertRaises(ValueError):
                execute_owner_preview_prepare('https://script.google.com/macros/s/test/exec', 'test', row)
            post.assert_not_called()

    def test_client_sends_one_preparation_post_and_never_retries_timeout(self):
        with patch('rform_content.repository.requests.post', side_effect=requests.Timeout('timeout')) as post:
            with self.assertRaises(DataSourceError):
                execute_owner_preview_prepare('https://script.google.com/macros/s/test/exec', 'test',
                                               material(), action_id='a'*32)
            self.assertEqual(post.call_count, 1)
            request = post.call_args.kwargs['json']
            self.assertEqual(request['operation'], 'queue_owner_preview_prepare')
            self.assertEqual(request['action_id'], 'a'*32)
            self.assertNotIn('telegram_text', request)

    def test_manual_retry_keeps_action_identity_and_refreshes_nonce(self):
        response = Mock(); response.json.return_value = {'ok': True, 'status': 'APPLIED'}
        with patch('rform_content.repository.requests.post', return_value=response) as post:
            for _ in range(2):
                execute_owner_preview_prepare('https://script.google.com/macros/s/test/exec', 'test',
                                               material(), action_id='a'*32)
            a, b = [call.kwargs['json'] for call in post.call_args_list]
            self.assertEqual(a['action_id'], b['action_id'])
            self.assertNotEqual(a['nonce'], b['nonce'])

if __name__ == '__main__': unittest.main()
