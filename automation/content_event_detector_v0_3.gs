// R/Form Content Event Detector v0.4 · Capture → Closure → Events lifecycle v1.0
// Reads canonical Master Data and writes only DATA_EVENTS.
// Existing capture tables remain canonical; this module only normalizes closed facts into events.
// Existing trigger handler name is preserved for in-place production compatibility.

const RFORM_CONTENT_EVENT_V04_CONFIG = Object.freeze({
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  dailySheet: 'DAILY',
  nutritionDailySheet: 'NUTRITION_DAILY',
  sessionsSheet: 'TRAINING_SESSIONS',
  measurementsSheet: 'MEASUREMENTS',
  decisionsSheet: 'DECISIONS',
  closureSheet: 'DAY_CLOSURE',
  queueSheet: 'CONTENT_QUEUE',
  eventsSheet: 'DATA_EVENTS',
  lookbackDays: 10,
  lifecycleStart: '10.10.2026',
  allowedDecisionAreas: Object.freeze(['CONTENT','TRAINING','NUTRITION','PRODUCT']),
  weights: Object.freeze({relevance:20, novelty:15, education:15, emotion:10, proof:15, narrative:15, audience:10})
});

// Compatibility alias for existing tooling that anchors this constant/function family.
const RFORM_CONTENT_EVENT_V03_CONFIG = RFORM_CONTENT_EVENT_V04_CONFIG;

function rformContentEventDetectorPreviewV03() {
  return rformContentEventDetectorPreviewV04();
}

function rformContentEventDetectorPreviewV04() {
  const ss = SpreadsheetApp.openById(RFORM_CONTENT_EVENT_V04_CONFIG.spreadsheetId);
  const today = new Date();
  today.setHours(0,0,0,0);
  const since = new Date(today);
  since.setDate(since.getDate() - RFORM_CONTENT_EVENT_V04_CONFIG.lookbackDays);
  const lifecycleStart = rformContentV04ParseDate_(RFORM_CONTENT_EVENT_V04_CONFIG.lifecycleStart);
  const closureIndex = rformContentV04BuildClosureIndex_(ss);
  const dailyIndex = rformContentV04BuildDailyIndex_(ss);
  const queueIndex = rformContentV04BuildQueueIndex_(ss);

  const significantSessions = rformContentV04DetectSessions_(ss, since)
    .filter(function(e) {
      const date = rformContentV04ParseDate_(e.date);
      if (!date || !lifecycleStart || date < lifecycleStart) return true;
      return rformContentV04ClosureAccepted_(closureIndex, e._dayId, e.date);
    });
  const significantSessionIds = {};
  significantSessions.forEach(function(e) { significantSessionIds[e.eventId] = true; });

  const events = significantSessions
    .concat(rformContentV04DetectRoutineSessions_(ss, since, lifecycleStart, closureIndex, significantSessionIds))
    .concat(rformContentV04DetectClosedDays_(ss, since, lifecycleStart, closureIndex))
    .concat(rformContentV04DetectClosedNutrition_(ss, since, lifecycleStart, closureIndex, dailyIndex))
    .concat(rformContentV04DetectMeasurements_(ss, since, lifecycleStart, closureIndex))
    .concat(rformContentV04DetectDecisions_(ss, since, today))
    .map(rformContentV04Finalize_)
    .map(function(e) { return rformContentV04ReconcileQueue_(e, queueIndex); });

  const unique = rformContentV04UniqueEvents_(events)
    .sort(function(a,b) {
      return String(b.date).localeCompare(String(a.date)) || b.contentValueScore - a.contentValueScore;
    });

  return {
    ok: true,
    version: '0.4',
    lifecycleVersion: '1.0',
    mode: 'READ_ONLY_PREVIEW',
    lookbackDays: RFORM_CONTENT_EVENT_V04_CONFIG.lookbackDays,
    lifecycleStart: RFORM_CONTENT_EVENT_V04_CONFIG.lifecycleStart,
    eventCount: unique.length,
    events: unique,
    note: 'Capture sources were read only. Only facts that passed their closure gate are eligible. No DATA_EVENTS, CONTENT_QUEUE, triggers or Telegram messages were changed.'
  };
}

