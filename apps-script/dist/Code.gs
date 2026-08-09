'use strict';

const RFORM_CONFIG_KEYS = Object.freeze({
  MASTER_SPREADSHEET_ID: 'MASTER_SPREADSHEET_ID',
  APP_VERSION: 'APP_VERSION',
  DATA_SCHEMA_VERSION: 'DATA_SCHEMA_VERSION',
  TRAINING_LEGACY_URL: 'TRAINING_LEGACY_URL',
  APP_TIMEZONE: 'APP_TIMEZONE'
});

const RFORM_SANDBOX_TITLE_PREFIX = 'RFORM_MASTER_DATA_SANDBOX_';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('R/Form Mobile — Sandbox');
}

function getAppBootstrap() {
  return buildAppBootstrap_(getConfig_());
}

function getPhase1BootstrapState() {
  const config = getConfig_();
  const today = getDayStateByDate_(Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd'));
  return {
    app: buildAppBootstrap_(config),
    today,
    training: buildTrainingLaunchState_(today, config)
  };
}

function buildAppBootstrap_(config) {
  return {
    appName: 'R/Form Mobile',
    environment: 'SANDBOX',
    appVersion: config.appVersion,
    dataSchemaVersion: config.dataSchemaVersion,
    timezone: config.timezone,
    today: Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd'),
    readOnly: true,
    modules: {
      today: true,
      nutrition: false,
      trainingLegacy: true,
      measurements: false,
      dayClose: false
    }
  };
}

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  const config = {
    masterSpreadsheetId: props.getProperty(RFORM_CONFIG_KEYS.MASTER_SPREADSHEET_ID),
    appVersion: props.getProperty(RFORM_CONFIG_KEYS.APP_VERSION) || '0.1.0-sandbox',
    dataSchemaVersion: props.getProperty(RFORM_CONFIG_KEYS.DATA_SCHEMA_VERSION) || 'RFORM_MASTER_DATA_v1',
    trainingLegacyUrl: props.getProperty(RFORM_CONFIG_KEYS.TRAINING_LEGACY_URL) || '',
    timezone: props.getProperty(RFORM_CONFIG_KEYS.APP_TIMEZONE) || Session.getScriptTimeZone() || 'Europe/Moscow'
  };
  if (!config.masterSpreadsheetId) throw new Error('CONFIG_MISSING: MASTER_SPREADSHEET_ID');
  return config;
}

function getMasterSpreadsheet_() {
  const config = getConfig_();
  const spreadsheet = SpreadsheetApp.openById(config.masterSpreadsheetId);
  const title = spreadsheet.getName();
  if (!title || title.indexOf(RFORM_SANDBOX_TITLE_PREFIX) !== 0) {
    throw new Error(`SAFETY_GUARD:EXPECTED_SANDBOX_DATASTORE:${title || 'UNKNOWN'}`);
  }
  return spreadsheet;
}

function getHeaderMap_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return {};
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  return headers.reduce((map, value, index) => {
    if (value) map[value] = index + 1;
    return map;
  }, {});
}

function requireHeaders_(headerMap, requiredHeaders, sheetName) {
  const missing = requiredHeaders.filter(name => !headerMap[name]);
  if (missing.length) throw new Error(`SCHEMA_MISMATCH:${sheetName}:${missing.join(',')}`);
}

function normalizeDateKey_(value, timezone) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const ru = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  return text;
}

function getTodayDateKey_() {
  const config = getConfig_();
  return Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
}

function getTodayState() {
  return getDayStateByDate_(getTodayDateKey_());
}

