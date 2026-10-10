// R/Form Owner Bot Cockpit v1.3
// Read model only. Reuses the existing Content Control API and canonical Master Data.
// No new datastore, publisher, router or trigger.

const RFORM_OWNER_COCKPIT_V13 = Object.freeze({
  version: '1.3.0',
  timezone: 'Europe/Moscow',
  closureSheet: 'DAY_CLOSURE',
  maxOwnerDecisions: 3,
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
  const model = rformOwnerBotV13BuildCockpit_();
  const rendered = rformOwnerBotV13RenderCockpit_(model);
  return rformOwnerBotV1SendOwnerText_(rendered.text, {
    disable_notification: true,
    reply_markup: JSON.stringify({inline_keyboard: rendered.keyboard})
  });
}

function rformOwnerBotV13BuildCockpit_() {
  const bundle = rformOwnerBotV13ApiRead_();
  const closure = rformOwnerBotV13ReadClosure_();
  return rformOwnerBotV13CockpitModel_(closure, bundle);
}

// Existing Content API operation `read` already returns CONTENT_QUEUE + DATA_EVENTS.
function rformOwnerBotV13ApiRead_() {
  const props = PropertiesService.getScriptProperties();
  const secret = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiSecret);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = rformOwnerBotV1RandomHex_(16);
  const request = {
    timestamp: timestamp,
    nonce: nonce,
    signature: rformOwnerBotV1HmacBase64Url_(String(timestamp) + '.' + nonce, secret),
    operation: 'read'
  };
  return rformOwnerBotV1ApiPost_(request);
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
  keyboard.push([{text: 'Обновить', callback_data: 'oc:r'}]);
  keyboard.push([{text: 'Материалы', callback_data: 'ow:menu'}]);
  return {text: lines.join('\n').slice(0, 3900), keyboard: keyboard};
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
