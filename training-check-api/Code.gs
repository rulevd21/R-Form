'use strict';

const RFORM_TC = Object.freeze({
  DATASTORE_ID: '1X9xfRDMtqPpfDOAXWHAIl5oRCqnLQMcpHWRBa75LLrM',
  CHECKS_SHEET: 'CHECKS',
  PARTICIPANTS_SHEET: 'PARTICIPANTS',
  INGEST_SHEET: 'INGEST_LOG',
  SCHEMA_VERSION: 'rform.training_check.v0.2',
  MAX_PAYLOAD_CHARS: 12000
});

function doGet(e) {
  const mode = String((e && e.parameter && e.parameter.mode) || '').trim();
  if (mode === 'status') return statusJs_(e);
  if (mode === 'check') return checkStateJs_(e);
  return HtmlService.createHtmlOutput('R/Form Training Check receiver: OK');
}

function doPost(e) {
  let ack;
  try {
    ack = processTrainingCheck_(e);
  } catch (err) {
    ack = {
      ok: false,
      type: 'rform-training-check-ack',
      event_id: safeEventId_(e),
      status: 'ERROR',
      error: String(err && err.message ? err.message : err)
    };
  }
  return ackHtml_(ack);
}

function statusJs_(e) {
  const prefix = safeJsonpPrefix_(String((e && e.parameter && e.parameter.prefix) || ''));
  let result;
  try {
    result = getTrainingCheckStatus_(e);
  } catch (err) {
    result = {
      ok: false,
      found: false,
      type: 'rform-training-check-status',
      event_id: String((e && e.parameter && e.parameter.event) || ''),
      status: 'ERROR',
      error: String(err && err.message ? err.message : err)
    };
  }
  return jsonpOutput_(prefix, result);
}

function checkStateJs_(e) {
  const prefix = safeJsonpPrefix_(String((e && e.parameter && e.parameter.prefix) || ''));
  let result;
  try {
    result = getCheckState_(e);
  } catch (err) {
    result = {
      ok: false,
      type: 'rform-training-check-check',
      status: 'ERROR',
      error: String(err && err.message ? err.message : err)
    };
  }
  return jsonpOutput_(prefix, result);
}

