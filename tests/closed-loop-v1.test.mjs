import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../automation/closed_loop_v1.gs', import.meta.url), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

const buildPacket = context.rformClosedLoopBuildTrainingContentPacketV1;
const buildReview = context.rformClosedLoopBuildDecisionReviewV1;
const evaluateExperiment = context.rformClosedLoopEvaluateExperimentV1;
const ownerSignals = context.rformClosedLoopOwnerSignalsV1;

test('closed training materializes a full owner-gated content packet', () => {
  const packet = buildPacket({
    content_id: 'CNT-20261009-S-20261009-C',
    session_id: 'S-20261009-C',
    session_status: 'CLOSED',
    date: '09.10.2026',
    exercises: [
      'Жим штанги лёжа: 80×6×4, RIR 4/4/4/3.',
      'Присед: 110×8×3, RIR 4/4/4.',
      'Тяга гантелей с опорой грудью: 35×12×3, RIR 4/3/2.',
      'Разведения на грудь: 16×15 и 15×15, RIR 3/2.',
      'Задняя дельта: 10×15×2, RIR 3/3.'
    ],
    set_count: 14,
    duration_min: 65,
    bench_tonnage_kg: 1920,
    total_tonnage_kg: 8610,
    technique: '10/10',
    pain_after: '0/10',
    audience_problem: 'Как понять, что объёмный жим прогрессирует без автоматического ускорения?',
    reader_value: 'Увидеть полный факт и progression gate.',
    success_metric: '24h/72h/7d observed metrics only',
    next_step_rule: 'Следующий шаг не повышаю автоматически: сначала progression gate и отдельное решение владельца.'
  });

  assert.equal(packet.packet_version, '1.0');
  assert.equal(packet.facts.exercise_count, 5);
  assert.equal(packet.facts.set_count, 14);
  assert.equal(packet.facts.bench_tonnage_kg, 1920);
  assert.equal(packet.facts.total_tonnage_kg, 8610);
  assert.equal(packet.publication.current_stage, 'OWNER_FINAL_PREVIEW');
  assert.equal(packet.publication.approval_status, 'NOT_READY');
  assert.equal(packet.publication.autopost_allowed, 'NO');
  assert.match(packet.telegram_text, /Задняя дельта/);
  assert.match(packet.telegram_text, /1.?920 кг/);
  assert.match(packet.telegram_text, /8.?610 кг/);
  assert.doesNotMatch(packet.telegram_text, /В посте — часть упражнений/);
});

test('open training fails closed and cannot create a content packet', () => {
  assert.throws(() => buildPacket({
    content_id: 'CNT-X',
    session_id: 'S-X',
    session_status: 'OPEN',
    exercises: ['Bench'],
    set_count: 1,
    bench_tonnage_kg: 100,
    total_tonnage_kg: 100
  }), /SESSION_NOT_CLOSED/);
});

test('decision review closes the Decision to Result loop without rewriting the decision', () => {
  const review = buildReview({
    review_id: 'REV-20261011-C-VOLUME',
    decision_id: 'DEC-20260924-TRAINING-C-VOLUME-BENCH',
    area: 'TRAINING',
    checks: [
      { metric: 'structure', target: 'exact', actual: 'exact', passed: true },
      { metric: 'last_set_rir', target: '>=2', actual: '3', passed: true },
      { metric: 'technique', target: '>=8', actual: '10', passed: true },
      { metric: 'pain_after', target: '<=1', actual: '0', passed: true }
    ],
    next_action: 'Retain C structure.',
    next_decision_required: false
  });

  assert.equal(review.decision_id, 'DEC-20260924-TRAINING-C-VOLUME-BENCH');
  assert.equal(review.outcome, 'CONFIRMED');
  assert.equal(review.status, 'CLOSED');
  assert.equal(review.next_decision_required, 'NO');
});

