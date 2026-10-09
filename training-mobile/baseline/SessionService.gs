/** Завершение сессии и защита закрытой истории. */
var RFormSessionService = (function() {
  'use strict';

  var STATUS_CACHE_KEY = 'SESSION_STATUS_MAP';

  function normalize_(row) {
    if (!row) return null;
    return {
      rowNumber: row._rowNumber,
      sessionId: String(row.Session_ID || ''),
      dayId: String(row.Day_ID || ''),
      dateKey: RFormUtils.dateKeyFromAny(row.Date, row.Day_ID),
      sessionType: String(row.Session_Type || ''),
      plannedDuration: String(row.Planned_Duration || ''),
      actualDuration: RFormUtils.toNumberOrBlank(row.Actual_Duration),
      sleepHours: RFormUtils.toNumberOrBlank(row.Sleep_Hours),
      readiness: RFormUtils.toNumberOrBlank(row.Readiness),
      painBefore: String(row.Pain_Before || ''),
      painAfter: String(row.Pain_After || ''),
      recoveryStatus: String(row.Recovery_Status || ''),
      sessionGoal: String(row.Session_Goal || ''),
      mainResult: String(row.Main_Result || ''),
      planStatus: String(row.Plan_Status || ''),
      techniqueStatus: String(row.Technique_Status || ''),
      conclusion: String(row.Session_Conclusion || ''),
      decision: String(row.Session_Decision || ''),
      sessionStatus: String(row.Session_Status || ''),
      duplicateFlag: String(row.Duplicate_Flag || '')
    };
  }

  function revision_(session, sessionId) {
    if (!session) return 'NEW:' + sessionId;
    return RFormUtils.revision('SESSION', {
      sessionId: session.sessionId,
      dayId: session.dayId,
      dateKey: session.dateKey,
      sessionType: session.sessionType,
      actualDuration: session.actualDuration,
      painBefore: session.painBefore,
      painAfter: session.painAfter,
      recoveryStatus: session.recoveryStatus,
      mainResult: session.mainResult,
      planStatus: session.planStatus,
      techniqueStatus: session.techniqueStatus,
      conclusion: session.conclusion,
      decision: session.decision,
      sessionStatus: session.sessionStatus
    });
  }

  function getById(sessionId) {
    var rows = RFormSheetRepository.findRowsByExactValue(
      RFormConfig.SHEETS.TRAINING_SESSIONS,
      'Session_ID',
      sessionId
    );
    if (rows.length > 1) {
      RFormQualityService.duplicateAndThrow({
        sheet: RFormConfig.SHEETS.TRAINING_SESSIONS,
        field: 'Session_ID',
        value: sessionId,
        count: rows.length
      });
    }
    return rows.length ? normalize_(RFormSheetRepository.readRow(
      RFormConfig.SHEETS.TRAINING_SESSIONS,
      rows[0]
    )) : null;
  }

  function getStatusMap(sessionIds, fresh) {
    if (!fresh) {
      var cached = RFormAppCache.get(STATUS_CACHE_KEY);
      if (cached) {
        var subset = {};
        sessionIds.forEach(function(id) { subset[id] = cached[id] || ''; });
        return subset;
      }
    }

    var map = {};
    RFormSheetRepository.readObjects(RFormConfig.SHEETS.TRAINING_SESSIONS)
      .forEach(function(row) {
        if (row.Session_ID) map[String(row.Session_ID)] = String(row.Session_Status || '');
      });

    RFormAppCache.put(
      STATUS_CACHE_KEY,
      map,
      RFormConfig.CACHE_TTL_SECONDS.SESSION_INDEX
    );

    var result = {};
    sessionIds.forEach(function(id) { result[id] = map[id] || ''; });
    return result;
  }

  function assertMutable(sessionId) {
    var existing = getById(sessionId);
    if (existing) {
      RFormSecurityService.assertMutableStatus(
        existing.sessionStatus,
        RFormConfig.CLOSED_SESSION_STATUSES,
        'Сессия ' + sessionId
      );
    }
    return existing;
  }

  function validateFinish_(payload, planRows) {
    var duration = RFormUtils.assertNumber(payload.durationMinutes, {
      label: 'Продолжительность', min: 1, max: 600, integer: true, required: true
    });
    var recovery = payload.recovery || {};
    var postPain = RFormUtils.assertNumber(recovery.postPain, {
      label: 'Боль после тренировки', min: 0, max: 10, required: true
    });
    var hasBench = planRows.some(function(row) { return row.exerciseCategory === 'BENCH'; });
    var technique = RFormUtils.assertNumber(recovery.technique, {
      label: 'Техника жима', min: 1, max: 10, required: hasBench
    });

    return {
      duration: duration,
      postPain: postPain,
      technique: technique,
      sessionComment: RFormUtils.sanitizeText(
        payload.sessionComment || '',
        RFormConfig.MAX_COMMENT_LENGTH
      )
    };
  }

  function evaluateRecoveryStatus_(recovery) {
    var readiness = RFormUtils.toNumberOrBlank(recovery.readiness);
    var shoulder = RFormUtils.toNumberOrBlank(recovery.shoulderPain);
    var elbow = RFormUtils.toNumberOrBlank(recovery.elbowPain);
    var other = RFormUtils.toNumberOrBlank(recovery.otherPain);

    if (readiness !== '' && readiness >= 8 &&
        (shoulder === '' || shoulder <= 1) &&
        (elbow === '' || elbow <= 1) &&
        (other === '' || other <= 1)) {
      return 'RECOVERED';
    }
    return 'PARTIALLY_RECOVERED';
  }

  function evaluatePlanStatus_(planRows, actualRows, missingPlanSets) {
    if (missingPlanSets.length) return 'BELOW_PLAN';

    var above = false;
    var below = false;
    var byKey = {};
    actualRows.forEach(function(row) { byKey[row.recordKey] = row; });

    planRows.forEach(function(plan) {
      var actual = byKey[plan.recordKey];
      if (!actual) {
        below = true;
        return;
      }
      if (plan.planWeight !== '' && actual.weightKg !== '') {
        if (actual.weightKg > plan.planWeight) above = true;
        if (actual.weightKg < plan.planWeight) below = true;
      }
      if (plan.planReps !== '' && actual.reps !== '') {
        if (actual.reps > plan.planReps) above = true;
        if (actual.reps < plan.planReps) below = true;
      }
      if (plan.planRir !== '' && actual.rir !== '') {
        if (actual.rir > plan.planRir) above = true;
        if (actual.rir < plan.planRir - 1) below = true;
      }
    });

    if (below) return 'BELOW_PLAN';
    return above ? 'ABOVE_PLAN' : 'ON_PLAN';
  }

  function groupRows_(rows, planMode) {
    var map = {};
    rows.forEach(function(row) {
      var order = row.exerciseOrder;
      var name = row.exerciseName;
      var key = order + '|' + name;
      if (!map[key]) map[key] = { order: order, name: name, rows: [] };
      map[key].rows.push(row);
    });
    return Object.keys(map).map(function(key) { return map[key]; })
      .sort(function(a, b) { return a.order - b.order; });
  }

  function summarizePlan_(planRows) {
    return groupRows_(planRows, true).map(function(group) {
      var first = group.rows[0];
      var sameWeight = group.rows.every(function(row) { return row.planWeight === first.planWeight; });
      var sameReps = group.rows.every(function(row) { return row.planReps === first.planReps; });
      var load = sameWeight && sameReps
        ? RFormUtils.formatLoad(first.planWeight, first.planReps, group.rows.length)
        : group.rows.map(function(row) {
            return RFormUtils.formatLoad(row.planWeight, row.planReps, 1);
          }).join('; ');
      return group.name + ' ' + load;
    }).join('; ') + '.';
  }

  function summarizeActual_(actualRows) {
    return groupRows_(actualRows, false).map(function(group) {
      var first = group.rows[0];
      var sameWeight = group.rows.every(function(row) { return row.weightKg === first.weightKg; });
      var sameReps = group.rows.every(function(row) { return row.reps === first.reps; });
      var load = sameWeight && sameReps
        ? RFormUtils.formatLoad(first.weightKg, first.reps, group.rows.length)
        : group.rows.map(function(row) {
            return RFormUtils.formatLoad(row.weightKg, row.reps, 1);
          }).join('; ');
      var rir = group.rows.map(function(row) {
        return RFormUtils.formatNumber(row.rir);
      }).join('/');
      return group.name + ' ' + load + ' RIR ' + rir;
    }).join('; ') + '.';
  }

  function assertExistingIdentity_(existing, first) {
    if (existing.dayId !== first.dayId ||
        existing.dateKey !== first.dateKey ||
        existing.sessionType !== first.sessionType) {
      RFormQualityService.record({
        type: 'CONFLICT',
        severity: 'CRITICAL',
        sourceSheet: RFormConfig.SHEETS.TRAINING_SESSIONS,
        recordId: existing.sessionId,
        fieldName: 'Day_ID / Date / Session_Type',
        description: 'Существующая сессия не совпадает с активным планом.',
        currentValue: existing.dayId + ' / ' + existing.dateKey + ' / ' + existing.sessionType,
        expectedValue: first.dayId + ' / ' + first.dateKey + ' / ' + first.sessionType
      });
      throw new Error('Сессия не совпадает с активным планом.');
    }
  }

  function finish(payload) {
    RFormSecurityService.validatePayload(
      payload,
      ['requestId','sessionId','expectedRevision','recoveryExpectedRevision','durationMinutes','sessionComment','recovery','clientTimestamp','appVersion'],
      ['requestId','sessionId','expectedRevision','recoveryExpectedRevision','durationMinutes','recovery'],
      'Завершение тренировки'
    );
    RFormSecurityService.validatePayload(
      payload.recovery,
      ['morningWeight','sleepHours','sleepQuality','readiness','shoulderPain','elbowPain','otherPain','postPain','technique','comment'],
      ['postPain'],
      'Итоговое состояние'
    );

    var requestId = RFormSecurityService.assertRequestId(payload.requestId);
    var lock = LockService.getScriptLock();
    lock.waitLock(RFormConfig.LOCK_TIMEOUT_MS);
    var result;

    try {
      RFormSecurityService.assertWriteContext(
        [RFormConfig.SHEETS.TRAINING_SESSIONS, RFormConfig.SHEETS.DAILY, RFormConfig.SHEETS.INBOX_LOG],
        [RFormConfig.SHEETS.TRAINING_PLAN, RFormConfig.SHEETS.TRAINING_SETS]
      );

      var applied = RFormLoggingService.getApplied('FINISH_SESSION', requestId);
      if (applied) {
        var replayed = getById(applied.targetRecordId);
        if (!replayed) throw new Error('Журнал содержит APPLIED, но сессия не найдена.');
        return { sessionId: replayed.sessionId, idempotentReplay: true };
      }

      var planRows = RFormPlanService.getSessionPlan(payload.sessionId, true);
      var first = planRows[0];
      var existing = getById(payload.sessionId);
      if (existing) {
        RFormSecurityService.assertMutableStatus(
          existing.sessionStatus,
          RFormConfig.CLOSED_SESSION_STATUSES,
          'Сессия ' + payload.sessionId
        );
        assertExistingIdentity_(existing, first);
      }

      var expectedRevision = RFormSecurityService.assertExpectedRevision(payload.expectedRevision);
      var currentRevision = revision_(existing, payload.sessionId);
      if (currentRevision !== expectedRevision) {
        throw new Error(
          'Сессия изменилась после загрузки. Ожидалась версия ' + expectedRevision +
          ', фактическая версия ' + currentRevision + '. Обновите страницу.'
        );
      }

      var validated = validateFinish_(payload, planRows);
      var dailyResult = RFormDailyService.upsertWithinLock(
        planRows,
        payload.recovery,
        payload.recoveryExpectedRevision
      );
      var actualRows = RFormSetService.listBySession(payload.sessionId);
      if (!actualRows.length) throw new Error('Нет ни одного сохранённого подхода.');

      var actualByKey = {};
      actualRows.forEach(function(row) { actualByKey[row.recordKey] = row; });
      var missingPlanSets = planRows.filter(function(plan) {
        return !actualByKey[plan.recordKey];
      });

      var planStatus = evaluatePlanStatus_(planRows, actualRows, missingPlanSets);
      var techniqueStatus = RFormUtils.techniqueScoreToStatus(validated.technique);
      var recoveryStatus = evaluateRecoveryStatus_(payload.recovery);
      var mainResult = summarizeActual_(actualRows);
      var sessionGoal = summarizePlan_(planRows);
      var conclusion = [
        'Продолжительность ' + validated.duration + ' мин',
        validated.technique === '' ? '' : 'техника жима ' + validated.technique + '/10',
        'боль после ' + validated.postPain + '/10',
        'сохранено подходов ' + actualRows.length + ' из ' + planRows.length,
        validated.sessionComment
      ].filter(Boolean).join('; ') + '.';

      var values = {
        Planned_Duration: RFormConfig.DEFAULT_PLANNED_DURATION,
        Actual_Duration: validated.duration,
        Sleep_Hours: dailyResult.daily.sleepHours,
        Readiness: dailyResult.daily.readiness,
        Pain_Before: 'Плечо ' + (dailyResult.daily.shoulderPain === '' ? 0 : dailyResult.daily.shoulderPain) +
          '; локоть ' + (dailyResult.daily.elbowPain === '' ? 0 : dailyResult.daily.elbowPain) +
          '; другая боль ' + (dailyResult.daily.otherPain === '' ? 0 : dailyResult.daily.otherPain),
        Pain_After: 'Общая боль ' + validated.postPain + '/10',
        Recovery_Status: recoveryStatus,
        Session_Goal: sessionGoal,
        Main_Result: mainResult,
        Plan_Status: planStatus,
        Technique_Status: techniqueStatus,
        Session_Conclusion: conclusion,
        Session_Decision: 'Предварительный итог сформирован приложением; изменение следующего плана требует отдельного решения владельца.',
        Session_Status: 'CLOSED'
      };

      var targetRow;
      if (existing) {
        targetRow = existing.rowNumber;
        RFormSheetRepository.writeFields(
          RFormConfig.SHEETS.TRAINING_SESSIONS,
          targetRow,
          values,
          'UPDATE_DRAFT_SESSION'
        );
      } else {
        values.Session_ID = first.sessionId;
        values.Day_ID = first.dayId;
        values.Date = RFormUtils.parseDateKey(first.dateKey);
        values.Session_Type = first.sessionType;
        targetRow = RFormSheetRepository.appendFromTemplate(
          RFormConfig.SHEETS.TRAINING_SESSIONS,
          values,
          'CREATE_SESSION'
        );
      }

      SpreadsheetApp.flush();
      var saved = normalize_(RFormSheetRepository.readRow(
        RFormConfig.SHEETS.TRAINING_SESSIONS,
        targetRow
      ));
      if (saved.sessionId !== first.sessionId || saved.duplicateFlag === 'DUPLICATE') {
        RFormQualityService.duplicateAndThrow({
          sheet: RFormConfig.SHEETS.TRAINING_SESSIONS,
          field: 'Session_ID',
          value: first.sessionId,
          count: 2
        });
      }

      RFormDailyService.appendTrainingConclusionWithinLock(
        first.dayId,
        first.sessionType,
        mainResult
      );

      var logResult = RFormLoggingService.safeWriteApplied({
        operation: 'FINISH_SESSION',
        requestId: requestId,
        dateKey: first.dateKey,
        targetRecordId: first.sessionId,
        payload: {
          sessionId: first.sessionId,
          actualDuration: validated.duration,
          savedSets: actualRows.length,
          plannedSets: planRows.length,
          missingPlanSetIds: missingPlanSets.map(function(row) { return row.planSetId; }),
          postPain: validated.postPain,
          technique: validated.technique
        },
        validationStatus: missingPlanSets.length ? 'WARNING' : 'VALID',
        missingFields: missingPlanSets.map(function(row) { return row.planSetId; }).join(', '),
        note: 'TRAINING_SESSIONS и разрешённые поля DAILY обновлены. Питание и Day_Status не закрывались.'
      });

      SpreadsheetApp.flush();
      result = {
        sessionId: first.sessionId,
        idempotentReplay: false,
        missingPlanSets: missingPlanSets.length,
        planStatus: planStatus,
        loggingWarning: !logResult.ok
      };
    } finally {
      SpreadsheetApp.flush();
      lock.releaseLock();
    }

    invalidate();
    RFormAnalyticsService.invalidate();
    return result;
  }

  function invalidate() {
    RFormAppCache.remove(STATUS_CACHE_KEY);
  }

  return {
    getById: getById,
    getStatusMap: getStatusMap,
    assertMutable: assertMutable,
    finish: finish,
    revision: revision_,
    invalidate: invalidate
  };
}());
