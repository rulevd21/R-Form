const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {harness}=require('./workspace_harness.cjs');
const observed=(x,changes={})=>{
  const p={action:'channel_record',channel_id:'-1004309818003',message_id:77,date:1789620000,
    revision:1789620000,text:'Факт '.repeat(30),media_group_id:'',media:[],...changes};
  const r=x.request(p);r.content_id='';r.source_hash='';
  return x.api.rformContentApiV04Workspace_(r);
};
const globalAction=(x,p)=>x.api.rformContentApiV04Workspace_({...x.request(p),content_id:'',source_hash:''});

test('capture stores observation only; same request and repeated observation are idempotent',()=>{
  const x=harness(),before=JSON.stringify(x.queue.rows),p={action:'channel_record',channel_id:'-1004309818003',message_id:77,date:1789620000,
    revision:1789620000,text:'Факт '.repeat(30),media:[]};
  const r={...x.request(p),content_id:'',source_hash:''};
  assert.equal(x.api.rformContentApiV04Workspace_(r).status,'APPLIED');
  assert.equal(x.api.rformContentApiV04Workspace_(r).status,'ALREADY_APPLIED');
  assert.equal(observed(x).status,'ALREADY_OBSERVED');
  assert.equal(x.log.rows.length,2);assert.equal(JSON.stringify(x.queue.rows),before);
});
for(const change of [{channel_id:'-100999'}, {message_id:0},{text:'x'.repeat(4097)}, {date:9999999999999},{media:[{type:'bad',file_id:'x'}]}])
  test('invalid observation rejected '+JSON.stringify(change).slice(0,65),()=>{
    const x=harness();assert.throws(()=>observed(x,change));assert.equal(x.log.rows.length,1);
  });
test('edits supersede observations, stale events do not regress, equal revision conflicts fail closed',()=>{
  const x=harness();observed(x);const latest=observed(x,{revision:1789620060,text:'Новая фактическая редакция.'});
  assert.equal(observed(x).status,'STALE_OBSERVATION');
  assert.equal(x.api.rformContentApiV04ChannelPosts_(x.api.rformContentApiV04WorkspaceContext_())[77].text,latest.event.text);
  assert.throws(()=>observed(x,{revision:1789620060,text:'Конфликт'}),/Конфликт/);
});
test('exact full-text match closes one mutable draft, retains history and does not publish',()=>{
  const x=harness(),text='Достоверный факт '.repeat(10);x.set('Telegram_Text',text);
  const event=observed(x,{text}).event;const r=globalAction(x,{action:'reconcile_channel'});
  assert.equal(r.applied.length,1);assert.equal(x.item().Publication_Status,'PUBLISHED');
  assert.equal(x.item().Telegram_Post_URL,event.post_url);assert.equal(x.item().AutoPost_Allowed,'NO');
  assert.equal(x.item().Publish_At,'');assert.equal(x.item().Approval_Status,'NOT_READY');
  assert.equal(globalAction(x,{action:'reconcile_channel'}).applied.length,0);
  assert.equal(x.messages.length,0);assert.equal(x.api.rformContentApiV04WorkspaceMeta_()['CNT-FIXTURE'].publication.published_text,text);
});
test('ambiguous exact matches are never auto linked',()=>{
  const x=harness(),text='Одинаковый факт '.repeat(10);x.set('Telegram_Text',text);
  x.queue.appendRow(x.queue.rows[1].map((v,i)=>i===x.fields.indexOf('Content_ID')?'CNT-OTHER':v));
  observed(x,{text});assert.equal(globalAction(x,{action:'reconcile_channel'}).applied.length,0);
  assert.equal(x.item().Publication_Status,'PLANNED');
});
test('semantic similarity produces suggestion only; manual relation preserves original draft',()=>{
  const x=harness();x.set('Telegram_Text','105 кг — засчитано. 13 сентября второе место и первый разряд. Черновик.');
  const event=observed(x,{text:'105 кг — засчитано. 13 сентября второе место и первый разряд.'}).event;
  assert.equal(globalAction(x,{action:'reconcile_channel'}).applied.length,0);
  assert.equal(x.api.rformContentApiV04ChannelReview_(x.api.rformContentApiV04WorkspaceContext_())[0].candidates.length,1);
  const before=x.item().Telegram_Text;
  x.call({action:'link_publication',message_id:77,event_hash:event.hash});
  assert.equal(x.item().Telegram_Text,before);assert.equal(x.item().Publication_Status,'PUBLISHED');
  assert.equal(x.api.rformContentApiV04WorkspaceMeta_()['CNT-FIXTURE'].publication.published_text,event.text);
});
test('changed fact hash, stale source and unobserved links fail before queue write',()=>{
  const x=harness(),event=observed(x).event,before=JSON.stringify(x.queue.rows);
  assert.throws(()=>x.call({action:'link_publication',message_id:77,event_hash:'a'.repeat(64)}));
  assert.throws(()=>x.call({action:'link_publication',message_id:78,event_hash:event.hash}));
  const r=x.request({action:'link_publication',message_id:77,event_hash:event.hash});r.source_hash='b'.repeat(64);
  assert.throws(()=>x.api.rformContentApiV04Workspace_(r));assert.equal(JSON.stringify(x.queue.rows),before);
});
test('cannot link one channel post to two materials',()=>{
  const x=harness(),event=observed(x).event;x.call({action:'link_publication',message_id:77,event_hash:event.hash});
  const row=[...x.queue.rows[1]];row[x.fields.indexOf('Content_ID')]='CNT-OTHER';row[x.fields.indexOf('Publication_Status')]='PLANNED';
  row[x.fields.indexOf('Telegram_Message_ID')]='';row[x.fields.indexOf('Telegram_Post_URL')]='';row[x.fields.indexOf('Posted_At')]='';x.queue.appendRow(row);
  const c=x.api.rformContentApiV04WorkspaceContext_(),raw=x.queue.rows[2],v=f=>String(raw[x.fields.indexOf(f)]||'');
  assert.throws(()=>x.api.rformContentApiV04LinkPublication_(c,{...x.request({}),content_id:'CNT-OTHER'},3,v,event),/другим/);
});
for(const field of ['AutoPost_Allowed','Publish_At','Telegram_Message_ID','Publish_Error'])
  test('archive and linking reject unsafe controls '+field,()=>{
    const x=harness();x.set(field,field==='AutoPost_Allowed'?'YES':'unsafe');
    assert.throws(()=>x.call({action:'archive',reason:'STALE'}));
    const e=observed(x).event;assert.throws(()=>x.call({action:'link_publication',message_id:77,event_hash:e.hash}));
  });
