/** Owner-only existing deployment: exact Issue #77 execution, pinned to read-only preflight. */
var RFormIssue77Acceptance = Object.freeze({
  dayRevision:'DAY:59a3568ffa5bd4832687',
  setsHash:'SETS:728e87fe42a0274c7c71'
});
function applyIssue77Recovery() {
  var result=RFormIncidentRecovery.repair(RFormIssue77Acceptance.dayRevision,RFormIssue77Acceptance.setsHash);
  console.log(JSON.stringify(result));return result;
}
function finishIssue77Recovery() {
  var safety=RFormTests.runSafetyBaseline();
  if(!safety.ok)throw new Error('ISSUE77_BLOCKED:SAFETY_BASELINE');
  var p=RFormIncidentRecovery.preview();
  if(p.expectedSetsHash!==RFormIssue77Acceptance.setsHash || p.setCount!==11 || p.uniqueSetKeys!==11 ||
     p.duplicateFlags!==0 || p.closureCount!==0 ||
     p.day.dayType!=='RECOVERY' || p.day.morningWeight!==73.7 || p.day.dayStatus!=='OPEN' ||
     p.day.sleepHours!==7 || p.day.dailyConclusion.indexOf('05.08.2026')!==-1) {
    throw new Error('ISSUE77_BLOCKED:FINISH_PREFLIGHT');
  }
  var recovery=p.originalRecovery;
  recovery.postPain=0;recovery.technique=10;recovery.comment='';
  var result=RFormSessionService.finish({
    requestId:'REQ:3f5a05d7-1486-40b8-98d9-0cb16da208bf',
    sessionId:'S-20261023-RECOVERY',
    expectedRevision:'NEW:S-20261023-RECOVERY',
    recoveryExpectedRevision:p.expectedRevision,
    durationMinutes:55,sessionComment:'',recovery:recovery,appVersion:RFormConfig.APP_VERSION
  });
  console.log(JSON.stringify({result:result,readback:verifyIssue77Recovery()}));return result;
}
function verifyIssue77Recovery() {
  var p=RFormIncidentRecovery.preview();
  var s=p.session;
  if(!s || s.sessionId!=='S-20261023-RECOVERY' || s.dayId!=='D-20261023' ||
     s.dateKey!=='2026-10-23' || s.sessionType!=='RECOVERY' ||
     s.sessionStatus!=='CLOSED' || s.actualDuration!==55 ||
     s.painAfter!=='Общая боль 0/10' ||
     s.conclusion.indexOf('техника жима 10/10')===-1 ||
     s.conclusion.indexOf('сохранено подходов 11 из 11')===-1 ||
     !s.completedAt || s.duplicateFlag ||
     p.day.dayType!=='RECOVERY' || p.day.morningWeight!==73.7 || p.day.sleepHours!==7 ||
     p.day.dayStatus!=='OPEN' || p.day.dailyConclusion.indexOf('05.08.2026')!==-1 ||
     p.setCount!==11 || p.uniqueSetKeys!==11 || p.duplicateFlags!==0 ||
     p.expectedSetsHash!==RFormIssue77Acceptance.setsHash || p.closureCount!==0) {
    throw new Error('ISSUE77_BLOCKED:FINAL_READBACK');
  }
  console.log(JSON.stringify({verified:true,readback:p}));return {verified:true,readback:p};
}
