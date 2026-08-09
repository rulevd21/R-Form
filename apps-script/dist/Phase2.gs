'use strict';

const RFORM_PHASE2_VERSION = '0.2.1-sandbox';
const RFORM_DAY_START_TYPES = Object.freeze(['REST', 'RECOVERY', 'TRAINING_A', 'TRAINING_B', 'TRAINING_C']);
const RFORM_DAY_START_SOURCE = 'RFORM_MOBILE';

function getPhase2BootstrapState() {
  const config = getConfig_();
  const dateKey = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  const today = getDayStateByDate_(dateKey);
  const app = buildAppBootstrap_(config);
  app.appVersion = RFORM_PHASE2_VERSION;
  app.readOnly = false;
  app.writeScope = ['DAY_START'];
  app.modules.dayStart = true;
  return {
    app,
    today,
    training: buildTrainingLaunchState_(today, config),
    dayStart: getDayStartDefaults_(dateKey, today, config)
  };
}

function getDayStartDefaults_(dateKey, today, config) {
  const ss = getMasterSpreadsheet_();
  const daily = ss.getSheetByName('DAILY');
  if (!daily) throw new Error('SCHEMA_MISMATCH:DAILY:sheet_missing');
  const headers = getHeaderMap_(daily);
  requireHeaders_(headers, ['Date', 'Steps'], 'DAILY');

  const previousDate = shiftDateKey_(dateKey, -1);
  const previousRow = findRowByDate_(daily, headers.Date, previousDate, config.timezone);
  const previousDaySteps = previousRow ? daily.getRange(previousRow, headers.Steps).getValue() : '';
  const trainingCode = today && today.training ? String(today.training.trainingCode || '') : '';
  const suggestedDayType = ['A', 'B', 'C'].includes(trainingCode) ? `TRAINING_${trainingCode}` : '';

  return {
    allowedDayTypes: RFORM_DAY_START_TYPES.slice(),
    previousDate,
    previousDayExists: Boolean(previousRow),
    previousDaySteps: previousDaySteps === '' ? '' : previousDaySteps,
    suggestedDayType,
    status: today && today.state === 'NOT_STARTED' ? 'READY' : 'ALREADY_STARTED'
  };
}