test('archive, restore and replaced-by-post are non destructive and clear obsolete reminders',()=>{
  const x=harness();x.call({action:'hold'});x.call({action:'reminder',review_at:'2099-10-10T12:00:00+03:00',notify:true});
  const text=x.item().Telegram_Text;x.call({action:'archive',reason:'CANCELLED_BY_OWNER'});
  assert.equal(x.item().Publication_Status,'CANCELLED');assert.equal(x.item().Telegram_Text,text);
  assert.equal(x.api.rformContentApiV04WorkspaceMeta_()['CNT-FIXTURE'].reminder,null);
  assert.throws(()=>x.call({action:'save',text:'should fail'}));
  x.call({action:'restore'});assert.equal(x.item().Publication_Status,'PLANNED');assert.equal(x.item().Current_Stage,'CHANNEL_CONTROL_REVIEW');
  const e=observed(x).event;x.call({action:'archive',reason:'REPLACED_BY_POST',message_id:77,event_hash:e.hash});
  assert.equal(x.item().Publication_Status,'SUPERSEDED');
  assert.equal(x.item().Telegram_Message_ID,'');assert.equal(x.item().Posted_At,'');
  assert.equal(x.api.rformContentApiV04WorkspaceMeta_()['CNT-FIXTURE'].archive.post_url,e.post_url);
});
test('unknown writes block replay; archive rollback preserves exact row',()=>{
  const x=harness(),before=JSON.stringify(x.queue.rows),r=x.request({action:'archive',reason:'STALE'});
  x.log.fail=(r,c,v)=>v==='APPLIED';assert.throws(()=>x.api.rformContentApiV04Workspace_(r));
  assert.equal(JSON.stringify(x.queue.rows),before);assert.throws(()=>x.api.rformContentApiV04Workspace_(r));
});
test('closed editorial inputs and tests are excluded from working previews, but searchable in archive',()=>{
  for(const changes of [{Current_Stage:'EDITORIAL_GATE_CLOSED'},{Pipeline_Status:'ЗАКРЫТО · WEEKLY INPUT'}, {Content_ID:'TEST-QA'}]) {
    const x=harness();Object.entries(changes).forEach(([f,v])=>x.set(f,v));
    assert.equal(x.bot.rformOwnerBotV1WorkspaceRows_([x.item()],'work').length,0);
    assert.equal(x.bot.rformOwnerBotV1WorkspaceRows_([x.item()],'archived').length,1);
    assert.equal(x.bot.rformOwnerBotV1ReadyItems_([x.item()]).length,0);
    x.bot.rformOwnerBotV1WorkspaceSearch_({queue:[x.item()]},0,'CNT');
  }
});
test('all new callbacks fit Telegram byte limit and trust private owner only',()=>{
  const x=harness();x.callback('ow:open:'+x.token);x.callback('ow:archive:'+x.token);
  const e=observed(x,{text:'Факт изменён '+x.item().Telegram_Text}).event;
  x.bot.rformOwnerBotV1ChannelCompare_(x.item(),e);
  for(const m of x.messages){if(!m.payload.reply_markup)continue;for(const row of JSON.parse(m.payload.reply_markup).inline_keyboard)for(const b of row)if(b.callback_data)assert.ok(Buffer.byteLength(b.callback_data)<=64,b.callback_data);}
  const before=JSON.stringify(x.queue.rows);x.bot.rformOwnerBotV1WorkspaceCallback_({id:'u',from:{id:99},message:{chat:{id:99,type:'private'}},data:'ow:link:'+x.token+':'+e.hash.slice(0,12)});
  assert.equal(JSON.stringify(x.queue.rows),before);
});
test('manual phone comparison requires reviewed source and rejects unsaved edits',()=>{
  const x=harness();x.callback('ow:open:'+x.token);const event=observed(x).event;
  x.bot.rformOwnerBotV1ChannelCompare_(x.item(),event);
  x.set('Telegram_Text','changed');x.callback('ow:link:'+x.token+':'+event.hash.slice(0,12));
  assert.equal(x.item().Publication_Status,'PLANNED');
});
test('durable webhook spool chunks Cyrillic, deduplicates and drains to API with no channel sends',()=>{
  const x=harness();x.props.RFORM_OWNER_CHANNEL_SYNC_ENABLED='YES';
  const m={chat:{id:-1004309818003,type:'channel'},message_id:77,date:1789620000,text:'Факт '.repeat(500)};
  x.bot.rformOwnerBotV1ChannelCapture_(m);x.bot.rformOwnerBotV1ChannelCapture_(m);
  assert.equal(JSON.parse(x.props.ow_channel_spool).length,1);assert.equal(x.log.rows.length,1);
  x.bot.rformOwnerBotV1ChannelDrain_();assert.equal(JSON.parse(x.props.ow_channel_spool).length,0);
  assert.equal(x.log.rows.length,2);assert.equal(x.messages.length,0);
});
test('spool retained after unknown API delivery and rejects foreign channel',()=>{
  const x=harness();x.props.RFORM_OWNER_CHANNEL_SYNC_ENABLED='YES';
  x.bot.rformOwnerBotV1ChannelCapture_({chat:{id:-10099,type:'channel'},message_id:77,date:1789620000,text:'other'});
  assert.equal(x.props.ow_channel_spool,undefined);
  x.bot.rformOwnerBotV1ChannelCapture_({chat:{id:-1004309818003,type:'channel'},message_id:77,date:1789620000,text:'fact'});
  const before=x.props.ow_channel_spool;x.bot.rformOwnerBotV1ApiPost_=()=>{throw Error('UNKNOWN');};
  assert.throws(()=>x.bot.rformOwnerBotV1ChannelDrain_());assert.equal(x.props.ow_channel_spool,before);
});
test('dismissal is audited, does not change queue, and a later edit returns for review',()=>{
  const x=harness(),e=observed(x).event,before=JSON.stringify(x.queue.rows);
  globalAction(x,{action:'channel_dismiss',message_id:77,event_hash:e.hash});
  assert.equal(x.api.rformContentApiV04ChannelReview_(x.api.rformContentApiV04WorkspaceContext_()).length,0);
  observed(x,{revision:1789620060,text:'Изменение'});
  assert.equal(x.api.rformContentApiV04ChannelReview_(x.api.rformContentApiV04WorkspaceContext_()).length,1);
  assert.equal(JSON.stringify(x.queue.rows),before);
});

