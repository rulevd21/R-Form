'use strict';

const RFORM_V1 = Object.freeze({
  PARTICIPANTS: 'PARTICIPANTS',
  CHECKS: 'CHECKS',
  CATALOG: 'EXERCISE_CATALOG',
  SESSION_EXERCISES: 'SESSION_EXERCISES',
  INGEST: 'INGEST_LOG',
  SCHEMA: 'rform.training.v1.0',
  MAX_PAYLOAD_CHARS: 60000,
  MAX_EXERCISES: 30
});

function rformDatastoreId_() {
  return PropertiesService.getScriptProperties().getProperty('RFORM_TRAINING_V1_DATASTORE_ID');
}
