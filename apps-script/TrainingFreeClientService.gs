'use strict';

/**
 * Browser-facing gateway for FREE training v0.1.
 * Keeps raw service contracts server-side and converts Apps Script Date values
 * into JSON-safe ISO strings before crossing google.script.run.
 */
function getTrainingFreeClientBootstrap() {
  const ss = getMasterSpreadsheet_();
  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  const plan = ss.getSheetByName('TRAINING_PLAN');
  const sets = ss.getSheetByName('TRAINING_SETS');
  const dictionaries = ss.getSheetByName('DICTIONARIES');
  if (!sessions || !plan || !sets || !dictionaries) {
    throw new Error('SCHEMA_MISMATCH:TRAINING_FREE_CLIENT:sheets_missing');
  }

  const sh = getHeaderMap_(sessions);
  const ph = getHeaderMap_(plan);
  const th = getHeaderMap_(sets);
  trainingFreeRequireSessionSchema_(sh);
  requireHeaders_(ph, [
    'Exercise_Name_Original','Exercise_Name_Normalized','Exercise_Category'
  ], 'TRAINING_PLAN');
  trainingFreeRequireSetSchema_(th);

  const active = trainingFreeFindActiveSession_(sessions, sh);
  const known = trainingExerciseKnownExercises_(plan, ph, sets, th);
  const categories = trainingExerciseCategories_(dictionaries);
  const recent = trainingFreeRecentExercises_(sets, th, 12);

  return trainingFreeClientSerialize_({
    date: getTodayDateKey_(),
    version: RFORM_TRAINING_FREE_VERSION,
    activeSession: active ? getTrainingFreeSessionState(active.sessionId) : null,
    knownExercises: known,
    recentExercises: recent,
    categories,
    loadUnits: RFORM_TRAINING_FREE_LOAD_UNITS.slice(),
    setTypes: RFORM_TRAINING_FREE_SET_TYPES.slice(),
    productionWriterChanged: false
  });
}

function getTrainingFreeSessionStateClient(sessionId) {
  return trainingFreeClientSerialize_(getTrainingFreeSessionState(sessionId));
}

function startTrainingFreeSessionClient(payload) {
  return trainingFreeClientSerialize_(startTrainingFreeSession(payload));
}

function createTrainingFreeSetClient(payload) {
  return trainingFreeClientSerialize_(createTrainingFreeSet(payload));
}

function updateTrainingFreeSetClient(payload) {
  return trainingFreeClientSerialize_(updateTrainingFreeSet(payload));
}

function deleteTrainingFreeSetClient(payload) {
  return trainingFreeClientSerialize_(deleteTrainingFreeSet(payload));
}

function updateTrainingFreeExerciseClient(payload) {
  return trainingFreeClientSerialize_(updateTrainingFreeExercise(payload));
}

function swapTrainingFreeExercisesClient(payload) {
  return trainingFreeClientSerialize_(swapTrainingFreeExercises(payload));
}

function completeTrainingFreeSessionClient(payload) {
  return trainingFreeClientSerialize_(completeTrainingFreeSession(payload));
}

function trainingFreeRecentExercises_(sets, h, limit) {
  const last = sets.getLastRow();
  if (last < 2) return [];
  const values = sets.getRange(2, 1, last - 1, sets.getLastColumn()).getValues();
  const seen = {};
  const out = [];
  for (let i = values.length - 1; i >= 0 && out.length < limit; i--) {
    const row = values[i];
    const name = String(row[h.Exercise_Name_Original - 1] || '').trim();
    const normalized = String(row[h.Exercise_Name_Normalized - 1] || '').trim();
    const category = String(row[h.Exercise_Category - 1] || '').trim();
    if (!name || !normalized || !category || seen[normalized]) continue;
    seen[normalized] = true;
    out.push({
      name,
      normalized,
      category,
      catalogId: String(row[h.Exercise_Catalog_ID - 1] || '').trim()
    });
  }
  return out;
}

function trainingFreeClientSerialize_(value) {
  if (value === null || value === undefined) return value;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value) ? '' : value.toISOString();
  }
  if (Array.isArray(value)) return value.map(trainingFreeClientSerialize_);
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).forEach(key => {
      result[key] = trainingFreeClientSerialize_(value[key]);
    });
    return result;
  }
  return value;
}
