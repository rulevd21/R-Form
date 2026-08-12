'use strict';

const RFORM_PROD_MEAL_VERSION = '0.4.1-rc1';
const RFORM_PROD_EXACT_MASTER_TITLE = 'RFORM_MASTER_DATA_v1';
const RFORM_PROD_MEAL_SOURCE = 'RFORM_MOBILE';
const RFORM_PROD_MEAL_TYPES = Object.freeze([
  'BREAKFAST','POST_WORKOUT','LUNCH','SNACK','DINNER','LATE_SNACK','OTHER'
]);
const RFORM_PROD_MEAL_MAX_COMPONENTS = 20;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('R/Form Mobile — Production RC');
}

function getProductionMealBootstrapState() {
  const config = prodMealConfig_();
  const ss = prodMealMaster_(config);
  const dateKey = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  const today = prodMealReadToday_(ss, dateKey, config.timezone);
  const nutrition = prodMealReadNutrition_(ss, today, dateKey, config.timezone);
  const training = prodMealReadTraining_(ss, dateKey, config.timezone, config.trainingLegacyUrl);
  const nutritionInput = prodMealNutritionInput_(ss, today, config);
  const fastPaths = prodMealFastPaths_(ss, nutritionInput.foods, config);

  return {
    app: {
      appName: 'R/Form Mobile',
      environment: 'PRODUCTION_RC',
      appVersion: RFORM_PROD_MEAL_VERSION,
      timezone: config.timezone,
      writeCapability: config.writeScope.indexOf('MEAL') !== -1,
      writeScope: config.writeScope.slice(),
      modules: {
        today: true,
        nutrition: true,
        trainingLegacy: true,
        fastPathNutrition: true,
        dayStartWrite: false,
        mealWrite: config.writeScope.indexOf('MEAL') !== -1,
        favoriteWrite: false,
        templateWrite: false,
        dayCloseWrite: false
      }
    },
    datastore: {
      title: ss.getName(),
      exactTitleMatch: ss.getName() === RFORM_PROD_EXACT_MASTER_TITLE
    },
    today,
    nutrition,
    training,
    nutritionInput,
    fastPaths,
    gate: {
      status: config.writeScope.indexOf('MEAL') !== -1 ? 'MEAL_WRITE_READY' : 'READ_ONLY_KILL_SWITCH',
      productionWritesAuthorized: config.writeScope.indexOf('MEAL') !== -1,
      authorizedOperations: config.writeScope.slice(),
      trainingWriterChanged: false
    }
  };
}