function getDayStateByDate_(dateKey) {
  const config = getConfig_();
  const ss = getMasterSpreadsheet_();
  const daily = ss.getSheetByName('DAILY');
  if (!daily) throw new Error('SCHEMA_MISMATCH:DAILY:sheet_missing');

  const dailyHeaders = getHeaderMap_(daily);
  const requiredDaily = [
    'Day_ID','Date','Day_Type','Morning_Weight','Weight_7D_Average','Sleep_Hours',
    'Sleep_Quality','Readiness','Steps','Shoulder_Pain','Elbow_Pain','Other_Pain',
    'Calories_Plan_Min','Calories_Plan_Max','Protein_Plan_Min','Protein_Plan_Max',
    'Fat_Plan_Min','Fat_Plan_Max','Carbs_Plan_Min','Carbs_Plan_Max','Day_Status'
  ];
  requireHeaders_(dailyHeaders, requiredDaily, 'DAILY');

  const dailyRow = findRowByDate_(daily, dailyHeaders.Date, dateKey, config.timezone);
  if (!dailyRow) {
    return {
      date: dateKey,
      state: 'NOT_STARTED',
      day: null,
      nutrition: null,
      training: getTrainingStateByDate_(ss, dateKey, '', config),
      server: getServerMeta_(config)
    };
  }

  const dailyValues = daily.getRange(dailyRow, 1, 1, daily.getLastColumn()).getValues()[0];
  const dayId = valueByHeader_(dailyValues, dailyHeaders, 'Day_ID');
  const day = {
    dayId,
    date: dateKey,
    dayType: valueByHeader_(dailyValues, dailyHeaders, 'Day_Type'),
    morningWeight: valueByHeader_(dailyValues, dailyHeaders, 'Morning_Weight'),
    weight7dAverage: valueByHeader_(dailyValues, dailyHeaders, 'Weight_7D_Average'),
    sleepHours: valueByHeader_(dailyValues, dailyHeaders, 'Sleep_Hours'),
    sleepQuality: valueByHeader_(dailyValues, dailyHeaders, 'Sleep_Quality'),
    readiness: valueByHeader_(dailyValues, dailyHeaders, 'Readiness'),
    steps: valueByHeader_(dailyValues, dailyHeaders, 'Steps'),
    pain: {
      shoulder: valueByHeader_(dailyValues, dailyHeaders, 'Shoulder_Pain'),
      elbow: valueByHeader_(dailyValues, dailyHeaders, 'Elbow_Pain'),
      other: valueByHeader_(dailyValues, dailyHeaders, 'Other_Pain')
    },
    nutritionPlan: {
      calories: rangePair_(dailyValues, dailyHeaders, 'Calories_Plan_Min', 'Calories_Plan_Max'),
      protein: rangePair_(dailyValues, dailyHeaders, 'Protein_Plan_Min', 'Protein_Plan_Max'),
      fat: rangePair_(dailyValues, dailyHeaders, 'Fat_Plan_Min', 'Fat_Plan_Max'),
      carbs: rangePair_(dailyValues, dailyHeaders, 'Carbs_Plan_Min', 'Carbs_Plan_Max')
    },
    status: valueByHeader_(dailyValues, dailyHeaders, 'Day_Status') || 'UNKNOWN'
  };

  return {
    date: dateKey,
    state: day.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    day,
    nutrition: getNutritionStateByDayId_(ss, dayId),
    training: getTrainingStateByDate_(ss, dateKey, dayId, config),
    server: getServerMeta_(config)
  };
}

function getNutritionStateByDayId_(ss, dayId) {
  if (!dayId) return null;
  const sheet = ss.getSheetByName('NUTRITION_DAILY');
  if (!sheet) return null;
  const headers = getHeaderMap_(sheet);
  const required = ['Day_ID','Meal_Count','Calories_Min','Calories_Max','Protein_Min','Protein_Max','Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Plan_Status','Status'];
  requireHeaders_(headers, required, 'NUTRITION_DAILY');
  const row = findRowByExactValue_(sheet, headers.Day_ID, dayId);
  if (!row) return { mealCount: 0, fact: null, planStatus: '', status: 'MISSING' };
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  return {
    mealCount: valueByHeader_(values, headers, 'Meal_Count') || 0,
    fact: {
      calories: rangePair_(values, headers, 'Calories_Min', 'Calories_Max'),
      protein: rangePair_(values, headers, 'Protein_Min', 'Protein_Max'),
      fat: rangePair_(values, headers, 'Fat_Min', 'Fat_Max'),
      carbs: rangePair_(values, headers, 'Carbs_Min', 'Carbs_Max')
    },
    planStatus: valueByHeader_(values, headers, 'Plan_Status'),
    status: valueByHeader_(values, headers, 'Status') || 'UNKNOWN'
  };
}

