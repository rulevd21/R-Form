'use strict';

function migrateTrainingExerciseChangeSchema() {
  const ss = getMasterSpreadsheet_();
  const dictionaries = ss.getSheetByName('DICTIONARIES');
  const inbox = ss.getSheetByName('INBOX_LOG');
  if (!dictionaries) throw new Error('SCHEMA_MISMATCH:DICTIONARIES:sheet_missing');
  if (!inbox) throw new Error('SCHEMA_MISMATCH:INBOX_LOG:sheet_missing');

  const dictHeaders = getHeaderMap_(dictionaries);
  const inboxHeaders = getHeaderMap_(inbox);
  if (!dictHeaders.INBOX_EVENT_TYPE) throw new Error('SCHEMA_MISMATCH:DICTIONARIES:INBOX_EVENT_TYPE');
  if (!inboxHeaders.Event_Type) throw new Error('SCHEMA_MISMATCH:INBOX_LOG:Event_Type');

  const required = ['TRAINING_EXERCISE_REPLACEMENT', 'TRAINING_EXERCISE_ADD'];
  const column = dictHeaders.INBOX_EVENT_TYPE;
  const lastRow = Math.max(dictionaries.getLastRow(), 2);
  const current = dictionaries.getRange(2, column, Math.max(lastRow - 1, 1), 1)
    .getDisplayValues().flat().map(x => String(x || '').trim()).filter(Boolean);

  const added = [];
  required.forEach(value => {
    if (current.indexOf(value) >= 0) return;
    const nextRow = trainingExerciseDictionaryNextRow_(dictionaries, column);
    dictionaries.getRange(nextRow, column).setValue(value);
    current.push(value);
    added.push(value);
  });

  const bottom = trainingExerciseDictionaryLastValueRow_(dictionaries, column);
  if (bottom < 2) throw new Error('SCHEMA_MISMATCH:DICTIONARIES:INBOX_EVENT_TYPE_EMPTY');
  const formula = `=DICTIONARIES!$${trainingExerciseColumnLetter_(column)}$2:$${trainingExerciseColumnLetter_(column)}$${bottom}`;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(dictionaries.getRange(2, column, bottom - 1, 1), true)
    .setAllowInvalid(false)
    .build();

  const maxRows = inbox.getMaxRows();
  inbox.getRange(2, inboxHeaders.Event_Type, Math.max(maxRows - 1, 1), 1).setDataValidation(rule);
  SpreadsheetApp.flush();

  const verifiedValues = dictionaries.getRange(2, column, bottom - 1, 1).getDisplayValues().flat();
  required.forEach(value => {
    if (verifiedValues.indexOf(value) < 0) throw new Error(`VERIFY_FAILED:DICTIONARIES:${value}`);
  });

  const sampleRule = inbox.getRange(2, inboxHeaders.Event_Type).getDataValidation();
  if (!sampleRule) throw new Error('VERIFY_FAILED:INBOX_LOG:Event_Type_validation_missing');

  return {
    status: 'APPLIED',
    added,
    eventTypesRange: formula.replace(/^=/, ''),
    inboxValidationRows: maxRows - 1,
    required
  };
}

function trainingExerciseDictionaryNextRow_(sheet, column) {
  const maxRows = sheet.getMaxRows();
  const values = sheet.getRange(2, column, Math.max(maxRows - 1, 1), 1).getDisplayValues();
  for (let i = 0; i < values.length; i += 1) {
    if (!String(values[i][0] || '').trim()) return i + 2;
  }
  sheet.insertRowsAfter(maxRows, 10);
  return maxRows + 1;
}

function trainingExerciseDictionaryLastValueRow_(sheet, column) {
  const maxRows = sheet.getMaxRows();
  const values = sheet.getRange(2, column, Math.max(maxRows - 1, 1), 1).getDisplayValues();
  let last = 1;
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim()) last = i + 2;
  }
  return last;
}

function trainingExerciseColumnLetter_(column) {
  let n = Number(column);
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