function submitProductionMeal(payload) {
  const config = prodMealConfig_();
  prodMealAssertWriteAuthorized_(config, 'MEAL');
  const input = prodMealValidatePayload_(payload, config);
  const ss = prodMealMaster_(config);

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

  const dailyHeaders = prodMealHeaderMap_(daily);
  const rawHeaders = prodMealHeaderMap_(raw);
  const aggregateHeaders = prodMealHeaderMap_(aggregate);
  const catalogHeaders = prodMealHeaderMap_(catalog);
  const inboxHeaders = prodMealHeaderMap_(inbox);

  prodMealRequireHeaders_(dailyHeaders, ['Day_ID','Date','Day_Status'], 'DAILY');
  prodMealRequireHeaders_(rawHeaders, [
    'Food_Record_ID','Day_ID','Date','Meal_ID','Meal_Time','Meal_Type','Food_Name_Original',
    'Food_Name_Normalized','Amount','Unit','Calories_Min','Calories_Max','Protein_Min','Protein_Max',
    'Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Estimation_Quality','Source','Photo_Link',
    'Created_At','Status','Record_Key','Duplicate_Flag'
  ], 'NUTRITION_RAW');
  prodMealRequireHeaders_(aggregateHeaders, [
    'Day_ID','Date','Meal_Count','Calories_Min','Calories_Max','Protein_Min','Protein_Max',
    'Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Plan_Status','Main_Deviation','Nutrition_Decision',
    'Status','Closed_At','Duplicate_Flag'
  ], 'NUTRITION_DAILY');
  prodMealRequireHeaders_(catalogHeaders, [
    'Food_ID','Display_Name','Brand','Source_Type','Basis','Basis_Amount','Calories','Protein','Fat','Carbs',
    'Confidence','Verified_By_User','Status','Source_Reference','Duplicate_Flag'
  ], 'FOOD_CATALOG');
  prodMealRequireHeaders_(inboxHeaders, [
    'Inbox_Event_ID','Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity',
    'Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status',
    'Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Duplicate_Flag','Note'
  ], 'INBOX_LOG');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  const inboxId = `APP-MEAL-${input.eventId}`;
  const sheetDateSerial = prodMealDateSerial_(input.eventDate);
  let rawFirstRow = 0;
  let rawRowCount = 0;
  let aggregateRowCreated = 0;
  let inboxRow = 0;
  let resultStatus = '';
  let mealId = '';

  try {
    const existingEventRow = prodMealFindExactRow_(inbox, inboxHeaders.Inbox_Event_ID, inboxId);
    if (existingEventRow) {
      resultStatus = 'ALREADY_APPLIED';
      const existingTarget = String(inbox.getRange(existingEventRow, inboxHeaders.Target_Record_ID).getDisplayValue() || '');
      const match = existingTarget.match(/\|(\d{4}-\d{2}-\d{2}_M\d+)$/);
      mealId = match ? match[1] : '';
    } else {
      const dailyRow = prodMealFindDateRow_(daily, dailyHeaders.Date, input.eventDate, config.timezone);
      if (!dailyRow) throw new Error('VALIDATION:DAY_NOT_STARTED');
      const dailyValues = daily.getRange(dailyRow, 1, 1, daily.getLastColumn()).getValues()[0];
      const dayId = String(prodMealValue_(dailyValues, dailyHeaders, 'Day_ID') || '').trim();
      const dayStatus = String(prodMealValue_(dailyValues, dailyHeaders, 'Day_Status') || '').trim().toUpperCase();
      if (!dayId) throw new Error('VALIDATION:DAY_ID_MISSING');
      if (dayStatus !== 'OPEN') throw new Error(`VALIDATION:DAY_NOT_OPEN:${dayStatus || 'UNKNOWN'}`);

      const foodsById = prodMealResolveCatalogFoods_(
        catalog, catalogHeaders, input.components.map(component => component.foodId)
      );
      const normalizedComponents = input.components.map((component, index) => {
        const food = foodsById[component.foodId];
        if (!food) throw new Error(`VALIDATION:FOOD_NOT_AVAILABLE:${component.foodId}`);
        return prodMealCalculateComponent_(food, component, index);
      });

      mealId = prodMealNextMealId_(raw, rawHeaders, input.eventDate);
      const firstRecordNumber = prodMealNextFoodRecordNumber_(raw, rawHeaders);
      rawRowCount = normalizedComponents.length;
      rawFirstRow = raw.getLastRow() + 1;
      prodMealEnsureRows_(raw, rawFirstRow + rawRowCount - 1);
      prodMealPrepareRowsLikePrevious_(raw, rawFirstRow, rawRowCount);

      const now = new Date();
      const mealTimeSerial = prodMealTimeFraction_(input.mealTime);
      const rawRows = normalizedComponents.map((component, index) =>
        prodMealBuildRawRow_(
          rawFirstRow + index,
          firstRecordNumber + index,
          dayId,
          input,
          component,
          mealId,
          now,
          sheetDateSerial,
          mealTimeSerial
        )
      );

      raw.getRange(rawFirstRow, 1, rawRowCount, 25).setValues(rawRows);
      raw.getRange(rawFirstRow, rawHeaders.Date, rawRowCount, 1).setNumberFormat('dd.mm.yyyy');
      raw.getRange(rawFirstRow, rawHeaders.Meal_Time, rawRowCount, 1).setNumberFormat('h:mm');
      raw.getRange(rawFirstRow, rawHeaders.Created_At, rawRowCount, 1).setNumberFormat('dd.mm.yyyy hh:mm');
      SpreadsheetApp.flush();

      for (let offset = 0; offset < rawRowCount; offset += 1) {
        const row = rawFirstRow + offset;
        prodMealVerifyDateCell_(
          raw.getRange(row, rawHeaders.Date),
          sheetDateSerial,
          config.timezone,
          `NUTRITION_RAW:DateSerial:${row}`
        );
        if (raw.getRange(row, rawHeaders.Meal_ID).getDisplayValue() !== mealId) {
          throw new Error(`VERIFY_FAILED:NUTRITION_RAW:Meal_ID:${row}`);
        }
        if (raw.getRange(row, rawHeaders.Duplicate_Flag).getDisplayValue()) {
          throw new Error(`VERIFY_FAILED:NUTRITION_RAW:DUPLICATE:${row}`);
        }
      }

      let aggregateRow = prodMealFindExactRow_(aggregate, aggregateHeaders.Day_ID, dayId);
      if (!aggregateRow) {
        aggregateRow = aggregate.getLastRow() + 1;
        prodMealEnsureRows_(aggregate, aggregateRow);
        prodMealPrepareRowsLikePrevious_(aggregate, aggregateRow, 1);
        aggregate.getRange(aggregateRow, 1, 1, 17).setValues([
          prodMealBuildDailyFormulaRow_(aggregateRow, sheetDateSerial)
        ]);
        aggregate.getRange(aggregateRow, aggregateHeaders.Date).setNumberFormat('dd.mm.yyyy');
        aggregateRowCreated = aggregateRow;
      } else {
        const existingStatus = String(
          aggregate.getRange(aggregateRow, aggregateHeaders.Status).getDisplayValue() || ''
        ).trim().toUpperCase();
        if (existingStatus === 'CLOSED') {
          throw new Error('VALIDATION:NUTRITION_DAILY_ALREADY_CLOSED');
        }
      }
      SpreadsheetApp.flush();

      if (aggregate.getRange(aggregateRow, aggregateHeaders.Day_ID).getDisplayValue() !== dayId) {
        throw new Error('VERIFY_FAILED:NUTRITION_DAILY:Day_ID');
      }
      prodMealVerifyDateCell_(
        aggregate.getRange(aggregateRow, aggregateHeaders.Date),
        sheetDateSerial,
        config.timezone,
        'NUTRITION_DAILY:DateSerial'
      );
      if (aggregate.getRange(aggregateRow, aggregateHeaders.Duplicate_Flag).getDisplayValue()) {
        throw new Error('VERIFY_FAILED:NUTRITION_DAILY:DUPLICATE');
      }

      inboxRow = inbox.getLastRow() + 1;
      prodMealEnsureRows_(inbox, inboxRow);
      prodMealPrepareRowsLikePrevious_(inbox, inboxRow, 1);
      inbox.getRange(inboxRow, 1, 1, 18).setValues([
        prodMealBuildInboxRow_(
          inboxRow,
          inboxId,
          dayId,
          input,
          normalizedComponents,
          mealId,
          now,
          sheetDateSerial
        )
      ]);
      inbox.getRange(inboxRow, inboxHeaders.Received_At).setNumberFormat('dd.mm.yyyy hh:mm');
      inbox.getRange(inboxRow, inboxHeaders.Event_Date).setNumberFormat('dd.mm.yyyy');
      inbox.getRange(inboxRow, inboxHeaders.Applied_At).setNumberFormat('dd.mm.yyyy hh:mm');
      SpreadsheetApp.flush();

      if (inbox.getRange(inboxRow, inboxHeaders.Inbox_Event_ID).getDisplayValue() !== inboxId) {
        throw new Error('VERIFY_FAILED:INBOX_LOG:Inbox_Event_ID');
      }
      prodMealVerifyDateCell_(
        inbox.getRange(inboxRow, inboxHeaders.Event_Date),
        sheetDateSerial,
        config.timezone,
        'INBOX_LOG:Event_Date'
      );
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

  return {
    status: resultStatus,
    eventId: input.eventId,
    inboxEventId: inboxId,
    mealId,
    bootstrap: getProductionMealBootstrapState()
  };
}

function prodMealConfig_() {
  const props = PropertiesService.getScriptProperties();
  const environment = String(props.getProperty('RFORM_ENVIRONMENT') || '').trim().toUpperCase();
  const masterSpreadsheetId = String(props.getProperty('MASTER_SPREADSHEET_ID') || '').trim();
  const timezone = String(
    props.getProperty('APP_TIMEZONE') || Session.getScriptTimeZone() || 'Europe/Moscow'
  ).trim();
  const trainingLegacyUrl = String(props.getProperty('TRAINING_LEGACY_URL') || '').trim();
  const scopeRaw = String(props.getProperty('RFORM_WRITE_SCOPE') || '').trim().toUpperCase();
  const writeScope = scopeRaw
    ? scopeRaw.split(',').map(value => value.trim()).filter(Boolean)
    : [];

  if (!masterSpreadsheetId) throw new Error('CONFIG_MISSING:MASTER_SPREADSHEET_ID');
  if (environment !== 'PRODUCTION') {
    throw new Error(`SAFETY_GUARD:EXPECTED_PRODUCTION_ENVIRONMENT:${environment || 'MISSING'}`);
  }
  const allowed = ['MEAL'];
  const unknown = writeScope.filter(operation => allowed.indexOf(operation) === -1);
  if (unknown.length) throw new Error(`CONFIG_INVALID:RFORM_WRITE_SCOPE:${unknown.join(',')}`);

  return {
    environment,
    masterSpreadsheetId,
    timezone,
    trainingLegacyUrl,
    writeScope
  };
}

function prodMealMaster_(config) {
  const ss = SpreadsheetApp.openById(config.masterSpreadsheetId);
  const title = ss.getName();
  if (title !== RFORM_PROD_EXACT_MASTER_TITLE) {
    throw new Error(`SAFETY_GUARD:EXPECTED_PRODUCTION_DATASTORE:${title || 'UNKNOWN'}`);
  }
  return ss;
}

function prodMealAssertWriteAuthorized_(config, operation) {
  if (config.environment !== 'PRODUCTION') {
    throw new Error('WRITE_SCOPE_DENIED:ENVIRONMENT');
  }
  if (config.writeScope.indexOf(operation) === -1) {
    throw new Error(`WRITE_SCOPE_DENIED:${operation}`);
  }
}

function prodMealReadToday_(ss, dateKey, timezone) {
  const sheet = ss.getSheetByName('DAILY');
  if (!sheet) return { state: 'UNAVAILABLE', date: dateKey };
  const headers = prodMealHeaderMap_(sheet);
  prodMealRequireHeaders_(headers, [
    'Day_ID','Date','Day_Type','Morning_Weight','Weight_7D_Average',
    'Sleep_Hours','Sleep_Quality','Readiness','Calories_Plan_Min','Calories_Plan_Max',
    'Protein_Plan_Min','Protein_Plan_Max','Fat_Plan_Min','Fat_Plan_Max',
    'Carbs_Plan_Min','Carbs_Plan_Max','Day_Status'
  ], 'DAILY');

  const row = prodMealFindDateRow_(sheet, headers.Date, dateKey, timezone);
  if (!row) return { state: 'NOT_STARTED', date: dateKey };

  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const status = String(prodMealValue_(values, headers, 'Day_Status') || 'UNKNOWN').trim().toUpperCase();
  return {
    state: status === 'CLOSED' ? 'CLOSED' : status === 'OPEN' ? 'OPEN' : status,
    date: dateKey,
    dayId: String(prodMealValue_(values, headers, 'Day_ID') || '').trim(),
    dayType: String(prodMealValue_(values, headers, 'Day_Type') || '').trim(),
    morningWeight: prodMealNumberOrBlank_(prodMealValue_(values, headers, 'Morning_Weight')),
    weight7dAverage: prodMealNumberOrBlank_(prodMealValue_(values, headers, 'Weight_7D_Average')),
    sleepHours: prodMealNumberOrBlank_(prodMealValue_(values, headers, 'Sleep_Hours')),
    sleepQuality: prodMealNumberOrBlank_(prodMealValue_(values, headers, 'Sleep_Quality')),
    readiness: prodMealNumberOrBlank_(prodMealValue_(values, headers, 'Readiness')),
    nutritionPlan: {
      calories: prodMealRangePair_(values, headers, 'Calories_Plan_Min', 'Calories_Plan_Max'),
      protein: prodMealRangePair_(values, headers, 'Protein_Plan_Min', 'Protein_Plan_Max'),
      fat: prodMealRangePair_(values, headers, 'Fat_Plan_Min', 'Fat_Plan_Max'),
      carbs: prodMealRangePair_(values, headers, 'Carbs_Plan_Min', 'Carbs_Plan_Max')
    }
  };
}

function prodMealReadNutrition_(ss, today, dateKey, timezone) {
  const sheet = ss.getSheetByName('NUTRITION_DAILY');
  if (!sheet) return { status: 'UNAVAILABLE', date: dateKey, mealCount: 0 };
  const headers = prodMealHeaderMap_(sheet);
  prodMealRequireHeaders_(headers, [
    'Day_ID','Date','Meal_Count','Calories_Min','Calories_Max','Protein_Min','Protein_Max',
    'Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Status'
  ], 'NUTRITION_DAILY');

  let row = 0;
  if (today && today.dayId) row = prodMealFindExactRow_(sheet, headers.Day_ID, today.dayId);
  if (!row) row = prodMealFindDateRow_(sheet, headers.Date, dateKey, timezone);
  if (!row) return { status: 'MISSING', date: dateKey, mealCount: 0 };

  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  return {
    status: String(prodMealValue_(values, headers, 'Status') || 'UNKNOWN').trim().toUpperCase(),
    date: dateKey,
    mealCount: Number(prodMealValue_(values, headers, 'Meal_Count')) || 0,
    fact: {
      calories: prodMealRangePair_(values, headers, 'Calories_Min', 'Calories_Max'),
      protein: prodMealRangePair_(values, headers, 'Protein_Min', 'Protein_Max'),
      fat: prodMealRangePair_(values, headers, 'Fat_Min', 'Fat_Max'),
      carbs: prodMealRangePair_(values, headers, 'Carbs_Min', 'Carbs_Max')
    }
  };
}

function prodMealReadTraining_(ss, dateKey, timezone, configuredUrl) {
  const sheet = ss.getSheetByName('TRAINING_SESSIONS');
  if (!sheet) return { status: 'UNAVAILABLE', date: dateKey, launchAuthorized: false };
  const headers = prodMealHeaderMap_(sheet);
  prodMealRequireHeaders_(headers, ['Session_ID','Date','Session_Type','Session_Status'], 'TRAINING_SESSIONS');

  const row = prodMealFindDateRow_(sheet, headers.Date, dateKey, timezone);
  if (!row) {
    return {
      status: 'NONE',
      date: dateKey,
      legacyUrlConfigured: Boolean(configuredUrl),
      launchAuthorized: false
    };
  }
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  return {
    status: 'FOUND',
    date: dateKey,
    sessionId: String(prodMealValue_(values, headers, 'Session_ID') || '').trim(),
    sessionType: String(prodMealValue_(values, headers, 'Session_Type') || '').trim(),
    sessionStatus: String(prodMealValue_(values, headers, 'Session_Status') || '').trim(),
    legacyUrlConfigured: Boolean(configuredUrl),
    launchAuthorized: false,
    note: 'Training Mobile remains an independent production writer; launch is disabled in this RC.'
  };
}

function prodMealNutritionInput_(ss, today, config) {
  const catalog = ss.getSheetByName('FOOD_CATALOG');
  if (!catalog) throw new Error('SCHEMA_MISMATCH:FOOD_CATALOG:sheet_missing');
  const headers = prodMealHeaderMap_(catalog);
  prodMealRequireHeaders_(headers, [
    'Food_ID','Display_Name','Brand','Source_Type','Basis','Basis_Amount',
    'Calories','Protein','Fat','Carbs','Confidence','Verified_By_User',
    'Last_Used_At','Favorite','Status','Source_Reference','Record_Key','Duplicate_Flag'
  ], 'FOOD_CATALOG');

  const foods = [];
  const lastRow = catalog.getLastRow();
  if (lastRow >= 2) {
    const values = catalog.getRange(2, 1, lastRow - 1, catalog.getLastColumn()).getValues();
    values.forEach(row => {
      const foodId = String(prodMealValue_(row, headers, 'Food_ID') || '').trim();
      const status = String(prodMealValue_(row, headers, 'Status') || '').trim().toUpperCase();
      const verified = prodMealTruthy_(prodMealValue_(row, headers, 'Verified_By_User'));
      const duplicate = String(prodMealValue_(row, headers, 'Duplicate_Flag') || '').trim();
      if (!foodId || status !== 'ACTIVE' || !verified || duplicate) return;
      foods.push({
        foodId,
        displayName: String(prodMealValue_(row, headers, 'Display_Name') || '').trim(),
        brand: String(prodMealValue_(row, headers, 'Brand') || '').trim(),
        basis: String(prodMealValue_(row, headers, 'Basis') || '').trim(),
        basisAmount: Number(prodMealValue_(row, headers, 'Basis_Amount')) || 0,
        calories: Number(prodMealValue_(row, headers, 'Calories')) || 0,
        protein: Number(prodMealValue_(row, headers, 'Protein')) || 0,
        fat: Number(prodMealValue_(row, headers, 'Fat')) || 0,
        carbs: Number(prodMealValue_(row, headers, 'Carbs')) || 0,
        confidence: String(prodMealValue_(row, headers, 'Confidence') || '').trim(),
        sourceType: String(prodMealValue_(row, headers, 'Source_Type') || '').trim(),
        favorite: prodMealTruthy_(prodMealValue_(row, headers, 'Favorite')),
        lastUsedAt: prodMealSerializeDateTime_(prodMealValue_(row, headers, 'Last_Used_At'), config.timezone)
      });
    });
  }
  foods.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return String(a.displayName).localeCompare(String(b.displayName), 'ru');
  });

  return {
    status: !today || today.state === 'NOT_STARTED'
      ? 'DAY_NOT_STARTED'
      : today.state === 'CLOSED'
        ? 'DAY_CLOSED'
        : 'READY',
    allowedMealTypes: RFORM_PROD_MEAL_TYPES.slice(),
    suggestedMealType: prodMealSuggestType_(new Date(), config.timezone),
    defaultMealTime: Utilities.formatDate(new Date(), config.timezone, 'HH:mm'),
    foods,
    catalogCount: foods.length,
    catalogReady: foods.length > 0
  };
}

