'use strict';

function doGet(e){
  const mode=String((e&&e.parameter&&e.parameter.mode)||'status');
  if(mode==='preflight')return ContentService.createTextOutput(JSON.stringify(rformTrainingCheckV1Preflight())).setMimeType(ContentService.MimeType.JSON);
  return ContentService.createTextOutput(JSON.stringify({ok:true,service:'R/Form Training Check Telegram V1',version:RFORM_TCV1.VERSION,safe_mode:!tcWritesEnabled_()})).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e){
  const path=String((e&&e.pathInfo)||'').replace(/^\/+|\/+$/g,'');
  if(path.indexOf('telegram/')===0)return tcTelegramWebhookResponse_(e,path.slice('telegram/'.length));
  if(path==='api'||path==='')return tcMiniAppResponse_(e);
  return ContentService.createTextOutput('NOT_FOUND').setMimeType(ContentService.MimeType.TEXT);
}
function tcMiniAppResponse_(e){
  let result;
  try{
    const p=(e&&e.parameter)||{},action=String(p.action||''),initData=String(p.init_data||''),payloadRaw=String(p.payload||'{}');
    if(payloadRaw.length>RFORM_TCV1.MAX_PAYLOAD_CHARS)throw new Error('PAYLOAD_TOO_LARGE');
    let payload={};try{payload=JSON.parse(payloadRaw||'{}');}catch(_){throw new Error('PAYLOAD_INVALID_JSON');}
    const tg=tcValidateTelegramInitData_(initData),existing=tcFindParticipantByTelegram_(tg.id);let participant=existing?tcGetParticipantProfile_(existing.participant_id):null;
    if(action==='bootstrap')result={ok:true,action:action,new_user:!participant,profile:participant,history:participant?tcHistory_(participant.participant_id,3):[]};
    else if(action==='onboarding_save'){const profile=tcSaveOnboarding_(tg,tg.id,payload);result={ok:true,action:action,profile:profile,history:[]};}
    else{
      if(!existing)throw new Error('ONBOARDING_REQUIRED');participant=tcGetParticipantProfile_(existing.participant_id);
      if(action==='check_submit'){const eventId=String(payload.event_id||'');if(!eventId)throw new Error('EVENT_ID_REQUIRED');result={ok:true,action:action,check:tcSubmitCheck_(participant,eventId,payload.check||{})};}
      else if(action==='checkpoint_confirm')result=Object.assign({action:action},tcUpdateCheckpoint_(participant,String(payload.check_id||''),String(payload.checkpoint||''),false));
      else if(action==='checkpoint_change')result=Object.assign({action:action},tcUpdateCheckpoint_(participant,String(payload.check_id||''),String(payload.checkpoint||''),true));
      else if(action==='next_date_save')result=Object.assign({action:action},tcSaveNextDate_(participant,String(payload.check_id||''),String(payload.next_date||'')));
      else if(action==='settings_save')result={ok:true,action:action,profile:tcSaveSettings_(participant,payload)};
      else if(action==='history')result={ok:true,action:action,history:tcHistory_(participant.participant_id,10)};
      else if(action==='portable_prompt'){tcEvent_(participant.participant_id,'','export_ai_context','MINI_APP',participant.is_test_user,{});result={ok:true,action:action,prompt:tcPortablePrompt_(participant)};}
      else if(action==='delete_data')result=Object.assign({action:action},tcDeleteUserData_(participant));
      else throw new Error('ACTION_UNKNOWN');
    }
  }catch(err){result={ok:false,error:String(err&&err.message?err.message:err)};}
  return tcPostMessageHtml_(result);
}
function tcPostMessageHtml_(result){
  const safe=JSON.stringify(result).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'),origin=JSON.stringify(tcAllowedOrigin_());
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>parent.postMessage({source:"rform-tc-v1",payload:'+safe+'},'+origin+');<\/script>');
}
