import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
const api=fs.readFileSync('automation/content_control_api_v0_4.gs','utf8');
const pure=fs.readFileSync('automation/closed_loop_v1.gs','utf8');
const adapter=fs.readFileSync('automation/closed_loop_content_api_v1_1.gs','utf8');
test('deployable Content API embeds the exact reviewed pure contracts and adapter',()=>{
  assert.ok(api.includes('// BEGIN RFORM CLOSED LOOP V1.1 (generated from automation/closed_loop_v1.gs)\n'+pure));
  assert.ok(api.endsWith(adapter));
});
function runtime() {
  const data={},props={RFORM_AUTO_DRAFT_ENABLED:'YES',RFORM_AUTO_DRAFT_BASELINE:'[]',RFORM_AUTO_CARDS_ENABLED:'NO',
    RFORM_CLOSED_LOOP_ENABLED:'YES',RFORM_CLOSED_LOOP_EVENT_FROM:'2026-10-10'};
  const literal=x=>String(x ?? '').replace(/^'/,'');
  function sheet(name) {
    const values=data[name];
    if(!values)return null;
    return {getName:()=>name,getLastRow:()=>values.length,getLastColumn:()=>values[0].length,
      getDataRange:()=>({getDisplayValues:()=>values.map(r=>r.map(String))}),
      appendRow:r=>{values.push(r.map(literal));},
      getRange:(r,c,n=1,m=1)=>({getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(values[r+i-1]?.[c+j-1] ?? ''))),
        getDisplayValue:()=>String(values[r-1]?.[c-1] ?? ''),
        setValue:v=>{while(values.length<r)values.push([]);values[r-1][c-1]=literal(v);}})
    };
  }
  const ss={getSheetByName:sheet};
  const ctx={console:{log(){}},Utilities:{DigestAlgorithm:{SHA_256:'SHA256'},Charset:{UTF_8:'utf8'},
    computeDigest:(_a,s)=>Array.from(crypto.createHash('sha256').update(s).digest()).map(n=>n>127?n-256:n),
    formatDate:(_d,_tz,f)=>f==='yyyy-MM-dd'?'2026-10-11':'11.10.2026 16:00:00'},
    SpreadsheetApp:{flush(){},openById:()=>ss},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k] || null,setProperty:(k,v)=>props[k]=v})}};
  vm.createContext(ctx);vm.runInContext(api,ctx);
  const cfg=vm.runInContext('RFORM_CONTENT_API_V04',ctx);
  const qh=Array.from(new Set([...cfg.queueFields,...cfg.proposalFields,'Editorial_Trigger','Target_Segment','Audience_Problem','Success_Metric']));
  const headers={CONTENT_QUEUE:qh,CONTENT_ACTION_LOG:Array.from(cfg.actionLogHeaders),DATA_EVENTS:Array.from(cfg.eventFields),
    TRAINING_SESSIONS:[...cfg.trainingSessionFields,'Completed_At','Duplicate_Flag'],TRAINING_SETS:[],
    CONTENT_REGISTRY:['Content_ID','Hypothesis_ID','Publication_Date','Notes'],
    CONTENT_EXPERIMENTS:['Hypothesis_ID','Primary_Metric','Start_Date','End_Date','Status','Result','Decision'],
    DECISIONS:['Decision_ID','Decision_Date','Area','New_Rule','Status','Duplicate_Flag'],
    DECISION_REVIEWS:['Review_ID','Decision_ID','Area','Decision_Date','Review_Date','Evidence_Period','Expected_Result','Metric','Target','Actual_Result','Outcome','Next_Action','Next_Decision_Required','Status','Evidence_Source','Reviewed_By','Created_At','Updated_At']};
  Object.entries(headers).forEach(([k,h])=>data[k]=[h]);
  function add(name,record) {data[name].push(data[name][0].map(h=>String(record[h] ?? '')));}
  const sets=[1,2].map(i=>({Set_ID:'SET-'+i,Session_ID:'S-TEST',Set_Type:'WORKING',Exercise_Name_Original:'Test bench',
    Exercise_Name_Normalized:'BARBELL_BENCH_PRESS',Exercise_Order:'1',Set_Number:String(i),Load_Unit:'KG_TOTAL',Load_Value:'50',Weight_Kg:'50',Reps:'6',RIR:'3'}));
  ctx.rformContentApiV04CardRows_=()=>sets;
  add('TRAINING_SESSIONS',{Session_ID:'S-TEST',Date:'11.10.2026',Session_Type:'C',Session_Status:'CLOSED',
    Completed_At:'11.10.2026 15:00:00',Main_Result:'Test bench: 50×6×2 RIR3',Actual_Duration:'20',Technique_Status:'9/10',Pain_After:'0/10'});
  add('DATA_EVENTS',{Event_ID:'EVT-TEST',Date:'11.10.2026',Source:'TRAINING_SESSIONS / S-TEST',Status:'DATA_READY',
    Editorial_Trigger:'CONTROL_POINT',Manual_Gate:'NO',Content_Value_Score:'89'});
  add('DATA_EVENTS',{Event_ID:'EVT-NO-POST',Date:'11.10.2026',Source:'DAILY + DAY_CLOSURE / D-TEST',Status:'AGGREGATE_ONLY',Editorial_Trigger:'FACT_CLOSED'});
  add('DECISIONS',{Decision_ID:'DEC-TEST',Status:'ACTIVE',Area:'TEST',New_Rule:'Unstructured target'});
  add('CONTENT_EXPERIMENTS',{Hypothesis_ID:'H02',Primary_Metric:'Saves / Views',Start_Date:'08.08.2026',End_Date:'05.09.2026',Status:'ACTIVE'});
  return {ctx,data,props,add,cycle:()=>ctx.rformContentApiV11Cycle_(ctx.rformContentApiV04WorkspaceContext_(ss),{nonce:'TEST'})};
}
test('closed fact flows through selection, complete packet and QA exactly once; owner gates remain closed',()=>{
  const r=runtime(),first=r.cycle();
  assert.equal(first.created.length,1);assert.equal(first.no_post_written,1);
  const q=Object.fromEntries(r.data.CONTENT_QUEUE[0].map((h,i)=>[h,r.data.CONTENT_QUEUE[1][i]]));
  assert.equal(q.Current_Stage,'OWNER_FINAL_PREVIEW');assert.equal(q.Approval_Status,'NOT_READY');
  assert.equal(q.AutoPost_Allowed,'NO');assert.equal(q.Publication_Status,'PLANNED');assert.equal(q.Preview_Review_Status,'NOT_REVIEWED');
  assert.match(q.Telegram_Text,/Test bench/);assert.match(q.Proof_Source,/packet_hash:[a-f0-9]{64}/);
  const review=Object.fromEntries(r.data.DECISION_REVIEWS[0].map((h,i)=>[h,r.data.DECISION_REVIEWS[1][i]]));
  assert.equal(review.Outcome,'INSUFFICIENT_DATA');assert.equal(review.Next_Decision_Required,'NO');
  const before=JSON.stringify(r.data);
  assert.equal(r.cycle().mutation_count,0);assert.equal(JSON.stringify(r.data),before);
});
test('open fact, manual gate and absent event cannot materialize owner preview',()=>{
  for(const state of ['OPEN','OWNER_GATE','WAIT_EVENT']) {
    const r=runtime();
    if(state==='OPEN')r.data.TRAINING_SESSIONS[1][r.data.TRAINING_SESSIONS[0].indexOf('Session_Status')]='OPEN';
    if(state==='OWNER_GATE')r.data.DATA_EVENTS[1][r.data.DATA_EVENTS[0].indexOf('Status')]='OWNER_GATE';
    if(state==='WAIT_EVENT')r.data.DATA_EVENTS.splice(1,1);
    assert.equal(r.cycle().created.length,0);assert.equal(r.data.CONTENT_QUEUE.length,1);
  }
});
test('incomplete set packet fails QA before a queue write',()=>{
  const r=runtime();r.ctx.rformContentApiV04CardRows_=()=>[];
  const result=r.cycle();assert.equal(result.created.length,0);assert.equal(r.data.CONTENT_QUEUE.length,1);
  assert.equal(result.blocked[0].code,'FACT_PACKET_NOT_READY');
});