function rformContentEventDetectorWriteV03(e) {
  const startedAt = new Date();
  const triggerUid = e && (typeof e.triggerUid === 'string' || typeof e.triggerUid === 'number') ? String(e.triggerUid) : '';
  const safeTriggerUid = /^[A-Za-z0-9_-]{1,128}$/.test(triggerUid) ? triggerUid : '';
  const receipt = {
    message:'RFORM_DETECTOR_RUN',
    schema_version:'1.0',
    run_id:Utilities.getUuid(),
    component:'CONTENT_EVENT_DETECTOR',
    handler:'rformContentEventDetectorWriteV03',
    component_version:'0.4',
    lifecycle_version:'1.0',
    observability_version:'0.1',
    source_baseline:'1b0474f4fa2616af5c6353650246476b67981774',
    runtime_source_evidence:'UNVERIFIED',
    invocation_kind:safeTriggerUid ? 'INSTALLABLE_EVENT' : 'MANUAL_OR_API',
    trigger_uid:safeTriggerUid || null,
    started_at:startedAt.toISOString()
  };
  console.log(JSON.stringify(Object.assign({}, receipt, {phase:'START', outcome:'RUNNING'})));
  try {
    const result = rformContentEventDetectorWriteV04Core_();
    const keys = ['inserted','updated','unchanged','filtered','filteredUnchanged','totalDetected'];
    if (!result || result.ok !== true || result.mode !== 'DATA_EVENTS_ONLY' ||
        keys.some(function(k) { return !Number.isInteger(result[k]) || result[k] < 0; }) ||
        result.totalDetected !== result.inserted + result.updated + result.unchanged) {
      throw new Error('DETECTOR_COUNTERS_INVALID');
    }
    const counters = {};
    keys.forEach(function(k) { counters[k] = result[k]; });
    const mutationCount = result.inserted + result.updated + result.filtered;
    const completedAt = new Date();
    console.log(JSON.stringify(Object.assign({}, receipt, {
      phase:'FINISH', outcome:mutationCount ? 'APPLIED' : 'NO_OP',
      completed_at:completedAt.toISOString(),
      duration_ms:Math.max(0, completedAt.getTime() - startedAt.getTime()),
      mutation_count:mutationCount, counters:counters,
      business_readback:'NOT_PERFORMED_BY_RECEIPT'
    })));
    return result;
  } catch (error) {
    const completedAt = new Date();
    try {
      console.error(JSON.stringify(Object.assign({}, receipt, {
        phase:'FINISH', outcome:'ERROR',
        completed_at:completedAt.toISOString(),
        duration_ms:Math.max(0, completedAt.getTime() - startedAt.getTime()),
        business_effects:'UNKNOWN_OR_PARTIAL',
        error_code:'PROCESSING_OR_RECEIPT_FAILED'
      })));
    } catch (_) {}
    throw error;
  }
}

function rformContentEventDetectorWriteV03Core_() {
  return rformContentEventDetectorWriteV04Core_();
}

function rformContentEventDetectorWriteV04Core_() {
  const preview = rformContentEventDetectorPreviewV04();
  const ss = SpreadsheetApp.openById(RFORM_CONTENT_EVENT_V04_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.eventsSheet);
  if (!sheet) throw new Error('Missing sheet: ' + RFORM_CONTENT_EVENT_V04_CONFIG.eventsSheet);
  const h = rformContentV04HeaderMap_(rformContentV04ReadHeaders_(sheet));
  const required = ['Event_ID','Date','Entity','Event_Type','Source','Fact','Relevance_0_10','Novelty_0_10','Education_0_10','Emotion_0_10','Proof_0_10','Narrative_0_10','Audience_0_10','Content_Value_Score','Editorial_Trigger','Manual_Gate','Candidate_Content_ID','Status','Recommended_Angle_1','Recommended_Angle_2','Recommended_Angle_3','Owner_Action','Created_At','Updated_At'];
  const missing = required.filter(function(x) { return h[x] === undefined; });
  if (missing.length) throw new Error('DATA_EVENTS missing headers: ' + missing.join(', '));

  const existing = rformContentV04ExistingRows_(sheet, h);
  const now = new Date();
  const activeIds = {};
  let inserted = 0, updated = 0, unchanged = 0, filtered = 0, filteredUnchanged = 0;

  preview.events.forEach(function(e) {
    activeIds[e.eventId] = true;
    const record = existing[e.eventId];
    if (record) {
      const changed = rformContentV04WriteRow_(sheet, record.rowNumber, h, e, now, false, record.values);
      if (changed) updated++; else unchanged++;
    } else {
      const target = Math.max(sheet.getLastRow() + 1, 2);
      rformContentV04WriteRow_(sheet, target, h, e, now, true, null);
      existing[e.eventId] = {rowNumber:target, values:null};
      inserted++;
    }
  });

  // Preserve v0.3 cleanup only for legacy session/decision events. Lifecycle-domain events are append-stable history.
  const lifecycleStart = rformContentV04ParseDate_(RFORM_CONTENT_EVENT_V04_CONFIG.lifecycleStart);
  Object.keys(existing).forEach(function(id) {
    if (activeIds[id]) return;
    const record = existing[id];
    const isDecision = /^EVT-\d{8}-DECISION-/.test(id);
    const isSession = /^EVT-\d{8}-SESSION-/.test(id);
    if (!isDecision && !isSession) return;
    if (isSession) {
      const rowDate = h.Date === undefined ? null : rformContentV04ParseDate_(record.values && record.values[h.Date]);
      if (rowDate && lifecycleStart && rowDate >= lifecycleStart) return;
    }
    const desired = {Status:'FILTERED_OUT_V04', Manual_Gate:'NO', Owner_Action:'NONE · filtered by active-window/source gates'};
    const changedKeys = Object.keys(desired).filter(function(k) {
      return h[k] !== undefined && !rformContentV04ValueEqual_(record.values && record.values[h[k]], desired[k]);
    });
    if (!changedKeys.length) { filteredUnchanged++; return; }
    changedKeys.forEach(function(k) { sheet.getRange(record.rowNumber, h[k] + 1).setValue(desired[k]); });
    if (h.Updated_At !== undefined) sheet.getRange(record.rowNumber, h.Updated_At + 1).setValue(now);
    filtered++;
  });

  return {
    ok:true, version:'0.4', lifecycleVersion:'1.0', mode:'DATA_EVENTS_ONLY',
    inserted:inserted, updated:updated, unchanged:unchanged,
    filtered:filtered, filteredUnchanged:filteredUnchanged,
    totalDetected:preview.events.length,
    note:'Only DATA_EVENTS changed. Capture sources, closure records, CONTENT_QUEUE and Telegram were not changed.'
  };
}