function getTrainingStateByDate_(ss, dateKey, dayId, config) {
  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  if (!sessions) return { required: false, status: 'UNAVAILABLE', launchAvailable: false };
  const headers = getHeaderMap_(sessions);
  const required = ['Session_ID','Day_ID','Date','Training_Code','Plan_Status','Session_Status'];
  requireHeaders_(headers, required, 'TRAINING_SESSIONS');

  let row = dayId ? findRowByExactValue_(sessions, headers.Day_ID, dayId) : 0;
  if (!row) row = findRowByDate_(sessions, headers.Date, dateKey, config.timezone);
  if (row) {
    const values = sessions.getRange(row, 1, 1, sessions.getLastColumn()).getValues()[0];
    return {
      required: true,
      sessionId: valueByHeader_(values, headers, 'Session_ID'),
      trainingCode: valueByHeader_(values, headers, 'Training_Code'),
      planStatus: valueByHeader_(values, headers, 'Plan_Status'),
      status: valueByHeader_(values, headers, 'Session_Status') || 'UNKNOWN',
      launchAvailable: Boolean(config.trainingLegacyUrl)
    };
  }

  const planned = getPlannedTrainingByDate_(ss, dateKey, config.timezone);
  if (!planned) return { required: false, status: 'NOT_REQUIRED', launchAvailable: false };
  return {
    required: true,
    sessionId: planned.sessionId,
    trainingCode: planned.trainingCode,
    planStatus: 'PLANNED',
    status: 'NOT_STARTED',
    launchAvailable: Boolean(config.trainingLegacyUrl)
  };
}

function getPlannedTrainingByDate_(ss, dateKey, timezone) {
  const sheet = ss.getSheetByName('TRAINING_PLAN');
  if (!sheet) return null;
  const headers = getHeaderMap_(sheet);
  requireHeaders_(headers, ['Date','Session_ID'], 'TRAINING_PLAN');
  const row = findRowByDate_(sheet, headers.Date, dateKey, timezone);
  if (!row) return null;
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  return {
    sessionId: valueByHeader_(values, headers, 'Session_ID'),
    trainingCode: headers.Session_Type ? valueByHeader_(values, headers, 'Session_Type') : ''
  };
}

function findRowByDate_(sheet, column, dateKey, timezone) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, column, lastRow - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (normalizeDateKey_(values[i][0], timezone) === dateKey) return i + 2;
  }
  return 0;
}

function findRowByExactValue_(sheet, column, expected) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, column, lastRow - 1, 1).getDisplayValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i][0] === String(expected)) return i + 2;
  }
  return 0;
}

function valueByHeader_(rowValues, headerMap, header) {
  const column = headerMap[header];
  return column ? rowValues[column - 1] : '';
}

function rangePair_(rowValues, headerMap, minHeader, maxHeader) {
  return {
    min: valueByHeader_(rowValues, headerMap, minHeader),
    max: valueByHeader_(rowValues, headerMap, maxHeader)
  };
}

function getServerMeta_(config) {
  return {
    appVersion: config.appVersion,
    dataSchemaVersion: config.dataSchemaVersion,
    readOnly: true,
    timezone: config.timezone
  };
}

function getTrainingLaunchState() {
  const config = getConfig_();
  const today = getDayStateByDate_(Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd'));
  return buildTrainingLaunchState_(today, config);
}

function buildTrainingLaunchState_(today, config) {
  const training = today.training || { required: false, status: 'NOT_REQUIRED' };
  return {
    required: Boolean(training.required),
    sessionId: training.sessionId || '',
    trainingCode: training.trainingCode || '',
    status: training.status || 'UNKNOWN',
    planStatus: training.planStatus || '',
    launchAvailable: Boolean(training.required && config.trainingLegacyUrl),
    legacyUrl: training.required && config.trainingLegacyUrl ? config.trainingLegacyUrl : '',
    adapter: 'TrainingAdapterLegacyV21',
    mode: 'READ_ONLY_LAUNCH',
    productionWriterChanged: false
  };
}
