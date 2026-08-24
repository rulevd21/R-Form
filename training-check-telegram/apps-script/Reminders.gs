'use strict';

function rformTrainingCheckReminderTick(){
  if(!tcRemindersEnabled_()||!tcBotEnabled_())return{ok:true,skipped:true};const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return{ok:true,skipped:true,reason:'LOCKED'};let sent=0,failed=0;
  try{
    const ss=tcSs_(),cs=tcRequireSheet_(ss,RFORM_TCV1.SHEETS.CHECKS),ch=tcHeaderMap_(cs),ps=tcRequireSheet_(ss,RFORM_TCV1.SHEETS.PARTICIPANTS),ph=tcHeaderMap_(ps),last=cs.getLastRow();if(last<2)return{ok:true,sent:0};const rows=cs.getRange(2,1,last-1,cs.getLastColumn()).getDisplayValues();
    for(let i=0;i<rows.length;i++){
      const row=i+2,status=String(rows[i][ch.reminder_status-1]||'');if(status!=='PENDING'&&status!=='RETRY')continue;const date=String(rows[i][ch.next_checkpoint_date-1]||'');if(!date)continue;const pid=String(rows[i][ch.participant_id-1]||''),prow=tcFindRow_(ps,ph.participant_id,pid);if(!prow)continue;const p=tcRowObject_(ps,ph,prow);if(String(p.reminders_enabled).toUpperCase()!=='TRUE'||!p.telegram_chat_id)continue;const tz=p.timezone||'Europe/Riga',today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'),hour=Number(Utilities.formatDate(new Date(),tz,'H'));if(today!==date||hour<9)continue;
      tcSetRowValues_(cs,ch,row,{reminder_status:'SENDING'});SpreadsheetApp.flush();
      try{const checkpoint=String(p.active_checkpoint_text||rows[i][ch.report_next_step-1]||''),r=tcSendMessage_(p.telegram_chat_id,'Сегодня контрольная точка:\n'+checkpoint+'\n\nПосле тренировки — Training Check.',tcMiniAppKeyboard_('Проверить тренировку','check'));tcSetRowValues_(cs,ch,row,{reminder_status:'SENT',reminder_sent_at:tcNowIso_(),reminder_message_id:String(r.message_id||'')});tcEvent_(pid,String(rows[i][ch.check_id-1]||''),'reminder_sent','BOT',String(p.is_test_user).toUpperCase()==='TRUE',{reminder_id:String(rows[i][ch.reminder_id-1]||'')});sent++;}catch(_){tcSetRowValues_(cs,ch,row,{reminder_status:'RETRY'});failed++;}
    }
  }finally{lock.releaseLock();}
  return{ok:failed===0,sent:sent,failed:failed};
}
function rformTrainingCheckInstallReminderTrigger(){ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='rformTrainingCheckReminderTick';}).forEach(function(t){ScriptApp.deleteTrigger(t);});ScriptApp.newTrigger('rformTrainingCheckReminderTick').timeBased().everyHours(1).create();return{ok:true};}
