'use strict';

/**
 * R/Form Training Completed_At integrity reconciler.
 *
 * Purpose:
 * - repair only CLOSED TRAINING_SESSIONS rows whose Completed_At is blank;
 * - source the timestamp only from an existing APPLIED TRAINING_CLOSE event;
 * - never invent timestamps;
 * - never modify TRAINING_PLAN, TRAINING_SETS, DAILY, nutrition, or session results.
 *
 * This is a containment fix while the canonical legacy Training Mobile writer
 * source remains outside the version-controlled repository.
 */

const RFORM_COMPLETED_AT_FIX_VERSION = '0.1.0';
const RFORM_COMPLETED_AT_FIX_SOURCE = 'RFORM_MAINTENANCE';
const RFORM_COMPLETED_AT_FIX_MASTER_TITLE = 'RFORM_MASTER_DATA_v1';
const RFORM_COMPLETED_AT_FIX_ENABLE_PROPERTY = 'RFORM_COMPLETED_AT_REPAIR_ENABLED';

function inspectTrainingCompletedAtIntegrity() {
  const ctx = rformCompletedAtContext_();
  const candidates = rformCompletedAtFindCandidates_(ctx);
  return {
    mode: 'DRY_RUN',
    version: RFORM_COMPLETED_AT_FIX_VERSION,
    datastore: ctx.ss.getName(),
    candidateCount: candidates.length,
    candidates: candidates.map(rformCompletedAtPublicCandidate_)
  };
}

function applyTrainingCompletedAtRepair() {
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(RFORM_COMPLETED_AT_FIX_ENABLE_PROPERTY) || '').trim() !== 'YES') {
    throw new Error(
      'SAFETY_BLOCK: set Script Property ' +
      RFORM_COMPLETED_AT_FIX_ENABLE_PROPERTY +
      '=YES before applying repairs.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ctx = rformCompletedAtContext_();
    const candidates = rformCompletedAtFindCandidates_(ctx);
    const applied = [];

    candidates.forEach(function(candidate) {
      applied.push(rformCompletedAtApplyOne_(ctx, candidate));
    });

    return {
      status: 'APPLIED',
      version: RFORM_COMPLETED_AT_FIX_VERSION,
      datastore: ctx.ss.getName(),
      appliedCount: applied.length,
      applied: applied
    };
  } finally {
    lock.releaseLock();
  }
}

function repairTrainingCompletedAtForSession(sessionId) {
  const clean = String(sessionId || '').trim();
  if (!clean) throw new Error('VALIDATION:SESSION_ID_REQUIRED');

  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(RFORM_COMPLETED_AT_FIX_ENABLE_PROPERTY) || '').trim() !== 'YES') {
    throw new Error(
      'SAFETY_BLOCK: set Script Property ' +
      RFORM_COMPLETED_AT_FIX_ENABLE_PROPERTY +
      '=YES before applying repairs.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ctx = rformCompletedAtContext_();
    const candidate = rformCompletedAtFindCandidates_(ctx).filter(function(item) {
      return item.sessionId === clean;
    })[0];

    if (!candidate) {
      return {
        status: 'NO_CHANGE',
        sessionId: clean,
        reason: 'No CLOSED session with blank Completed_At and matching APPLIED TRAINING_CLOSE.'
      };
    }

    return rformCompletedAtApplyOne_(ctx, candidate);
  } finally {
    lock.releaseLock();
  }
}

function rformCompletedAtContext_() {
  const props = PropertiesService.getScriptProperties();
  const masterId = String(props.getProperty('MASTER_SPREADSHEET_ID') || '').trim();
  if (!masterId) throw new Error('CONFIG_MISSING:MASTER_SPREADSHEET_ID');

  const ss = SpreadsheetApp.openById(masterId);
  if (ss.getName() !== RFORM_COMPLETED_AT_FIX_MASTER_TITLE) {
    throw new Error('SAFETY_GUARD:EXPECTED_PRODUCTION_DATASTORE:' + ss.getName());
  }

  const sessions = ss.getSheetByName('TRAINING_SESSIONS');
  const inbox = ss.getSheetByName('INBOX_LOG');
  if (!sessions || !inbox) {
    throw new Error('SCHEMA_MISMATCH:TRAINING_COMPLETED_AT:sheets_missing');
  }

  const sh = rformCompletedAtHeaderMap_(sessions);
  const ih = rformCompletedAtHeaderMap_(inbox);

  rformCompletedAtRequireHeaders_(sh, [
    'Session_ID',
    'Session_Status',
    'Completed_At'
  ], 'TRAINING_SESSIONS');

  rformCompletedAtRequireHeaders_(ih, [
    'Inbox_Event_ID',
    'Event_Type',
    'Target_Record_ID',
    'Validation_Status',
    'Processing_Status',
    'Applied_At'
  ], 'INBOX_LOG');

  return { ss: ss, sessions: sessions, inbox: inbox, sh: sh, ih: ih };
}

