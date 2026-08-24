'use strict';

const RFORM_TCV1 = Object.freeze({
  VERSION: '1.0.0-staging',
  DATASTORE_ID: '1X9xfRDMtqPpfDOAXWHAIl5oRCqnLQMcpHWRBa75LLrM',
  SHEETS: Object.freeze({PARTICIPANTS:'PARTICIPANTS',CHECKS:'CHECKS',INGEST:'INGEST_LOG',EVENTS:'PRODUCT_EVENTS'}),
  MINI_APP_URL_DEFAULT: 'https://rulevd21.github.io/R-Form/training-check-miniapp/',
  ALLOWED_ORIGIN_DEFAULT: 'https://rulevd21.github.io',
  AUTH_MAX_AGE_SECONDS: 86400,
  MAX_PAYLOAD_CHARS: 16000,
  ANALYSIS_ENGINE: 'RFORM_DETERMINISTIC',
  PORTABLE_PROMPT_VERSION: 'rform-training-continuity-v1'
});
