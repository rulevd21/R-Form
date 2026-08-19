// R/Form Content Event Detector v0.2
// Safe staging module. Reads canonical production data and writes only DATA_EVENTS.
// Never writes CONTENT_QUEUE and never publishes to Telegram.

const RFORM_CONTENT_EVENT_V02_CONFIG = Object.freeze({
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  sessionsSheet: 'TRAINING_SESSIONS',
  decisionsSheet: 'DECISIONS',
  eventsSheet: 'DATA_EVENTS',
  lookbackDays: 10,
  weights: Object.freeze({relevance:20, novelty:15, education:15, emotion:10, proof:15, narrative:15, audience:10})
});

function rformContentEventDetectorPreviewV02() {
  const ss = SpreadsheetApp.openById(RFORM_CONTENT_EVENT_V02_CONFIG.spreadsheetId);
  const since = new Date();
  since.setDate(since.getDate() - RFORM_CONTENT_EVENT_V02_CONFIG.lookbackDays);
  since.setHours(0,0,0,0);

  const events = rformContentV02DetectSessions_(ss, since)
    .concat(rformContentV02DetectDecisions_(ss, since))
    .map(rformContentV02Finalize_)
    .sort((a,b) => String(b.date).localeCompare(String(a.date)) || b.contentValueScore - a.contentValueScore);

  return {
    ok: true,
    version: '0.2',
    mode: 'READ_ONLY_PREVIEW',
    lookbackDays: RFORM_CONTENT_EVENT_V02_CONFIG.lookbackDays,
    eventCount: events.length,
    events: events,
    note: 'No DATA_EVENTS, CONTENT_QUEUE, triggers or Telegram messages were changed.'
  };
}

function rformContentEventDetectorWriteV02() {
  const preview = rformContentEventDetectorPreviewV02();
  const ss = SpreadsheetApp.openById(RFORM_CONTENT_EVENT_V02_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V02_CONFIG.eventsSheet);
  if (!sheet) throw new Error('Missing sheet: ' + RFORM_CONTENT_EVENT_V02_CONFIG.eventsSheet);

  const h = rformContentV02HeaderMap_(rformContentV02ReadHeaders_(sheet));
  const required = ['Event_ID','Date','Entity','Event_Type','Source','Fact','Relevance_0_10','Novelty_0_10','Education_0_10','Emotion_0_10','Proof_0_10','Narrative_0_10','Audience_0_10','Content_Value_Score','Editorial_Trigger','Manual_Gate','Candidate_Content_ID','Status','Recommended_Angle_1','Recommended_Angle_2','Recommended_Angle_3','Owner_Action','Created_At','Updated_At'];
  const missing = required.filter(x => h[x] === undefined);
  if (missing.length) throw new Error('DATA_EVENTS missing headers: ' + missing.join(', '));

  const existing = rformContentV02ExistingRows_(sheet, h);
  const now = new Date();
  let inserted = 0, updated = 0;

  preview.events.forEach(e => {
    const row = existing[e.eventId];
    if (row) {
      rformContentV02WriteRow_(sheet, row, h, e, now, false);
      updated++;
    } else {
      const target = Math.max(sheet.getLastRow() + 1, 2);
      rformContentV02WriteRow_(sheet, target, h, e, now, true);
      existing[e.eventId] = target;
      inserted++;
    }
  });

  return {ok:true, version:'0.2', mode:'DATA_EVENTS_ONLY', inserted, updated, totalDetected:preview.events.length, note:'CONTENT_QUEUE and Telegram were not changed.'};
}

