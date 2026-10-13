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
  return {ctx,ss,data,props,add,cycle:()=>ctx.rformContentApiV11Cycle_(ctx.rformContentApiV04WorkspaceContext_(ss),{nonce:'TEST'})};
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

test('owner editorial selection materializes a complete packet without bypassing final approval',()=>{
  const r=runtime(),h=r.data.DATA_EVENTS[0],row=r.data.DATA_EVENTS[1];
  row[h.indexOf('Status')]='OWNER_GATE';row[h.indexOf('Manual_Gate')]='YES';
  r.props.RFORM_AUTO_DRAFT_BASELINE='["S-TEST"]';
  assert.equal(r.cycle().created.length,0);
  const map=Object.fromEntries(h.map((f,i)=>[f,i+1]));
  const id=r.ctx.rformContentApiV04PromoteEvent_(r.ss,r.ss.getSheetByName('DATA_EVENTS'),2,map,'Full fact','Owner angle','');
  assert.equal(id,'CNT-20261011-S-TEST');
  const q=Object.fromEntries(r.data.CONTENT_QUEUE[0].map((f,i)=>[f,r.data.CONTENT_QUEUE[1][i]]));
  assert.equal(q.Current_Stage,'OWNER_FINAL_PREVIEW');assert.equal(q.AutoPost_Allowed,'NO');assert.equal(q.Approval_Status,'NOT_READY');
  assert.match(q.Telegram_Text,/Test bench/);
  assert.equal(r.ctx.rformContentApiV04PromoteEvent_(r.ss,r.ss.getSheetByName('DATA_EVENTS'),2,map,'Full fact','Owner angle',''),id);
  assert.equal(r.data.CONTENT_QUEUE.length,2);
});
test('automatic cards preserve control facts and stay within caption limit',()=>{
  const r=runtime();r.props.RFORM_AUTO_CARDS_ENABLED='YES';
  r.ctx.rformContentApiV04CardAssets_=()=>({url:'https://drive.google.com/drive/folders/TEST',count:1});
  assert.equal(r.cycle().created.length,1);
  const q=Object.fromEntries(r.data.CONTENT_QUEUE[0].map((f,i)=>[f,r.data.CONTENT_QUEUE[1][i]]));
  assert.match(q.Telegram_Text,/Техника: 9\/10/);assert.match(q.Telegram_Text,/Боль после: 0\/10/);
  assert.ok(q.Telegram_Text.length<=1024);assert.equal(q.Telegram_Post_Mode,'PHOTO_CAPTION');
  assert.equal(r.cycle().mutation_count,0);
});