function rformContentEventDetectorInstallTriggerV03() {
  const handler = 'rformContentEventDetectorWriteV03';
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(handler).timeBased().everyHours(6).create();
  return {ok:true, version:'0.4', lifecycleVersion:'1.0', handler:handler, cadence:'EVERY_6_HOURS', boundary:'DATA_EVENTS_ONLY'};
}

function rformContentEventDetectorRemoveTriggerV03() {
  const handler = 'rformContentEventDetectorWriteV03';
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === handler) { ScriptApp.deleteTrigger(t); removed++; }
  });
  return {ok:true, removed:removed, handler:handler};
}

function rformContentV04BuildClosureIndex_(ss) {
  const out = {byDayId:{}, byDate:{}};
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.closureSheet);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV04HeaderMap_(values[0]);
  values.slice(1).forEach(function(row) {
    const dayId = rformContentV04Cell_(row,h,'Day_ID');
    const date = rformContentV04Cell_(row,h,'Date');
    const closure = {
      dayId:dayId,
      date:date,
      requested:/^(REQUESTED|YES|TRUE|1|CLOSE)$/i.test(rformContentV04Cell_(row,h,'Close_Request')),
      ready:/^(READY|CLOSED)$/i.test(rformContentV04Cell_(row,h,'Close_Readiness')),
      blockers:rformContentV04Cell_(row,h,'Blocking_Issues'),
      closedAt:rformContentV04Cell_(row,h,'Closed_At'),
      duplicateCount:rformContentV04Number_(rformContentV04Cell_(row,h,'Duplicate_Count')),
      openQaCount:rformContentV04Number_(rformContentV04Cell_(row,h,'Open_QA_Count'))
    };
    closure.accepted = closure.requested && closure.ready && !closure.blockers && !!closure.closedAt &&
      (closure.duplicateCount === null || closure.duplicateCount === 0) &&
      (closure.openQaCount === null || closure.openQaCount === 0);
    if (dayId) out.byDayId[dayId] = closure;
    if (date) out.byDate[date] = closure;
  });
  return out;
}

function rformContentV04ClosureAccepted_(index, dayId, date) {
  const closure = (dayId && index.byDayId[dayId]) || (date && index.byDate[date]);
  return !!(closure && closure.accepted);
}

function rformContentV04BuildDailyIndex_(ss) {
  const out = {};
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.dailySheet);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV04HeaderMap_(values[0]);
  values.slice(1).forEach(function(row) {
    const id = rformContentV04Cell_(row,h,'Day_ID');
    if (!id) return;
    const item = {};
    Object.keys(h).forEach(function(k) { item[k] = rformContentV04Cell_(row,h,k); });
    out[id] = item;
  });
  return out;
}

