
// R/Form Closed Loop v1.1 adapter. Runs under the existing Content API lock
// and the existing Owner Bot poll; no new trigger, sender or datastore.
function rformContentApiV11Rows_(ss,name,id) {
  const sheet=rformContentApiV04RequireSheet_(ss,name);
  return rformContentApiV04ReadRows_(sheet,rformContentApiV04Headers_(sheet),id);
}
function rformContentApiV11Iso_(value) {
  const s=String(value || ''),m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return m?m[3]+'-'+m[2]+'-'+m[1]:/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):'';
}
function rformContentApiV11TrainingPacket_(s,p,event) {
  const exercises=p.exercises.map(function(g) {
    return g.name+': '+g.sets.map(function(t){return t.weight+'×'+t.reps+' (RIR '+t.rir+')';}).join('; ')+'.';
  });
  return rformClosedLoopBuildTrainingContentPacketV1({
    content_id:rformContentApiV04PublicationId_(s.Session_ID,s.Date),session_id:s.Session_ID,session_status:s.Session_Status,date:s.Date,
    exercises:exercises,set_count:p.count,duration_min:s.Actual_Duration,bench_tonnage_kg:p.bench,total_tonnage_kg:p.total,
    technique:s.Technique_Status,pain_after:s.Pain_After,editorial_trigger:event.Editorial_Trigger,
    audience_problem:'Как оценить выполненную нагрузку, запас повторов и восстановление перед следующим шагом?',
    reader_value:'Полный факт тренировки: все упражнения и рабочие подходы, тоннаж и доступные показатели контроля.',
    success_metric:'Observed 24H/72H/7D Views, Reactions, Comments, Shares; missing metrics remain unavailable.',
    next_step_rule:'Следующий план меняется только через действующий progression gate и отдельное решение владельца.'
  });
}
function rformContentApiV11Record_(c,key,action,target,idField,item,request) {
  const actionId=rformContentApiV04Sha256Hex_('CLOSED_LOOP_V11\n'+key+'\n'+JSON.stringify(item)).slice(0,32);
  const prior=rformContentApiV04WorkspaceRecords_(c).find(function(r){return r.Action_ID===actionId;});
  if(prior) {
    if(prior.Result!=='APPLIED') throw new Error('CLOSED_LOOP_PRIOR_OUTCOME_UNKNOWN');
    if(target) {
      const sheet=rformContentApiV04RequireSheet_(c.ss,target),map=rformContentApiV04HeaderMap_(rformContentApiV04Headers_(sheet));
      const row=rformContentApiV04FindUniqueRow_(sheet,idField,item[idField]);
      const values=sheet.getRange(row,1,1,sheet.getLastColumn()).getDisplayValues()[0];
      Object.keys(item).forEach(function(f){if(String(values[map[f]-1] || '')!==String(item[f])) throw new Error('CLOSED_LOOP_CANONICAL_DRIFT');});
    }
    return false;
  }
  let sheet,map,row,before={},created=false;
  if(target) {
    sheet=rformContentApiV04RequireSheet_(c.ss,target);map=rformContentApiV04HeaderMap_(rformContentApiV04Headers_(sheet));
    Object.keys(item).forEach(function(f){if(!map[f])throw new Error('CLOSED_LOOP_MISSING_FIELD:'+f);});
    row=rformContentApiV04FindOptionalRow_(sheet,idField,item[idField]);
    if(row) {
      const current=sheet.getRange(row,1,1,sheet.getLastColumn()).getDisplayValues()[0];
      Object.keys(item).forEach(function(f){before[f]=String(current[map[f]-1] || '');});
      if(Object.keys(item).every(function(f){return before[f]===String(item[f]);})) return false;
    }
  }
  c.records=null;c.log.appendRow([actionId,new Date(),key,action,'CLOSED_LOOP_V11',Object.keys(item).join(','),
    JSON.stringify(before),JSON.stringify(item),'CLOSED_LOOP_WORKER',request.nonce || '','PENDING']);
  const lr=c.log.getLastRow();SpreadsheetApp.flush();
  try {
    if(target) {
      if(!row) {
        const values=new Array(sheet.getLastColumn()).fill('');
        Object.keys(item).forEach(function(f){values[map[f]-1]="'"+String(item[f]);});
        sheet.appendRow(values);row=rformContentApiV04FindUniqueRow_(sheet,idField,item[idField]);created=true;
      } else Object.keys(item).forEach(function(f){sheet.getRange(row,map[f]).setValue("'"+String(item[f]));});
      SpreadsheetApp.flush();
      const read=sheet.getRange(row,1,1,sheet.getLastColumn()).getDisplayValues()[0];
      Object.keys(item).forEach(function(f){if(String(read[map[f]-1] || '')!==String(item[f]))throw new Error('CLOSED_LOOP_READBACK_FAILED');});
    }
    c.log.getRange(lr,c.lm.Result).setValue('APPLIED');c.records=null;SpreadsheetApp.flush();
    if(c.log.getRange(lr,c.lm.Result).getDisplayValue()!=='APPLIED')throw new Error('CLOSED_LOOP_AUDIT_FAILED');
    return true;
  } catch(error) {
    // A partially appended row remains discoverable and blocks duplication.
    // Existing rows are restored before an explicit failed receipt is written.
    try {
      if(target && row && !created) Object.keys(before).forEach(function(f){sheet.getRange(row,map[f]).setValue("'"+before[f]);});
      SpreadsheetApp.flush();
      c.log.getRange(lr,c.lm.Result).setValue(created?'OUTCOME_UNKNOWN':'FAILED_ROLLED_BACK');c.records=null;
    } catch(_) {try{c.log.getRange(lr,c.lm.Result).setValue('OUTCOME_UNKNOWN');}catch(__){}}
    throw error;
  }
}
function rformContentApiV11Experiments_(c,request,today) {
  const registry=rformContentApiV11Rows_(c.ss,'CONTENT_REGISTRY','Content_ID'),experiments=rformContentApiV11Rows_(c.ss,'CONTENT_EXPERIMENTS','Hypothesis_ID');
  const rows=registry.map(function(r) {
    let evidence={};
    // Explicit per-metric provenance/group/pair data goes in the existing Notes
    // field as a standalone JSON line. Generic Views_72H provenance is insufficient.
    const line=String(r.Notes || '').split('\n').find(function(x){return x.indexOf('EXPERIMENT_EVIDENCE_V1:')===0;});
    if(line) {try{evidence=JSON.parse(line.slice('EXPERIMENT_EVIDENCE_V1:'.length));}catch(_){}}
    return {content_id:r.Content_ID,hypothesis_id:r.Hypothesis_ID,publication_date_iso:rformContentApiV11Iso_(r.Publication_Date),
      group:evidence.group,comparison_key:evidence.comparison_key,period_id:evidence.period_id,metrics:evidence.metrics};
  });
  let written=0;const results=[];
  experiments.filter(function(e){return ['ACTIVE','REVIEW_REQUIRED','READY_FOR_REVIEW'].indexOf(e.Status)!==-1;}).forEach(function(e) {
    let contract={};
    const contractLine=String(e.Notes || '').split('\n').find(function(x){return x.indexOf('EXPERIMENT_CONTRACT_V1:')===0;});
    if(contractLine){try{contract=JSON.parse(contractLine.slice('EXPERIMENT_CONTRACT_V1:'.length));}catch(_){}}
    const result=rformClosedLoopEvaluateExperimentV1({hypothesis_id:e.Hypothesis_ID,primary_metric:e.Primary_Metric,
      control_start_date_iso:contract.control_start_date_iso,control_end_date_iso:contract.control_end_date_iso,
      start_date_iso:rformContentApiV11Iso_(e.Start_Date),end_date_iso:rformContentApiV11Iso_(e.End_Date),status:e.Status},rows,today);
    const item={Hypothesis_ID:e.Hypothesis_ID,Status:result.status,
      Result:result.result+': '+JSON.stringify(result),Decision:result.decision};
    if(rformContentApiV11Record_(c,'EXP-'+e.Hypothesis_ID,'AUTO_EXPERIMENT_REVIEW','CONTENT_EXPERIMENTS','Hypothesis_ID',item,request))written++;
    results.push(result);
  });
  return {written:written,results:results};
}
function rformContentApiV11DecisionReviews_(c,request,today) {
  const decisions=rformContentApiV11Rows_(c.ss,'DECISIONS','Decision_ID'),reviews=rformContentApiV11Rows_(c.ss,'DECISION_REVIEWS','Review_ID'),
    sessions=rformContentApiV11Rows_(c.ss,'TRAINING_SESSIONS','Session_ID');
  const hypothesis=rformHypothesisRunV01_(c,request,today,decisions,reviews,sessions);
  let written=hypothesis.written;
  decisions.filter(function(d){return d.Status==='ACTIVE' && !d.Duplicate_Flag && d.Decision_ID!==rformHypothesisContractV01_().decision_id;}).forEach(function(d) {
    const accepted=sessions.filter(function(s){return s.Session_Status==='CLOSED' && s.Completed_At && !s.Duplicate_Flag &&
      s.Session_Type==='C' && rformContentApiV11Iso_(s.Date)>=rformContentApiV11Iso_(d.Effective_From);})
      .sort(function(a,b){return rformContentApiV11Iso_(b.Date).localeCompare(rformContentApiV11Iso_(a.Date));});
    const session=d.Decision_ID==='DEC-20260924-TRAINING-C-VOLUME-BENCH'?accepted[0]:null;
    // Preserve accepted manual reviews; do not reinterpret historical evidence.
    if(reviews.some(function(r){return r.Decision_ID===d.Decision_ID && r.Status==='CLOSED' && session && String(r.Actual_Result || '').indexOf(session.Session_ID)!==-1;}))return;
    let checks=[],evidence='',actual='No structured, source-backed evaluation contract or sufficient observations.';
    if(session) {
      try {
        const sets=rformContentApiV04CardRows_(c.ss,session.Session_ID),p=rformContentApiV04CardPacket_(session,sets);
        const bench=p.exercises.filter(function(g){return /BENCH_PRESS/.test(g.code);});
        const last=bench.length===1?bench[0].sets[bench[0].sets.length-1]:null;
        const val=function(raw){const m=String(raw || '').match(/^\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*10)?\s*$/);return m?Number(m[1].replace(',','.')):null;};
        const rir=last?val(last.rir):null,tech=val(session.Technique_Status),pain=val(session.Pain_After);
        const structure=p.exercises.length===5 && bench.length===1 && bench[0].sets.length===4 &&
          bench[0].sets.every(function(t){return t.reps>=6 && t.reps<=8;}) &&
          p.exercises.some(function(g){return /SQUAT/.test(g.code);}) &&
          p.exercises.some(function(g){return g.code==='CHEST_SUPPORTED_DUMBBELL_ROW' && g.sets.length===3;}) &&
          p.exercises.some(function(g){return g.code==='DUMBBELL_CHEST_FLY' && g.sets.length===2;}) &&
          p.exercises.some(function(g){return g.code==='DUMBBELL_REAR_DELT_FLY' && g.sets.length===2;});
        checks=[{metric:'C structure',target:'C Volume Bench',actual:String(structure),passed:structure},
          {metric:'last bench RIR',target:'>=2',actual:rir,passed:rir===null?null:rir>=2},
          {metric:'technique',target:'>=8/10',actual:tech,passed:tech===null?null:tech>=8},
          {metric:'pain',target:'<=1/10',actual:pain,passed:pain===null?null:pain<=1}];
        evidence='TRAINING_SESSIONS / '+session.Session_ID+' / TRAINING_SETS / '+p.sets_hash;
        actual=session.Session_ID+': '+JSON.stringify(checks);
      } catch(_) {checks=[];actual='Training fact packet is incomplete; no outcome inferred.';}
    }
    const review=rformClosedLoopBuildDecisionReviewV1({decision_id:d.Decision_ID,checks:checks,next_decision_required:true,evidence_source:evidence});
    const id='REV-AUTO-'+d.Decision_ID+(session?'-'+session.Session_ID:'');
    const prior=reviews.find(function(r){return r.Review_ID===id;});
    if(prior && prior.Status==='OWNER_RESOLVED')return;
    const item={Review_ID:id,Decision_ID:d.Decision_ID,Area:d.Area,Decision_Date:d.Decision_Date,
      Review_Date:prior?prior.Review_Date:today,Evidence_Period:session?session.Date:'',Expected_Result:d.New_Rule,
      Metric:checks.map(function(x){return x.metric;}).join('; ') || 'STRUCTURED_CONTRACT_REQUIRED',
      Target:checks.map(function(x){return x.target;}).join('; ') || 'Explicit decision-specific metric, target and observation window required',
      Actual_Result:actual,Outcome:review.outcome,Next_Action:review.outcome==='CONFIRMED'?'Retain the accepted rule.':review.next_action || 'Review the observed result before changing the plan.',
      Next_Decision_Required:review.outcome==='CONFIRMED'?'NO':review.next_decision_required,Status:review.status,
      Evidence_Source:evidence,Reviewed_By:'CLOSED_LOOP_WORKER',Created_At:prior?prior.Created_At:today,Updated_At:prior?prior.Updated_At:today};
    if(rformContentApiV11Record_(c,id,'AUTO_DECISION_REVIEW','DECISION_REVIEWS','Review_ID',item,request))written++;
  });
  return {written:written,hypothesis: hypothesis};
}
function rformContentApiV11Cycle_(c,request) {
  const props=PropertiesService.getScriptProperties(),cutoff=props.getProperty('RFORM_CLOSED_LOOP_EVENT_FROM');
  if(props.getProperty('RFORM_CLOSED_LOOP_ENABLED')!=='YES')return {ok:true,status:'DISABLED',created:[],blocked:[]};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(cutoff || '')))throw new Error('CLOSED_LOOP_BASELINE_REQUIRED');
  const report={ok:true,status:'APPLIED',version:'1.1.0',created:[],blocked:[],no_post_written:0,decision_reviews_written:0,experiments_written:0};
  const events=rformContentApiV11Rows_(c.ss,'DATA_EVENTS','Event_ID');
  events.filter(function(e){return rformContentApiV11Iso_(e.Date)>=cutoff;}).forEach(function(e) {
    const selection=rformClosedLoopEditorialV11(e);
    if(selection.outcome==='NO_POST' && rformContentApiV11Record_(c,e.Event_ID,'AUTO_EDITORIAL_NO_POST',null,null,
      {event_id:e.Event_ID,outcome:'NO_POST',reason:selection.reason,source:e.Source},request))report.no_post_written++;
  });
  const drafts=rformContentApiV04TrainingDrafts_(c,request);
  report.created=drafts.created || [];report.blocked=drafts.blocked || [];
  const today=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd');
  const decisionResult=rformContentApiV11DecisionReviews_(c,request,today);
  report.decision_reviews_written=decisionResult.written;
  report.hypothesis_review=decisionResult.hypothesis;
  report.hypothesis_qa_written=decisionResult.hypothesis.qa_written;
  report.experiments_written=rformContentApiV11Experiments_(c,request,today).written;
  report.mutation_count=report.created.length+report.no_post_written+report.decision_reviews_written+report.experiments_written+report.hypothesis_qa_written;
  console.log(JSON.stringify({event:'RFORM_CLOSED_LOOP_CYCLE',report:report}));
  return report;
}
function rformContentApiV11EnableClosedLoop() {
  const props=PropertiesService.getScriptProperties(),c=rformContentApiV04WorkspaceContext_();
  ['DATA_EVENTS','CONTENT_REGISTRY','CONTENT_EXPERIMENTS','DECISIONS','DECISION_REVIEWS'].forEach(function(name){rformContentApiV04RequireSheet_(c.ss,name);});
  if(props.getProperty('RFORM_AUTO_DRAFT_ENABLED')!=='YES' || !props.getProperty('RFORM_AUTO_DRAFT_BASELINE'))
    throw new Error('Existing training draft worker/baseline must already be enabled.');
  if(!props.getProperty('RFORM_TG_CHAT_ID')) {
    const ids=Array.from(new Set(rformContentApiV04WorkspaceRecords_(c).filter(function(r){return r.Action==='CHANNEL_POST' && r.Result==='APPLIED';})
      .map(function(r){try{return String(JSON.parse(r.New_Values)._meta.channel_id || '');}catch(_){return '';}})
      .filter(function(id){return /^-100\d+$/.test(id);})));
    if(ids.length!==1)throw new Error('Existing channel property migration requires one canonical channel identity.');
    props.setProperty('RFORM_TG_CHAT_ID',ids[0]);
  }
  if(!props.getProperty('RFORM_CLOSED_LOOP_EVENT_FROM'))props.setProperty('RFORM_CLOSED_LOOP_EVENT_FROM','2026-10-10');
  props.setProperty('RFORM_CLOSED_LOOP_ENABLED','YES');
  console.log(JSON.stringify({version:'1.1.0',enabled:true,new_trigger:false,owner_approval_required:true}));
}
function rformContentApiV11RunClosedLoop() {
  return rformContentApiV04Workspace_({action_id:Utilities.getUuid().replace(/-/g,''),nonce:'OWNER_RUNTIME_ACCEPTANCE',payload:{action:'sync_training'}});
}
function rformContentApiV11DisableClosedLoop() {
  PropertiesService.getScriptProperties().setProperty('RFORM_CLOSED_LOOP_ENABLED','NO');
}

