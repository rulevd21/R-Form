'use strict';

const RFORM_TRAINING_CHANGE_VERSION = '0.1.0-sandbox';
const RFORM_TRAINING_CHANGE_SOURCE = 'RFORM_MOBILE';
const RFORM_TRAINING_CHANGE_ACTIONS = Object.freeze(['REPLACE', 'ADD']);
const RFORM_TRAINING_EXERCISE_ALIASES = Object.freeze({
  'ДОЖИМ С БРУСКАМИ': 'BOARD_PRESS',
  'ЖИМ ШТАНГИ НА НАКЛОННОЙ СКАМЬЕ СРЕДНИМ ХВАТОМ': 'INCLINE_BARBELL_PRESS_MEDIUM_GRIP',
  'МОЛОТКОВЫЕ СГИБАНИЯ': 'MOLOTKOVYE_SGIBANIYA'
});

function getTrainingExerciseEditState(sessionId) {
  const ss = getMasterSpreadsheet_();
  const planSheet = ss.getSheetByName('TRAINING_PLAN');
  const setsSheet = ss.getSheetByName('TRAINING_SETS');
  const sessionsSheet = ss.getSheetByName('TRAINING_SESSIONS');
  const dictionariesSheet = ss.getSheetByName('DICTIONARIES');

  if (!planSheet) throw new Error('SCHEMA_MISMATCH:TRAINING_PLAN:sheet_missing');
  if (!setsSheet) throw new Error('SCHEMA_MISMATCH:TRAINING_SETS:sheet_missing');

  const planHeaders = getHeaderMap_(planSheet);
  const setHeaders = getHeaderMap_(setsSheet);
  requireHeaders_(planHeaders, [
    'Plan_Set_ID','Session_ID','Date','Exercise_Order','Exercise_Name_Original',
    'Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number',
    'Plan_Weight','Plan_Reps','Plan_RIR'
  ], 'TRAINING_PLAN');
  requireHeaders_(setHeaders, [
    'Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized',
    'Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR','Record_Key','Duplicate_Flag'
  ], 'TRAINING_SETS');

  const cleanSessionId = trainingExerciseValidateSessionId_(sessionId);
  const planRows = trainingExerciseRowsByValue_(planSheet, planHeaders.Session_ID, cleanSessionId);
  if (!planRows.length) throw new Error(`TRAINING_PLAN_NOT_FOUND:${cleanSessionId}`);

  const factRows = trainingExerciseRowsByValue_(setsSheet, setHeaders.Session_ID, cleanSessionId);
  const factBySetId = {};
  factRows.forEach(item => {
    const setId = String(item.values[setHeaders.Set_ID - 1] || '').trim();
    if (setId) factBySetId[setId] = item.values;
  });

  const groupMap = {};
  planRows.forEach(item => {
    const v = item.values;
    const order = Number(v[planHeaders.Exercise_Order - 1]);
    const normalized = String(v[planHeaders.Exercise_Name_Normalized - 1] || '').trim();
    const key = `${order}|${normalized}`;
    if (!groupMap[key]) {
      groupMap[key] = {
        key,
        order,
        name: String(v[planHeaders.Exercise_Name_Original - 1] || '').trim(),
        normalized,
        category: String(v[planHeaders.Exercise_Category - 1] || '').trim(),
        sets: []
      };
    }
    const planSetId = String(v[planHeaders.Plan_Set_ID - 1] || '').trim();
    const expectedSetId = trainingExerciseExpectedSetId_(planSetId);
    const actual = factBySetId[expectedSetId] || null;
    groupMap[key].sets.push({
      planSetId,
      expectedSetId,
      setNumber: Number(v[planHeaders.Set_Number - 1]),
      setType: String(v[planHeaders.Set_Type - 1] || '').trim(),
      weight: trainingExerciseNullableNumber_(v[planHeaders.Plan_Weight - 1]),
      reps: trainingExerciseNullableNumber_(v[planHeaders.Plan_Reps - 1]),
      rir: trainingExerciseNullableNumber_(v[planHeaders.Plan_RIR - 1]),
      saved: Boolean(actual),
      actual: actual ? {
        exercise: String(actual[setHeaders.Exercise_Name_Original - 1] || '').trim(),
        weight: trainingExerciseNullableNumber_(actual[setHeaders.Weight_Kg - 1]),
        reps: trainingExerciseNullableNumber_(actual[setHeaders.Reps - 1]),
        rir: trainingExerciseNullableNumber_(actual[setHeaders.RIR - 1])
      } : null
    });
  });

  const exercises = Object.keys(groupMap)
    .map(key => groupMap[key])
    .sort((a, b) => a.order - b.order)
    .map(group => {
      group.sets.sort((a, b) => a.setNumber - b.setNumber);
      group.unsavedCount = group.sets.filter(set => !set.saved).length;
      return group;
    });

  const status = trainingExerciseSessionStatus_(sessionsSheet, cleanSessionId);
  return {
    sessionId: cleanSessionId,
    sessionStatus: status,
    canEdit: status !== 'CLOSED',
    exercises,
    knownExercises: trainingExerciseKnownExercises_(planSheet, planHeaders, setsSheet, setHeaders),
    categories: trainingExerciseCategories_(dictionariesSheet),
    version: RFORM_TRAINING_CHANGE_VERSION,
    policy: {
      planIsImmutable: true,
      replacementTargetsFactOnly: true,
      addedExerciseIsExtraPlan: true
    }
  };
}