function submitDayStart(payload) {
  const config = getConfig_();
  const input = validateDayStartPayload_(payload, config);
  const ss = getMasterSpreadsheet_();
  const daily = ss.getSheetByName('DAILY');
  const inbox = ss.getSheetByName('INBOX_LOG');

  if (!daily) throw new Error('SCHEMA_MISMATCH:DAILY:sheet_missing');
  if (!inbox) throw new Error('SCHEMA_MISMATCH:INBOX_LOG:sheet_missing');

  const dailyHeaders = getHeaderMap_(daily);
  const inboxHeaders = getHeaderMap_(inbox);

  requireHeaders_(dailyHeaders, [
    'Day_ID','Date','Day_Type','Morning_Weight','Weight_7D_Average','Sleep_Hours',
    'Sleep_Quality','Readiness','Steps','Shoulder_Pain','Elbow_Pain','Other_Pain',
    'Calories_Plan_Min','Calories_Plan_Max','Protein_Plan_Min','Protein_Plan_Max',
    'Fat_Plan_Min','Fat_Plan_Max','Carbs_Plan_Min','Carbs_Plan_Max',
    'Calories_Fact_Min','Calories_Fact_Max','Protein_Fact_Min','Protein_Fact_Max',
    'Fat_Fact_Min','Fat_Fact_Max','Carbs_Fact_Min','Carbs_Fact_Max',
    'Day_Status','Daily_Conclusion','Duplicate_Flag','Updated_At','Updated_By'
  ], 'DAILY');

  requireHeaders_(inboxHeaders, [
    'Inbox_Event_ID','Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity',
    'Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status',
    'Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Duplicate_Flag','Note'
  ], 'INBOX_LOG');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  const inboxId = `APP-DAYSTART-${input.eventId}`;
  const sheetDateSerial = dateKeyToSheetSerial_(input.eventDate);
  let previousStepsRange = null;
  let previousStepsBefore = null;
  let previousStepsChanged = false;
  let dailyRow = 0;
  let inboxRow = 0;
  let resultStatus = '';

  try {
    const existingEventRow = findRowByExactValue_(inbox, inboxHeaders.Inbox_Event_ID, inboxId);

    if (existingEventRow) {
      resultStatus = 'ALREADY_APPLIED';
    } else {
      const existingDayRow = findRowByDate_(daily, dailyHeaders.Date, input.eventDate, config.timezone);

      if (existingDayRow) {
        resultStatus = 'ALREADY_EXISTS';
      } else {
        const previousDate = shiftDateKey_(input.eventDate, -1);

        if (input.previousDaySteps !== null) {
          const previousRow = findRowByDate_(daily, dailyHeaders.Date, previousDate, config.timezone);
          if (!previousRow) throw new Error(`VALIDATION:PREVIOUS_DAY_NOT_FOUND:${previousDate}`);

          previousStepsRange = daily.getRange(previousRow, dailyHeaders.Steps);
          previousStepsBefore = previousStepsRange.getValue();

          if (Number(previousStepsBefore) !== input.previousDaySteps) {
            previousStepsRange.setValue(input.previousDaySteps);
            previousStepsChanged = true;
          }
        }

        dailyRow = daily.getLastRow() + 1;
        if (dailyRow > daily.getMaxRows()) daily.insertRowsAfter(daily.getMaxRows(), 1);

        const now = new Date();
        const dailyValues = buildDayStartDailyRow_(dailyRow, input, now, sheetDateSerial);
        daily.getRange(dailyRow, 1, 1, dailyValues.length).setValues([dailyValues]);
        daily.getRange(dailyRow, dailyHeaders.Date).setNumberFormat('dd.mm.yyyy');
        daily.getRange(dailyRow, dailyHeaders.Updated_At).setNumberFormat('dd.mm.yyyy hh:mm');
        SpreadsheetApp.flush();

        const expectedDayId = dayIdFromDateKey_(input.eventDate);
        const actualDayId = daily.getRange(dailyRow, dailyHeaders.Day_ID).getDisplayValue();
        const actualDateSerial = Number(daily.getRange(dailyRow, dailyHeaders.Date).getValue());

        if (actualDayId !== expectedDayId) {
          throw new Error(`VERIFY_FAILED:DAILY:Day_ID:${actualDayId}`);
        }
        if (actualDateSerial !== sheetDateSerial) {
          throw new Error(`VERIFY_FAILED:DAILY:DateSerial:${actualDateSerial}`);
        }
        if (daily.getRange(dailyRow, dailyHeaders.Duplicate_Flag).getDisplayValue()) {
          throw new Error('VERIFY_FAILED:DAILY:DUPLICATE');
        }

        inboxRow = inbox.getLastRow() + 1;
        if (inboxRow > inbox.getMaxRows()) inbox.insertRowsAfter(inbox.getMaxRows(), 1);

        const inboxValues = buildDayStartInboxRow_(
          inboxRow,
          inboxId,
          expectedDayId,
          input,
          now,
          previousStepsChanged,
          sheetDateSerial
        );

        inbox.getRange(inboxRow, 1, 1, inboxValues.length).setValues([inboxValues]);
        inbox.getRange(inboxRow, inboxHeaders.Received_At).setNumberFormat('dd.mm.yyyy hh:mm');
        inbox.getRange(inboxRow, inboxHeaders.Event_Date).setNumberFormat('dd.mm.yyyy');
        inbox.getRange(inboxRow, inboxHeaders.Applied_At).setNumberFormat('dd.mm.yyyy hh:mm');
        SpreadsheetApp.flush();

        if (inbox.getRange(inboxRow, inboxHeaders.Inbox_Event_ID).getDisplayValue() !== inboxId) {
          throw new Error('VERIFY_FAILED:INBOX_LOG:Inbox_Event_ID');
        }
        if (Number(inbox.getRange(inboxRow, inboxHeaders.Event_Date).getValue()) !== sheetDateSerial) {
          throw new Error('VERIFY_FAILED:INBOX_LOG:Event_Date');
        }
        if (inbox.getRange(inboxRow, inboxHeaders.Duplicate_Flag).getDisplayValue()) {
          throw new Error('VERIFY_FAILED:INBOX_LOG:DUPLICATE');
        }

        resultStatus = 'APPLIED';
      }
    }
  } catch (error) {
    if (inboxRow) inbox.getRange(inboxRow, 1, 1, 18).clearContent();
    if (dailyRow) daily.getRange(dailyRow, 1, 1, 33).clearContent();
    if (previousStepsChanged && previousStepsRange) previousStepsRange.setValue(previousStepsBefore);
    SpreadsheetApp.flush();
    throw error;
  } finally {
    lock.releaseLock();
  }

  const today = getDayStateByDate_(input.eventDate);
  return {
    status: resultStatus,
    eventId: input.eventId,
    inboxEventId: inboxId,
    today,
    training: buildTrainingLaunchState_(today, config),
    appVersion: RFORM_PHASE2_VERSION
  };
}

