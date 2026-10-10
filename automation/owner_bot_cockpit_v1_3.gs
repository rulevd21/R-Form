// R/Form Owner Bot Cockpit v1.6 · Daily Cockpit + Period Report + Strength Trends
// Read model only. Reads canonical Master Data directly for the daily cockpit and reports.
// Owner mutations still use the existing Content Control API.
// No new datastore, publisher, router or trigger.

const RFORM_OWNER_COCKPIT_V13 = Object.freeze({
  version: '1.6.0',
  timezone: 'Europe/Moscow',
  queueSheet: 'CONTENT_QUEUE',
  closureSheet: 'DAY_CLOSURE',
  eventsSheet: 'DATA_EVENTS',
  dailySheet: 'DAILY',
  nutritionDailySheet: 'NUTRITION_DAILY',
  sessionsSheet: 'TRAINING_SESSIONS',
  setsSheet: 'TRAINING_SETS',
  measurementsSheet: 'MEASUREMENTS',
  maxOwnerDecisions: 3,
  strengthMaxExercises: 4,
  reportMaxDays: 366,
  terminalEventStatuses: Object.freeze([
    'PUBLISHED', 'ALREADY_IN_PIPELINE', 'FILTERED_OUT_V03', 'AGGREGATE_TO_WEEKLY',
    'AGGREGATE_ONLY', 'DISMISSED', 'SUPERSEDED', 'ARCHIVED', 'CLOSED'
  ]),
  terminalOwnerReviewStatuses: Object.freeze(['PUBLICATION', 'WEEKLY', 'DISMISSED'])
});

function rformOwnerBotV13CockpitSelfTest() {
  const closure = {
    found: true, date: '10.10.2026', day_id: 'D-20261010',
    close_request: '', close_readiness: 'READY', blocking_issues: '', closed_at: ''
  };
  const bundle = {
    queue: [{
      Content_ID: 'CNT-TEST', Date: '10.10.2026', Rubric: 'WEEKLY_CONTROL',
      Public_Data_Allowed: 'YES', Publication_Status: 'PLANNED',
      Current_Stage: 'OWNER_FINAL_PREVIEW', Duplicate_Flag: '', Publish_Error: '',
      Blocking_Issue: '', Telegram_Post_Mode: 'TEXT_ONLY', Telegram_Text: 'Тест',
      Telegram_Visual_URL: '', Updated_At: '10.10.2026 10:00'
    }],
    events: [{
      Event_ID: 'EVT-TEST', Date: '10.10.2026', Fact: 'Факт',
      Content_Value_Score: '90', Manual_Gate: 'YES · OWNER', Status: 'OWNER_GATE',
      Owner_Action: 'Approve interpretation', Owner_Review_Status: '',
      Recommended_Angle_1: 'Главная мысль'
    }]
  };
  const model = rformOwnerBotV13CockpitModel_(closure, bundle);
  if (model.owner_decisions.length !== 3) throw new Error('COCKPIT_SELF_TEST: decision count.');
  if (model.owner_decisions[0].kind !== 'CONTENT_PREVIEW') throw new Error('COCKPIT_SELF_TEST: priority.');
  if (!model.owner_decisions.some(function (x) { return x.kind === 'DAY_CLOSE'; })) {
    throw new Error('COCKPIT_SELF_TEST: closure action.');
  }
  if (!model.owner_decisions.some(function (x) { return x.kind === 'EVENT_GATE'; })) {
    throw new Error('COCKPIT_SELF_TEST: event gate.');
  }
  return {ok: true, version: RFORM_OWNER_COCKPIT_V13.version, decisions: model.owner_decisions.length};
}

function rformOwnerBotV13SendCockpit_() {
  let stage = 'CONTENT_QUEUE_READ';
  try {
    const bundle = {queue: rformOwnerBotV13ReadQueue_()};
    stage = 'DATA_EVENTS_READ';
    bundle.events = rformOwnerBotV13ReadEvents_();
    stage = 'CLOSURE_READ';
    const closure = rformOwnerBotV13ReadClosure_();
    stage = 'MODEL_RENDER';
    const model = rformOwnerBotV13CockpitModel_(closure, bundle);
    const rendered = rformOwnerBotV13RenderCockpit_(model);
    stage = 'TELEGRAM_SEND';
    return rformOwnerBotV1SendOwnerText_(rendered.text, {
      disable_notification: true,
      reply_markup: JSON.stringify({inline_keyboard: rendered.keyboard})
    });
  } catch (error) {
    try {
      console.warn(JSON.stringify({
        event: 'OWNER_COCKPIT_FAILED',
        version: RFORM_OWNER_COCKPIT_V13.version,
        stage: stage
      }));
    } catch (_) {}
    if (stage !== 'TELEGRAM_SEND') {
      try {
        return rformOwnerBotV1SendOwnerText_(
          'Не удалось открыть «Сегодня». Код: ' + stage + '. Данные не изменены.'
        );
      } catch (_) {}
    }
    throw error;
  }
}

function rformOwnerBotV13BuildCockpit_() {
  const bundle = {
    queue: rformOwnerBotV13ReadQueue_(),
    events: rformOwnerBotV13ReadEvents_()
  };
  const closure = rformOwnerBotV13ReadClosure_();
  return rformOwnerBotV13CockpitModel_(closure, bundle);
}

// /today and period reports are read models over the same canonical Master Data.
// All owner mutations remain behind Content Control API.
function rformOwnerBotV13ReadRows_(sheetName, idField) {
  const ss = SpreadsheetApp.openById(RFORM_OWNER_BOT_V1.spreadsheetId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(sheetName + ' sheet unavailable.');
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(function (x) { return String(x || '').trim(); });
  if (headers.indexOf(idField) === -1) throw new Error(sheetName + ' schema mismatch.');
  return values.slice(1).map(function (row) {
    const out = {};
    headers.forEach(function (name, index) {
      if (name) out[name] = String(row[index] || '').trim();
    });
    return out;
  }).filter(function (row) { return !!row[idField]; });
}

function rformOwnerBotV13ReadQueue_() {
  return rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.queueSheet, 'Content_ID');
}

function rformOwnerBotV13ReadEvents_() {
  return rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.eventsSheet, 'Event_ID');
}

function rformOwnerBotV13ReadReportBundle_() {
  return {
    closures: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.closureSheet, 'Day_ID'),
    daily: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.dailySheet, 'Day_ID'),
    nutrition: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.nutritionDailySheet, 'Day_ID'),
    sessions: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.sessionsSheet, 'Session_ID'),
    sets: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.setsSheet, 'Set_ID'),
    measurements: rformOwnerBotV13ReadRows_(RFORM_OWNER_COCKPIT_V13.measurementsSheet, 'Measurement_ID')
  };
}

// Compatibility helper used by existing cockpit callbacks: read side is direct/canonical,
// mutation side remains Content Control API.
function rformOwnerBotV13ApiRead_() {
  return {
    queue: rformOwnerBotV13ReadQueue_(),
    events: rformOwnerBotV13ReadEvents_()
  };
}

