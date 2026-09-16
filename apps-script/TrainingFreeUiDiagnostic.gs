'use strict';

function runTrainingFreeUiDiagnostic() {
  const checks = [];
  const add = (name, status, detail) => {
    checks.push({ name, status, detail: detail === undefined ? '' : detail });
  };

  let freeHtml = '';
  try {
    freeHtml = HtmlService.createHtmlOutputFromFile('TrainingFreeSession').getContent();
    add(
      'TrainingFreeSession.html is readable',
      freeHtml ? 'PASS' : 'FAIL',
      freeHtml ? `${freeHtml.length} chars` : 'empty'
    );
    add(
      'FREE sheet markup exists',
      freeHtml.indexOf('id="freeTrainingSheet"') >= 0 ? 'PASS' : 'FAIL',
      'freeTrainingSheet'
    );
    add(
      'FREE launcher code exists',
      freeHtml.indexOf('freeTrainingLauncher') >= 0 ? 'PASS' : 'FAIL',
      'freeTrainingLauncher'
    );
    add(
      'FREE bootstrap gateway call exists',
      freeHtml.indexOf('getTrainingFreeClientBootstrap') >= 0 ? 'PASS' : 'FAIL',
      'getTrainingFreeClientBootstrap'
    );
  } catch (e) {
    add('TrainingFreeSession.html is readable', 'FAIL', String(e && e.message || e));
  }

  let outputHtml = '';
  try {
    outputHtml = doGet().getContent();
    add(
      'doGet() renders HTML',
      outputHtml ? 'PASS' : 'FAIL',
      outputHtml ? `${outputHtml.length} chars` : 'empty'
    );
    add(
      'doGet output contains FREE sheet',
      outputHtml.indexOf('id="freeTrainingSheet"') >= 0 ? 'PASS' : 'FAIL',
      'freeTrainingSheet'
    );
    add(
      'doGet output contains FREE launcher code',
      outputHtml.indexOf('freeTrainingLauncher') >= 0 ? 'PASS' : 'FAIL',
      'freeTrainingLauncher'
    );
    add(
      'doGet output still contains legacy training button',
      outputHtml.indexOf('id="trainingButton"') >= 0 ? 'PASS' : 'FAIL',
      'trainingButton'
    );
  } catch (e) {
    add('doGet() renders HTML', 'FAIL', String(e && e.message || e));
  }

  const failed = checks.filter(x => x.status !== 'PASS').length;
  const result = {
    status: failed ? 'FAIL' : 'PASS',
    gate: 'FREE-03-UI-INJECTION',
    failed,
    total: checks.length,
    checks
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}