function rformContentApiV11Caption_(session,cardPacket) {
  const control=[];
  if(session.Technique_Status)control.push('Техника: '+session.Technique_Status+'.');
  if(session.Pain_After)control.push('Боль после: '+session.Pain_After+'.');
  const text=rformContentApiV04CardCaption_(cardPacket).replace('\n\n#RForm_Training',
    '\n\n'+control.join(' ')+'\nСледующий шаг — только через действующий gate и отдельное решение владельца.\n\n#RForm_Training');
  if(text.length>1024)throw new Error('CLOSED_LOOP:CAPTION_QA_FAILED');
  return text;
}
function rformContentApiV11PromoteTraining_(ss,approvedEvent) {
  const sessionId=String(approvedEvent.Source || '').split(' / ').pop();
  const c=rformContentApiV04WorkspaceContext_(ss);
  const result=rformContentApiV04TrainingDrafts_(c,{nonce:'OWNER_EDITORIAL_PUBLICATION'},approvedEvent);
  const rows=rformContentApiV11Rows_(ss,'CONTENT_QUEUE','Content_ID').filter(function(q){return q.Session_ID===sessionId;});
  if(rows.length!==1 || (result.blocked || []).length)throw new Error('CLOSED_LOOP:OWNER_SELECTED_PACKET_NOT_READY');
  return rows[0].Content_ID;
}