test('maximum channel text is split within Telegram limits',()=>{
  const x=harness(),event=observed(x,{text:'я'.repeat(4096)}).event;
  x.bot.rformOwnerBotV1ChannelOpen_({queue:[x.item()],channel_review:[{event,candidates:[]}]},77);
  for(const m of x.messages)assert.ok(String(m.payload.text || '').length<=4096);
});

test('published edits are projected from observed channel snapshot without modifying saved draft',()=>{
  const x=harness(),e=observed(x).event;x.call({action:'link_publication',message_id:77,event_hash:e.hash});
  const before=JSON.stringify(x.queue.rows);observed(x,{revision:1789620060,text:'Исправленный опубликованный текст.'});
  assert.equal(x.api.rformContentApiV04WorkspaceMeta_()['CNT-FIXTURE'].publication.published_text,'Исправленный опубликованный текст.');
  assert.equal(JSON.stringify(x.queue.rows),before);
});

test('legacy superseded text restoration becomes editable without approval or publication',()=>{
  const x=harness();x.set('Text_Status','SUPERSEDED');x.set('Pipeline_Status','ARCHIVED_SUPERSEDED');
  x.call({action:'restore'});assert.equal(x.item().Text_Status,'READY');
  x.call({action:'save',text:'Отредактированная версия.'});
  assert.equal(x.item().AutoPost_Allowed,'NO');assert.equal(x.item().Approval_Status,'NOT_READY');
});