function rformContentV02DetectSessions_(ss, since) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V02_CONFIG.sessionsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV02HeaderMap_(values[0]);
  const out = [];

  values.slice(1).forEach(row => {
    if (rformContentV02Cell_(row,h,'Session_Status').toUpperCase() !== 'CLOSED') return;
    const dateText = rformContentV02Cell_(row,h,'Date');
    const date = rformContentV02ParseDate_(dateText);
    if (!date || date < since) return;

    const sessionId = rformContentV02Cell_(row,h,'Session_ID');
    const mainResult = rformContentV02Cell_(row,h,'Main_Result');
    const planStatus = rformContentV02Cell_(row,h,'Plan_Status');
    const technique = rformContentV02Cell_(row,h,'Technique_Status');
    const painAfter = rformContentV02Cell_(row,h,'Pain_After');
    const conclusion = rformContentV02Cell_(row,h,'Session_Conclusion');
    const decision = rformContentV02Cell_(row,h,'Session_Decision');
    const combined = [mainResult,planStatus,technique,painAfter,conclusion,decision].join(' ');

    const hasRir0 = /RIR\s*0(?:\D|$)/i.test(combined);
    const hasDeviation = /BELOW_PLAN|ABOVE_PLAN/i.test(planStatus);
    const hasReplacement = /замен|дожим|дополнител/i.test(combined);
    const painValue = rformContentV02PainValue_(painAfter);
    const pain2Plus = painValue !== null && painValue >= 2;

    if (!hasRir0 && !hasDeviation && !hasReplacement && !pain2Plus) return;

    let trigger = 'SIGNIFICANT_DEVIATION';
    if (hasRir0 || pain2Plus) trigger = 'CONTROL_POINT';

    out.push({
      eventId:'EVT-' + dateText.replace(/\D/g,'') + '-SESSION-' + sessionId,
      date:dateText,
      entity:sessionId,
      eventType:hasRir0 ? 'CONTROL_POINT' : (hasReplacement ? 'PROGRAM_DEVIATION' : 'TRAINING_DEVIATION'),
      source:RFORM_CONTENT_EVENT_V02_CONFIG.sessionsSheet + ' / ' + sessionId,
      fact:mainResult + (conclusion ? ' | ' + conclusion : ''),
      relevance:hasRir0 ? 10 : 7,
      novelty:hasRir0 ? 9 : 6,
      education:hasReplacement ? 8 : 7,
      emotion:hasRir0 ? 8 : (pain2Plus ? 8 : 5),
      proof:9,
      narrative:hasRir0 ? 9 : 7,
      audience:hasRir0 ? 8 : 6,
      trigger,
      manualGate:pain2Plus ? 'YES · HEALTH' : (hasRir0 ? 'YES · COMPETITION_TRAJECTORY' : 'NO'),
      candidateContentId:'',
      status:hasRir0 ? 'OWNER_GATE' : 'AGGREGATE_TO_WEEKLY',
      angle1:hasRir0 ? 'Контрольный результат изменил следующий шаг' : 'План и факт разошлись — важно понять значимость',
      angle2:hasReplacement ? 'Как фиксировать осознанную замену, не переписывая план' : '',
      angle3:'',
      ownerAction:hasRir0 ? 'Editorial decision required before standalone publication' : 'NONE'
    });
  });
  return out;
}

function rformContentV02DetectDecisions_(ss, since) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V02_CONFIG.decisionsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV02HeaderMap_(values[0]);
  const out = [];

  values.slice(1).forEach(row => {
    if (rformContentV02Cell_(row,h,'Status').toUpperCase() !== 'ACTIVE') return;
    const dateText = rformContentV02Cell_(row,h,'Decision_Date');
    const date = rformContentV02ParseDate_(dateText);
    if (!date || date < since) return;

    const id = rformContentV02Cell_(row,h,'Decision_ID');
    const area = rformContentV02Cell_(row,h,'Area').toUpperCase();
    const signal = rformContentV02Cell_(row,h,'Signal');
    const previous = rformContentV02Cell_(row,h,'Previous_Rule');
    const next = rformContentV02Cell_(row,h,'New_Rule');
    const changed = previous && next && previous !== next;
    if (!changed && !/CONTENT|TRAINING|NUTRITION|PRODUCT/.test(area)) return;

    const competitionSensitive = /TRAINING|NUTRITION/.test(area) && /старт|соревн|117,5|74,5|попыт/i.test(signal + ' ' + next);
    out.push({
      eventId:'EVT-' + dateText.replace(/\D/g,'') + '-DECISION-' + id,
      date:dateText,
      entity:id,
      eventType:changed ? 'DECISION_CHANGED' : 'DECISION_RECORDED',
      source:RFORM_CONTENT_EVENT_V02_CONFIG.decisionsSheet + ' / ' + id,
      fact:signal + (next ? ' | Новое правило: ' + next : ''),
      relevance:changed ? 9 : 7,
      novelty:changed ? 8 : 6,
      education:8,
      emotion:competitionSensitive ? 8 : 5,
      proof:9,
      narrative:changed ? 10 : 7,
      audience:8,
      trigger:changed ? 'DECISION_CHANGED' : 'AUDIENCE_LEARNING',
      manualGate:competitionSensitive ? 'YES · COMPETITION_OR_NUTRITION' : 'NO',
      candidateContentId:'',
      status:competitionSensitive ? 'OWNER_GATE' : 'DATA_READY',
      angle1:'Что изменилось между прошлым и новым решением',
      angle2:'Как не переписывать историю после новой информации',
      angle3:'Что читатель может применить к своей системе',
      ownerAction:competitionSensitive ? 'Approve public interpretation before publication' : 'NONE'
    });
  });
  return out;
}