function rformCompletedAtFindCandidates_(ctx) {
  const closeEvents = rformCompletedAtCloseEventMap_(ctx.inbox, ctx.ih);
  const lastRow = ctx.sessions.getLastRow();
  if (lastRow < 2) return [];

  const values = ctx.sessions
    .getRange(2, 1, lastRow - 1, ctx.sessions.getLastColumn())
    .getValues();

  const out = [];
  values.forEach(function(row, index) {
    const sessionId = String(row[ctx.sh.Session_ID - 1] || '').trim();
    const status = String(row[ctx.sh.Session_Status - 1] || '').trim().toUpperCase();
    const completedAt = row[ctx.sh.Completed_At - 1];

    if (!sessionId || status !== 'CLOSED' || rformCompletedAtHasValue_(completedAt)) return;

    const closeEvent = closeEvents[sessionId];
    if (!closeEvent) return;

    out.push({
      row: index + 2,
      sessionId: sessionId,
      closeEventId: closeEvent.eventId,
      closeAppliedAt: closeEvent.appliedAt,
      closeValidationStatus: closeEvent.validationStatus
    });
  });

  return out;
}

function rformCompletedAtCloseEventMap_(sheet, h) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  const values = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();

  const map = {};

  values.forEach(function(row) {
    const eventType = String(row[h.Event_Type - 1] || '').trim();
    const processing = String(row[h.Processing_Status - 1] || '').trim().toUpperCase();
    const validation = String(row[h.Validation_Status - 1] || '').trim().toUpperCase();
    const sessionId = String(row[h.Target_Record_ID - 1] || '').trim();
    const duplicate = h.Duplicate_Flag
      ? String(row[h.Duplicate_Flag - 1] || '').trim().toUpperCase()
      : '';

    if (eventType !== 'TRAINING_CLOSE') return;
    if (processing !== 'APPLIED') return;
    if (validation !== 'VALID' && validation !== 'WARNING') return;
    if (!sessionId || duplicate === 'DUPLICATE') return;

    const appliedAt = rformCompletedAtDate_(row[h.Applied_At - 1]);
    if (!appliedAt) return;

    const existing = map[sessionId];
    if (!existing || appliedAt.getTime() > existing.appliedAt.getTime()) {
      map[sessionId] = {
        eventId: String(row[h.Inbox_Event_ID - 1] || '').trim(),
        appliedAt: appliedAt,
        validationStatus: validation
      };
    }
  });

  return map;
}

function rformCompletedAtApplyOne_(ctx, candidate) {
  const completedCell = ctx.sessions.getRange(candidate.row, ctx.sh.Completed_At);

  // Re-check under lock immediately before the write.
  const statusNow = String(
    ctx.sessions.getRange(candidate.row, ctx.sh.Session_Status).getDisplayValue() || ''
  ).trim().toUpperCase();
  const completedNow = completedCell.getValue();

  if (statusNow !== 'CLOSED') {
    throw new Error('STATE_CHANGED:SESSION_NOT_CLOSED:' + candidate.sessionId);
  }
  if (rformCompletedAtHasValue_(completedNow)) {
    return {
      status: 'NO_CHANGE',
      sessionId: candidate.sessionId,
      reason: 'Completed_At already populated.'
    };
  }

  let auditRow = 0;
  try {
    completedCell
      .setValue(candidate.closeAppliedAt)
      .setNumberFormat('dd.mm.yyyy hh:mm');

    SpreadsheetApp.flush();

    const verified = completedCell.getValue();
    if (!rformCompletedAtHasValue_(verified)) {
      throw new Error('VERIFY_FAILED:COMPLETED_AT:' + candidate.sessionId);
    }

    auditRow = rformCompletedAtAppendAudit_(ctx, candidate);

    return {
      status: 'APPLIED',
      sessionId: candidate.sessionId,
      completedAt: Utilities.formatDate(
        candidate.closeAppliedAt,
        ctx.ss.getSpreadsheetTimeZone() || 'Europe/Moscow',
        'dd.MM.yyyy HH:mm'
      ),
      sourceCloseEventId: candidate.closeEventId,
      closeValidationStatus: candidate.closeValidationStatus,
      auditRow: auditRow
    };
  } catch (error) {
    completedCell.clearContent();
    if (auditRow) {
      ctx.inbox.getRange(auditRow, 1, 1, ctx.inbox.getLastColumn()).clearContent();
    }
    SpreadsheetApp.flush();
    throw error;
  }
}

