'use strict';

/**
 * Phase 3A sandbox regression:
 * 1) creates a legitimate second MEAL with a new eventId using FOOD-000001;
 * 2) verifies that the existing NUTRITION_DAILY row is reused and Meal_Count becomes 2;
 * 3) replays the same eventId and requires ALREADY_APPLIED with an unchanged snapshot.
 *
 * Run once only in the authorized sandbox on 2026-08-09.
 */
function runPhase3SecondMealRegression() {
  const config = getConfig_();
  const ss = getMasterSpreadsheet_();
  const raw = ss.getSheetByName('NUTRITION_RAW');
  const daily = ss.getSheetByName('NUTRITION_DAILY');
  const inbox = ss.getSheetByName('INBOX_LOG');

  if (!raw || !daily || !inbox) throw new Error('PHASE3_SECOND_MEAL:SCHEMA_MISSING');

  const currentDate = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  if (currentDate !== '2026-08-09') {
    throw new Error(`PHASE3_SECOND_MEAL:UNEXPECTED_DATE:${currentDate}`);
  }

  const dayId = 'D-20260809';
  const eventId = '6e7fd8b2-9d5a-4fa0-95c4-f5e5632f9e20';
  const inboxEventId = `APP-MEAL-${eventId}`;

  const before = phase3SecondMealSnapshot_(raw, daily, inbox, dayId, inboxEventId);
  if (before.dayRawCount !== 1) throw new Error(`PHASE3_SECOND_MEAL:BEFORE_RAW_COUNT:${before.dayRawCount}`);
  if (before.dailyRows !== 1) throw new Error(`PHASE3_SECOND_MEAL:BEFORE_DAILY_ROWS:${before.dailyRows}`);
  if (before.mealCount !== 1) throw new Error(`PHASE3_SECOND_MEAL:BEFORE_MEAL_COUNT:${before.mealCount}`);
  if (before.targetInboxCount !== 0) throw new Error('PHASE3_SECOND_MEAL:EVENT_ALREADY_EXISTS');
  if (before.duplicateCount !== 0) throw new Error(`PHASE3_SECOND_MEAL:BEFORE_DUPLICATES:${before.duplicateCount}`);

  const payload = {
    eventId,
    eventType: 'MEAL',
    eventDate: '2026-08-09',
    mealTime: '22:05',
    mealType: 'SNACK',
    components: [
      { foodId: 'FOOD-000001', amount: 150, unit: 'g' }
    ],
    source: 'RFORM_MOBILE',
    appVersion: '0.3.1-sandbox'
  };

  const first = submitMeal(payload);
  if (!first || first.status !== 'APPLIED') {
    throw new Error(`PHASE3_SECOND_MEAL:EXPECTED_APPLIED:${first && first.status}`);
  }

  const afterFirst = phase3SecondMealSnapshot_(raw, daily, inbox, dayId, inboxEventId);
  if (afterFirst.dayRawCount !== 2) throw new Error(`PHASE3_SECOND_MEAL:AFTER_RAW_COUNT:${afterFirst.dayRawCount}`);
  if (afterFirst.dailyRows !== 1) throw new Error(`PHASE3_SECOND_MEAL:AFTER_DAILY_ROWS:${afterFirst.dailyRows}`);
  if (afterFirst.mealCount !== 2) throw new Error(`PHASE3_SECOND_MEAL:AFTER_MEAL_COUNT:${afterFirst.mealCount}`);
  if (afterFirst.targetInboxCount !== 1) throw new Error(`PHASE3_SECOND_MEAL:AFTER_INBOX_COUNT:${afterFirst.targetInboxCount}`);
  if (afterFirst.duplicateCount !== 0) throw new Error(`PHASE3_SECOND_MEAL:AFTER_DUPLICATES:${afterFirst.duplicateCount}`);
  if (afterFirst.m2Count !== 1) throw new Error(`PHASE3_SECOND_MEAL:M2_COUNT:${afterFirst.m2Count}`);

  const second = submitMeal(payload);
  if (!second || second.status !== 'ALREADY_APPLIED') {
    throw new Error(`PHASE3_SECOND_MEAL:EXPECTED_ALREADY_APPLIED:${second && second.status}`);
  }

  const afterRetry = phase3SecondMealSnapshot_(raw, daily, inbox, dayId, inboxEventId);
  if (JSON.stringify(afterFirst) !== JSON.stringify(afterRetry)) {
    throw new Error('PHASE3_SECOND_MEAL:DATA_CHANGED_ON_RETRY');
  }

  return {
    status: 'PASSED',
    firstStatus: first.status,
    retryStatus: second.status,
    mealCount: afterRetry.mealCount,
    dayRawCount: afterRetry.dayRawCount,
    nutritionDailyRows: afterRetry.dailyRows,
    targetInboxCount: afterRetry.targetInboxCount,
    m2Count: afterRetry.m2Count,
    duplicateCount: afterRetry.duplicateCount
  };
}

function phase3SecondMealSnapshot_(raw, daily, inbox, dayId, inboxEventId) {
  const rawHeaders = getHeaderMap_(raw);
  const dailyHeaders = getHeaderMap_(daily);
  const inboxHeaders = getHeaderMap_(inbox);

  requireHeaders_(rawHeaders, ['Day_ID','Meal_ID','Duplicate_Flag'], 'NUTRITION_RAW');
  requireHeaders_(dailyHeaders, ['Day_ID','Meal_Count','Duplicate_Flag'], 'NUTRITION_DAILY');
  requireHeaders_(inboxHeaders, ['Inbox_Event_ID','Duplicate_Flag'], 'INBOX_LOG');

  let dayRawCount = 0;
  let m2Count = 0;
  let dailyRows = 0;
  let mealCount = 0;
  let targetInboxCount = 0;
  let duplicateCount = 0;

  if (raw.getLastRow() >= 2) {
    const rows = raw.getRange(2, 1, raw.getLastRow() - 1, raw.getLastColumn()).getDisplayValues();
    rows.forEach(row => {
      if (String(row[rawHeaders.Day_ID - 1] || '') === dayId) {
        dayRawCount += 1;
        if (String(row[rawHeaders.Meal_ID - 1] || '') === '2026-08-09_M2') m2Count += 1;
        if (String(row[rawHeaders.Duplicate_Flag - 1] || '')) duplicateCount += 1;
      }
    });
  }

  if (daily.getLastRow() >= 2) {
    const rows = daily.getRange(2, 1, daily.getLastRow() - 1, daily.getLastColumn()).getDisplayValues();
    rows.forEach(row => {
      if (String(row[dailyHeaders.Day_ID - 1] || '') === dayId) {
        dailyRows += 1;
        mealCount = Number(row[dailyHeaders.Meal_Count - 1] || 0);
        if (String(row[dailyHeaders.Duplicate_Flag - 1] || '')) duplicateCount += 1;
      }
    });
  }

  if (inbox.getLastRow() >= 2) {
    const rows = inbox.getRange(2, 1, inbox.getLastRow() - 1, inbox.getLastColumn()).getDisplayValues();
    rows.forEach(row => {
      if (String(row[inboxHeaders.Inbox_Event_ID - 1] || '') === inboxEventId) {
        targetInboxCount += 1;
        if (String(row[inboxHeaders.Duplicate_Flag - 1] || '')) duplicateCount += 1;
      }
    });
  }

  return { dayRawCount, m2Count, dailyRows, mealCount, targetInboxCount, duplicateCount };
}
