'use strict';

const RFORM_PHASE3_VERSION = '0.3.1-sandbox';
const RFORM_MEAL_SOURCE = 'RFORM_MOBILE';
const RFORM_MEAL_TYPES = Object.freeze(['BREAKFAST','POST_WORKOUT','LUNCH','SNACK','DINNER','LATE_SNACK','OTHER']);
const RFORM_MEAL_MAX_COMPONENTS = 20;

function getPhase3BootstrapState() {
  const config = getConfig_();
  const dateKey = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  const today = getDayStateByDate_(dateKey);
  const app = buildAppBootstrap_(config);
  app.appVersion = RFORM_PHASE3_VERSION;
  app.readOnly = false;
  app.writeScope = ['DAY_START', 'MEAL'];
  app.modules.dayStart = true;
  app.modules.nutrition = true;
  return {
    app,
    today,
    training: buildTrainingLaunchState_(today, config),
    dayStart: getDayStartDefaults_(dateKey, today, config),
    nutritionInput: getNutritionInputState_(today, config)
  };
}

function getNutritionInputState_(today, config) {
  const ss = getMasterSpreadsheet_();
  const catalog = ss.getSheetByName('FOOD_CATALOG');
  if (!catalog) throw new Error('SCHEMA_MISMATCH:FOOD_CATALOG:sheet_missing');
  const headers = getHeaderMap_(catalog);
  requireHeaders_(headers, [
    'Food_ID','Display_Name','Brand','Source_Type','Basis','Basis_Amount',
    'Calories','Protein','Fat','Carbs','Confidence','Verified_By_User',
    'Last_Used_At','Favorite','Status','Source_Reference','Record_Key','Duplicate_Flag'
  ], 'FOOD_CATALOG');

  const foods = [];
  const lastRow = catalog.getLastRow();
  if (lastRow >= 2) {
    const values = catalog.getRange(2, 1, lastRow - 1, catalog.getLastColumn()).getValues();
    values.forEach(row => {
      const status = String(valueByHeader_(row, headers, 'Status') || '').trim().toUpperCase();
      const verified = isTruthy_(valueByHeader_(row, headers, 'Verified_By_User'));
      const foodId = String(valueByHeader_(row, headers, 'Food_ID') || '').trim();
      if (!foodId || status !== 'ACTIVE' || !verified) return;
      foods.push({
        foodId,
        displayName: String(valueByHeader_(row, headers, 'Display_Name') || '').trim(),
        brand: String(valueByHeader_(row, headers, 'Brand') || '').trim(),
        basis: String(valueByHeader_(row, headers, 'Basis') || '').trim(),
        basisAmount: Number(valueByHeader_(row, headers, 'Basis_Amount')) || 0,
        calories: Number(valueByHeader_(row, headers, 'Calories')) || 0,
        protein: Number(valueByHeader_(row, headers, 'Protein')) || 0,
        fat: Number(valueByHeader_(row, headers, 'Fat')) || 0,
        carbs: Number(valueByHeader_(row, headers, 'Carbs')) || 0,
        confidence: String(valueByHeader_(row, headers, 'Confidence') || '').trim(),
        sourceType: String(valueByHeader_(row, headers, 'Source_Type') || '').trim(),
        favorite: isTruthy_(valueByHeader_(row, headers, 'Favorite')),
        lastUsedAt: serializeDateTime_(valueByHeader_(row, headers, 'Last_Used_At'), config.timezone)
      });
    });
  }

  foods.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return String(a.displayName).localeCompare(String(b.displayName), 'ru');
  });

  return {
    status: !today || today.state === 'NOT_STARTED' ? 'DAY_NOT_STARTED' : today.state === 'CLOSED' ? 'DAY_CLOSED' : 'READY',
    allowedMealTypes: RFORM_MEAL_TYPES.slice(),
    suggestedMealType: suggestMealType_(new Date(), config.timezone),
    defaultMealTime: Utilities.formatDate(new Date(), config.timezone, 'HH:mm'),
    foods,
    catalogCount: foods.length,
    catalogReady: foods.length > 0
  };
}

