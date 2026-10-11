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

var RFORM_CLOSED_LOOP_VERSION = '1.0.0';
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
  if (!checks.length) throw new Error('CLOSED_LOOP:DECISION_CHECKS_REQUIRED');

  var evaluated = checks.map(function (check) {
    var passed = check && check.passed === true;
    return {
      metric: String((check && check.metric) || ''),
      target: String((check && check.target) || ''),
      actual: String((check && check.actual) || ''),
      passed: passed
    };
  });
  var passedCount = evaluated.filter(function (item) { return item.passed; }).length;
  var outcome = passedCount === evaluated.length ? 'CONFIRMED' : (passedCount === 0 ? 'REJECTED' : 'PARTIAL');

  return {
    review_id: String(source.review_id || ('REV-' + source.decision_id)),
    decision_id: String(source.decision_id),
    area: String(source.area || ''),
    decision_date: String(source.decision_date || ''),
    review_date: String(source.review_date || ''),
    evidence_period: String(source.evidence_period || ''),
    checks: evaluated,
    outcome: outcome,
    next_action: String(source.next_action || ''),
    next_decision_required: source.next_decision_required === true ? 'YES' : 'NO',
    status: 'CLOSED',
    evidence_source: String(source.evidence_source || '')
  };
}

function rformClosedLoopEvaluateExperimentV1(experiment, registryRows, todayIso) {
  var exp = experiment || {};
  var rows = Array.isArray(registryRows) ? registryRows : [];
  var id = String(exp.hypothesis_id || '').trim();
  if (!id) throw new Error('CLOSED_LOOP:HYPOTHESIS_ID_REQUIRED');
  var required = Math.max(1, Number(exp.minimum_sample_count || 1));
  var linked = rows.filter(function (row) {
    return row && String(row.hypothesis_id || '').trim() === id;
  });
  var observed = linked.filter(rformClosedLoopHasRequiredObservedMetrics_);
  var ended = rformClosedLoopDateEnded_(exp.end_date_iso, todayIso);

  if (observed.length >= required) {
    return {
      hypothesis_id: id,
      status: 'READY_FOR_REVIEW',
      observed_sample: observed.length,
      required_sample: required,
      result: 'OBSERVED_METRICS_READY',
      decision: 'OWNER_REVIEW_REQUIRED'
    };
  }
  if (ended) {
    return {
      hypothesis_id: id,
      status: 'REVIEW_REQUIRED',
      observed_sample: observed.length,
      required_sample: required,
      result: 'INSUFFICIENT_METRICS',
      decision: 'DO_NOT_CONCLUDE'
    };
  }
  return {
    hypothesis_id: id,
    status: String(exp.status || 'ACTIVE'),
    observed_sample: observed.length,
    required_sample: required,
    result: '',
    decision: ''
  };
}

function rformClosedLoopOwnerSignalsV1(input) {
  var source = input || {};
  var signals = [];
  (source.content || []).forEach(function (item) {
    if (item && item.current_stage === 'OWNER_FINAL_PREVIEW' && item.preview_review_status !== 'APPROVED') {
      signals.push({ priority: 10, type: 'CONTENT_PREVIEW', id: item.content_id, action: 'REVIEW' });
    }
  });
  (source.decision_reviews || []).forEach(function (item) {
    if (item && (item.status === 'REVIEW_REQUIRED' || item.next_decision_required === 'YES')) {
      signals.push({ priority: 8, type: 'DECISION_REVIEW', id: item.review_id, action: 'DECIDE' });
    }
  });
  (source.experiments || []).forEach(function (item) {
    if (item && item.status === 'READY_FOR_REVIEW') {
      signals.push({ priority: 6, type: 'EXPERIMENT_REVIEW', id: item.hypothesis_id, action: 'REVIEW' });
    }
  });
  return signals.sort(function (a, b) {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return String(a.id).localeCompare(String(b.id));
  }).slice(0, 3);
}

function rformClosedLoopHasRequiredObservedMetrics_(row) {
  if (!row) return false;
  if (!String(row.metric_source || '').trim()) return false;
  if (row.observed !== true) return false;
  return row.views_24h !== '' && row.views_24h !== null && row.views_24h !== undefined;
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
