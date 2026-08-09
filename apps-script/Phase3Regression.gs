'use strict';

/**
 * One-shot sandbox regression for the first successfully applied MEAL event.
 * Safe by design: it replays the SAME eventId, so submitMeal() must return
 * ALREADY_APPLIED before any new NUTRITION_RAW / NUTRITION_DAILY / INBOX_LOG write.
 */
function runPhase3MealIdempotencyRegression() {
  const config = getConfig_();
  const ss = getMasterSpreadsheet_();
  const raw = ss.getSheetByName('NUTRITION_RAW');
  const daily = ss.getSheetByName('NUTRITION_DAILY');
  const inbox = ss.getSheetByName('INBOX_LOG');

  if (!raw || !daily || !inbox) throw new Error('PHASE3_REGRESSION:SCHEMA_MISSING');

  const eventDate = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  if (eventDate !== '2026-08-09') {
    throw new Error(`PHASE3_REGRESSION:UNEXPECTED_DATE:${eventDate}`);
  }

  const dayId = 'D-20260809';
  const mealId = '2026-08-09_M1';
  const inboxEventId = 'APP-MEAL-f378aade-f54a-41e4-ae28-3b2bd894942c';

  const rawHeaders = getHeaderMap_(raw);
  const dailyHeaders = getHeaderMap_(daily);
  const inboxHeaders = getHeaderMap_(inbox);

  requireHeaders_(rawHeaders, ['Day_ID','Meal_ID','Record_Key','Duplicate_Flag'], 'NUTRITION_RAW');
  requireHeaders_(dailyHeaders, ['Day_ID','Meal_Count','Duplicate_Flag'], 'NUTRITION_DAILY');
  requireHeaders_(inboxHeaders, ['Inbox_Event_ID','Duplicate_Flag'], 'INBOX_LOG');

  const before = phase3RegressionSnapshot_(
    raw, rawHeaders,
    daily, dailyHeaders,
    inbox, inboxHeaders,
    dayId, mealId, inboxEventId
  );

  phase3AssertSnapshot_(before, 'BEFORE');

  const payload = {
    eventId: 'f378aade-f54a-41e4-ae28-3b2bd894942c',
    eventType: 'MEAL',
    eventDate: '2026-08-09',
    mealTime: '21:23',
    mealType: 'BREAKFAST',
    components: [
      { foodId: 'FOOD-000001', amount: 149.91, unit: 'g' }
    ],
    source: 'RFORM_MOBILE',
    appVersion: '0.3.1-sandbox'
  };

  const result = submitMeal(payload);
  if (!result || result.status !== 'ALREADY_APPLIED') {
    throw new Error(`PHASE3_REGRESSION:EXPECTED_ALREADY_APPLIED:${result && result.status}`);
  }

  const after = phase3RegressionSnapshot_(
    raw, rawHeaders,
    daily, dailyHeaders,
    inbox, inboxHeaders,
    dayId, mealId, inboxEventId
  );

  phase3AssertSnapshot_(after, 'AFTER');

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('PHASE3_REGRESSION:DATA_CHANGED_ON_RETRY');
  }

  return {
    status: 'PASSED',
    retryStatus: result.status,
    dayId,
    mealId,
    rawComponentRows: after.rawCount,
    nutritionDailyRows: after.dailyCount,
    inboxEventRows: after.inboxCount,
    mealCount: after.mealCount,
    duplicateFlags: {
      nutritionRaw: after.rawDuplicate,
      nutritionDaily: after.dailyDuplicate,
      inboxLog: after.inboxDuplicate
    }
  };
}

function phase3RegressionSnapshot_(raw, rawHeaders, daily, dailyHeaders, inbox, inboxHeaders, dayId, mealId, inboxEventId) {
  const rawMatches = [];
  if (raw.getLastRow() >= 2) {
    const rows = raw.getRange(2, 1, raw.getLastRow() - 1, raw.getLastColumn()).getDisplayValues();
    rows.forEach((row, index) => {
      if (String(row[rawHeaders.Day_ID - 1] || '') === dayId && String(row[rawHeaders.Meal_ID - 1] || '') === mealId) {
        rawMatches.push({
          row: index + 2,
          recordKey: String(row[rawHeaders.Record_Key - 1] || ''),
          duplicate: String(row[rawHeaders.Duplicate_Flag - 1] || '')
        });
      }
    });
  }

  const dailyMatches = [];
  if (daily.getLastRow() >= 2) {
    const rows = daily.getRange(2, 1, daily.getLastRow() - 1, daily.getLastColumn()).getDisplayValues();
    rows.forEach((row, index) => {
      if (String(row[dailyHeaders.Day_ID - 1] || '') === dayId) {
        dailyMatches.push({
          row: index + 2,
          mealCount: String(row[dailyHeaders.Meal_Count - 1] || ''),
          duplicate: String(row[dailyHeaders.Duplicate_Flag - 1] || '')
        });
      }
    });
  }

  const inboxMatches = [];
  if (inbox.getLastRow() >= 2) {
    const rows = inbox.getRange(2, 1, inbox.getLastRow() - 1, inbox.getLastColumn()).getDisplayValues();
    rows.forEach((row, index) => {
      if (String(row[inboxHeaders.Inbox_Event_ID - 1] || '') === inboxEventId) {
        inboxMatches.push({
          row: index + 2,
          duplicate: String(row[inboxHeaders.Duplicate_Flag - 1] || '')
        });
      }
    });
  }

  return {
    rawCount: rawMatches.length,
    dailyCount: dailyMatches.length,
    inboxCount: inboxMatches.length,
    mealCount: dailyMatches.length ? dailyMatches[0].mealCount : '',
    rawRecordKey: rawMatches.length ? rawMatches[0].recordKey : '',
    rawDuplicate: rawMatches.length ? rawMatches[0].duplicate : '',
    dailyDuplicate: dailyMatches.length ? dailyMatches[0].duplicate : '',
    inboxDuplicate: inboxMatches.length ? inboxMatches[0].duplicate : ''
  };
}

function phase3AssertSnapshot_(snapshot, stage) {
  if (snapshot.rawCount !== 1) throw new Error(`PHASE3_REGRESSION:${stage}:RAW_COUNT:${snapshot.rawCount}`);
  if (snapshot.dailyCount !== 1) throw new Error(`PHASE3_REGRESSION:${stage}:DAILY_COUNT:${snapshot.dailyCount}`);
  if (snapshot.inboxCount !== 1) throw new Error(`PHASE3_REGRESSION:${stage}:INBOX_COUNT:${snapshot.inboxCount}`);
  if (String(snapshot.mealCount) !== '1') throw new Error(`PHASE3_REGRESSION:${stage}:MEAL_COUNT:${snapshot.mealCount}`);
  if (snapshot.rawDuplicate) throw new Error(`PHASE3_REGRESSION:${stage}:RAW_DUPLICATE:${snapshot.rawDuplicate}`);
  if (snapshot.dailyDuplicate) throw new Error(`PHASE3_REGRESSION:${stage}:DAILY_DUPLICATE:${snapshot.dailyDuplicate}`);
  if (snapshot.inboxDuplicate) throw new Error(`PHASE3_REGRESSION:${stage}:INBOX_DUPLICATE:${snapshot.inboxDuplicate}`);
}
