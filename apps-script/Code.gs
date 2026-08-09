'use strict';

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
