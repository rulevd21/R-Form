/** Read-only тесты и dry-run. */
var RFormTests = (function() {
  'use strict';

  function duplicateReport_(sheetName, fieldName) {
    var rows = RFormSheetRepository.readObjects(sheetName);
    if (sheetName === RFormConfig.SHEETS.TRAINING_PLAN && fieldName === 'Record_Key') {
      var report = RFormRecoveryPolicy.planIdentityReport(rows);
      return report.duplicateVersionKeys.map(function(key) { return 'VERSION:' + key; })
        .concat(report.duplicateActiveKeys.map(function(key) { return 'ACTIVE:' + key; }))
        .concat(report.missingVersionIds.map(function(id) { return 'MISSING_PLAN_ID:' + id; }));
    }
    var values = rows.map(function(row) {
      return RFormUtils.normalizeString(row[fieldName]);
    }).filter(Boolean);
    return RFormUtils.duplicateValues(values);
  }

  function runSetup() {
    RFormSecurityService.assertSpreadsheetIdentity();
    var ss = RFormSheetRepository.getSpreadsheet();
    var schema = RFormSchemaService.inspectAll();
    var plan = RFormPlanService.getActiveRows(true);
    var sessions = RFormPlanService.getSessionOptions(plan);

    var readSchemaOk = schema.every(function(item) { return item.okForRead; });
    var writeTargets = [
      RFormConfig.SHEETS.TRAINING_SETS,
      RFormConfig.SHEETS.TRAINING_SESSIONS,
      RFormConfig.SHEETS.DAILY,
      RFormConfig.SHEETS.INBOX_LOG,
      RFormConfig.SHEETS.QA_LOG
    ];
    var writeSchemaOk = schema.filter(function(item) {
      return writeTargets.indexOf(item.sheet) !== -1;
    }).every(function(item) { return item.okForWrite; });
    var inboxAppliedBy = String(RFormConfig.INBOX_APPLIED_BY || '');
    var inboxAppliedByValid = RFormDictionaryService.contains(
      'OWNER_ROLE',
      inboxAppliedBy
    );

    return {
      ok: readSchemaOk,
      writeContractOk: writeSchemaOk && inboxAppliedByValid,
      appVersion: RFormConfig.APP_VERSION,
      spreadsheet: ss.getName(),
      spreadsheetIdMasked: RFormUtils.maskId(ss.getId()),
      timeZone: ss.getSpreadsheetTimeZone(),
      writeEnabled: RFormSecurityService.isWriteEnabled(),
      inboxAppliedBy: inboxAppliedBy,
      inboxAppliedByValid: inboxAppliedByValid,
      activePlanSets: plan.length,
      activeSessions: sessions.length,
      schema: schema
    };
  }

  function runSafetyBaseline() {
    var setup = runSetup();
    var duplicateChecks = [
      [RFormConfig.SHEETS.TRAINING_PLAN, 'Plan_Set_ID'],
      [RFormConfig.SHEETS.TRAINING_PLAN, 'Record_Key'],
      [RFormConfig.SHEETS.TRAINING_SETS, 'Set_ID'],
      [RFormConfig.SHEETS.TRAINING_SETS, 'Record_Key'],
      [RFormConfig.SHEETS.TRAINING_SESSIONS, 'Session_ID'],
      [RFormConfig.SHEETS.DAILY, 'Day_ID'],
      [RFormConfig.SHEETS.INBOX_LOG, 'Inbox_Event_ID'],
      [RFormConfig.SHEETS.QA_LOG, 'QA_ID']
    ].map(function(pair) {
      return {
        sheet: pair[0],
        field: pair[1],
        duplicates: duplicateReport_(pair[0], pair[1])
      };
    });

    var criticalDuplicates = duplicateChecks.filter(function(item) {
      return item.duplicates.length > 0;
    });

    return {
      ok: setup.ok && setup.writeContractOk && criticalDuplicates.length === 0,
      setup: setup,
      duplicateChecks: duplicateChecks,
      qa: RFormQualityService.getOpenSummary(),
      note: 'Тест работает только на чтение и не изменяет master-файл.'
    };
  }

  function runPureFunctions() {
    var failures = [];
    function check(name, condition) {
      if (!condition) failures.push(name);
    }

    check('number comma', RFormUtils.toNumberOrBlank('77,5') === 77.5);
    check('blank number', RFormUtils.toNumberOrBlank('') === '');
    check('date parse', RFormUtils.dateKeyFromAny('05.08.2026') === '2026-08-05');
    var normalizedDate = RFormUtils.parseDateKey('2026-08-07');
    check(
      'date roundtrip',
      Utilities.formatDate(
        normalizedDate,
        RFormConfig.TIME_ZONE,
        'yyyy-MM-dd'
      ) === '2026-08-07'
    );
    check(
      'date midnight',
      Utilities.formatDate(
        normalizedDate,
        RFormConfig.TIME_ZONE,
        'HH:mm:ss'
      ) === '00:00:00'
    );
    check('stable revision',
      RFormUtils.revision('X', { b: 2, a: 1 }) ===
      RFormUtils.revision('X', { a: 1, b: 2 })
    );

    var deviation = RFormSetService.describeDeviation(
      { planWeight: 75, planReps: 4, planRir: 3 },
      { actualKg: 77.5, actualReps: 4, actualRir: 2 }
    );
    check('deviation weight', deviation.indexOf('вес +2,5 кг') !== -1);
    check('deviation rir', deviation.indexOf('тяжелее цели на 1 RIR') !== -1);

    return { ok: failures.length === 0, failures: failures };
  }

  function inspectDateNormalization(dateKey) {
    var key = RFormUtils.normalizeString(dateKey || '2026-08-07');
    var parsed = RFormUtils.parseDateKey(key);
    return {
      input: key,
      timeZone: RFormConfig.TIME_ZONE,
      iso: parsed.toISOString(),
      localDate: Utilities.formatDate(parsed, RFormConfig.TIME_ZONE, 'yyyy-MM-dd'),
      localTime: Utilities.formatDate(parsed, RFormConfig.TIME_ZONE, 'HH:mm:ss'),
      localDateTime: Utilities.formatDate(parsed, RFormConfig.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss')
    };
  }

  function testDateNormalization(dateKey) {
  var result = RFormTests.inspectDateNormalization(dateKey);
  console.log(JSON.stringify(result));
  return result;
}

function previewSetMutation(sessionId, planSetId, actualKg, actualReps, actualRir) {
    RFormSecurityService.assertSpreadsheetIdentity();
    var plan = RFormPlanService.getPlanSet(sessionId, planSetId, true);
    var existingRows = RFormSheetRepository.findRowsByExactValue(
      RFormConfig.SHEETS.TRAINING_SETS,
      'Record_Key',
      plan.recordKey
    );
    var existingRaw = existingRows.length === 1
      ? RFormSheetRepository.readRow(RFormConfig.SHEETS.TRAINING_SETS, existingRows[0])
      : null;
    var existing = existingRaw
      ? RFormSetService.getBySetId(String(existingRaw.Set_ID || ''))
      : null;
    var actual = {
      actualKg: RFormUtils.toNumberOrBlank(actualKg),
      actualReps: RFormUtils.toNumberOrBlank(actualReps),
      actualRir: RFormUtils.toNumberOrBlank(actualRir)
    };

    return {
      readOnly: true,
      plan: plan,
      existingRows: existingRows,
      existingSetId: existing ? existing.setId : '',
      expectedRevision: RFormSetService.revision(existing, planSetId),
      proposedDeviation: RFormSetService.describeDeviation(plan, actual),
      note: 'Dry-run не выполняет запись.'
    };
  }

  return {
    runSetup: runSetup,
    runSafetyBaseline: runSafetyBaseline,
    runPureFunctions: runPureFunctions,
    inspectDateNormalization: inspectDateNormalization,
    previewSetMutation: previewSetMutation
  };
}());

function testSetup() {
  var result = RFormTests.runSetup();
  console.log(JSON.stringify(result));
  return result;
}

function testSafetyBaseline() {
  var result = RFormTests.runSafetyBaseline();
  console.log(JSON.stringify(result));
  return result;
}

function testPureFunctions() {
  var result = RFormTests.runPureFunctions();
  console.log(JSON.stringify(result));
  return result;
}

function testDateNormalization(dateKey) {
  var result = RFormTests.inspectDateNormalization(dateKey);
  console.log(JSON.stringify(result));
  return result;
}

function previewSetMutation(sessionId, planSetId, actualKg, actualReps, actualRir) {
  return RFormTests.previewSetMutation(
    sessionId,
    planSetId,
    actualKg,
    actualReps,
    actualRir
  );
}
