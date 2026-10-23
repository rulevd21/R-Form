/** Работа с состоянием дня без изменения питания и формульных полей. */
var RFormDailyService = (function() {
  'use strict';

  function normalize_(row) {
    if (!row) return null;
    return {
      rowNumber: row._rowNumber,
      dayId: String(row.Day_ID || ''),
      dateKey: RFormUtils.dateKeyFromAny(row.Date, row.Day_ID),
      dayType: String(row.Day_Type || ''),
      morningWeight: RFormUtils.toNumberOrBlank(row.Morning_Weight),
      averageWeight: RFormUtils.toNumberOrBlank(row.Weight_7D_Average),
      sleepHours: RFormUtils.toNumberOrBlank(row.Sleep_Hours),
      sleepQuality: RFormUtils.toNumberOrBlank(row.Sleep_Quality),
      readiness: RFormUtils.toNumberOrBlank(row.Readiness),
      shoulderPain: RFormUtils.toNumberOrBlank(row.Shoulder_Pain),
      elbowPain: RFormUtils.toNumberOrBlank(row.Elbow_Pain),
      otherPain: RFormUtils.toNumberOrBlank(row.Other_Pain),
      dayStatus: String(row.Day_Status || ''),
      dailyConclusion: String(row.Daily_Conclusion || ''),
      duplicateFlag: String(row.Duplicate_Flag || '')
    };
  }

  function revision_(daily, dayId) {
    if (!daily) return 'NEW:' + dayId;
    return RFormUtils.revision('DAY', {
      dayId: daily.dayId,
      dateKey: daily.dateKey,
      dayType: daily.dayType,
      morningWeight: daily.morningWeight,
      sleepHours: daily.sleepHours,
      sleepQuality: daily.sleepQuality,
      readiness: daily.readiness,
      shoulderPain: daily.shoulderPain,
      elbowPain: daily.elbowPain,
      otherPain: daily.otherPain,
      dayStatus: daily.dayStatus,
      dailyConclusion: daily.dailyConclusion
    });
  }

  function getByDayId(dayId) {
    var rows = RFormSheetRepository.findRowsByExactValue(
      RFormConfig.SHEETS.DAILY,
      'Day_ID',
      dayId
    );
    if (rows.length > 1) {
      RFormQualityService.duplicateAndThrow({
        sheet: RFormConfig.SHEETS.DAILY,
        field: 'Day_ID',
        value: dayId,
        count: rows.length
      });
    }
    return rows.length ? normalize_(RFormSheetRepository.readRow(
      RFormConfig.SHEETS.DAILY,
      rows[0]
    )) : null;
  }

  function validateRecovery_(recovery) {
    var source = recovery || {};
    return {
      morningWeight: RFormUtils.assertNumber(source.morningWeight, {
        label: 'Утренний вес', min: 0, max: 300, required: false
      }),
      sleepHours: RFormUtils.assertNumber(source.sleepHours, {
        label: 'Сон', min: 0, max: 24, required: false
      }),
      sleepQuality: RFormUtils.assertNumber(source.sleepQuality, {
        label: 'Качество сна', min: 1, max: 10, required: false
      }),
      readiness: RFormUtils.assertNumber(source.readiness, {
        label: 'Готовность', min: 1, max: 10, required: false
      }),
      shoulderPain: RFormUtils.assertNumber(source.shoulderPain, {
        label: 'Боль в плече', min: 0, max: 10, required: false
      }),
      elbowPain: RFormUtils.assertNumber(source.elbowPain, {
        label: 'Боль в локте', min: 0, max: 10, required: false
      }),
      otherPain: RFormUtils.assertNumber(source.otherPain, {
        label: 'Другая боль', min: 0, max: 10, required: false
      }),
      comment: RFormUtils.sanitizeText(source.comment || '', RFormConfig.MAX_COMMENT_LENGTH)
    };
  }

  function assertExpectedRevision_(existing, expectedRevision, dayId) {
    var expected = RFormSecurityService.assertExpectedRevision(expectedRevision);
    var current = revision_(existing, dayId);
    if (current !== expected) {
      throw new Error(
        'Состояние дня изменилось после загрузки. Ожидалась версия ' + expected +
        ', фактическая версия ' + current + '. Обновите страницу.'
      );
    }
  }

  function upsertWithinLock(planRows, recoveryInput, expectedRevision) {
    var first = planRows[0];
    var recovery = validateRecovery_(recoveryInput);
    var existing = getByDayId(first.dayId);

    if (existing) {
      RFormSecurityService.assertMutableStatus(
        existing.dayStatus,
        RFormConfig.CLOSED_DAY_STATUSES,
        'День ' + first.dayId
      );
      if (existing.dateKey !== first.dateKey || existing.dayType !== RFormRecoveryPolicy.dayType(first.sessionType)) {
        RFormQualityService.record({
          type: 'CONFLICT',
          severity: 'CRITICAL',
          sourceSheet: RFormConfig.SHEETS.DAILY,
          recordId: first.dayId,
          fieldName: 'Date / Day_Type',
          description: 'DAILY не совпадает с активным тренировочным планом.',
          currentValue: existing.dateKey + ' / ' + existing.dayType,
          expectedValue: first.dateKey + ' / TRAINING_' + first.sessionType
        });
        throw new Error('DAILY не совпадает с активным планом. Запись заблокирована.');
      }
      assertExpectedRevision_(existing, expectedRevision, first.dayId);

      RFormSheetRepository.writeFields(
        RFormConfig.SHEETS.DAILY,
        existing.rowNumber,
        {
          Morning_Weight: recovery.morningWeight,
          Sleep_Hours: recovery.sleepHours,
          Sleep_Quality: recovery.sleepQuality,
          Readiness: recovery.readiness,
          Shoulder_Pain: recovery.shoulderPain,
          Elbow_Pain: recovery.elbowPain,
          Other_Pain: recovery.otherPain,
          Updated_At: new Date(),
          Updated_By: RFormConfig.WRITE_ACTOR
        },
        'UPDATE_RECOVERY'
      );
    } else {
      assertExpectedRevision_(null, expectedRevision, first.dayId);
      RFormSheetRepository.appendFromTemplate(
        RFormConfig.SHEETS.DAILY,
        {
          Date: RFormUtils.parseDateKey(first.dateKey),
          Day_Type: RFormRecoveryPolicy.dayType(first.sessionType),
          Morning_Weight: recovery.morningWeight,
          Sleep_Hours: recovery.sleepHours,
          Sleep_Quality: recovery.sleepQuality,
          Readiness: recovery.readiness,
          Shoulder_Pain: recovery.shoulderPain,
          Elbow_Pain: recovery.elbowPain,
          Other_Pain: recovery.otherPain,
          Day_Status: 'OPEN',
          Daily_Conclusion: 'Старт тренировочного дня через R/Form Training Mobile.',
          Updated_At: new Date(),
          Updated_By: RFormConfig.WRITE_ACTOR
        },
        'CREATE_DAILY'
      );
    }

    SpreadsheetApp.flush();
    var saved = getByDayId(first.dayId);
    if (!saved) {
      RFormQualityService.record({
        type: 'FORMULA_ERROR',
        severity: 'CRITICAL',
        sourceSheet: RFormConfig.SHEETS.DAILY,
        recordId: first.dayId,
        fieldName: 'Day_ID',
        description: 'После записи не сформирован ожидаемый Day_ID.',
        expectedValue: first.dayId
      });
      throw new Error('После записи не удалось подтвердить Day_ID.');
    }
    if (saved.duplicateFlag === 'DUPLICATE') {
      RFormQualityService.duplicateAndThrow({
        sheet: RFormConfig.SHEETS.DAILY,
        field: 'Day_ID',
        value: first.dayId,
        count: 2
      });
    }
    return {
      daily: saved,
      revision: revision_(saved, first.dayId),
      comment: recovery.comment
    };
  }

  function saveRecovery(payload) {
    RFormSecurityService.validatePayload(
      payload,
      ['requestId','sessionId','expectedRevision','morningWeight','sleepHours','sleepQuality','readiness','shoulderPain','elbowPain','otherPain','comment','clientTimestamp','appVersion'],
      ['requestId','sessionId','expectedRevision'],
      'Сохранение состояния'
    );
    var requestId = RFormSecurityService.assertRequestId(payload.requestId);
    var lock = LockService.getScriptLock();
    lock.waitLock(RFormConfig.LOCK_TIMEOUT_MS);
    RFormSheetRepository.beginOperation();
    RFormSchemaService.beginOperation();

    try {
      RFormSecurityService.assertWriteContext(
        [RFormConfig.SHEETS.DAILY, RFormConfig.SHEETS.INBOX_LOG],
        [RFormConfig.SHEETS.TRAINING_PLAN, RFormConfig.SHEETS.TRAINING_SESSIONS]
      );

      var applied = RFormLoggingService.getApplied('SAVE_RECOVERY', requestId);
      if (applied) {
        var existingApplied = getByDayId(applied.targetRecordId);
        return {
          ok: true,
          idempotentReplay: true,
          recovery: existingApplied,
          revision: revision_(existingApplied, applied.targetRecordId)
        };
      }

      var planRows = RFormPlanService.getSessionPlan(payload.sessionId, true);
      RFormSessionService.assertMutable(payload.sessionId);
      var result = upsertWithinLock(planRows, payload, payload.expectedRevision);

      var logResult = RFormLoggingService.safeWriteApplied({
        operation: 'SAVE_RECOVERY',
        requestId: requestId,
        dateKey: planRows[0].dateKey,
        targetRecordId: planRows[0].dayId,
        payload: {
          sessionId: payload.sessionId,
          morningWeight: result.daily.morningWeight,
          sleepHours: result.daily.sleepHours,
          sleepQuality: result.daily.sleepQuality,
          readiness: result.daily.readiness,
          shoulderPain: result.daily.shoulderPain,
          elbowPain: result.daily.elbowPain,
          otherPain: result.daily.otherPain,
          comment: result.comment
        },
        note: 'Состояние сохранено; Weight_7D_Average и питание не изменялись.'
      });

      return {
        ok: true,
        idempotentReplay: false,
        recovery: result.daily,
        revision: result.revision,
        loggingWarning: !logResult.ok
      };
    } finally {
      // Первый flush выполняется в upsertWithinLock для проверки вычисляемых
      // полей DAILY. Здесь нужен один финальный flush до releaseLock, чтобы
      // INBOX_LOG.APPLIED был видим следующему запросу.
      try {
        SpreadsheetApp.flush();
      } finally {
        RFormSchemaService.endOperation();
        RFormSheetRepository.endOperation();
        lock.releaseLock();
      }
    }
  }

  function appendTrainingConclusionWithinLock(dayId, sessionType, mainResult) {
    var daily = getByDayId(dayId);
    if (!daily) return { updated: false, reason: 'DAILY_NOT_FOUND' };

    if (RFormConfig.CLOSED_DAY_STATUSES.indexOf(daily.dayStatus) !== -1) {
      RFormQualityService.record({
        type: 'CONFLICT',
        severity: 'WARNING',
        sourceSheet: RFormConfig.SHEETS.DAILY,
        recordId: dayId,
        fieldName: 'Daily_Conclusion',
        description: 'Тренировка закрыта после закрытия дня; DAILY не изменён.',
        currentValue: daily.dayStatus,
        expectedValue: 'OPEN'
      });
      return { updated: false, reason: 'DAY_CLOSED' };
    }

    var marker = 'Тренировка ' + sessionType + ' завершена через R/Form Training Mobile.';
    if (daily.dailyConclusion.indexOf(marker) !== -1) {
      return { updated: false, reason: 'ALREADY_PRESENT' };
    }

    var addition = marker + ' ' + mainResult;
    var updated = daily.dailyConclusion
      ? daily.dailyConclusion + ' ' + addition
      : addition;

    RFormSheetRepository.writeFields(
      RFormConfig.SHEETS.DAILY,
      daily.rowNumber,
      {
        Daily_Conclusion: RFormUtils.sanitizeText(updated, RFormConfig.MAX_TEXT_LENGTH),
        Updated_At: new Date(),
        Updated_By: RFormConfig.WRITE_ACTOR
      },
      'APPEND_DAILY_CONCLUSION'
    );
    return { updated: true };
  }

  function getBodyWeight(dayId) {
    var daily = getByDayId(dayId);
    return daily ? daily.morningWeight : '';
  }

  return {
    getByDayId: getByDayId,
    getBodyWeight: getBodyWeight,
    saveRecovery: saveRecovery,
    upsertWithinLock: upsertWithinLock,
    appendTrainingConclusionWithinLock: appendTrainingConclusionWithinLock,
    revision: revision_
  };
}());