function prodMealFastPaths_(ss, foods, config) {
  const catalogMap = {};
  foods.forEach(food => { catalogMap[food.foodId] = food; });

  const raw = ss.getSheetByName('NUTRITION_RAW');
  const recentMeals = [];
  const recentFoods = [];
  if (raw) {
    const headers = prodMealHeaderMap_(raw);
    const required = ['Meal_ID','Meal_Time','Meal_Type','Amount','Unit','Source','Status','Duplicate_Flag','Created_At'];
    const missing = required.filter(name => !headers[name]);
    if (!missing.length && raw.getLastRow() >= 2) {
      const rows = raw.getRange(2, 1, raw.getLastRow() - 1, raw.getLastColumn()).getValues();
      const eligible = [];
      rows.forEach((row, index) => {
        const status = String(prodMealValue_(row, headers, 'Status') || '').trim().toUpperCase();
        const duplicate = String(prodMealValue_(row, headers, 'Duplicate_Flag') || '').trim();
        const source = String(prodMealValue_(row, headers, 'Source') || '').trim();
        const foodId = prodMealExtractFoodId_(source);
        const food = catalogMap[foodId];
        if (status === 'DELETED' || duplicate || !foodId || !food) return;
        const amount = Number(prodMealValue_(row, headers, 'Amount'));
        const unit = String(prodMealValue_(row, headers, 'Unit') || '').trim();
        const mealId = String(prodMealValue_(row, headers, 'Meal_ID') || '').trim();
        if (!mealId || !Number.isFinite(amount) || amount <= 0 || unit !== food.basis) return;
        eligible.push({
          row: index + 2,
          mealId,
          mealTime: prodMealSerializeTime_(prodMealValue_(row, headers, 'Meal_Time'), config.timezone),
          mealType: String(prodMealValue_(row, headers, 'Meal_Type') || '').trim(),
          foodId,
          displayName: food.displayName,
          brand: food.brand,
          amount,
          unit,
          createdAt: prodMealSerializeDateTime_(prodMealValue_(row, headers, 'Created_At'), config.timezone)
        });
      });

      const groups = {};
      eligible.forEach(item => {
        if (!groups[item.mealId]) {
          groups[item.mealId] = {
            mealId: item.mealId,
            mealTime: item.mealTime,
            mealType: item.mealType,
            createdAt: item.createdAt,
            lastRow: item.row,
            components: []
          };
        }
        groups[item.mealId].lastRow = Math.max(groups[item.mealId].lastRow, item.row);
        groups[item.mealId].components.push({
          foodId: item.foodId,
          displayName: item.displayName,
          brand: item.brand,
          amount: item.amount,
          unit: item.unit
        });
      });
      Object.keys(groups)
        .map(key => groups[key])
        .sort((a, b) => b.lastRow - a.lastRow)
        .slice(0, 3)
        .forEach(group => recentMeals.push(group));

      const seen = {};
      eligible.slice().reverse().forEach(item => {
        if (recentFoods.length >= 6 || seen[item.foodId]) return;
        seen[item.foodId] = true;
        recentFoods.push({
          foodId: item.foodId,
          displayName: item.displayName,
          brand: item.brand,
          amount: item.amount,
          unit: item.unit,
          mealId: item.mealId,
          mealTime: item.mealTime
        });
      });
    }
  }

  const favorites = foods.filter(food => food.favorite).map(food => ({
    foodId: food.foodId,
    displayName: food.displayName,
    brand: food.brand,
    basis: food.basis,
    basisAmount: food.basisAmount
  }));

  const templates = prodMealReadTemplates_(ss, catalogMap, config);
  return {
    recentMeals,
    recentFoods,
    favorites,
    templates,
    capabilities: {
      repeatRecentMeal: true,
      recentFoodPrefill: true,
      favoriteWrite: false,
      templateWrite: false,
      templateUse: true
    }
  };
}

