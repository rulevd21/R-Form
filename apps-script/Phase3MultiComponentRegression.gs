'use strict';

/**
 * Phase 3A sandbox regression for a true multi-component MEAL.
 * Creates one new MEAL event with two verified catalog foods under one Meal_ID,
 * checks aggregate reuse / Meal_Count, then replays the same eventId and requires
 * ALREADY_APPLIED with no datastore changes.
 *
 * Run once only in the authorized sandbox on 2026-08-09.
 */
function runPhase3MultiComponentRegression() {
  const config = getConfig_();
  const ss = getMasterSpreadsheet_();
  const raw = ss.getSheetByName('NUTRITION_RAW');
  const daily = ss.getSheetByName('NUTRITION_DAILY');
  const inbox = ss.getSheetByName('INBOX_LOG');

  if (!raw || !daily || !inbox) throw new Error('PHASE3_MULTI:SCHEMA_MISSING');

  const currentDate = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  if (currentDate !== '2026-08-09') {
    throw new Error(`PHASE3_MULTI:UNEXPECTED_DATE:${currentDate}`);
  }

  const dayId = 'D-20260809';
  const eventId = 'a3f2b9dc-456b-4c85-8b1f-8ab859d860c8';
  const inboxEventId = `APP-MEAL-${eventId}`;

  const before = phase3MultiSnapshot_(raw, daily, inbox, dayId, inboxEventId);
  if (before.dayRawCount !== 2) throw new Error(`PHASE3_MULTI:BEFORE_RAW_COUNT:${before.dayRawCount}`);
  if (before.dailyRows !== 1) throw new Error(`PHASE3_MULTI:BEFORE_DAILY_ROWS:${before.dailyRows}`);
  if (before.mealCount !== 2) throw new Error(`PHASE3_MULTI:BEFORE_MEAL_COUNT:${before.mealCount}`);
  if (before.targetInboxCount !== 0) throw new Error('PHASE3_MULTI:EVENT_ALREADY_EXISTS');
  if (before.duplicateCount !== 0) throw new Error(`PHASE3_MULTI:BEFORE_DUPLICATES:${before.duplicateCount}`);

  const payload = {
    eventId,
    eventType: 'MEAL',
    eventDate: '2026-08-09',
    mealTime: '22:20',
    mealType: 'SNACK',
    components: [
      { foodId: 'FOOD-000001', amount: 150, unit: 'g' },
      { foodId: 'FOOD-000002', amount: 425, unit: 'g' }
    ],
    source: 'RFORM_MOBILE',
    appVersion: '0.3.1-sandbox'
  };

  const first = submitMeal(payload);
  if (!first || first.status !== 'APPLIED') {
    throw new Error(`PHASE3_MULTI:EXPECTED_APPLIED:${first && first.status}`);
  }

  const afterFirst = phase3MultiSnapshot_(raw, daily, inbox, dayId, inboxEventId);
  if (afterFirst.dayRawCount !== 4) throw new Error(`PHASE3_MULTI:AFTER_RAW_COUNT:${afterFirst.dayRawCount}`);
  if (afterFirst.dailyRows !== 1) throw new Error(`PHASE3_MULTI:AFTER_DAILY_ROWS:${afterFirst.dailyRows}`);
  if (afterFirst.mealCount !== 3) throw new Error(`PHASE3_MULTI:AFTER_MEAL_COUNT:${afterFirst.mealCount}`);
  if (afterFirst.targetInboxCount !== 1) throw new Error(`PHASE3_MULTI:AFTER_INBOX_COUNT:${afterFirst.targetInboxCount}`);
  if (afterFirst.m3Count !== 2) throw new Error(`PHASE3_MULTI:M3_COMPONENT_COUNT:${afterFirst.m3Count}`);
  if (afterFirst.duplicateCount !== 0) throw new Error(`PHASE3_MULTI:AFTER_DUPLICATES:${afterFirst.duplicateCount}`);

  const second = submitMeal(payload);
  if (!second || second.status !== 'ALREADY_APPLIED') {
    throw new Error(`PHASE3_MULTI:EXPECTED_ALREADY_APPLIED:${second && second.status}`);
  }

  const afterRetry = phase3MultiSnapshot_(raw, daily, inbox, dayId, inboxEventId);
  if (JSON.stringify(afterFirst) !== JSON.stringify(afterRetry)) {
    throw new Error('PHASE3_MULTI:DATA_CHANGED_ON_RETRY');
  }

  return {
    status: 'PASSED',
    firstStatus: first.status,
    retryStatus: second.status,
    mealCount: afterRetry.mealCount,
    dayRawCount: afterRetry.dayRawCount,
    nutritionDailyRows: afterRetry.dailyRows,
    m3ComponentRows: afterRetry.m3Count,
    targetInboxCount: afterRetry.targetInboxCount,
    duplicateCount: afterRetry.duplicateCount
  };
}

function phase3MultiSnapshot_(raw, daily, inbox, dayId, inboxEventId) {
  const rawHeaders = getHeaderMap_(raw);
  const dailyHeaders = getHeaderMap_(daily);
  const inboxHeaders = getHeaderMap_(inbox);

  requireHeaders_(rawHeaders, ['Day_ID','Meal_ID','Duplicate_Flag'], 'NUTRITION_RAW');
  requireHeaders_(dailyHeaders, ['Day_ID','Meal_Count','Duplicate_Flag'], 'NUTRITION_DAILY');
  requireHeaders_(inboxHeaders, ['Inbox_Event_ID','Duplicate_Flag'], 'INBOX_LOG');

  let dayRawCount = 0;
  let m3Count = 0;
  let dailyRows = 0;
  let mealCount = 0;
  let targetInboxCount = 0;
  let duplicateCount = 0;

  if (raw.getLastRow() >= 2) {
    const rows = raw.getRange(2, 1, raw.getLastRow() - 1, raw.getLastColumn()).getDisplayValues();
    rows.forEach(row => {
      if (String(row[rawHeaders.Day_ID - 1] || '') === dayId) {
        dayRawCount += 1;
        if (String(row[rawHeaders.Meal_ID - 1] || '') === '2026-08-09_M3') m3Count += 1;
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

  return { dayRawCount, m3Count, dailyRows, mealCount, targetInboxCount, duplicateCount };
}