function rformContentV02Finalize_(e) {
  const w = RFORM_CONTENT_EVENT_V02_CONFIG.weights;
  const weighted = e.relevance*w.relevance + e.novelty*w.novelty + e.education*w.education + e.emotion*w.emotion + e.proof*w.proof + e.narrative*w.narrative + e.audience*w.audience;
  e.contentValueScore = Math.round(weighted/10);
  if (!e.status) e.status = e.contentValueScore >= 80 ? 'PRIORITY_CANDIDATE' : e.contentValueScore >= 65 ? 'CONTENT_CANDIDATE' : e.contentValueScore >= 50 ? 'BACKLOG' : 'AGGREGATE_ONLY';
  return e;
}

function rformContentV02WriteRow_(sheet,rowNumber,h,e,now,isNew) {
  const values = {
    Event_ID:e.eventId, Date:e.date, Entity:e.entity, Event_Type:e.eventType, Source:e.source, Fact:e.fact,
    Relevance_0_10:e.relevance, Novelty_0_10:e.novelty, Education_0_10:e.education, Emotion_0_10:e.emotion,
    Proof_0_10:e.proof, Narrative_0_10:e.narrative, Audience_0_10:e.audience, Content_Value_Score:e.contentValueScore,
    Editorial_Trigger:e.trigger, Manual_Gate:e.manualGate, Candidate_Content_ID:e.candidateContentId || '', Status:e.status,
    Recommended_Angle_1:e.angle1 || '', Recommended_Angle_2:e.angle2 || '', Recommended_Angle_3:e.angle3 || '', Owner_Action:e.ownerAction || '', Updated_At:now
  };
  if (isNew) values.Created_At = now;
  Object.keys(values).forEach(k => { if (h[k] !== undefined) sheet.getRange(rowNumber,h[k]+1).setValue(values[k]); });
}

function rformContentV02ExistingRows_(sheet,h) {
  const out = {};
  if (sheet.getLastRow() < 2) return out;
  const values = sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getDisplayValues();
  values.forEach((row,i) => { const id = row[h.Event_ID]; if (id) out[id] = i+2; });
  return out;
}

function rformContentV02ReadHeaders_(sheet) {
  return sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(String);
}

function rformContentV02HeaderMap_(headers) {
  const out = {};
  headers.forEach((x,i) => { if (x) out[String(x).trim()] = i; });
  return out;
}

function rformContentV02Cell_(row,h,name) {
  return h[name] === undefined ? '' : String(row[h[name]] || '').trim();
}

function rformContentV02ParseDate_(s) {
  const m = String(s || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
}

// IMPORTANT: Pain_After is commonly stored as "0/10", "1/10", etc.
// v0.1 incorrectly treated the scale maximum "10" as a pain reading.
// v0.2 deliberately reads only the value before the optional /10 scale suffix.
function rformContentV02PainValue_(s) {
  const text = String(s || '').trim().replace(',','.');
  if (!text) return null;
  const m = text.match(/(-?\d+(?:\.\d+)?)(?:\s*\/\s*10)?/);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}