function jsonpOutput_(prefix, result) {
  const safe = JSON.stringify(result).replace(/</g, '\\u003c');
  return ContentService.createTextOutput(prefix + '(' + safe + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getCheckState_(e) {
  const p = (e && e.parameter) || {};
  const checkId = String(p.check || '').trim();
  const participantId = String(p.participant || '').trim();
  const access = String(p.access || '');
  if (!checkId) throw new Error('FIELD_REQUIRED:check');
  if (!participantId) throw new Error('FIELD_REQUIRED:participant');

  const ss = SpreadsheetApp.openById(RFORM_TC.DATASTORE_ID);
  const checks = requireSheet_(ss, RFORM_TC.CHECKS_SHEET);
  const h = headerMap_(checks);
  const auth = authorizeCheck_(checks, h, checkId, participantId, access);
  requireHeaders_(h, [
    'test_status','session_date','plan','fact','rir_summary','rest_summary',
    'quality_comment','participant_decision','analyst_key_deviation',
    'analyst_interpretation','report_next_step','data_quality','report_version','reported_at'
  ], RFORM_TC.CHECKS_SHEET);

  const value = function(name) {
    return String(checks.getRange(auth.row, h[name]).getDisplayValue() || '');
  };
  const status = value('test_status') || 'PLANNED';
  const keyDeviation = value('analyst_key_deviation');
  const interpretation = value('analyst_interpretation');
  const nextCheckpoint = value('report_next_step');
  const reportReady = status === 'REPORTED' && !!(keyDeviation && interpretation && nextCheckpoint);

  return {
    ok: true,
    type: 'rform-training-check-check',
    status: status,
    data_quality: value('data_quality'),
    report_ready: reportReady,
    report_version: value('report_version'),
    reported_at: value('reported_at'),
    report: reportReady ? {
      session_date: value('session_date'),
      plan: value('plan'),
      fact: value('fact'),
      intensity: value('rir_summary'),
      rest: value('rest_summary'),
      quality: value('quality_comment'),
      decision: value('participant_decision'),
      key_deviation: keyDeviation,
      interpretation: interpretation,
      next_checkpoint: nextCheckpoint
    } : null
  };
}

function getTrainingCheckStatus_(e) {
  const p = (e && e.parameter) || {};
  const checkId = String(p.check || '').trim();
  const participantId = String(p.participant || '').trim();
  const eventId = String(p.event || '').trim();
  const access = String(p.access || '');
  if (!checkId) throw new Error('FIELD_REQUIRED:check');
  if (!participantId) throw new Error('FIELD_REQUIRED:participant');
  if (!eventId) throw new Error('FIELD_REQUIRED:event');

  const ss = SpreadsheetApp.openById(RFORM_TC.DATASTORE_ID);
  const checks = requireSheet_(ss, RFORM_TC.CHECKS_SHEET);
  const ingest = requireSheet_(ss, RFORM_TC.INGEST_SHEET);
  const checkHeaders = headerMap_(checks);
  const auth = authorizeCheck_(checks, checkHeaders, checkId, participantId, access);

  const h = headerMap_(ingest);
  requireHeaders_(h, ['event_id','check_id','participant_id','processing_status','error_code','note'], RFORM_TC.INGEST_SHEET);
  const row = findRowByExact_(ingest, h.event_id, eventId);
  if (!row) {
    return {
      ok: false,
      found: false,
      type: 'rform-training-check-status',
      event_id: eventId,
      status: 'PENDING',
      check_status: auth.status
    };
  }

  const rowCheck = String(ingest.getRange(row, h.check_id).getDisplayValue() || '');
  const rowParticipant = String(ingest.getRange(row, h.participant_id).getDisplayValue() || '');
  if (rowCheck !== checkId || rowParticipant !== participantId) throw new Error('EVENT_SCOPE_MISMATCH');

  const status = String(ingest.getRange(row, h.processing_status).getDisplayValue() || '');
  const errorCode = String(ingest.getRange(row, h.error_code).getDisplayValue() || '');
  const note = String(ingest.getRange(row, h.note).getDisplayValue() || '');
  const checkStatus = String(checks.getRange(auth.row, checkHeaders.test_status).getDisplayValue() || auth.status || '');
  return {
    ok: status === 'APPLIED',
    found: true,
    type: 'rform-training-check-status',
    event_id: eventId,
    status: status || 'UNKNOWN',
    check_status: checkStatus,
    error: errorCode,
    note: note
  };
}

function processTrainingCheck_(e) {
  const raw = String((e && e.parameter && e.parameter.payload) || '');
  if (!raw) throw new Error('PAYLOAD_MISSING');
  if (raw.length > RFORM_TC.MAX_PAYLOAD_CHARS) throw new Error('PAYLOAD_TOO_LARGE');

  let payload;
  try { payload = JSON.parse(raw); } catch (_) { throw new Error('PAYLOAD_INVALID_JSON'); }
  validatePayload_(payload);
  const access = String((e && e.parameter && e.parameter.access) || '');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(RFORM_TC.DATASTORE_ID);
    const checks = requireSheet_(ss, RFORM_TC.CHECKS_SHEET);
    const participants = requireSheet_(ss, RFORM_TC.PARTICIPANTS_SHEET);
    const ingest = requireSheet_(ss, RFORM_TC.INGEST_SHEET);

    const checkHeaders = headerMap_(checks);
    const auth = authorizeCheck_(checks, checkHeaders, payload.check_id, payload.participant_id, access);

    const ingestHeaders = headerMap_(ingest);
    requireHeaders_(ingestHeaders, ['event_id','received_at','check_id','participant_id','source','client_version','payload_json','processing_status','error_code','note'], RFORM_TC.INGEST_SHEET);
    const duplicateRow = findRowByExact_(ingest, ingestHeaders.event_id, payload.event_id);
    if (duplicateRow) {
      return {
        ok: true,
        type: 'rform-training-check-ack',
        event_id: payload.event_id,
        status: 'ALREADY_APPLIED'
      };
    }

    if (auth.status !== 'PLANNED') throw new Error('CHECK_CLOSED');

    upsertParticipantConsent_(participants, payload);
    updateCheck_(checks, checkHeaders, auth.row, payload);
    appendIngest_(ingest, ingestHeaders, payload, raw, 'APPLIED', '', 'Training Check accepted');
    SpreadsheetApp.flush();

    return {
      ok: true,
      type: 'rform-training-check-ack',
      event_id: payload.event_id,
      status: 'APPLIED'
    };
  } catch (err) {
    try {
      const ss = SpreadsheetApp.openById(RFORM_TC.DATASTORE_ID);
      const ingest = ss.getSheetByName(RFORM_TC.INGEST_SHEET);
      if (ingest && payload && payload.event_id) {
        appendIngest_(ingest, headerMap_(ingest), payload, raw, 'ERROR', String(err && err.message ? err.message : err), 'Receiver failed');
      }
    } catch (_) {}
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function authorizeCheck_(checks, h, checkId, participantId, access) {
  requireHeaders_(h, ['check_id','participant_id','submission_token','test_status'], RFORM_TC.CHECKS_SHEET);
  const row = findRowByExact_(checks, h.check_id, checkId);
  if (!row) throw new Error('CHECK_NOT_PRECREATED');
  const expectedParticipant = String(checks.getRange(row, h.participant_id).getDisplayValue() || '');
  const expectedToken = String(checks.getRange(row, h.submission_token).getDisplayValue() || '');
  if (expectedParticipant !== String(participantId)) throw new Error('PARTICIPANT_MISMATCH');
  if (!expectedToken || !constantTimeEqual_(access, expectedToken)) throw new Error('ACCESS_DENIED');
  return {
    row: row,
    status: String(checks.getRange(row, h.test_status).getDisplayValue() || 'PLANNED')
  };
}

function validatePayload_(p) {
  if (!p || p.schema_version !== RFORM_TC.SCHEMA_VERSION) throw new Error('SCHEMA_MISMATCH');
  ['event_id','check_id','participant_id','submitted_at','plan','fact','quality','decision'].forEach(function(k) {
    if (!String(p[k] || '').trim()) throw new Error('FIELD_REQUIRED:' + k);
  });
  if (!(String(p.rir || '').trim() || String(p.effort || '').trim())) throw new Error('FIELD_REQUIRED:intensity');
  if (p.consent_store_data !== true) throw new Error('CONSENT_REQUIRED');
}

function upsertParticipantConsent_(sheet, p) {
  const h = headerMap_(sheet);
  requireHeaders_(h, ['participant_id','consent_store_data'], RFORM_TC.PARTICIPANTS_SHEET);
  let row = findRowByExact_(sheet, h.participant_id, p.participant_id);
  if (!row) {
    row = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(row, h.participant_id).setValue(p.participant_id);
  }
  sheet.getRange(row, h.consent_store_data).setValue(true);
}

function updateCheck_(sheet, h, row, p) {
  const required = ['check_id','participant_id','test_status','test_date','session_date','training_context','plan','fact','rir_summary','rest_summary','quality_comment','participant_decision','data_quality'];
  requireHeaders_(h, required, RFORM_TC.CHECKS_SHEET);

  const sessionDate = String(p.session_date || p.submitted_at || '').slice(0, 10);
  const intensity = [String(p.rir || '').trim(), String(p.effort || '').trim()].filter(Boolean).join(' · ');
  const values = {
    check_id: p.check_id,
    participant_id: p.participant_id,
    test_status: 'COMPLETED',
    test_date: sessionDate,
    session_date: sessionDate,
    training_context: String(p.training_context || '').trim(),
    plan: String(p.plan || '').trim(),
    fact: String(p.fact || '').trim(),
    rir_summary: intensity,
    rest_summary: String(p.rest || '').trim(),
    quality_comment: String(p.quality || '').trim(),
    participant_decision: String(p.decision || '').trim(),
    data_quality: 'COMPLETE'
  };
  Object.keys(values).forEach(function(name) {
    sheet.getRange(row, h[name]).setValue(values[name]);
  });
}

function appendIngest_(sheet, h, p, raw, status, errorCode, note) {
  requireHeaders_(h, ['event_id','received_at','check_id','participant_id','source','client_version','payload_json','processing_status','error_code','note'], RFORM_TC.INGEST_SHEET);
  const row = Math.max(sheet.getLastRow() + 1, 2);
  const values = {
    event_id: String(p.event_id || ''),
    received_at: new Date(),
    check_id: String(p.check_id || ''),
    participant_id: String(p.participant_id || ''),
    source: String(p.source || 'RFORM_TRAINING_CHECK_WEB'),
    client_version: String(p.client_version || ''),
    payload_json: raw,
    processing_status: status,
    error_code: errorCode || '',
    note: note || ''
  };
  Object.keys(values).forEach(function(name) {
    sheet.getRange(row, h[name]).setValue(values[name]);
  });
}

function requireSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('SHEET_MISSING:' + name);
  return sheet;
}

function headerMap_(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  return headers.reduce(function(map, value, index) {
    if (value) map[String(value).trim()] = index + 1;
    return map;
  }, {});
}

function requireHeaders_(map, names, sheetName) {
  const missing = names.filter(function(name) { return !map[name]; });
  if (missing.length) throw new Error('SCHEMA_MISMATCH:' + sheetName + ':' + missing.join(','));
}

function findRowByExact_(sheet, column, expected) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, column, lastRow - 1, 1).getDisplayValues();
  const target = String(expected || '');
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === target) return i + 2;
  }
  return 0;
}

function safeEventId_(e) {
  try {
    const raw = String((e && e.parameter && e.parameter.payload) || '');
    return raw ? String(JSON.parse(raw).event_id || '') : '';
  } catch (_) { return ''; }
}

function safeJsonpPrefix_(value) {
  const prefix = String(value || '').trim();
  if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(prefix)) throw new Error('INVALID_PREFIX');
  return prefix;
}

function constantTimeEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ackHtml_(ack) {
  const safe = JSON.stringify(ack).replace(/</g, '\\u003c');
  const script = [
    '<!doctype html><meta charset="utf-8"><script>',
    '(function(){var ack=' + safe + ';',
    'try{window.top.postMessage(ack,"*");}catch(e){}',
    'try{window.parent.postMessage(ack,"*");}catch(e){}',
    '})();',
    '<\/script>'
  ].join('');
  return HtmlService.createHtmlOutput(script);
}