function rformContentV04DetectClosedDays_(ss, since, lifecycleStart, closureIndex) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.dailySheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV04HeaderMap_(values[0]);
  const out = [];
  values.slice(1).forEach(function(row) {
    const dayId = rformContentV04Cell_(row,h,'Day_ID');
    const dateText = rformContentV04Cell_(row,h,'Date');
    const date = rformContentV04ParseDate_(dateText);
    if (!dayId || !date || date < since || (lifecycleStart && date < lifecycleStart)) return;
    if (rformContentV04Cell_(row,h,'Day_Status').toUpperCase() !== 'CLOSED') return;
    if (!rformContentV04ClosureAccepted_(closureIndex, dayId, dateText)) return;

    const weight = rformContentV04Number_(rformContentV04Cell_(row,h,'Morning_Weight'));
    const avg = rformContentV04Number_(rformContentV04Cell_(row,h,'Weight_7D_Average'));
    const readiness = rformContentV04Number_(rformContentV04Cell_(row,h,'Readiness'));
    const sleep = rformContentV04Number_(rformContentV04Cell_(row,h,'Sleep_Hours'));
    const pains = ['Shoulder_Pain','Elbow_Pain','Other_Pain'].map(function(k) { return rformContentV04Number_(rformContentV04Cell_(row,h,k)); }).filter(function(x) { return x !== null; });
    const maxPain = pains.length ? Math.max.apply(null,pains) : null;
    const weightDelta = weight !== null && avg ? Math.abs(weight - avg) / avg : 0;
    const healthGate = maxPain !== null && maxPain >= 2;
    const recoverySignal = healthGate || (readiness !== null && readiness <= 6) || (sleep !== null && sleep < 6);
    const weightSignal = weightDelta >= 0.015;
    const conclusion = rformContentV04Cell_(row,h,'Daily_Conclusion');
    const summary = conclusion || [
      dateText,
      rformContentV04Cell_(row,h,'Day_Type'),
      weight !== null ? 'вес ' + weight + ' кг' : '',
      sleep !== null ? 'сон ' + sleep + ' ч' : '',
      readiness !== null ? 'готовность ' + readiness + '/10' : '',
      maxPain !== null ? 'боль max ' + maxPain + '/10' : ''
    ].filter(Boolean).join(' · ');

    out.push({
      eventId:'EVT-' + dateText.replace(/\D/g,'') + '-DAY-' + dayId,
      date:dateText, entity:dayId,
      eventType:healthGate ? 'RECOVERY_CONTROL_POINT' : (recoverySignal ? 'RECOVERY_DEVIATION' : (weightSignal ? 'BODYWEIGHT_DEVIATION' : 'DAY_CLOSED')),
      source:'DAILY + DAY_CLOSURE / ' + dayId,
      fact:summary,
      relevance:healthGate ? 9 : (recoverySignal || weightSignal ? 7 : 4),
      novelty:healthGate ? 8 : (recoverySignal || weightSignal ? 6 : 3),
      education:recoverySignal || weightSignal ? 7 : 4,
      emotion:healthGate ? 8 : (recoverySignal ? 6 : 2),
      proof:9, narrative:recoverySignal || weightSignal ? 7 : 4, audience:recoverySignal || weightSignal ? 7 : 4,
      trigger:healthGate ? 'CONTROL_POINT' : (recoverySignal || weightSignal ? 'SIGNIFICANT_DEVIATION' : 'FACT_CLOSED'),
      manualGate:healthGate ? 'YES · HEALTH' : 'NO', candidateContentId:'',
      status:healthGate ? 'OWNER_GATE' : (recoverySignal || weightSignal ? 'AGGREGATE_TO_WEEKLY' : 'AGGREGATE_ONLY'),
      angle1:healthGate ? 'Закрытый день выявил болевой контрольный сигнал' : (recoverySignal || weightSignal ? 'Как состояние изменилось относительно рабочего коридора' : 'Закрытый день как подтверждённый факт'),
      angle2:'', angle3:'', ownerAction:healthGate ? 'Approve interpretation before any standalone publication' : 'NONE'
    });
  });
  return out;
}

function rformContentV04DetectClosedNutrition_(ss, since, lifecycleStart, closureIndex, dailyIndex) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.nutritionDailySheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV04HeaderMap_(values[0]);
  const out = [];
  values.slice(1).forEach(function(row) {
    const dayId = rformContentV04Cell_(row,h,'Day_ID');
    const dateText = rformContentV04Cell_(row,h,'Date');
    const date = rformContentV04ParseDate_(dateText);
    if (!dayId || !date || date < since || (lifecycleStart && date < lifecycleStart)) return;
    if (rformContentV04Cell_(row,h,'Status').toUpperCase() !== 'CLOSED') return;
    if (!rformContentV04ClosureAccepted_(closureIndex, dayId, dateText)) return;
    const day = dailyIndex[dayId] || {};
    const significant = rformContentV04NutritionDeviation_(day, row, h);
    const deviation = rformContentV04Cell_(row,h,'Main_Deviation');
    const decision = rformContentV04Cell_(row,h,'Nutrition_Decision');
    const fact = deviation || rformContentV04NutritionSummary_(row,h);
    out.push({
      eventId:'EVT-' + dateText.replace(/\D/g,'') + '-NUTRITION-' + dayId,
      date:dateText, entity:dayId + '-NUTRITION',
      eventType:significant ? 'NUTRITION_DEVIATION' : 'NUTRITION_CLOSED',
      source:'NUTRITION_DAILY + DAY_CLOSURE / ' + dayId,
      fact:(fact + (significant && decision ? ' | Решение: ' + decision : '')).slice(0,4500),
      relevance:significant ? 7 : 4, novelty:significant ? 6 : 3, education:significant ? 8 : 4,
      emotion:significant ? 4 : 2, proof:9, narrative:significant ? 7 : 4, audience:significant ? 7 : 4,
      trigger:significant ? 'SIGNIFICANT_DEVIATION' : 'FACT_CLOSED', manualGate:'NO', candidateContentId:'',
      status:significant ? 'AGGREGATE_TO_WEEKLY' : 'AGGREGATE_ONLY',
      angle1:significant ? 'План и фактический рацион разошлись — что изменилось в решении' : 'Рацион закрыт как проверенный факт',
      angle2:'', angle3:'', ownerAction:'NONE'
    });
  });
  return out;
}

