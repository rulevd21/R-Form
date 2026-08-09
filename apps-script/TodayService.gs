'use strict';

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
  if (!row) {
    return {
      mealCount: 0,
      fact: null,
      planStatus: '',
      status: 'MISSING'
    };
  }
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
  const required = ['Session_ID','Day_ID','Date','Session_Type','Plan_Status','Session_Status'];
  requireHeaders_(headers, required, 'TRAINING_SESSIONS');

  let row = dayId ? findRowByExactValue_(sessions, headers.Day_ID, dayId) : 0;
  if (!row) row = findRowByDate_(sessions, headers.Date, dateKey, config.timezone);

  if (row) {
    const values = sessions.getRange(row, 1, 1, sessions.getLastColumn()).getValues()[0];
    return {
      required: true,
      sessionId: valueByHeader_(values, headers, 'Session_ID'),
      trainingCode: valueByHeader_(values, headers, 'Session_Type'),
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
  const required = ['Date','Session_ID','Session_Type'];
  requireHeaders_(headers, required, 'TRAINING_PLAN');
  const row = findRowByDate_(sheet, headers.Date, dateKey, timezone);
  if (!row) return null;
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  return {
    sessionId: valueByHeader_(values, headers, 'Session_ID'),
    trainingCode: valueByHeader_(values, headers, 'Session_Type')
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
