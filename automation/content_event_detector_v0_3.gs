// R/Form Content Event Detector v0.3
// Production-candidate module. Reads canonical data and writes only DATA_EVENTS.
// Never creates CONTENT_QUEUE rows and never publishes to Telegram.
// Adds: effective-window filtering, allowed-area filtering, CONTENT_QUEUE source reconciliation,
// stale v0.2 event cleanup, and a safe 6-hour DATA_EVENTS-only trigger installer.

const RFORM_CONTENT_EVENT_V03_CONFIG = Object.freeze({
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  sessionsSheet: 'TRAINING_SESSIONS',
  decisionsSheet: 'DECISIONS',
  queueSheet: 'CONTENT_QUEUE',
  eventsSheet: 'DATA_EVENTS',
  lookbackDays: 10,
  allowedDecisionAreas: ['CONTENT','TRAINING','NUTRITION','PRODUCT'],
  weights: Object.freeze({relevance:20, novelty:15, education:15, emotion:10, proof:15, narrative:15, audience:10})
});

function rformContentEventDetectorPreviewV03() {
  const ss = SpreadsheetApp.openById(RFORM_CONTENT_EVENT_V03_CONFIG.spreadsheetId);
  const today = new Date();
  today.setHours(0,0,0,0);
  const since = new Date(today);
  since.setDate(since.getDate() - RFORM_CONTENT_EVENT_V03_CONFIG.lookbackDays);

  const queueIndex = rformContentV03BuildQueueIndex_(ss);
  const events = rformContentV03DetectSessions_(ss, since)
    .concat(rformContentV03DetectDecisions_(ss, since, today))
    .map(rformContentV03Finalize_)
    .map(e => rformContentV03ReconcileQueue_(e, queueIndex))
    .sort((a,b) => String(b.date).localeCompare(String(a.date)) || b.contentValueScore - a.contentValueScore);

  return {
    ok: true,
    version: '0.3',
    mode: 'READ_ONLY_PREVIEW',
    lookbackDays: RFORM_CONTENT_EVENT_V03_CONFIG.lookbackDays,
    eventCount: events.length,
    events,
    note: 'No DATA_EVENTS, CONTENT_QUEUE, triggers or Telegram messages were changed.'
  };
}

function rformContentEventDetectorWriteV03() {
  const preview = rformContentEventDetectorPreviewV03();
  const ss = SpreadsheetApp.openById(RFORM_CONTENT_EVENT_V03_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V03_CONFIG.eventsSheet);
  if (!sheet) throw new Error('Missing sheet: ' + RFORM_CONTENT_EVENT_V03_CONFIG.eventsSheet);

  const h = rformContentV03HeaderMap_(rformContentV03ReadHeaders_(sheet));
  const required = ['Event_ID','Date','Entity','Event_Type','Source','Fact','Relevance_0_10','Novelty_0_10','Education_0_10','Emotion_0_10','Proof_0_10','Narrative_0_10','Audience_0_10','Content_Value_Score','Editorial_Trigger','Manual_Gate','Candidate_Content_ID','Status','Recommended_Angle_1','Recommended_Angle_2','Recommended_Angle_3','Owner_Action','Created_At','Updated_At'];
  const missing = required.filter(x => h[x] === undefined);
  if (missing.length) throw new Error('DATA_EVENTS missing headers: ' + missing.join(', '));

  const existing = rformContentV03ExistingRows_(sheet, h);
  const now = new Date();
  const activeIds = {};
  let inserted = 0, updated = 0, filtered = 0;

  preview.events.forEach(e => {
    activeIds[e.eventId] = true;
    const row = existing[e.eventId];
    if (row) {
      rformContentV03WriteRow_(sheet, row, h, e, now, false);
      updated++;
    } else {
      const target = Math.max(sheet.getLastRow() + 1, 2);
      rformContentV03WriteRow_(sheet, target, h, e, now, true);
      existing[e.eventId] = target;
      inserted++;
    }
  });

  // Clean only auto-generated v0.1/v0.2-style rows that no longer pass v0.3 gates.
  // Manual seed rows and historical publication rows are preserved.
  Object.keys(existing).forEach(id => {
    if (!/^EVT-\d{8}-(SESSION|DECISION)-/.test(id)) return;
    if (activeIds[id]) return;
    const row = existing[id];
    if (h.Status !== undefined) sheet.getRange(row, h.Status + 1).setValue('FILTERED_OUT_V03');
    if (h.Manual_Gate !== undefined) sheet.getRange(row, h.Manual_Gate + 1).setValue('NO');
    if (h.Owner_Action !== undefined) sheet.getRange(row, h.Owner_Action + 1).setValue('NONE · filtered by v0.3 active-window/source gates');
    if (h.Updated_At !== undefined) sheet.getRange(row, h.Updated_At + 1).setValue(now);
    filtered++;
  });

  return {
    ok:true,
    version:'0.3',
    mode:'DATA_EVENTS_ONLY',
    inserted,
    updated,
    filtered,
    totalDetected:preview.events.length,
    note:'Only DATA_EVENTS changed. CONTENT_QUEUE and Telegram were not changed.'
  };
}