function submitMeal(payload) {
  const config = getConfig_();
  const input = validateMealPayload_(payload, config);
  const ss = getMasterSpreadsheet_();
  const daily = ss.getSheetByName('DAILY');
  const raw = ss.getSheetByName('NUTRITION_RAW');
  const aggregate = ss.getSheetByName('NUTRITION_DAILY');
  const catalog = ss.getSheetByName('FOOD_CATALOG');
  const inbox = ss.getSheetByName('INBOX_LOG');

  if (!daily) throw new Error('SCHEMA_MISMATCH:DAILY:sheet_missing');
  if (!raw) throw new Error('SCHEMA_MISMATCH:NUTRITION_RAW:sheet_missing');
  if (!aggregate) throw new Error('SCHEMA_MISMATCH:NUTRITION_DAILY:sheet_missing');
  if (!catalog) throw new Error('SCHEMA_MISMATCH:FOOD_CATALOG:sheet_missing');
  if (!inbox) throw new Error('SCHEMA_MISMATCH:INBOX_LOG:sheet_missing');

  const dailyHeaders = getHeaderMap_(daily);
  const rawHeaders = getHeaderMap_(raw);
  const aggregateHeaders = getHeaderMap_(aggregate);
  const catalogHeaders = getHeaderMap_(catalog);
  const inboxHeaders = getHeaderMap_(inbox);

  requireHeaders_(dailyHeaders, ['Day_ID','Date','Day_Status'], 'DAILY');
  requireHeaders_(rawHeaders, [
    'Food_Record_ID','Day_ID','Date','Meal_ID','Meal_Time','Meal_Type','Food_Name_Original',
    'Food_Name_Normalized','Amount','Unit','Calories_Min','Calories_Max','Protein_Min','Protein_Max',
    'Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Estimation_Quality','Source','Photo_Link',
    'Created_At','Status','Record_Key','Duplicate_Flag'
  ], 'NUTRITION_RAW');
  requireHeaders_(aggregateHeaders, [
    'Day_ID','Date','Meal_Count','Calories_Min','Calories_Max','Protein_Min','Protein_Max',
    'Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Plan_Status','Main_Deviation','Nutrition_Decision',
    'Status','Closed_At','Duplicate_Flag'
  ], 'NUTRITION_DAILY');
  requireHeaders_(catalogHeaders, [
    'Food_ID','Display_Name','Brand','Source_Type','Basis','Basis_Amount','Calories','Protein','Fat','Carbs',
    'Confidence','Verified_By_User','Status','Source_Reference','Duplicate_Flag'
  ], 'FOOD_CATALOG');
  requireHeaders_(inboxHeaders, [
    'Inbox_Event_ID','Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity',
    'Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status',
    'Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Duplicate_Flag','Note'
  ], 'INBOX_LOG');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  const inboxId = `APP-MEAL-${input.eventId}`;
  const sheetDateSerial = dateKeyToSheetSerial_(input.eventDate);
  let rawFirstRow = 0;
  let rawRowCount = 0;
  let aggregateRowCreated = 0;
  let inboxRow = 0;
  let resultStatus = '';
  let mealId = '';

  try {
    const existingEventRow = findRowByExactValue_(inbox, inboxHeaders.Inbox_Event_ID, inboxId);
    if (existingEventRow) {
      resultStatus = 'ALREADY_APPLIED';
    } else {
      const dailyRow = findRowByDate_(daily, dailyHeaders.Date, input.eventDate, config.timezone);
      if (!dailyRow) throw new Error('VALIDATION:DAY_NOT_STARTED');
      const dailyValues = daily.getRange(dailyRow, 1, 1, daily.getLastColumn()).getValues()[0];
      const dayId = String(valueByHeader_(dailyValues, dailyHeaders, 'Day_ID') || '').trim();
      const dayStatus = String(valueByHeader_(dailyValues, dailyHeaders, 'Day_Status') || '').trim().toUpperCase();
      if (!dayId) throw new Error('VALIDATION:DAY_ID_MISSING');
      if (dayStatus !== 'OPEN') throw new Error(`VALIDATION:DAY_NOT_OPEN:${dayStatus || 'UNKNOWN'}`);

      const foodsById = resolveCatalogFoods_(catalog, catalogHeaders, input.components.map(c => c.foodId));
      const normalizedComponents = input.components.map((component, index) => {
        const food = foodsById[component.foodId];
        if (!food) throw new Error(`VALIDATION:FOOD_NOT_AVAILABLE:${component.foodId}`);
        return calculateCatalogComponent_(food, component, index);
      });

      mealId = nextMealId_(raw, rawHeaders, input.eventDate);
      const firstRecordNumber = nextFoodRecordNumber_(raw, rawHeaders);
      rawRowCount = normalizedComponents.length;
      rawFirstRow = raw.getLastRow() + 1;
      ensureRows_(raw, rawFirstRow + rawRowCount - 1);
      prepareNewRowsLikePrevious_(raw, rawFirstRow, rawRowCount);

      const now = new Date();
      const mealTimeSerial = timeToSheetFraction_(input.mealTime);
      const rawRows = normalizedComponents.map((component, index) => buildNutritionRawRow_(
        rawFirstRow + index,
        firstRecordNumber + index,
        dayId,
        input,
        component,
        mealId,
        now,
        sheetDateSerial,
        mealTimeSerial
      ));
      raw.getRange(rawFirstRow, 1, rawRowCount, 25).setValues(rawRows);
      raw.getRange(rawFirstRow, rawHeaders.Date, rawRowCount, 1).setNumberFormat('dd.mm.yyyy');
      raw.getRange(rawFirstRow, rawHeaders.Meal_Time, rawRowCount, 1).setNumberFormat('h:mm');
      raw.getRange(rawFirstRow, rawHeaders.Created_At, rawRowCount, 1).setNumberFormat('dd.mm.yyyy hh:mm');
      SpreadsheetApp.flush();

      for (let offset = 0; offset < rawRowCount; offset++) {
        const row = rawFirstRow + offset;
        verifyCalendarDateCellPhase3_(raw.getRange(row, rawHeaders.Date), sheetDateSerial, config.timezone, `NUTRITION_RAW:DateSerial:${row}`);
        if (raw.getRange(row, rawHeaders.Meal_ID).getDisplayValue() !== mealId) {
          throw new Error(`VERIFY_FAILED:NUTRITION_RAW:Meal_ID:${row}`);
        }
        if (raw.getRange(row, rawHeaders.Duplicate_Flag).getDisplayValue()) {
          throw new Error(`VERIFY_FAILED:NUTRITION_RAW:DUPLICATE:${row}`);
        }
      }

      let aggregateRow = findRowByExactValue_(aggregate, aggregateHeaders.Day_ID, dayId);
      if (!aggregateRow) {
        aggregateRow = aggregate.getLastRow() + 1;
        ensureRows_(aggregate, aggregateRow);
        prepareNewRowsLikePrevious_(aggregate, aggregateRow, 1);
        aggregate.getRange(aggregateRow, 1, 1, 17).setValues([
          buildNutritionDailyFormulaRow_(aggregateRow, sheetDateSerial)
        ]);
        aggregate.getRange(aggregateRow, aggregateHeaders.Date).setNumberFormat('dd.mm.yyyy');
        aggregateRowCreated = aggregateRow;
      } else {
        const existingStatus = String(aggregate.getRange(aggregateRow, aggregateHeaders.Status).getDisplayValue() || '').trim().toUpperCase();
        if (existingStatus === 'CLOSED') throw new Error('VALIDATION:NUTRITION_DAILY_ALREADY_CLOSED');
      }
      SpreadsheetApp.flush();

      if (aggregate.getRange(aggregateRow, aggregateHeaders.Day_ID).getDisplayValue() !== dayId) {
        throw new Error('VERIFY_FAILED:NUTRITION_DAILY:Day_ID');
      }
      verifyCalendarDateCellPhase3_(aggregate.getRange(aggregateRow, aggregateHeaders.Date), sheetDateSerial, config.timezone, 'NUTRITION_DAILY:DateSerial');
      if (aggregate.getRange(aggregateRow, aggregateHeaders.Duplicate_Flag).getDisplayValue()) {
        throw new Error('VERIFY_FAILED:NUTRITION_DAILY:DUPLICATE');
      }

      inboxRow = inbox.getLastRow() + 1;
      ensureRows_(inbox, inboxRow);
      prepareNewRowsLikePrevious_(inbox, inboxRow, 1);
      inbox.getRange(inboxRow, 1, 1, 18).setValues([buildMealInboxRow_(
        inboxRow,
        inboxId,
        dayId,
        input,
        normalizedComponents,
        mealId,
        now,
        sheetDateSerial
      )]);
      inbox.getRange(inboxRow, inboxHeaders.Received_At).setNumberFormat('dd.mm.yyyy hh:mm');
      inbox.getRange(inboxRow, inboxHeaders.Event_Date).setNumberFormat('dd.mm.yyyy');
      inbox.getRange(inboxRow, inboxHeaders.Applied_At).setNumberFormat('dd.mm.yyyy hh:mm');
      SpreadsheetApp.flush();

      if (inbox.getRange(inboxRow, inboxHeaders.Inbox_Event_ID).getDisplayValue() !== inboxId) {
        throw new Error('VERIFY_FAILED:INBOX_LOG:Inbox_Event_ID');
      }
      verifyCalendarDateCellPhase3_(inbox.getRange(inboxRow, inboxHeaders.Event_Date), sheetDateSerial, config.timezone, 'INBOX_LOG:Event_Date');
      if (inbox.getRange(inboxRow, inboxHeaders.Duplicate_Flag).getDisplayValue()) {
        throw new Error('VERIFY_FAILED:INBOX_LOG:DUPLICATE');
      }

      resultStatus = 'APPLIED';
    }
  } catch (error) {
    if (inboxRow) inbox.getRange(inboxRow, 1, 1, 18).clearContent();
    if (aggregateRowCreated) aggregate.getRange(aggregateRowCreated, 1, 1, 17).clearContent();
    if (rawFirstRow && rawRowCount) raw.getRange(rawFirstRow, 1, rawRowCount, 25).clearContent();
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
    mealId,
    today,
    training: buildTrainingLaunchState_(today, config),
    nutritionInput: getNutritionInputState_(today, config),
    appVersion: RFORM_PHASE3_VERSION
  };
}

