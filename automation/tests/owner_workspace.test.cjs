const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./workspace_harness.cjs');
test('signed client and server agree; tampering payload/hash/object/action is rejected',()=>{
  const x=harness(),p={action:'save',text:'Новая версия.'};
  let captured;
  const original=x.bot.rformOwnerBotV1ApiPost_;
  x.bot.rformOwnerBotV1ApiPost_=r=>{captured=r;return {ok:true};};
  x.bot.rformOwnerBotV1WorkspaceApi_('CNT-FIXTURE',x.request(p).source_hash,p);
  for(const change of [{payload:{...p,text:'Подмена'}},{source_hash:'a'.repeat(64)},{content_id:'other'},{action_id:'b'.repeat(32)}])
    assert.throws(()=>x.api.rformContentApiV04Authorize_({...captured,...change}),/Подпись/);
  assert.equal(original(captured).status,'APPLIED');
});

test('save invalidates review, retains publication controls, logs exact previous/new text',()=>{
  const x=harness();x.set('Preview_Review_Hash','stale');x.set('Preview_Review_Status','REVIEWED');
  assert.equal(x.call({action:'save',text:'=новый текст'}).status,'APPLIED');
  assert.equal(x.item().Telegram_Text,'=новый текст');
  for(const [f,v]of Object.entries({Publication_Status:'PLANNED',AutoPost_Allowed:'NO',Publish_At:'',
    Approval_Status:'NOT_READY',Preview_Review_Hash:'',Preview_Review_Status:'RECHECK_REQUIRED'}))assert.equal(x.item()[f],v);
  const r=x.log.rows[1];assert.equal(r.at(-1),'APPLIED');
  assert.equal(JSON.parse(r[6]).Telegram_Text,'Исходный текст.');
  assert.equal(JSON.parse(r[7]).Telegram_Text,'=новый текст');
});

test('same request is idempotent, changed request identity cannot be reused',()=>{
  const x=harness(),r=x.request({action:'save',text:'Версия 2'});
  x.api.rformContentApiV04Workspace_(r);
  assert.equal(x.api.rformContentApiV04Workspace_(r).status,'ALREADY_APPLIED');
  assert.equal(x.log.rows.length,2);
  assert.throws(()=>x.api.rformContentApiV04Workspace_({...r,payload:{action:'save',text:'другой'}}),/Action_ID/);
});

test('stale source fails without a write',()=>{
  const x=harness(),r=x.request({action:'hold'});x.set('Telegram_Text','Другой текст');
  const before=JSON.stringify(x.queue.rows);
  assert.throws(()=>x.api.rformContentApiV04Workspace_(r),/изменился/);
  assert.equal(JSON.stringify(x.queue.rows),before);assert.equal(x.log.rows.length,1);
});
for(const [field,value] of Object.entries({Publication_Status:'PUBLISHED',AutoPost_Allowed:'YES',Publish_At:'future',
  Telegram_Message_ID:'79',Posted_At:'today',Duplicate_Flag:'YES',Pipeline_Status:'SUPERSEDED'}))
  test('cannot edit unsafe '+field,()=>{const x=harness();x.set(field,value);assert.throws(()=>x.call({action:'save',text:'x'}));assert.equal(x.log.rows.length,1);});

test('partial failure rolls back, and unknown rollback blocks replay',()=>{
  for(const unknown of [false,true]){
    const x=harness(),before=JSON.stringify(x.queue.rows),r=x.request({action:'save',text:'new'});
    x.log.fail=(r,c,v)=>v==='APPLIED';
    if(unknown)x.queue.fail=(r,c,v)=>v==="'Исходный текст.";
    assert.throws(()=>x.api.rformContentApiV04Workspace_(r));
    assert.equal(x.log.rows[1].at(-1),unknown?'OUTCOME_UNKNOWN':'FAILED_ROLLED_BACK');
    if(!unknown)assert.equal(JSON.stringify(x.queue.rows),before);
    assert.throws(()=>x.api.rformContentApiV04Workspace_(r),/не подтверждён/);
  }
});

test('hold, future reminder and manual return never schedule or publish',()=>{
  const x=harness();x.call({action:'hold'});assert.equal(x.item().Publication_Status,'HOLD');
  x.call({action:'reminder',review_at:'2099-10-10T12:00:00+03:00',notify:true});
  const meta=x.api.rformContentApiV04WorkspaceMeta_();
  assert.equal(meta['CNT-FIXTURE'].reminder.notify,true);assert.equal(x.item().Publish_At,'');
  x.call({action:'return'});assert.equal(x.item().Publication_Status,'PLANNED');
  assert.equal(x.item().Current_Stage,'CHANNEL_CONTROL_REVIEW');
  assert.equal(x.api.rformContentApiV04WorkspaceMeta_()['CNT-FIXTURE'].reminder,null);
});

