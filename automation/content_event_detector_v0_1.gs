// R/Form Content Event Detector v0.1
// STAGING MODULE — does not publish and does not touch CONTENT_QUEUE.
// Purpose: turn closed canonical data into scored DATA_EVENTS for editorial review.
// Canonical principle: PLAN -> FACT -> DECISION.

const RFORM_CONTENT_EVENT_CONFIG = Object.freeze({
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  sessionsSheet: 'TRAINING_SESSIONS',
  decisionsSheet: 'DECISIONS',
  eventsSheet: 'DATA_EVENTS',
  lookbackDays: 10,
  weights: Object.freeze({
    relevance: 20,
    novelty: 15,
    education: 15,
    emotion: 10,
    proof: 15,
    narrative: 15,
    audience: 10
  })
});

/**
 * READ-ONLY. Returns detected events without writing anything.
 * Safe first step for regression testing.
 */
function rformContentEventDetectorPreview() {
  const ss = SpreadsheetApp.openById(RFORM_CONTENT_EVENT_CONFIG.spreadsheetId);
  const since = new Date();
  since.setDate(since.getDate() - RFORM_CONTENT_EVENT_CONFIG.lookbackDays);
  since.setHours(0, 0, 0, 0);

  const sessionEvents = rformContentDetectSessions_(ss, since);
  const decisionEvents = rformContentDetectDecisions_(ss, since);
  const events = sessionEvents.concat(decisionEvents)
    .map(rformContentFinalizeEvent_)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.contentValueScore - a.contentValueScore);

  return {
    ok: true,
    mode: 'READ_ONLY_PREVIEW',
    lookbackDays: RFORM_CONTENT_EVENT_CONFIG.lookbackDays,
    eventCount: events.length,
    events: events,
    note: 'No DATA_EVENTS, CONTENT_QUEUE, triggers or Telegram messages were changed.'
  };
}

/**
 * Writes/upserts only DATA_EVENTS. Never creates CONTENT_QUEUE rows and never publishes.
 * Run only after preview has been inspected.
 */
function rformContentEventDetectorWrite() {
  const preview = rformContentEventDetectorPreview();
  const ss = SpreadsheetApp.openById(RFORM_CONTENT_EVENT_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_CONFIG.eventsSheet);
  if (!sheet) throw new Error('Missing sheet: ' + RFORM_CONTENT_EVENT_CONFIG.eventsSheet);

  const headers = rformContentHeaderMap_(rformContentReadHeaders_(sheet));
  const required = [
    'Event_ID','Date','Entity','Event_Type','Source','Fact',
    'Relevance_0_10','Novelty_0_10','Education_0_10','Emotion_0_10',
    'Proof_0_10','Narrative_0_10','Audience_0_10','Content_Value_Score',
    'Editorial_Trigger','Manual_Gate','Candidate_Content_ID','Status',
    'Recommended_Angle_1','Recommended_Angle_2','Recommended_Angle_3',
    'Owner_Action','Created_At','Updated_At'
  ];
  const missing = required.filter(h => headers[h] === undefined);
  if (missing.length) throw new Error('DATA_EVENTS missing headers: ' + missing.join(', '));

  const existing = rformContentExistingEventRows_(sheet, headers);
  const now = new Date();
  let inserted = 0;
  let updated = 0;

  preview.events.forEach(event => {
    const row = existing[event.eventId];
    if (row) {
      rformContentWriteEventRow_(sheet, row, headers, event, now, false);
      updated++;
    } else {
      const target = Math.max(sheet.getLastRow() + 1, 2);
      rformContentWriteEventRow_(sheet, target, headers, event, now, true);
      existing[event.eventId] = target;
      inserted++;
    }
  });

  return {
    ok: true,
    mode: 'DATA_EVENTS_ONLY',
    inserted: inserted,
    updated: updated,
    totalDetected: preview.events.length,
    note: 'CONTENT_QUEUE and Telegram were not changed.'
  };
}

