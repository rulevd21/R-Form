'use strict';

const RFORM_TC = Object.freeze({
  SHEET_ID_PROP: 'TRAINING_CHECK_SPREADSHEET_ID',
  TOKEN_PROP: 'TRAINING_CHECK_ACCESS_TOKEN',
  CHECKS_SHEET: 'CHECKS',
  PARTICIPANTS_SHEET: 'PARTICIPANTS',
  INGEST_SHEET: 'INGEST_LOG',
  SCHEMA_VERSION: 'rform.training_check.v0.2',
  MAX_PAYLOAD_CHARS: 12000
});

function doGet() {
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

function processTrainingCheck_(e) {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty(RFORM_TC.SHEET_ID_PROP);
  const expectedToken = props.getProperty(RFORM_TC.TOKEN_PROP);
  if (!spreadsheetId) throw new Error('CONFIG_MISSING:TRAINING_CHECK_SPREADSHEET_ID');
  if (!expectedToken) throw new Error('CONFIG_MISSING:TRAINING_CHECK_ACCESS_TOKEN');

  const access = String((e && e.parameter && e.parameter.access) || '');
  if (!constantTimeEqual_(access, expectedToken)) throw new Error('ACCESS_DENIED');

  const raw = String((e && e.parameter && e.parameter.payload) || '');
  if (!raw) throw new Error('PAYLOAD_MISSING');
  if (raw.length > RFORM_TC.MAX_PAYLOAD_CHARS) throw new Error('PAYLOAD_TOO_LARGE');

  let payload;
  try { payload = JSON.parse(raw); } catch (_) { throw new Error('PAYLOAD_INVALID_JSON'); }
  validatePayload_(payload);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const checks = requireSheet_(ss, RFORM_TC.CHECKS_SHEET);
    const participants = requireSheet_(ss, RFORM_TC.PARTICIPANTS_SHEET);
    const ingest = requireSheet_(ss, RFORM_TC.INGEST_SHEET);

    const ingestHeaders = headerMap_(ingest);
    requireHeaders_(ingestHeaders, ['event_id','received_at','check_id','participant_id','source','client_version','payload_json','processing_status','error_code','note'], RFORM_TC.INGEST_SHEET);

    const duplicateRow = findRowByExact_(ingest, ingestHeaders.event_id, payload.event_id);
    if (duplicateRow) {
      return {
        ok: true,
        type: 'rform-training-check-ack',
        event_id: payload.event_id,
        check_id: payload.check_id,
        participant_id: payload.participant_id,
        status: 'ALREADY_APPLIED'
      };
    }

    upsertParticipantConsent_(participants, payload);
    upsertCheck_(checks, payload);
    appendIngest_(ingest, ingestHeaders, payload, raw, 'APPLIED', '', 'Training Check accepted');

    SpreadsheetApp.flush();
    return {
      ok: true,
      type: 'rform-training-check-ack',
      event_id: payload.event_id,
      check_id: payload.check_id,
      participant_id: payload.participant_id,
      status: 'APPLIED'
    };
  } catch (err) {
    try {
      const ss = SpreadsheetApp.openById(spreadsheetId);
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

function upsertCheck_(sheet, p) {
  const h = headerMap_(sheet);
  const required = ['check_id','participant_id','test_status','test_date','session_date','training_context','plan','fact','rir_summary','rest_summary','quality_comment','participant_decision','data_quality'];
  requireHeaders_(h, required, RFORM_TC.CHECKS_SHEET);
  let row = findRowByExact_(sheet, h.check_id, p.check_id);
  if (!row) row = Math.max(sheet.getLastRow() + 1, 2);

  const sessionDate = String(p.session_date || p.submitted_at || '').slice(0, 10);
  const intensity = [String(p.rir || '').trim() ? 'RIR ' + String(p.rir).trim() : '', String(p.effort || '').trim()].filter(Boolean).join(' · ');
  const quality = [String(p.effort || '').trim() ? 'Ощущение: ' + String(p.effort).trim() : '', String(p.quality || '').trim()].filter(Boolean).join(' | ');
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
    quality_comment: quality,
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

function constantTimeEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ackHtml_(ack) {
  const safe = JSON.stringify(ack).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.parent.postMessage(' + safe + ',"*");</script>');
}