test('stage photos does not mutate queue; save copies exact selected order to immutable revision',()=>{
  const x=harness(),before=JSON.stringify(x.queue.rows),ids=[];
  for(const bytes of [[255,216,255,1],[255,216,255,2]]){
    const r=x.call({action:'stage_photo',mime_type:'image/jpeg',data_base64:Buffer.from(bytes).toString('base64')});
    ids.push(r.metadata.file_id);
  }
  assert.equal(JSON.stringify(x.queue.rows),before);
  x.call({action:'save',text:'Фото и текст.',asset_ids:[ids[1],ids[0]]});
  const folder=x.folders.get(x.item().Telegram_Visual_URL.split('/').at(-1));
  const it=folder.getFiles(),a=it.next(),b=it.next();
  assert.equal(a.getBlob().getBytes().at(-1),2);assert.equal(b.getBlob().getBytes().at(-1),1);
  assert.equal(x.item().Telegram_Post_Mode,'ALBUM_CAPTION');assert.equal(x.item().AutoPost_Allowed,'NO');
  assert.equal(x.item().Preview_Review_Status,'RECHECK_REQUIRED');
  const old=x.item().Telegram_Visual_URL;
  x.call({action:'save',text:'Только текст.',asset_ids:[]});
  assert.equal(x.item().Telegram_Post_Mode,'TEXT_ONLY');assert.equal(x.item().Telegram_Visual_URL,'');
  assert(x.folders.has(old.split('/').at(-1)));
});

test('wrong media bytes, duplicate IDs and foreign files are rejected',()=>{
  const x=harness();
  assert.throws(()=>x.call({action:'stage_photo',mime_type:'image/jpeg',data_base64:Buffer.from('html').toString('base64')}));
  const f=x.root.createFile(x.blob([255,216,255,3],'image/jpeg','foreign.jpg'));
  assert.throws(()=>x.call({action:'save',text:'new',asset_ids:[f.getId()]}),/не принадлежит/);
  assert.throws(()=>x.call({action:'save',text:'new',asset_ids:[f.getId(),f.getId()]}));
  assert.equal(x.item().Telegram_Text,'Исходный текст.');
});

test('previous saved version is offered as unsaved proposal; restoration preserves history',()=>{
  const x=harness(),r=x.request({action:'save',text:'v2'});x.api.rformContentApiV04Workspace_(r);
  x.call({action:'save',text:'v3'});
  const proposal=x.call({action:'version_read',version_id:r.action_id});
  assert.equal(proposal.text,'v2');assert.equal(x.item().Telegram_Text,'v3');
  x.call({action:'save',text:proposal.text,asset_ids:proposal.asset_ids});
  assert.equal(x.item().Telegram_Text,'v2');
  assert.equal(x.api.rformContentApiV04WorkspaceMeta_()['CNT-FIXTURE'].versions.length,3);
});

test('AI request and proposal never mutate text; stale proposals are refused',()=>{
  const x=harness(),r=x.request({action:'ai_request',instruction:'Сократи.'});
  x.api.rformContentApiV04Workspace_(r);
  x.call({action:'ai_proposal',request_id:r.action_id,text:'Предложение.'});
  assert.equal(x.item().Telegram_Text,'Исходный текст.');
  assert.equal(x.api.rformContentApiV04WorkspaceMeta_()['CNT-FIXTURE'].ai.text,'Предложение.');
  assert.throws(()=>x.call({action:'ai_proposal',request_id:r.action_id,text:'Второе'}));
  const y=harness(),ry=y.request({action:'ai_request',instruction:'Сократи.'});y.api.rformContentApiV04Workspace_(ry);
  y.call({action:'save',text:'changed'});
  assert.throws(()=>y.call({action:'ai_proposal',request_id:ry.action_id,text:'stale'}),/устарел/);
});