// Hypothesis contract adapter 0.1.0; all writes use the existing workspace lock/audit.
function rformHypothesisContractV01_() {
  return {schema:'HYPOTHESIS_REVIEW_V1',hypothesis_id:'HYP-TRAINING-C-VOLUME-GATES-001',
    contract_version:'0.1.0',decision_id:'DEC-20260924-TRAINING-C-VOLUME-BENCH',
    window_start:'2026-10-14',window_end:'2026-11-10',timezone:'Europe/Moscow',minimum_sample:1};
}
function rformHypothesisRatingV01_(session,kind) {
  const fields=kind==='technique'?['Technique_Status','Session_Conclusion']:['Pain_After','Session_Conclusion'];
  const observations=[],invalid=[];
  fields.forEach(function(field,index) {
    const raw=String(session[field] == null?'':session[field]).trim();
    if(!raw)return;
    const scalar=index===0 && raw.match(/^([+-]?\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?$/);
    const pattern=kind==='technique'?/техника(?:\s+жима)?\s*[:—]?\s*([+-]?\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?(?![\d.,/a-zа-я])/gi:
      /(?:общая\s+боль|боль\s+после(?:\s+тренировки)?|(?:плечо|локоть|другая\s+боль))\s*[:—]?\s*([+-]?\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?(?![\d.,/a-zа-я])/gi;
    let matches=scalar?[scalar]:Array.from(raw.matchAll(pattern));
    // "Боль после" may label the whole primary field; never parse unrelated numbers in a conclusion.
    if(kind==='pain' && index===0 && !matches.length)matches=Array.from(raw.matchAll(/боль\s*[:—]?\s*([+-]?\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?(?![\d.,/a-zа-я])/gi));
    const values=matches.map(function(m){return Number(m[1].replace(',','.'));});
    if(matches.some(function(m){return m[2] && m[2]!=='10';}) || values.some(function(v){return !Number.isFinite(v)||v<0||v>10;})){invalid.push(field);return;}
    if(values.length) {
      const value=kind==='pain'?Math.max.apply(null,values):values[0];
      if(kind==='technique' && values.some(function(v){return v!==value;}))invalid.push(field);
      observations.push({source:'TRAINING_SESSIONS',field:field,raw:raw,value:value});
    }
  });
  const conflict=invalid.length>0 || observations.some(function(o){return o.value!==observations[0].value;});
  return {value:conflict || !observations.length?null:observations[0].value,
    reason:conflict?'CONFLICTING_EVIDENCE':!observations.length?'MISSING_RATING':'',
    provenance:observations,invalid_fields:invalid};
}
function rformHypothesisEvaluateV01_(decision,session,packet,eligibility,today) {
  const contract=rformHypothesisContractV01_(),checks=[],gaps=(eligibility || []).slice();
  const result={contract:contract,session_id:session?session.Session_ID:'',checks:checks,gaps:gaps,
    hypothesis_state:'INSUFFICIENT_DATA',reason:'AWAITING_NEW_ELIGIBLE_SESSION'};
  if(!decision || decision.Status!=='ACTIVE' || decision.Duplicate_Flag) {
    result.hypothesis_state='STALE';result.reason='DECISION_NOT_ACTIVE';return result;
  }
  if(!session) {
    if(today>contract.window_end){result.hypothesis_state='STALE';result.reason='REVIEW_WINDOW_EXPIRED';}
    return result;
  }
  const date=rformContentApiV11Iso_(session.Date);
  if(!date || date<contract.window_start || date>contract.window_end || date>today ||
    (decision.Effective_From && date<rformContentApiV11Iso_(decision.Effective_From)) ||
    (decision.Effective_To && date>rformContentApiV11Iso_(decision.Effective_To)))gaps.push('OUTSIDE_EFFECTIVE_WINDOW');
  if(session.Session_Status!=='CLOSED'||!session.Completed_At||session.Session_Type!=='C'||session.Duplicate_Flag)gaps.push('SESSION_NOT_ACCEPTED');
  if(packet) {
    const groups=packet.exercises || [],bench=groups.filter(function(g){return g.code==='BARBELL_BENCH_PRESS';});
    const group=function(code,n,min,max){const xs=groups.filter(function(g){return g.code===code;});
      return xs.length===1 && xs[0].sets.length===n && xs[0].sets.every(function(s){return s.reps>=min && s.reps<=max;});};
    const structure=groups.length===5 && group('BARBELL_BENCH_PRESS',4,6,8) &&
      groups.filter(function(g){return g.code==='BARBELL_SQUAT';}).length===1 &&
      group('CHEST_SUPPORTED_DUMBBELL_ROW',3,10,12) && group('DUMBBELL_CHEST_FLY',2,12,15) &&
      group('DUMBBELL_REAR_DELT_FLY',2,12,15);
    let rir=null;
    if(bench.length===1 && bench[0].sets.length) {
      const numbers=bench[0].sets.map(function(s){return Number(s.number);});
      if(numbers.some(function(n){return !Number.isInteger(n)||n<=0;}) || new Set(numbers).size!==numbers.length)gaps.push('AMBIGUOUS_SET_ORDER');
      else {
        const last=bench[0].sets.slice().sort(function(a,b){return a.number-b.number;}).pop(),raw=String(last.rir == null?'':last.rir);
        if(/^\d+(?:[.,]\d+)?$/.test(raw) && Number(raw.replace(',','.'))<=20)rir=Number(raw.replace(',','.'));
      }
    }
    checks.push({metric:'C structure',target:'C Volume Bench',actual:String(structure),passed:structure});
    checks.push({metric:'last bench RIR',target:'>=2',actual:rir,passed:rir===null?null:rir>=2});
  } else gaps.push('FACT_PACKET_INCOMPLETE');
  const tech=rformHypothesisRatingV01_(session,'technique'),pain=rformHypothesisRatingV01_(session,'pain');
  [tech,pain].forEach(function(x){if(x.reason)gaps.push(x.reason);});
  checks.push({metric:'technique',target:'>=8/10',actual:tech.value,passed:tech.value===null?null:tech.value>=8});
  checks.push({metric:'pain',target:'<=1/10',actual:pain.value,passed:pain.value===null?null:pain.value<=1});
  result.provenance={technique:tech,pain:pain};
  const review=rformClosedLoopBuildDecisionReviewV1({decision_id:decision.Decision_ID,checks:checks,next_decision_required:true});
  result.outcome=gaps.length?'INSUFFICIENT_DATA':review.outcome;
  result.hypothesis_state=result.outcome==='CONFIRMED'?'SUPPORTED':
    result.outcome==='INSUFFICIENT_DATA'?'INSUFFICIENT_DATA':'CONTRADICTED';
  result.reason=result.hypothesis_state==='SUPPORTED'?'ALL_GATES_PASS':result.hypothesis_state==='CONTRADICTED'?'OBSERVED_GATE_FAILURE':
    gaps.length?Array.from(new Set(gaps)).join(','):'MISSING_CHECK';
  return result;
}
function rformHypothesisRunV01_(c,request,today,decisions,reviews,sessions) {
  const contract=rformHypothesisContractV01_(),decision=decisions.find(function(d){return d.Decision_ID===contract.decision_id;});
  if(decisions.filter(function(d){return d.Decision_ID===contract.decision_id;}).length>1)throw new Error('HYPOTHESIS_DUPLICATE_DECISION');
  const report={contract_version:contract.contract_version,hypothesis_id:contract.hypothesis_id,written:0,qa_written:0,
    hypothesis_state:decision && decision.Status==='ACTIVE'?'INSUFFICIENT_DATA':'STALE',reason:'AWAITING_NEW_ELIGIBLE_SESSION',reviews:[]};
  if(!decision || decision.Status!=='ACTIVE' || decision.Duplicate_Flag){report.reason='DECISION_NOT_ACTIVE';return report;}
  const candidates=sessions.filter(function(s){const date=rformContentApiV11Iso_(s.Date);
    return s.Session_Type==='C' && date>=contract.window_start && date<=contract.window_end && date<=today;})
    .sort(function(a,b){return rformContentApiV11Iso_(a.Date).localeCompare(rformContentApiV11Iso_(b.Date)) || String(a.Session_ID).localeCompare(String(b.Session_ID));});
  if(!candidates.length){if(today>contract.window_end){report.hypothesis_state='STALE';report.reason='REVIEW_WINDOW_EXPIRED';}return report;}
  const closures=rformContentApiV11Rows_(c.ss,'DAY_CLOSURE','Closure_ID'),qa=rformContentApiV11Rows_(c.ss,'QA_LOG','QA_ID'),
    events=rformContentApiV11Rows_(c.ss,'DATA_EVENTS','Event_ID'),plans=rformContentApiV11Rows_(c.ss,'TRAINING_PLAN','Plan_Set_ID');
  candidates.forEach(function(session) {
    const id='REV-AUTO-'+decision.Decision_ID+'-'+session.Session_ID;
    const existing=reviews.filter(function(r){return r.Decision_ID===decision.Decision_ID && (r.Review_ID===id ||
      (r.Status==='CLOSED' && String(r.Actual_Result || '').indexOf(session.Session_ID)!==-1));});
    if(existing.some(function(r){return r.Reviewed_By!=='CLOSED_LOOP_WORKER' || r.Status==='OWNER_RESOLVED';}))return;
    const prior=reviews.find(function(r){return r.Review_ID===id;}),gaps=[];
    const closureRows=closures.filter(function(x){return x.Day_ID===session.Day_ID;});
    const closure=closureRows.length===1?closureRows[0]:null;
    if(!closure || closure.Close_Readiness!=='READY' || !closure.Closed_At || closure.Close_Request!=='REQUESTED' ||
      closure.Blocking_Issues || String(closure.Duplicate_Count)!=='0' || String(closure.Open_QA_Count)!=='0' ||
      closure.Training_Status!=='CLOSED' || closure.Session_ID!==session.Session_ID)gaps.push('DAY_CLOSURE_NOT_ACCEPTED');
    if(!events.some(function(e){return e.Entity===session.Session_ID || e.Source==='TRAINING_SESSIONS / '+session.Session_ID;}))gaps.push('ACCEPTED_EVENT_REQUIRED');
    const planRows=plans.filter(function(p){return p.Session_ID===session.Session_ID && p.Plan_Status==='ACTIVE';});
    const planIds=Array.from(new Set(planRows.map(function(p){return p.Plan_ID;}).filter(Boolean)));
    if(planIds.length!==1 || planRows.some(function(p){return p.Duplicate_Flag;}))gaps.push('PLAN_CONTEXT_REQUIRED');
    const currentConflict=[rformHypothesisRatingV01_(session,'technique'),rformHypothesisRatingV01_(session,'pain')].some(function(x){return x.reason==='CONFLICTING_EVIDENCE';});
    const relatedQa=qa.filter(function(q){return !(currentConflict && String(q.QA_ID || '').startsWith('QA-HYPOTHESIS-')) && !['RESOLVED','CLOSED','DISMISSED'].includes(q.Status) &&
      [session.Session_ID,session.Day_ID,decision.Decision_ID].some(function(k){return k && String(q.Record_ID || '').includes(k);});});
    if(relatedQa.length)gaps.push('OPEN_QA');
    if(sessions.filter(function(s){return s.Session_ID===session.Session_ID;}).length!==1)gaps.push('DUPLICATE_SESSION');
    let packet=null,sets=[];
    try {sets=rformContentApiV04CardRows_(c.ss,session.Session_ID);packet=rformContentApiV04CardPacket_(session,sets);}
    catch(_){gaps.push('FACT_PACKET_INCOMPLETE');}
    const evaluated=rformHypothesisEvaluateV01_(decision,session,packet,gaps,today);
    const evidenceHash=rformContentApiV04Sha256Hex_(rformClosedLoopStableStringify_({
      contract:contract,decision:decision,session:session,sets_hash:packet?packet.sets_hash:'',
      closure:closure,plan_rows:planRows,related_qa:relatedQa,event_ids:events.filter(function(e){return e.Entity===session.Session_ID || e.Source==='TRAINING_SESSIONS / '+session.Session_ID;}).map(function(e){return e.Event_ID;}).sort()}));
    const meta=Object.assign({},contract,{hypothesis_state:evaluated.hypothesis_state,reason:evaluated.reason,
      evidence_hash:evidenceHash,sets_hash:packet?packet.sets_hash:'',session_id:session.Session_ID,plan_id:planIds[0] || ''});
    const outcome=evaluated.outcome || 'INSUFFICIENT_DATA',insufficient=outcome==='INSUFFICIENT_DATA',supported=outcome==='CONFIRMED';
    const item={Review_ID:id,Decision_ID:decision.Decision_ID,Area:decision.Area,Decision_Date:decision.Decision_Date,
      Review_Date:prior?prior.Review_Date:today,Evidence_Period:session.Date,
      Expected_Result:'C structure and RIR/technique/pain gates; '+contract.hypothesis_id+' / '+contract.contract_version,
      Metric:'C structure; last bench RIR; technique; pain',Target:'C Volume Bench; >=2; >=8/10; <=1/10',
      Actual_Result:session.Session_ID+': '+rformClosedLoopStableStringify_({checks:evaluated.checks,gaps:evaluated.gaps,provenance:evaluated.provenance || {}}),
      Outcome:outcome,Next_Action:supported?'KEEP':insufficient?'COLLECT_MISSING_EVIDENCE':'REVIEW_ADJUST_OR_STOP',
      Next_Decision_Required:!insufficient && !supported?'YES':'NO',Status:insufficient?'OPEN':'CLOSED',
      Evidence_Source:'TRAINING_SESSIONS / '+session.Session_ID+' / TRAINING_SETS / '+(packet?packet.sets_hash:'')+'\nHYPOTHESIS_REVIEW_V1:'+rformClosedLoopStableStringify_(meta),
      Reviewed_By:'CLOSED_LOOP_WORKER',Created_At:prior?prior.Created_At:today,Updated_At:prior?prior.Updated_At:today};
    if(rformContentApiV11Record_(c,id,'AUTO_DECISION_REVIEW','DECISION_REVIEWS','Review_ID',item,request))report.written++;
    if(evaluated.reason.indexOf('CONFLICTING_EVIDENCE')!==-1) {
      const qaId='QA-HYPOTHESIS-'+evidenceHash.slice(0,24);
      if(!qa.some(function(q){return q.QA_ID===qaId;})) {
        const qaItem={QA_ID:qaId,Detected_At:today,QA_Type:'CONFLICTING_EVIDENCE',Severity:'WARNING',
          Source_Sheet:'TRAINING_SESSIONS',Record_ID:session.Session_ID,Field_Name:'Technique_Status; Pain_After; Session_Conclusion',
          Issue_Description:'Hypothesis review cannot resolve conflicting or invalid explicit numeric ratings.',
          Current_Value:rformClosedLoopStableStringify_(evaluated.provenance),Expected_Value:'Unambiguous rating 0–10 with source provenance',
          Owner:'OWNER',Status:'OPEN',Resolution:'',Resolved_At:'',Resolved_By:''};
        if(rformContentApiV11Record_(c,qaId,'AUTO_HYPOTHESIS_QA','QA_LOG','QA_ID',qaItem,request))report.qa_written++;
      }
    }
    report.hypothesis_state=evaluated.hypothesis_state;report.reason=evaluated.reason;
    report.reviews.push({review_id:id,session_id:session.Session_ID,evidence_hash:evidenceHash,state:evaluated.hypothesis_state});
  });
  return report;
}

function rformContentApiHypothesisPreflightV01() {
  const c=rformContentApiV04WorkspaceContext_(),contract=rformHypothesisContractV01_();
  const today=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd');
  const decisions=rformContentApiV11Rows_(c.ss,'DECISIONS','Decision_ID').filter(function(d){return d.Decision_ID===contract.decision_id;});
  if(decisions.length!==1)throw new Error('HYPOTHESIS_DECISION_IDENTITY_REQUIRED');
  const reviews=rformContentApiV11Rows_(c.ss,'DECISION_REVIEWS','Review_ID');
  const sessions=rformContentApiV11Rows_(c.ss,'TRAINING_SESSIONS','Session_ID').filter(function(s) {
    const date=rformContentApiV11Iso_(s.Date);
    return s.Session_Type==='C' && date>=contract.window_start && date<=contract.window_end && date<=today;
  });
  const result={ok:true,read_only:true,api_version:RFORM_CONTENT_API_V04.version,contract:contract,
    enabled:PropertiesService.getScriptProperties().getProperty('RFORM_CLOSED_LOOP_ENABLED')==='YES',
    decision_status:decisions[0].Status,window_candidate_count:sessions.length,
    retained_closed_review_count:reviews.filter(function(r){return r.Decision_ID===contract.decision_id && r.Status==='CLOSED';}).length,
    no_fact_state:rformHypothesisEvaluateV01_(decisions[0],null,null,[],today).hypothesis_state,mutation_count:0};
  console.log(JSON.stringify({event:'RFORM_HYPOTHESIS_PREFLIGHT',report:result}));return result;
}