function rformContentDetectSessions_(ss, since) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_CONFIG.sessionsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentHeaderMap_(values[0]);
  const out = [];

  values.slice(1).forEach(row => {
    if (rformContentCell_(row, h, 'Session_Status').toUpperCase() !== 'CLOSED') return;
    const dateText = rformContentCell_(row, h, 'Date');
    const date = rformContentParseDate_(dateText);
    if (!date || date < since) return;

    const sessionId = rformContentCell_(row, h, 'Session_ID');
    const mainResult = rformContentCell_(row, h, 'Main_Result');
    const planStatus = rformContentCell_(row, h, 'Plan_Status');
    const technique = rformContentCell_(row, h, 'Technique_Status');
    const painAfter = rformContentCell_(row, h, 'Pain_After');
    const conclusion = rformContentCell_(row, h, 'Session_Conclusion');
    const decision = rformContentCell_(row, h, 'Session_Decision');
    const combined = [mainResult, planStatus, technique, painAfter, conclusion, decision].join(' ');

    const hasRir0 = /RIR\s*0(?:\D|$)/i.test(combined);
    const hasDeviation = /BELOW_PLAN|ABOVE_PLAN/i.test(planStatus);
    const hasReplacement = /замен|дожим|дополнител/i.test(combined);
    const pain2Plus = rformContentPainTwoPlus_(painAfter);

    // Sessions with no editorial signal stay out of DATA_EVENTS and are aggregated in Weekly Control.
    if (!hasRir0 && !hasDeviation && !hasReplacement && !pain2Plus) return;

    let trigger = 'SIGNIFICANT_DEVIATION';
    if (hasRir0) trigger = 'CONTROL_POINT';
    if (pain2Plus) trigger = 'CONTROL_POINT';

    out.push({
      eventId: 'EVT-' + dateText.replace(/\D/g, '') + '-SESSION-' + sessionId,
      date: dateText,
      entity: sessionId,
      eventType: hasRir0 ? 'CONTROL_POINT' : (hasReplacement ? 'PROGRAM_DEVIATION' : 'TRAINING_DEVIATION'),
      source: RFORM_CONTENT_EVENT_CONFIG.sessionsSheet + ' / ' + sessionId,
      fact: mainResult + (conclusion ? ' | ' + conclusion : ''),
      relevance: hasRir0 ? 10 : 7,
      novelty: hasRir0 ? 9 : 6,
      education: hasReplacement ? 8 : 7,
      emotion: hasRir0 ? 8 : (pain2Plus ? 8 : 5),
      proof: 9,
      narrative: hasRir0 ? 9 : 7,
      audience: hasRir0 ? 8 : 6,
      trigger: trigger,
      manualGate: pain2Plus ? 'YES · HEALTH' : (hasRir0 ? 'YES · COMPETITION_TRAJECTORY' : 'NO'),
      candidateContentId: '',
      status: hasRir0 ? 'OWNER_GATE' : 'AGGREGATE_TO_WEEKLY',
      angle1: hasRir0 ? 'Контрольный результат изменил следующий шаг' : 'План и факт разошлись — важно понять значимость',
      angle2: hasReplacement ? 'Как фиксировать осознанную замену, не переписывая план' : '',
      angle3: '',
      ownerAction: hasRir0 ? 'Editorial decision required before standalone publication' : 'NONE'
    });
  });
  return out;
}