test('enable snapshots old CLOSED sessions; new closed session produces one factual draft',()=>{
  const x=harness();x.addSession({Session_ID:'OLD'});x.api.rformContentApiV04EnableTrainingDrafts();
  x.addSession();const r=x.api.rformContentApiV04Workspace_({action_id:'a'.repeat(32),payload:{action:'sync_training'}});
  assert.equal(r.created.length,1);const item=x.item(2);
  assert(item.Telegram_Text.includes('80×4×4'));assert.equal(item.Publication_Status,'PLANNED');
  assert.equal(item.AutoPost_Allowed,'NO');assert.equal(item.Current_Stage,'OWNER_FINAL_PREVIEW');
  assert.equal(x.api.rformContentApiV04Workspace_({action_id:'b'.repeat(32),payload:{action:'sync_training'}}).created.length,0);
  assert.equal(x.queue.rows.length,3);
});

test('disabled sync, OPEN, missing completion, duplicate and missing fact do not create drafts',()=>{
  const x=harness();x.addSession();
  assert.equal(x.api.rformContentApiV04Workspace_({action_id:'a'.repeat(32),payload:{action:'sync_training'}}).status,'DISABLED');
  for(const changes of [{Session_Status:'OPEN'},{Completed_At:''},{Duplicate_Flag:'YES'},{Main_Result:''}]){
    const y=harness();y.props.RFORM_AUTO_DRAFT_ENABLED='YES';y.addSession(changes);
    assert.equal(y.api.rformContentApiV04Workspace_({action_id:'a'.repeat(32),payload:{action:'sync_training'}}).created.length,0);
  }
  const y=harness();y.props.RFORM_AUTO_DRAFT_ENABLED='YES';y.addSession();y.addSession();
  assert.equal(y.api.rformContentApiV04Workspace_({action_id:'a'.repeat(32),payload:{action:'sync_training'}}).created.length,0);
});

test('covered and deferred sessions cannot be recreated',()=>{
  for(const held of [false,true]){
    const x=harness();x.props.RFORM_AUTO_DRAFT_ENABLED='YES';x.addSession();
    if(held){x.set('Session_ID','S-20261008-B');x.set('Publication_Status','HOLD');}
    else x.set('Proof_Source','WEEKLY / COVERS:S-OLD,S-20261008-B');
    assert.equal(x.api.rformContentApiV04Workspace_({action_id:'a'.repeat(32),payload:{action:'sync_training'}}).created.length,0);
  }
});

test('source changes after training draft block prepare and approval',()=>{
  const x=harness();x.props.RFORM_AUTO_DRAFT_ENABLED='YES';x.addSession();
  x.api.rformContentApiV04Workspace_({action_id:'a'.repeat(32),payload:{action:'sync_training'}});
  const item=x.item(2);x.sessions.rows[1][x.trainingFields.indexOf('Main_Result')]='Changed result';
  const value=f=>item[f]||'';
  assert.throws(()=>x.api.rformContentApiV04TrainingFresh_({getSheetByName:n=>n==='CONTENT_ACTION_LOG'?x.log:x.sessions},value),/тренировка изменилась/);
});

test('full mobile path: search/open/edit/review/save/hold/date/return/prepare, no approval',()=>{
  const x=harness();x.callback('ow:menu');x.callback('ow:list:work:0');x.callback('ow:open:'+x.token);
  x.callback('ow:edit:'+x.token);
  x.bot.rformOwnerBotV1WorkspaceMessage_({from:{id:42},chat:{id:42,type:'private'},message_id:9,text:'Изменено владельцем.'});
  assert.equal(x.item().Telegram_Text,'Исходный текст.');
  const d=x.bot.rformOwnerBotV1WorkspaceDraft_(x.token);
  x.callback('ow:save:'+x.token+':'+d.revision);
  assert.equal(x.item().Telegram_Text,'Изменено владельцем.');
  x.callback('ow:hold:'+x.token);assert.equal(x.item().Publication_Status,'HOLD');
  x.callback('ow:date:'+x.token);
  x.bot.rformOwnerBotV1WorkspaceMessage_({from:{id:42},chat:{id:42,type:'private'},message_id:10,text:'10.10.2099 12:00'});
  x.callback('ow:open:'+x.token);x.callback('ow:return:'+x.token);x.callback('ow:preview:'+x.token);
  assert.equal(x.item().Current_Stage,'OWNER_FINAL_PREVIEW');assert.equal(x.item().AutoPost_Allowed,'NO');
  assert(!x.log.rows.some(r=>r[3]==='APPROVE_AND_SCHEDULE'));
  assert(x.messages.length>5);
});

