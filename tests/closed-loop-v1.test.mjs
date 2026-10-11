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

test('experiment becomes ready only from linked observed metrics and minimum sample', () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({
    hypothesis_id: 'H02',
    metric_source: 'CONTENT_REGISTRY',
    observed: true,
    views_24h: 100 + index
  }));
  const result = evaluateExperiment({
    hypothesis_id: 'H02',
    end_date_iso: '2026-10-20',
    minimum_sample_count: 4,
    status: 'ACTIVE'
  }, rows, '2026-10-11');

  assert.equal(result.status, 'READY_FOR_REVIEW');
  assert.equal(result.observed_sample, 4);
  assert.equal(result.result, 'OBSERVED_METRICS_READY');
  assert.equal(result.decision, 'OWNER_REVIEW_REQUIRED');
});

test('Owner Bot remains the only cockpit and receives at most three true owner actions', () => {
  const signals = ownerSignals({
    content: [
      { content_id: 'CNT-1', current_stage: 'OWNER_FINAL_PREVIEW', preview_review_status: 'NOT_REVIEWED' },
      { content_id: 'CNT-2', current_stage: 'PUBLISHED', preview_review_status: 'APPROVED' }
    ],
    decision_reviews: [
      { review_id: 'REV-1', status: 'REVIEW_REQUIRED', next_decision_required: 'YES' }
    ],
    experiments: [
      { hypothesis_id: 'H01', status: 'REVIEW_REQUIRED' },
      { hypothesis_id: 'H02', status: 'READY_FOR_REVIEW' },
      { hypothesis_id: 'H03', status: 'READY_FOR_REVIEW' }
    ]
  });

  assert.equal(signals.length, 3);
  assert.deepEqual(Array.from(signals, x => x.type), ['CONTENT_PREVIEW', 'DECISION_REVIEW', 'EXPERIMENT_REVIEW']);
  assert.equal(signals[0].id, 'CNT-1');
});
