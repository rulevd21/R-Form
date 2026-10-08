/** Идемпотентный журнал операций приложения в INBOX_LOG. */
var RFormLoggingService = (function() {
  'use strict';

  var OPERATION_MAP = {
    SAVE_RECOVERY: {
      eventType: 'TRAINING_PRE',
      parsedEntity: 'TRAINING_PRE',
      targetSheet: 'DAILY'
    },
    SAVE_SET: {
      eventType: 'TRAINING_SET',
      parsedEntity: 'TRAINING_SET',
      targetSheet: 'TRAINING_SETS'
    },
    FINISH_SESSION: {
      eventType: 'TRAINING_CLOSE',
      parsedEntity: 'TRAINING_SESSION',
      targetSheet: 'TRAINING_SESSIONS / TRAINING_SETS'
    }
  };

  // Additive FREE map. Legacy operation keys and event-id logic above are unchanged.
  var FREE_OPERATION_MAP = {
    FREE_SESSION_START: {
      eventType: 'TRAINING_FREE_SESSION_START',
      parsedEntity: 'TRAINING_FREE_SESSION',
      targetSheet: 'TRAINING_SESSIONS'
    },
    FREE_SET_CREATE: {
      eventType: 'TRAINING_FREE_SET_CREATE',
      parsedEntity: 'TRAINING_FREE_SET',
      targetSheet: 'TRAINING_SETS'
    },
    FREE_SET_UPDATE: {
      eventType: 'TRAINING_FREE_SET_UPDATE',
      parsedEntity: 'TRAINING_FREE_SET',
      targetSheet: 'TRAINING_SETS'
    },
    FREE_SET_DELETE: {
      eventType: 'TRAINING_FREE_SET_DELETE',
      parsedEntity: 'TRAINING_FREE_SET',
      targetSheet: 'TRAINING_SETS'
    },
    FREE_EXERCISE_UPDATE: {
      eventType: 'TRAINING_FREE_EXERCISE_UPDATE',
      parsedEntity: 'TRAINING_FREE_EXERCISE',
      targetSheet: 'TRAINING_SETS'
    },
    FREE_SESSION_COMPLETE: {
      eventType: 'TRAINING_FREE_SESSION_COMPLETE',
      parsedEntity: 'TRAINING_FREE_SESSION',
      targetSheet: 'TRAINING_SESSIONS'
    }
  };

  function eventId(operation, requestId) {
    var operationCode = String(operation || 'EVENT').replace(/[^A-Z0-9]/g, '').slice(0, 10);
    return 'APP-' + operationCode + '-' +
      RFormUtils.sha256(String(requestId)).slice(0, 16).toUpperCase();
  }

  function freeEventId(eventIdValue) {
    var clean = String(eventIdValue || '').trim();
    if (!/^[0-9a-fA-F-]{32,36}$/.test(clean)) {
      throw new Error('Некорректный FREE eventId.');
    }
    return 'APP-TRAINING-FREE-' + clean.replace(/-/g, '').toUpperCase();
  }

  function getEvent(operation, requestId) {
    var id = eventId(operation, requestId);
    var rows = RFormSheetRepository.findRowsByExactValue(
      RFormConfig.SHEETS.INBOX_LOG,
      'Inbox_Event_ID',
      id
    );
    if (rows.length > 1) {
      RFormQualityService.duplicateAndThrow({
        sheet: RFormConfig.SHEETS.INBOX_LOG,
        field: 'Inbox_Event_ID',
        value: id,
        count: rows.length
      });
    }
    return rows.length ? RFormSheetRepository.readRow(RFormConfig.SHEETS.INBOX_LOG, rows[0]) : null;
  }

  function getApplied(operation, requestId) {
    var event = getEvent(operation, requestId);
    if (!event || String(event.Processing_Status || '') !== 'APPLIED') return null;
    return {
      eventId: String(event.Inbox_Event_ID || ''),
      targetRecordId: String(event.Target_Record_ID || ''),
      note: String(event.Note || '')
    };
  }

  function getFreeEvent(operation, eventIdValue) {
    if (!FREE_OPERATION_MAP[operation]) {
      throw new Error('Неизвестная FREE операция журнала: ' + operation + '.');
    }
    var id = freeEventId(eventIdValue);
    var rows = RFormSheetRepository.findRowsByExactValue(
      RFormConfig.SHEETS.INBOX_LOG,
      'Inbox_Event_ID',
      id
    );
    if (rows.length > 1) {
      RFormQualityService.duplicateAndThrow({
        sheet: RFormConfig.SHEETS.INBOX_LOG,
        field: 'Inbox_Event_ID',
        value: id,
        count: rows.length
      });
    }
    if (!rows.length) return null;
    var event = RFormSheetRepository.readRow(RFormConfig.SHEETS.INBOX_LOG, rows[0]);
    var expectedType = FREE_OPERATION_MAP[operation].eventType;
    var actualType = String(event.Event_Type || '');
    if (actualType && actualType !== expectedType) {
      throw new Error(
        'CONFLICT:FREE_EVENT_ID_REUSED:' + id + ':' + actualType + ':' + expectedType
      );
    }
    return event;
  }

  function getAppliedFree(operation, eventIdValue) {
    var event = getFreeEvent(operation, eventIdValue);
    if (!event || String(event.Processing_Status || '') !== 'APPLIED') return null;
    return {
      eventId: String(event.Inbox_Event_ID || ''),
      targetRecordId: String(event.Target_Record_ID || ''),
      note: String(event.Note || '')
    };
  }

  function forceVersionText_(sheetName, rowNumber) {
    var map = RFormSheetRepository.getHeaderMap(sheetName, false);
    if (!map.Version) {
      throw new Error('На листе ' + sheetName + ' отсутствует поле Version.');
    }

    var versionCell = RFormSheetRepository.getSheet(sheetName)
      .getRange(rowNumber, map.Version);

    versionCell.setNumberFormat('@');
    versionCell.setValue(String(RFormConfig.APP_VERSION || ''));
  }

  function writeApplied(context) {
    var meta = OPERATION_MAP[context.operation];
    if (!meta) throw new Error('Неизвестная операция журнала: ' + context.operation + '.');

    var sheetName = RFormConfig.SHEETS.INBOX_LOG;
    var id = eventId(context.operation, context.requestId);
    var rows = RFormSheetRepository.findRowsByExactValue(sheetName, 'Inbox_Event_ID', id);
    if (rows.length > 1) {
      RFormQualityService.duplicateAndThrow({
        sheet: sheetName,
        field: 'Inbox_Event_ID',
        value: id,
        count: rows.length
      });
    }

    var now = new Date();
    var values = {
      Received_At: now,
      Event_Date: RFormUtils.parseDateKey(context.dateKey),
      Event_Type: meta.eventType,
      Raw_Message: RFormUtils.safeJson(context.payload || {}, RFormConfig.MAX_TEXT_LENGTH),
      Parsed_Entity: meta.parsedEntity,
      Target_Sheet: meta.targetSheet,
      Target_Record_ID: context.targetRecordId,
      Validation_Status: context.validationStatus || 'VALID',
      Missing_Fields: RFormUtils.sanitizeText(context.missingFields || '', 1000),
      Processing_Status: 'APPLIED',
      Applied_At: now,
      Applied_By: RFormConfig.INBOX_APPLIED_BY || 'OWNER',
      Source_Chat: RFormConfig.SOURCE_CHAT,
      Version: RFormConfig.APP_VERSION,
      Correction_Of: '',
      Note: RFormUtils.sanitizeText(context.note || '', 1500)
    };

    if (rows.length) {
      RFormSheetRepository.writeFields(sheetName, rows[0], values, 'UPDATE_INBOX_EVENT');
      forceVersionText_(sheetName, rows[0]);
      return id;
    }

    values.Inbox_Event_ID = id;
    var createdRow = RFormSheetRepository.appendFromTemplate(
      sheetName,
      values,
      'CREATE_INBOX_EVENT'
    );
    forceVersionText_(sheetName, createdRow);
    return id;
  }

  function writeAppliedFree(context) {
    var meta = FREE_OPERATION_MAP[context.operation];
    if (!meta) throw new Error('Неизвестная FREE операция журнала: ' + context.operation + '.');

    var sheetName = RFormConfig.SHEETS.INBOX_LOG;
    var id = freeEventId(context.eventId);
    var rows = RFormSheetRepository.findRowsByExactValue(sheetName, 'Inbox_Event_ID', id);
    if (rows.length > 1) {
      RFormQualityService.duplicateAndThrow({
        sheet: sheetName,
        field: 'Inbox_Event_ID',
        value: id,
        count: rows.length
      });
    }
    if (rows.length) {
      var existingEvent = RFormSheetRepository.readRow(sheetName, rows[0]);
      var existingType = String(existingEvent.Event_Type || '');
      if (existingType && existingType !== meta.eventType) {
        throw new Error(
          'CONFLICT:FREE_EVENT_ID_REUSED:' + id + ':' + existingType + ':' + meta.eventType
        );
      }
    }

    var now = new Date();
    var values = {
      Received_At: now,
      Event_Date: RFormUtils.parseDateKey(context.dateKey),
      Event_Type: meta.eventType,
      Raw_Message: RFormUtils.safeJson(context.payload || {}, RFormConfig.MAX_TEXT_LENGTH),
      Parsed_Entity: context.parsedEntity
        ? RFormUtils.safeJson(context.parsedEntity, RFormConfig.MAX_TEXT_LENGTH)
        : meta.parsedEntity,
      Target_Sheet: meta.targetSheet,
      Target_Record_ID: context.targetRecordId,
      Validation_Status: context.validationStatus || 'VALID',
      Missing_Fields: RFormUtils.sanitizeText(context.missingFields || '', 1000),
      Processing_Status: 'APPLIED',
      Applied_At: now,
      Applied_By: RFormConfig.INBOX_APPLIED_BY || 'OWNER',
      Source_Chat: RFormConfig.SOURCE_CHAT,
      Version: RFormConfig.APP_VERSION,
      Correction_Of: '',
      Note: RFormUtils.sanitizeText(context.note || '', 1500)
    };

    if (rows.length) {
      RFormSheetRepository.writeFields(sheetName, rows[0], values, 'UPDATE_INBOX_EVENT');
      forceVersionText_(sheetName, rows[0]);
      return id;
    }

    values.Inbox_Event_ID = id;
    var createdRow = RFormSheetRepository.appendFromTemplate(
      sheetName,
      values,
      'CREATE_INBOX_EVENT'
    );
    forceVersionText_(sheetName, createdRow);
    return id;
  }

  function safeWriteApplied(context) {
    try {
      return { ok: true, eventId: writeApplied(context), error: '' };
    } catch (error) {
      console.error('INBOX logging failed: ' + error.message);
      RFormQualityService.record({
        type: 'CONFLICT',
        severity: 'ERROR',
        sourceSheet: RFormConfig.SHEETS.INBOX_LOG,
        recordId: context.targetRecordId || context.requestId,
        fieldName: context.operation,
        description: 'Каноническая mutation выполнена, но INBOX_LOG не подтверждён: ' + error.message,
        currentValue: context.requestId,
        expectedValue: 'APPLIED event'
      });
      return { ok: false, eventId: '', error: error.message };
    }
  }

  function safeWriteAppliedFree(context) {
    try {
      return { ok: true, eventId: writeAppliedFree(context), error: '' };
    } catch (error) {
      console.error('FREE INBOX logging failed: ' + error.message);
      RFormQualityService.record({
        type: 'CONFLICT',
        severity: 'ERROR',
        sourceSheet: RFormConfig.SHEETS.INBOX_LOG,
        recordId: context.targetRecordId || context.eventId,
        fieldName: context.operation,
        description: 'FREE mutation выполнена, но INBOX_LOG не подтверждён: ' + error.message,
        currentValue: context.eventId,
        expectedValue: 'APPLIED FREE event'
      });
      return { ok: false, eventId: '', error: error.message };
    }
  }

  return {
    eventId: eventId,
    freeEventId: freeEventId,
    getEvent: getEvent,
    getApplied: getApplied,
    getFreeEvent: getFreeEvent,
    getAppliedFree: getAppliedFree,
    writeApplied: writeApplied,
    writeAppliedFree: writeAppliedFree,
    safeWriteApplied: safeWriteApplied,
    safeWriteAppliedFree: safeWriteAppliedFree
  };
}());
