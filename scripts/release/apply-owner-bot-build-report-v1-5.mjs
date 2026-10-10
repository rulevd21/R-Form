import fs from 'node:fs';
import process from 'node:process';

export const TARGET = 'automation/owner_bot_cockpit_v1_3.gs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`BUILD_REPORT_PATCH: missing ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`BUILD_REPORT_PATCH: ${label} is not unique`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function materializationState(source) {
  const markers = [
    '// R/Form Owner Bot Cockpit v1.5 · Daily Cockpit + Period Report + Build Report',
    "version: '1.5.0'",
    "callback_data: buildCallback",
    'rformOwnerBotV15ShowAnalyticalReport_'
  ];
  const hits = markers.filter(function (marker) { return source.includes(marker); }).length;
  if (hits === 0) return 'PRISTINE';
  if (hits === markers.length) return 'MATERIALIZED';
  throw new Error('BUILD_REPORT_PATCH: partial v1.5 materialization');
}

export function applyBuildReportPatch(input) {
  let source = String(input || '');
  const state = materializationState(source);
  if (state === 'MATERIALIZED') return source;

  source = replaceOnce(
    source,
    '// R/Form Owner Bot Cockpit v1.4 · Daily Cockpit + Period Report',
    '// R/Form Owner Bot Cockpit v1.5 · Daily Cockpit + Period Report + Build Report',
    'header version'
  );
  source = replaceOnce(source, "version: '1.4.0'", "version: '1.5.0'", 'runtime version');

  source = replaceOnce(
    source,
    "    daily: {closed: closedDaily.length, missing: missingDaily},",
    "    daily: {closed: closedDaily.length, missing: missingDaily, rows: closedDaily},",
    'daily report rows'
  );
  source = replaceOnce(
    source,
    "      missing: missingNutrition,\n      average: {calories: calorieAvg, protein: proteinAvg, fat: fatAvg, carbs: carbsAvg}",
    "      missing: missingNutrition,\n      rows: closedNutrition,\n      average: {calories: calorieAvg, protein: proteinAvg, fat: fatAvg, carbs: carbsAvg}",
    'nutrition report rows'
  );

  source = replaceOnce(
    source,
    `  return {\n    text: lines.join('\\n').slice(0, 3900),\n    keyboard: [\n      [{text: 'Выбрать другой период', callback_data: 'oc:rp:m'}],\n      [{text: 'Сегодня', callback_data: 'oc:r'}]\n    ]\n  };\n}\n\nfunction rformOwnerBotV13SendReportMenu_() {`,
    `  const buildLabel = model.status === 'READY_FOR_REPORT_BUILD' ? 'Сформировать отчёт' : 'Сформировать черновик';\n  const buildCallback = 'oc:rp:b:' + r.startKey + ':' + r.endKey;\n  return {\n    text: lines.join('\\n').slice(0, 3900),\n    keyboard: [\n      [{text: buildLabel, callback_data: buildCallback}],\n      [{text: 'Выбрать другой период', callback_data: 'oc:rp:m'}],\n      [{text: 'Сегодня', callback_data: 'oc:r'}]\n    ]\n  };\n}\n\nfunction rformOwnerBotV15PlanStatusCounts_(rows) {\n  const out = {above: 0, below: 0, on: 0, other: 0};\n  (rows || []).forEach(function (row) {\n    const status = String(row && row.Plan_Status || '').trim().toUpperCase();\n    if (status === 'ABOVE_PLAN') out.above++;\n    else if (status === 'BELOW_PLAN') out.below++;\n    else if (status === 'ON_PLAN' || status === 'AS_PLANNED') out.on++;\n    else out.other++;\n  });\n  return out;\n}\n\nfunction rformOwnerBotV15DailyAverage_(rows, field) {\n  return rformOwnerBotV13Average_((rows || []).map(function (row) {\n    return rformOwnerBotV13Number_(row && row[field]);\n  }));\n}\n\nfunction rformOwnerBotV15PainMax_(rows) {\n  let max = null;\n  (rows || []).forEach(function (row) {\n    ['Shoulder_Pain','Elbow_Pain','Other_Pain'].forEach(function (field) {\n      const value = rformOwnerBotV13Number_(row && row[field]);\n      if (value !== null && (max === null || value > max)) max = value;\n    });\n  });\n  return max;\n}\n\nfunction rformOwnerBotV15AnalysisModel_(model) {\n  const dailyRows = model && model.daily && Array.isArray(model.daily.rows) ? model.daily.rows : [];\n  const trainingRows = model && model.training && Array.isArray(model.training.rows) ? model.training.rows : [];\n  const statusCounts = rformOwnerBotV15PlanStatusCounts_(trainingRows);\n  const sleepAvg = rformOwnerBotV15DailyAverage_(dailyRows, 'Sleep_Hours');\n  const readinessAvg = rformOwnerBotV15DailyAverage_(dailyRows, 'Readiness');\n  const painMax = rformOwnerBotV15PainMax_(dailyRows);\n  const weightDelta = model && model.weight ? model.weight.last.value - model.weight.first.value : null;\n  const weightPct = model && model.weight && model.weight.first.value ? (weightDelta / model.weight.first.value) * 100 : null;\n  const avgTrainingDuration = model && model.training && model.training.sessions ? model.training.durationMinutes / model.training.sessions : null;\n  const checks = [];\n\n  if (model.status !== 'READY_FOR_REPORT_BUILD') {\n    checks.push('Закрыть или сверить ' + model.closure.missing.length + ' дней без accepted Closure до финального вывода.');\n  }\n  if (model.daily.missing.length) checks.push('Сверить DAILY для ' + model.daily.missing.length + ' закрытых дней.');\n  if (model.nutrition.missing.length) checks.push('Сверить питание для ' + model.nutrition.missing.length + ' закрытых дней.');\n  if (statusCounts.below > 0) checks.push('Разобрать причины ' + statusCounts.below + ' тренировок BELOW_PLAN перед изменением следующего микроцикла.');\n  if (painMax !== null && painMax >= 2) checks.push('Проверить болевой сигнал max ' + rformOwnerBotV13Round_(painMax, 0) + '/10 до прогрессии нагрузки.');\n  if ((readinessAvg !== null && readinessAvg <= 7) || (sleepAvg !== null && sleepAvg < 7)) {\n    checks.push('Сверить восстановление: средние сон/готовность вышли из рабочего ориентира.');\n  }\n  if (weightPct !== null && Math.abs(weightPct) >= 1.5) {\n    checks.push('Сверить изменение веса ' + rformOwnerBotV13Round_(weightPct, 1) + '% с текущей целью питания и композиции тела.');\n  }\n  if (model.range.days >= 28 && !model.measurements.length) {\n    checks.push('Добавить контрольные замеры для периода ≥28 дней.');\n  }\n  if (!checks.length) checks.push('Обязательных корректировок из данных периода не выявлено; сравнить следующий сопоставимый период.');\n\n  return {\n    mode: model.status === 'READY_FOR_REPORT_BUILD' ? 'FINAL' : 'DRAFT',\n    source: model,\n    trends: {\n      weightDelta: weightDelta, weightPct: weightPct,\n      sleepAverage: sleepAvg, readinessAverage: readinessAvg, painMax: painMax,\n      trainingPlan: statusCounts, averageTrainingDuration: avgTrainingDuration\n    },\n    checks: checks\n  };\n}\n\nfunction rformOwnerBotV15RenderAnalyticalReport_(analysis) {\n  const model = analysis.source;\n  const r = model.range;\n  const t = analysis.trends;\n  const lines = [\n    'R/Form · Аналитический отчёт',\n    r.start + ' – ' + r.end + ' · ' + r.days + ' дн.',\n    'Режим: ' + (analysis.mode === 'FINAL' ? 'полный' : 'черновик · неполное покрытие'),\n    '',\n    'ФАКТЫ',\n    'Closure: ' + model.closure.closed + '/' + model.closure.total,\n    'Тренировки: ' + model.training.sessions + ' · ' + rformOwnerBotV13Round_(model.training.durationMinutes, 0) + ' мин',\n    'Питание: ' + model.nutrition.closed + '/' + model.closure.total + ' дней',\n    'Замеры: ' + model.measurements.length + ' записей'\n  ];\n  if (model.weight) {\n    lines.push('Вес: ' + rformOwnerBotV13Round_(model.weight.first.value, 2) + ' → ' + rformOwnerBotV13Round_(model.weight.last.value, 2) + ' кг');\n  } else lines.push('Вес: данных недостаточно');\n\n  lines.push('', 'ТРЕНДЫ');\n  if (t.weightDelta !== null) {\n    lines.push('Вес: ' + (t.weightDelta >= 0 ? '+' : '') + rformOwnerBotV13Round_(t.weightDelta, 2) + ' кг · ' +\n      (t.weightPct >= 0 ? '+' : '') + rformOwnerBotV13Round_(t.weightPct, 1) + '%');\n  }\n  if (Number.isFinite(t.sleepAverage) || Number.isFinite(t.readinessAverage) || t.painMax !== null) {\n    lines.push('Состояние: сон ' + rformOwnerBotV13Round_(t.sleepAverage, 1) + ' ч · готовность ' +\n      rformOwnerBotV13Round_(t.readinessAverage, 1) + '/10 · боль max ' + rformOwnerBotV13Round_(t.painMax, 0) + '/10');\n  }\n  lines.push('Тренировки план/факт: ABOVE ' + t.trainingPlan.above + ' · ON ' + t.trainingPlan.on + ' · BELOW ' + t.trainingPlan.below +\n    (t.trainingPlan.other ? ' · OTHER ' + t.trainingPlan.other : '') +\n    (Number.isFinite(t.averageTrainingDuration) ? ' · средняя ' + rformOwnerBotV13Round_(t.averageTrainingDuration, 0) + ' мин' : ''));\n  if (Number.isFinite(model.nutrition.average.calories)) {\n    lines.push('Питание среднее: ≈' + rformOwnerBotV13Round_(model.nutrition.average.calories, 0) + ' ккал · Б ' +\n      rformOwnerBotV13Round_(model.nutrition.average.protein, 1) + ' · Ж ' + rformOwnerBotV13Round_(model.nutrition.average.fat, 1) +\n      ' · У ' + rformOwnerBotV13Round_(model.nutrition.average.carbs, 1));\n  }\n\n  lines.push('', 'ПРОБЕЛЫ');\n  if (!model.data_gaps) lines.push('Нет по Closure / DAILY / Nutrition.');\n  else {\n    if (model.closure.missing.length) lines.push('• Closure: ' + rformOwnerBotV13CompactDates_(model.closure.missing, 8));\n    if (model.daily.missing.length) lines.push('• DAILY: ' + rformOwnerBotV13CompactDates_(model.daily.missing, 8));\n    if (model.nutrition.missing.length) lines.push('• Nutrition: ' + rformOwnerBotV13CompactDates_(model.nutrition.missing, 8));\n  }\n\n  lines.push('', 'СЛЕДУЮЩИЕ ПРОВЕРКИ');\n  analysis.checks.slice(0, 5).forEach(function (check, index) { lines.push((index + 1) + '. ' + check); });\n  return {\n    text: lines.join('\\n').slice(0, 3900),\n    keyboard: [\n      [{text: 'К сводке периода', callback_data: 'oc:rp:v:' + r.startKey + ':' + r.endKey}],\n      [{text: 'Выбрать другой период', callback_data: 'oc:rp:m'}],\n      [{text: 'Сегодня', callback_data: 'oc:r'}]\n    ]\n  };\n}\n\nfunction rformOwnerBotV15ShowAnalyticalReport_(startText, endText) {\n  let stage = 'ANALYSIS_SOURCE_READ';\n  try {\n    const bundle = rformOwnerBotV13ReadReportBundle_();\n    stage = 'ANALYSIS_MODEL';\n    const periodModel = rformOwnerBotV13ReportModel_(startText, endText, bundle, rformOwnerBotV13Today_());\n    const analysis = rformOwnerBotV15AnalysisModel_(periodModel);\n    stage = 'ANALYSIS_RENDER';\n    const rendered = rformOwnerBotV15RenderAnalyticalReport_(analysis);\n    stage = 'TELEGRAM_SEND';\n    return rformOwnerBotV1SendOwnerText_(rendered.text, {\n      disable_notification: true,\n      reply_markup: JSON.stringify({inline_keyboard: rendered.keyboard})\n    });\n  } catch (error) {\n    try { console.warn(JSON.stringify({event:'OWNER_BUILD_REPORT_FAILED',version:RFORM_OWNER_COCKPIT_V13.version,stage:stage})); } catch (_) {}\n    if (stage !== 'TELEGRAM_SEND') {\n      return rformOwnerBotV1SendOwnerText_('Не удалось построить аналитический отчёт. Код: ' + stage + '. Данные не изменены.');\n    }\n    throw error;\n  }\n}\n\nfunction rformOwnerBotV13SendReportMenu_() {`,
    'report action and analytical renderer'
  );

  source = replaceOnce(
    source,
    `  if (data === 'oc:rp:c') {\n    const p = rformOwnerBotV13DateParts_(today);\n    rformOwnerBotV13SendCalendar_('s', p.key.slice(0,6), ''); return;\n  }\n  let m = data.match(/^oc:rp:cal:([se]):(\\d{6})(?::(\\d{8}))?$/);`,
    `  if (data === 'oc:rp:c') {\n    const p = rformOwnerBotV13DateParts_(today);\n    rformOwnerBotV13SendCalendar_('s', p.key.slice(0,6), ''); return;\n  }\n  const build = data.match(/^oc:rp:b:(\\d{8}):(\\d{8})$/);\n  if (build) {\n    rformOwnerBotV15ShowAnalyticalReport_(rformOwnerBotV13DateTextFromKey_(build[1]), rformOwnerBotV13DateTextFromKey_(build[2]));\n    return;\n  }\n  const view = data.match(/^oc:rp:v:(\\d{8}):(\\d{8})$/);\n  if (view) {\n    rformOwnerBotV13ShowReport_(rformOwnerBotV13DateTextFromKey_(view[1]), rformOwnerBotV13DateTextFromKey_(view[2]));\n    return;\n  }\n  let m = data.match(/^oc:rp:cal:([se]):(\\d{6})(?::(\\d{8}))?$/);`,
    'build-report callback route'
  );

  if (!source.includes("version: '1.5.0'")) throw new Error('BUILD_REPORT_PATCH: final version missing');
  if (!source.includes("callback_data: buildCallback")) throw new Error('BUILD_REPORT_PATCH: build button missing');
  if (!source.includes('rformOwnerBotV15ShowAnalyticalReport_')) throw new Error('BUILD_REPORT_PATCH: analytical report path missing');
  return source;
}

function main() {
  const apply = process.argv.includes('--apply');
  const check = process.argv.includes('--check') || !apply;
  const source = fs.readFileSync(TARGET, 'utf8');
  const output = applyBuildReportPatch(source);
  if (check) {
    new Function(output);
    process.stdout.write('OWNER_BOT_BUILD_REPORT_V1_5_PATCH: PASS\n');
  }
  if (apply) {
    fs.writeFileSync(TARGET, output, 'utf8');
    process.stdout.write('OWNER_BOT_BUILD_REPORT_V1_5_MATERIALIZED\n');
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();