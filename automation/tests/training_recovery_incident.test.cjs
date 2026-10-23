const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'../../training-mobile');
const policySource=fs.readFileSync(path.join(root,'RecoveryPolicy.gs'),'utf8');
function context(extra={}) { const c=vm.createContext(extra);vm.runInContext(policySource,c);return c; }
test('canonical recovery mapping preserves A/B/C and rejects no guards by itself',()=>{
  const p=context().RFormRecoveryPolicy;
  assert.equal(p.dayType('RECOVERY'),'RECOVERY');
  for(const type of ['A','B','C']) assert.equal(p.dayType(type),'TRAINING_'+type);
});
test('historical versions may repeat keys, same-version and active collisions remain blocked',()=>{
 const p=context().RFormRecoveryPolicy;
 const a={Plan_Set_ID:'1',Plan_ID:'v1',Record_Key:'K',Plan_Status:'SUPERSEDED'};
 const b={...a,Plan_Set_ID:'2',Plan_ID:'v2',Plan_Status:'PLANNED'};
 assert.equal(p.planIdentityReport([a,b]).duplicateVersionKeys.length,0);
 assert.equal(p.planIdentityReport([a,b]).duplicateActiveKeys.length,0);
 assert.equal(p.planIdentityReport([a,{...b,Plan_ID:'v1'}]).duplicateVersionKeys.length,1);
 assert.equal(p.planIdentityReport([{...a,Plan_Status:'ACTIVE'},b]).duplicateActiveKeys.length,1);
 assert.equal(p.planIdentityReport([a,{...b,Plan_Set_ID:'1'}]).duplicatePlanSetIds.length,1);
});
function incident() {
 const keys=Array.from({length:11},(_,i)=>'K'+i);
 return {day:{dayId:'D-20261023',dateKey:'2026-10-23',dayStatus:'CLOSED',dayType:'REST',
 morningWeight:71.85,dailyConclusion:'August 05.08.2026'},revision:'DAY:before',setsHash:'SETS:before',
 closureCount:0,session:null,templateConclusion:'August 05.08.2026',planKeys:keys,setKeys:[...keys],
 duplicateFlags:[],originalRecovery:{morningWeight:73.7,sleepHours:7,sleepQuality:9,readiness:10,
 shoulderPain:0,elbowPain:0,otherPain:0}};
}
test('exact incident passes, each stale/closed/duplicate/evidence guard fails closed',()=>{
 const p=context().RFormRecoveryPolicy;
 assert.equal(p.assertIncident(incident(),'DAY:before','SETS:before'),true);
 const cases=[
 s=>s.revision='DAY:changed',s=>s.setsHash='SETS:changed',s=>s.closureCount=1,
 s=>s.session={sessionStatus:'CLOSED'},s=>s.day.dayId='D-20261024',
 s=>s.day.dateKey='2026-10-24',s=>s.day.dayType='RECOVERY',s=>s.day.dayStatus='OPEN',
 s=>s.day.morningWeight=73.7,s=>s.day.dailyConclusion='legitimate conclusion',
 s=>s.setKeys.pop(),s=>s.setKeys[1]=s.setKeys[0],s=>s.setKeys[0]='wrong',
 s=>s.duplicateFlags.push('DUPLICATE'),s=>s.originalRecovery.sleepHours=8
 ];
 for(const mutate of cases){const s=incident();mutate(s);assert.throws(()=>p.assertIncident(s,'DAY:before','SETS:before'),/ISSUE77_BLOCKED/);}
});
test('DailyService uses recovery mapping in both CREATE and existing identity checks and retains status/revision guards',()=>{
 const source=fs.readFileSync(path.join(root,'DailyService.gs'),'utf8');
 assert.equal((source.match(/RFormRecoveryPolicy.dayType\(first.sessionType\)/g)||[]).length,3);
 assert.ok(source.includes('assertMutableStatus('));
 assert.ok(source.includes('assertExpectedRevision_(existing, expectedRevision, first.dayId)'));
 assert.ok(!source.includes("Day_Type: 'TRAINING_' + first.sessionType"));
});
test('incident repair preserves before-image, logs before writes, checks baseline and never writes sets or closure',()=>{
 const source=fs.readFileSync(path.join(root,'IncidentRecovery.gs'),'utf8');
 assert.ok(source.includes('before:s.rawDay'));
 assert.ok(source.indexOf("'CREATE_INBOX_EVENT'")<source.indexOf("'REPAIR_GHOST_RECOVERY'"));
 assert.ok(source.includes("if (!baseline.ok) throw new Error('ISSUE77_BLOCKED:SAFETY_BASELINE')"));
 assert.ok(source.includes('RFormRecoveryPolicy.assertIncident(s, expectedRevision, expectedSetsHash)'));
 assert.ok(source.includes("function previewIssue77Recovery_()"));
 assert.ok(!source.includes("writeFields(RFormConfig.SHEETS.TRAINING_SETS"));
 assert.ok(!source.includes("writeFields(RFormConfig.SHEETS.DAY_CLOSURE"));
});
test('native baseline uses version and active uniqueness, retains global fact identity checks',()=>{
 const source=fs.readFileSync(path.join(root,'Tests.gs'),'utf8');
 assert.ok(source.includes('report.duplicateVersionKeys'));
 assert.ok(source.includes('report.duplicateActiveKeys'));
 assert.ok(source.includes("[RFormConfig.SHEETS.TRAINING_SETS, 'Record_Key']"));
 assert.ok(source.includes("[RFormConfig.SHEETS.DAILY, 'Day_ID']"));
 assert.ok(source.includes('criticalDuplicates.length === 0'));
});

