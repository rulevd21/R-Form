/*
 * R/Form Closed Loop v1
 *
 * Pure, deterministic contracts for:
 *   accepted fact -> Content Packet -> owner preview
 *   Decision -> Decision Review -> next decision signal
 *   Content Registry metrics -> Experiment review signal
 *
 * This module does not publish, approve, schedule, mutate Telegram state,
 * create a second datastore, or bypass existing owner gates.
 */

var RFORM_CLOSED_LOOP_VERSION = '1.1.0';
var RFORM_CONTENT_PACKET_VERSION = '1.0';

function rformClosedLoopBuildTrainingContentPacketV1(input) {
  var source = input || {};
  if (String(source.session_status || '').toUpperCase() !== 'CLOSED') {
    throw new Error('CLOSED_LOOP:SESSION_NOT_CLOSED');
  }
  if (!String(source.content_id || '').trim()) {
    throw new Error('CLOSED_LOOP:CONTENT_ID_REQUIRED');
  }
  if (!String(source.session_id || '').trim()) {
    throw new Error('CLOSED_LOOP:SESSION_ID_REQUIRED');
  }
  var exercises = Array.isArray(source.exercises) ? source.exercises.filter(Boolean) : [];
  if (!exercises.length) {
    throw new Error('CLOSED_LOOP:EXERCISES_REQUIRED');
  }
  var setCount = rformClosedLoopFiniteNumber_(source.set_count, 'SET_COUNT_REQUIRED');
  var benchTonnage = rformClosedLoopFiniteNumber_(source.bench_tonnage_kg, 'BENCH_TONNAGE_REQUIRED');
  var totalTonnage = rformClosedLoopFiniteNumber_(source.total_tonnage_kg, 'TOTAL_TONNAGE_REQUIRED');
  if (setCount <= 0 || benchTonnage < 0 || totalTonnage < benchTonnage) {
    throw new Error('CLOSED_LOOP:INVALID_TRAINING_TOTALS');
  }

  var packet = {
    packet_version: RFORM_CONTENT_PACKET_VERSION,
    content_id: String(source.content_id).trim(),
    session_id: String(source.session_id).trim(),
    date: String(source.date || '').trim(),
    source_status: 'CLOSED_ACCEPTED',
    facts: {
      exercises: exercises.map(String),
      exercise_count: exercises.length,
      set_count: setCount,
      duration_min: rformClosedLoopNullableFinite_(source.duration_min),
      bench_tonnage_kg: benchTonnage,
      total_tonnage_kg: totalTonnage,
      technique: String(source.technique || '').trim(),
      pain_after: String(source.pain_after || '').trim()
    },
    editorial: {
      editorial_trigger: String(source.editorial_trigger || 'CONTROL_POINT'),
      target_segment: String(source.target_segment || 'EXPERIENCED_AMATEUR'),
      audience_problem: String(source.audience_problem || '').trim(),
      content_function: String(source.content_function || 'TRUST'),
      content_type: String(source.content_type || 'PROOF'),
      funnel_stage: String(source.funnel_stage || 'TRUST'),
      reader_value: String(source.reader_value || '').trim(),
      cta_type: String(source.cta_type || 'RETURN_TO_SERIES'),
      success_metric: String(source.success_metric || '').trim(),
      distribution_mode: String(source.distribution_mode || 'ORGANIC'),
      editorial_direction: String(source.editorial_direction || 'CONTROL')
    },
    publication: {
      current_stage: 'OWNER_FINAL_PREVIEW',
      approval_status: 'NOT_READY',
      publication_status: 'PLANNED',
      autopost_allowed: 'NO',
      preview_review_status: 'NOT_REVIEWED'
    }
  };

  packet.telegram_text = rformClosedLoopTrainingTelegramTextV1_(packet, source.next_step_rule);
  packet.canonical_json = rformClosedLoopStableStringify_(packet);
  return packet;
}

function rformClosedLoopTrainingTelegramTextV1_(packet, nextStepRule) {
  var f = packet.facts;
  var lines = [];
  lines.push((packet.date || '') + ' · Тренировка');
  lines.push('');
  lines.push('Факт:');
  f.exercises.forEach(function (exercise) { lines.push('— ' + exercise); });
  lines.push('');
  lines.push(f.set_count + ' рабочих подходов' + (f.duration_min !== null ? ' за ' + f.duration_min + ' минут.' : '.'));
  lines.push('Тоннаж жима — ' + rformClosedLoopFormatKg_(f.bench_tonnage_kg) + ' кг. Общий рабочий тоннаж — ' + rformClosedLoopFormatKg_(f.total_tonnage_kg) + ' кг.');
  if (f.technique || f.pain_after) {
    lines.push('Техника жима — ' + (f.technique || 'н/д') + ', боль после тренировки — ' + (f.pain_after || 'н/д') + '.');
  }
  if (String(nextStepRule || '').trim()) {
    lines.push('');
    lines.push(String(nextStepRule).trim());
  }
  lines.push('');
  lines.push('#RForm_Training');
  return lines.join('\n');
}

