'use strict';

function tcTelegramWebhookResponse_(e,pathSecret){
  try{
    if(!tcWebhookSecret_()||!tcConstantTimeEqual_(String(pathSecret||''),tcWebhookSecret_()))throw new Error('WEBHOOK_ACCESS_DENIED');
    if(!tcBotEnabled_())return ContentService.createTextOutput('OK');
    const raw=String((e&&e.postData&&e.postData.contents)||'');if(!raw)throw new Error('UPDATE_MISSING');let update;try{update=JSON.parse(raw);}catch(_){throw new Error('UPDATE_INVALID_JSON');}
    tcHandleTelegramUpdate_(update);
  }catch(_){ }
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}
function tcHandleTelegramUpdate_(update){
  const updateId=String(update&&update.update_id||'');if(!updateId)throw new Error('UPDATE_ID_MISSING');const eventId='tg:'+updateId;
  const lock=LockService.getScriptLock();lock.waitLock(10000);let claim;
  try{const existing=tcIngestFind_(eventId);if(existing)return;const from=(update.message&&update.message.from)||(update.callback_query&&update.callback_query.from)||{},p=from.id?tcFindParticipantByTelegram_(String(from.id)):null;claim=tcIngestAppend_(eventId,'',p?p.participant_id:'','TELEGRAM_BOT','PROCESSING','Update claimed',{type:update.callback_query?'callback_query':'message'});SpreadsheetApp.flush();}finally{lock.releaseLock();}
  try{if(update.message)tcHandleBotMessage_(update.message);else if(update.callback_query)tcHandleBotCallback_(update.callback_query);tcIngestStatus_(claim,'APPLIED','','Telegram update applied');}catch(err){tcIngestStatus_(claim,'ERROR',String(err&&err.message?err.message:err),'Telegram update failed');throw err;}
}
function tcHandleBotMessage_(m){
  const from=m.from||{},chat=m.chat||{},text=String(m.text||'').trim(),cmd=text.split(/\s+/)[0].split('@')[0].toLowerCase(),p=from.id?tcFindParticipantByTelegram_(String(from.id)):null;
  if(cmd==='/start')return tcSendMessage_(chat.id,'R/Form Training Check\n\nРазберите тренировку примерно за 3 минуты: зафиксируйте факт, получите один главный сигнал и решите, что проверить в следующий раз.\n\nРешение остаётся за вами. В бесплатном MVP анализ выполняется прозрачными правилами R/Form.',tcMiniAppKeyboard_('Проверить тренировку','check'));
  if(cmd==='/check')return tcSendMessage_(chat.id,'Откройте Training Check.',tcMiniAppKeyboard_('Проверить тренировку','check'));
  if(cmd==='/today'){if(!p)return tcSendMessage_(chat.id,'Активной контрольной точки пока нет. Сначала выполните первый Training Check.',tcMiniAppKeyboard_('Начать','check'));const pr=tcGetParticipantProfile_(p.participant_id);return tcSendMessage_(chat.id,pr.active_checkpoint_text?('Текущая контрольная точка:\n'+pr.active_checkpoint_text):'Активной контрольной точки сейчас нет.',tcMiniAppKeyboard_('Открыть Training Check','check'));}
  if(cmd==='/history'){if(!p)return tcSendMessage_(chat.id,'История появится после первого Training Check.',tcMiniAppKeyboard_('Начать','check'));const h=tcHistory_(p.participant_id,3);if(!h.length)return tcSendMessage_(chat.id,'История пока пуста.',tcMiniAppKeyboard_('Начать','check'));const lines=h.map(function(x){return x.session_date+' — '+(x.analysis.signal||'Check сохранён');});return tcSendMessage_(chat.id,'Последние Training Check:\n\n'+lines.join('\n'),tcMiniAppKeyboard_('Открыть историю','history'));}
  if(cmd==='/settings')return tcSendMessage_(chat.id,'Напоминания и следующая дата настраиваются внутри R/Form.',tcMiniAppKeyboard_('Настройки','settings'));
  if(cmd==='/privacy')return tcSendMessage_(chat.id,'R/Form хранит только данные, необходимые для Training Check: Telegram identity для входа и напоминаний, onboarding и историю Check. Данные не записываются в персональный RFORM_MASTER_DATA. Удаление разрывает связь истории с Telegram identity.',tcMiniAppKeyboard_('Приватность и удаление','privacy'));
  if(cmd==='/help')return tcSendMessage_(chat.id,'Команды: /check — новый Check; /today — контрольная точка; /history — история; /settings — напоминания; /privacy — данные и удаление.',tcMiniAppKeyboard_('Training Check','check'));
  return tcSendMessage_(chat.id,'Для работы используйте Training Check.',tcMiniAppKeyboard_('Training Check','check'));
}
function tcHandleBotCallback_(q){if(q.id)tcTelegramApi_('answerCallbackQuery',{callback_query_id:q.id});}
function tcMiniAppKeyboard_(text,startParam){return{inline_keyboard:[[{text:text,web_app:{url:tcMiniAppUrl_()+(startParam?('?start='+encodeURIComponent(startParam)):'')}}]]};}
function tcSendMessage_(chatId,text,replyMarkup){const body={chat_id:String(chatId),text:String(text),disable_web_page_preview:true};if(replyMarkup)body.reply_markup=replyMarkup;return tcTelegramApi_('sendMessage',body);}
function tcTelegramApi_(method,payload){const credential=tcBotCredential_();if(!credential)throw new Error('BOT_CREDENTIAL_MISSING');const res=UrlFetchApp.fetch('https://api.telegram.org/bot'+credential+'/'+method,{method:'post',contentType:'application/json',payload:JSON.stringify(payload||{}),muteHttpExceptions:true}),code=res.getResponseCode();let body={};try{body=JSON.parse(res.getContentText()||'{}');}catch(_){}if(code<200||code>=300||body.ok!==true)throw new Error('TELEGRAM_API_ERROR:'+method+':'+code);return body.result;}
function rformTrainingCheckConfigureBot(){if(!tcBotCredential_())throw new Error('BOT_CREDENTIAL_MISSING');const commands=[{command:'start',description:'Начать'},{command:'check',description:'Training Check'},{command:'today',description:'Контрольная точка'},{command:'history',description:'История'},{command:'settings',description:'Настройки'},{command:'privacy',description:'Приватность'},{command:'help',description:'Помощь'}];tcTelegramApi_('setMyCommands',{commands:commands});tcTelegramApi_('setChatMenuButton',{menu_button:{type:'web_app',text:'Training Check',web_app:{url:tcMiniAppUrl_()}}});return{ok:true};}
function rformTrainingCheckSetWebhook(){const scriptUrl=ScriptApp.getService().getUrl();if(!scriptUrl)throw new Error('DEPLOYMENT_URL_MISSING');if(!tcWebhookSecret_())throw new Error('WEBHOOK_PATH_SECRET_MISSING');const url=scriptUrl.replace(/\/$/,'')+'/telegram/'+tcWebhookSecret_(),result=tcTelegramApi_('setWebhook',{url:url,allowed_updates:['message','callback_query'],drop_pending_updates:false});return{ok:!!result,webhook_protection:'PATH_SECRET'};}