function validateDayStartPayload_(payload, config) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');

  const today = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  const eventId = String(payload.eventId || '').trim();
  const eventType = String(payload.eventType || '').trim();
  const eventDate = String(payload.eventDate || '').trim();
  const dayType = String(payload.dayType || '').trim();
  const source = String(payload.source || '').trim();

  if (!/^[0-9a-fA-F-]{32,36}$/.test(eventId)) throw new Error('VALIDATION:EVENT_ID');
  if (eventType !== 'DAY_START') throw new Error('VALIDATION:EVENT_TYPE');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || eventDate !== today) {
    throw new Error('VALIDATION:EVENT_DATE_TODAY_ONLY');
  }
  if (!RFORM_DAY_START_TYPES.includes(dayType)) throw new Error('VALIDATION:DAY_TYPE');
  if (source !== RFORM_DAY_START_SOURCE) throw new Error('VALIDATION:SOURCE');

  const morningWeight = numberInRange_(payload.morningWeight, 30, 300, 'MORNING_WEIGHT');
  const sleepHours = numberInRange_(payload.sleepHours, 0, 24, 'SLEEP_HOURS');
  const sleepQuality = integerInRange_(payload.sleepQuality, 1, 10, 'SLEEP_QUALITY');
  const readiness = integerInRange_(payload.readiness, 1, 10, 'READINESS');
  const shoulderPain = integerInRange_(payload.shoulderPain, 0, 10, 'SHOULDER_PAIN');
  const elbowPain = integerInRange_(payload.elbowPain, 0, 10, 'ELBOW_PAIN');
  const otherPain = integerInRange_(payload.otherPain, 0, 10, 'OTHER_PAIN');

  let previousDaySteps = null;
  if (
    payload.previousDaySteps !== '' &&
    payload.previousDaySteps !== null &&
    payload.previousDaySteps !== undefined
  ) {
    previousDaySteps = integerInRange_(payload.previousDaySteps, 0, 100000, 'PREVIOUS_DAY_STEPS');
  }

  const comment = String(payload.comment || '').trim();
  if (comment.length > 500) throw new Error('VALIDATION:COMMENT_TOO_LONG');

  return {
    eventId,
    eventType,
    eventDate,
    dayType,
    morningWeight,
    sleepHours,
    sleepQuality,
    readiness,
    shoulderPain,
    elbowPain,
    otherPain,
    previousDaySteps,
    comment,
    source: RFORM_DAY_START_SOURCE
  };
}

function numberInRange_(value, min, max, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`VALIDATION:${field}`);
  }
  return number;
}

function integerInRange_(value, min, max, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`VALIDATION:${field}`);
  }
  return number;
}

function buildDayStartDailyRow_(row, input, now, sheetDateSerial) {
  const values = new Array(33).fill('');

  values[0] = `=IF(B${row}="";"";"D-"&TEXT(B${row};"yyyymmdd"))`;
  values[1] = sheetDateSerial;
  values[2] = input.dayType;
  values[3] = input.morningWeight;
  values[4] = `=IF(OR(B${row}="";D${row}="");"";ROUND(AVERAGE(FILTER($D$5:$D$5003;$B$5:$B$5003>=B${row}-6;$B$5:$B$5003<=B${row};$D$5:$D$5003<>""));2))`;
  values[5] = input.sleepHours;
  values[6] = input.sleepQuality;
  values[7] = input.readiness;
  values[8] = '';
  values[9] = input.shoulderPain;
  values[10] = input.elbowPain;
  values[11] = input.otherPain;

  ['F','G','H','I','J','K','L','M'].forEach((column, index) => {
    values[12 + index] = nutritionPlanFormula_(column, row);
  });
  ['D','E','F','G','H','I','J','K'].forEach((column, index) => {
    values[20 + index] = nutritionFactFormula_(column, row);
  });

  values[28] = 'OPEN';
  values[29] = '';
  values[30] = `=IF(A${row}="";"";IF(COUNTIF($A$3:$A$5003;A${row})>1;"DUPLICATE";""))`;
  values[31] = now;
  values[32] = RFORM_DAY_START_SOURCE;

  return values;
}

