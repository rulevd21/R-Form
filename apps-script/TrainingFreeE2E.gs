'use strict';

/**
 * Sandbox-only writer acceptance for FREE training.
 * Creates a closed synthetic session dated 2099-12-31 and retains it as evidence.
 * Never run against production; getMasterSpreadsheet_ enforces the sandbox title guard.
 */
function runTrainingFreeWriterE2EAcceptance() {
  const ss = getMasterSpreadsheet_();
  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  const dictionaries = ss.getSheetByName('DICTIONARIES');
  if (!sessions || !dictionaries) throw new Error('SCHEMA_MISMATCH:FREE_E2E:sheets_missing');
  const sh = getHeaderMap_(sessions);
  trainingFreeRequireSessionSchema_(sh);
  if (trainingFreeFindActiveSession_(sessions, sh)) throw new Error('E2E_BLOCKED:ACTIVE_FREE_SESSION_EXISTS');

  const categories = trainingExerciseCategories_(dictionaries);
  if (!categories.length) throw new Error('E2E_BLOCKED:NO_EXERCISE_CATEGORY');
  const category = categories[0];
  const date = '2099-12-31';
  const ids = {};
  const checks = [];
  const check = (name, condition, detail) => checks.push({name, status:condition?'PASS':'FAIL', detail:detail===undefined?null:detail});

  const start = startTrainingFreeSession({eventId:Utilities.getUuid(),date,source:RFORM_TRAINING_FREE_SOURCE});
  ids.sessionId = start.sessionId;
  check('session start', start.status === 'APPLIED' && start.state && start.state.status === RFORM_TRAINING_FREE_OPEN_STATUS, start.status);

  const warmup = createTrainingFreeSet({
    eventId:Utilities.getUuid(),sessionId:ids.sessionId,source:RFORM_TRAINING_FREE_SOURCE,
    exerciseInstanceId:'',exerciseCatalogId:'E2E',exerciseName:'FREE E2E TEST',exerciseCategory:category,
    exerciseOrder:1,exerciseComment:'E2E sandbox evidence',setType:'WARMUP',loadUnit:'KG',loadValue:20,reps:10,rir:null,comment:'warmup'
  });
  ids.exerciseInstanceId = warmup.exerciseInstanceId;
  ids.warmupSetId = warmup.setId;
  check('warmup create', warmup.status === 'APPLIED' && warmup.state.warmupSetCount === 1, warmup.setId);

  const working = createTrainingFreeSet({
    eventId:Utilities.getUuid(),sessionId:ids.sessionId,source:RFORM_TRAINING_FREE_SOURCE,
    exerciseInstanceId:ids.exerciseInstanceId,exerciseCatalogId:'E2E',exerciseName:'FREE E2E TEST',exerciseCategory:category,
    exerciseOrder:1,exerciseComment:'E2E sandbox evidence',setType:'WORKING',loadUnit:'KG',loadValue:60,reps:8,rir:3,comment:'working'
  });
  ids.workingSetId = working.setId;
  check('working create', working.status === 'APPLIED' && working.state.workingSetCount === 1 && working.state.setCount === 2, working.setId);

  const updated = updateTrainingFreeSet({
    eventId:Utilities.getUuid(),sessionId:ids.sessionId,source:RFORM_TRAINING_FREE_SOURCE,
    setId:ids.workingSetId,setType:'WORKING',loadUnit:'KG',loadValue:62.5,reps:8,rir:2,comment:'updated working'
  });
  const updatedSet = updated.state.exercises[0].sets.filter(x => x.setId === ids.workingSetId)[0];
  check('set update', updated.status === 'APPLIED' && updatedSet && updatedSet.loadValue === 62.5 && updatedSet.rir === 2, updatedSet || null);

  const exerciseUpdate = updateTrainingFreeExercise({
    eventId:Utilities.getUuid(),sessionId:ids.sessionId,source:RFORM_TRAINING_FREE_SOURCE,
    exerciseInstanceId:ids.exerciseInstanceId,exerciseOrder:1,exerciseComment:'trainer comment E2E'
  });
  check('exercise metadata update', exerciseUpdate.status === 'APPLIED' && exerciseUpdate.state.exercises[0].exerciseComment === 'trainer comment E2E', exerciseUpdate.state.exercises[0].exerciseComment);

  const deleted = deleteTrainingFreeSet({eventId:Utilities.getUuid(),sessionId:ids.sessionId,setId:ids.warmupSetId,source:RFORM_TRAINING_FREE_SOURCE});
  check('set delete and renumber', deleted.status === 'APPLIED' && deleted.state.setCount === 1 && deleted.state.warmupSetCount === 0 && deleted.state.exercises[0].sets[0].setNumber === 1, deleted.state);

  const completed = completeTrainingFreeSession({eventId:Utilities.getUuid(),sessionId:ids.sessionId,source:RFORM_TRAINING_FREE_SOURCE,comment:'FREE-03 E2E PASS evidence'});
  check('session complete', completed.status === 'APPLIED' && completed.state.status === RFORM_TRAINING_FREE_CLOSED_STATUS && completed.state.canEdit === false, completed.state.status);
  check('final fact preserved', completed.state.setCount === 1 && completed.state.workingSetCount === 1 && completed.state.exercises[0].sets[0].loadValue === 62.5, completed.state.exercises[0].sets[0]);

  const failed = checks.filter(x => x.status === 'FAIL');
  const result = {
    status:failed.length?'FAIL':'PASS',
    gate:'FREE-03-WRITER-E2E',
    datastore:ss.getName(),
    version:RFORM_TRAINING_FREE_VERSION,
    syntheticDate:date,
    evidenceRetained:true,
    ids,
    total:checks.length,
    passed:checks.length-failed.length,
    failed:failed.length,
    checks
  };
  console.log(JSON.stringify(trainingFreeClientSerialize_(result),null,2));
  return trainingFreeClientSerialize_(result);
}