function rformClosedLoopBuildDecisionReviewV1(input) {
  var source = input || {};
  if (!String(source.decision_id || '').trim()) throw new Error('CLOSED_LOOP:DECISION_ID_REQUIRED');
  var checks = Array.isArray(source.checks) ? source.checks : [];
  var evaluated = checks.map(function(check) {
    check = check || {};
    var actual = check.actual;
    var sufficient = actual !== '' && actual !== null && actual !== undefined &&
      typeof check.passed === 'boolean' && check.observed !== false &&
      Number(check.observed_sample == null ? 1 : check.observed_sample) >= Number(check.minimum_sample || 1);
    return {metric:String(check.metric || ''),target:String(check.target || ''),
      actual:actual == null ? '' : String(actual),passed:sufficient ? check.passed : null,sufficient:sufficient};
  });
  var insufficient = !evaluated.length || evaluated.some(function(c) {return !c.sufficient;});
  var passed = evaluated.filter(function(c) {return c.passed === true;}).length;
  var outcome = insufficient ? 'INSUFFICIENT_DATA' : passed === evaluated.length ? 'CONFIRMED' : passed === 0 ? 'REJECTED' : 'PARTIAL';
  return {review_id:String(source.review_id || ('REV-' + source.decision_id)),decision_id:String(source.decision_id),
    area:String(source.area || ''),decision_date:String(source.decision_date || ''),review_date:String(source.review_date || ''),
    evidence_period:String(source.evidence_period || ''),checks:evaluated,outcome:outcome,
    next_action:insufficient ? 'Collect the missing observations; do not change the decision.' : String(source.next_action || ''),
    next_decision_required:!insufficient && source.next_decision_required === true ? 'YES' : 'NO',
    status:insufficient ? 'OPEN' : 'CLOSED',evidence_source:String(source.evidence_source || '')};
}