test('expired experiment with insufficient observed metrics becomes review required, never guessed', () => {
  const result = evaluateExperiment({
    hypothesis_id: 'H01',
    end_date_iso: '2026-09-19',
    minimum_sample_count: 6,
    status: 'ACTIVE'
  }, [
    { hypothesis_id: 'H01', metric_source: '', observed: false, views_24h: '' }
  ], '2026-10-11');

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.result, 'INSUFFICIENT_METRICS');
  assert.equal(result.decision, 'DO_NOT_CONCLUDE');
});

test('experiment requires its primary metric, matched controls and sample', () => {
  function row(id,group,pair,values) {
    return {content_id:id,hypothesis_id:'H02',publication_date_iso:'2026-09-01',group,comparison_key:pair,
      metrics:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value,observed:true,source:'CANONICAL_ANALYTICS',observed_at:'2026-09-02T12:00:00Z'}]))};
  }
  const rows=Array.from({length:4},(_,i)=>[
    row('T'+i,'TREATMENT','P'+i,{saves_24h:15,views_24h:100}),
    row('C'+i,'CONTROL','P'+i,{saves_24h:10,views_24h:100})]).flat();
  const exp={hypothesis_id:'H02',end_date_iso:'2026-10-20',status:'ACTIVE'};
  const result=evaluateExperiment(exp,rows,'2026-10-11');
  assert.equal(result.status,'READY_FOR_REVIEW');assert.equal(result.criterion_met,true);
  assert.equal(result.observed_sample,4);assert.equal(result.control_sample,4);
  assert.equal(evaluateExperiment(exp,rows.filter(r=>r.group==='TREATMENT'),'2026-10-11').decision,'DO_NOT_CONCLUDE');
  assert.equal(evaluateExperiment(exp,rows.concat(rows),'2026-10-11').observed_sample,4);
  const noSaves=rows.map(r=>({...r,metrics:{views_24h:r.metrics.views_24h}}));
  assert.equal(evaluateExperiment(exp,noSaves,'2026-10-11').observed_sample,0);
});

test('Owner Bot remains the only cockpit and receives at most three true owner actions', () => {
  const signals = ownerSignals({
    content: [
      { content_id: 'CNT-1', current_stage: 'OWNER_FINAL_PREVIEW', publication_status:'PLANNED', public_data_allowed:'YES', qa_passed:true, preview_review_status: 'NOT_REVIEWED' },
      { content_id: 'CNT-2', current_stage: 'PUBLISHED', preview_review_status: 'APPROVED' }
    ],
    decision_reviews: [
      { review_id: 'REV-1', outcome:'PARTIAL', status: 'REVIEW_REQUIRED', next_decision_required: 'YES' }
    ],
    experiments: [
      { hypothesis_id: 'H01', status: 'REVIEW_REQUIRED' },
      { hypothesis_id: 'H02', status: 'READY_FOR_REVIEW', result:'OBSERVED_METRICS_READY', decision:'OWNER_REVIEW_REQUIRED' },
      { hypothesis_id: 'H03', status: 'READY_FOR_REVIEW', result:'OBSERVED_METRICS_READY', decision:'OWNER_REVIEW_REQUIRED' }
    ]
  });

  assert.equal(signals.length, 3);
  assert.deepEqual(Array.from(signals, x => x.type), ['CONTENT_PREVIEW', 'DECISION_REVIEW', 'EXPERIMENT_REVIEW']);
  assert.equal(signals[0].id, 'CNT-1');
});

