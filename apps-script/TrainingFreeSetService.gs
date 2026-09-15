'use strict';

const RFORM_TRAINING_FREE_LOAD_UNITS = Object.freeze(['KG','BW','BW_PLUS_KG','LEVEL']);
const RFORM_TRAINING_FREE_SET_TYPES = Object.freeze(['WARMUP','WORKING']);

function createTrainingFreeSet(payload) {
  const input = trainingFreeValidateCreateSet_(payload);
  const ctx = trainingFreeSetContext_(input.sessionId);
  trainingFreeValidateCategory_(ctx.dictionaries, input.exerciseCategory);
  const inboxId = trainingFreeInboxId_(input.eventId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let setRow = 0;
  let inboxRow = 0;
  try {
    const duplicate = trainingFreeFindRowByExact_(ctx.inbox, ctx.ih.Inbox_Event_ID, inboxId);
    if (duplicate) {
      const target = String(ctx.inbox.getRange(duplicate, ctx.ih.Target_Record_ID).getDisplayValue() || '').trim();
      return { status:'ALREADY_APPLIED', eventId:input.eventId, sessionId:input.sessionId, setId:target, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(input.sessionId) };
    }

    const sessionRow = trainingFreeRequireFreeSessionRow_(ctx.sessions, ctx.sh, input.sessionId, true);
    const dateKey = normalizeDateKey_(ctx.sessions.getRange(sessionRow, ctx.sh.Date).getValue(), getConfig_().timezone);
    const exerciseInstanceId = input.exerciseInstanceId || trainingFreeBuildExerciseInstanceId_(dateKey, input.eventId);
    trainingFreeValidateExerciseInstanceId_(exerciseInstanceId);
    const identity = trainingExerciseResolveIdentity_(ctx.plan, ctx.ph, ctx.sets, ctx.th, input.exerciseName, input.exerciseCategory);
    const setNumber = trainingFreeNextSetNumber_(ctx.sets, ctx.th, input.sessionId, exerciseInstanceId);
    const setId = trainingFreeBuildSetId_(dateKey, input.eventId, ctx.sets, ctx.th);
    const load = trainingFreeResolveLoad_(input.loadUnit, input.loadValue);

    setRow = trainingFreeNextRow_(ctx.sets);
    trainingFreePrepareNewSetRow_(ctx.sets, setRow, ctx.th);
    trainingFreeApplyNamedValues_(ctx.sets, setRow, ctx.th, {
      Set_ID:setId,
      Session_ID:input.sessionId,
      Exercise_Order:input.exerciseOrder,
      Exercise_Name_Original:input.exerciseName,
      Exercise_Name_Normalized:identity.normalized,
      Exercise_Category:input.exerciseCategory,
      Set_Type:input.setType,
      Set_Number:setNumber,
      Weight_Kg:load.weightKg,
      Reps:input.reps,
      RIR:input.rir,
      Plan_Weight:'',
      Plan_Reps:'',
      Plan_RIR:'',
      Deviation:'Свободная тренировка.',
      Comment:input.comment,
      Exercise_Instance_ID:exerciseInstanceId,
      Exercise_Catalog_ID:input.exerciseCatalogId,
      Load_Value:load.loadValue,
      Load_Unit:input.loadUnit,
      Exercise_Comment:input.exerciseComment
    });
    SpreadsheetApp.flush();
    trainingFreeVerifySetRow_(ctx.sets, setRow, ctx.th, setId);

    inboxRow = trainingFreeWriteAudit_(ctx.inbox, ctx.ih, {
      inboxId,
      eventDate:ctx.sessions.getRange(sessionRow, ctx.sh.Date).getValue(),
      eventType:'TRAINING_FREE_SET_CREATE',
      rawMessage:JSON.stringify(payload),
      parsedEntity:JSON.stringify({setId, exerciseInstanceId, setNumber, loadUnit:input.loadUnit}),
      targetSheet:'TRAINING_SETS',
      targetRecordId:setId,
      note:'FREE training set created.'
    });
    SpreadsheetApp.flush();
    return { status:'APPLIED', eventId:input.eventId, sessionId:input.sessionId, setId, exerciseInstanceId, setNumber, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(input.sessionId) };
  } catch (error) {
    if (inboxRow) ctx.inbox.getRange(inboxRow, 1, 1, ctx.inbox.getLastColumn()).clearContent();
    if (setRow) ctx.sets.getRange(setRow, 1, 1, ctx.sets.getLastColumn()).clearContent();
    SpreadsheetApp.flush();
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function updateTrainingFreeSet(payload) {
  const input = trainingFreeValidateUpdateSet_(payload);
  const ctx = trainingFreeSetContext_(input.sessionId);
  const inboxId = trainingFreeInboxId_(input.eventId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let inboxRow = 0;
  try {
    const duplicate = trainingFreeFindRowByExact_(ctx.inbox, ctx.ih.Inbox_Event_ID, inboxId);
    if (duplicate) return { status:'ALREADY_APPLIED', eventId:input.eventId, sessionId:input.sessionId, setId:input.setId, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(input.sessionId) };
    const sessionRow = trainingFreeRequireFreeSessionRow_(ctx.sessions, ctx.sh, input.sessionId, true);
    const row = trainingFreeRequireSetRow_(ctx.sets, ctx.th, input.sessionId, input.setId);
    const previous = trainingFreeSnapshotCells_(ctx.sets, row, [ctx.th.Set_Type,ctx.th.Weight_Kg,ctx.th.Reps,ctx.th.RIR,ctx.th.Load_Value,ctx.th.Load_Unit,ctx.th.Comment]);
    const load = trainingFreeResolveLoad_(input.loadUnit, input.loadValue);
    trainingFreeApplyNamedValues_(ctx.sets, row, ctx.th, {
      Set_Type:input.setType,
      Weight_Kg:load.weightKg,
      Reps:input.reps,
      RIR:input.rir,
      Load_Value:load.loadValue,
      Load_Unit:input.loadUnit,
      Comment:input.comment
    });
    SpreadsheetApp.flush();
    trainingFreeVerifySetRow_(ctx.sets, row, ctx.th, input.setId);
    try {
      inboxRow = trainingFreeWriteAudit_(ctx.inbox, ctx.ih, {
        inboxId,
        eventDate:ctx.sessions.getRange(sessionRow, ctx.sh.Date).getValue(),
        eventType:'TRAINING_FREE_SET_UPDATE',
        rawMessage:JSON.stringify(payload),
        parsedEntity:JSON.stringify({setId:input.setId, previous}),
        targetSheet:'TRAINING_SETS',
        targetRecordId:input.setId,
        note:'FREE training set updated.'
      });
    } catch (auditError) {
      trainingFreeRestoreCells_(ctx.sets, row, previous);
      throw auditError;
    }
    return { status:'APPLIED', eventId:input.eventId, sessionId:input.sessionId, setId:input.setId, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(input.sessionId) };
  } finally {
    lock.releaseLock();
  }
}

function deleteTrainingFreeSet(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const eventId = trainingFreeValidateEventId_(payload.eventId);
  const sessionId = trainingExerciseValidateSessionId_(payload.sessionId);
  const setId = trainingFreeValidateSetId_(payload.setId);
  trainingFreeValidateSource_(payload.source);
  const ctx = trainingFreeSetContext_(sessionId);
  const inboxId = trainingFreeInboxId_(eventId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let inboxRow = 0;
  try {
    const duplicate = trainingFreeFindRowByExact_(ctx.inbox, ctx.ih.Inbox_Event_ID, inboxId);
    if (duplicate) return { status:'ALREADY_APPLIED', eventId, sessionId, setId, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(sessionId) };
    const sessionRow = trainingFreeRequireFreeSessionRow_(ctx.sessions, ctx.sh, sessionId, true);
    const row = trainingFreeRequireSetRow_(ctx.sets, ctx.th, sessionId, setId);
    const exerciseInstanceId = String(ctx.sets.getRange(row, ctx.th.Exercise_Instance_ID).getDisplayValue() || '');
    const snapshot = trainingFreeSnapshotRow_(ctx.sets, row);
    const numbering = trainingFreeSnapshotExerciseNumbers_(ctx.sets, ctx.th, sessionId, exerciseInstanceId);
    ctx.sets.getRange(row, 1, 1, ctx.sets.getLastColumn()).clearContent();
    trainingFreeRenumberExercise_(ctx.sets, ctx.th, sessionId, exerciseInstanceId);
    SpreadsheetApp.flush();
    try {
      inboxRow = trainingFreeWriteAudit_(ctx.inbox, ctx.ih, {
        inboxId,
        eventDate:ctx.sessions.getRange(sessionRow, ctx.sh.Date).getValue(),
        eventType:'TRAINING_FREE_SET_DELETE',
        rawMessage:JSON.stringify(payload),
        parsedEntity:JSON.stringify({setId, deleted:trainingFreeRowAsObject_(snapshot.values,ctx.th)}),
        targetSheet:'TRAINING_SETS',
        targetRecordId:setId,
        note:'FREE training set deleted; snapshot retained in audit.'
      });
    } catch (auditError) {
      trainingFreeRestoreRow_(ctx.sets, row, snapshot);
      trainingFreeRestoreExerciseNumbers_(ctx.sets, ctx.th, numbering);
      throw auditError;
    }
    return { status:'APPLIED', eventId, sessionId, setId, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(sessionId) };
  } finally {
    lock.releaseLock();
  }
}

function updateTrainingFreeExercise(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const eventId = trainingFreeValidateEventId_(payload.eventId);
  const sessionId = trainingExerciseValidateSessionId_(payload.sessionId);
  const instance = trainingFreeValidateExerciseInstanceId_(payload.exerciseInstanceId);
  const order = Number(payload.exerciseOrder);
  if (!Number.isInteger(order) || order < 1 || order > 100) throw new Error('VALIDATION:EXERCISE_ORDER');
  const comment = String(payload.exerciseComment || '').trim();
  if (comment.length > 500) throw new Error('VALIDATION:EXERCISE_COMMENT_TOO_LONG');
  trainingFreeValidateSource_(payload.source);
  const ctx = trainingFreeSetContext_(sessionId);
  const inboxId = trainingFreeInboxId_(eventId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const duplicate = trainingFreeFindRowByExact_(ctx.inbox, ctx.ih.Inbox_Event_ID, inboxId);
    if (duplicate) return { status:'ALREADY_APPLIED', eventId, sessionId, exerciseInstanceId:instance, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(sessionId) };
    const sessionRow = trainingFreeRequireFreeSessionRow_(ctx.sessions, ctx.sh, sessionId, true);
    const rows = trainingFreeRowsByValue_(ctx.sets, ctx.th.Session_ID, sessionId).filter(x => String(x.values[ctx.th.Exercise_Instance_ID-1] || '') === instance);
    if (!rows.length) throw new Error('TRAINING_EXERCISE_INSTANCE_NOT_FOUND');
    const previous = rows.map(x => ({row:x.row, order:x.values[ctx.th.Exercise_Order-1], comment:x.values[ctx.th.Exercise_Comment-1]}));
    rows.forEach(x => {
      ctx.sets.getRange(x.row, ctx.th.Exercise_Order).setValue(order);
      ctx.sets.getRange(x.row, ctx.th.Exercise_Comment).setValue(comment);
    });
    SpreadsheetApp.flush();
    try {
      trainingFreeWriteAudit_(ctx.inbox, ctx.ih, {
        inboxId,
        eventDate:ctx.sessions.getRange(sessionRow, ctx.sh.Date).getValue(),
        eventType:'TRAINING_FREE_EXERCISE_UPDATE',
        rawMessage:JSON.stringify(payload),
        parsedEntity:JSON.stringify({exerciseInstanceId:instance, previous}),
        targetSheet:'TRAINING_SETS',
        targetRecordId:instance,
        note:'FREE exercise metadata updated.'
      });
    } catch (auditError) {
      previous.forEach(x => {
        ctx.sets.getRange(x.row, ctx.th.Exercise_Order).setValue(x.order);
        ctx.sets.getRange(x.row, ctx.th.Exercise_Comment).setValue(x.comment);
      });
      throw auditError;
    }
    return { status:'APPLIED', eventId, sessionId, exerciseInstanceId:instance, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(sessionId) };
  } finally {
    lock.releaseLock();
  }
}

function trainingFreeValidateCreateSet_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const common = trainingFreeValidateSetFact_(payload);
  const exerciseInstanceId = String(payload.exerciseInstanceId || '').trim();
  if (exerciseInstanceId) trainingFreeValidateExerciseInstanceId_(exerciseInstanceId);
  const exerciseName = String(payload.exerciseName || '').trim();
  const exerciseCategory = String(payload.exerciseCategory || '').trim().toUpperCase();
  const exerciseCatalogId = String(payload.exerciseCatalogId || '').trim();
  const exerciseComment = String(payload.exerciseComment || '').trim();
  const exerciseOrder = Number(payload.exerciseOrder);
  if (!exerciseName || exerciseName.length > 120) throw new Error('VALIDATION:EXERCISE_NAME');
  if (!exerciseCategory) throw new Error('VALIDATION:EXERCISE_CATEGORY');
  if (!Number.isInteger(exerciseOrder) || exerciseOrder < 1 || exerciseOrder > 100) throw new Error('VALIDATION:EXERCISE_ORDER');
  if (exerciseComment.length > 500) throw new Error('VALIDATION:EXERCISE_COMMENT_TOO_LONG');
  return Object.assign(common, {exerciseInstanceId, exerciseName, exerciseCategory, exerciseCatalogId, exerciseComment, exerciseOrder});
}

function trainingFreeValidateUpdateSet_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const common = trainingFreeValidateSetFact_(payload);
  common.setId = trainingFreeValidateSetId_(payload.setId);
  return common;
}

function trainingFreeValidateSetFact_(payload) {
  const eventId = trainingFreeValidateEventId_(payload.eventId);
  const sessionId = trainingExerciseValidateSessionId_(payload.sessionId);
  trainingFreeValidateSource_(payload.source);
  const setType = String(payload.setType || '').trim().toUpperCase();
  const loadUnit = String(payload.loadUnit || '').trim().toUpperCase();
  const reps = Number(payload.reps);
  const rir = (payload.rir === '' || payload.rir === null || payload.rir === undefined) ? null : Number(payload.rir);
  const loadValue = (payload.loadValue === '' || payload.loadValue === null || payload.loadValue === undefined) ? null : Number(String(payload.loadValue).replace(',','.'));
  const comment = String(payload.comment || '').trim();
  if (!RFORM_TRAINING_FREE_SET_TYPES.includes(setType)) throw new Error('VALIDATION:SET_TYPE');
  if (!RFORM_TRAINING_FREE_LOAD_UNITS.includes(loadUnit)) throw new Error('VALIDATION:LOAD_UNIT');
  if (!Number.isInteger(reps) || reps < 1 || reps > 1000) throw new Error('VALIDATION:REPS');
  if (setType === 'WORKING' && (rir === null || !Number.isInteger(rir) || rir < 0 || rir > 10)) throw new Error('VALIDATION:RIR_REQUIRED');
  if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 10)) throw new Error('VALIDATION:RIR');
  if (loadValue !== null && (!Number.isFinite(loadValue) || loadValue < 0 || loadValue > 2000)) throw new Error('VALIDATION:LOAD_VALUE');
  if (comment.length > 500) throw new Error('VALIDATION:COMMENT_TOO_LONG');
  trainingFreeResolveLoad_(loadUnit, loadValue);
  return {eventId, sessionId, setType, loadUnit, loadValue, reps, rir, comment};
}

function trainingFreeSetContext_(sessionId) {
  const ss = getMasterSpreadsheet_();
  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  const sets = ss.getSheetByName('TRAINING_SETS');
  const inbox = ss.getSheetByName('INBOX_LOG');
  const plan = ss.getSheetByName('TRAINING_PLAN');
  const dictionaries = ss.getSheetByName('DICTIONARIES');
  if (!sessions || !sets || !inbox || !plan || !dictionaries) throw new Error('SCHEMA_MISMATCH:TRAINING_FREE_SET:sheets_missing');
  const sh=getHeaderMap_(sessions), th=getHeaderMap_(sets), ih=getHeaderMap_(inbox), ph=getHeaderMap_(plan);
  trainingFreeRequireSessionSchema_(sh);
  trainingFreeRequireSetSchema_(th);
  trainingFreeRequireInboxSchema_(ih);
  return {ss,sessions,sets,inbox,plan,dictionaries,sh,th,ih,ph};
}

function trainingFreeValidateCategory_(dictionaries, category) {
  const allowed = trainingExerciseCategories_(dictionaries);
  if (allowed.indexOf(category) < 0) throw new Error('VALIDATION:EXERCISE_CATEGORY');
}
function trainingFreeValidateSource_(source) { if (String(source || '').trim() !== RFORM_TRAINING_FREE_SOURCE) throw new Error('VALIDATION:SOURCE'); }
function trainingFreeValidateSetId_(value) { const id=String(value||'').trim(); if(!/^SET-\d{8}-FREE-[A-Z0-9]{8,16}$/.test(id)) throw new Error('VALIDATION:SET_ID'); return id; }
function trainingFreeResolveLoad_(unit,value) {
  if (unit === 'BW') { if (value !== null) throw new Error('VALIDATION:BW_LOAD_MUST_BE_EMPTY'); return {loadValue:'',weightKg:''}; }
  if (value === null) throw new Error('VALIDATION:LOAD_VALUE_REQUIRED');
  if (unit === 'KG' || unit === 'BW_PLUS_KG') return {loadValue:value,weightKg:value};
  if (unit === 'LEVEL') return {loadValue:value,weightKg:''};
  throw new Error('VALIDATION:LOAD_UNIT');
}
function trainingFreeBuildExerciseInstanceId_(dateKey,eventId) { return `EXI-${dateKey.replace(/-/g,'')}-${String(eventId).replace(/-/g,'').toUpperCase().slice(0,8)}`; }
function trainingFreeValidateExerciseInstanceId_(value) { const id=String(value||'').trim(); if(!/^EXI-\d{8}-[A-Z0-9]{8,12}$/.test(id)) throw new Error('VALIDATION:EXERCISE_INSTANCE_ID'); return id; }
function trainingFreeBuildSetId_(dateKey,eventId,sheet,h) { const id=`SET-${dateKey.replace(/-/g,'')}-FREE-${String(eventId).replace(/-/g,'').toUpperCase().slice(0,12)}`; if(trainingFreeFindRowByExact_(sheet,h.Set_ID,id))throw new Error('CONFLICT:SET_ID'); return id; }
function trainingFreeNextSetNumber_(sheet,h,sessionId,instance) { const rows=trainingFreeRowsByValue_(sheet,h.Session_ID,sessionId).filter(x=>String(x.values[h.Exercise_Instance_ID-1]||'')===instance); return rows.reduce((m,x)=>Math.max(m,Number(x.values[h.Set_Number-1]||0)),0)+1; }
function trainingFreeRequireSetRow_(sheet,h,sessionId,setId) { const row=trainingFreeFindRowByExact_(sheet,h.Set_ID,setId); if(!row)throw new Error(`TRAINING_SET_NOT_FOUND:${setId}`); if(String(sheet.getRange(row,h.Session_ID).getDisplayValue()||'')!==sessionId)throw new Error('VALIDATION:SET_SESSION'); return row; }

function trainingFreePrepareNewSetRow_(sheet,row,h) {
  trainingFreeCopyRowScaffold_(sheet,row);
  if (row > 2) {
    const source = sheet.getRange(row-1,1,1,sheet.getLastColumn());
    const target = sheet.getRange(row,1,1,sheet.getLastColumn());
    source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
  }
  if (!sheet.getRange(row,h.Record_Key).getFormula()) throw new Error('SCHEMA_MISMATCH:TRAINING_SETS:Record_Key_formula_template_missing');
  if (!sheet.getRange(row,h.Duplicate_Flag).getFormula()) throw new Error('SCHEMA_MISMATCH:TRAINING_SETS:Duplicate_Flag_formula_template_missing');
}
function trainingFreeApplyNamedValues_(sheet,row,h,values) { Object.keys(values).forEach(k=>{if(h[k])sheet.getRange(row,h[k]).setValue(values[k]);}); }
function trainingFreeVerifySetRow_(sheet,row,h,setId) {
  if(String(sheet.getRange(row,h.Set_ID).getDisplayValue()||'')!==setId)throw new Error('VERIFY_FAILED:TRAINING_FREE_SET:Set_ID');
  if(!String(sheet.getRange(row,h.Record_Key).getDisplayValue()||''))throw new Error('VERIFY_FAILED:TRAINING_FREE_SET:Record_Key');
  if(String(sheet.getRange(row,h.Duplicate_Flag).getDisplayValue()||''))throw new Error('VERIFY_FAILED:TRAINING_FREE_SET:DUPLICATE');
}
function trainingFreeSnapshotCells_(sheet,row,columns) { return columns.map(column=>({column,value:sheet.getRange(row,column).getValue(),formula:sheet.getRange(row,column).getFormula()})); }
function trainingFreeRestoreCells_(sheet,row,snapshot) { snapshot.forEach(x=>{const c=sheet.getRange(row,x.column); if(x.formula)c.setFormula(x.formula); else c.setValue(x.value);}); }
function trainingFreeSnapshotRow_(sheet,row) { const range=sheet.getRange(row,1,1,sheet.getLastColumn()); return {values:range.getValues()[0],formulas:range.getFormulas()[0]}; }
function trainingFreeRestoreRow_(sheet,row,snapshot) { const range=sheet.getRange(row,1,1,snapshot.values.length); range.setValues([snapshot.values]); snapshot.formulas.forEach((f,i)=>{if(f)sheet.getRange(row,i+1).setFormula(f);}); }
function trainingFreeSnapshotExerciseNumbers_(sheet,h,sessionId,instance) { return trainingFreeRowsByValue_(sheet,h.Session_ID,sessionId).filter(x=>String(x.values[h.Exercise_Instance_ID-1]||'')===instance).map(x=>({row:x.row,setNumber:x.values[h.Set_Number-1]})); }
function trainingFreeRestoreExerciseNumbers_(sheet,h,snapshot) { snapshot.forEach(x=>sheet.getRange(x.row,h.Set_Number).setValue(x.setNumber)); }
function trainingFreeRenumberExercise_(sheet,h,sessionId,instance) { const rows=trainingFreeRowsByValue_(sheet,h.Session_ID,sessionId).filter(x=>String(x.values[h.Exercise_Instance_ID-1]||'')===instance).sort((a,b)=>Number(a.values[h.Set_Number-1]||0)-Number(b.values[h.Set_Number-1]||0)); rows.forEach((x,i)=>sheet.getRange(x.row,h.Set_Number).setValue(i+1)); }
function trainingFreeRowAsObject_(v,h) { return {setId:String(v[h.Set_ID-1]||''),sessionId:String(v[h.Session_ID-1]||''),exerciseInstanceId:String(v[h.Exercise_Instance_ID-1]||''),exerciseName:String(v[h.Exercise_Name_Original-1]||''),setType:String(v[h.Set_Type-1]||''),setNumber:v[h.Set_Number-1],loadValue:v[h.Load_Value-1],loadUnit:String(v[h.Load_Unit-1]||''),weightKg:v[h.Weight_Kg-1],reps:v[h.Reps-1],rir:v[h.RIR-1]}; }