function rformContentV04NutritionDeviation_(day,row,h) {
  const checks = [
    ['Calories_Plan_Min','Calories_Plan_Max','Calories_Min','Calories_Max',0.05],
    ['Protein_Plan_Min','Protein_Plan_Max','Protein_Min','Protein_Max',0.05],
    ['Fat_Plan_Min','Fat_Plan_Max','Fat_Min','Fat_Max',0.10],
    ['Carbs_Plan_Min','Carbs_Plan_Max','Carbs_Min','Carbs_Max',0.08]
  ];
  return checks.some(function(c) {
    const pmin = rformContentV04Number_(day[c[0]]), pmax = rformContentV04Number_(day[c[1]]);
    const fmin = rformContentV04Number_(rformContentV04Cell_(row,h,c[2])), fmax = rformContentV04Number_(rformContentV04Cell_(row,h,c[3]));
    if (pmin === null || pmax === null || fmin === null || fmax === null) return false;
    return fmax < pmin * (1 - c[4]) || fmin > pmax * (1 + c[4]);
  });
}

function rformContentV04NutritionSummary_(row,h) {
  return [
    'Питание закрыто',
    'ккал ' + rformContentV04Cell_(row,h,'Calories_Min') + '–' + rformContentV04Cell_(row,h,'Calories_Max'),
    'Б ' + rformContentV04Cell_(row,h,'Protein_Min') + '–' + rformContentV04Cell_(row,h,'Protein_Max'),
    'Ж ' + rformContentV04Cell_(row,h,'Fat_Min') + '–' + rformContentV04Cell_(row,h,'Fat_Max'),
    'У ' + rformContentV04Cell_(row,h,'Carbs_Min') + '–' + rformContentV04Cell_(row,h,'Carbs_Max')
  ].join(' · ');
}

function rformContentV04DetectSessions_(ss, since) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.sessionsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV04HeaderMap_(values[0]);
  const out = [];
  values.slice(1).forEach(function(row) {
    if (rformContentV04Cell_(row,h,'Session_Status').toUpperCase() !== 'CLOSED') return;
    if (rformContentV04Cell_(row,h,'Duplicate_Flag')) return;
    const dateText = rformContentV04Cell_(row,h,'Date');
    const date = rformContentV04ParseDate_(dateText);
    if (!date || date < since) return;
    const sessionId = rformContentV04Cell_(row,h,'Session_ID');
    const dayId = rformContentV04Cell_(row,h,'Day_ID');
    const mainResult = rformContentV04Cell_(row,h,'Main_Result');
    const planStatus = rformContentV04Cell_(row,h,'Plan_Status');
    const technique = rformContentV04Cell_(row,h,'Technique_Status');
    const painAfter = rformContentV04Cell_(row,h,'Pain_After');
    const conclusion = rformContentV04Cell_(row,h,'Session_Conclusion');
    const decision = rformContentV04Cell_(row,h,'Session_Decision');
    const combined = [mainResult,planStatus,technique,painAfter,conclusion,decision].join(' ');
    const hasRir0 = /RIR\s*0(?:\D|$)/i.test(combined);
    const hasDeviation = /BELOW_PLAN|ABOVE_PLAN/i.test(planStatus);
    const hasReplacement = /замен|дожим|дополнител/i.test(combined);
    const painValue = rformContentV04PainValue_(painAfter);
    const pain2Plus = painValue !== null && painValue >= 2;
    if (!hasRir0 && !hasDeviation && !hasReplacement && !pain2Plus) return;
    out.push({
      eventId:'EVT-' + dateText.replace(/\D/g,'') + '-SESSION-' + sessionId,
      date:dateText, entity:sessionId, _dayId:dayId,
      eventType:hasRir0 ? 'CONTROL_POINT' : (hasReplacement ? 'PROGRAM_DEVIATION' : 'TRAINING_DEVIATION'),
      source:RFORM_CONTENT_EVENT_V04_CONFIG.sessionsSheet + ' / ' + sessionId,
      fact:mainResult + (conclusion ? ' | ' + conclusion : ''),
      relevance:hasRir0 ? 10 : 7, novelty:hasRir0 ? 9 : 6, education:hasReplacement ? 8 : 7,
      emotion:hasRir0 ? 8 : (pain2Plus ? 8 : 5), proof:9, narrative:hasRir0 ? 9 : 7, audience:hasRir0 ? 8 : 6,
      trigger:(hasRir0 || pain2Plus) ? 'CONTROL_POINT' : 'SIGNIFICANT_DEVIATION',
      manualGate:pain2Plus ? 'YES · HEALTH' : (hasRir0 ? 'YES · COMPETITION_TRAJECTORY' : 'NO'),
      candidateContentId:'', status:hasRir0 || pain2Plus ? 'OWNER_GATE' : 'AGGREGATE_TO_WEEKLY',
      angle1:hasRir0 ? 'Контрольный результат изменил следующий шаг' : 'План и факт разошлись — важно понять значимость',
      angle2:hasReplacement ? 'Как фиксировать осознанную замену, не переписывая план' : '', angle3:'',
      ownerAction:hasRir0 || pain2Plus ? 'Editorial decision required before standalone publication' : 'NONE'
    });
  });
  return out;
}