function rformOwnerBotV13ReadClosure_() {
  const ss = SpreadsheetApp.openById(RFORM_OWNER_BOT_V1.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_OWNER_COCKPIT_V13.closureSheet);
  const now = new Date();
  const dateText = Utilities.formatDate(now, RFORM_OWNER_COCKPIT_V13.timezone, 'dd.MM.yyyy');
  const dateIso = Utilities.formatDate(now, RFORM_OWNER_COCKPIT_V13.timezone, 'yyyy-MM-dd');
  const dayId = 'D-' + Utilities.formatDate(now, RFORM_OWNER_COCKPIT_V13.timezone, 'yyyyMMdd');
  if (!sheet || sheet.getLastRow() < 2) {
    return {found: false, date: dateText, day_id: dayId, close_request: '', close_readiness: '', blocking_issues: '', closed_at: ''};
  }
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(function (x) { return String(x || '').trim(); });
  const map = {};
  headers.forEach(function (name, index) { if (name) map[name] = index; });
  const cell = function (row, name) {
    return map[name] === undefined ? '' : String(row[map[name]] || '').trim();
  };
  const matches = values.slice(1).filter(function (row) {
    const id = cell(row, 'Day_ID');
    const date = cell(row, 'Date');
    return id === dayId || date === dateText || date === dateIso;
  });
  if (!matches.length) {
    return {found: false, date: dateText, day_id: dayId, close_request: '', close_readiness: '', blocking_issues: '', closed_at: ''};
  }
  const row = matches[matches.length - 1];
  return {
    found: true,
    date: cell(row, 'Date') || dateText,
    day_id: cell(row, 'Day_ID') || dayId,
    close_request: cell(row, 'Close_Request'),
    close_readiness: cell(row, 'Close_Readiness'),
    blocking_issues: cell(row, 'Blocking_Issues'),
    closed_at: cell(row, 'Closed_At')
  };
}

function rformOwnerBotV13CockpitModel_(closure, bundle) {
  const queue = Array.isArray(bundle && bundle.queue) ? bundle.queue : [];
  const events = Array.isArray(bundle && bundle.events) ? bundle.events : [];
  const ready = rformOwnerBotV1ReadyItems_(queue);
  const openQueue = queue.filter(function (q) {
    return ['published', 'archived'].indexOf(rformOwnerBotV1MaterialSection_(q)) === -1;
  });
  const actionableEvents = events.filter(rformOwnerBotV13EventNeedsOwner_)
    .sort(function (a, b) {
      const score = function (x) { const n = Number(x.Content_Value_Score || 0); return Number.isFinite(n) ? n : 0; };
      return score(b) - score(a) || rformOwnerBotV1DateSort_(b) - rformOwnerBotV1DateSort_(a);
    });

  const decisions = [];
  ready.forEach(function (item) {
    decisions.push({
      kind: 'CONTENT_PREVIEW', priority: 300,
      id: String(item.Content_ID || ''), token: rformOwnerBotV1ItemToken_(item),
      title: rformOwnerBotV1MaterialTitle_(item),
      action: 'Проверить финальный предпросмотр: согласовать, изменить или отложить.'
    });
  });

  if (rformOwnerBotV13ClosureNeedsOwner_(closure)) {
    decisions.push({
      kind: 'DAY_CLOSE', priority: 250, id: String(closure.day_id || ''),
      title: 'Закрытие дня', action: 'День готов к закрытию. Требуется явное решение владельца «Закрой день».'
    });
  }

  actionableEvents.forEach(function (event) {
    decisions.push({
      kind: 'EVENT_GATE', priority: 200 + Math.min(99, Number(event.Content_Value_Score || 0) || 0),
      id: String(event.Event_ID || ''), token: rformOwnerBotV13EventToken_(event),
      title: String(event.Fact || event.Event_Type || event.Event_ID || '').slice(0, 180),
      action: String(event.Owner_Action || 'Нужно редакционное решение владельца.'),
      event: event
    });
  });

  decisions.sort(function (a, b) { return b.priority - a.priority; });
  return {
    generated_at: new Date().toISOString(),
    date: closure && closure.date ? closure.date : Utilities.formatDate(new Date(), RFORM_OWNER_COCKPIT_V13.timezone, 'dd.MM.yyyy'),
    closure: closure || {found: false},
    event_counts: {total: events.length, owner_gate: actionableEvents.length},
    queue_counts: {open: openQueue.length, final_preview: ready.length},
    owner_decision_total: decisions.length,
    owner_decisions: decisions.slice(0, RFORM_OWNER_COCKPIT_V13.maxOwnerDecisions)
  };
}

function rformOwnerBotV13ClosureNeedsOwner_(closure) {
  if (!closure || closure.closed_at) return false;
  const readiness = String(closure.close_readiness || '').trim().toUpperCase();
  const request = String(closure.close_request || '').trim().toUpperCase();
  if (!/READY|ГОТОВ/.test(readiness)) return false;
  if (String(closure.blocking_issues || '').trim()) return false;
  return ['YES', 'TRUE', '1', 'REQUESTED', 'CLOSE', 'CLOSED'].indexOf(request) === -1;
}

function rformOwnerBotV13EventNeedsOwner_(event) {
  if (!event || !event.Event_ID) return false;
  const status = String(event.Status || '').trim().toUpperCase();
  const ownerStatus = String(event.Owner_Review_Status || '').trim().toUpperCase();
  const gate = String(event.Manual_Gate || '').trim().toUpperCase();
  const ownerAction = String(event.Owner_Action || '').trim();
  if (RFORM_OWNER_COCKPIT_V13.terminalEventStatuses.indexOf(status) !== -1) return false;
  if (RFORM_OWNER_COCKPIT_V13.terminalOwnerReviewStatuses.indexOf(ownerStatus) !== -1) return false;
  if (String(event.Candidate_Content_ID || '').trim() && status === 'ALREADY_IN_PIPELINE') return false;
  const explicitGate = /^YES\b/.test(gate) || status === 'OWNER_GATE';
  const explicitAction = ownerAction && !/^NONE\b/i.test(ownerAction);
  return explicitGate || explicitAction;
}

function rformOwnerBotV13EventToken_(event) {
  return rformOwnerBotV1Sha256Hex_(String(event.Event_ID || '')).slice(0, 12);
}

function rformOwnerBotV13RenderCockpit_(model) {
  const closure = model.closure || {};
  let closureState = 'нет записи закрытия';
  if (closure.closed_at) closureState = 'закрыт';
  else if (String(closure.close_readiness || '').trim()) closureState = String(closure.close_readiness).trim();
  else if (closure.found) closureState = 'открыт';
  const blockers = String(closure.blocking_issues || '').trim();
  if (blockers) closureState += ' · есть блокер';

  const lines = [
    'R/Form · Сегодня · ' + model.date,
    '',
    'Closure: ' + closureState,
    'DATA_EVENTS: ' + model.event_counts.total + ' · решений владельца ' + model.event_counts.owner_gate,
    'Content Queue: ' + model.queue_counts.open + ' в работе · final preview ' + model.queue_counts.final_preview,
    '',
    'Нужно от вас · ' + model.owner_decision_total
  ];
  const keyboard = [];
  if (!model.owner_decisions.length) {
    lines.push('Ничего. Система не требует решения владельца.');
  } else {
    model.owner_decisions.forEach(function (decision, index) {
      lines.push((index + 1) + '. ' + decision.title);
      lines.push('   ' + decision.action);
      if (decision.kind === 'CONTENT_PREVIEW') {
        keyboard.push([{text: 'Открыть · ' + decision.id.slice(-24), callback_data: 'ow:open:' + decision.token}]);
      } else if (decision.kind === 'EVENT_GATE') {
        keyboard.push([
          {text: 'В публикацию', callback_data: 'oc:e:p:' + decision.token},
          {text: 'В Weekly', callback_data: 'oc:e:w:' + decision.token},
          {text: 'Не использовать', callback_data: 'oc:e:d:' + decision.token}
        ]);
      }
    });
    if (model.owner_decision_total > model.owner_decisions.length) {
      lines.push('+' + (model.owner_decision_total - model.owner_decisions.length) + ' менее срочных решений скрыто.');
    }
  }
  keyboard.push([{text: 'Отчёт за период', callback_data: 'oc:rp:m'}]);
  keyboard.push([{text: 'Обновить', callback_data: 'oc:r'}]);
  keyboard.push([{text: 'Материалы', callback_data: 'ow:menu'}]);
  return {text: lines.join('\n').slice(0, 3900), keyboard: keyboard};
}

function rformOwnerBotV13Today_() {
  return Utilities.formatDate(new Date(), RFORM_OWNER_COCKPIT_V13.timezone, 'dd.MM.yyyy');
}