function verifyCalendarDateCellPhase3_(range, expectedSerial, timezone, label) {
  const value = range.getValue();
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    const dateKey = Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
    const timeKey = Utilities.formatDate(value, timezone, 'HH:mm:ss');
    if (dateKeyToSheetSerial_(dateKey) !== expectedSerial || timeKey !== '00:00:00') {
      throw new Error(`VERIFY_FAILED:${label}`);
    }
    return;
  }
  const serial = Number(value);
  if (!Number.isFinite(serial) || !Number.isInteger(serial) || serial !== expectedSerial) {
    throw new Error(`VERIFY_FAILED:${label}`);
  }
}

function validateMealPayload_(payload, config) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const today = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  const eventId = String(payload.eventId || '').trim();
  const eventType = String(payload.eventType || '').trim();
  const eventDate = String(payload.eventDate || '').trim();
  const mealTime = String(payload.mealTime || '').trim();
  const mealType = String(payload.mealType || '').trim().toUpperCase();
  const source = String(payload.source || '').trim();

  if (!/^[0-9a-fA-F-]{32,36}$/.test(eventId)) throw new Error('VALIDATION:EVENT_ID');
  if (eventType !== 'MEAL') throw new Error('VALIDATION:EVENT_TYPE');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || eventDate !== today) throw new Error('VALIDATION:EVENT_DATE_TODAY_ONLY');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(mealTime)) throw new Error('VALIDATION:MEAL_TIME');
  if (!RFORM_MEAL_TYPES.includes(mealType)) throw new Error('VALIDATION:MEAL_TYPE');
  if (source !== RFORM_MEAL_SOURCE) throw new Error('VALIDATION:SOURCE');
  if (!Array.isArray(payload.components) || payload.components.length < 1 || payload.components.length > RFORM_MEAL_MAX_COMPONENTS) {
    throw new Error('VALIDATION:COMPONENTS');
  }

  const seen = {};
  const components = payload.components.map((component, index) => {
    if (!component || typeof component !== 'object') throw new Error(`VALIDATION:COMPONENT:${index + 1}`);
    const foodId = String(component.foodId || '').trim();
    const unit = String(component.unit || '').trim();
    const amount = Number(component.amount);
    if (!foodId) throw new Error(`VALIDATION:FOOD_ID:${index + 1}`);
    if (!unit) throw new Error(`VALIDATION:UNIT:${index + 1}`);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) throw new Error(`VALIDATION:AMOUNT:${index + 1}`);
    const uniqueKey = `${foodId}|${unit}`;
    if (seen[uniqueKey]) throw new Error(`VALIDATION:DUPLICATE_COMPONENT:${foodId}`);
    seen[uniqueKey] = true;
    return { foodId, amount, unit };
  });

  return {
    eventId,
    eventType,
    eventDate,
    mealTime,
    mealType,
    components,
    templateId: String(payload.templateId || '').trim(),
    source: RFORM_MEAL_SOURCE
  };
}

