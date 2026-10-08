// Release 1.2.1 acceptance: signed reads only, no queue mutations or Telegram delivery.
function rformRelease121Verify() {
 const p=PropertiesService.getScriptProperties(),b=rformOwnerBotV1ApiRead_();
 const receipt=rformOwnerBotV1ActionStatus_({action_id:"0b1d16d453acb34fcbe5bed23c5f9309",content_id:"CNT-20260913-COMP-RESULT"});
 if(receipt.status!=='APPLIED') throw new Error('Readonly action receipt failed: '+receipt.status);
 const ts=Math.floor(Date.now()/1000),nonce=rformOwnerBotV1RandomHex_(16);
 const full=rformOwnerBotV1ApiPost_({operation:'read',timestamp:ts,nonce:nonce,
   signature:rformOwnerBotV1HmacBase64Url_(String(ts)+'.'+nonce,rformOwnerBotV1RequireProperty_(p,RFORM_OWNER_BOT_V1.props.apiSecret))});
 console.log(JSON.stringify({event:'RELEASE_121_VERIFIED',version:RFORM_OWNER_BOT_V1.version,apiVersion:b.version,
 scopedSessions:b.training_sessions.length,fullSessions:full.training_sessions.length,fullEvents:full.events.length,
 queueRows:b.queue.length,work:rformOwnerBotV1WorkspaceRows_(b.queue,'work','').length,
 held:rformOwnerBotV1WorkspaceRows_(b.queue,'held','').length,published:rformOwnerBotV1WorkspaceRows_(b.queue,'published','').length,
 archived:rformOwnerBotV1WorkspaceRows_(b.queue,'archived','').length,
 reconciliationTasks:(b.channel_review||[]).filter(r=>r.candidates.length).length,
 historyUnlinked:(b.channel_review||[]).filter(r=>!r.candidates.length).length,
 receiptStatus:receipt.status,receiptActionId:receipt.action_id,
 protectedRows:b.queue.filter(q=>/SERIES-0[67]-/.test(q.Content_ID)).map(q=>({id:q.Content_ID,status:q.Publication_Status,auto:q.AutoPost_Allowed})),
 scheduled:b.queue.filter(q=>['SCHEDULED','PUBLISHING'].indexOf(q.Publication_Status)!==-1).length,
 channelEnabled:p.getProperty('RFORM_OWNER_CHANNEL_SYNC_ENABLED'),channelError:p.getProperty('RFORM_OWNER_CHANNEL_SYNC_ERROR'),
 pollReport:JSON.parse(p.getProperty('RFORM_OWNER_POLL_REPORT')||'null'),lastSuccess:p.getProperty('RFORM_OWNER_POLL_LAST_SUCCESS'),
 pendingAction:!!p.getProperty('RFORM_OWNER_PENDING_ACTION'),
 pollTriggers:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='rformOwnerBotV1Poll').length,
 publicationPerformed:false,canonicalWrite:false}));
}