function prodMealReadTemplates_(ss, catalogMap, config) {
  const sheet = ss.getSheetByName('MEAL_TEMPLATES');
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = prodMealHeaderMap_(sheet);
  prodMealRequireHeaders_(headers, [
    'Meal_Template_ID','Template_Name','Meal_Type','Component_Order',
    'Food_ID','Default_Amount','Unit','Status','Last_Used_At'
  ], 'MEAL_TEMPLATES');

  const groups = {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  rows.forEach(row => {
    const templateId = String(prodMealValue_(row, headers, 'Meal_Template_ID') || '').trim();
    const status = String(prodMealValue_(row, headers, 'Status') || '').trim().toUpperCase();
    if (!templateId || status !== 'ACTIVE') return;
    const foodId = String(prodMealValue_(row, headers, 'Food_ID') || '').trim();
    const food = catalogMap[foodId];
    const amount = Number(prodMealValue_(row, headers, 'Default_Amount'));
    const unit = String(prodMealValue_(row, headers, 'Unit') || '').trim();
    if (!food || !Number.isFinite(amount) || amount <= 0 || unit !== food.basis) return;
    if (!groups[templateId]) {
      groups[templateId] = {
        templateId,
        templateName: String(prodMealValue_(row, headers, 'Template_Name') || '').trim(),
        mealType: String(prodMealValue_(row, headers, 'Meal_Type') || '').trim(),
        lastUsedAt: prodMealSerializeDateTime_(prodMealValue_(row, headers, 'Last_Used_At'), config.timezone),
        components: []
      };
    }
    groups[templateId].components.push({
      order: Number(prodMealValue_(row, headers, 'Component_Order')) || 999,
      foodId,
      displayName: food.displayName,
      brand: food.brand,
      amount,
      unit
    });
  });

  return Object.keys(groups).map(key => {
    const group = groups[key];
    group.components.sort((a, b) => a.order - b.order);
    return group;
  }).sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)));
}