function resolveCatalogFoods_(sheet, headers, foodIds) {
  const wanted = {};
  foodIds.forEach(id => { wanted[id] = true; });
  const found = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return found;
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  rows.forEach(row => {
    const foodId = String(valueByHeader_(row, headers, 'Food_ID') || '').trim();
    if (!wanted[foodId]) return;
    const status = String(valueByHeader_(row, headers, 'Status') || '').trim().toUpperCase();
    const verified = isTruthy_(valueByHeader_(row, headers, 'Verified_By_User'));
    const duplicate = String(valueByHeader_(row, headers, 'Duplicate_Flag') || '').trim();
    if (status !== 'ACTIVE' || !verified || duplicate) return;
    found[foodId] = {
      foodId,
      displayName: String(valueByHeader_(row, headers, 'Display_Name') || '').trim(),
      brand: String(valueByHeader_(row, headers, 'Brand') || '').trim(),
      sourceType: String(valueByHeader_(row, headers, 'Source_Type') || '').trim(),
      basis: String(valueByHeader_(row, headers, 'Basis') || '').trim(),
      basisAmount: Number(valueByHeader_(row, headers, 'Basis_Amount')),
      calories: Number(valueByHeader_(row, headers, 'Calories')),
      protein: Number(valueByHeader_(row, headers, 'Protein')),
      fat: Number(valueByHeader_(row, headers, 'Fat')),
      carbs: Number(valueByHeader_(row, headers, 'Carbs')),
      confidence: String(valueByHeader_(row, headers, 'Confidence') || '').trim(),
      sourceReference: String(valueByHeader_(row, headers, 'Source_Reference') || '').trim()
    };
  });
  return found;
}