test('missing decision observation is insufficient, never rejection or confirmation',()=>{
  for(const actual of ['',null,undefined]) {
    const review=buildReview({decision_id:'D',checks:[{metric:'pain',actual,passed:false}],next_decision_required:true});
    assert.equal(review.outcome,'INSUFFICIENT_DATA');assert.equal(review.status,'OPEN');assert.equal(review.next_decision_required,'NO');
  }
  assert.equal(buildReview({decision_id:'D',checks:[]}).outcome,'INSUFFICIENT_DATA');
  assert.equal(buildReview({decision_id:'D',checks:[{metric:'pain',actual:0,passed:true}]}).outcome,'CONFIRMED');
  assert.equal(buildReview({decision_id:'D',checks:[{metric:'week',actual:2,passed:true,observed_sample:2,minimum_sample:4}]}).outcome,'INSUFFICIENT_DATA');
});
test('editorial routing respects aggregate, manual gates and pending canonical events',()=>{
  const select=context.rformClosedLoopEditorialV11;
  assert.equal(select(null).outcome,'WAIT_EVENT');
  assert.equal(select({Status:'AGGREGATE_TO_WEEKLY',Editorial_Trigger:'SIGNIFICANT_DEVIATION'}).outcome,'NO_POST');
  assert.equal(select({Status:'OWNER_GATE',Manual_Gate:'YES',Editorial_Trigger:'CONTROL_POINT',Content_Value_Score:89}).outcome,'OWNER_GATE');
  assert.equal(select({Status:'DATA_READY',Manual_Gate:'NO',Editorial_Trigger:'CONTROL_POINT',Content_Value_Score:89}).outcome,'PREPARE');
  assert.equal(select({Status:'ALREADY_IN_PIPELINE'}).outcome,'COVERED');
});
test('held, blocked, insufficient and duplicate actions do not occupy owner cockpit',()=>{
  const ready={content_id:'C',current_stage:'OWNER_FINAL_PREVIEW',publication_status:'PLANNED',public_data_allowed:'YES',qa_passed:true};
  const out=ownerSignals({content:[ready,ready,{...ready,content_id:'H',publication_status:'HOLD'},{...ready,content_id:'B',blocking_issue:'QA'}],
    decision_reviews:[{review_id:'R',outcome:'INSUFFICIENT_DATA',next_decision_required:'YES'}],
    experiments:[{hypothesis_id:'H01',status:'REVIEW_REQUIRED'}]});
  assert.equal(out.length,1);assert.equal(out[0].id,'C');
});

test('all hypothesis gates require their own metrics, controls and minimum independent sample',()=>{
  const at='2026-09-02T12:00:00Z';
  const observed=value=>({value,observed:true,source:'CANONICAL_ANALYTICS',observed_at:at});
  function rows(id,n,values) {
    return Array.from({length:n},(_,i)=>['TREATMENT','CONTROL'].map(group=>({content_id:id+group+i,hypothesis_id:id,
      publication_date_iso:'2026-09-01',group,comparison_key:'P'+i,
      metrics:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,observed(v)]))}))).flat();
  }
  const cases=[
    ['H01',6,{subscribers_gained_24h:2,views_24h:100,retention_7d:0.9}],
    ['H03',4,{reach:50,subscriber_base:100,retention_7d:0.9,production_minutes_week:30}],
    ['H04',1,{starts:30,completions:15,returned_after_3_trainings:5}]
  ];
  for(const [id,n,values] of cases) {
    const exp={hypothesis_id:id,end_date_iso:'2026-10-01',control_start_date_iso:'2026-08-01',control_end_date_iso:'2026-10-01'};
    const valid=rows(id,n,values);
    if(id==='H03')valid.forEach((x,i)=>{const date=['2026-09-01','2026-09-08','2026-09-15','2026-09-22'][Math.floor(i/2)];x.publication_date_iso=date;x.period_id=context.rformClosedLoopIsoWeekV11_(date);Object.values(x.metrics).forEach(m=>m.observed_at=date+'T12:00:00Z');});
    assert.equal(evaluateExperiment(exp,valid,'2026-10-11').status,'READY_FOR_REVIEW');
    assert.equal(evaluateExperiment(exp,valid.filter(x=>x.group==='TREATMENT'),'2026-10-11').result,'INSUFFICIENT_METRICS');
    const missing=valid.map(x=>({...x,metrics:{views_24h:observed(100)}}));
    assert.equal(evaluateExperiment(exp,missing,'2026-10-11').decision,'DO_NOT_CONCLUDE');
    if(id!=='H04')assert.equal(evaluateExperiment(exp,valid.slice(2),'2026-10-11').result,'INSUFFICIENT_METRICS');
    else {
      valid.forEach(x=>x.metrics.starts=observed(29));
      assert.equal(evaluateExperiment(exp,valid,'2026-10-11').result,'INSUFFICIENT_METRICS');
    }
  }
});