test('stale save button, unseen revision and unauthorized chat cannot mutate',()=>{
  const x=harness();x.callback('ow:open:'+x.token);
  const d=x.bot.rformOwnerBotV1WorkspaceDraft_(x.token);d.text='new';d.dirty=true;
  x.bot.rformOwnerBotV1WorkspacePutDraft_(x.token,d);
  x.callback('ow:save:'+x.token+':'+d.revision);assert.equal(x.item().Telegram_Text,'Исходный текст.');
  x.callback('ow:review:'+x.token);x.callback('ow:save:'+x.token+':'+'f'.repeat(16));
  assert.equal(x.item().Telegram_Text,'Исходный текст.');
  const before=x.messages.length;
  x.bot.rformOwnerBotV1WorkspaceCallback_({from:{id:42},message:{chat:{id:99,type:'group'}},data:'ow:hold:'+x.token});
  assert.equal(x.item().Publication_Status,'PLANNED');assert.equal(x.messages.length,before);
});

test('all emitted callback payloads fit Telegram 64-byte limit',()=>{
  const x=harness();x.callback('ow:open:'+x.token);
  const d=x.bot.rformOwnerBotV1WorkspaceDraft_(x.token);d.asset_ids=['one','two'];
  x.bot.rformOwnerBotV1WorkspacePutDraft_(x.token,d);x.bot.rformOwnerBotV1WorkspacePhotos_(x.token,d);
  for(const m of x.messages){
    const markup=m.payload.reply_markup;if(!markup)continue;
    for(const row of JSON.parse(markup).inline_keyboard||[])for(const b of row)assert(Buffer.byteLength(b.callback_data)<=64,b.callback_data);
  }
});

test('private reminders are once-only and preserve HOLD',()=>{
  const x=harness();x.set('Publication_Status','HOLD');
  const bundle={queue:[x.item()],workspace_meta:{'CNT-FIXTURE':{reminder:{review_at:'2000-01-01T10:00:00+03:00',notify:true}}}};
  x.bot.rformOwnerBotV1WorkspaceReminders_(bundle);x.bot.rformOwnerBotV1WorkspaceReminders_(bundle);
  assert.equal(x.messages.length,1);assert.equal(x.item().Publication_Status,'HOLD');assert.equal(x.item().Publish_At,'');
});

test('approval signatures bind workspace and asset fingerprints, stale state cannot schedule',()=>{
  const x=harness();let req;x.bot.rformOwnerBotV1ApiPost_=r=>{req=r;return {ok:true};};
  x.bot.rformOwnerBotV1ApiApprove_({item:x.item(),assetPacket:{assets:[]}});
  assert.doesNotThrow(()=>x.api.rformContentApiV04Authorize_(req));
  assert.throws(()=>x.api.rformContentApiV04Authorize_({...req,nonce:'c'.repeat(32),expected_asset_hash:'wrong'}),/Подпись/);
  x.set('Telegram_Text','changed');
  assert.throws(()=>x.api.rformContentApiV04ApplyQueuePublicationApproval_(req),/Текст изменился/);
  assert.equal(x.item().Publication_Status,'PLANNED');
});

test('real bot photo receive/reorder/review/save path is offline and deduplicates messages',()=>{
  const x=harness();x.callback('ow:open:'+x.token);
  const original=x.bot.rformOwnerBotV1Telegram_;
  x.bot.rformOwnerBotV1Telegram_=(token,method,payload)=>method==='getFile'?{file_path:'photos/file_1.jpg'}:original(token,method,payload);
  x.bot.UrlFetchApp={fetch:url=>{
    assert.equal(url,'https://api.telegram.org/file/botfixture/photos/file_1.jpg');
    return {getResponseCode:()=>200,getBlob:()=>x.blob([255,216,255,5],'image/jpeg','fixture.jpg')};
  }};
  const message={from:{id:42},chat:{id:42,type:'private'},message_id:8,photo:[{file_id:'telegram-file',file_size:4}]};
  x.bot.rformOwnerBotV1WorkspaceMessage_(message);x.bot.rformOwnerBotV1WorkspaceMessage_(message);
  let d=x.bot.rformOwnerBotV1WorkspaceDraft_(x.token);assert.equal(d.asset_ids.length,1);
  x.bot.rformOwnerBotV1WorkspaceMessage_({...message,message_id:9});
  d=x.bot.rformOwnerBotV1WorkspaceDraft_(x.token);const first=d.asset_ids[0];
  x.callback('ow:up:'+x.token+':1:'+d.revision);
  d=x.bot.rformOwnerBotV1WorkspaceDraft_(x.token);assert.notEqual(d.asset_ids[0],first);
  x.callback('ow:review:'+x.token);
  x.callback('ow:save:'+x.token+':'+d.revision);
  assert.equal(x.item().Telegram_Post_Mode,'ALBUM_CAPTION');assert.equal(x.item().AutoPost_Allowed,'NO');
  assert.equal(x.log.rows.filter(r=>r[3]==='OWNER_STAGE_PHOTO').length,2);
});

