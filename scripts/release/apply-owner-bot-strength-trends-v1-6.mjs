import fs from 'node:fs';
import process from 'node:process';

export const TARGET = 'automation/owner_bot_cockpit_v1_3.gs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`STRENGTH_TRENDS_PATCH: missing ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`STRENGTH_TRENDS_PATCH: ${label} is not unique`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function applyStrengthTrendsPatch(input) {
  let source = String(input || '');
  const complete = (source.includes("version: '1.6.0'") || source.includes("version: '1.7.0'") || source.includes("version: '1.7.1'")) &&
    source.includes("setsSheet: 'TRAINING_SETS'") &&
    source.includes('rformOwnerBotV16StrengthTrends_') &&
    source.includes("'СИЛОВЫЕ ТРЕНДЫ'");
  if (complete) return source;

  const partial = source.includes("version: '1.6.0'") ||
    source.includes("setsSheet: 'TRAINING_SETS'") ||
    source.includes('rformOwnerBotV16StrengthTrends_') ||
    source.includes("'СИЛОВЫЕ ТРЕНДЫ'");
  if (partial) throw new Error('STRENGTH_TRENDS_PATCH: partial v1.6 materialization detected');

  source = replaceOnce(
    source,
    '// R/Form Owner Bot Cockpit v1.5 · Daily Cockpit + Period Report + Build Report',
    '// R/Form Owner Bot Cockpit v1.6 · Daily Cockpit + Period Report + Strength Trends',
    'header version'
  );
  source = replaceOnce(source, "version: '1.5.0'", "version: '1.6.0'", 'runtime version');

  source = replaceOnce(
    source,
    "  sessionsSheet: 'TRAINING_SESSIONS',\n  measurementsSheet: 'MEASUREMENTS',\n  maxOwnerDecisions: 3,",
    "  sessionsSheet: 'TRAINING_SESSIONS',\n  setsSheet: 'TRAINING_SETS',\n  measurementsSheet: 'MEASUREMENTS',\n  maxOwnerDecisions: 3,\n  strengthMaxExercises: 4,",
    'training sets config'
  );

  source = replaceOnce(
    source,
    "    sessions: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.sessionsSheet, 'Session_ID'),\n    measurements: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.measurementsSheet, 'Measurement_ID')",
    "    sessions: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.sessionsSheet, 'Session_ID'),\n    sets: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.setsSheet, 'Set_ID'),\n    measurements: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.measurementsSheet, 'Measurement_ID')",
    'report bundle training sets'
  );

  source = replaceOnce(
    source,
    "  const sessions = Array.isArray(bundle && bundle.sessions) ? bundle.sessions : [];\n  const measurements = Array.isArray(bundle && bundle.measurements) ? bundle.measurements : [];",
    "  const sessions = Array.isArray(bundle && bundle.sessions) ? bundle.sessions : [];\n  const sets = Array.isArray(bundle && bundle.sets) ? bundle.sets : [];\n  const measurements = Array.isArray(bundle && bundle.measurements) ? bundle.measurements : [];",
    'report model training sets input'
  );

  source = replaceOnce(
    source,
    `  const closedSessions = sessions.filter(function (row) {\n    const p = rformOwnerBotV13DateParts_(row.Date);\n    return !!(p && accepted[p.text] && String(row.Session_Status || '').trim().toUpperCase() === 'CLOSED' && !String(row.Duplicate_Flag || '').trim());\n  }).sort(function (a, b) { return rformOwnerBotV13DateParts_(a.Date).key.localeCompare(rformOwnerBotV13DateParts_(b.Date).key); });\n\n  const periodMeasurements = measurements.filter(function (row) {`,
    `  const closedSessions = sessions.filter(function (row) {\n    const p = rformOwnerBotV13DateParts_(row.Date);\n    return !!(p && accepted[p.text] && String(row.Session_Status || '').trim().toUpperCase() === 'CLOSED' && !String(row.Duplicate_Flag || '').trim());\n  }).sort(function (a, b) { return rformOwnerBotV13DateParts_(a.Date).key.localeCompare(rformOwnerBotV13DateParts_(b.Date).key); });\n  const closedSessionIds = {};\n  closedSessions.forEach(function (row) { closedSessionIds[String(row.Session_ID || '').trim()] = true; });\n  const periodSets = sets.filter(function (row) {\n    return !!closedSessionIds[String(row.Session_ID || '').trim()] && !String(row.Duplicate_Flag || '').trim();\n  });\n\n  const periodMeasurements = measurements.filter(function (row) {`,
    'closed-session set filter'
  );

  source = replaceOnce(
    source,
    "      durationMinutes: duration.reduce(function (a, b) { return a + b; }, 0),\n      rows: closedSessions",
    "      durationMinutes: duration.reduce(function (a, b) { return a + b; }, 0),\n      rows: closedSessions,\n      sets: periodSets",
    'report model training set rows'
  );

  const helpers = `function rformOwnerBotV16StrengthSetEligible_(row) {\n  const type = String(row && row.Set_Type || '').trim().toUpperCase();\n  const category = String(row && row.Exercise_Category || '').trim().toUpperCase();\n  if (['WORKING','TOP_SET','BACKOFF'].indexOf(type) === -1) return false;\n  if (['BENCH','SQUAT','HINGE','PRESS','PULL'].indexOf(category) === -1) return false;\n  const weight = rformOwnerBotV13Number_(row && row.Weight_Kg);\n  const reps = rformOwnerBotV13Number_(row && row.Reps);\n  return weight !== null && weight > 0 && reps !== null && reps > 0;\n}\n\nfunction rformOwnerBotV16ExerciseKey_(row) {\n  const catalog = String(row && row.Exercise_Catalog_ID || '').trim().toUpperCase();\n  if (catalog) return catalog;\n  const normalized = String(row && row.Exercise_Name_Normalized || '').trim().toUpperCase();\n  if (normalized && !/^FREE_/.test(normalized)) return normalized;\n  const original = String(row && row.Exercise_Name_Original || '').trim().toUpperCase();\n  return normalized || original.replace(/[^A-ZА-ЯЁ0-9]+/g, '_').replace(/^_+|_+$/g, '');\n}\n\nfunction rformOwnerBotV16ExerciseLabel_(key, rows) {\n  const labels = {\n    COMPETITION_BENCH_PRESS: 'Соревновательный жим',\n    COMPETITION_BENCH_PRESS_2S_PAUSE: 'Жим с паузой 2 с',\n    LARSEN_PRESS: 'Жим Ларсена',\n    BARBELL_BACK_SQUAT: 'Присед со штангой',\n    ROMANIAN_DEADLIFT: 'Румынская тяга',\n    OVERHEAD_PRESS: 'Жим стоя',\n    BARBELL_ROW: 'Тяга штанги'\n  };\n  if (labels[key]) return labels[key];\n  const named = (rows || []).map(function (row) { return String(row.Exercise_Name_Original || '').trim(); }).filter(Boolean);\n  return named.length ? named[0] : key;\n}\n\nfunction rformOwnerBotV16CategoryPriority_(category) {\n  return {BENCH: 50, SQUAT: 40, HINGE: 30, PRESS: 20, PULL: 10}[String(category || '').toUpperCase()] || 0;\n}\n\nfunction rformOwnerBotV16Estimated1RM_(row) {\n  const weight = rformOwnerBotV13Number_(row && row.Weight_Kg);\n  const reps = rformOwnerBotV13Number_(row && row.Reps);\n  if (weight === null || reps === null || weight <= 0 || reps <= 0) return null;\n  const rawRir = rformOwnerBotV13Number_(row && row.RIR);\n  const reserve = rawRir === null ? 0 : Math.max(0, Math.min(5, rawRir));\n  const effectiveReps = Math.min(12, reps + reserve);\n  return weight * (1 + effectiveReps / 30);\n}\n\nfunction rformOwnerBotV16TopSet_(rows) {\n  const candidates = (rows || []).map(function (row) {\n    return {row: row, e1rm: rformOwnerBotV16Estimated1RM_(row)};\n  }).filter(function (x) { return Number.isFinite(x.e1rm); });\n  candidates.sort(function (a, b) {\n    if (b.e1rm !== a.e1rm) return b.e1rm - a.e1rm;\n    const bw = rformOwnerBotV13Number_(b.row.Weight_Kg) || 0;\n    const aw = rformOwnerBotV13Number_(a.row.Weight_Kg) || 0;\n    if (bw !== aw) return bw - aw;\n    return (rformOwnerBotV13Number_(b.row.Reps) || 0) - (rformOwnerBotV13Number_(a.row.Reps) || 0);\n  });\n  return candidates.length ? candidates[0] : null;\n}\n\nfunction rformOwnerBotV16BestExposure_(rows) {\n  const copy = (rows || []).filter(function (x) { return Number.isFinite(x.e1rm); }).slice();\n  copy.sort(function (a, b) { return b.e1rm - a.e1rm || String(a.date || '').localeCompare(String(b.date || '')); });\n  return copy.length ? copy[0] : null;\n}\n\nfunction rformOwnerBotV16StrengthTrends_(model) {\n  const sessionRows = model && model.training && Array.isArray(model.training.rows) ? model.training.rows : [];\n  const setRows = model && model.training && Array.isArray(model.training.sets) ? model.training.sets : [];\n  const sessionDate = {};\n  sessionRows.forEach(function (row) {\n    const p = rformOwnerBotV13DateParts_(row.Date);\n    if (p) sessionDate[String(row.Session_ID || '').trim()] = p;\n  });\n  const eligible = setRows.filter(rformOwnerBotV16StrengthSetEligible_).filter(function (row) {\n    return !!sessionDate[String(row.Session_ID || '').trim()];\n  });\n  const exerciseMap = {};\n  eligible.forEach(function (row) {\n    const key = rformOwnerBotV16ExerciseKey_(row);\n    if (!key) return;\n    const sid = String(row.Session_ID || '').trim();\n    if (!exerciseMap[key]) exerciseMap[key] = {key: key, category: String(row.Exercise_Category || '').trim().toUpperCase(), rows: [], sessions: {}};\n    exerciseMap[key].rows.push(row);\n    if (!exerciseMap[key].sessions[sid]) exerciseMap[key].sessions[sid] = [];\n    exerciseMap[key].sessions[sid].push(row);\n  });\n\n  const trends = Object.keys(exerciseMap).map(function (key) {\n    const group = exerciseMap[key];\n    const exposures = Object.keys(group.sessions).map(function (sid) {\n      const rows = group.sessions[sid];\n      const top = rformOwnerBotV16TopSet_(rows);\n      const date = sessionDate[sid];\n      const rirValues = rows.map(function (row) { return rformOwnerBotV13Number_(row.RIR); }).filter(function (x) { return x !== null; });\n      const volume = rows.reduce(function (sum, row) {\n        return sum + (rformOwnerBotV13Number_(row.Weight_Kg) || 0) * (rformOwnerBotV13Number_(row.Reps) || 0);\n      }, 0);\n      return {\n        sessionId: sid, date: date.text, dateKey: date.key, rows: rows,\n        top: top ? top.row : null, e1rm: top ? top.e1rm : null, volume: volume,\n        averageRir: rformOwnerBotV13Average_(rirValues)\n      };\n    }).filter(function (x) { return x.top; }).sort(function (a, b) { return a.dateKey.localeCompare(b.dateKey); });\n    if (!exposures.length) return null;\n\n    const split = Math.max(1, Math.floor(exposures.length / 2));\n    const earlyBest = rformOwnerBotV16BestExposure_(exposures.slice(0, split));\n    const lateBest = rformOwnerBotV16BestExposure_(exposures.slice(split));\n    const allBest = rformOwnerBotV16BestExposure_(exposures);\n    const deltaPct = earlyBest && lateBest && earlyBest.e1rm > 0 ? ((lateBest.e1rm - earlyBest.e1rm) / earlyBest.e1rm) * 100 : null;\n    const allRir = group.rows.map(function (row) { return rformOwnerBotV13Number_(row.RIR); }).filter(function (x) { return x !== null; });\n    const peakWeight = Math.max.apply(null, group.rows.map(function (row) { return rformOwnerBotV13Number_(row.Weight_Kg) || 0; }));\n    const totalVolume = exposures.reduce(function (sum, x) { return sum + x.volume; }, 0);\n    const trend = deltaPct === null ? 'INSUFFICIENT' : deltaPct >= 2 ? 'UP' : deltaPct <= -2 ? 'DOWN' : 'STABLE';\n    return {\n      key: key, label: rformOwnerBotV16ExerciseLabel_(key, group.rows), category: group.category,\n      exposures: exposures, first: exposures[0], last: exposures[exposures.length - 1], best: allBest,\n      earlyBest: earlyBest, lateBest: lateBest, deltaPct: deltaPct, trend: trend, peakWeight: peakWeight,\n      totalVolume: totalVolume, averageRir: rformOwnerBotV13Average_(allRir), setCount: group.rows.length,\n      score: exposures.length * 1000 + rformOwnerBotV16CategoryPriority_(group.category) * 10 + Math.min(99, group.rows.length)\n    };\n  }).filter(Boolean);\n\n  trends.sort(function (a, b) {\n    const aComparable = a.exposures.length >= 2 ? 1 : 0;\n    const bComparable = b.exposures.length >= 2 ? 1 : 0;\n    return bComparable - aComparable || b.score - a.score || a.label.localeCompare(b.label);\n  });\n  return trends.slice(0, RFORM_OWNER_COCKPIT_V13.strengthMaxExercises || 4);\n}\n\nfunction rformOwnerBotV16SetText_(row) {\n  if (!row) return '—';\n  const weight = rformOwnerBotV13Number_(row.Weight_Kg);\n  const reps = rformOwnerBotV13Number_(row.Reps);\n  const rir = rformOwnerBotV13Number_(row.RIR);\n  let text = rformOwnerBotV13Round_(weight, 1) + '×' + rformOwnerBotV13Round_(reps, 0);\n  if (rir !== null) text += ' @RIR ' + rformOwnerBotV13Round_(rir, 1);\n  return text;\n}\n\nfunction rformOwnerBotV16RenderStrengthTrends_(trends) {\n  const lines = ['', 'СИЛОВЫЕ ТРЕНДЫ'];\n  if (!trends || !trends.length) {\n    lines.push('Недостаточно сопоставимых рабочих подходов в TRAINING_SETS.');\n    return lines;\n  }\n  lines.push('e1RM≈ — оценка по весу, повторам и RIR; тренд = лучший показатель ранней vs поздней половины экспозиций.');\n  trends.forEach(function (trend, index) {\n    const arrow = trend.trend === 'UP' ? '↑' : trend.trend === 'DOWN' ? '↓' : trend.trend === 'STABLE' ? '→' : '·';\n    lines.push((index + 1) + '. ' + trend.label + ' · ' + trend.exposures.length + ' сесс.');\n    lines.push('   ' + trend.first.date + ' ' + rformOwnerBotV16SetText_(trend.first.top) + ' → ' + trend.last.date + ' ' + rformOwnerBotV16SetText_(trend.last.top));\n    if (trend.deltaPct !== null && trend.earlyBest && trend.lateBest) {\n      const sign = trend.deltaPct > 0 ? '+' : '';\n      lines.push('   e1RM≈ ' + rformOwnerBotV13Round_(trend.earlyBest.e1rm, 1) + ' → ' + rformOwnerBotV13Round_(trend.lateBest.e1rm, 1) + ' кг · ' + arrow + ' ' + sign + rformOwnerBotV13Round_(trend.deltaPct, 1) + '%');\n    } else {\n      lines.push('   e1RM≈ ' + rformOwnerBotV13Round_(trend.best && trend.best.e1rm, 1) + ' кг · тренд: недостаточно точек');\n    }\n    lines.push('   пик веса ' + rformOwnerBotV13Round_(trend.peakWeight, 1) + ' кг · тоннаж ' + rformOwnerBotV13Round_(trend.totalVolume, 0) + ' кг' +\n      (Number.isFinite(trend.averageRir) ? ' · RIR ср. ' + rformOwnerBotV13Round_(trend.averageRir, 1) : ''));\n  });\n  return lines;\n}\n\n`;

  source = replaceOnce(source, 'function rformOwnerBotV15AnalysisModel_(model) {', helpers + 'function rformOwnerBotV15AnalysisModel_(model) {', 'strength trend helpers');

  source = replaceOnce(
    source,
    "  const avgTrainingDuration = model && model.training && model.training.sessions ? model.training.durationMinutes / model.training.sessions : null;\n  const checks = [];",
    "  const avgTrainingDuration = model && model.training && model.training.sessions ? model.training.durationMinutes / model.training.sessions : null;\n  const strength = rformOwnerBotV16StrengthTrends_(model);\n  const checks = [];",
    'strength trend analysis'
  );

  source = replaceOnce(
    source,
    "      trainingPlan: statusCounts, averageTrainingDuration: avgTrainingDuration\n    },",
    "      trainingPlan: statusCounts, averageTrainingDuration: avgTrainingDuration,\n      strength: strength\n    },",
    'strength trend model output'
  );

  source = replaceOnce(
    source,
    "  lines.push('', 'ПРОБЕЛЫ');",
    "  rformOwnerBotV16RenderStrengthTrends_(t.strength || []).forEach(function (line) { lines.push(line); });\n\n  lines.push('', 'ПРОБЕЛЫ');",
    'strength trend report section'
  );

  if (!source.includes("version: '1.6.0'")) throw new Error('STRENGTH_TRENDS_PATCH: final version missing');
  if (!source.includes("setsSheet: 'TRAINING_SETS'")) throw new Error('STRENGTH_TRENDS_PATCH: TRAINING_SETS source missing');
  if (!source.includes('rformOwnerBotV16StrengthTrends_')) throw new Error('STRENGTH_TRENDS_PATCH: trend engine missing');
  if (!source.includes("'СИЛОВЫЕ ТРЕНДЫ'")) throw new Error('STRENGTH_TRENDS_PATCH: trend report section missing');
  return source;
}

function main() {
  const apply = process.argv.includes('--apply');
  const check = process.argv.includes('--check') || !apply;
  const source = fs.readFileSync(TARGET, 'utf8');
  const output = applyStrengthTrendsPatch(source);
  if (check) {
    new Function(output);
    process.stdout.write('OWNER_BOT_STRENGTH_TRENDS_V1_6_PATCH: PASS\n');
  }
  if (apply) {
    fs.writeFileSync(TARGET, output, 'utf8');
    process.stdout.write('OWNER_BOT_STRENGTH_TRENDS_V1_6_MATERIALIZED\n');
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