function prodMealValidatePayload_(payload, config) {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || eventDate !== today) {
    throw new Error('VALIDATION:EVENT_DATE_TODAY_ONLY');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(mealTime)) throw new Error('VALIDATION:MEAL_TIME');
  if (RFORM_PROD_MEAL_TYPES.indexOf(mealType) === -1) throw new Error('VALIDATION:MEAL_TYPE');
  if (source !== RFORM_PROD_MEAL_SOURCE) throw new Error('VALIDATION:SOURCE');
  if (!Array.isArray(payload.components) ||
      payload.components.length < 1 ||
      payload.components.length > RFORM_PROD_MEAL_MAX_COMPONENTS) {
    throw new Error('VALIDATION:COMPONENTS');
  }

  const seen = {};
  const components = payload.components.map((component, index) => {
    if (!component || typeof component !== 'object') {
      throw new Error(`VALIDATION:COMPONENT:${index + 1}`);
    }
    const foodId = String(component.foodId || '').trim();
    const unit = String(component.unit || '').trim();
    const amount = Number(component.amount);
    if (!foodId) throw new Error(`VALIDATION:FOOD_ID:${index + 1}`);
    if (!unit) throw new Error(`VALIDATION:UNIT:${index + 1}`);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      throw new Error(`VALIDATION:AMOUNT:${index + 1}`);
    }
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
    source: RFORM_PROD_MEAL_SOURCE
  };
}

