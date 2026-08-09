'use strict';

const RFORM_CONFIG_KEYS = Object.freeze({
  MASTER_SPREADSHEET_ID: 'MASTER_SPREADSHEET_ID',
  APP_VERSION: 'APP_VERSION',
  DATA_SCHEMA_VERSION: 'DATA_SCHEMA_VERSION',
  TRAINING_LEGACY_URL: 'TRAINING_LEGACY_URL',
  APP_TIMEZONE: 'APP_TIMEZONE'
});

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  const config = {
    masterSpreadsheetId: props.getProperty(RFORM_CONFIG_KEYS.MASTER_SPREADSHEET_ID),
    appVersion: props.getProperty(RFORM_CONFIG_KEYS.APP_VERSION) || '0.1.0-sandbox',
    dataSchemaVersion: props.getProperty(RFORM_CONFIG_KEYS.DATA_SCHEMA_VERSION) || 'RFORM_MASTER_DATA_v1',
    trainingLegacyUrl: props.getProperty(RFORM_CONFIG_KEYS.TRAINING_LEGACY_URL) || '',
    timezone: props.getProperty(RFORM_CONFIG_KEYS.APP_TIMEZONE) || Session.getScriptTimeZone() || 'Europe/Moscow'
  };

  if (!config.masterSpreadsheetId) {
    throw new Error('CONFIG_MISSING: MASTER_SPREADSHEET_ID');
  }

  return config;
}

function getMasterSpreadsheet_() {
  const config = getConfig_();
  return SpreadsheetApp.openById(config.masterSpreadsheetId);
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
  if (missing.length) {
    throw new Error(`SCHEMA_MISMATCH:${sheetName}:${missing.join(',')}`);
  }
}

function normalizeDateKey_(value, timezone) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const ru = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  return text;
}

function getTodayDateKey_() {
  const config = getConfig_();
  return Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
}
