'use strict';

function doGet() {
  const base = HtmlService.createHtmlOutputFromFile('Index').getContent();
  const trainingControls = HtmlService.createHtmlOutputFromFile('TrainingExerciseControls').getContent();
  const freeTraining = HtmlService.createHtmlOutputFromFile('TrainingFreeSession').getContent();

  // Visual layer only. If it is missing, keep the sandbox operational.
  let trainingTheme = '';
  try {
    trainingTheme = HtmlService.createHtmlOutputFromFile('RFormTrainingThemeV22').getContent();
  } catch (error) {
    console.warn('RFormTrainingThemeV22 unavailable: ' + (error && error.message ? error.message : error));
  }

  const injected = `${trainingControls}\n${freeTraining}\n${trainingTheme}`;
  const html = base.indexOf('</body>') >= 0
    ? base.replace('</body>', `${injected}\n</body>`)
    : `${base}\n${injected}`;

  return HtmlService.createHtmlOutput(html)
    .setTitle('R/Form Training — Sandbox');
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
      trainingFree: true,
      measurements: false,
      dayClose: false
    }
  };
}
