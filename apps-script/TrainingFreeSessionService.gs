'use strict';

const RFORM_TRAINING_FREE_VERSION = '0.1.0-sandbox';
const RFORM_TRAINING_FREE_SOURCE = 'RFORM_MOBILE';
const RFORM_TRAINING_FREE_MODE = 'FREE';
const RFORM_TRAINING_FREE_OPEN_STATUS = 'DRAFT';
const RFORM_TRAINING_FREE_CLOSED_STATUS = 'CLOSED';

function startTrainingFreeSession(payload) {
  const input = trainingFreeValidateStart_(payload);
  const ss = getMasterSpreadsheet_();
  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  const inbox = ss.getSheetByName('INBOX_LOG');
  if (!sessions || !inbox) throw new Error('SCHEMA_MISMATCH:TRAINING_FREE_SESSION:sheets_missing');
  const sh = getHeaderMap_(sessions);
  const ih = getHeaderMap_(inbox);
  trainingFreeRequireSessionSchema_(sh);
  trainingFreeRequireInboxSchema_(ih);

  const inboxId = trainingFreeInboxId_(input.eventId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let sessionRow = 0;
  let inboxRow = 0;
  try {
    const existingEvent = trainingFreeFindRowByExact_(inbox, ih.Inbox_Event_ID, inboxId);
    if (existingEvent) {
      const target = String(inbox.getRange(existingEvent, ih.Target_Record_ID).getDisplayValue() || '').trim();
      return { status:'ALREADY_APPLIED', eventId:input.eventId, sessionId:target, version:RFORM_TRAINING_FREE_VERSION, state:target ? getTrainingFreeSessionState(target) : null };
    }

    const active = trainingFreeFindActiveSession_(sessions, sh);
    if (active) {
      return { status:'RESUME_EXISTING', eventId:input.eventId, sessionId:active.sessionId, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(active.sessionId) };
    }

    const sessionId = trainingFreeBuildSessionId_(input.dateKey, input.eventId, sessions, sh);
    sessionRow = trainingFreeNextRow_(sessions);
    trainingFreeCopyRowScaffold_(sessions, sessionRow);
    const dayId = trainingFreeResolveDayId_(ss, input.dateKey);
    trainingFreeSetCell_(sessions, sessionRow, sh.Session_ID, sessionId);
    trainingFreeSetCell_(sessions, sessionRow, sh.Day_ID, dayId);
    trainingFreeSetCell_(sessions, sessionRow, sh.Date, trainingFreeDateObject_(input.dateKey), 'dd.mm.yyyy');
    trainingFreeSetCell_(sessions, sessionRow, sh.Session_Type, '');
    trainingFreeSetCell_(sessions, sessionRow, sh.Plan_Status, '');
    trainingFreeSetCell_(sessions, sessionRow, sh.Session_Status, RFORM_TRAINING_FREE_OPEN_STATUS);
    trainingFreeSetCell_(sessions, sessionRow, sh.Session_Mode, RFORM_TRAINING_FREE_MODE);
    trainingFreeSetCell_(sessions, sessionRow, sh.Started_At, new Date(), 'dd.mm.yyyy hh:mm');
    trainingFreeSetCell_(sessions, sessionRow, sh.Completed_At, '');
    trainingFreeSetCell_(sessions, sessionRow, sh.Session_Comment, '');
    SpreadsheetApp.flush();

    if (String(sessions.getRange(sessionRow, sh.Session_ID).getDisplayValue() || '') !== sessionId) throw new Error('VERIFY_FAILED:TRAINING_FREE_SESSION:Session_ID');
    if (String(sessions.getRange(sessionRow, sh.Session_Mode).getDisplayValue() || '') !== RFORM_TRAINING_FREE_MODE) throw new Error('VERIFY_FAILED:TRAINING_FREE_SESSION:Session_Mode');
    if (String(sessions.getRange(sessionRow, sh.Session_Status).getDisplayValue() || '') !== RFORM_TRAINING_FREE_OPEN_STATUS) throw new Error('VERIFY_FAILED:TRAINING_FREE_SESSION:Session_Status');

    inboxRow = trainingFreeWriteAudit_(inbox, ih, {
      inboxId,
      eventDate:trainingFreeDateObject_(input.dateKey),
      eventType:'TRAINING_FREE_SESSION_START',
      rawMessage:JSON.stringify(payload),
      parsedEntity:JSON.stringify({sessionId,sessionMode:RFORM_TRAINING_FREE_MODE}),
      targetSheet:'TRAINING_SESSIONS',
      targetRecordId:sessionId,
      note:'FREE training session started.'
    });
    return { status:'APPLIED', eventId:input.eventId, sessionId, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(sessionId) };
  } catch (error) {
    if (inboxRow) inbox.getRange(inboxRow, 1, 1, inbox.getLastColumn()).clearContent();
    if (sessionRow) sessions.getRange(sessionRow, 1, 1, sessions.getLastColumn()).clearContent();
    SpreadsheetApp.flush();
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function completeTrainingFreeSession(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const eventId = trainingFreeValidateEventId_(payload.eventId);
  const sessionId = trainingExerciseValidateSessionId_(payload.sessionId);
  trainingFreeValidateSourceValue_(payload.source);
  const comment = String(payload.comment || '').trim();
  if (comment.length > 1000) throw new Error('VALIDATION:SESSION_COMMENT_TOO_LONG');

  const ss = getMasterSpreadsheet_();
  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  const sets = ss.getSheetByName('TRAINING_SETS');
  const inbox = ss.getSheetByName('INBOX_LOG');
  if (!sessions || !sets || !inbox) throw new Error('SCHEMA_MISMATCH:TRAINING_FREE_COMPLETE:sheets_missing');
  const sh = getHeaderMap_(sessions);
  const th = getHeaderMap_(sets);
  const ih = getHeaderMap_(inbox);
  trainingFreeRequireSessionSchema_(sh);
  trainingFreeRequireSetSchema_(th);
  trainingFreeRequireInboxSchema_(ih);

  const inboxId = trainingFreeInboxId_(eventId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let previous = null;
  try {
    const duplicate = trainingFreeFindRowByExact_(inbox, ih.Inbox_Event_ID, inboxId);
    if (duplicate) return { status:'ALREADY_APPLIED', eventId, sessionId, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(sessionId) };
    const row = trainingFreeRequireFreeSessionRow_(sessions, sh, sessionId, true);
    const factRows = trainingFreeRowsByValue_(sets, th.Session_ID, sessionId);
    if (!factRows.length) throw new Error('VALIDATION:FREE_SESSION_EMPTY');

    previous = trainingFreeSessionSnapshot_(sessions, row, sh);
    const started = sessions.getRange(row, sh.Started_At).getValue();
    const now = new Date();
    if (sh.Actual_Duration && Object.prototype.toString.call(started) === '[object Date]' && !isNaN(started)) {
      sessions.getRange(row, sh.Actual_Duration).setValue(Math.max(0, Math.round((now.getTime() - started.getTime()) / 60000)));
    }
    sessions.getRange(row, sh.Session_Status).setValue(RFORM_TRAINING_FREE_CLOSED_STATUS);
    sessions.getRange(row, sh.Completed_At).setValue(now).setNumberFormat('dd.mm.yyyy hh:mm');
    sessions.getRange(row, sh.Session_Comment).setValue(comment);
    SpreadsheetApp.flush();
    if (String(sessions.getRange(row, sh.Session_Status).getDisplayValue() || '') !== RFORM_TRAINING_FREE_CLOSED_STATUS) throw new Error('VERIFY_FAILED:TRAINING_FREE_SESSION:CLOSE');

    trainingFreeWriteAudit_(inbox, ih, {
      inboxId,
      eventDate:sessions.getRange(row, sh.Date).getValue(),
      eventType:'TRAINING_FREE_SESSION_COMPLETE',
      rawMessage:JSON.stringify(payload),
      parsedEntity:JSON.stringify({sessionId,setCount:factRows.length}),
      targetSheet:'TRAINING_SESSIONS',
      targetRecordId:sessionId,
      note:'FREE training session completed.'
    });
    return { status:'APPLIED', eventId, sessionId, version:RFORM_TRAINING_FREE_VERSION, state:getTrainingFreeSessionState(sessionId) };
  } catch (error) {
    if (previous) trainingFreeRestoreSessionSnapshot_(sessions, previous);
    SpreadsheetApp.flush();
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getTrainingFreeSessionState(sessionId) {
  const clean = trainingExerciseValidateSessionId_(sessionId);
  const ss = getMasterSpreadsheet_();
  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  const sets = ss.getSheetByName('TRAINING_SETS');
  if (!sessions || !sets) throw new Error('SCHEMA_MISMATCH:TRAINING_FREE_STATE:sheets_missing');
  const sh = getHeaderMap_(sessions);
  const th = getHeaderMap_(sets);
  trainingFreeRequireSessionSchema_(sh);
  trainingFreeRequireSetSchema_(th);
  const row = trainingFreeRequireFreeSessionRow_(sessions, sh, clean, false);
  const sv = sessions.getRange(row, 1, 1, sessions.getLastColumn()).getValues()[0];
  const setRows = trainingFreeRowsByValue_(sets, th.Session_ID, clean).map(item => trainingFreeSetProjection_(item.values, th));
  const groups = {};
  setRows.forEach(set => {
    const key = set.exerciseInstanceId || `${set.exerciseOrder}|${set.exerciseNormalized}`;
    if (!groups[key]) {
      groups[key] = {
        exerciseInstanceId:key,
        exerciseCatalogId:set.exerciseCatalogId,
        exerciseOrder:set.exerciseOrder,
        exerciseName:set.exerciseName,
        exerciseNormalized:set.exerciseNormalized,
        exerciseCategory:set.exerciseCategory,
        exerciseComment:set.exerciseComment,
        sets:[]
      };
    }
    groups[key].sets.push(set);
  });
  const exercises = Object.keys(groups).map(k => groups[k]).sort((a,b) => a.exerciseOrder - b.exerciseOrder);
  exercises.forEach(ex => ex.sets.sort((a,b) => a.setNumber - b.setNumber));
  const status = String(sv[sh.Session_Status - 1] || '');
  return {
    sessionId:clean,
    mode:String(sv[sh.Session_Mode - 1] || ''),
    status,
    date:normalizeDateKey_(sv[sh.Date - 1], getConfig_().timezone),
    dayId:String(sv[sh.Day_ID - 1] || ''),
    startedAt:sv[sh.Started_At - 1] || '',
    completedAt:sv[sh.Completed_At - 1] || '',
    comment:String(sv[sh.Session_Comment - 1] || ''),
    canEdit:status === RFORM_TRAINING_FREE_OPEN_STATUS,
    setCount:setRows.length,
    workingSetCount:setRows.filter(x => x.setType === 'WORKING').length,
    warmupSetCount:setRows.filter(x => x.setType === 'WARMUP').length,
    exercises,
    version:RFORM_TRAINING_FREE_VERSION
  };
}

function trainingFreeRequireSessionSchema_(h) {
  requireHeaders_(h, ['Session_ID','Day_ID','Date','Session_Type','Actual_Duration','Plan_Status','Session_Status','Duplicate_Flag','Session_Mode','Started_At','Completed_At','Session_Comment'], 'TRAINING_SESSIONS');
}
function trainingFreeRequireSetSchema_(h) {
  requireHeaders_(h, ['Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR','Plan_Weight','Plan_Reps','Plan_RIR','Deviation','Comment','Record_Key','Duplicate_Flag','Exercise_Instance_ID','Exercise_Catalog_ID','Load_Value','Load_Unit','Exercise_Comment'], 'TRAINING_SETS');
}
function trainingFreeRequireInboxSchema_(h) {
  requireHeaders_(h, ['Inbox_Event_ID','Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity','Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status','Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Duplicate_Flag','Note'], 'INBOX_LOG');
}

function trainingFreeValidateStart_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const eventId = trainingFreeValidateEventId_(payload.eventId);
  const dateKey = normalizeDateKey_(payload.date || getTodayDateKey_(), getConfig_().timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('VALIDATION:DATE');
  trainingFreeValidateSourceValue_(payload.source);
  return {eventId,dateKey};
}
function trainingFreeValidateEventId_(value) {
  const id = String(value || '').trim();
  if (!/^[0-9a-fA-F-]{32,36}$/.test(id)) throw new Error('VALIDATION:EVENT_ID');
  return id;
}
function trainingFreeValidateSourceValue_(source) {
  if (String(source || '').trim() !== RFORM_TRAINING_FREE_SOURCE) throw new Error('VALIDATION:SOURCE');
}
function trainingFreeInboxId_(eventId) { return `APP-TRAINING-FREE-${String(eventId).replace(/-/g,'').toUpperCase()}`; }
function trainingFreeBuildSessionId_(dateKey,eventId,sheet,h) {
  const base = `S-${dateKey.replace(/-/g,'')}-FREE-${String(eventId).replace(/-/g,'').toUpperCase().slice(0,8)}`;
  if (!trainingFreeFindRowByExact_(sheet,h.Session_ID,base)) return base;
  return `${base}-${Utilities.getUuid().replace(/-/g,'').toUpperCase().slice(0,4)}`;
}
function trainingFreeDateObject_(dateKey) {
  const m = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('VALIDATION:DATE');
  return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0);
}
function trainingFreeResolveDayId_(ss,dateKey) {
  const daily = ss.getSheetByName('DAILY');
  if (!daily) return '';
  const h = getHeaderMap_(daily);
  if (!h.Day_ID || !h.Date) return '';
  const row = findRowByDate_(daily,h.Date,dateKey,getConfig_().timezone);
  return row ? String(daily.getRange(row,h.Day_ID).getDisplayValue() || '') : '';
}
function trainingFreeFindActiveSession_(sheet,h) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const values = sheet.getRange(2,1,last-1,sheet.getLastColumn()).getValues();
  for (let i=values.length-1;i>=0;i--) {
    const mode = String(values[i][h.Session_Mode-1] || '');
    const status = String(values[i][h.Session_Status-1] || '');
    if (mode === RFORM_TRAINING_FREE_MODE && status === RFORM_TRAINING_FREE_OPEN_STATUS) {
      return {row:i+2,sessionId:String(values[i][h.Session_ID-1] || '')};
    }
  }
  return null;
}
function trainingFreeRequireFreeSessionRow_(sheet,h,sessionId,mustBeOpen) {
  const row = trainingFreeFindRowByExact_(sheet,h.Session_ID,sessionId);
  if (!row) throw new Error(`TRAINING_SESSION_NOT_FOUND:${sessionId}`);
  if (String(sheet.getRange(row,h.Session_Mode).getDisplayValue() || '') !== RFORM_TRAINING_FREE_MODE) throw new Error('VALIDATION:SESSION_NOT_FREE');
  const status = String(sheet.getRange(row,h.Session_Status).getDisplayValue() || '');
  if (mustBeOpen && status !== RFORM_TRAINING_FREE_OPEN_STATUS) throw new Error('VALIDATION:SESSION_NOT_OPEN');
  return row;
}
function trainingFreeRowsByValue_(sheet,column,expected) {
  const last=sheet.getLastRow();
  if(last<2)return[];
  const values=sheet.getRange(2,1,last-1,sheet.getLastColumn()).getValues();
  const out=[];
  values.forEach((v,i)=>{if(String(v[column-1]||'').trim()===String(expected).trim())out.push({row:i+2,values:v});});
  return out;
}
function trainingFreeFindRowByExact_(sheet,column,expected) {
  const last=sheet.getLastRow();
  if(last<2)return 0;
  const values=sheet.getRange(2,column,last-1,1).getDisplayValues();
  const target=String(expected).trim();
  for(let i=0;i<values.length;i++){if(String(values[i][0]||'').trim()===target)return i+2;}
  return 0;
}
function trainingFreeNextRow_(sheet) {
  const row=sheet.getLastRow()+1;
  if(row>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),Math.max(10,row-sheet.getMaxRows()));
  return row;
}
function trainingFreeSetCell_(sheet,row,column,value,format) {
  if(!column)return;
  const cell=sheet.getRange(row,column);
  cell.setValue(value);
  if(format)cell.setNumberFormat(format);
}
function trainingFreeCopyRowScaffold_(sheet,row) {
  if(row<=2)return;
  const source=sheet.getRange(row-1,1,1,sheet.getLastColumn());
  const target=sheet.getRange(row,1,1,sheet.getLastColumn());
  source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false);
  source.copyTo(target,SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,false);
}
function trainingFreeWriteAudit_(sheet, h, spec) {
  const row = trainingFreeNextRow_(sheet);
  try {
    trainingFreeCopyRowScaffold_(sheet, row);
    const now = new Date();
    const values = {
      Inbox_Event_ID: spec.inboxId,
      Received_At: now,
      Event_Date: spec.eventDate,
      Event_Type: spec.eventType,
      Raw_Message: spec.rawMessage || '',
      Parsed_Entity: spec.parsedEntity || '',
      Target_Sheet: spec.targetSheet,
      Target_Record_ID: spec.targetRecordId,
      Validation_Status: 'VALID',
      Missing_Fields: '',
      Processing_Status: 'APPLIED',
      Applied_At: now,
      Applied_By: 'OWNER',
      Source_Chat: 'RFORM_MOBILE',
      Version: RFORM_TRAINING_FREE_VERSION,
      Correction_Of: '',
      Note: spec.note || ''
    };
    Object.keys(values).forEach(key => {
      if (h[key]) sheet.getRange(row, h[key]).setValue(values[key]);
    });
    if (h.Duplicate_Flag) {
      sheet.getRange(row, h.Duplicate_Flag).setFormula(`=IF(A${row}="";"";IF(COUNTIF($A$2:$A$5000;A${row})>1;"DUPLICATE";""))`);
    }
    if (h.Received_At) sheet.getRange(row, h.Received_At).setNumberFormat('dd.mm.yyyy hh:mm');
    if (h.Event_Date) sheet.getRange(row, h.Event_Date).setNumberFormat('dd.mm.yyyy');
    if (h.Applied_At) sheet.getRange(row, h.Applied_At).setNumberFormat('dd.mm.yyyy hh:mm');
    SpreadsheetApp.flush();
    if (String(sheet.getRange(row, h.Inbox_Event_ID).getDisplayValue() || '') !== spec.inboxId) throw new Error('VERIFY_FAILED:INBOX_LOG:Inbox_Event_ID');
    if (String(sheet.getRange(row, h.Duplicate_Flag).getDisplayValue() || '')) throw new Error('VERIFY_FAILED:INBOX_LOG:DUPLICATE');
    return row;
  } catch (error) {
    sheet.getRange(row, 1, 1, sheet.getLastColumn()).clearContent();
    SpreadsheetApp.flush();
    throw error;
  }
}
function trainingFreeSessionSnapshot_(sheet,row,h) {
  const columns=[h.Actual_Duration,h.Session_Status,h.Completed_At,h.Session_Comment].filter(Boolean);
  return {row,cells:columns.map(column=>({column,value:sheet.getRange(row,column).getValue(),formula:sheet.getRange(row,column).getFormula()}))};
}
function trainingFreeRestoreSessionSnapshot_(sheet,snapshot) {
  snapshot.cells.forEach(x=>{const cell=sheet.getRange(snapshot.row,x.column);if(x.formula)cell.setFormula(x.formula);else cell.setValue(x.value);});
}
function trainingFreeSetProjection_(v,h) {
  return {
    setId:String(v[h.Set_ID-1]||''),
    exerciseInstanceId:String(v[h.Exercise_Instance_ID-1]||''),
    exerciseCatalogId:String(v[h.Exercise_Catalog_ID-1]||''),
    exerciseOrder:Number(v[h.Exercise_Order-1]||0),
    exerciseName:String(v[h.Exercise_Name_Original-1]||''),
    exerciseNormalized:String(v[h.Exercise_Name_Normalized-1]||''),
    exerciseCategory:String(v[h.Exercise_Category-1]||''),
    setType:String(v[h.Set_Type-1]||''),
    setNumber:Number(v[h.Set_Number-1]||0),
    loadValue:v[h.Load_Value-1]===''?null:Number(v[h.Load_Value-1]),
    loadUnit:String(v[h.Load_Unit-1]||''),
    weightKg:v[h.Weight_Kg-1]===''?null:Number(v[h.Weight_Kg-1]),
    reps:Number(v[h.Reps-1]||0),
    rir:v[h.RIR-1]===''?null:Number(v[h.RIR-1]),
    exerciseComment:String(v[h.Exercise_Comment-1]||''),
    comment:String(v[h.Comment-1]||'')
  };
}