test('legacy action and scheduling guards reject archived/closed editorial rows',()=>{
  const x=harness();for(const changes of [{Publication_Status:'ARCHIVED'},{Current_Stage:'EDITORIAL_GATE_CLOSED'}]){
    Object.entries(changes).forEach(([f,v])=>x.set(f,v));
    assert.throws(()=>x.api.rformContentApiV04RequireOpenMaterial_(f=>x.item()[f]||''));
  }
});

test('historical baseline helper imports all 61 observations and resumes without queue writes',()=>{
  const x=harness(),before=JSON.stringify(x.queue.rows);
  // Historical one-time helper remains pinned to the original authorized API.
  const historical=fs.readFileSync(path.join(__dirname,'../channel_history_import_20261008.gs'),'utf8').replace("RFORM_CONTENT_API_V04.version!=='0.6.1'","RFORM_CONTENT_API_V04.version!=='0.6.2'");
  vm.runInContext(historical,x.api);
  let result;for(let i=0;i<11;i++) result=x.api.rformChannelHistoryImport20261008();
  assert.equal(result.total,61);assert.equal(result.remaining,0);assert.equal(x.log.rows.length,62);
  assert.equal(x.api.rformChannelHistoryImport20261008().remaining,0);assert.equal(x.log.rows.length,62);
  assert.equal(JSON.stringify(x.queue.rows),before);assert.equal(x.messages.length,0);
});

test('channel enable retains current webhook pairing and pending updates; verifies readback',()=>{
  const x=harness();x.props.RFORM_OWNER_BOT_WEBAPP_URL='https://script.google.com/macros/s/EXISTING/exec';x.props.RFORM_OWNER_BOT_WEBHOOK_SECRET='fixture';
  const calls=[];x.bot.rformOwnerBotV1Telegram_=(token,method,p)=>{calls.push({method,p});
    if(method==='getMe')return{id:123};if(method==='getChat')return{id:-1004309818003};
    if(method==='getChatMember')return{status:'member'};
    if(method==='setWebhook')return true;
    if(method==='getWebhookInfo')return{url:x.props.RFORM_OWNER_BOT_WEBAPP_URL+'?hook=fixture',allowed_updates:['channel_post','edited_channel_post']};
    throw Error('Unexpected call');};
  assert.equal(x.bot.rformOwnerBotV1EnableChannelSync().ok,true);
  assert.equal(calls.find(c=>c.method==='setWebhook').p.drop_pending_updates,false);
  assert.equal(x.props.RFORM_OWNER_TELEGRAM_USER_ID,'42');assert.equal(x.props.RFORM_OWNER_CHANNEL_SYNC_ENABLED,'YES');
  assert.ok(calls.every(c=>!c.method.startsWith('send')));
});