function rformContentDetectDecisions_(ss, since) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_CONFIG.decisionsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentHeaderMap_(values[0]);
  const out = [];

  values.slice(1).forEach(row => {
    const status = rformContentCell_(row, h, 'Status').toUpperCase();
    if (status !== 'ACTIVE') return;
    const dateText = rformContentCell_(row, h, 'Decision_Date');
    const date = rformContentParseDate_(dateText);
    if (!date || date < since) return;

    const id = rformContentCell_(row, h, 'Decision_ID');
    const area = rformContentCell_(row, h, 'Area').toUpperCase();
    const signal = rformContentCell_(row, h, 'Signal');
    const previous = rformContentCell_(row, h, 'Previous_Rule');
    const next = rformContentCell_(row, h, 'New_Rule');
    const changed = previous && next && previous !== next;
    if (!changed && !/CONTENT|TRAINING|NUTRITION|PRODUCT/.test(area)) return;

    const competitionSensitive = /TRAINING|NUTRITION/.test(area) && /старт|соревн|117,5|74,5|попыт/i.test(signal + ' ' + next);
    out.push({
      eventId: 'EVT-' + dateText.replace(/\D/g, '') + '-DECISION-' + id,
      date: dateText,
      entity: id,
      eventType: changed ? 'DECISION_CHANGED' : 'DECISION_RECORDED',
      source: RFORM_CONTENT_EVENT_CONFIG.decisionsSheet + ' / ' + id,
      fact: signal + (next ? ' | Новое правило: ' + next : ''),
      relevance: changed ? 9 : 7,
      novelty: changed ? 8 : 6,
      education: 8,
      emotion: competitionSensitive ? 8 : 5,
      proof: 9,
      narrative: changed ? 10 : 7,
      audience: 8,
      trigger: changed ? 'DECISION_CHANGED' : 'AUDIENCE_LEARNING',
      manualGate: competitionSensitive ? 'YES · COMPETITION_OR_NUTRITION' : 'NO',
      candidateContentId: '',
      status: competitionSensitive ? 'OWNER_GATE' : 'DATA_READY',
      angle1: 'Что изменилось между прошлым и новым решением',
      angle2: 'Как не переписывать историю после новой информации',
      angle3: 'Что читатель может применить к своей системе',
      ownerAction: competitionSensitive ? 'Approve public interpretation before publication' : 'NONE'
    });
  });
  return out;
}

function rformContentFinalizeEvent_(e) {
  const w = RFORM_CONTENT_EVENT_CONFIG.weights;
  const weighted = e.relevance * w.relevance + e.novelty * w.novelty + e.education * w.education +
    e.emotion * w.emotion + e.proof * w.proof + e.narrative * w.narrative + e.audience * w.audience;
  e.contentValueScore = Math.round(weighted / 10);
  if (!e.status) {
    e.status = e.contentValueScore >= 90 ? 'PRIORITY_CANDIDATE' :
      e.contentValueScore >= 80 ? 'PRIORITY_CANDIDATE' :
      e.contentValueScore >= 65 ? 'CONTENT_CANDIDATE' :
      e.contentValueScore >= 50 ? 'BACKLOG' : 'AGGREGATE_ONLY';
  }
  return e;
}

function rformContentWriteEventRow_(sheet, rowNumber, h, e, now, isNew) {
  const values = {
    Event_ID: e.eventId, Date: e.date, Entity: e.entity, Event_Type: e.eventType,
    Source: e.source, Fact: e.fact,
    Relevance_0_10: e.relevance, Novelty_0_10: e.novelty, Education_0_10: e.education,
    Emotion_0_10: e.emotion, Proof_0_10: e.proof, Narrative_0_10: e.narrative,
    Audience_0_10: e.audience, Content_Value_Score: e.contentValueScore,
    Editorial_Trigger: e.trigger, Manual_Gate: e.manualGate,
    Candidate_Content_ID: e.candidateContentId || '', Status: e.status,
    Recommended_Angle_1: e.angle1 || '', Recommended_Angle_2: e.angle2 || '',
    Recommended_Angle_3: e.angle3 || '', Owner_Action: e.ownerAction || '',
    Updated_At: now
  };
  if (isNew) values.Created_At = now;
  Object.keys(values).forEach(key => {
    if (h[key] === undefined) return;
    sheet.getRange(rowNumber, h[key] + 1).setValue(values[key]);
  });
}

function rformContentExistingEventRows_(sheet, h) {
  const out = {};
  if (sheet.getLastRow() < 2) return out;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();
  values.forEach((row, i) => {
    const id = row[h.Event_ID];
    if (id) out[id] = i + 2;
  });
  return out;
}

function rformContentReadHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(String);
}

function rformContentHeaderMap_(headers) {
  const out = {};
  headers.forEach((h, i) => { if (h) out[String(h).trim()] = i; });
  return out;
}

function rformContentCell_(row, h, name) {
  return h[name] === undefined ? '' : String(row[h[name]] || '').trim();
}

function rformContentParseDate_(s) {
  const m = String(s || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function rformContentPainTwoPlus_(s) {
  const nums = String(s || '').match(/\d+(?:[.,]\d+)?/g) || [];
  return nums.some(x => Number(String(x).replace(',', '.')) >= 2);
}