function submitTrainingExerciseChange(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');

  const ss = getMasterSpreadsheet_();
  const planSheet = ss.getSheetByName('TRAINING_PLAN');
  const setsSheet = ss.getSheetByName('TRAINING_SETS');
  const sessionsSheet = ss.getSheetByName('TRAINING_SESSIONS');
  const inboxSheet = ss.getSheetByName('INBOX_LOG');
  const dictionariesSheet = ss.getSheetByName('DICTIONARIES');
  if (!planSheet || !setsSheet || !inboxSheet) throw new Error('SCHEMA_MISMATCH:TRAINING_CHANGE:sheets_missing');

  const planHeaders = getHeaderMap_(planSheet);
  const setHeaders = getHeaderMap_(setsSheet);
  const inboxHeaders = getHeaderMap_(inboxSheet);
  requireHeaders_(planHeaders, [
    'Plan_Set_ID','Session_ID','Date','Exercise_Order','Exercise_Name_Original',
    'Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number',
    'Plan_Weight','Plan_Reps','Plan_RIR','Rest_Seconds','Pause_Seconds'
  ], 'TRAINING_PLAN');
  requireHeaders_(setHeaders, [
    'Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized',
    'Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR','RPE','Rest_Seconds',
    'Tempo','Pause_Seconds','Commands_Used','Technique_Status','Pain_During','Plan_Weight',
    'Plan_Reps','Plan_RIR','Deviation','Comment','Record_Key','Duplicate_Flag'
  ], 'TRAINING_SETS');
  requireHeaders_(inboxHeaders, [
    'Inbox_Event_ID','Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity',
    'Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status',
    'Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Duplicate_Flag','Note'
  ], 'INBOX_LOG');

  const input = trainingExerciseValidateChange_(payload, ss, planSheet, planHeaders, dictionariesSheet);
  if (trainingExerciseSessionStatus_(sessionsSheet, input.sessionId) === 'CLOSED') {
    throw new Error('VALIDATION:SESSION_CLOSED');
  }

  const eventKey = String(input.eventId).replace(/-/g, '').toUpperCase();
  const inboxId = `APP-TRAINING-CHANGE-${eventKey}`;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  const writtenRows = [];
  let inboxRow = 0;

  try {
    const existingAuditRow = trainingExerciseFindRowByExact_(inboxSheet, inboxHeaders.Inbox_Event_ID, inboxId);
    if (existingAuditRow) {
      return {
        status: 'ALREADY_APPLIED',
        eventId: input.eventId,
        inboxEventId: inboxId,
        recordIds: String(inboxSheet.getRange(existingAuditRow, inboxHeaders.Target_Record_ID).getDisplayValue() || '')
          .split(',').map(x => x.trim()).filter(Boolean),
        version: RFORM_TRAINING_CHANGE_VERSION
      };
    }

    const planRows = trainingExerciseRowsByValue_(planSheet, planHeaders.Session_ID, input.sessionId);
    if (!planRows.length) throw new Error(`TRAINING_PLAN_NOT_FOUND:${input.sessionId}`);
    const planById = {};
    planRows.forEach(item => {
      const id = String(item.values[planHeaders.Plan_Set_ID - 1] || '').trim();
      if (id) planById[id] = item.values;
    });

    const identity = trainingExerciseResolveIdentity_(
      planSheet,
      planHeaders,
      setsSheet,
      setHeaders,
      input.exerciseName,
      input.exerciseCategory
    );

    const rowsToWrite = input.action === 'REPLACE'
      ? trainingExerciseBuildReplacementRows_(input, identity, planById, planHeaders, setsSheet, setHeaders)
      : trainingExerciseBuildExtraRows_(input, identity, planRows, planHeaders, setsSheet, setHeaders);

    rowsToWrite.forEach(spec => {
      const row = trainingExerciseNextRow_(setsSheet);
      const values = trainingExerciseFactRowValues_(row, spec);
      setsSheet.getRange(row, 1, 1, values.length).setValues([values]);
      writtenRows.push(row);
    });
    SpreadsheetApp.flush();

    writtenRows.forEach(row => {
      const setId = setsSheet.getRange(row, setHeaders.Set_ID).getDisplayValue();
      if (!setId) throw new Error(`VERIFY_FAILED:TRAINING_SETS:Set_ID:${row}`);
      if (setsSheet.getRange(row, setHeaders.Duplicate_Flag).getDisplayValue()) {
        throw new Error(`VERIFY_FAILED:TRAINING_SETS:DUPLICATE:${row}`);
      }
      const recordKey = setsSheet.getRange(row, setHeaders.Record_Key).getDisplayValue();
      if (!recordKey) throw new Error(`VERIFY_FAILED:TRAINING_SETS:Record_Key:${row}`);
    });

    const now = new Date();
    const recordIds = rowsToWrite.map(spec => spec.setId);
    const eventDate = trainingExerciseDateFromPlanRows_(planRows, planHeaders);
    inboxRow = trainingExerciseNextRow_(inboxSheet);
    const auditValues = trainingExerciseAuditRowValues_(
      inboxRow, inboxId, input, eventDate, recordIds, now, rowsToWrite
    );
    inboxSheet.getRange(inboxRow, 1, 1, auditValues.length).setValues([auditValues]);
    inboxSheet.getRange(inboxRow, inboxHeaders.Received_At).setNumberFormat('dd.mm.yyyy hh:mm');
    inboxSheet.getRange(inboxRow, inboxHeaders.Event_Date).setNumberFormat('dd.mm.yyyy');
    inboxSheet.getRange(inboxRow, inboxHeaders.Applied_At).setNumberFormat('dd.mm.yyyy hh:mm');
    SpreadsheetApp.flush();

    if (inboxSheet.getRange(inboxRow, inboxHeaders.Inbox_Event_ID).getDisplayValue() !== inboxId) {
      throw new Error('VERIFY_FAILED:INBOX_LOG:Inbox_Event_ID');
    }
    if (inboxSheet.getRange(inboxRow, inboxHeaders.Duplicate_Flag).getDisplayValue()) {
      throw new Error('VERIFY_FAILED:INBOX_LOG:DUPLICATE');
    }

    return {
      status: 'APPLIED',
      eventId: input.eventId,
      inboxEventId: inboxId,
      recordIds,
      action: input.action,
      sessionId: input.sessionId,
      version: RFORM_TRAINING_CHANGE_VERSION,
      state: getTrainingExerciseEditState(input.sessionId)
    };
  } catch (error) {
    if (inboxRow) inboxSheet.getRange(inboxRow, 1, 1, 18).clearContent();
    writtenRows.forEach(row => setsSheet.getRange(row, 1, 1, 25).clearContent());
    SpreadsheetApp.flush();
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function trainingExerciseValidateChange_(payload, ss, planSheet, planHeaders, dictionariesSheet) {
  const eventId = String(payload.eventId || '').trim();
  const action = String(payload.action || '').trim().toUpperCase();
  const sessionId = trainingExerciseValidateSessionId_(payload.sessionId);
  const source = String(payload.source || '').trim();
  const exerciseName = String(payload.exerciseName || '').trim();
  const exerciseCategory = String(payload.exerciseCategory || '').trim().toUpperCase();
  const comment = String(payload.comment || '').trim();

  if (!/^[0-9a-fA-F-]{32,36}$/.test(eventId)) throw new Error('VALIDATION:EVENT_ID');
  if (!RFORM_TRAINING_CHANGE_ACTIONS.includes(action)) throw new Error('VALIDATION:ACTION');
  if (source !== RFORM_TRAINING_CHANGE_SOURCE) throw new Error('VALIDATION:SOURCE');
  if (!exerciseName || exerciseName.length > 120) throw new Error('VALIDATION:EXERCISE_NAME');
  if (comment.length > 500) throw new Error('VALIDATION:COMMENT_TOO_LONG');

  const allowedCategories = trainingExerciseCategories_(dictionariesSheet);
  if (!allowedCategories.includes(exerciseCategory)) throw new Error('VALIDATION:EXERCISE_CATEGORY');

  const planSetIds = Array.isArray(payload.planSetIds)
    ? Array.from(new Set(payload.planSetIds.map(x => String(x || '').trim()).filter(Boolean)))
    : [];

  let count = 0;
  if (action === 'REPLACE') {
    if (!planSetIds.length || planSetIds.length > 20) throw new Error('VALIDATION:PLAN_SET_IDS');
    count = planSetIds.length;
  } else {
    count = Number(payload.setCount);
    if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('VALIDATION:SET_COUNT');
  }

  return {
    eventId,
    action,
    sessionId,
    source,
    exerciseName,
    exerciseCategory,
    comment,
    planSetIds,
    setCount: count,
    weights: trainingExerciseExpandPattern_(payload.weightPattern, count, 'WEIGHT', 0, 1000, true),
    reps: trainingExerciseExpandPattern_(payload.repsPattern, count, 'REPS', 1, 1000, true),
    rirs: trainingExerciseExpandPattern_(payload.rirPattern, count, 'RIR', 0, 10, false)
  };
}

function trainingExerciseBuildReplacementRows_(input, identity, planById, h, setsSheet, setHeaders) {
  const selected = input.planSetIds.map(id => {
    const plan = planById[id];
    if (!plan) throw new Error(`VALIDATION:PLAN_SET_NOT_FOUND:${id}`);
    if (String(plan[h.Session_ID - 1] || '').trim() !== input.sessionId) {
      throw new Error(`VALIDATION:PLAN_SET_SESSION:${id}`);
    }
    return { id, plan };
  });

  const orders = Array.from(new Set(selected.map(x => Number(x.plan[h.Exercise_Order - 1]))));
  if (orders.length !== 1) throw new Error('VALIDATION:REPLACEMENT_SINGLE_EXERCISE_ONLY');

  return selected.map((item, index) => {
    const expectedSetId = trainingExerciseExpectedSetId_(item.id);
    if (trainingExerciseFindRowByExact_(setsSheet, setHeaders.Set_ID, expectedSetId)) {
      throw new Error(`CONFLICT:PLAN_SET_ALREADY_RECORDED:${item.id}`);
    }
    const plan = item.plan;
    const originalName = String(plan[h.Exercise_Name_Original - 1] || '').trim();
    return {
      setId: expectedSetId,
      sessionId: input.sessionId,
      exerciseOrder: Number(plan[h.Exercise_Order - 1]),
      exerciseName: identity.name,
      exerciseNormalized: identity.normalized,
      category: input.exerciseCategory,
      setType: String(plan[h.Set_Type - 1] || 'ACCESSORY').trim() || 'ACCESSORY',
      setNumber: index + 1,
      weight: input.weights[index],
      reps: input.reps[index],
      rir: input.rirs[index],
      planWeight: trainingExerciseNullableNumber_(plan[h.Plan_Weight - 1]),
      planReps: trainingExerciseNullableNumber_(plan[h.Plan_Reps - 1]),
      planRir: trainingExerciseNullableNumber_(plan[h.Plan_RIR - 1]),
      deviation: `Замена: ${originalName} → ${identity.name}.`,
      comment: trainingExerciseJoinComment_(`Исходный Plan_Set_ID: ${item.id}.`, input.comment)
    };
  });
}

function trainingExerciseBuildExtraRows_(input, identity, planRows, h, setsSheet, setHeaders) {
  const factRows = trainingExerciseRowsByValue_(setsSheet, setHeaders.Session_ID, input.sessionId);
  const orders = planRows.map(x => Number(x.values[h.Exercise_Order - 1]) || 0)
    .concat(factRows.map(x => Number(x.values[setHeaders.Exercise_Order - 1]) || 0));
  const exerciseOrder = Math.max.apply(null, orders.concat([0])) + 1;
  const eventShort = String(input.eventId).replace(/-/g, '').toUpperCase().slice(0, 8);

  return Array.from({ length: input.setCount }, (_, index) => ({
    setId: `SET-${input.sessionId.slice(2)}-EX-${eventShort}-${String(index + 1).padStart(2, '0')}`,
    sessionId: input.sessionId,
    exerciseOrder,
    exerciseName: identity.name,
    exerciseNormalized: identity.normalized,
    category: input.exerciseCategory,
    setType: 'ACCESSORY',
    setNumber: index + 1,
    weight: input.weights[index],
    reps: input.reps[index],
    rir: input.rirs[index],
    planWeight: null,
    planReps: null,
    planRir: null,
    deviation: 'Добавлено сверх плана.',
    comment: trainingExerciseJoinComment_('Дополнительное упражнение по ходу тренировки.', input.comment)
  }));
}

function trainingExerciseFactRowValues_(row, spec) {
  const values = new Array(25).fill('');
  values[0] = spec.setId;
  values[1] = spec.sessionId;
  values[2] = spec.exerciseOrder;
  values[3] = spec.exerciseName;
  values[4] = spec.exerciseNormalized;
  values[5] = spec.category;
  values[6] = spec.setType;
  values[7] = spec.setNumber;
  values[8] = spec.weight;
  values[9] = spec.reps;
  values[10] = spec.rir;
  values[11] = '';
  values[12] = '';
  values[13] = '';
  values[14] = '';
  values[15] = '';
  values[16] = 'NOT_ASSESSED';
  values[17] = '';
  values[18] = spec.planWeight === null ? '' : spec.planWeight;
  values[19] = spec.planReps === null ? '' : spec.planReps;
  values[20] = spec.planRir === null ? '' : spec.planRir;
  values[21] = spec.deviation;
  values[22] = spec.comment;
  values[23] = `=IF(OR(B${row}="";C${row}="";E${row}="";G${row}="";H${row}="");"";B${row}&"|"&C${row}&"|"&E${row}&"|"&G${row}&"|"&H${row})`;
  values[24] = `=IF(X${row}="";"";IF(COUNTIF($X$2:$X$20018;X${row})>1;"DUPLICATE";""))`;
  return values;
}

function trainingExerciseAuditRowValues_(row, inboxId, input, eventDate, recordIds, now, specs) {
  const values = new Array(18).fill('');
  const type = input.action === 'REPLACE' ? 'TRAINING_EXERCISE_REPLACEMENT' : 'TRAINING_EXERCISE_ADD';
  values[0] = inboxId;
  values[1] = now;
  values[2] = eventDate;
  values[3] = type;
  values[4] = JSON.stringify({
    eventId: input.eventId,
    action: input.action,
    sessionId: input.sessionId,
    planSetIds: input.planSetIds,
    exerciseName: input.exerciseName,
    exerciseCategory: input.exerciseCategory,
    weightPattern: input.weights,
    repsPattern: input.reps,
    rirPattern: input.rirs,
    comment: input.comment
  });
  values[5] = type;
  values[6] = 'TRAINING_SETS';
  values[7] = recordIds.join(', ');
  values[8] = 'VALID';
  values[9] = '';
  values[10] = 'APPLIED';
  values[11] = now;
  values[12] = 'OWNER';
  values[13] = RFORM_TRAINING_CHANGE_SOURCE;
  values[14] = RFORM_TRAINING_CHANGE_VERSION;
  values[15] = '';
  values[16] = `=IF(A${row}="";"";IF(COUNTIF($A$2:$A$5000;A${row})>1;"DUPLICATE";""))`;
  values[17] = `${input.action === 'REPLACE' ? 'Замена планового упражнения/вариации' : 'Добавление упражнения сверх плана'}; создано подходов: ${specs.length}; TRAINING_PLAN не изменён.`;
  return values;
}

function trainingExerciseKnownExercises_(planSheet, planHeaders, setsSheet, setHeaders) {
  const byNormalized = {};
  function consume(sheet, headers) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    values.forEach(v => {
      const name = String(v[headers.Exercise_Name_Original - 1] || '').trim();
      const normalized = String(v[headers.Exercise_Name_Normalized - 1] || '').trim();
      const category = String(v[headers.Exercise_Category - 1] || '').trim();
      if (name && normalized && category) byNormalized[normalized] = { name, normalized, category };
    });
  }
  consume(planSheet, planHeaders);
  consume(setsSheet, setHeaders);
  Object.keys(RFORM_TRAINING_EXERCISE_ALIASES).forEach(name => {
    const normalized = RFORM_TRAINING_EXERCISE_ALIASES[name];
    if (!byNormalized[normalized]) byNormalized[normalized] = { name: trainingExerciseTitleCase_(name), normalized, category: '' };
  });
  return Object.keys(byNormalized).map(k => byNormalized[k]).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function trainingExerciseResolveIdentity_(planSheet, planHeaders, setsSheet, setHeaders, name, category) {
  const known = trainingExerciseKnownExercises_(planSheet, planHeaders, setsSheet, setHeaders);
  const upper = String(name).trim().toUpperCase();
  const exact = known.find(item => String(item.name).trim().toUpperCase() === upper);
  if (exact) return { name: String(name).trim(), normalized: exact.normalized };
  if (RFORM_TRAINING_EXERCISE_ALIASES[upper]) {
    return { name: String(name).trim(), normalized: RFORM_TRAINING_EXERCISE_ALIASES[upper] };
  }
  return { name: String(name).trim(), normalized: trainingExerciseNormalizeCode_(name) };
}

function trainingExerciseNormalizeCode_(value) {
  const map = {
    А:'A',Б:'B',В:'V',Г:'G',Д:'D',Е:'E',Ё:'E',Ж:'ZH',З:'Z',И:'I',Й:'Y',К:'K',Л:'L',М:'M',
    Н:'N',О:'O',П:'P',Р:'R',С:'S',Т:'T',У:'U',Ф:'F',Х:'KH',Ц:'TS',Ч:'CH',Ш:'SH',Щ:'SCH',
    Ъ:'',Ы:'Y',Ь:'',Э:'E',Ю:'YU',Я:'YA'
  };
  const text = String(value || '').trim().toUpperCase();
  const transliterated = Array.from(text).map(ch => map.hasOwnProperty(ch) ? map[ch] : ch).join('');
  const code = transliterated.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  if (!code) throw new Error('VALIDATION:EXERCISE_NORMALIZATION');
  return code.slice(0, 80);
}

function trainingExerciseExpandPattern_(raw, count, field, min, max, allowDecimal) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim().replace(/,/g, '.');
  if (!text) throw new Error(`VALIDATION:${field}_PATTERN`);
  const parts = text.split(/[\/;\s]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some(x => !Number.isFinite(x))) throw new Error(`VALIDATION:${field}_PATTERN`);
  const expanded = parts.length === 1 ? Array(count).fill(parts[0]) : parts;
  if (expanded.length !== count) throw new Error(`VALIDATION:${field}_PATTERN_COUNT`);
  expanded.forEach(x => {
    if (x < min || x > max || (!allowDecimal && !Number.isInteger(x))) {
      throw new Error(`VALIDATION:${field}_PATTERN_RANGE`);
    }
  });
  return expanded;
}

function trainingExerciseCategories_(dictionariesSheet) {
  if (!dictionariesSheet) return ['BENCH','SQUAT','PRESS','PULL','ARMS','SHOULDERS'];
  const headers = getHeaderMap_(dictionariesSheet);
  const column = headers.EXERCISE_CATEGORY;
  if (!column) return ['BENCH','SQUAT','PRESS','PULL','ARMS','SHOULDERS'];
  const lastRow = dictionariesSheet.getLastRow();
  if (lastRow < 2) return [];
  return dictionariesSheet.getRange(2, column, lastRow - 1, 1).getDisplayValues()
    .flat().map(x => String(x || '').trim()).filter(Boolean);
}

function trainingExerciseSessionStatus_(sessionsSheet, sessionId) {
  if (!sessionsSheet) return 'NOT_CREATED';
  const headers = getHeaderMap_(sessionsSheet);
  if (!headers.Session_ID || !headers.Session_Status) return 'UNKNOWN';
  const row = trainingExerciseFindRowByExact_(sessionsSheet, headers.Session_ID, sessionId);
  return row ? String(sessionsSheet.getRange(row, headers.Session_Status).getDisplayValue() || 'UNKNOWN') : 'NOT_CREATED';
}

function trainingExerciseDateFromPlanRows_(rows, headers) {
  const raw = rows[0].values[headers.Date - 1];
  if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw)) return raw;
  const key = normalizeDateKey_(raw, getConfig_().timezone);
  const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('VALIDATION:TRAINING_DATE');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function trainingExerciseRowsByValue_(sheet, column, expected) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const width = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  const result = [];
  values.forEach((row, index) => {
    if (String(row[column - 1] || '').trim() === String(expected).trim()) {
      result.push({ row: index + 2, values: row });
    }
  });
  return result;
}