test('poll does not starve new previews behind already sent ones',()=>{
  const x=harness();
  for(let i=2;i<=4;i++){const item={...x.item(),Content_ID:'CNT-'+i};x.queue.appendRow(x.fields.map(f=>item[f]||''));}
  const bundle=x.api.rformContentApiV04Payload_();
  const previews=x.bot.rformOwnerBotV1BuildReadyPreviews_(bundle,4);
  x.bot.rformOwnerBotV1SaveSentState_(Object.fromEntries(previews.slice(0,3).map(p=>[p.item.Content_ID,p.previewId])));
  const next=x.bot.rformOwnerBotV1BuildReadyPreviews_(bundle,3,true);
  assert.equal(next.length,1);assert.equal(next[0].item.Content_ID,'CNT-4');
});

test('more than twenty covered sessions do not starve the next new workout',()=>{
  const x=harness();x.props.RFORM_AUTO_DRAFT_ENABLED='YES';
  for(let i=0;i<21;i++){
    x.addSession({Session_ID:'S-COVERED-'+i});
    const item={...x.item(),Content_ID:'CNT-COVERED-'+i,Session_ID:'S-COVERED-'+i};
    x.queue.appendRow(x.fields.map(f=>item[f]||''));
  }
  x.addSession({Session_ID:'S-NEW'});
  const r=x.api.rformContentApiV04Workspace_({action_id:'a'.repeat(32),payload:{action:'sync_training'}});
  assert.equal(r.created.length,1);
});

test('short photo preview uses caption and long preview uses separate text, like Autopost',()=>{
  for(const long of [false,true]){
    const x=harness(),text=long?'x'.repeat(1100):'Короткая подпись';
    const item={...x.item(),Telegram_Text:text};
    const assets=[{data_base64:Buffer.from([255,216,255,1]).toString('base64'),mime_type:'image/jpeg',filename:'card-01.jpg'}];
    x.bot.rformOwnerBotV1SendPreview_({item,mode:'PHOTO_CAPTION',assetPacket:{assets},previewId:'a'.repeat(32),title:'Тест'},
      {actionsEnabled:false,markSent:false});
    const photo=x.messages.find(m=>m.method==='sendPhoto');
    assert.equal(photo.payload.caption,long?undefined:text);
    assert.equal(x.messages.filter(m=>m.method==='sendMessage').at(-1).payload.text,long?text:'Решение по этому предпросмотру');
  }
});

test('mock-only approval verifies readback once and no channel transport is invoked',()=>{
  const x=harness();
  const p=x.bot.rformOwnerBotV1BuildReadyPreviews_({queue:[x.item()]},1)[0];
  assert.equal(x.bot.rformOwnerBotV1ApiApprove_(p).status,'APPLIED');
  assert.equal(x.item().Publication_Status,'SCHEDULED');
  assert.equal(x.item().AutoPost_Allowed,'YES');
  assert.equal(x.messages.length,0);
});

test('unsaved changes block legacy approval/hold buttons and group callbacks are rejected',()=>{
  const x=harness();x.callback('ow:open:'+x.token);
  const d=x.bot.rformOwnerBotV1WorkspaceDraft_(x.token);d.dirty=true;d.text='new';
  x.bot.rformOwnerBotV1WorkspacePutDraft_(x.token,d);
  const p=x.bot.rformOwnerBotV1BuildReadyPreviews_({queue:[x.item()]},1)[0];
  for(const action of ['a','h']) x.bot.rformOwnerBotV1HandleCallback_({id:'cb',from:{id:42},
    message:{chat:{id:42,type:'private'}},data:'ob:'+action+':'+p.previewId});
  assert.equal(x.item().Publication_Status,'PLANNED');assert.equal(x.item().Telegram_Text,'Исходный текст.');
  x.bot.rformOwnerBotV1HandleCallback_({id:'cb',from:{id:42},message:{chat:{id:42,type:'group'}},data:'ob:a:'+p.previewId});
  assert.equal(x.item().Publication_Status,'PLANNED');
});