function rformContentV04DetectRoutineSessions_(ss, since, lifecycleStart, closureIndex, significantIds) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.sessionsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV04HeaderMap_(values[0]);
  const out = [];
  values.slice(1).forEach(function(row) {
    if (rformContentV04Cell_(row,h,'Session_Status').toUpperCase() !== 'CLOSED') return;
    if (rformContentV04Cell_(row,h,'Duplicate_Flag')) return;
    const dateText = rformContentV04Cell_(row,h,'Date');
    const date = rformContentV04ParseDate_(dateText);
    if (!date || date < since || (lifecycleStart && date < lifecycleStart)) return;
    const sessionId = rformContentV04Cell_(row,h,'Session_ID');
    const dayId = rformContentV04Cell_(row,h,'Day_ID');
    if (!sessionId || !rformContentV04ClosureAccepted_(closureIndex, dayId, dateText)) return;
    const eventId = 'EVT-' + dateText.replace(/\D/g,'') + '-SESSION-' + sessionId;
    if (significantIds[eventId]) return;
    const mainResult = rformContentV04Cell_(row,h,'Main_Result');
    const conclusion = rformContentV04Cell_(row,h,'Session_Conclusion');
    out.push({
      eventId:eventId, date:dateText, entity:sessionId, _dayId:dayId,
      eventType:'TRAINING_COMPLETED', source:RFORM_CONTENT_EVENT_V04_CONFIG.sessionsSheet + ' / ' + sessionId,
      fact:mainResult + (conclusion ? ' | ' + conclusion : ''),
      relevance:5, novelty:3, education:5, emotion:3, proof:9, narrative:5, audience:5,
      trigger:'FACT_CLOSED', manualGate:'NO', candidateContentId:'', status:'AGGREGATE_ONLY',
      angle1:'Закрытая тренировка как проверенный план/факт', angle2:'', angle3:'', ownerAction:'NONE'
    });
  });
  return out;
}

function rformContentV04DetectMeasurements_(ss, since, lifecycleStart, closureIndex) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.measurementsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV04HeaderMap_(values[0]);
  const rows = [];
  values.slice(1).forEach(function(row) {
    if (rformContentV04Cell_(row,h,'Duplicate_Flag')) return;
    if (rformContentV04Cell_(row,h,'Comparable').toUpperCase() !== 'YES') return;
    const dateText = rformContentV04Cell_(row,h,'Date');
    const date = rformContentV04ParseDate_(dateText);
    if (!date || date < since) return;
    rows.push({
      date:date, dateText:dateText,
      metric:rformContentV04Cell_(row,h,'Metric'), value:rformContentV04Number_(rformContentV04Cell_(row,h,'Value')),
      valueText:rformContentV04Cell_(row,h,'Value'), unit:rformContentV04Cell_(row,h,'Unit')
    });
  });
  rows.sort(function(a,b) { return a.date - b.date; });
  const prior = {};
  const groups = {};
  rows.forEach(function(r) {
    const previous = prior[r.metric];
    r.previous = previous || null;
    prior[r.metric] = r;
    if (!groups[r.dateText]) groups[r.dateText] = [];
    groups[r.dateText].push(r);
  });
  const out = [];
  Object.keys(groups).forEach(function(dateText) {
    const date = rformContentV04ParseDate_(dateText);
    if (!date || (lifecycleStart && date < lifecycleStart)) return;
    if (!rformContentV04ClosureAccepted_(closureIndex, '', dateText)) return;
    const items = groups[dateText];
    const significant = items.some(rformContentV04MeasurementChanged_);
    const key = dateText.replace(/\D/g,'');
    const fact = items.slice(0,10).map(function(x) { return x.metric + ' ' + x.valueText + (x.unit ? ' ' + x.unit : ''); }).join(' · ');
    out.push({
      eventId:'EVT-' + key + '-MEASUREMENTS-' + key, date:dateText, entity:'MEASUREMENTS-' + key,
      eventType:significant ? 'MEASUREMENT_CHANGE' : 'MEASUREMENTS_ACCEPTED',
      source:'MEASUREMENTS + DAY_CLOSURE / ' + dateText, fact:fact,
      relevance:significant ? 7 : 4, novelty:significant ? 7 : 3, education:significant ? 7 : 4,
      emotion:significant ? 5 : 2, proof:9, narrative:significant ? 7 : 4, audience:significant ? 6 : 4,
      trigger:significant ? 'SIGNIFICANT_DEVIATION' : 'FACT_CLOSED', manualGate:'NO', candidateContentId:'',
      status:significant ? 'AGGREGATE_TO_WEEKLY' : 'AGGREGATE_ONLY',
      angle1:significant ? 'Что изменилось в сопоставимых замерах' : 'Сопоставимые замеры приняты как факт',
      angle2:'', angle3:'', ownerAction:'NONE'
    });
  });
  return out;
}

