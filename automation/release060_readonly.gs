// Read-only release verification; not a Web App deployment.
function rformRelease060Verify() {
  const p=PropertiesService.getScriptProperties();
  const baseline=JSON.parse(p.getProperty('RFORM_AUTO_DRAFT_BASELINE') || '[]');
  const c=rformContentApiV04WorkspaceContext_();
  const queue=rformContentApiV04ReadRows_(c.queue,RFORM_CONTENT_API_V04.queueFields,'Content_ID');
  const sessions=rformContentApiV04ReadRows_(rformContentApiV04RequireSheet_(c.ss,RFORM_CONTENT_API_V04.trainingSessionsSheet),RFORM_CONTENT_API_V04.trainingSessionFields,'Session_ID');
  console.log(JSON.stringify({event:'RELEASE_060_READBACK',version:RFORM_CONTENT_API_V04.version,autoDraftEnabled:p.getProperty('RFORM_AUTO_DRAFT_ENABLED'),baselineClosedSessions:baseline.length,closedSessions:sessions.filter(s=>s.Session_Status==='CLOSED').length,queueRows:queue.length,autoDraftRows:queue.filter(q=>/^CNT-AUTO-/.test(q.Content_ID)).length,protectedRows:queue.filter(q=>/SERIES-0[67]-/.test(q.Content_ID)).map(q=>({id:q.Content_ID,status:q.Publication_Status,autopost:q.AutoPost_Allowed,url:q.Post_URL})),canonicalWrite:false}));
}

function rformRelease123BridgeReadOnly() {
 const hasPacket=!!PropertiesService.getScriptProperties().getProperty("RFORM_CHATGPT_PROPOSAL");
 if(hasPacket) {console.log(JSON.stringify({event:"RELEASE_123_BRIDGE",status:"PACKET_PRESENT_NOT_EXECUTED",canonicalWrite:false}));return;}
 console.log(JSON.stringify({event:"RELEASE_123_BRIDGE",result:rformContentApiV04SubmitChatGPTProposal(),canonicalWrite:false}));
}
