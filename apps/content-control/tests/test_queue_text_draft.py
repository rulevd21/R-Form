import base64
import hashlib
import hmac
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd
import requests
from streamlit.testing.v1 import AppTest

from rform_content.daily_publications import owner_ready_materials
from rform_content.repository import (
    OWNER_PREVIEW_FIELDS, DataSourceError, build_queue_text_draft_save_request,
    execute_queue_text_draft_save,
)

ROOT = Path(__file__).resolve().parents[3]
APP_ROOT = ROOT / 'apps/content-control'


def material(content_id='CNT-TEST-07', title='Недельный разбор'):
    row = dict.fromkeys(OWNER_PREVIEW_FIELDS, '')
    row.update(Content_ID=content_id, Current_Stage='CHANNEL_CONTROL_REVIEW',
        Pipeline_Status='READY · CHANNEL CONTROL', Source_Packet_Status='READY',
        Public_Data_Allowed='YES', Text_Status='READY', Visual_Status='NOT_REQUIRED',
        Approval_Status='NOT_READY', Publication_Status='PLANNED', AutoPost_Allowed='NO',
        Preview_Review_Status='NOT_REVIEWED', Telegram_Text=title,
        Telegram_Post_Mode='TEXT_ONLY', Updated_At='21.08.2026 21:30')
    return row


