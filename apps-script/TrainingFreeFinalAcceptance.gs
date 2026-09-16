'use strict';

/**
 * Final FREE-03 acceptance.
 * Sandbox only. Does not mutate TRAINING_PLAN.
 * Performs one negative write attempt against a CLOSED FREE session and expects
 * VALIDATION:SESSION_NOT_OPEN before any fact/audit mutation.
 */
function runTrainingFreeFinalAcceptance() {
  const checks = [];
  const add = (name, condition, detail) => {
    checks.push({
      name,
      status: condition ? 'PASS' : 'FAIL',
      detail: detail === undefined ? '' : detail
    });
  };

  const ss = getMasterSpreadsheet_();
  add(
    'sandbox datastore guard',
    ss.getName().indexOf(RFORM_SANDBOX_TITLE_PREFIX) === 0,
    ss.getName()
  );

  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  const sets = ss.getSheetByName('TRAINING_SETS');
  const plan = ss.getSheetByName('TRAINING_PLAN');
  const inbox = ss.getSheetByName('INBOX_LOG');

  if (!sessions || !sets || !plan || !inbox) {
    throw new Error('SCHEMA_MISMATCH:FREE_FINAL_ACCEPTANCE:sheets_missing');
  }

  const sh = getHeaderMap_(sessions);
  const th = getHeaderMap_(sets);
  const ph = getHeaderMap_(plan);
  const ih = getHeaderMap_(inbox);

  trainingFreeRequireSessionSchema_(sh);
  trainingFreeRequireSetSchema_(th);
  requireHeaders_(ph, ['Session_ID'], 'TRAINING_PLAN');
  trainingFreeRequireInboxSchema_(ih);

  const target = trainingFreeFinalFindUiSession_(sessions, sh);
  if (!target) {
    throw new Error('FREE_FINAL_ACCEPTANCE:UI_CLOSED_SESSION_NOT_FOUND');
  }

  const state = getTrainingFreeSessionState(target.sessionId);

  add('UI FREE session is CLOSED', state.status === 'CLOSED', state.status);
  add('UI FREE session is not editable', state.canEdit === false, state.canEdit);
  add(
    'UI final summary preserved',
    state.exercises.length === 3 &&
      state.workingSetCount === 4 &&
      state.warmupSetCount === 0 &&
      state.setCount === 4,
    {
      exercises: state.exercises.length,
      working: state.workingSetCount,
      warmup: state.warmupSetCount,
      sets: state.setCount
    }
  );

  const allSets = [];
  (state.exercises || []).forEach(ex => {
    (ex.sets || []).forEach(set => allSets.push(set));
  });

  const units = {};
  allSets.forEach(set => { units[set.loadUnit] = true; });
  add(
    'accepted load units persisted',
    units.KG && units.BW && units.BW_PLUS_KG && units.LEVEL,
    Object.keys(units).sort()
  );

  add(
    'exercise comment persisted',
    (state.exercises || []).some(ex =>
      String(ex.exerciseComment || '').trim() === 'контроль лопаток'
    ),
    (state.exercises || []).map(ex => ({
      exercise: ex.exerciseName,
      comment: ex.exerciseComment || ''
    }))
  );

  add(
    'edited set comment persisted',
    allSets.some(set =>
      String(set.comment || '').trim() === 'тяжёлый, техника стабильна'
    ),
    allSets.map(set => ({
      setId: set.setId,
      comment: set.comment || ''
    }))
  );

  add(
    'session comment persisted',
    String(state.comment || '').trim() === 'FREE-03 UI acceptance',
    state.comment || ''
  );

  const planRows = trainingFreeRowsByValue_(
    plan,
    ph.Session_ID,
    target.sessionId
  );
  add(
    'TRAINING_PLAN has no FREE session rows',
    planRows.length === 0,
    { sessionId: target.sessionId, matchingPlanRows: planRows.length }
  );

  const factRows = trainingFreeRowsByValue_(
    sets,
    th.Session_ID,
    target.sessionId
  );

  const planFieldsBlank = factRows.every(item => {
    const row = item.values;
    return (
      String(row[th.Plan_Weight - 1] || '').trim() === '' &&
      String(row[th.Plan_Reps - 1] || '').trim() === '' &&
      String(row[th.Plan_RIR - 1] || '').trim() === ''
    );
  });
  add(
    'FREE facts keep plan fields blank',
    planFieldsBlank,
    { factRows: factRows.length }
  );

  const deviationOk = factRows.every(item =>
    String(item.values[th.Deviation - 1] || '').trim() ===
    'Свободная тренировка.'
  );
  add(
    'FREE facts remain explicitly separated from plan',
    deviationOk,
    { factRows: factRows.length }
  );

  const bootstrap = getTrainingFreeClientBootstrap();
  add(
    'closed session is not offered for resume',
    bootstrap.activeSession === null,
    bootstrap.activeSession
      ? {
          sessionId: bootstrap.activeSession.sessionId,
          status: bootstrap.activeSession.status
        }
      : null
  );

  const negative = trainingFreeFinalPostCloseProbe_(
    state,
    inbox,
    ih
  );
  add(
    'post-close writer rejects mutation',
    negative.rejected &&
      negative.error.indexOf('VALIDATION:SESSION_NOT_OPEN') >= 0,
    negative
  );
  add(
    'post-close rejection creates no audit row',
    negative.auditRowsAfter === 0,
    { inboxId: negative.inboxId, auditRowsAfter: negative.auditRowsAfter }
  );

  const regression = runTrainingFreeFoundationRegression();
  add(
    'foundation and legacy regression remain green',
    regression.status === 'PASS' && regression.failed === 0,
    {
      status: regression.status,
      total: regression.total,
      passed: regression.passed,
      failed: regression.failed
    }
  );

  const foundation = inspectTrainingFreeFoundationState();
  add(
    'production writer boundary preserved',
    foundation.productionWriterChanged === false,
    { productionWriterChanged: foundation.productionWriterChanged }
  );

  const failed = checks.filter(x => x.status !== 'PASS').length;
  const result = {
    status: failed ? 'FAIL' : 'PASS',
    gate: 'FREE-03-FINAL-ACCEPTANCE',
    datastore: ss.getName(),
    version: RFORM_TRAINING_FREE_VERSION,
    sessionId: target.sessionId,
    date: state.date,
    total: checks.length,
    passed: checks.length - failed,
    failed,
    checks,
    regression
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function trainingFreeFinalFindUiSession_(sessions, h) {
  const last = sessions.getLastRow();
  if (last < 2) return null;

  const values = sessions
    .getRange(2, 1, last - 1, sessions.getLastColumn())
    .getValues();

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const mode = String(row[h.Session_Mode - 1] || '').trim();
    const status = String(row[h.Session_Status - 1] || '').trim();
    const comment = String(row[h.Session_Comment - 1] || '').trim();

    if (
      mode === 'FREE' &&
      status === 'CLOSED' &&
      comment === 'FREE-03 UI acceptance'
    ) {
      return {
        row: i + 2,
        sessionId: String(row[h.Session_ID - 1] || '').trim()
      };
    }
  }

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const mode = String(row[h.Session_Mode - 1] || '').trim();
    const status = String(row[h.Session_Status - 1] || '').trim();
    const sessionId = String(row[h.Session_ID - 1] || '').trim();

    if (
      mode === 'FREE' &&
      status === 'CLOSED' &&
      sessionId.indexOf('S-20991231-FREE-') !== 0
    ) {
      return { row: i + 2, sessionId };
    }
  }

  return null;
}

