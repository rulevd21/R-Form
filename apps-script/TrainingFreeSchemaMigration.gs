'use strict';

const RFORM_TRAINING_FREE_SCHEMA_VERSION = '0.1.0-sandbox';
const RFORM_TRAINING_FREE_SESSION_HEADERS = Object.freeze([
  'Session_Mode','Started_At','Completed_At','Session_Comment'
]);
const RFORM_TRAINING_FREE_SET_HEADERS = Object.freeze([
  'Exercise_Instance_ID','Exercise_Catalog_ID','Load_Value','Load_Unit','Exercise_Comment'
]);
const RFORM_TRAINING_FREE_EVENT_TYPES = Object.freeze([
  'TRAINING_FREE_SESSION_START',
  'TRAINING_FREE_SET_CREATE',
  'TRAINING_FREE_SET_UPDATE',
  'TRAINING_FREE_SET_DELETE',
  'TRAINING_FREE_EXERCISE_UPDATE',
  'TRAINING_FREE_SESSION_COMPLETE'
]);

function migrateTrainingFreeSchema() {
  const ss = getMasterSpreadsheet_();
  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  const sets = ss.getSheetByName('TRAINING_SETS');
  const dictionaries = ss.getSheetByName('DICTIONARIES');
  const inbox = ss.getSheetByName('INBOX_LOG');
  if (!sessions || !sets || !dictionaries || !inbox) {
    throw new Error('SCHEMA_MISMATCH:TRAINING_FREE:required_sheet_missing');
  }

  requireHeaders_(getHeaderMap_(sessions), [
    'Session_ID','Day_ID','Date','Session_Type','Plan_Status','Session_Status','Duplicate_Flag'
  ], 'TRAINING_SESSIONS');
  requireHeaders_(getHeaderMap_(sets), [
    'Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized',
    'Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR','Plan_Weight','Plan_Reps',
    'Plan_RIR','Deviation','Comment','Record_Key','Duplicate_Flag'
  ], 'TRAINING_SETS');

  const sessionAdded = trainingFreeEnsureHeaders_(sessions, RFORM_TRAINING_FREE_SESSION_HEADERS);
  const setAdded = trainingFreeEnsureHeaders_(sets, RFORM_TRAINING_FREE_SET_HEADERS);
  const eventAdded = trainingFreeEnsureDictionaryValues_(dictionaries, 'INBOX_EVENT_TYPE', RFORM_TRAINING_FREE_EVENT_TYPES);
  trainingFreeRefreshInboxEventValidation_(dictionaries, inbox);

  const sessionHeaders = getHeaderMap_(sessions);
  const setHeaders = getHeaderMap_(sets);
  requireHeaders_(sessionHeaders, RFORM_TRAINING_FREE_SESSION_HEADERS, 'TRAINING_SESSIONS');
  requireHeaders_(setHeaders, RFORM_TRAINING_FREE_SET_HEADERS, 'TRAINING_SETS');

  sessions.getRange(2, sessionHeaders.Started_At, Math.max(sessions.getMaxRows() - 1, 1), 1)
    .setNumberFormat('dd.mm.yyyy hh:mm');
  sessions.getRange(2, sessionHeaders.Completed_At, Math.max(sessions.getMaxRows() - 1, 1), 1)
    .setNumberFormat('dd.mm.yyyy hh:mm');
  SpreadsheetApp.flush();

  return {
    status: 'APPLIED',
    version: RFORM_TRAINING_FREE_SCHEMA_VERSION,
    sessionHeadersAdded: sessionAdded,
    setHeadersAdded: setAdded,
    eventTypesAdded: eventAdded,
    sessionModePolicy: 'BLANK_OR_PLANNED=LEGACY_PLANNED;FREE=FREE',
    setTypePolicy: 'WARMUP_OR_WORKING',
    productionWriterChanged: false
  };
}

function trainingFreeEnsureHeaders_(sheet, required) {
  const added = [];
  let headers = getHeaderMap_(sheet);
  required.forEach(name => {
    if (headers[name]) return;
    const column = sheet.getLastColumn() + 1;
    sheet.getRange(1, column).setValue(name);
    added.push(name);
    headers = getHeaderMap_(sheet);
  });
  return added;
}

function trainingFreeEnsureDictionaryValues_(sheet, headerName, requiredValues) {
  const headers = getHeaderMap_(sheet);
  const column = headers[headerName];
  if (!column) throw new Error(`SCHEMA_MISMATCH:DICTIONARIES:${headerName}`);
  const maxRows = sheet.getMaxRows();
  const values = sheet.getRange(2, column, Math.max(maxRows - 1, 1), 1).getDisplayValues()
    .flat().map(x => String(x || '').trim());
  const added = [];
  requiredValues.forEach(value => {
    if (values.indexOf(value) >= 0) return;
    let offset = values.findIndex(x => !x);
    if (offset < 0) {
      sheet.insertRowsAfter(sheet.getMaxRows(), 10);
      offset = values.length;
      values.push('');
    }
    sheet.getRange(offset + 2, column).setValue(value);
    values[offset] = value;
    added.push(value);
  });
  return added;
}

function trainingFreeRefreshInboxEventValidation_(dictionaries, inbox) {
  const dictHeaders = getHeaderMap_(dictionaries);
  const inboxHeaders = getHeaderMap_(inbox);
  if (!dictHeaders.INBOX_EVENT_TYPE || !inboxHeaders.Event_Type) {
    throw new Error('SCHEMA_MISMATCH:TRAINING_FREE:INBOX_EVENT_TYPE');
  }
  const column = dictHeaders.INBOX_EVENT_TYPE;
  const maxRows = dictionaries.getMaxRows();
  const values = dictionaries.getRange(2, column, Math.max(maxRows - 1, 1), 1).getDisplayValues();
  let last = 1;
  values.forEach((row, index) => {
    if (String(row[0] || '').trim()) last = index + 2;
  });
  if (last < 2) throw new Error('SCHEMA_MISMATCH:DICTIONARIES:INBOX_EVENT_TYPE_EMPTY');
  const source = dictionaries.getRange(2, column, last - 1, 1);
  const rule = SpreadsheetApp.newDataValidation().requireValueInRange(source, true).setAllowInvalid(false).build();
  inbox.getRange(2, inboxHeaders.Event_Type, Math.max(inbox.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}
