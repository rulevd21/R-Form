'use strict';

function doGet() {
  const base = HtmlService.createHtmlOutputFromFile('Index').getContent();
  const trainingControls = HtmlService.createHtmlOutputFromFile('TrainingExerciseControls').getContent();
  const html = base.indexOf('</body>') >= 0
    ? base.replace('</body>', `${trainingControls}\n</body>`)
    : `${base}\n${trainingControls}`;

  return HtmlService.createHtmlOutput(html)
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
      trainingStructuredChanges: true,
      measurements: false,
      dayClose: false
    }
  };
}