function rformClosedLoopEvaluateExperimentV1(experiment, registryRows, todayIso) {
  var exp=experiment || {}, id=String(exp.hypothesis_id || '').trim();
  if(!id) throw new Error('CLOSED_LOOP:HYPOTHESIS_ID_REQUIRED');
  var contracts={
    H01:{primary:'Subscribers_Gained / 1000 views',fields:['subscribers_gained_24h','views_24h','retention_7d'],n:6,unit:'pairs'},
    H02:{primary:'Saves / Views',fields:['saves_24h','views_24h'],n:4,unit:'publications'},
    H03:{primary:'Median Reach / Subscriber Base',fields:['reach','subscriber_base','retention_7d','production_minutes_week'],n:4,unit:'weeks'},
    H04:{primary:'Training Check completion rate',fields:['starts','completions','returned_after_3_trainings'],n:30,unit:'starts'}
  };
  var contract=contracts[id], gaps=[], treatment=[], control=[], ids={}, pairs={};
  if(!contract || (exp.primary_metric && exp.primary_metric !== contract.primary)) gaps.push('METRIC_CONTRACT_REQUIRED');
  var start=String(exp.start_date_iso || ''), end=String(exp.end_date_iso || '');
  if(id==='H03' && (!exp.control_start_date_iso || !exp.control_end_date_iso)) gaps.push('CONTROL_PERIOD_REQUIRED');
  (Array.isArray(registryRows)?registryRows:[]).forEach(function(row) {
    if(!row || String(row.hypothesis_id || '')!==id || !contract) return;
    var key=String(row.content_id || ''), group=String(row.group || '').toUpperCase(), date=String(row.publication_date_iso || '');
    var from=group==='CONTROL' && exp.control_start_date_iso?String(exp.control_start_date_iso):start;
    var to=group==='CONTROL' && exp.control_end_date_iso?String(exp.control_end_date_iso):end;
    if(!key || ids[key] || !date || (from && date<from) || (to && date>to)) return;
    ids[key]=true;
    if(['TREATMENT','CONTROL'].indexOf(group)===-1 || !String(row.comparison_key || '').trim()) return;
    var metrics=row.metrics || {}, valid=contract.fields.every(function(field) {
      var m=metrics[field], at=m && String(m.observed_at || '');
      return m && m.observed === true && String(m.source || '').trim() && /^\d{4}-\d{2}-\d{2}T/.test(at) &&
        at.slice(0,10)>=date && (!todayIso || at.slice(0,10)<=todayIso) &&
        m.value!=='' && m.value!==null && m.value!==undefined && Number.isFinite(Number(m.value)) && Number(m.value)>=0;
    });
    if(!valid) return;
    var values={}; contract.fields.forEach(function(f){values[f]=Number(metrics[f].value);});
    if((id==='H01'||id==='H02') && values.views_24h<=0 || id==='H03' && values.subscriber_base<=0 ||
      id==='H04' && (values.starts<=0 || values.completions>values.starts || values.returned_after_3_trainings>values.completions)) return;
    if(id==='H03' && (!/^\d{4}-W\d{2}$/.test(String(row.period_id || '')) || row.period_id!==rformClosedLoopIsoWeekV11_(date))) return;
    if((id==='H01'||id==='H03') && values.retention_7d>1) return;
    var x={id:key,key:String(row.comparison_key),period:String(row.period_id || ''),v:values};
    (group==='CONTROL'?control:treatment).push(x);
  });
  var required=contract?Math.max(contract.n,Number(exp.minimum_sample_count || contract.n)):0;
  var matchedT=[],matchedC=[];
  if(contract) {
    treatment.forEach(function(t) {
      var ts=treatment.filter(function(x){return x.key===t.key;}),cs=control.filter(function(x){return x.key===t.key;});
      // A comparison unit is explicitly matched once in each group; never infer controls from titles/rubrics.
      var independent=id!=='H03' || (treatment.filter(function(x){return x.period===t.period;}).length===1 && cs.length===1 && control.filter(function(x){return x.period===cs[0].period;}).length===1);
      if(ts.length===1 && cs.length===1 && independent && !pairs[t.key]) {pairs[t.key]=true;matchedT.push(t);matchedC.push(cs[0]);}
    });
    treatment=matchedT;control=matchedC;
    var count=function(xs){return contract.unit==='starts'?xs.reduce(function(n,x){return n+x.v.starts;},0):xs.length;};
    if(count(treatment)<required) gaps.push('TREATMENT_SAMPLE');
    if(count(control)<required) gaps.push('CONTROL_SAMPLE');
  }
  var median=function(values){values.sort(function(a,b){return a-b;});var n=values.length;return n?(values[Math.floor(n/2)]+values[Math.ceil(n/2)-1])/2:null;};
  var rate=function(x){var v=x.v;return id==='H01'?1000*v.subscribers_gained_24h/v.views_24h:id==='H02'?v.saves_24h/v.views_24h:id==='H03'?v.reach/v.subscriber_base:v.completions/v.starts;};
  var t=median(treatment.map(rate)),c=median(control.map(rate)),met=null;
  if(!gaps.length) {
    if(id==='H01') met=t>=c*1.2 && median(treatment.map(function(x){return x.v.retention_7d;}))>=median(control.map(function(x){return x.v.retention_7d;}));
    if(id==='H02') met=t>=c*1.2;
    if(id==='H03') met=median(treatment.map(function(x){return x.v.retention_7d;}))>=median(control.map(function(x){return x.v.retention_7d;})) &&
      median(treatment.map(function(x){return x.v.production_minutes_week;}))<median(control.map(function(x){return x.v.production_minutes_week;}));
    if(id==='H04') met=t>=0.4 && treatment.every(function(x){return x.v.returned_after_3_trainings>0;});
  }
  var ended=rformClosedLoopDateEnded_(end,todayIso);
  return {hypothesis_id:id,status:!gaps.length?'READY_FOR_REVIEW':ended?'REVIEW_REQUIRED':String(exp.status || 'ACTIVE'),
    observed_sample:treatment.length,control_sample:control.length,required_sample:required,sample_unit:contract?contract.unit:'',
    result:gaps.length?'INSUFFICIENT_METRICS':'OBSERVED_METRICS_READY',decision:gaps.length?'DO_NOT_CONCLUDE':'OWNER_REVIEW_REQUIRED',
    gaps:gaps,primary_metric:contract?contract.primary:'',treatment_median:t,control_median:c,criterion_met:met};
}

