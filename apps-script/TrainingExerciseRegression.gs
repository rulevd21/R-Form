'use strict';

function runTrainingExerciseRegression() {
  const checks = [];
  function check(name, fn) {
    try {
      fn();
      checks.push({ name, status: 'PASS' });
    } catch (error) {
      checks.push({ name, status: 'FAIL', error: error && error.message ? error.message : String(error) });
    }
  }
  function assert_(condition, message) {
    if (!condition) throw new Error(message || 'ASSERT_FAILED');
  }

  check('scalar weight expands to all sets', () => {
    const values = trainingExerciseExpandPattern_('60', 3, 'WEIGHT', 0, 1000, true);
    assert_(JSON.stringify(values) === JSON.stringify([60, 60, 60]), 'WEIGHT_EXPANSION');
  });

  check('per-set RIR pattern preserves order', () => {
    const values = trainingExerciseExpandPattern_('3/3/2', 3, 'RIR', 0, 10, false);
    assert_(JSON.stringify(values) === JSON.stringify([3, 3, 2]), 'RIR_EXPANSION');
  });

  check('pattern length mismatch is rejected', () => {
    let rejected = false;
    try {
      trainingExerciseExpandPattern_('8/8', 3, 'REPS', 1, 1000, true);
    } catch (error) {
      rejected = String(error.message || error).indexOf('PATTERN_COUNT') >= 0;
    }
    assert_(rejected, 'PATTERN_COUNT_NOT_REJECTED');
  });

  check('plan set maps to fact set without changing plan id', () => {
    assert_(trainingExerciseExpectedSetId_('TPS-20260817-A-08') === 'SET-20260817-A-08', 'SET_ID_MAPPING');
  });

  check('board press canonical alias is stable', () => {
    assert_(RFORM_TRAINING_EXERCISE_ALIASES['ДОЖИМ С БРУСКАМИ'] === 'BOARD_PRESS', 'BOARD_PRESS_ALIAS');
  });

  check('incline medium-grip canonical alias is stable', () => {
    assert_(
      RFORM_TRAINING_EXERCISE_ALIASES['ЖИМ ШТАНГИ НА НАКЛОННОЙ СКАМЬЕ СРЕДНИМ ХВАТОМ'] === 'INCLINE_BARBELL_PRESS_MEDIUM_GRIP',
      'INCLINE_ALIAS'
    );
  });

  check('record key formula uses actual exercise identity', () => {
    const row = trainingExerciseFactRowValues_(548, {
      setId: 'SET-20260817-A-08',
      sessionId: 'S-20260817-A',
      exerciseOrder: 3,
      exerciseName: 'Жим штанги на наклонной скамье средним хватом',
      exerciseNormalized: 'INCLINE_BARBELL_PRESS_MEDIUM_GRIP',
      category: 'PRESS',
      setType: 'ACCESSORY',
      setNumber: 1,
      weight: 60,
      reps: 8,
      rir: 3,
      planWeight: 28.5,
      planReps: 9,
      planRir: 3,
      deviation: 'Замена.',
      comment: 'Исходный Plan_Set_ID: TPS-20260817-A-08.'
    });
    assert_(String(row[23]).indexOf('E548') >= 0, 'RECORD_KEY_ACTUAL_EXERCISE');
    assert_(row[18] === 28.5 && row[19] === 9 && row[20] === 3, 'PLAN_SNAPSHOT_LOST');
  });

  check('extra exercise has no fake plan snapshot', () => {
    const row = trainingExerciseFactRowValues_(551, {
      setId: 'SET-20260817-A-EX-ABCDEF12-01',
      sessionId: 'S-20260817-A',
      exerciseOrder: 6,
      exerciseName: 'Молотковые сгибания',
      exerciseNormalized: 'MOLOTKOVYE_SGIBANIYA',
      category: 'ARMS',
      setType: 'ACCESSORY',
      setNumber: 1,
      weight: 16,
      reps: 10,
      rir: 3,
      planWeight: null,
      planReps: null,
      planRir: null,
      deviation: 'Добавлено сверх плана.',
      comment: 'Дополнительное упражнение.'
    });
    assert_(row[18] === '' && row[19] === '' && row[20] === '', 'EXTRA_HAS_PLAN_VALUES');
  });

  const failed = checks.filter(item => item.status === 'FAIL');
  return {
    status: failed.length ? 'FAIL' : 'PASS',
    version: RFORM_TRAINING_CHANGE_VERSION,
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks
  };
}

function inspectTrainingExerciseRegressionState(sessionId) {
  const state = getTrainingExerciseEditState(sessionId);
  return {
    sessionId: state.sessionId,
    sessionStatus: state.sessionStatus,
    canEdit: state.canEdit,
    plannedExercises: state.exercises.length,
    plannedSets: state.exercises.reduce((sum, item) => sum + item.sets.length, 0),
    unsavedSets: state.exercises.reduce((sum, item) => sum + item.unsavedCount, 0),
    categories: state.categories,
    version: state.version
  };
}