function rformContentV04MeasurementChanged_(r) {
  if (!r || !r.previous || r.value === null || r.previous.value === null) return false;
  const delta = Math.abs(r.value - r.previous.value);
  const metric = String(r.metric || '').toUpperCase();
  if (/MORNING_WEIGHT|WEIGHT/.test(metric)) return delta >= 1.0;
  if (/WAIST|CHEST|ARM|BICEP|THIGH|HIP|GLUTE|NECK|SHOULDER/.test(metric)) return delta >= 1.5;
  return r.previous.value !== 0 && delta / Math.abs(r.previous.value) >= 0.03;
}

function rformContentV04DetectDecisions_(ss, since, today) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.decisionsSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV04HeaderMap_(values[0]);
  const allowed = RFORM_CONTENT_EVENT_V04_CONFIG.allowedDecisionAreas;
  const out = [];
  values.slice(1).forEach(function(row) {
    if (rformContentV04Cell_(row,h,'Status').toUpperCase() !== 'ACTIVE') return;
    const area = rformContentV04Cell_(row,h,'Area').toUpperCase();
    if (allowed.indexOf(area) === -1) return;
    const dateText = rformContentV04Cell_(row,h,'Decision_Date');
    const date = rformContentV04ParseDate_(dateText);
    if (!date || date < since) return;
    const effectiveFrom = rformContentV04ParseDate_(rformContentV04Cell_(row,h,'Effective_From'));
    const effectiveTo = rformContentV04ParseDate_(rformContentV04Cell_(row,h,'Effective_To'));
    if (effectiveFrom && effectiveFrom > today) return;
    if (effectiveTo && effectiveTo < today) return;
    const id = rformContentV04Cell_(row,h,'Decision_ID');
    const signal = rformContentV04Cell_(row,h,'Signal');
    const previous = rformContentV04Cell_(row,h,'Previous_Rule');
    const next = rformContentV04Cell_(row,h,'New_Rule');
    const changed = previous && next && previous !== next;
    const competitionSensitive = /TRAINING|NUTRITION/.test(area) && /старт|соревн|117,5|74,5|попыт/i.test(signal + ' ' + next);
    out.push({
      eventId:'EVT-' + dateText.replace(/\D/g,'') + '-DECISION-' + id,
      date:dateText, entity:id, eventType:changed ? 'DECISION_CHANGED' : 'DECISION_RECORDED',
      source:RFORM_CONTENT_EVENT_V04_CONFIG.decisionsSheet + ' / ' + id,
      fact:signal + (next ? ' | Новое правило: ' + next : ''),
      relevance:changed ? 9 : 7, novelty:changed ? 8 : 6, education:8, emotion:competitionSensitive ? 8 : 5,
      proof:9, narrative:changed ? 10 : 7, audience:8,
      trigger:changed ? 'DECISION_CHANGED' : 'AUDIENCE_LEARNING',
      manualGate:competitionSensitive ? 'YES · COMPETITION_OR_NUTRITION' : 'NO', candidateContentId:'',
      status:competitionSensitive ? 'OWNER_GATE' : 'DATA_READY',
      angle1:'Что изменилось между прошлым и новым решением', angle2:'Как не переписывать историю после новой информации',
      angle3:'Что читатель может применить к своей системе', ownerAction:competitionSensitive ? 'Approve public interpretation before publication' : 'NONE'
    });
  });
  return out;
}

function rformContentV04BuildQueueIndex_(ss) {
  const sheet = ss.getSheetByName(RFORM_CONTENT_EVENT_V04_CONFIG.queueSheet);
  const index = [];
  if (!sheet || sheet.getLastRow() < 2) return index;
  const values = sheet.getDataRange().getDisplayValues();
  const h = rformContentV04HeaderMap_(values[0]);
  values.slice(1).forEach(function(row) {
    const contentId = rformContentV04Cell_(row,h,'Content_ID');
    if (!contentId) return;
    const publicationStatus = rformContentV04Cell_(row,h,'Publication_Status').toUpperCase();
    const pipelineStatus = rformContentV04Cell_(row,h,'Pipeline_Status').toUpperCase();
    const searchable = [contentId,rformContentV04Cell_(row,h,'Session_ID'),rformContentV04Cell_(row,h,'Proof_Source'),rformContentV04Cell_(row,h,'Main_Training_Fact'),rformContentV04Cell_(row,h,'Decision'),rformContentV04Cell_(row,h,'Work_Packet_URL')].join(' | ');
    index.push({contentId:contentId, publicationStatus:publicationStatus, pipelineStatus:pipelineStatus, searchable:searchable});
  });
  return index;
}