function rformOwnerBotV13DateParts_(value) {
  const text = String(value || '').trim();
  let m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) {
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) m = [iso[0], iso[3], iso[2], iso[1]];
  }
  if (!m) return null;
  const d = Number(m[1]), month = Number(m[2]), y = Number(m[3]);
  if (!Number.isInteger(y) || y < 1900 || y > 2200 || !Number.isInteger(month) || !Number.isInteger(d)) return null;
  const ms = Date.UTC(y, month - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== d) return null;
  const pad = function (x) { return ('0' + x).slice(-2); };
  return {y: y, m: month, d: d, ms: ms, key: String(y) + pad(month) + pad(d), text: pad(d) + '.' + pad(month) + '.' + y};
}

function rformOwnerBotV13DateTextFromMs_(ms) {
  const dt = new Date(ms);
  const pad = function (x) { return ('0' + x).slice(-2); };
  return pad(dt.getUTCDate()) + '.' + pad(dt.getUTCMonth() + 1) + '.' + dt.getUTCFullYear();
}

function rformOwnerBotV13DateTextFromKey_(key) {
  const m = String(key || '').match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
}

function rformOwnerBotV13AddDays_(text, days) {
  const p = rformOwnerBotV13DateParts_(text);
  if (!p) throw new Error('Некорректная дата.');
  return rformOwnerBotV13DateTextFromMs_(p.ms + Number(days || 0) * 86400000);
}

function rformOwnerBotV13ValidateRange_(startText, endText, todayText) {
  const start = rformOwnerBotV13DateParts_(startText);
  const end = rformOwnerBotV13DateParts_(endText);
  const today = rformOwnerBotV13DateParts_(todayText || rformOwnerBotV13Today_());
  if (!start || !end || !today) throw new Error('Диапазон содержит некорректную дату.');
  if (start.ms > end.ms) throw new Error('Дата начала позже даты окончания.');
  if (end.ms > today.ms) throw new Error('Дата окончания не может быть в будущем.');
  const days = Math.floor((end.ms - start.ms) / 86400000) + 1;
  if (days < 1 || days > RFORM_OWNER_COCKPIT_V13.reportMaxDays) {
    throw new Error('Период отчёта должен быть от 1 до ' + RFORM_OWNER_COCKPIT_V13.reportMaxDays + ' дней.');
  }
  return {start: start.text, end: end.text, startKey: start.key, endKey: end.key, days: days};
}

function rformOwnerBotV13RangeDays_(startText, endText, todayText) {
  const range = rformOwnerBotV13ValidateRange_(startText, endText, todayText);
  const out = [];
  const start = rformOwnerBotV13DateParts_(range.start);
  for (let i = 0; i < range.days; i++) out.push(rformOwnerBotV13DateTextFromMs_(start.ms + i * 86400000));
  return out;
}

function rformOwnerBotV13PresetRange_(kind, todayText) {
  const today = rformOwnerBotV13DateParts_(todayText || rformOwnerBotV13Today_());
  if (!today) throw new Error('Не удалось определить текущую дату.');
  if (kind === 'week') {
    const weekday = new Date(today.ms).getUTCDay();
    const start = rformOwnerBotV13DateTextFromMs_(today.ms - weekday * 86400000);
    return rformOwnerBotV13ValidateRange_(start, today.text, today.text);
  }
  if (kind === 'month') {
    const start = '01.' + ('0' + today.m).slice(-2) + '.' + today.y;
    return rformOwnerBotV13ValidateRange_(start, today.text, today.text);
  }
  if (kind === '30') {
    return rformOwnerBotV13ValidateRange_(rformOwnerBotV13DateTextFromMs_(today.ms - 29 * 86400000), today.text, today.text);
  }
  throw new Error('Неизвестный тип периода.');
}

function rformOwnerBotV13ClosureAcceptedRow_(row) {
  if (!row) return false;
  const requested = /^(REQUESTED|YES|TRUE|1|CLOSE)$/i.test(String(row.Close_Request || '').trim());
  const ready = /^(READY|CLOSED)$/i.test(String(row.Close_Readiness || '').trim());
  const blockers = String(row.Blocking_Issues || '').trim();
  const closedAt = String(row.Closed_At || '').trim();
  const dup = String(row.Duplicate_Count || '').trim();
  const qa = String(row.Open_QA_Count || '').trim();
  const zeroOrBlank = function (x) { return x === '' || Number(x) === 0; };
  return requested && ready && !blockers && !!closedAt && zeroOrBlank(dup) && zeroOrBlank(qa);
}

function rformOwnerBotV13InRange_(dateText, range) {
  const p = rformOwnerBotV13DateParts_(dateText);
  return !!(p && p.key >= range.startKey && p.key <= range.endKey);
}