function rformContentEventDetectorInstallTriggerV03() {
  const handler = 'rformContentEventDetectorWriteV03';
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(handler).timeBased().everyHours(6).create();
  return {
    ok:true,
    version:'0.3',
    handler,
    cadence:'EVERY_6_HOURS',
    boundary:'DATA_EVENTS_ONLY',
    note:'No Telegram or CONTENT_QUEUE trigger was created.'
  };
}

function rformContentEventDetectorRemoveTriggerV03() {
  const handler = 'rformContentEventDetectorWriteV03';
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  return {ok:true, removed, handler};
}

function rformContentV03DetectSessions_(ss, since) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V03_CONFIG.sessionsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV03HeaderMap_(values[0]);
  const out = [];

  values.slice(1).forEach(row => {
    if (rformContentV03Cell_(row,h,'Session_Status').toUpperCase() !== 'CLOSED') return;
    const dateText = rformContentV03Cell_(row,h,'Date');
    const date = rformContentV03ParseDate_(dateText);
    if (!date || date < since) return;

    const sessionId = rformContentV03Cell_(row,h,'Session_ID');
    const mainResult = rformContentV03Cell_(row,h,'Main_Result');
    const planStatus = rformContentV03Cell_(row,h,'Plan_Status');
    const technique = rformContentV03Cell_(row,h,'Technique_Status');
    const painAfter = rformContentV03Cell_(row,h,'Pain_After');
    const conclusion = rformContentV03Cell_(row,h,'Session_Conclusion');
    const decision = rformContentV03Cell_(row,h,'Session_Decision');
    const combined = [mainResult,planStatus,technique,painAfter,conclusion,decision].join(' ');

    const hasRir0 = /RIR\s*0(?:\D|$)/i.test(combined);
    const hasDeviation = /BELOW_PLAN|ABOVE_PLAN/i.test(planStatus);
    const hasReplacement = /замен|дожим|дополнител/i.test(combined);
    const painValue = rformContentV03PainValue_(painAfter);
    const pain2Plus = painValue !== null && painValue >= 2;

    if (!hasRir0 && !hasDeviation && !hasReplacement && !pain2Plus) return;

    let trigger = 'SIGNIFICANT_DEVIATION';
    if (hasRir0 || pain2Plus) trigger = 'CONTROL_POINT';

    out.push({
      eventId:'EVT-' + dateText.replace(/\D/g,'') + '-SESSION-' + sessionId,
      date:dateText,
      entity:sessionId,
      eventType:hasRir0 ? 'CONTROL_POINT' : (hasReplacement ? 'PROGRAM_DEVIATION' : 'TRAINING_DEVIATION'),
      source:RFORM_CONTENT_EVENT_V03_CONFIG.sessionsSheet + ' / ' + sessionId,
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

function rformContentV03DetectDecisions_(ss, since, today) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V03_CONFIG.decisionsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV03HeaderMap_(values[0]);
  const allowed = RFORM_CONTENT_EVENT_V03_CONFIG.allowedDecisionAreas;
  const out = [];

  values.slice(1).forEach(row => {
    if (rformContentV03Cell_(row,h,'Status').toUpperCase() !== 'ACTIVE') return;
    const area = rformContentV03Cell_(row,h,'Area').toUpperCase();
    if (allowed.indexOf(area) === -1) return;

    const dateText = rformContentV03Cell_(row,h,'Decision_Date');
    const date = rformContentV03ParseDate_(dateText);
    if (!date || date < since) return;

    const effectiveFromText = rformContentV03Cell_(row,h,'Effective_From');
    const effectiveToText = rformContentV03Cell_(row,h,'Effective_To');
    const effectiveFrom = rformContentV03ParseDate_(effectiveFromText);
    const effectiveTo = rformContentV03ParseDate_(effectiveToText);
    if (effectiveFrom && effectiveFrom > today) return;
    if (effectiveTo && effectiveTo < today) return;

    const id = rformContentV03Cell_(row,h,'Decision_ID');
    const signal = rformContentV03Cell_(row,h,'Signal');
    const previous = rformContentV03Cell_(row,h,'Previous_Rule');
    const next = rformContentV03Cell_(row,h,'New_Rule');
    const changed = previous && next && previous !== next;
    if (!changed && ['CONTENT','TRAINING','NUTRITION','PRODUCT'].indexOf(area) === -1) return;

    const competitionSensitive = /TRAINING|NUTRITION/.test(area) && /старт|соревн|117,5|74,5|попыт/i.test(signal + ' ' + next);
    out.push({
      eventId:'EVT-' + dateText.replace(/\D/g,'') + '-DECISION-' + id,
      date:dateText,
      entity:id,
      eventType:changed ? 'DECISION_CHANGED' : 'DECISION_RECORDED',
      source:RFORM_CONTENT_EVENT_V03_CONFIG.decisionsSheet + ' / ' + id,
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

function rformContentV03BuildQueueIndex_(ss) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V03_CONFIG.queueSheet);
  const index = [];
  if (!sheet || sheet.getLastRow() < 2) return index;
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV03HeaderMap_(values[0]);

  values.slice(1).forEach(row => {
    const contentId = rformContentV03Cell_(row,h,'Content_ID');
    if (!contentId) return;
    const publicationStatus = rformContentV03Cell_(row,h,'Publication_Status').toUpperCase();
    const pipelineStatus = rformContentV03Cell_(row,h,'Pipeline_Status').toUpperCase();
    const searchable = [
      contentId,
      rformContentV03Cell_(row,h,'Session_ID'),
      rformContentV03Cell_(row,h,'Proof_Source'),
      rformContentV03Cell_(row,h,'Main_Training_Fact'),
      rformContentV03Cell_(row,h,'Decision'),
      rformContentV03Cell_(row,h,'Work_Packet_URL')
    ].join(' | ');
    index.push({contentId, publicationStatus, pipelineStatus, searchable});
  });
  return index;
}

function rformContentV03ReconcileQueue_(e, queueIndex) {
  const entity = String(e.entity || '').trim();
  if (!entity) return e;
  const hit = queueIndex.find(x => x.searchable.indexOf(entity) !== -1);
  if (!hit) return e;

  e.candidateContentId = hit.contentId;
  if (hit.publicationStatus === 'PUBLISHED') {
    e.status = 'PUBLISHED';
    e.manualGate = 'NO';
    e.ownerAction = 'NONE · source already published as ' + hit.contentId;
    return e;
  }

  const cancelled = /CANCELLED|SUPERSEDED|ARCHIVED/.test(hit.publicationStatus + ' ' + hit.pipelineStatus);
  if (!cancelled) {
    e.status = 'ALREADY_IN_PIPELINE';
    e.ownerAction = 'NONE · source already covered by ' + hit.contentId;
    // Preserve health/competition gate semantics in the content item itself, but do not create a second editorial gate here.
    e.manualGate = 'NO · gate handled in CONTENT_QUEUE';
  }
  return e;
}

function rformContentV03Finalize_(e) {
  const w = RFORM_CONTENT_EVENT_V03_CONFIG.weights;
  const weighted = e.relevance*w.relevance + e.novelty*w.novelty + e.education*w.education + e.emotion*w.emotion + e.proof*w.proof + e.narrative*w.narrative + e.audience*w.audience;
  e.contentValueScore = Math.round(weighted/10);
  if (!e.status) e.status = e.contentValueScore >= 80 ? 'PRIORITY_CANDIDATE' : e.contentValueScore >= 65 ? 'CONTENT_CANDIDATE' : e.contentValueScore >= 50 ? 'BACKLOG' : 'AGGREGATE_ONLY';
  return e;
}

function rformContentV03WriteRow_(sheet,rowNumber,h,e,now,isNew) {
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

function rformContentV03ExistingRows_(sheet,h) {
  const out = {};
  if (sheet.getLastRow() < 2) return out;
  const values = sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getDisplayValues();
  values.forEach((row,i) => { const id = row[h.Event_ID]; if (id) out[id] = i+2; });
  return out;
}

function rformContentV03ReadHeaders_(sheet) {
  return sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(String);
}

function rformContentV03HeaderMap_(headers) {
  const out = {};
  headers.forEach((x,i) => { if (x) out[String(x).trim()] = i; });
  return out;
}

function rformContentV03Cell_(row,h,name) {
  return h[name] === undefined ? '' : String(row[h[name]] || '').trim();
}

function rformContentV03ParseDate_(s) {
  const m = String(s || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
}

function rformContentV03PainValue_(s) {
  const text = String(s || '').trim().replace(',','.');
  if (!text) return null;
  const m = text.match(/(-?\d+(?:\.\d+)?)(?:\s*\/\s*10)?/);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}