function prodMealResolveCatalogFoods_(sheet, headers, foodIds) {
  const wanted = {};
  foodIds.forEach(id => { wanted[id] = true; });
  const found = {};
  if (sheet.getLastRow() < 2) return found;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  rows.forEach(row => {
    const foodId = String(prodMealValue_(row, headers, 'Food_ID') || '').trim();
    if (!wanted[foodId]) return;
    const status = String(prodMealValue_(row, headers, 'Status') || '').trim().toUpperCase();
    const verified = prodMealTruthy_(prodMealValue_(row, headers, 'Verified_By_User'));
    const duplicate = String(prodMealValue_(row, headers, 'Duplicate_Flag') || '').trim();
    if (status !== 'ACTIVE' || !verified || duplicate) return;
    found[foodId] = {
      foodId,
      displayName: String(prodMealValue_(row, headers, 'Display_Name') || '').trim(),
      brand: String(prodMealValue_(row, headers, 'Brand') || '').trim(),
      sourceType: String(prodMealValue_(row, headers, 'Source_Type') || '').trim(),
      basis: String(prodMealValue_(row, headers, 'Basis') || '').trim(),
      basisAmount: Number(prodMealValue_(row, headers, 'Basis_Amount')),
      calories: Number(prodMealValue_(row, headers, 'Calories')),
      protein: Number(prodMealValue_(row, headers, 'Protein')),
      fat: Number(prodMealValue_(row, headers, 'Fat')),
      carbs: Number(prodMealValue_(row, headers, 'Carbs')),
      confidence: String(prodMealValue_(row, headers, 'Confidence') || '').trim(),
      sourceReference: String(prodMealValue_(row, headers, 'Source_Reference') || '').trim()
    };
  });
  return found;
}