class QueueTextDraftTests(unittest.TestCase):
    def make_app(self, rows, suffix, capabilities=None):
        queue = pd.DataFrame(rows)
        # Preserve ordinary queue metadata required by the app loader.
        for field in ('Date','Rubric','Distribution_Mode'):
            queue[field] = {'Date':'22.08.2026','Rubric':'METHODOLOGY','Distribution_Mode':'ORGANIC'}[field]
        events = pd.read_csv(APP_ROOT / 'fixtures/data_events.csv', keep_default_na=False)
        payload = dict(ok=True,version='0.5.6',capabilities=capabilities or [
            'publication.owner_preview_prepare','publication.queue_text_draft_save'],
            queue_fields=list(queue.columns),event_fields=list(events.columns),
            queue=queue.to_dict(orient='records'),events=events.to_dict(orient='records'))
        response=Mock();response.json.side_effect=lambda: payload
        app=AppTest.from_file(str(APP_ROOT/'app.py'),default_timeout=30)
        app.secrets={'app':{'data_mode':'apps_script','apps_script_url':
            'https://script.google.com/macros/s/draft-test-'+suffix+'/exec'},
            'content_api':{'secret':'test-secret'}}
        return app,response,payload

    def test_hold_excluded_even_when_stage_still_owner_preview(self):
        rows=[dict(material('CNT-06'),Publication_Status='HOLD',Current_Stage='OWNER_FINAL_PREVIEW'),
              material('CNT-07'),dict(material('CNT-08'),Pipeline_Status='HOLD')]
        self.assertEqual(owner_ready_materials(pd.DataFrame(rows)).Content_ID.tolist(),['CNT-07'])

    def test_tied_candidates_have_deterministic_order(self):
        rows=[material('CNT-08'),material('CNT-07')]
        self.assertEqual(owner_ready_materials(pd.DataFrame(rows)).Content_ID.tolist(),['CNT-07','CNT-08'])

    def test_ui_selects_another_material_and_saves_only_its_text(self):
        rows=[dict(material('CNT-06','Отложенный дневник'),Publication_Status='HOLD'),
            material('CNT-07','Недельный разбор'),material('CNT-08','Версионность')]
        app,response,payload=self.make_app(rows,'selection')
        def save(endpoint,secret,row,text,**kwargs):
            self.assertEqual(row['Content_ID'],'CNT-08')
            for item in payload['queue']:
                if item['Content_ID']=='CNT-08':
                    item.update(Telegram_Text=text,Updated_At='07.10.2026 13:36:15',
                        Preview_Review_Status='RECHECK_REQUIRED')
            return dict(ok=True,status='APPLIED')
        with patch('rform_content.repository.requests.post',return_value=response), \
             patch('rform_content.daily_review.execute_queue_text_draft_save',side_effect=save) as saver, \
             patch('rform_content.daily_review.execute_queue_publication_approval') as approval, \
             patch('rform_content.daily_review.execute_owner_preview_prepare') as preview:
            app.run()
            selector=next(x for x in app.selectbox if x.label=='Выберите готовый материал')
            self.assertEqual(selector.options,['Недельный разбор','Версионность'])
            selector.set_value('CNT-08').run()
            next(b for b in app.button if b.label=='Изменить текст').click().run()
            next(t for t in app.text_area if t.label=='Текст публикации').set_value('Новая версия правил').run()
            next(b for b in app.button if b.label=='Сохранить изменения').click().run()
            self.assertEqual(list(app.exception),[])
            saver.assert_called_once();approval.assert_not_called();preview.assert_not_called()
            self.assertTrue(any('Текст сохранён в очереди без согласования' in x.value for x in app.success))
            self.assertTrue(any('Новая версия правил' in x.value for x in app.markdown))
            self.assertFalse(next(b for b in app.button if b.label=='Передать на предпросмотр в Owner Bot').disabled)
            self.assertEqual(payload['queue'][0]['Publication_Status'],'HOLD')

    def test_timeout_retains_edit_and_manual_retry_action_identity(self):
        app,response,_=self.make_app([material()],'timeout')
        with patch('rform_content.repository.requests.post',return_value=response), \
             patch('rform_content.daily_review.execute_queue_text_draft_save',
                   side_effect=DataSourceError('timeout')) as saver, \
             patch('rform_content.daily_review.execute_queue_publication_approval') as approve:
            app.run();next(b for b in app.button if b.label=='Изменить текст').click().run()
            next(t for t in app.text_area if t.label=='Текст публикации').set_value('Изменение').run()
            for _ in range(2):
                next(b for b in app.button if b.label=='Сохранить изменения').click().run()
                self.assertEqual(list(app.exception),[])
                self.assertEqual(next(t for t in app.text_area if t.label=='Текст публикации').value,'Изменение')
            self.assertEqual(saver.call_count,2)
            self.assertEqual(saver.call_args_list[0].kwargs['action_id'],saver.call_args_list[1].kwargs['action_id'])
            approve.assert_not_called()

    def test_python_signature_matches_actual_apps_script_with_unicode_text(self):
        row=material()
        request=build_queue_text_draft_save_request('test-secret',row,'  Текст → решение\nДанные.  ',
            timestamp=123,nonce='b'*32,action_id='a'*32)
        js="""const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const req=JSON.parse(fs.readFileSync(0,'utf8'));
const ctx=vm.createContext({Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()]}});
vm.runInContext(fs.readFileSync('automation/content_control_api_v0_4.gs','utf8'),ctx);
console.log(JSON.stringify(ctx.rformContentApiV04SignedMessage_(req)));"""
        message=json.loads(subprocess.check_output(['node','-e',js],cwd=ROOT,
            input=json.dumps(request,ensure_ascii=False).encode()))
        expected=base64.urlsafe_b64encode(hmac.new(b'test-secret',message.encode(),hashlib.sha256).digest()).decode().rstrip('=')
        self.assertEqual(request['signature'],expected)
        self.assertEqual(request['telegram_text'],'Текст → решение\nДанные.')

    def test_invalid_input_fails_before_post(self):
        for text in ('', 'x'*4097, '\U0001f600'*2049):
            with patch('rform_content.repository.requests.post') as post:
                with self.assertRaises(ValueError):
                    execute_queue_text_draft_save('https://script.google.com/macros/s/test/exec','test',material(),text)
                post.assert_not_called()

    def test_write_timeout_has_one_post_and_fresh_nonce_on_manual_retry(self):
        with patch('rform_content.repository.requests.post',side_effect=requests.Timeout('timeout')) as post:
            for _ in range(2):
                with self.assertRaises(DataSourceError):
                    execute_queue_text_draft_save('https://script.google.com/macros/s/test/exec','test',material(),'Правка',action_id='a'*32)
            self.assertEqual(post.call_count,2)
            a,b=[c.kwargs['json'] for c in post.call_args_list]
            self.assertEqual(a['action_id'],b['action_id']);self.assertNotEqual(a['nonce'],b['nonce'])
            self.assertEqual(a['operation'],'queue_text_draft_save')

    def test_unconfirmed_response_is_rejected(self):
        response=Mock();response.json.return_value=dict(ok=True,status='SCHEDULED',content_id='other')
        with patch('rform_content.repository.requests.post',return_value=response),self.assertRaises(DataSourceError):
            execute_queue_text_draft_save('https://script.google.com/macros/s/test/exec','test',material(),'Правка')

    def test_initial_read_failure_has_manual_read_retry(self):
        app,_,_=self.make_app([material()],'read-retry')
        with patch('rform_content.repository.requests.post',side_effect=requests.Timeout('timeout')):
            app.run()
        self.assertEqual(list(app.exception),[])
        self.assertIn('Повторить чтение',[b.label for b in app.button])
        self.assertNotIn('Согласовать и отправить',[b.label for b in app.button])


if __name__=='__main__': unittest.main()