function calculateCatalogComponent_(food, component, index) {
  if (!food.displayName) throw new Error(`VALIDATION:FOOD_NAME:${food.foodId}`);
  if (!Number.isFinite(food.basisAmount) || food.basisAmount <= 0) throw new Error(`VALIDATION:BASIS_AMOUNT:${food.foodId}`);
  if (!food.basis || component.unit !== food.basis) throw new Error(`VALIDATION:UNIT_MISMATCH:${food.foodId}:${component.unit}:${food.basis || 'NONE'}`);
  ['calories','protein','fat','carbs'].forEach(field => {
    if (!Number.isFinite(food[field]) || food[field] < 0) throw new Error(`VALIDATION:CATALOG_${field.toUpperCase()}:${food.foodId}`);
  });
  const factor = component.amount / food.basisAmount;
  return {
    index,
    foodId: food.foodId,
    displayName: food.displayName,
    brand: food.brand,
    amount: component.amount,
    unit: component.unit,
    calories: round2_(food.calories * factor),
    protein: round2_(food.protein * factor),
    fat: round2_(food.fat * factor),
    carbs: round2_(food.carbs * factor),
    estimationQuality: catalogEstimationQuality_(food.sourceType),
    sourceReference: food.sourceReference,
    confidence: food.confidence
  };
}

