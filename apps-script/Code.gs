'use strict';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('R/Form Mobile — Sandbox');
}

function getAppBootstrap() {
  const config = getConfig_();
  return {
    appName: 'R/Form Mobile',
    environment: 'SANDBOX',
    appVersion: config.appVersion,
    dataSchemaVersion: config.dataSchemaVersion,
    timezone: config.timezone,
    today: getTodayDateKey_(),
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