function rformOwnerBotV13Number_(value) {
  const text = String(value === null || value === undefined ? '' : value).trim().replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function rformOwnerBotV13Average_(values) {
  const nums = (values || []).filter(function (x) { return Number.isFinite(x); });
  if (!nums.length) return null;
  return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
}

function rformOwnerBotV13Midpoint_(row, minField, maxField) {
  const min = rformOwnerBotV13Number_(row && row[minField]);
  const max = rformOwnerBotV13Number_(row && row[maxField]);
  if (min === null && max === null) return null;
  if (min === null) return max;
  if (max === null) return min;
  return (min + max) / 2;
}

function rformOwnerBotV13ReportModel_(startText, endText, bundle, todayText) {
  const range = rformOwnerBotV13ValidateRange_(startText, endText, todayText || rformOwnerBotV13Today_());
  const days = rformOwnerBotV13RangeDays_(range.start, range.end, todayText || rformOwnerBotV13Today_());
  const closures = Array.isArray(bundle && bundle.closures) ? bundle.closures : [];
  const daily = Array.isArray(bundle && bundle.daily) ? bundle.daily : [];
  const nutrition = Array.isArray(bundle && bundle.nutrition) ? bundle.nutrition : [];
  const sessions = Array.isArray(bundle && bundle.sessions) ? bundle.sessions : [];
  const sets = Array.isArray(bundle && bundle.sets) ? bundle.sets : [];
  const measurements = Array.isArray(bundle && bundle.measurements) ? bundle.measurements : [];

  const closureByDate = {};
  closures.forEach(function (row) {
    const p = rformOwnerBotV13DateParts_(row.Date);
    if (p && rformOwnerBotV13InRange_(p.text, range)) closureByDate[p.text] = row;
  });
  const accepted = {};
  const missingClosure = [];
  days.forEach(function (date) {
    if (rformOwnerBotV13ClosureAcceptedRow_(closureByDate[date])) accepted[date] = true;
    else missingClosure.push(date);
  });

  const closedDaily = daily.filter(function (row) {
    const p = rformOwnerBotV13DateParts_(row.Date);
    return !!(p && accepted[p.text] && String(row.Day_Status || '').trim().toUpperCase() === 'CLOSED' && !String(row.Duplicate_Flag || '').trim());
  }).sort(function (a, b) { return rformOwnerBotV13DateParts_(a.Date).key.localeCompare(rformOwnerBotV13DateParts_(b.Date).key); });
  const dailyDates = {};
  closedDaily.forEach(function (row) { dailyDates[rformOwnerBotV13DateParts_(row.Date).text] = true; });

  const closedNutrition = nutrition.filter(function (row) {
    const p = rformOwnerBotV13DateParts_(row.Date);
    return !!(p && accepted[p.text] && String(row.Status || '').trim().toUpperCase() === 'CLOSED' && !String(row.Duplicate_Flag || '').trim());
  });
  const nutritionDates = {};
  closedNutrition.forEach(function (row) { nutritionDates[rformOwnerBotV13DateParts_(row.Date).text] = true; });

  const closedSessions = sessions.filter(function (row) {
    const p = rformOwnerBotV13DateParts_(row.Date);
    return !!(p && accepted[p.text] && String(row.Session_Status || '').trim().toUpperCase() === 'CLOSED' && !String(row.Duplicate_Flag || '').trim());
  }).sort(function (a, b) { return rformOwnerBotV13DateParts_(a.Date).key.localeCompare(rformOwnerBotV13DateParts_(b.Date).key); });
  const closedSessionIds = {};
  closedSessions.forEach(function (row) { closedSessionIds[String(row.Session_ID || '').trim()] = true; });
  const periodSets = sets.filter(function (row) {
    return !!closedSessionIds[String(row.Session_ID || '').trim()] && !String(row.Duplicate_Flag || '').trim();
  });

  const periodMeasurements = measurements.filter(function (row) {
    return rformOwnerBotV13InRange_(row.Date, range) && !String(row.Duplicate_Flag || '').trim() &&
      (!String(row.Comparable || '').trim() || String(row.Comparable || '').trim().toUpperCase() === 'YES');
  });

  const weights = closedDaily.map(function (row) {
    const value = rformOwnerBotV13Number_(row.Morning_Weight);
    return value === null ? null : {date: rformOwnerBotV13DateParts_(row.Date).text, value: value};
  }).filter(Boolean);
  const duration = closedSessions.map(function (row) { return rformOwnerBotV13Number_(row.Actual_Duration); }).filter(function (x) { return x !== null; });
  const calorieAvg = rformOwnerBotV13Average_(closedNutrition.map(function (row) { return rformOwnerBotV13Midpoint_(row, 'Calories_Min', 'Calories_Max'); }));
  const proteinAvg = rformOwnerBotV13Average_(closedNutrition.map(function (row) { return rformOwnerBotV13Midpoint_(row, 'Protein_Min', 'Protein_Max'); }));
  const fatAvg = rformOwnerBotV13Average_(closedNutrition.map(function (row) { return rformOwnerBotV13Midpoint_(row, 'Fat_Min', 'Fat_Max'); }));
  const carbsAvg = rformOwnerBotV13Average_(closedNutrition.map(function (row) { return rformOwnerBotV13Midpoint_(row, 'Carbs_Min', 'Carbs_Max'); }));

  const acceptedDates = days.filter(function (date) { return !!accepted[date]; });
  const missingDaily = acceptedDates.filter(function (date) { return !dailyDates[date]; });
  const missingNutrition = acceptedDates.filter(function (date) { return !nutritionDates[date]; });
  return {
    range: range,
    status: missingClosure.length ? 'DRAFT_ONLY' : 'READY_FOR_REPORT_BUILD',
    closure: {closed: acceptedDates.length, total: days.length, missing: missingClosure},
    daily: {closed: closedDaily.length, missing: missingDaily, rows: closedDaily},
    nutrition: {
      closed: Object.keys(nutritionDates).length,
      missing: missingNutrition,
      rows: closedNutrition,
      average: {calories: calorieAvg, protein: proteinAvg, fat: fatAvg, carbs: carbsAvg}
    },
    training: {
      sessions: closedSessions.length,
      durationMinutes: duration.reduce(function (a, b) { return a + b; }, 0),
      rows: closedSessions,
      sets: periodSets
    },
    weight: weights.length ? {
      first: weights[0], last: weights[weights.length - 1], average: rformOwnerBotV13Average_(weights.map(function (x) { return x.value; }))
    } : null,
    measurements: periodMeasurements,
    data_gaps: missingClosure.length + missingDaily.length + missingNutrition.length
  };
}

function rformOwnerBotV13Round_(value, digits) {
  if (!Number.isFinite(value)) return '—';
  const factor = Math.pow(10, digits || 0);
  return String(Math.round(value * factor) / factor).replace('.', ',');
}

function rformOwnerBotV13CompactDates_(dates, limit) {
  const rows = (dates || []).slice(0, limit || 8);
  const tail = (dates || []).length > rows.length ? ' +' + ((dates || []).length - rows.length) : '';
  return rows.join(', ') + tail;
}

function rformOwnerBotV13RenderReport_(model) {
  const r = model.range;
  const lines = [
    'R/Form · Отчёт за период',
    r.start + ' – ' + r.end + ' · ' + r.days + ' дн.',
    '',
    'Статус: ' + model.status,
    'Closure: ' + model.closure.closed + '/' + model.closure.total,
    'Тренировки: ' + model.training.sessions + ' закрыто' + (model.training.durationMinutes ? ' · ' + rformOwnerBotV13Round_(model.training.durationMinutes, 0) + ' мин' : ''),
    'Питание: ' + model.nutrition.closed + '/' + model.closure.total + ' дней'
  ];
  if (model.weight) {
    lines.push('Вес: ' + rformOwnerBotV13Round_(model.weight.first.value, 2) + ' → ' + rformOwnerBotV13Round_(model.weight.last.value, 2) +
      ' кг · среднее ' + rformOwnerBotV13Round_(model.weight.average, 2));
  } else lines.push('Вес: нет закрытых измерений в периоде');
  if (Number.isFinite(model.nutrition.average.calories)) {
    lines.push('Среднее питание: ≈' + rformOwnerBotV13Round_(model.nutrition.average.calories, 0) + ' ккал · Б ' +
      rformOwnerBotV13Round_(model.nutrition.average.protein, 1) + ' · Ж ' + rformOwnerBotV13Round_(model.nutrition.average.fat, 1) +
      ' · У ' + rformOwnerBotV13Round_(model.nutrition.average.carbs, 1));
  }
  if (model.measurements.length) lines.push('Замеры: ' + model.measurements.length + ' записей');
  if (model.training.rows.length) {
    lines.push('', 'Тренировки:');
    model.training.rows.slice(-5).forEach(function (row) {
      lines.push('• ' + String(row.Date || '') + ' · ' + String(row.Session_Type || row.Session_ID || '') +
        (row.Plan_Status ? ' · ' + row.Plan_Status : '') + (row.Actual_Duration ? ' · ' + row.Actual_Duration + ' мин' : ''));
    });
    if (model.training.rows.length > 5) lines.push('• +' + (model.training.rows.length - 5) + ' тренировок в периоде');
  }
  if (model.closure.missing.length || model.daily.missing.length || model.nutrition.missing.length) {
    lines.push('', 'Пробелы:');
    if (model.closure.missing.length) lines.push('• Closure: ' + rformOwnerBotV13CompactDates_(model.closure.missing, 8));
    if (model.daily.missing.length) lines.push('• DAILY: ' + rformOwnerBotV13CompactDates_(model.daily.missing, 8));
    if (model.nutrition.missing.length) lines.push('• Nutrition: ' + rformOwnerBotV13CompactDates_(model.nutrition.missing, 8));
  }
  lines.push('', model.status === 'READY_FOR_REPORT_BUILD'
    ? 'Все дни периода прошли canonical Closure. Период готов к аналитическому отчёту.'
    : 'Черновой режим: финальный отчёт нельзя считать полным до закрытия всех дней периода.');
  const buildLabel = model.status === 'READY_FOR_REPORT_BUILD' ? 'Сформировать отчёт' : 'Сформировать черновик';
  const buildCallback = 'oc:rp:b:' + r.startKey + ':' + r.endKey;
  return {
    text: lines.join('\n').slice(0, 3900),
    keyboard: [
      [{text: buildLabel, callback_data: buildCallback}],
      [{text: 'Выбрать другой период', callback_data: 'oc:rp:m'}],
      [{text: 'Сегодня', callback_data: 'oc:r'}]
    ]
  };
}

function rformOwnerBotV15PlanStatusCounts_(rows) {
  const out = {above: 0, below: 0, on: 0, other: 0};
  (rows || []).forEach(function (row) {
    const status = String(row && row.Plan_Status || '').trim().toUpperCase();
    if (status === 'ABOVE_PLAN') out.above++;
    else if (status === 'BELOW_PLAN') out.below++;
    else if (status === 'ON_PLAN' || status === 'AS_PLANNED') out.on++;
    else out.other++;
  });
  return out;
}

function rformOwnerBotV15DailyAverage_(rows, field) {
  return rformOwnerBotV13Average_((rows || []).map(function (row) {
    return rformOwnerBotV13Number_(row && row[field]);
  }));
}

function rformOwnerBotV15PainMax_(rows) {
  let max = null;
  (rows || []).forEach(function (row) {
    ['Shoulder_Pain','Elbow_Pain','Other_Pain'].forEach(function (field) {
      const value = rformOwnerBotV13Number_(row && row[field]);
      if (value !== null && (max === null || value > max)) max = value;
    });
  });
  return max;
}

function rformOwnerBotV16StrengthSetEligible_(row) {
  const type = String(row && row.Set_Type || '').trim().toUpperCase();
  const category = String(row && row.Exercise_Category || '').trim().toUpperCase();
  if (['WORKING','TOP_SET','BACKOFF'].indexOf(type) === -1) return false;
  if (['BENCH','SQUAT','HINGE','PRESS','PULL'].indexOf(category) === -1) return false;
  const weight = rformOwnerBotV13Number_(row && row.Weight_Kg);
  const reps = rformOwnerBotV13Number_(row && row.Reps);
  return weight !== null && weight > 0 && reps !== null && reps > 0;
}

function rformOwnerBotV16ExerciseKey_(row) {
  const catalog = String(row && row.Exercise_Catalog_ID || '').trim().toUpperCase();
  if (catalog) return catalog;
  const normalized = String(row && row.Exercise_Name_Normalized || '').trim().toUpperCase();
  if (normalized && !/^FREE_/.test(normalized)) return normalized;
  const original = String(row && row.Exercise_Name_Original || '').trim().toUpperCase();
  return normalized || original.replace(/[^A-ZА-ЯЁ0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function rformOwnerBotV16ExerciseLabel_(key, rows) {
  const labels = {
    COMPETITION_BENCH_PRESS: 'Соревновательный жим',
    COMPETITION_BENCH_PRESS_2S_PAUSE: 'Жим с паузой 2 с',
    LARSEN_PRESS: 'Жим Ларсена',
    BARBELL_BACK_SQUAT: 'Присед со штангой',
    ROMANIAN_DEADLIFT: 'Румынская тяга',
    OVERHEAD_PRESS: 'Жим стоя',
    BARBELL_ROW: 'Тяга штанги'
  };
  if (labels[key]) return labels[key];
  const named = (rows || []).map(function (row) { return String(row.Exercise_Name_Original || '').trim(); }).filter(Boolean);
  return named.length ? named[0] : key;
}

function rformOwnerBotV16CategoryPriority_(category) {
  return {BENCH: 50, SQUAT: 40, HINGE: 30, PRESS: 20, PULL: 10}[String(category || '').toUpperCase()] || 0;
}

function rformOwnerBotV16Estimated1RM_(row) {
  const weight = rformOwnerBotV13Number_(row && row.Weight_Kg);
  const reps = rformOwnerBotV13Number_(row && row.Reps);
  if (weight === null || reps === null || weight <= 0 || reps <= 0) return null;
  const rawRir = rformOwnerBotV13Number_(row && row.RIR);
  const reserve = rawRir === null ? 0 : Math.max(0, Math.min(5, rawRir));
  const effectiveReps = Math.min(12, reps + reserve);
  return weight * (1 + effectiveReps / 30);
}

function rformOwnerBotV16TopSet_(rows) {
  const candidates = (rows || []).map(function (row) {
    return {row: row, e1rm: rformOwnerBotV16Estimated1RM_(row)};
  }).filter(function (x) { return Number.isFinite(x.e1rm); });
  candidates.sort(function (a, b) {
    if (b.e1rm !== a.e1rm) return b.e1rm - a.e1rm;
    const bw = rformOwnerBotV13Number_(b.row.Weight_Kg) || 0;
    const aw = rformOwnerBotV13Number_(a.row.Weight_Kg) || 0;
    if (bw !== aw) return bw - aw;
    return (rformOwnerBotV13Number_(b.row.Reps) || 0) - (rformOwnerBotV13Number_(a.row.Reps) || 0);
  });
  return candidates.length ? candidates[0] : null;
}

function rformOwnerBotV16BestExposure_(rows) {
  const copy = (rows || []).filter(function (x) { return Number.isFinite(x.e1rm); }).slice();
  copy.sort(function (a, b) { return b.e1rm - a.e1rm || String(a.date || '').localeCompare(String(b.date || '')); });
  return copy.length ? copy[0] : null;
}

function rformOwnerBotV16StrengthTrends_(model) {
  const sessionRows = model && model.training && Array.isArray(model.training.rows) ? model.training.rows : [];
  const setRows = model && model.training && Array.isArray(model.training.sets) ? model.training.sets : [];
  const sessionDate = {};
  sessionRows.forEach(function (row) {
    const p = rformOwnerBotV13DateParts_(row.Date);
    if (p) sessionDate[String(row.Session_ID || '').trim()] = p;
  });
  const eligible = setRows.filter(rformOwnerBotV16StrengthSetEligible_).filter(function (row) {
    return !!sessionDate[String(row.Session_ID || '').trim()];
  });
  const exerciseMap = {};
  eligible.forEach(function (row) {
    const key = rformOwnerBotV16ExerciseKey_(row);
    if (!key) return;
    const sid = String(row.Session_ID || '').trim();
    if (!exerciseMap[key]) exerciseMap[key] = {key: key, category: String(row.Exercise_Category || '').trim().toUpperCase(), rows: [], sessions: {}};
    exerciseMap[key].rows.push(row);
    if (!exerciseMap[key].sessions[sid]) exerciseMap[key].sessions[sid] = [];
    exerciseMap[key].sessions[sid].push(row);
  });

  const trends = Object.keys(exerciseMap).map(function (key) {
    const group = exerciseMap[key];
    const exposures = Object.keys(group.sessions).map(function (sid) {
      const rows = group.sessions[sid];
      const top = rformOwnerBotV16TopSet_(rows);
      const date = sessionDate[sid];
      const rirValues = rows.map(function (row) { return rformOwnerBotV13Number_(row.RIR); }).filter(function (x) { return x !== null; });
      const volume = rows.reduce(function (sum, row) {
        return sum + (rformOwnerBotV13Number_(row.Weight_Kg) || 0) * (rformOwnerBotV13Number_(row.Reps) || 0);
      }, 0);
      return {
        sessionId: sid, date: date.text, dateKey: date.key, rows: rows,
        top: top ? top.row : null, e1rm: top ? top.e1rm : null, volume: volume,
        averageRir: rformOwnerBotV13Average_(rirValues)
      };
    }).filter(function (x) { return x.top; }).sort(function (a, b) { return a.dateKey.localeCompare(b.dateKey); });
    if (!exposures.length) return null;

    const split = Math.max(1, Math.floor(exposures.length / 2));
    const earlyBest = rformOwnerBotV16BestExposure_(exposures.slice(0, split));
    const lateBest = rformOwnerBotV16BestExposure_(exposures.slice(split));
    const allBest = rformOwnerBotV16BestExposure_(exposures);
    const deltaPct = earlyBest && lateBest && earlyBest.e1rm > 0 ? ((lateBest.e1rm - earlyBest.e1rm) / earlyBest.e1rm) * 100 : null;
    const allRir = group.rows.map(function (row) { return rformOwnerBotV13Number_(row.RIR); }).filter(function (x) { return x !== null; });
    const peakWeight = Math.max.apply(null, group.rows.map(function (row) { return rformOwnerBotV13Number_(row.Weight_Kg) || 0; }));
    const totalVolume = exposures.reduce(function (sum, x) { return sum + x.volume; }, 0);
    const trend = deltaPct === null ? 'INSUFFICIENT' : deltaPct >= 2 ? 'UP' : deltaPct <= -2 ? 'DOWN' : 'STABLE';
    return {
      key: key, label: rformOwnerBotV16ExerciseLabel_(key, group.rows), category: group.category,
      exposures: exposures, first: exposures[0], last: exposures[exposures.length - 1], best: allBest,
      earlyBest: earlyBest, lateBest: lateBest, deltaPct: deltaPct, trend: trend, peakWeight: peakWeight,
      totalVolume: totalVolume, averageRir: rformOwnerBotV13Average_(allRir), setCount: group.rows.length,
      score: exposures.length * 1000 + rformOwnerBotV16CategoryPriority_(group.category) * 10 + Math.min(99, group.rows.length)
    };
  }).filter(Boolean);

  trends.sort(function (a, b) {
    const aComparable = a.exposures.length >= 2 ? 1 : 0;
    const bComparable = b.exposures.length >= 2 ? 1 : 0;
    return bComparable - aComparable || b.score - a.score || a.label.localeCompare(b.label);
  });
  return trends.slice(0, RFORM_OWNER_COCKPIT_V13.strengthMaxExercises || 4);
}

function rformOwnerBotV16SetText_(row) {
  if (!row) return '—';
  const weight = rformOwnerBotV13Number_(row.Weight_Kg);
  const reps = rformOwnerBotV13Number_(row.Reps);
  const rir = rformOwnerBotV13Number_(row.RIR);
  let text = rformOwnerBotV13Round_(weight, 1) + '×' + rformOwnerBotV13Round_(reps, 0);
  if (rir !== null) text += ' @RIR ' + rformOwnerBotV13Round_(rir, 1);
  return text;
}

function rformOwnerBotV16RenderStrengthTrends_(trends) {
  const lines = ['', 'СИЛОВЫЕ ТРЕНДЫ'];
  if (!trends || !trends.length) {
    lines.push('Недостаточно сопоставимых рабочих подходов в TRAINING_SETS.');
    return lines;
  }
  lines.push('e1RM≈ — оценка по весу, повторам и RIR; тренд = лучший показатель ранней vs поздней половины экспозиций.');
  trends.forEach(function (trend, index) {
    const arrow = trend.trend === 'UP' ? '↑' : trend.trend === 'DOWN' ? '↓' : trend.trend === 'STABLE' ? '→' : '·';
    lines.push((index + 1) + '. ' + trend.label + ' · ' + trend.exposures.length + ' сесс.');
    lines.push('   ' + trend.first.date + ' ' + rformOwnerBotV16SetText_(trend.first.top) + ' → ' + trend.last.date + ' ' + rformOwnerBotV16SetText_(trend.last.top));
    if (trend.deltaPct !== null && trend.earlyBest && trend.lateBest) {
      const sign = trend.deltaPct > 0 ? '+' : '';
      lines.push('   e1RM≈ ' + rformOwnerBotV13Round_(trend.earlyBest.e1rm, 1) + ' → ' + rformOwnerBotV13Round_(trend.lateBest.e1rm, 1) + ' кг · ' + arrow + ' ' + sign + rformOwnerBotV13Round_(trend.deltaPct, 1) + '%');
    } else {
      lines.push('   e1RM≈ ' + rformOwnerBotV13Round_(trend.best && trend.best.e1rm, 1) + ' кг · тренд: недостаточно точек');
    }
    lines.push('   пик веса ' + rformOwnerBotV13Round_(trend.peakWeight, 1) + ' кг · тоннаж ' + rformOwnerBotV13Round_(trend.totalVolume, 0) + ' кг' +
      (Number.isFinite(trend.averageRir) ? ' · RIR ср. ' + rformOwnerBotV13Round_(trend.averageRir, 1) : ''));
  });
  return lines;
}

function rformOwnerBotV15AnalysisModel_(model) {
  const dailyRows = model && model.daily && Array.isArray(model.daily.rows) ? model.daily.rows : [];
  const trainingRows = model && model.training && Array.isArray(model.training.rows) ? model.training.rows : [];
  const statusCounts = rformOwnerBotV15PlanStatusCounts_(trainingRows);
  const sleepAvg = rformOwnerBotV15DailyAverage_(dailyRows, 'Sleep_Hours');
  const readinessAvg = rformOwnerBotV15DailyAverage_(dailyRows, 'Readiness');
  const painMax = rformOwnerBotV15PainMax_(dailyRows);
  const weightDelta = model && model.weight ? model.weight.last.value - model.weight.first.value : null;
  const weightPct = model && model.weight && model.weight.first.value ? (weightDelta / model.weight.first.value) * 100 : null;
  const avgTrainingDuration = model && model.training && model.training.sessions ? model.training.durationMinutes / model.training.sessions : null;
  const strength = rformOwnerBotV16StrengthTrends_(model);
  const checks = [];

  if (model.status !== 'READY_FOR_REPORT_BUILD') {
    checks.push('Закрыть или сверить ' + model.closure.missing.length + ' дней без accepted Closure до финального вывода.');
  }
  if (model.daily.missing.length) checks.push('Сверить DAILY для ' + model.daily.missing.length + ' закрытых дней.');
  if (model.nutrition.missing.length) checks.push('Сверить питание для ' + model.nutrition.missing.length + ' закрытых дней.');
  if (statusCounts.below > 0) checks.push('Разобрать причины ' + statusCounts.below + ' тренировок BELOW_PLAN перед изменением следующего микроцикла.');
  if (painMax !== null && painMax >= 2) checks.push('Проверить болевой сигнал max ' + rformOwnerBotV13Round_(painMax, 0) + '/10 до прогрессии нагрузки.');
  if ((readinessAvg !== null && readinessAvg <= 7) || (sleepAvg !== null && sleepAvg < 7)) {
    checks.push('Сверить восстановление: средние сон/готовность вышли из рабочего ориентира.');
  }
  if (weightPct !== null && Math.abs(weightPct) >= 1.5) {
    checks.push('Сверить изменение веса ' + rformOwnerBotV13Round_(weightPct, 1) + '% с текущей целью питания и композиции тела.');
  }
  if (model.range.days >= 28 && !model.measurements.length) {
    checks.push('Добавить контрольные замеры для периода ≥28 дней.');
  }
  if (!checks.length) checks.push('Обязательных корректировок из данных периода не выявлено; сравнить следующий сопоставимый период.');

  return {
    mode: model.status === 'READY_FOR_REPORT_BUILD' ? 'FINAL' : 'DRAFT',
    source: model,
    trends: {
      weightDelta: weightDelta, weightPct: weightPct,
      sleepAverage: sleepAvg, readinessAverage: readinessAvg, painMax: painMax,
      trainingPlan: statusCounts, averageTrainingDuration: avgTrainingDuration,
      strength: strength
    },
    checks: checks
  };
}

function rformOwnerBotV15RenderAnalyticalReport_(analysis) {
  const model = analysis.source;
  const r = model.range;
  const t = analysis.trends;
  const lines = [
    'R/Form · Аналитический отчёт',
    r.start + ' – ' + r.end + ' · ' + r.days + ' дн.',
    'Режим: ' + (analysis.mode === 'FINAL' ? 'полный' : 'черновик · неполное покрытие'),
    '',
    'ФАКТЫ',
    'Closure: ' + model.closure.closed + '/' + model.closure.total,
    'Тренировки: ' + model.training.sessions + ' · ' + rformOwnerBotV13Round_(model.training.durationMinutes, 0) + ' мин',
    'Питание: ' + model.nutrition.closed + '/' + model.closure.total + ' дней',
    'Замеры: ' + model.measurements.length + ' записей'
  ];
  if (model.weight) {
    lines.push('Вес: ' + rformOwnerBotV13Round_(model.weight.first.value, 2) + ' → ' + rformOwnerBotV13Round_(model.weight.last.value, 2) + ' кг');
  } else lines.push('Вес: данных недостаточно');

  lines.push('', 'ТРЕНДЫ');
  if (t.weightDelta !== null) {
    lines.push('Вес: ' + (t.weightDelta >= 0 ? '+' : '') + rformOwnerBotV13Round_(t.weightDelta, 2) + ' кг · ' +
      (t.weightPct >= 0 ? '+' : '') + rformOwnerBotV13Round_(t.weightPct, 1) + '%');
  }
  if (Number.isFinite(t.sleepAverage) || Number.isFinite(t.readinessAverage) || t.painMax !== null) {
    lines.push('Состояние: сон ' + rformOwnerBotV13Round_(t.sleepAverage, 1) + ' ч · готовность ' +
      rformOwnerBotV13Round_(t.readinessAverage, 1) + '/10 · боль max ' + rformOwnerBotV13Round_(t.painMax, 0) + '/10');
  }
  lines.push('Тренировки план/факт: ABOVE ' + t.trainingPlan.above + ' · ON ' + t.trainingPlan.on + ' · BELOW ' + t.trainingPlan.below +
    (t.trainingPlan.other ? ' · OTHER ' + t.trainingPlan.other : '') +
    (Number.isFinite(t.averageTrainingDuration) ? ' · средняя ' + rformOwnerBotV13Round_(t.averageTrainingDuration, 0) + ' мин' : ''));
  if (Number.isFinite(model.nutrition.average.calories)) {
    lines.push('Питание среднее: ≈' + rformOwnerBotV13Round_(model.nutrition.average.calories, 0) + ' ккал · Б ' +
      rformOwnerBotV13Round_(model.nutrition.average.protein, 1) + ' · Ж ' + rformOwnerBotV13Round_(model.nutrition.average.fat, 1) +
      ' · У ' + rformOwnerBotV13Round_(model.nutrition.average.carbs, 1));
  }

  rformOwnerBotV16RenderStrengthTrends_(t.strength || []).forEach(function (line) { lines.push(line); });

  lines.push('', 'ПРОБЕЛЫ');
  if (!model.data_gaps) lines.push('Нет по Closure / DAILY / Nutrition.');
  else {
    if (model.closure.missing.length) lines.push('• Closure: ' + rformOwnerBotV13CompactDates_(model.closure.missing, 8));
    if (model.daily.missing.length) lines.push('• DAILY: ' + rformOwnerBotV13CompactDates_(model.daily.missing, 8));
    if (model.nutrition.missing.length) lines.push('• Nutrition: ' + rformOwnerBotV13CompactDates_(model.nutrition.missing, 8));
  }

  lines.push('', 'СЛЕДУЮЩИЕ ПРОВЕРКИ');
  analysis.checks.slice(0, 5).forEach(function (check, index) { lines.push((index + 1) + '. ' + check); });
  return {
    text: lines.join('\n').slice(0, 3900),
    keyboard: [
      [{text: 'К сводке периода', callback_data: 'oc:rp:v:' + r.startKey + ':' + r.endKey}],
      [{text: 'Выбрать другой период', callback_data: 'oc:rp:m'}],
      [{text: 'Сегодня', callback_data: 'oc:r'}]
    ]
  };
}

function rformOwnerBotV15ShowAnalyticalReport_(startText, endText) {
  let stage = 'ANALYSIS_SOURCE_READ';
  try {
    const bundle = rformOwnerBotV13ReadReportBundle_();
    stage = 'ANALYSIS_MODEL';
    const periodModel = rformOwnerBotV13ReportModel_(startText, endText, bundle, rformOwnerBotV13Today_());
    const analysis = rformOwnerBotV15AnalysisModel_(periodModel);
    stage = 'ANALYSIS_RENDER';
    const rendered = rformOwnerBotV15RenderAnalyticalReport_(analysis);
    stage = 'TELEGRAM_SEND';
    return rformOwnerBotV1SendOwnerText_(rendered.text, {
      disable_notification: true,
      reply_markup: JSON.stringify({inline_keyboard: rendered.keyboard})
    });
  } catch (error) {
    try { console.warn(JSON.stringify({event:'OWNER_BUILD_REPORT_FAILED',version:RFORM_OWNER_COCKPIT_V13.version,stage:stage})); } catch (_) {}
    if (stage !== 'TELEGRAM_SEND') {
      return rformOwnerBotV1SendOwnerText_('Не удалось построить аналитический отчёт. Код: ' + stage + '. Данные не изменены.');
    }
    throw error;
  }
}

function rformOwnerBotV13SendReportMenu_() {
  return rformOwnerBotV1SendOwnerText_('R/Form · Отчёт за период\n\nВыберите период. Для произвольного диапазона укажите дату начала и дату окончания через календарь.', {
    reply_markup: JSON.stringify({inline_keyboard: [
      [{text: 'Текущая неделя', callback_data: 'oc:rp:w'}],
      [{text: 'Текущий месяц', callback_data: 'oc:rp:mo'}],
      [{text: 'Последние 30 дней', callback_data: 'oc:rp:30'}],
      [{text: 'Выбрать даты', callback_data: 'oc:rp:c'}],
      [{text: 'Сегодня', callback_data: 'oc:r'}]
    ]})
  });
}

function rformOwnerBotV13YearMonthShift_(ym, delta) {
  const m = String(ym || '').match(/^(\d{4})(\d{2})$/);
  if (!m) return '';
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1 + Number(delta || 0), 1);
  const d = new Date(ms);
  return String(d.getUTCFullYear()) + ('0' + (d.getUTCMonth() + 1)).slice(-2);
}

function rformOwnerBotV13CalendarModel_(phase, ym, startKey, todayText) {
  const m = String(ym || '').match(/^(\d{4})(\d{2})$/);
  const today = rformOwnerBotV13DateParts_(todayText || rformOwnerBotV13Today_());
  if (!m || !today) throw new Error('Некорректный календарный период.');
  const y = Number(m[1]), month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error('Некорректный месяц.');
  const firstMs = Date.UTC(y, month - 1, 1);
  const daysInMonth = new Date(Date.UTC(y, month, 0)).getUTCDate();
  const mondayIndex = (new Date(firstMs).getUTCDay() + 6) % 7;
  const start = startKey ? rformOwnerBotV13DateParts_(rformOwnerBotV13DateTextFromKey_(startKey)) : null;
  const maxEndMs = start ? Math.min(today.ms, start.ms + (RFORM_OWNER_COCKPIT_V13.reportMaxDays - 1) * 86400000) : today.ms;
  const rows = [];
  for (let i = 0; i < mondayIndex; i++) rows.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const p = rformOwnerBotV13DateParts_((('0' + d).slice(-2)) + '.' + ('0' + month).slice(-2) + '.' + y);
    const valid = p && p.ms <= today.ms && (!start || (p.ms >= start.ms && p.ms <= maxEndMs));
    rows.push(valid ? p : null);
  }
  while (rows.length % 7) rows.push(null);
  return {phase: phase, ym: ym, startKey: startKey || '', today: today, cells: rows};
}

function rformOwnerBotV13CalendarKeyboard_(model) {
  const months = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const y = Number(model.ym.slice(0,4)), m = Number(model.ym.slice(4,6));
  const prefix = 'oc:rp:cal:' + model.phase + ':';
  const suffix = model.startKey ? ':' + model.startKey : '';
  const keys = [[
    {text:'«', callback_data:prefix + rformOwnerBotV13YearMonthShift_(model.ym,-12) + suffix},
    {text:'‹', callback_data:prefix + rformOwnerBotV13YearMonthShift_(model.ym,-1) + suffix},
    {text:months[m-1] + ' ' + y, callback_data:'oc:rp:nop'},
    {text:'›', callback_data:prefix + rformOwnerBotV13YearMonthShift_(model.ym,1) + suffix},
    {text:'»', callback_data:prefix + rformOwnerBotV13YearMonthShift_(model.ym,12) + suffix}
  ], ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(function (x) { return {text:x,callback_data:'oc:rp:nop'}; })];
  for (let i = 0; i < model.cells.length; i += 7) {
    keys.push(model.cells.slice(i, i + 7).map(function (p) {
      return p ? {text:String(p.d), callback_data:'oc:rp:day:' + model.phase + ':' + p.key + (model.startKey ? ':' + model.startKey : '')}
        : {text:'·', callback_data:'oc:rp:nop'};
    }));
  }
  keys.push([{text:'К выбору периода',callback_data:'oc:rp:m'}]);
  return keys;
}

function rformOwnerBotV13SendCalendar_(phase, ym, startKey) {
  const model = rformOwnerBotV13CalendarModel_(phase, ym, startKey, rformOwnerBotV13Today_());
  const title = phase === 's' ? 'Выберите дату начала' : 'Выберите дату окончания';
  const note = startKey ? '\nНачало: ' + rformOwnerBotV13DateTextFromKey_(startKey) : '';
  return rformOwnerBotV1SendOwnerText_('R/Form · ' + title + note, {
    reply_markup: JSON.stringify({inline_keyboard: rformOwnerBotV13CalendarKeyboard_(model)})
  });
}

function rformOwnerBotV13ShowReport_(startText, endText) {
  let stage = 'REPORT_SOURCE_READ';
  try {
    const bundle = rformOwnerBotV13ReadReportBundle_();
    stage = 'REPORT_MODEL';
    const model = rformOwnerBotV13ReportModel_(startText, endText, bundle, rformOwnerBotV13Today_());
    stage = 'REPORT_RENDER';
    const rendered = rformOwnerBotV13RenderReport_(model);
    stage = 'TELEGRAM_SEND';
    return rformOwnerBotV1SendOwnerText_(rendered.text, {
      disable_notification: true,
      reply_markup: JSON.stringify({inline_keyboard: rendered.keyboard})
    });
  } catch (error) {
    try { console.warn(JSON.stringify({event:'OWNER_PERIOD_REPORT_FAILED',version:RFORM_OWNER_COCKPIT_V13.version,stage:stage})); } catch (_) {}
    if (stage !== 'TELEGRAM_SEND') {
      return rformOwnerBotV1SendOwnerText_('Не удалось сформировать отчёт за период. Код: ' + stage + '. Данные не изменены.');
    }
    throw error;
  }
}

function rformOwnerBotV13ReportCallback_(data) {
  const today = rformOwnerBotV13Today_();
  if (data === 'oc:rp:nop') return;
  if (data === 'oc:rp:m') { rformOwnerBotV13SendReportMenu_(); return; }
  if (data === 'oc:rp:w' || data === 'oc:rp:mo' || data === 'oc:rp:30') {
    const kind = data === 'oc:rp:w' ? 'week' : data === 'oc:rp:mo' ? 'month' : '30';
    const range = rformOwnerBotV13PresetRange_(kind, today);
    rformOwnerBotV13ShowReport_(range.start, range.end); return;
  }
  if (data === 'oc:rp:c') {
    const p = rformOwnerBotV13DateParts_(today);
    rformOwnerBotV13SendCalendar_('s', p.key.slice(0,6), ''); return;
  }
  const build = data.match(/^oc:rp:b:(\d{8}):(\d{8})$/);
  if (build) {
    rformOwnerBotV15ShowAnalyticalReport_(rformOwnerBotV13DateTextFromKey_(build[1]), rformOwnerBotV13DateTextFromKey_(build[2]));
    return;
  }
  const view = data.match(/^oc:rp:v:(\d{8}):(\d{8})$/);
  if (view) {
    rformOwnerBotV13ShowReport_(rformOwnerBotV13DateTextFromKey_(view[1]), rformOwnerBotV13DateTextFromKey_(view[2]));
    return;
  }
  let m = data.match(/^oc:rp:cal:([se]):(\d{6})(?::(\d{8}))?$/);
  if (m) {
    if (m[1] === 'e' && !m[3]) return;
    rformOwnerBotV13SendCalendar_(m[1], m[2], m[3] || ''); return;
  }
  m = data.match(/^oc:rp:day:s:(\d{8})$/);
  if (m) {
    const startText = rformOwnerBotV13DateTextFromKey_(m[1]);
    const p = rformOwnerBotV13DateParts_(startText);
    if (!p) return;
    rformOwnerBotV13SendCalendar_('e', p.key.slice(0,6), p.key); return;
  }
  m = data.match(/^oc:rp:day:e:(\d{8}):(\d{8})$/);
  if (m) {
    const endText = rformOwnerBotV13DateTextFromKey_(m[1]);
    const startText = rformOwnerBotV13DateTextFromKey_(m[2]);
    rformOwnerBotV13ShowReport_(startText, endText); return;
  }
}

function rformOwnerBotV13CockpitCallback_(callback) {
  if (!rformOwnerBotV1WorkspaceTrusted_(callback && callback.message, callback && callback.from)) return;
  const token = rformOwnerBotV1RequireProperty_(PropertiesService.getScriptProperties(), RFORM_OWNER_BOT_V1.props.token);
  const callbackId = String(callback && callback.id || '');
  if (callbackId) rformOwnerBotV1Telegram_(token, 'answerCallbackQuery', {callback_query_id: callbackId, text: 'Обновляю…'});
  const data = String(callback && callback.data || '');
  if (data === 'oc:r') {
    rformOwnerBotV13SendCockpit_();
    return;
  }
  if (/^oc:rp:/.test(data)) {
    rformOwnerBotV13ReportCallback_(data);
    return;
  }
  const match = data.match(/^oc:e:([pwd]):([a-f0-9]{12})$/);
  if (!match) return;
  if (!rformOwnerBotV1ActionsEnabled_()) {
    rformOwnerBotV1SendOwnerText_('Действия отключены в тестовом режиме.');
    return;
  }
  const bundle = rformOwnerBotV13ApiRead_();
  const matches = (bundle.events || []).filter(function (event) {
    return rformOwnerBotV13EventToken_(event) === match[2] && rformOwnerBotV13EventNeedsOwner_(event);
  });
  if (matches.length !== 1) {
    rformOwnerBotV1SendOwnerText_('Событие уже изменилось или решение принято. Обновите /today.');
    return;
  }
  const event = matches[0];
  const decision = {p: 'TO_PUBLICATION', w: 'TO_WEEKLY', d: 'DISMISS'}[match[1]];
  const result = rformOwnerBotV13ApplyEventDecision_(event, decision);
  const labels = {TO_PUBLICATION: 'Событие передано в контент-пайплайн.', TO_WEEKLY: 'Событие учтено для Weekly.', DISMISS: 'Событие закрыто без публикации.'};
  rformOwnerBotV1SendOwnerText_((result && result.ok ? labels[decision] : 'Решение не подтверждено.') + '\nОбновляю cockpit.');
  rformOwnerBotV13SendCockpit_();
}

function rformOwnerBotV13ApplyEventDecision_(event, decision) {
  const props = PropertiesService.getScriptProperties();
  const secret = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiSecret);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = rformOwnerBotV1RandomHex_(16);
  const actionId = rformOwnerBotV1RandomHex_(16);
  const eventId = String(event.Event_ID || '').trim();
  const fact = String(event.Owner_Fact || event.Fact || '').trim();
  const angle = String(event.Owner_Angle || event.Recommended_Angle_1 || event.Editorial_Trigger || '').trim();
  const note = String(event.Owner_Note || '').trim();
  if (!fact || !angle) throw new Error('Событие требует уточнения факта или интерпретации до решения.');
  const lines = [
    String(timestamp), nonce, 'event_decision', actionId, eventId, decision,
    rformOwnerBotV1Sha256Hex_(fact), rformOwnerBotV1Sha256Hex_(angle), rformOwnerBotV1Sha256Hex_(note)
  ];
  return rformOwnerBotV1ApiPost_({
    timestamp: timestamp,
    nonce: nonce,
    signature: rformOwnerBotV1HmacBase64Url_(lines.join('\n'), secret),
    operation: 'event_decision',
    action_id: actionId,
    event_id: eventId,
    decision: decision,
    fact: fact,
    angle: angle,
    note: note
  });
}