function trainingFreeFinalPostCloseProbe_(state, inbox, ih) {
  const firstExercise = (state.exercises || [])[0];
  const firstSet = firstExercise && (firstExercise.sets || [])[0];

  if (!firstSet) {
    return {
      rejected: false,
      error: 'NO_SET_AVAILABLE_FOR_NEGATIVE_PROBE',
      inboxId: '',
      auditRowsAfter: -1
    };
  }

  const eventId = Utilities.getUuid();
  const inboxId = trainingFreeInboxId_(eventId);
  let rejected = false;
  let error = '';

  try {
    updateTrainingFreeSet({
      eventId,
      sessionId: state.sessionId,
      source: 'RFORM_MOBILE',
      setId: firstSet.setId,
      setType: firstSet.setType,
      loadUnit: firstSet.loadUnit,
      loadValue:
        firstSet.loadUnit === 'BW'
          ? null
          : firstSet.loadValue,
      reps: firstSet.reps,
      rir: firstSet.rir,
      comment: firstSet.comment || ''
    });
  } catch (e) {
    rejected = true;
    error = String(e && e.message ? e.message : e);
  }

  const auditRowsAfter = trainingFreeFindRowByExact_(
    inbox,
    ih.Inbox_Event_ID,
    inboxId
  )
    ? 1
    : 0;

  return {
    rejected,
    error,
    inboxId,
    auditRowsAfter
  };
}