function repairFixture({badBaseline=false,failWrite=false}={}) {
 const crypto=require('node:crypto');
 const hash=(prefix,value)=>prefix+':'+crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);
 const old={_rowNumber:186,Day_ID:'D-20261023',Date:'2026-10-23',Day_Type:'REST',
 Morning_Weight:71.85,Sleep_Hours:8,Sleep_Quality:9,Readiness:10,Shoulder_Pain:0,
 Elbow_Pain:0,Other_Pain:0,Steps:6000,Day_Status:'CLOSED',Daily_Conclusion:'August 05.08.2026'};
 const state={day:{...old},audits:[],operations:[],failed:false};
 const keys=Array.from({length:11},(_,i)=>'K'+i);
 const sets=keys.map((k,i)=>({_rowNumber:840+i,Set_ID:'SET'+i,Session_ID:'S-20261023-RECOVERY',Record_Key:k,Duplicate_Flag:''}));
 const normalize=()=>({rowNumber:186,dayId:state.day.Day_ID,dateKey:state.day.Date,dayType:state.day.Day_Type,
 morningWeight:state.day.Morning_Weight,sleepHours:state.day.Sleep_Hours,sleepQuality:9,readiness:10,
 shoulderPain:0,elbowPain:0,otherPain:0,dayStatus:state.day.Day_Status,dailyConclusion:state.day.Daily_Conclusion});
 const repo={
 beginOperation(){},endOperation(){},
 findRowsByExactValue(sheet,field,value) {
   if(sheet==='TRAINING_SETS')return sets.map(x=>x._rowNumber);
   if(sheet==='QA_LOG')return [27];
   if(sheet==='INBOX_LOG')return state.audits.length?[2]:[];
   return [];
 },
 readRowsByNumbers(){return sets;},
 readObjects(sheet){
   if(sheet==='DAY_CLOSURE')return [];
   if(sheet==='TRAINING_PLAN')return keys.map((k,i)=>({Plan_Set_ID:'P'+i,Plan_ID:'V1',Record_Key:k,Plan_Status:'PLANNED'}));
   throw new Error('unexpected read '+sheet);
 },
 readRow(sheet,row) {
  if(sheet==='DAILY')return row===4?{Daily_Conclusion:old.Daily_Conclusion}:{...state.day};
  if(sheet==='QA_LOG')return {Record_ID:'S-20261023-RECOVERY',Field_Name:'SAVE_RECOVERY',
   Current_Value:JSON.stringify({morningWeight:'73,7',sleepHours:'7',sleepQuality:'9',readiness:'10',shoulderPain:'0',elbowPain:'0',otherPain:'0'})};
  if(sheet==='INBOX_LOG')return {...state.audits[0]};
  throw new Error('unexpected row '+sheet);
 },
 appendFromTemplate(sheet,payload,op){
  assert.equal(sheet,'INBOX_LOG');state.operations.push(op);state.audits.push({...payload});return 2;
 },
 writeFields(sheet,row,values,op){
  state.operations.push(op);
  if(sheet==='DAILY'){
   Object.assign(state.day,values);
   if(failWrite&&!state.failed){state.failed=true;throw new Error('simulated partial write');}
  }else if(sheet==='INBOX_LOG')Object.assign(state.audits[0],values);
  else throw new Error('forbidden write '+sheet);
 }};
 const c=context({
 console,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 SpreadsheetApp:{flush(){}},RFormConfig:{SHEETS:{DAILY:'DAILY',INBOX_LOG:'INBOX_LOG',TRAINING_PLAN:'TRAINING_PLAN',
 TRAINING_SETS:'TRAINING_SETS',TRAINING_SESSIONS:'TRAINING_SESSIONS',QA_LOG:'QA_LOG',DAY_CLOSURE:'DAY_CLOSURE'},
 LOCK_TIMEOUT_MS:20000,WRITE_ACTOR:'RFORM_TRAINING_MOBILE',SOURCE_CHAT:'TEST',MAX_TEXT_LENGTH:4000},
 RFormSecurityService:{assertSpreadsheetIdentity(){},assertWriteContext(){}},
 RFormSchemaService:{beginOperation(){},endOperation(){}},RFormSheetRepository:repo,
 RFormPlanService:{getSessionPlan:()=>keys.map(k=>({recordKey:k}))},
 RFormSessionService:{getById:()=>null},
 RFormDailyService:{getByDayId:normalize,revision:(v)=>hash('DAY',v)},
 RFormUtils:{revision:hash,unique:a=>[...new Set(a)],toNumberOrBlank:v=>Number(String(v).replace(',','.')),
 dateKeyFromAny:v=>v,parseDateKey:v=>v},
 RFormTests:{runSafetyBaseline:()=>({ok:!badBaseline})},RFormLoggingService:{eventId:()=> 'APP-ISSUE77'}
 });
 vm.runInContext(fs.readFileSync(path.join(root,'IncidentRecovery.gs'),'utf8'),c);
 return {state,old,api:c.RFormIncidentRecovery,sets};
}
test('functional incident repair audits before write, preserves 11 sets and replays without another write',()=>{
 const f=repairFixture();const before=f.api.preview();const sets=JSON.stringify(f.sets);
 const result=f.api.repair(before.expectedRevision,before.expectedSetsHash);
 assert.equal(result.ok,true);assert.equal(f.state.day.Morning_Weight,73.7);
 assert.equal(f.state.day.Sleep_Hours,7);assert.equal(f.state.day.Day_Status,'OPEN');
 assert.equal(f.state.day.Daily_Conclusion,'');assert.equal(f.state.audits.length,1);
 assert.equal(f.state.audits[0].Processing_Status,'APPLIED');
 assert.equal(JSON.parse(f.state.audits[0].Raw_Message).before.Morning_Weight,71.85);
 assert.equal(JSON.stringify(f.sets),sets);
 const writes=f.state.operations.length;
 assert.equal(f.api.repair(before.expectedRevision,before.expectedSetsHash).idempotentReplay,true);
 assert.equal(f.state.operations.length,writes);
});
test('functional repair rejects stale revision and failed baseline before audit/data writes',()=>{
 for(const badBaseline of [false,true]){
 const f=repairFixture({badBaseline});const p=f.api.preview();
 assert.throws(()=>f.api.repair(badBaseline?p.expectedRevision:'DAY:stale',p.expectedSetsHash),/ISSUE77_BLOCKED/);
 assert.equal(f.state.operations.length,0);assert.equal(f.state.day.Day_Status,'CLOSED');
 }
});
test('functional repair restores original authorized fields after a partial write failure and retains audit',()=>{
 const f=repairFixture({failWrite:true});const p=f.api.preview();
 assert.throws(()=>f.api.repair(p.expectedRevision,p.expectedSetsHash),/simulated partial write/);
 assert.equal(f.state.day.Morning_Weight,71.85);assert.equal(f.state.day.Day_Status,'CLOSED');
 assert.equal(f.state.day.Daily_Conclusion,f.old.Daily_Conclusion);
 assert.equal(f.state.audits.length,1);assert.equal(f.state.audits[0].Processing_Status,'ERROR');
});