function hypothesisFixture() {
  const r=runtime(),contract=r.ctx.rformHypothesisContractV01_();
  r.data.TRAINING_SESSIONS=[['Session_ID','Day_ID','Date','Session_Type','Session_Status','Completed_At','Duplicate_Flag',
    'Actual_Duration','Technique_Status','Pain_After','Session_Conclusion','Session_Goal']];
  r.data.DECISIONS=[['Decision_ID','Decision_Date','Area','New_Rule','Status','Duplicate_Flag','Effective_From','Effective_To']];
  r.add('DECISIONS',{Decision_ID:contract.decision_id,Decision_Date:'24.09.2026',Area:'TRAINING',Status:'ACTIVE',Effective_From:'25.09.2026'});
  r.add('TRAINING_SESSIONS',{Session_ID:'S-HYP-TEST',Day_ID:'D-HYP-TEST',Date:'16.10.2026',Session_Type:'C',
    Session_Status:'CLOSED',Completed_At:'16.10.2026 12:00',Actual_Duration:'65',Technique_Status:'GOOD',
    Pain_After:'Общая боль 0/10',Session_Conclusion:'Техника жима 10/10; боль после 0/10.'});
  r.data.DAY_CLOSURE=[['Closure_ID','Day_ID','Close_Readiness','Closed_At','Close_Request','Blocking_Issues','Duplicate_Count',
    'Open_QA_Count','Training_Status','Session_ID']];
  r.add('DAY_CLOSURE',{Closure_ID:'CLS-HYP-TEST',Day_ID:'D-HYP-TEST',Close_Readiness:'READY',Closed_At:'16.10.2026 20:00',
    Close_Request:'REQUESTED',Duplicate_Count:'0',Open_QA_Count:'0',Training_Status:'CLOSED',Session_ID:'S-HYP-TEST'});
  r.data.QA_LOG=[['QA_ID','Detected_At','QA_Type','Severity','Source_Sheet','Record_ID','Field_Name','Issue_Description','Current_Value',
    'Expected_Value','Owner','Status','Resolution','Resolved_At','Resolved_By']];
  r.data.TRAINING_PLAN=[['Plan_Set_ID','Session_ID','Plan_Status','Plan_ID','Duplicate_Flag']];
  r.add('TRAINING_PLAN',{Plan_Set_ID:'TPS-HYP',Session_ID:'S-HYP-TEST',Plan_Status:'ACTIVE',Plan_ID:'TP-HYP-v01'});
  r.add('DATA_EVENTS',{Event_ID:'EVT-HYP',Source:'TRAINING_SESSIONS / S-HYP-TEST',Date:'16.10.2026',Status:'AGGREGATE_TO_WEEKLY'});
  const specs=[['BARBELL_BENCH_PRESS',4,6],['BARBELL_SQUAT',3,8],['CHEST_SUPPORTED_DUMBBELL_ROW',3,12],
    ['DUMBBELL_CHEST_FLY',2,15],['DUMBBELL_REAR_DELT_FLY',2,15]];
  r.sets=specs.flatMap(([code,n,reps],group)=>Array.from({length:n},(_,i)=>({
    Set_ID:'HYP-'+group+'-'+i,Session_ID:'S-HYP-TEST',Set_Type:'WORKING',Exercise_Name_Original:code,
    Exercise_Name_Normalized:code,Exercise_Order:String(group+1),Set_Number:String(i+1),
    Load_Unit:code.includes('DUMBBELL')?'KG_PER_HAND':'KG_TOTAL',Load_Value:'10',Weight_Kg:'10',Reps:String(reps),RIR:'3',
    Record_Key:'K-'+group+'-'+i})));
  r.ctx.rformContentApiV04CardRows_=()=>r.sets;
  r.records=name=>r.data[name].slice(1).map(row=>Object.fromEntries(r.data[name][0].map((k,i)=>[k,row[i]])));
  r.run=(today='2026-10-16')=>r.ctx.rformHypothesisRunV01_(r.ctx.rformContentApiV04WorkspaceContext_(r.ss),{nonce:'TEST'},today,
    r.records('DECISIONS'),r.records('DECISION_REVIEWS'),r.records('TRAINING_SESSIONS'));
  r.set=(name,field,value)=>r.data[name][1][r.data[name][0].indexOf(field)]=value;
  return r;
}
test('hypothesis ratings preserve zero, exact labels and provenance; GOOD never becomes a number',()=>{
  const r=runtime(),parse=r.ctx.rformHypothesisRatingV01_;
  assert.equal(parse({Technique_Status:'GOOD'},'technique').value,null);
  assert.equal(parse({Technique_Status:'GOOD',Session_Conclusion:'Техника жима 10/10; 65 минут; 80×6'},'technique').value,10);
  const pain=parse({Pain_After:'Общая боль 0/10'},'pain');assert.equal(pain.value,0);
  assert.equal(pain.provenance[0].field,'Pain_After');
  assert.equal(parse({Technique_Status:'9/10',Session_Conclusion:'Техника жима 10/10'},'technique').reason,'CONFLICTING_EVIDENCE');
  for(const raw of ['боль после 11/10','боль после -1/10','боль после 9/100'])
    assert.equal(parse({Pain_After:raw},'pain').value,null,raw);
  assert.equal(parse({Session_Conclusion:'Боль до 3/10; длительность 60 мин'},'pain').value,null);
});
test('new hypothesis writes one linked review, leaves publication untouched, repeat is zero-write',()=>{
  const r=hypothesisFixture(),queue=JSON.stringify(r.data.CONTENT_QUEUE),first=r.run();
  assert.equal(first.written,1);assert.equal(first.hypothesis_state,'SUPPORTED');
  const review=r.records('DECISION_REVIEWS')[0];
  assert.equal(review.Outcome,'CONFIRMED');assert.equal(review.Next_Decision_Required,'NO');
  assert.match(review.Evidence_Source,/HYPOTHESIS_REVIEW_V1:/);assert.match(review.Evidence_Source,/TP-HYP-v01/);
  assert.equal(JSON.stringify(r.data.CONTENT_QUEUE),queue);
  const before=JSON.stringify(r.data);assert.equal(r.run().written,0);assert.equal(JSON.stringify(r.data),before);
});
test('observed failure is contradicted; missing rating is insufficient even with another failed check',()=>{
  const r=hypothesisFixture();r.sets[3].RIR='0';assert.equal(r.run().hypothesis_state,'CONTRADICTED');
  assert.equal(r.records('DECISION_REVIEWS')[0].Outcome,'PARTIAL');
  const missing=hypothesisFixture();missing.sets[3].RIR='0';missing.set('TRAINING_SESSIONS','Session_Conclusion','');
  assert.equal(missing.run().hypothesis_state,'INSUFFICIENT_DATA');
  assert.equal(missing.records('DECISION_REVIEWS')[0].Next_Decision_Required,'NO');
});
test('closure, duplicate, QA and plan gates fail closed; accessory rep ranges are evaluated',()=>{
  for(const change of [
    r=>r.set('DAY_CLOSURE','Closed_At',''),r=>r.set('DAY_CLOSURE','Open_QA_Count','1'),
    r=>r.set('TRAINING_SESSIONS','Completed_At',''),r=>r.set('TRAINING_SESSIONS','Duplicate_Flag','YES'),
    r=>r.set('TRAINING_PLAN','Plan_Status','SUPERSEDED'),
    r=>r.add('QA_LOG',{QA_ID:'QA-OTHER',Record_ID:'S-HYP-TEST',Status:'OPEN'}),
    r=>r.sets[0].Set_Number='2'
  ]) {const r=hypothesisFixture();change(r);assert.equal(r.run().hypothesis_state,'INSUFFICIENT_DATA');}
  const wrong=hypothesisFixture();wrong.sets.find(s=>s.Exercise_Name_Normalized==='DUMBBELL_CHEST_FLY').Reps='11';
  assert.equal(wrong.run().hypothesis_state,'CONTRADICTED');
});
test('historical owner review is immutable; no session in window never creates a placeholder review',()=>{
  const r=hypothesisFixture();r.set('TRAINING_SESSIONS','Date','09.10.2026');
  r.add('DECISION_REVIEWS',{Review_ID:'REV-HISTORICAL',Decision_ID:r.ctx.rformHypothesisContractV01_().decision_id,
    Outcome:'CONFIRMED',Status:'CLOSED',Actual_Result:'S-HYP-TEST',Reviewed_By:'OWNER'});
  const before=JSON.stringify(r.data);assert.equal(r.run().written,0);assert.equal(JSON.stringify(r.data),before);
  assert.equal(r.run('2026-11-11').hypothesis_state,'STALE');assert.equal(JSON.stringify(r.data),before);
  const superseded=hypothesisFixture();superseded.set('DECISIONS','Status','SUPERSEDED');
  assert.equal(superseded.run().hypothesis_state,'STALE');assert.equal(superseded.data.DECISION_REVIEWS.length,1);
});
test('conflicting ratings create one existing QA audit and unchanged repeat; corrections retain old evidence audit',()=>{
  const r=hypothesisFixture();r.set('TRAINING_SESSIONS','Technique_Status','9/10');
  const first=r.run();assert.equal(first.hypothesis_state,'INSUFFICIENT_DATA');assert.equal(first.qa_written,1);
  const before=JSON.stringify(r.data);const repeat=r.run();assert.equal(repeat.written,0);assert.equal(repeat.qa_written,0);
  assert.equal(JSON.stringify(r.data),before);
  r.set('TRAINING_SESSIONS','Technique_Status','10/10');
  assert.equal(r.run().hypothesis_state,'INSUFFICIENT_DATA');
  r.set('QA_LOG','Status','RESOLVED');
  assert.equal(r.run().written,1);assert.equal(r.records('DECISION_REVIEWS')[0].Outcome,'CONFIRMED');
  assert.ok(r.data.CONTENT_ACTION_LOG.length>=4);
});