function prodMealCalculateComponent_(food, component, index) {
  if (!food.displayName) throw new Error(`VALIDATION:FOOD_NAME:${food.foodId}`);
  if (!Number.isFinite(food.basisAmount) || food.basisAmount <= 0) {
    throw new Error(`VALIDATION:BASIS_AMOUNT:${food.foodId}`);
  }
  if (!food.basis || component.unit !== food.basis) {
    throw new Error(`VALIDATION:UNIT_MISMATCH:${food.foodId}:${component.unit}:${food.basis || 'NONE'}`);
  }
  ['calories','protein','fat','carbs'].forEach(field => {
    if (!Number.isFinite(food[field]) || food[field] < 0) {
      throw new Error(`VALIDATION:CATALOG_${field.toUpperCase()}:${food.foodId}`);
    }
  });
  const factor = component.amount / food.basisAmount;
  return {
    index,
    foodId: food.foodId,
    displayName: food.displayName,
    brand: food.brand,
    amount: component.amount,
    unit: component.unit,
    calories: prodMealRound2_(food.calories * factor),
    protein: prodMealRound2_(food.protein * factor),
    fat: prodMealRound2_(food.fat * factor),
    carbs: prodMealRound2_(food.carbs * factor),
    estimationQuality: prodMealEstimationQuality_(food.sourceType),
    sourceReference: food.sourceReference,
    confidence: food.confidence
  };
}

function prodMealBuildRawRow_(row, recordNumber, dayId, input, component, mealId, now, sheetDateSerial, mealTimeSerial) {
  const values = new Array(25).fill('');
  values[0] = `F-${String(input.eventDate).replace(/-/g, '')}-${String(recordNumber).padStart(6, '0')}`;
  values[1] = dayId;
  values[2] = sheetDateSerial;
  values[3] = mealId;
  values[4] = mealTimeSerial;
  values[5] = input.mealType;
  values[6] = component.brand ? `${component.displayName} — ${component.brand}` : component.displayName;
  values[7] = prodMealNormalizeFoodName_(component.displayName);
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

function prodMealBuildDailyFormulaRow_(row, sheetDateSerial) {
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

function prodMealBuildInboxRow_(row, inboxId, dayId, input, components, mealId, now, sheetDateSerial) {
  const values = new Array(18).fill('');
  const total = prodMealSumComponents_(components);
  values[0] = inboxId;
  values[1] = now;
  values[2] = sheetDateSerial;
  values[3] = 'MEAL';
  values[4] = prodMealRawMessage_(input, components, total);
  values[5] = 'NUTRITION_MEAL';
  values[6] = 'NUTRITION_RAW';
  values[7] = `${dayId}|${mealId}`;
  values[8] = 'VALID';
  values[10] = 'APPLIED';
  values[11] = now;
  values[12] = 'OWNER';
  values[13] = RFORM_PROD_MEAL_SOURCE;
  values[14] = RFORM_PROD_MEAL_VERSION;
  values[16] = `=IF(A${row}="";"";IF(COUNTIF($A$2:$A$5000;A${row})>1;"DUPLICATE";""))`;
  values[17] = `R/Form Mobile production MEAL-only RC ${RFORM_PROD_MEAL_VERSION}. ` +
    `Component-level MEAL: ${components.length} component(s), Meal_ID ${mealId}. ` +
    'КБЖУ calculated server-side from verified FOOD_CATALOG. ' +
    'NUTRITION_DAILY remains formula-owned. Training Mobile writer is unchanged.';
  return values;
}

function prodMealRawMessage_(input, components, total) {
  const foods = components.map(component =>
    `${component.displayName} ${component.amount} ${component.unit}`
  ).join('; ');
  return `${input.mealType} ${input.mealTime}: ${foods}. Итого: ` +
    `${prodMealAuditNumber_(total.calories)} ккал / Б ${prodMealAuditNumber_(total.protein)} г / ` +
    `Ж ${prodMealAuditNumber_(total.fat)} г / У ${prodMealAuditNumber_(total.carbs)} г.`;
}

function prodMealNextMealId_(sheet, headers, dateKey) {
  let max = 0;
  if (sheet.getLastRow() >= 2) {
    const values = sheet.getRange(2, headers.Meal_ID, sheet.getLastRow() - 1, 1).getDisplayValues();
    const prefix = `${dateKey}_M`;
    values.forEach(row => {
      const value = String(row[0] || '');
      if (value.indexOf(prefix) !== 0) return;
      const number = Number(value.slice(prefix.length));
      if (Number.isInteger(number) && number > max) max = number;
    });
  }
  return `${dateKey}_M${max + 1}`;
}

function prodMealNextFoodRecordNumber_(sheet, headers) {
  let max = 0;
  if (sheet.getLastRow() >= 2) {
    const values = sheet.getRange(2, headers.Food_Record_ID, sheet.getLastRow() - 1, 1).getDisplayValues();
    values.forEach(row => {
      const match = String(row[0] || '').match(/^F-\d{8}-(\d{6})$/);
      if (!match) return;
      const number = Number(match[1]);
      if (Number.isInteger(number) && number > max) max = number;
    });
  }
  return max + 1;
}

function prodMealHeaderMap_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return {};
  return sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].reduce((map, value, index) => {
    const key = String(value || '').trim();
    if (key) map[key] = index + 1;
    return map;
  }, {});
}