function rformCompletedAtAppendAudit_(ctx, candidate) {
  const row = ctx.inbox.getLastRow() + 1;
  if (row > ctx.inbox.getMaxRows()) {
    ctx.inbox.insertRowsAfter(ctx.inbox.getMaxRows(), 10);
  }

  rformCompletedAtCopyScaffold_(ctx.inbox, row);

  const now = new Date();
  const auditId =
    'APP-COMPLETEDAT-' +
    Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        candidate.sessionId + '|' + candidate.closeEventId,
        Utilities.Charset.UTF_8
      )
    ).replace(/=+$/g, '').slice(0, 20).toUpperCase();

  const values = {
    Inbox_Event_ID: auditId,
    Received_At: now,
    Event_Date: candidate.closeAppliedAt,
    Event_Type: 'TRAINING_COMPLETED_AT_REPAIR',
    Raw_Message: JSON.stringify({
      sessionId: candidate.sessionId,
      sourceCloseEventId: candidate.closeEventId,
      completedAt: candidate.closeAppliedAt.toISOString()
    }),
    Parsed_Entity: 'TRAINING_SESSION',
    Target_Sheet: 'TRAINING_SESSIONS',
    Target_Record_ID: candidate.sessionId,
    Validation_Status: 'VALID',
    Missing_Fields: '',
    Processing_Status: 'APPLIED',
    Applied_At: now,
    Applied_By: 'OWNER',
    Source_Chat: RFORM_COMPLETED_AT_FIX_SOURCE,
    Version: RFORM_COMPLETED_AT_FIX_VERSION,
    Correction_Of: candidate.closeEventId,
    Note: 'Completed_At restored from confirmed APPLIED TRAINING_CLOSE timestamp.'
  };

  Object.keys(values).forEach(function(key) {
    if (ctx.ih[key]) ctx.inbox.getRange(row, ctx.ih[key]).setValue(values[key]);
  });

  if (ctx.ih.Duplicate_Flag) {
    ctx.inbox
      .getRange(row, ctx.ih.Duplicate_Flag)
      .setFormula(
        '=IF(A' + row + '="";"";IF(COUNTIF($A$2:$A$5000;A' + row + ')>1;"DUPLICATE";""))'
      );
  }

  if (ctx.ih.Received_At) {
    ctx.inbox.getRange(row, ctx.ih.Received_At).setNumberFormat('dd.mm.yyyy hh:mm');
  }
  if (ctx.ih.Event_Date) {
    ctx.inbox.getRange(row, ctx.ih.Event_Date).setNumberFormat('dd.mm.yyyy');
  }
  if (ctx.ih.Applied_At) {
    ctx.inbox.getRange(row, ctx.ih.Applied_At).setNumberFormat('dd.mm.yyyy hh:mm');
  }

  SpreadsheetApp.flush();

  const actualId = String(
    ctx.inbox.getRange(row, ctx.ih.Inbox_Event_ID).getDisplayValue() || ''
  ).trim();
  if (actualId !== auditId) {
    throw new Error('VERIFY_FAILED:INBOX_AUDIT_ID:' + candidate.sessionId);
  }

  return row;
}

function rformCompletedAtCopyScaffold_(sheet, row) {
  if (row <= 2) return;
  const source = sheet.getRange(row - 1, 1, 1, sheet.getLastColumn());
  const target = sheet.getRange(row, 1, 1, sheet.getLastColumn());
  source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
}

function rformCompletedAtHeaderMap_(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  return headers.reduce(function(map, value, index) {
    const key = String(value || '').trim();
    if (key) map[key] = index + 1;
    return map;
  }, {});
}

function rformCompletedAtRequireHeaders_(map, names, sheetName) {
  const missing = names.filter(function(name) { return !map[name]; });
  if (missing.length) {
    throw new Error('SCHEMA_MISMATCH:' + sheetName + ':' + missing.join(','));
  }
}

function rformCompletedAtHasValue_(value) {
  return value !== '' && value !== null && typeof value !== 'undefined';
}

function rformCompletedAtDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return new Date(value.getTime());
  }

  const text = String(value || '').trim();
  const ru = text.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!ru) return null;

  return new Date(
    Number(ru[3]),
    Number(ru[2]) - 1,
    Number(ru[1]),
    Number(ru[4]),
    Number(ru[5]),
    Number(ru[6] || 0)
  );
}

function rformCompletedAtPublicCandidate_(candidate) {
  return {
    sessionId: candidate.sessionId,
    sourceCloseEventId: candidate.closeEventId,
    closeAppliedAt: candidate.closeAppliedAt,
    closeValidationStatus: candidate.closeValidationStatus
  };
}