function rformContentV04ReconcileQueue_(e, queueIndex) {
  const entity = String(e.entity || '').trim();
  if (!entity) return e;
  const hit = queueIndex.find(function(x) { return x.searchable.indexOf(entity) !== -1; });
  if (!hit) return e;
  e.candidateContentId = hit.contentId;
  if (hit.publicationStatus === 'PUBLISHED') {
    e.status = 'PUBLISHED'; e.manualGate = 'NO'; e.ownerAction = 'NONE · source already published as ' + hit.contentId; return e;
  }
  const cancelled = /CANCELLED|SUPERSEDED|ARCHIVED/.test(hit.publicationStatus + ' ' + hit.pipelineStatus);
  if (!cancelled) {
    e.status = 'ALREADY_IN_PIPELINE'; e.ownerAction = 'NONE · source already covered by ' + hit.contentId;
    e.manualGate = 'NO · gate handled in CONTENT_QUEUE';
  }
  return e;
}

function rformContentV04Finalize_(e) {
  const w = RFORM_CONTENT_EVENT_V04_CONFIG.weights;
  const weighted = e.relevance*w.relevance + e.novelty*w.novelty + e.education*w.education + e.emotion*w.emotion + e.proof*w.proof + e.narrative*w.narrative + e.audience*w.audience;
  e.contentValueScore = Math.round(weighted/10);
  if (!e.status) e.status = e.contentValueScore >= 80 ? 'PRIORITY_CANDIDATE' : e.contentValueScore >= 65 ? 'CONTENT_CANDIDATE' : e.contentValueScore >= 50 ? 'BACKLOG' : 'AGGREGATE_ONLY';
  return e;
}

function rformContentV04UniqueEvents_(events) {
  const out = [], seen = {};
  (events || []).forEach(function(e) {
    if (!e || !e.eventId || seen[e.eventId]) return;
    seen[e.eventId] = true; out.push(e);
  });
  return out;
}

function rformContentV04WriteRow_(sheet,rowNumber,h,e,now,isNew,currentRow) {
  const values = {
    Event_ID:e.eventId, Date:e.date, Entity:e.entity, Event_Type:e.eventType, Source:e.source, Fact:e.fact,
    Relevance_0_10:e.relevance, Novelty_0_10:e.novelty, Education_0_10:e.education, Emotion_0_10:e.emotion,
    Proof_0_10:e.proof, Narrative_0_10:e.narrative, Audience_0_10:e.audience, Content_Value_Score:e.contentValueScore,
    Editorial_Trigger:e.trigger, Manual_Gate:e.manualGate, Candidate_Content_ID:e.candidateContentId || '', Status:e.status,
    Recommended_Angle_1:e.angle1 || '', Recommended_Angle_2:e.angle2 || '', Recommended_Angle_3:e.angle3 || '', Owner_Action:e.ownerAction || ''
  };
  if (isNew) {
    values.Created_At = now; values.Updated_At = now;
    Object.keys(values).forEach(function(k) { if (h[k] !== undefined) sheet.getRange(rowNumber,h[k]+1).setValue(values[k]); });
    return true;
  }
  const changedKeys = Object.keys(values).filter(function(k) { return h[k] !== undefined && !rformContentV04ValueEqual_(currentRow && currentRow[h[k]], values[k]); });
  if (!changedKeys.length) return false;
  changedKeys.forEach(function(k) { sheet.getRange(rowNumber,h[k]+1).setValue(values[k]); });
  if (h.Updated_At !== undefined) sheet.getRange(rowNumber,h.Updated_At+1).setValue(now);
  return true;
}

function rformContentV04ExistingRows_(sheet,h) {
  const out = {};
  if (sheet.getLastRow() < 2) return out;
  const values = sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getDisplayValues();
  values.forEach(function(row,i) { const id = row[h.Event_ID]; if (id) out[id] = {rowNumber:i+2, values:row}; });
  return out;
}

function rformContentV04ReadHeaders_(sheet) {
  return sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(String);
}

function rformContentV04HeaderMap_(headers) {
  const out = {};
  (headers || []).forEach(function(x,i) { if (x) out[String(x).trim()] = i; });
  return out;
}

function rformContentV04Cell_(row,h,name) {
  return h[name] === undefined ? '' : String(row[h[name]] || '').trim();
}

function rformContentV04ParseDate_(s) {
  const m = String(s || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
  d.setHours(0,0,0,0);
  return d;
}

function rformContentV04Number_(s) {
  const text = String(s === null || s === undefined ? '' : s).trim().replace(',','.');
  if (!text) return null;
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function rformContentV04PainValue_(s) { return rformContentV04Number_(s); }

function rformContentV04ValueEqual_(left,right) {
  const a = left === null || left === undefined ? '' : String(left).trim();
  const b = right === null || right === undefined ? '' : String(right).trim();
  return a === b;
}
