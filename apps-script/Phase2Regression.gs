'use strict';

/**
 * One-shot sandbox regression for DAY_START idempotency.
 * Safe to run only in the configured RFORM_MASTER_DATA_SANDBOX_* datastore.
 * Expected result:
 * - same eventId => ALREADY_APPLIED
 * - new eventId on existing date => ALREADY_EXISTS
 * - zero new DAILY rows
 * - zero new INBOX_LOG rows
 */
function runPhase2IdempotencyRegression() {
  const config = getConfig_();
  const ss = getMasterSpreadsheet_();
  const daily = ss.getSheetByName('DAILY');
  const inbox = ss.getSheetByName('INBOX_LOG');

  if (!daily) throw new Error('SCHEMA_MISMATCH:DAILY:sheet_missing');
  if (!inbox) throw new Error('SCHEMA_MISMATCH:INBOX_LOG:sheet_missing');

  const dailyHeaders = getHeaderMap_(daily);
  const inboxHeaders = getHeaderMap_(inbox);
  requireHeaders_(dailyHeaders, [
    'Day_ID','Date','Day_Type','Morning_Weight','Sleep_Hours','Sleep_Quality','Readiness',
    'Steps','Shoulder_Pain','Elbow_Pain','Other_Pain','Day_Status','Duplicate_Flag'
  ], 'DAILY');
  requireHeaders_(inboxHeaders, [
    'Inbox_Event_ID','Event_Date','Event_Type','Target_Record_ID','Source_Chat','Processing_Status','Duplicate_Flag'
  ], 'INBOX_LOG');

  const eventDate = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  const dayId = dayIdFromDateKey_(eventDate);
  const dailyRow = findRowByDate_(daily, dailyHeaders.Date, eventDate, config.timezone);
  if (!dailyRow) throw new Error(`REGRESSION:CURRENT_DAY_NOT_FOUND:${eventDate}`);

  const inboxValues = inbox.getRange(2, 1, Math.max(0, inbox.getLastRow() - 1), inbox.getLastColumn()).getValues();
  let originalInboxId = '';
  for (let i = 0; i < inboxValues.length; i += 1) {
    const row = inboxValues[i];
    const eventType = String(row[inboxHeaders.Event_Type - 1] || '');
    const targetRecordId = String(row[inboxHeaders.Target_Record_ID - 1] || '');
    const source = String(row[inboxHeaders.Source_Chat - 1] || '');
    const processingStatus = String(row[inboxHeaders.Processing_Status - 1] || '');
    if (
      eventType === 'DAY_START' &&
      targetRecordId === dayId &&
      source === RFORM_DAY_START_SOURCE &&
      processingStatus === 'APPLIED'
    ) {
      originalInboxId = String(row[inboxHeaders.Inbox_Event_ID - 1] || '');
      break;
    }
  }

  if (!originalInboxId.startsWith('APP-DAYSTART-')) {
    throw new Error(`REGRESSION:ORIGINAL_EVENT_NOT_FOUND:${dayId}`);
  }

  const originalEventId = originalInboxId.substring('APP-DAYSTART-'.length);
  const previousDate = shiftDateKey_(eventDate, -1);
  const previousRow = findRowByDate_(daily, dailyHeaders.Date, previousDate, config.timezone);
  const previousDaySteps = previousRow ? daily.getRange(previousRow, dailyHeaders.Steps).getValue() : '';

  const basePayload = {
    eventType: 'DAY_START',
    eventDate,
    dayType: String(daily.getRange(dailyRow, dailyHeaders.Day_Type).getValue()),
    morningWeight: Number(daily.getRange(dailyRow, dailyHeaders.Morning_Weight).getValue()),
    sleepHours: Number(daily.getRange(dailyRow, dailyHeaders.Sleep_Hours).getValue()),
    sleepQuality: Number(daily.getRange(dailyRow, dailyHeaders.Sleep_Quality).getValue()),
    readiness: Number(daily.getRange(dailyRow, dailyHeaders.Readiness).getValue()),
    shoulderPain: Number(daily.getRange(dailyRow, dailyHeaders.Shoulder_Pain).getValue()),
    elbowPain: Number(daily.getRange(dailyRow, dailyHeaders.Elbow_Pain).getValue()),
    otherPain: Number(daily.getRange(dailyRow, dailyHeaders.Other_Pain).getValue()),
    previousDaySteps: previousDaySteps === '' ? '' : Number(previousDaySteps),
    comment: '',
    source: RFORM_DAY_START_SOURCE,
    appVersion: RFORM_PHASE2_VERSION
  };

  const before = regressionSnapshot_(daily, inbox, dailyHeaders, inboxHeaders, eventDate, dayId);

  const sameEventResult = submitDayStart(Object.assign({}, basePayload, { eventId: originalEventId }));
  if (sameEventResult.status !== 'ALREADY_APPLIED') {
    throw new Error(`REGRESSION:SAME_EVENT_STATUS:${sameEventResult.status}`);
  }

  const newEventId = Utilities.getUuid();
  const existingDateResult = submitDayStart(Object.assign({}, basePayload, { eventId: newEventId }));
  if (existingDateResult.status !== 'ALREADY_EXISTS') {
    throw new Error(`REGRESSION:EXISTING_DATE_STATUS:${existingDateResult.status}`);
  }

  SpreadsheetApp.flush();
  const after = regressionSnapshot_(daily, inbox, dailyHeaders, inboxHeaders, eventDate, dayId);

  if (after.dailyCount !== before.dailyCount) {
    throw new Error(`REGRESSION:DAILY_COUNT_CHANGED:${before.dailyCount}->${after.dailyCount}`);
  }
  if (after.inboxCount !== before.inboxCount) {
    throw new Error(`REGRESSION:INBOX_COUNT_CHANGED:${before.inboxCount}->${after.inboxCount}`);
  }
  if (after.dailyDuplicateCount !== 0 || after.inboxDuplicateCount !== 0) {
    throw new Error(`REGRESSION:DUPLICATE_FLAG:${after.dailyDuplicateCount}/${after.inboxDuplicateCount}`);
  }

  return {
    status: 'PASSED',
    appVersion: RFORM_PHASE2_VERSION,
    eventDate,
    dayId,
    sameEventStatus: sameEventResult.status,
    existingDateStatus: existingDateResult.status,
    dailyCountBefore: before.dailyCount,
    dailyCountAfter: after.dailyCount,
    inboxCountBefore: before.inboxCount,
    inboxCountAfter: after.inboxCount,
    dailyDuplicateCount: after.dailyDuplicateCount,
    inboxDuplicateCount: after.inboxDuplicateCount
  };
}