function rformClosedLoopOwnerSignalsV1(input) {
  var source=input || {}, signals=[],seen={};
  (source.content || []).forEach(function(item) {
    if(item && item.current_stage==='OWNER_FINAL_PREVIEW' && item.publication_status==='PLANNED' &&
      item.approval_status!=='APPROVED' && item.public_data_allowed==='YES' && item.qa_passed===true &&
      !item.blocking_issue && !item.duplicate && item.preview_review_status!=='APPROVED')
      signals.push({priority:10,type:'CONTENT_PREVIEW',id:item.content_id,action:'REVIEW'});
  });
  (source.decision_reviews || []).forEach(function(item) {
    if(item && item.outcome!=='INSUFFICIENT_DATA' && item.next_decision_required==='YES' && item.status!=='OWNER_RESOLVED')
      signals.push({priority:8,type:'DECISION_REVIEW',id:item.review_id,action:'DECIDE'});
  });
  (source.experiments || []).forEach(function(item) {
    if(item && item.status==='READY_FOR_REVIEW' && item.result==='OBSERVED_METRICS_READY' && item.decision==='OWNER_REVIEW_REQUIRED')
      signals.push({priority:6,type:'EXPERIMENT_REVIEW',id:item.hypothesis_id,action:'REVIEW'});
  });
  return signals.sort(function(a,b){return b.priority-a.priority || String(a.id).localeCompare(String(b.id));})
    .filter(function(x){var k=x.type+':'+x.id;if(!x.id||seen[k])return false;seen[k]=true;return true;}).slice(0,3);
}

function rformClosedLoopHasRequiredObservedMetrics_(row) {
  // Public preview views alone never prove an experiment's primary metric.
  return !!(row && row.metrics && row.group && row.comparison_key);
}

function rformClosedLoopDateEnded_(endDateIso, todayIso) {
  if (!endDateIso || !todayIso) return false;
  return String(endDateIso) < String(todayIso);
}

function rformClosedLoopStableStringify_(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(rformClosedLoopStableStringify_).join(',') + ']';
  var keys = Object.keys(value).sort();
  return '{' + keys.map(function (key) {
    return JSON.stringify(key) + ':' + rformClosedLoopStableStringify_(value[key]);
  }).join(',') + '}';
}

function rformClosedLoopFormatKg_(value) {
  return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function rformClosedLoopFiniteNumber_(value, code) {
  var number = Number(value);
  if (!isFinite(number)) throw new Error('CLOSED_LOOP:' + code);
  return number;
}

function rformClosedLoopNullableFinite_(value) {
  if (value === '' || value === null || value === undefined) return null;
  return rformClosedLoopFiniteNumber_(value, 'INVALID_NUMBER');
}

function rformClosedLoopEditorialV11(event) {
  if(!event) return {outcome:'WAIT_EVENT',reason:'CANONICAL_EVENT_REQUIRED'};
  var status=String(event.Status || '').toUpperCase(), trigger=String(event.Editorial_Trigger || '').toUpperCase();
  if(['AGGREGATE_ONLY','AGGREGATE_TO_WEEKLY','FILTERED_OUT_V03','FILTERED_OUT_V04','DISMISSED','WEEKLY'].indexOf(status)!==-1 ||
    ['NONE','FACT_CLOSED'].indexOf(trigger)!==-1) return {outcome:'NO_POST',reason:status || 'NO_EDITORIAL_TRIGGER'};
  if(['PUBLISHED','ALREADY_IN_PIPELINE','ARCHIVED','SUPERSEDED'].indexOf(status)!==-1) return {outcome:'COVERED',reason:status};
  if(/^YES/.test(String(event.Manual_Gate || '')) || status==='OWNER_GATE') return {outcome:'OWNER_GATE',reason:'EXPLICIT_EDITORIAL_DECISION_REQUIRED'};
  if(['DATA_READY','CONTENT_CANDIDATE','PRIORITY_CANDIDATE','PUBLICATION'].indexOf(status)===-1 ||
    !trigger || Number(event.Content_Value_Score || 0)<65) return {outcome:'NO_POST',reason:'EDITORIAL_THRESHOLD'};
  return {outcome:'PREPARE',reason:trigger};
}
function rformClosedLoopPacketQaV11(packet) {
  var f=packet && packet.facts, e=packet && packet.editorial, p=packet && packet.publication;
  if(!f || !e || !p || !packet.canonical_json || !packet.telegram_text ||
    packet.telegram_text.length>4096 || !f.exercises.length || f.set_count<=0 ||
    ['audience_problem','reader_value','success_metric','editorial_trigger'].some(function(k){return !String(e[k] || '').trim();}) ||
    p.current_stage!=='OWNER_FINAL_PREVIEW' || p.approval_status!=='NOT_READY' || p.publication_status!=='PLANNED' ||
    p.autopost_allowed!=='NO' || p.preview_review_status!=='NOT_REVIEWED') throw new Error('CLOSED_LOOP:PACKET_QA_FAILED');
  return true;
}

function rformClosedLoopIsoWeekV11_(dateIso) {
  var d=new Date(String(dateIso)+'T00:00:00Z');
  if(!Number.isFinite(d.getTime()))return '';
  d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay() || 7));
  var year=d.getUTCFullYear(),week=Math.ceil((((d-new Date(Date.UTC(year,0,1)))/86400000)+1)/7);
  return year+'-W'+String(week).padStart(2,'0');
}