function nutritionPlanFormula_(sourceColumn, row) {
  return `=IFERROR(INDEX(FILTER(ACTIVE_PLANS!${sourceColumn}$2:${sourceColumn}$1000;ACTIVE_PLANS!$B$2:$B$1000="NUTRITION";ACTIVE_PLANS!$E$2:$E$1000=IF($C${row}="RECOVERY";"REST";$C${row});ACTIVE_PLANS!$C$2:$C$1000<=$B${row};((ACTIVE_PLANS!$D$2:$D$1000="")+(ACTIVE_PLANS!$D$2:$D$1000>=$B${row}))>0;ACTIVE_PLANS!$O$2:$O$1000="ACTIVE");1);"")`;
}

function nutritionFactFormula_(sourceColumn, row) {
  return `=IFERROR(IF(INDEX(FILTER(NUTRITION_DAILY!$O$2:$O$5004;NUTRITION_DAILY!$A$2:$A$5004=$A${row});1)<>"CLOSED";"";INDEX(FILTER(NUTRITION_DAILY!${sourceColumn}$2:${sourceColumn}$5004;NUTRITION_DAILY!$A$2:$A$5004=$A${row});1));"")`;
}

function buildDayStartInboxRow_(
  row,
  inboxId,
  dayId,
  input,
  now,
  previousStepsChanged,
  sheetDateSerial
) {
  const values = new Array(18).fill('');

  values[0] = inboxId;
  values[1] = now;
  values[2] = sheetDateSerial;
  values[3] = 'DAY_START';
  values[4] = buildDayStartRawMessage_(input);
  values[5] = 'DAILY_DAY_START';
  values[6] = 'DAILY';
  values[7] = dayId;
  values[8] = 'VALID';
  values[10] = 'APPLIED';
  values[11] = now;
  values[12] = 'OWNER';
  values[13] = RFORM_DAY_START_SOURCE;
  values[14] = RFORM_PHASE2_VERSION;
  values[16] = `=IF(A${row}="";"";IF(COUNTIF($A$2:$A$5000;A${row})>1;"DUPLICATE";""))`;
  values[17] = buildDayStartAuditNote_(input, previousStepsChanged);

  return values;
}

function buildDayStartRawMessage_(input) {
  const steps = input.previousDaySteps === null ? 'не указаны' : input.previousDaySteps;
  const comment = input.comment || 'нет';
  return `Старт дня ${formatDateRu_(input.eventDate)}: ${input.dayType}; утренний вес ${input.morningWeight} кг; сон ${input.sleepHours} ч; качество сна ${input.sleepQuality}/10; готовность ${input.readiness}/10; боли плечо/локоть/другая ${input.shoulderPain}/${input.elbowPain}/${input.otherPain}; шаги за предыдущий день ${steps}; комментарий: ${comment}.`;
}

function buildDayStartAuditNote_(input, previousStepsChanged) {
  const stepsNote = input.previousDaySteps === null
    ? 'Шаги за предыдущий день не переданы.'
    : previousStepsChanged
      ? `Шаги за предыдущий день обновлены до ${input.previousDaySteps}.`
      : `Шаги за предыдущий день уже равны ${input.previousDaySteps}; повторная запись не требовалась.`;

  return `R/Form Mobile ${RFORM_PHASE2_VERSION}. Создан OPEN day через sandbox DAY_START. ${stepsNote} Расчётные поля и nutrition plan задаются формулами; RECOVERY маппится на REST только для nutrition plan. Training Mobile v2.1 не изменялся.`;
}

function dayIdFromDateKey_(dateKey) {
  return `D-${String(dateKey).replace(/-/g, '')}`;
}

function dateKeyParts_(dateKey) {
  const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('VALIDATION:DATE_KEY');

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function dateKeyToSheetSerial_(dateKey) {
  const parts = dateKeyParts_(dateKey);
  const epoch = Date.UTC(1899, 11, 30);
  const value = Date.UTC(parts.year, parts.month - 1, parts.day);
  return Math.round((value - epoch) / 86400000);
}

function shiftDateKey_(dateKey, days) {
  const parts = dateKeyParts_(dateKey);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return Utilities.formatDate(shifted, 'UTC', 'yyyy-MM-dd');
}

function formatDateRu_(dateKey) {
  const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(dateKey);
}