function regressionSnapshot_(daily, inbox, dailyHeaders, inboxHeaders, eventDate, dayId) {
  const dailyRows = daily.getRange(2, 1, Math.max(0, daily.getLastRow() - 1), daily.getLastColumn()).getValues();
  const inboxRows = inbox.getRange(2, 1, Math.max(0, inbox.getLastRow() - 1), inbox.getLastColumn()).getValues();

  let dailyCount = 0;
  let dailyDuplicateCount = 0;
  dailyRows.forEach(row => {
    const value = row[dailyHeaders.Date - 1];
    if (value instanceof Date && Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd') === eventDate) {
      dailyCount += 1;
      if (String(row[dailyHeaders.Duplicate_Flag - 1] || '') === 'DUPLICATE') dailyDuplicateCount += 1;
    }
  });

  let inboxCount = 0;
  let inboxDuplicateCount = 0;
  inboxRows.forEach(row => {
    const eventType = String(row[inboxHeaders.Event_Type - 1] || '');
    const targetRecordId = String(row[inboxHeaders.Target_Record_ID - 1] || '');
    const source = String(row[inboxHeaders.Source_Chat - 1] || '');
    if (eventType === 'DAY_START' && targetRecordId === dayId && source === RFORM_DAY_START_SOURCE) {
      inboxCount += 1;
      if (String(row[inboxHeaders.Duplicate_Flag - 1] || '') === 'DUPLICATE') inboxDuplicateCount += 1;
    }
  });

  return { dailyCount, inboxCount, dailyDuplicateCount, inboxDuplicateCount };
}
