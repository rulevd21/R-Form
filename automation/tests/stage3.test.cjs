const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./workspace_harness.cjs');
const sync=x=>x.api.rformContentApiV04Workspace_({action_id:'a'.repeat(32),payload:{action:'sync_training'}});
test('long training facts retain every exercise without invented decision or cut tuple',()=>{
 const x=harness(),groups=Array.from({length:12},(_,i)=>'Жим вариант '+i+' 90×4; 85×3; 85×3 RIR 3/3/2.');
 const text=x.api.rformContentApiV04TrainingText_({Date:'08.10.2026',Session_Type:'A',Main_Result:groups.join('; '),Actual_Duration:'70',Session_Decision:'Увеличить нагрузку на 50%'});
 assert(text.length<=4096);assert.match(text,/90×4; 85×3; 85×3 RIR 3\/3\/2/);
 groups.forEach((group,i)=>assert(text.includes((i+1)+'. '+group)));
 assert.doesNotMatch(text,/часть упражнений/);assert(!text.includes('50%'));
});
test('blocked source is observable as PARTIAL, no successful full-cycle timestamp',()=>{
 const x=harness();Object.assign(x.props,{RFORM_OWNER_BOT_ENABLED:'YES',RFORM_OWNER_AUTO_DRAFTS_ENABLED:'YES',RFORM_AUTO_DRAFT_ENABLED:'YES'});
 x.addSession({Completed_At:''});x.bot.rformOwnerBotV1Poll();
 const r=JSON.parse(x.props.RFORM_OWNER_POLL_REPORT);assert.equal(r.outcome,'PARTIAL');assert.equal(r.stages.training,'NEEDS_REVIEW');
 assert.equal(r.training.blocked[0].reason,'COMPLETION_NOT_VERIFIED');assert(!x.props.RFORM_OWNER_POLL_LAST_SUCCESS);
 x.bot.rformOwnerBotV1Status_();assert.match(x.messages.at(-1).payload.text,/заблокировано 1/);
});
test('closed training -> automatic one draft -> exact private preview; no channel publish',()=>{
 const x=harness();Object.assign(x.props,{RFORM_OWNER_BOT_ENABLED:'YES',RFORM_OWNER_AUTO_DRAFTS_ENABLED:'YES',RFORM_AUTO_DRAFT_ENABLED:'YES'});
 const s=x.addSession();x.bot.rformOwnerBotV1Poll();x.bot.rformOwnerBotV1Poll();
 assert.equal(x.queue.rows.length,3);const q=x.item(2);assert.equal(q.AutoPost_Allowed,'NO');assert.equal(q.Publish_At,'');
 assert.equal(x.messages.filter(m=>String(m.payload.text||'').includes('80×4×4')).length,1);
 assert(x.messages.every(m=>String(m.payload.chat_id)==='42'));assert.equal(q.Session_ID,s.Session_ID);
});
test('superseded AI request cannot commit even when text hash is unchanged',()=>{
 const x=harness(),a=x.request({action:'ai_request',instruction:'Сократи'});x.api.rformContentApiV04Workspace_(a);
 x.call({action:'ai_request',instruction:'Добавь контекст'});const before=JSON.stringify([x.queue.rows,x.log.rows]);
 assert.throws(()=>x.call({action:'ai_proposal',request_id:a.action_id,text:'Старое предложение'}),/устарел/);
 assert.equal(JSON.stringify([x.queue.rows,x.log.rows]),before);
});
test('ChatGPT bridge commits proposal only, rereads, clears packet and never saves text',()=>{
 const x=harness(),a=x.request({action:'ai_request',instruction:'Сократи'});x.api.rformContentApiV04Workspace_(a);
 const packet={content_id:a.content_id,source_hash:a.source_hash,request_id:a.action_id,text:'Краткое предложение.'};
 x.props.RFORM_CHATGPT_PROPOSAL=JSON.stringify(packet);const r=x.api.rformContentApiV04SubmitChatGPTProposal();
 assert.equal(r.status,'APPLIED');assert(!x.props.RFORM_CHATGPT_PROPOSAL);assert.equal(x.item().Telegram_Text,'Исходный текст.');
 assert.equal(x.api.rformContentApiV04SubmitChatGPTProposal().status,'NO_PACKET');
 x.props.RFORM_CHATGPT_PROPOSAL=JSON.stringify(packet);assert.equal(x.api.rformContentApiV04SubmitChatGPTProposal().status,'ALREADY_APPLIED');
 assert.equal(x.log.rows.length,3);
});
test('invalid/stale ChatGPT packet retained, cannot approve/save or change material',()=>{
 const x=harness(),a=x.request({action:'ai_request',instruction:'Сократи'});x.api.rformContentApiV04Workspace_(a);x.call({action:'save',text:'Другой текст'});
 const before=JSON.stringify(x.queue.rows);x.props.RFORM_CHATGPT_PROPOSAL=JSON.stringify({content_id:a.content_id,source_hash:a.source_hash,request_id:a.action_id,text:'stale'});
 assert.throws(()=>x.api.rformContentApiV04SubmitChatGPTProposal());assert(x.props.RFORM_CHATGPT_PROPOSAL);assert.equal(JSON.stringify(x.queue.rows),before);
 const p=JSON.parse(x.props.RFORM_CHATGPT_PROPOSAL);p.action='save';x.props.RFORM_CHATGPT_PROPOSAL=JSON.stringify(p);assert.throws(()=>x.api.rformContentApiV04SubmitChatGPTProposal(),/Некорректный пакет/);
});
test('AI queue is readonly and explains ready/pending/stale/closed without applying',()=>{
 const x=harness(),a=x.request({action:'ai_request',instruction:'Сократи'});x.api.rformContentApiV04Workspace_(a);
 const before=JSON.stringify([x.queue.rows,x.log.rows]);x.bot.rformOwnerBotV1AiQueue_(x.api.rformContentApiV04Payload_(true),0);
 assert.match(x.messages.at(-1).payload.text,/Ожидает ChatGPT/);assert.equal(JSON.stringify([x.queue.rows,x.log.rows]),before);
 x.call({action:'ai_proposal',request_id:a.action_id,text:'Предложение'});x.bot.rformOwnerBotV1AiQueue_(x.api.rformContentApiV04Payload_(true),0);assert.match(x.messages.at(-1).payload.text,/Предложение готово/);
 x.call({action:'save',text:'changed'});x.bot.rformOwnerBotV1AiQueue_(x.api.rformContentApiV04Payload_(true),0);assert.match(x.messages.at(-1).payload.text,/Устарело/);
});
test('one flow: training draft -> ChatGPT proposal -> phone photo -> review -> version, no publication',()=>{
 const x=harness();x.props.RFORM_AUTO_DRAFT_ENABLED='YES';x.addSession();sync(x);
 const q=x.item(2),token=x.bot.rformOwnerBotV1ItemToken_(q);x.callback('ow:open:'+token);
 const hash=x.bot.rformOwnerBotV1WorkspaceHash_(q);
 const request=x.bot.rformOwnerBotV1WorkspaceApi_(q.Content_ID,hash,{action:'ai_request',instruction:'Сократи текст.'});
 const ai=x.api.rformContentApiV04WorkspaceMeta_()[q.Content_ID].ai;
 x.props.RFORM_CHATGPT_PROPOSAL=JSON.stringify({content_id:q.Content_ID,source_hash:hash,request_id:ai.request_id,text:'Тренировка завершена. Жим 80×4×4.'});
 x.api.rformContentApiV04SubmitChatGPTProposal();x.callback('ow:proposal:'+token);
 assert.equal(x.item(2).Telegram_Text,q.Telegram_Text); // still unsaved
 const original=x.bot.rformOwnerBotV1Telegram_;
 x.bot.rformOwnerBotV1Telegram_=(t,m,p)=>m==='getFile'?{file_path:'photos/file_1.jpg'}:original(t,m,p);
 x.bot.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getBlob:()=>x.blob([255,216,255,5],'image/jpeg','fixture.jpg')})};
 x.bot.rformOwnerBotV1WorkspaceMessage_({from:{id:42},chat:{id:42,type:'private'},message_id:908,photo:[{file_id:'fixture',file_size:4}]});
 const d=x.bot.rformOwnerBotV1WorkspaceDraft_(token);assert.equal(d.asset_ids.length,1);
 x.callback('ow:save:'+token+':'+d.revision);assert.equal(x.item(2).Telegram_Text,q.Telegram_Text); // changed photo invalidates prior review
 x.callback('ow:review:'+token);x.callback('ow:save:'+token+':'+d.revision);
 const saved=x.item(2);assert.equal(saved.Telegram_Text,'Тренировка завершена. Жим 80×4×4.');assert.equal(saved.Telegram_Post_Mode,'PHOTO_CAPTION');
 assert.equal(saved.AutoPost_Allowed,'NO');assert.equal(saved.Publish_At,'');assert.equal(saved.Approval_Status,'NOT_READY');assert.equal(saved.Preview_Review_Status,'RECHECK_REQUIRED');
 assert.equal(x.api.rformContentApiV04WorkspaceMeta_()[q.Content_ID].versions.length,1);
 assert(x.messages.every(m=>m.method==='answerCallbackQuery' || String(m.payload.chat_id)==='42'));
});

test('missing or corrupt baseline cannot cause a historical automatic import',()=>{
 for(const baseline of [undefined,'{}','[42]']){
  const x=harness();x.props.RFORM_AUTO_DRAFT_ENABLED='YES';x.addSession();
  if(baseline===undefined)delete x.props.RFORM_AUTO_DRAFT_BASELINE;else x.props.RFORM_AUTO_DRAFT_BASELINE=baseline;
  const before=JSON.stringify([x.queue.rows,x.log.rows]);assert.throws(()=>sync(x),/Baseline/);assert.equal(JSON.stringify([x.queue.rows,x.log.rows]),before);
 }
});