function buildNutritionRawRow_(row, recordNumber, dayId, input, component, mealId, now, sheetDateSerial, mealTimeSerial) {
  const values = new Array(25).fill('');
  values[0] = `F-${String(input.eventDate).replace(/-/g, '')}-${String(recordNumber).padStart(6, '0')}`;
  values[1] = dayId;
  values[2] = sheetDateSerial;
  values[3] = mealId;
  values[4] = mealTimeSerial;
  values[5] = input.mealType;
  values[6] = component.brand ? `${component.displayName} — ${component.brand}` : component.displayName;
  values[7] = normalizeFoodName_(component.displayName);
  values[8] = component.amount;
  values[9] = component.unit;
  values[10] = component.calories;
  values[11] = component.calories;
  values[12] = component.protein;
  values[13] = component.protein;
  values[14] = component.fat;
  values[15] = component.fat;
  values[16] = component.carbs;
  values[17] = component.carbs;
  values[18] = component.estimationQuality;
  values[19] = `RFORM_MOBILE | FOOD_CATALOG:${component.foodId}${component.sourceReference ? ' | ' + component.sourceReference : ''}`;
  values[20] = '';
  values[21] = now;
  values[22] = 'ACTIVE';
  values[23] = `${dayId}|${mealId}|${component.foodId}|${component.amount}|${component.unit}`;
  values[24] = `=IF(X${row}="";"";IF(COUNTIF($X$2:$X$20000;X${row})>1;"DUPLICATE";""))`;
  return values;
}

function buildNutritionDailyFormulaRow_(row, sheetDateSerial) {
  const values = new Array(17).fill('');
  values[0] = `=IF(B${row}="";"";"D-"&TEXT(B${row};"yyyymmdd"))`;
  values[1] = sheetDateSerial;
  values[2] = `=IF(A${row}="";"";COUNTUNIQUEIFS(NUTRITION_RAW!$D$2:$D$20000;NUTRITION_RAW!$B$2:$B$20000;A${row};NUTRITION_RAW!$D$2:$D$20000;"<>";NUTRITION_RAW!$W$2:$W$20000;"<>DELETED"))`;
  ['K','L','M','N','O','P','Q','R'].forEach((column, index) => {
    values[3 + index] = `=IF(OR($A${row}="";$C${row}=0);"";SUMIFS(NUTRITION_RAW!${column}$2:${column}$20000;NUTRITION_RAW!$B$2:$B$20000;$A${row};NUTRITION_RAW!$W$2:$W$20000;"<>DELETED"))`;
  });
  values[11] = '';
  values[12] = '';
  values[13] = '';
  values[14] = 'ACTIVE';
  values[15] = '';
  values[16] = `=IF(A${row}="";"";IF(COUNTIF($A$2:$A$5004;A${row})>1;"DUPLICATE";""))`;
  return values;
}

function buildMealInboxRow_(row, inboxId, dayId, input, components, mealId, now, sheetDateSerial) {
  const values = new Array(18).fill('');
  const total = sumComponents_(components);
  values[0] = inboxId;
  values[1] = now;
  values[2] = sheetDateSerial;
  values[3] = 'MEAL';
  values[4] = buildMealRawMessage_(input, components, total);
  values[5] = 'NUTRITION_MEAL';
  values[6] = 'NUTRITION_RAW';
  values[7] = `${dayId}|${mealId}`;
  values[8] = 'VALID';
  values[10] = 'APPLIED';
  values[11] = now;
  values[12] = 'OWNER';
  values[13] = RFORM_MEAL_SOURCE;
  values[14] = RFORM_PHASE3_VERSION;
  values[16] = `=IF(A${row}="";"";IF(COUNTIF($A$2:$A$5000;A${row})>1;"DUPLICATE";""))`;
  values[17] = `R/Form Mobile ${RFORM_PHASE3_VERSION}. Component-level MEAL: ${components.length} component(s), Meal_ID ${mealId}. КБЖУ calculated server-side from verified FOOD_CATALOG. NUTRITION_DAILY remains formula-owned. Training Mobile v2.1 не изменялся.`;
  return values;
}

