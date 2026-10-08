const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {harness}=require('./workspace_harness.cjs');
test('Bot uses shared section contract without writes',()=>{
 const x=harness(),before=JSON.stringify(x.queue.rows);
 for(const f of require('./material_sections.json')) assert.equal(x.bot.rformOwnerBotV1MaterialSection_(f.row),f.section);
 assert.equal(JSON.stringify(x.queue.rows),before);
});
test('legacy pipeline HOLD can return and accept a reminder without publishing',()=>{
 const x=harness();x.set('Publication_Status','NOT_READY');x.set('Pipeline_Status','HOLD CTA');
 assert.equal(x.call({action:'reminder',review_at:'2099-01-01T10:00:00+03:00',notify:false}).status,'APPLIED');
 assert.equal(x.call({action:'return'}).status,'APPLIED');assert.equal(x.item().Publication_Status,'PLANNED');
 assert.equal(x.item().AutoPost_Allowed,'NO');assert.equal(x.item().Publish_At,'');
});
test('scoped read skips event/session data, retains queue, history and versions',()=>{
 const x=harness();x.addSession();const full=x.api.rformContentApiV04Payload_(),small=x.api.rformContentApiV04Payload_(true);
 assert.equal(small.training_sessions.length,0);assert.equal(small.events.length,0);
 for(const key of ['queue','workspace_meta','channel_posts','channel_review'])assert.equal(JSON.stringify(full[key]),JSON.stringify(small[key]));
 assert(JSON.stringify(small).length<JSON.stringify(full).length);
});
test('receipt is readonly, binds content ID and preserves PENDING/unknown',()=>{
 const x=harness(),r=x.request({action:'hold'});x.api.rformContentApiV04Workspace_(r);
 const before=JSON.stringify([x.queue.rows,x.log.rows]);
 assert.equal(x.api.rformContentApiV04ActionStatus_(r).status,'APPLIED');
 assert.throws(()=>x.api.rformContentApiV04ActionStatus_({...r,content_id:'OTHER'}));
 x.log.rows[1][x.log.rows[0].indexOf('Result')]='PENDING';
 assert.equal(x.api.rformContentApiV04ActionStatus_(r).status,'PENDING');
 x.log.rows[1][x.log.rows[0].indexOf('Result')]='APPLIED';
 assert.equal(JSON.stringify([x.queue.rows,x.log.rows]),before);
 assert.equal(x.api.rformContentApiV04ActionStatus_({...r,action_id:'f'.repeat(32)}).status,'NOT_FOUND');
});
test('signed scoped read and receipt reject tampered operation identity',()=>{
 const x=harness();let request;x.bot.rformOwnerBotV1ApiPost_=r=>{request=r;return {ok:true};};
 x.bot.rformOwnerBotV1ApiRead_();x.api.rformContentApiV04Authorize_(request);
 assert.throws(()=>x.api.rformContentApiV04Authorize_({...request,operation:'read'}));
 x.bot.rformOwnerBotV1ActionStatus_({action_id:'a'.repeat(32),content_id:'CNT-FIXTURE'});x.api.rformContentApiV04Authorize_(request);
 assert.throws(()=>x.api.rformContentApiV04Authorize_({...request,content_id:'OTHER'}));
});
test('lost workspace response reads APPLIED receipt once and does not replay mutation',()=>{
 const x=harness();const real=x.bot.rformOwnerBotV1ApiPost_;let writes=0,reads=0;
 x.bot.rformOwnerBotV1ApiPost_=r=>{if(r.operation==='owner_workspace'){writes++;real(r);throw Error('timeout');}reads++;return real(r);};
 const result=x.bot.rformOwnerBotV1WorkspaceApi_(x.item().Content_ID,x.bot.rformOwnerBotV1WorkspaceHash_(x.item()),{action:'hold'});
 assert.equal(result.recovered,true);assert.equal(writes,1);assert.equal(reads,1);assert.equal(x.item().Publication_Status,'HOLD');
});
test('unknown receipt retained and prevents next workspace mutation',()=>{
 const x=harness();let writes=0;x.bot.rformOwnerBotV1ApiPost_=r=>{if(r.operation==='owner_workspace')writes++;throw Error('timeout');};
 assert.throws(()=>x.bot.rformOwnerBotV1WorkspaceApi_(x.item().Content_ID,x.bot.rformOwnerBotV1WorkspaceHash_(x.item()),{action:'hold'}));
 assert(x.props.RFORM_OWNER_PENDING_ACTION);
 assert.throws(()=>x.bot.rformOwnerBotV1WorkspaceApi_(x.item().Content_ID,x.bot.rformOwnerBotV1WorkspaceHash_(x.item()),{action:'return'}));
 assert.equal(writes,1);
});
function pollSetup(){const x=harness();x.props.RFORM_OWNER_BOT_ENABLED='YES';return x;}
test('training failure does not stop reminder, proposal and preview stages',()=>{
 const x=pollSetup();x.props.RFORM_OWNER_AUTO_DRAFTS_ENABLED='YES';let reminders=0,proposals=0,previews=0;
 x.bot.rformOwnerBotV1WorkspaceApi_=()=>{throw Error('sync timeout');};
 x.bot.rformOwnerBotV1WorkspaceReminders_=()=>reminders++;
 x.bot.rformOwnerBotV1WorkspaceProposals_=()=>proposals++;
 x.bot.rformOwnerBotV1SendPreview_=()=>previews++;
 x.bot.rformOwnerBotV1Poll();assert.equal(reminders,1);assert.equal(proposals,1);assert.equal(previews,1);
 const report=JSON.parse(x.props.RFORM_OWNER_POLL_REPORT);assert.equal(report.outcome,'PARTIAL');assert.equal(report.stages.training,'ERROR');
 assert(!x.props.RFORM_OWNER_POLL_LAST_SUCCESS);assert(x.props.RFORM_OWNER_LAST_READ_AT);
});
test('failed read records skipped dependent stages and preserves prior success',()=>{
 const x=pollSetup();x.props.RFORM_OWNER_POLL_LAST_SUCCESS='old';x.bot.rformOwnerBotV1ApiRead_=()=>{throw Error('redirect');};
 x.bot.rformOwnerBotV1Poll();const report=JSON.parse(x.props.RFORM_OWNER_POLL_REPORT);
 assert.equal(report.outcome,'ERROR');assert.equal(report.stages.reminders,'SKIPPED_NO_DATA');assert.equal(x.props.RFORM_OWNER_POLL_LAST_SUCCESS,'old');
});
test('broken photo item does not prevent later valid text preview',()=>{
 const x=pollSetup();const first={...x.item(),Content_ID:'CNT-BAD',Date:'01.10.2026',Telegram_Post_Mode:'PHOTO_CAPTION',Telegram_Visual_URL:'https://drive.google.com/drive/folders/fixture'};
 x.bot.rformOwnerBotV1ApiRead_=()=>({queue:[first,x.item()]});x.bot.rformOwnerBotV1ApiQueueAssets_=()=>{throw Error('asset failure');};
 let sent=0;x.bot.rformOwnerBotV1SendPreview_=()=>sent++;x.bot.rformOwnerBotV1Poll();assert.equal(sent,1);
 assert.equal(JSON.parse(x.props.RFORM_OWNER_POLL_REPORT).outcome,'PARTIAL');
});
test('fulltext, URL and channel number search retains canonical states',()=>{
 const x=harness(),q={...x.item(),Telegram_Text:'Заголовок\nУникальное слово внутри',Publication_Status:'HOLD',Telegram_Message_ID:'77',Telegram_Post_URL:'https://t.me/r_form/77'};
 const bundle={queue:[q],channel_posts:[{message_id:79,post_url:'https://t.me/r_form/79',text:'Недельный отчёт',date:1791475200}]};
 for(const query of ['Уникальное','https://t.me/r_form/77','79']){
  x.bot.rformOwnerBotV1WorkspaceSearch_(bundle,0,query);const msg=x.messages.at(-1).payload;
  assert.match(msg.text,/· 1\n/);const keys=JSON.parse(msg.reply_markup).inline_keyboard;
  assert.match(keys[0][0].callback_data,query==='79'?/ow:post:79/:/ow:open:/);
 }
 assert.equal(q.Publication_Status,'HOLD');
});
test('historical unlinked posts with zero candidates are not reconciliation tasks',()=>{
 const x=harness();x.bot.rformOwnerBotV1ChannelList_({channel_review:[{event:{text:'История',message_id:4},candidates:[]}]},0);
 const msg=x.messages.at(-1).payload;assert.match(msg.text,/Сверка с каналом · 0/);
 assert(!JSON.parse(msg.reply_markup).inline_keyboard.flat().some(k=>k.callback_data==='ow:channel:4'));
});

test('bounded preview scans rotate beyond earlier broken photo items',()=>{
 const x=pollSetup(),q=x.item(),bad=Array.from({length:8},(_,i)=>({...q,Content_ID:'CNT-BAD-'+i,Date:'01.10.2026',Telegram_Post_Mode:'PHOTO_CAPTION',Telegram_Visual_URL:'fixture'}));
 x.bot.rformOwnerBotV1ApiRead_=()=>({queue:[...bad,q]});let assets=0,sent=0;
 x.bot.rformOwnerBotV1ApiQueueAssets_=()=>{assets++;throw Error('asset failed');};
 x.bot.rformOwnerBotV1SendPreview_=()=>sent++;
 x.bot.rformOwnerBotV1Poll();assert.equal(assets,6);assert.equal(sent,0);
 x.bot.rformOwnerBotV1Poll();assert.equal(sent,1);assert(assets<=12);
});