function prodMealRequireHeaders_(headers, required, sheetName) {
  const missing = required.filter(name => !headers[name]);
  if (missing.length) throw new Error(`SCHEMA_MISMATCH:${sheetName}:${missing.join(',')}`);
}

function prodMealFindDateRow_(sheet, column, dateKey, timezone) {
  const lastRow = sheet.getLastRow();
  if (!column || lastRow < 2) return 0;
  const values = sheet.getRange(2, column, lastRow - 1, 1).getValues();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (prodMealNormalizeDate_(values[index][0], timezone) === dateKey) return index + 2;
  }
  return 0;
}

function prodMealFindExactRow_(sheet, column, expected) {
  const lastRow = sheet.getLastRow();
  if (!column || lastRow < 2) return 0;
  const values = sheet.getRange(2, column, lastRow - 1, 1).getDisplayValues();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (String(values[index][0] || '').trim() === String(expected || '').trim()) return index + 2;
  }
  return 0;
}

function prodMealNormalizeDate_(value, timezone) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const ru = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : text;
}

function prodMealValue_(row, headers, name) {
  const column = headers[name];
  return column ? row[column - 1] : '';
}

function prodMealRangePair_(row, headers, minHeader, maxHeader) {
  return {
    min: prodMealNumberOrBlank_(prodMealValue_(row, headers, minHeader)),
    max: prodMealNumberOrBlank_(prodMealValue_(row, headers, maxHeader))
  };
}

function prodMealNumberOrBlank_(value) {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function prodMealEnsureRows_(sheet, targetLastRow) {
  if (targetLastRow <= sheet.getMaxRows()) return;
  sheet.insertRowsAfter(sheet.getMaxRows(), targetLastRow - sheet.getMaxRows());
}

function prodMealPrepareRowsLikePrevious_(sheet, firstRow, rowCount) {
  const sourceRow = firstRow > 2 ? firstRow - 1 : 2;
  if (sourceRow > sheet.getMaxRows()) return;
  const source = sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn());
  const target = sheet.getRange(firstRow, 1, rowCount, sheet.getLastColumn());
  source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
}

function prodMealDateParts_(dateKey) {
  const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('VALIDATION:DATE_KEY');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function prodMealDateSerial_(dateKey) {
  const parts = prodMealDateParts_(dateKey);
  const epoch = Date.UTC(1899, 11, 30);
  const value = Date.UTC(parts.year, parts.month - 1, parts.day);
  return Math.round((value - epoch) / 86400000);
}

function prodMealVerifyDateCell_(range, expectedSerial, timezone, label) {
  const value = range.getValue();
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    const dateKey = Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
    const timeKey = Utilities.formatDate(value, timezone, 'HH:mm:ss');
    if (prodMealDateSerial_(dateKey) !== expectedSerial || timeKey !== '00:00:00') {
      throw new Error(`VERIFY_FAILED:${label}`);
    }
    return;
  }
  const serial = Number(value);
  if (!Number.isFinite(serial) || !Number.isInteger(serial) || serial !== expectedSerial) {
    throw new Error(`VERIFY_FAILED:${label}`);
  }
}

function prodMealTimeFraction_(timeText) {
  const match = String(timeText).match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error('VALIDATION:MEAL_TIME');
  return (Number(match[1]) * 60 + Number(match[2])) / 1440;
}

function prodMealSuggestType_(date, timezone) {
  const hour = Number(Utilities.formatDate(date, timezone, 'H'));
  if (hour < 11) return 'BREAKFAST';
  if (hour < 15) return 'LUNCH';
  if (hour < 18) return 'SNACK';
  if (hour < 22) return 'DINNER';
  return 'LATE_SNACK';
}

function prodMealEstimationQuality_(sourceType) {
  const value = String(sourceType || '').trim().toUpperCase();
  if (['EXACT_LABEL','STANDARD_DATABASE','RECIPE_CALCULATED','ESTIMATED','PHOTO_ESTIMATE'].indexOf(value) !== -1) {
    return value;
  }
  return 'ESTIMATED';
}

function prodMealNormalizeFoodName_(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/[|]+/g, '_');
}

function prodMealTruthy_(value) {
  if (value === true) return true;
  return ['TRUE','YES','1','ДА'].indexOf(String(value || '').trim().toUpperCase()) !== -1;
}

function prodMealSerializeDateTime_(value, timezone) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, timezone, "yyyy-MM-dd'T'HH:mm:ss");
  }
  return value ? String(value) : '';
}

function prodMealSerializeTime_(value, timezone) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, timezone, 'HH:mm');
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const minutes = Math.round((value % 1) * 1440);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  return String(value || '');
}

function prodMealExtractFoodId_(source) {
  const match = String(source || '').match(/FOOD_CATALOG:(FOOD-[A-Za-z0-9_-]+)/);
  return match ? match[1] : '';
}

function prodMealSumComponents_(components) {
  return components.reduce((sum, component) => {
    sum.calories += component.calories;
    sum.protein += component.protein;
    sum.fat += component.fat;
    sum.carbs += component.carbs;
    return sum;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
}

function prodMealRound2_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function prodMealAuditNumber_(value) {
  return String(prodMealRound2_(value)).replace('.', ',');
}
