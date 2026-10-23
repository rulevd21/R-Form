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
 assert.equal((source.match(/RFormRecoveryPolicy.dayType\(first.sessionType\)/g)||[]).length,2);
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