test('published list includes unmatched channel facts once, no fabricated queue rows',()=>{
  const x=harness();x.set('Publication_Status','PUBLISHED');x.set('Telegram_Message_ID','77');
  const a=observed(x).event,b=observed(x,{message_id:78,text:'Другая публикация.'}).event;
  const before=JSON.stringify(x.queue.rows);
  x.bot.rformOwnerBotV1WorkspaceList_({queue:[x.item()],channel_posts:[a,b]},'published',0);
  assert.match(x.messages.at(-1).payload.text,/Опубликовано · 2/);
  const keys=JSON.parse(x.messages.at(-1).payload.reply_markup).inline_keyboard.flat();
  assert.equal(keys.filter(b=>b.callback_data==='ow:post:78').length,1);
  assert.equal(JSON.stringify(x.queue.rows),before);
});

test('private reconciliation notice is once only and never a channel send',()=>{
  const x=harness(),event=observed(x).event,b={channel_review:[{event,candidates:[{content_id:'CNT-FIXTURE'}]}]};
  x.bot.rformOwnerBotV1ChannelNotify_(b);x.bot.rformOwnerBotV1ChannelNotify_(b);
  assert.equal(x.messages.length,1);assert.equal(String(x.messages[0].payload.chat_id),'42');
});

test('full phone route compares channel post, links actual edition, shows fact and protects archived source',()=>{
  const x=harness();x.callback('ow:open:'+x.token);const event=observed(x).event;
  x.bot.rformOwnerBotV1ChannelCompare_(x.item(),event);x.callback('ow:link:'+x.token+':'+event.hash.slice(0,12));
  assert.equal(x.item().Publication_Status,'PUBLISHED');assert.equal(x.item().AutoPost_Allowed,'NO');
  x.callback('ow:actual:'+x.token);assert.ok(x.messages.some(m=>m.payload.text.includes(event.text.trim())));
});

test('channel delivery failure retains observation and does not starve existing training or preview poll',()=>{
  const x=harness();x.props.RFORM_OWNER_BOT_ENABLED='YES';x.props.RFORM_OWNER_CHANNEL_SYNC_ENABLED='YES';
  x.bot.rformOwnerBotV1RequireOwnerPair_=()=>{};x.bot.rformOwnerBotV1SaveSentState_=()=>{};
  x.bot.rformOwnerBotV1ChannelDrain_=()=>{throw Error('UNKNOWN');};
  let read=0;x.bot.rformOwnerBotV1ApiRead_=()=>{read++;return{queue:[]};};
  x.bot.rformOwnerBotV1Poll();assert.equal(read,1);assert.equal(x.props.RFORM_OWNER_CHANNEL_SYNC_ERROR,'NEEDS_CHECK');
});

test('capture is not blocked by Poll script lock and arriving observation survives drain',()=>{
  const x=harness();x.props.RFORM_OWNER_CHANNEL_SYNC_ENABLED='YES';
  const m={chat:{id:-1004309818003,type:'channel'},message_id:77,date:1789620000,text:'fact'};
  let scriptLocks=0;x.bot.LockService={...x.bot.LockService,getScriptLock:()=>{scriptLocks++;return{tryLock:()=>false,releaseLock:()=>{}};}};
  x.bot.rformOwnerBotV1ChannelCapture_(m);assert.equal(scriptLocks,0);
  const original=x.bot.rformOwnerBotV1WorkspaceApi_;let added=false;
  x.bot.rformOwnerBotV1WorkspaceApi_=(...args)=>{
    if(!added){added=true;x.bot.rformOwnerBotV1ChannelCapture_({...m,message_id:78});}
    return original(...args);
  };
  x.bot.rformOwnerBotV1ChannelDrain_();assert.equal(JSON.parse(x.props.ow_channel_spool).length,1);
});