function buildMealRawMessage_(input, components, total) {
  const foods = components.map(c => `${c.displayName} ${c.amount} ${c.unit}`).join('; ');
  return `${input.mealType} ${input.mealTime}: ${foods}. Итого: ${fmtAudit_(total.calories)} ккал / Б ${fmtAudit_(total.protein)} г / Ж ${fmtAudit_(total.fat)} г / У ${fmtAudit_(total.carbs)} г.`;
}

function nextMealId_(sheet, headers, dateKey) {
  const lastRow = sheet.getLastRow();
  let max = 0;
  if (lastRow >= 2) {
    const values = sheet.getRange(2, headers.Meal_ID, lastRow - 1, 1).getDisplayValues();
    const prefix = `${dateKey}_M`;
    values.forEach(row => {
      const value = String(row[0] || '');
      if (value.indexOf(prefix) !== 0) return;
      const n = Number(value.slice(prefix.length));
      if (Number.isInteger(n) && n > max) max = n;
    });
  }
  return `${dateKey}_M${max + 1}`;
}

function nextFoodRecordNumber_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  let max = 0;
  if (lastRow >= 2) {
    const values = sheet.getRange(2, headers.Food_Record_ID, lastRow - 1, 1).getDisplayValues();
    values.forEach(row => {
      const match = String(row[0] || '').match(/^F-\d{8}-(\d{6})$/);
      if (!match) return;
      const n = Number(match[1]);
      if (Number.isInteger(n) && n > max) max = n;
    });
  }
  return max + 1;
}

function ensureRows_(sheet, targetLastRow) {
  if (targetLastRow <= sheet.getMaxRows()) return;
  sheet.insertRowsAfter(sheet.getMaxRows(), targetLastRow - sheet.getMaxRows());
}

function prepareNewRowsLikePrevious_(sheet, firstRow, rowCount) {
  const sourceRow = firstRow > 2 ? firstRow - 1 : 2;
  if (sourceRow > sheet.getMaxRows()) return;
  const source = sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn());
  const target = sheet.getRange(firstRow, 1, rowCount, sheet.getLastColumn());
  source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
}

function timeToSheetFraction_(timeText) {
  const match = String(timeText).match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error('VALIDATION:MEAL_TIME');
  return (Number(match[1]) * 60 + Number(match[2])) / 1440;
}

function suggestMealType_(date, timezone) {
  const hour = Number(Utilities.formatDate(date, timezone, 'H'));
  if (hour < 11) return 'BREAKFAST';
  if (hour < 15) return 'LUNCH';
  if (hour < 18) return 'SNACK';
  if (hour < 22) return 'DINNER';
  return 'LATE_SNACK';
}

function catalogEstimationQuality_(sourceType) {
  const value = String(sourceType || '').trim().toUpperCase();
  if (['EXACT_LABEL','STANDARD_DATABASE','RECIPE_CALCULATED','ESTIMATED','PHOTO_ESTIMATE'].includes(value)) return value;
  return 'ESTIMATED';
}

function normalizeFoodName_(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/[|]+/g, '_');
}

function isTruthy_(value) {
  if (value === true) return true;
  const text = String(value || '').trim().toUpperCase();
  return ['TRUE','YES','1','ДА'].includes(text);
}

function serializeDateTime_(value, timezone) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, timezone, "yyyy-MM-dd'T'HH:mm:ss");
  }
  return value ? String(value) : '';
}

function sumComponents_(components) {
  return components.reduce((sum, component) => {
    sum.calories += component.calories;
    sum.protein += component.protein;
    sum.fat += component.fat;
    sum.carbs += component.carbs;
    return sum;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
}

function round2_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function fmtAudit_(value) {
  return String(round2_(value)).replace('.', ',');
}