function trainingExerciseFindRowByExact_(sheet, column, expected) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, column, lastRow - 1, 1).getDisplayValues();
  const target = String(expected).trim();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim() === target) return i + 2;
  }
  return 0;
}

function trainingExerciseNextRow_(sheet) {
  const row = sheet.getLastRow() + 1;
  if (row > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(10, row - sheet.getMaxRows()));
  }
  return row;
}

function trainingExerciseExpectedSetId_(planSetId) {
  const id = String(planSetId || '').trim();
  if (!/^TPS-/.test(id)) throw new Error(`VALIDATION:PLAN_SET_ID:${id}`);
  return id.replace(/^TPS-/, 'SET-');
}

function trainingExerciseValidateSessionId_(sessionId) {
  const value = String(sessionId || '').trim();
  if (!/^S-\d{8}-[A-Z0-9_-]+$/.test(value)) throw new Error('VALIDATION:SESSION_ID');
  return value;
}

function trainingExerciseNullableNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function trainingExerciseJoinComment_(base, comment) {
  return [base, String(comment || '').trim()].filter(Boolean).join(' ');
}

function trainingExerciseTitleCase_(upper) {
  const lower = String(upper || '').toLocaleLowerCase('ru');
  return lower ? lower.charAt(0).toLocaleUpperCase('ru') + lower.slice(1) : '';
}
