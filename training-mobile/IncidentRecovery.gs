/** Issue #77 editor-only correction. No RPC endpoint; no automatic DAY_CLOSURE. */
var RFormIncidentRecovery = (function() {
  'use strict';
  var DAY = 'D-20261023', SESSION = 'S-20261023-RECOVERY';
  var REQUEST = 'ISSUE77:RECOVERY:20261023:V1';
  function snapshot() {
    RFormSecurityService.assertSpreadsheetIdentity();
    var plan = RFormPlanService.getSessionPlan(SESSION, true);
    var setRows = RFormSheetRepository.readRowsByNumbers(
      RFormConfig.SHEETS.TRAINING_SETS,
      RFormSheetRepository.findRowsByExactValue(RFormConfig.SHEETS.TRAINING_SETS, 'Session_ID', SESSION));
    var day = RFormDailyService.getByDayId(DAY);
    var qaRows = RFormSheetRepository.findRowsByExactValue(RFormConfig.SHEETS.QA_LOG, 'QA_ID', 'QA-APP-20261023-148CD27ED2');
    if (qaRows.length !== 1) throw new Error('ISSUE77_BLOCKED:ORIGINAL_QA_EVIDENCE');
    var qa = RFormSheetRepository.readRow(RFormConfig.SHEETS.QA_LOG, qaRows[0]);
    if (qa.Record_ID !== SESSION || qa.Field_Name !== 'SAVE_RECOVERY') throw new Error('ISSUE77_BLOCKED:QA_IDENTITY');
    var original = JSON.parse(String(qa.Current_Value));
    var recovery = {};
    ['morningWeight','sleepHours','sleepQuality','readiness','shoulderPain','elbowPain','otherPain'].forEach(function(key) {
      recovery[key] = RFormUtils.toNumberOrBlank(original[key]);
    });
    var closures = RFormSheetRepository.readObjects(RFormConfig.SHEETS.DAY_CLOSURE).filter(function(row) {
      return row.Day_ID === DAY || RFormUtils.dateKeyFromAny(row.Date, row.Day_ID) === '2026-10-23';
    });
    var template = RFormSheetRepository.readRow(RFormConfig.SHEETS.DAILY, 4);
    return {
      day:day, rawDay:day ? RFormSheetRepository.readRow(RFormConfig.SHEETS.DAILY, day.rowNumber) : null,
      revision:RFormDailyService.revision(day, DAY),
      session:RFormSessionService.getById(SESSION),
      setsHash:RFormUtils.revision('SETS', setRows), closureCount:closures.length,
      planKeys:plan.map(function(row) { return row.recordKey; }),
      setKeys:setRows.map(function(row) { return String(row.Record_Key); }),
      setIds:setRows.map(function(row) { return String(row.Set_ID); }),
      duplicateFlags:setRows.filter(function(row) { return row.Duplicate_Flag; }),
      originalRecovery:recovery, templateConclusion:String(template.Daily_Conclusion || '')
    };
  }
  function preview() {
    var s = snapshot();
    return {dayId:DAY, sessionId:SESSION, expectedRevision:s.revision, expectedSetsHash:s.setsHash,
      day:s.day, session:s.session, setCount:s.setKeys.length,
      uniqueSetKeys:RFormUtils.unique(s.setKeys).length, duplicateFlags:s.duplicateFlags.length,
      closureCount:s.closureCount, originalRecovery:s.originalRecovery,
      planIdentity:RFormRecoveryPolicy.planIdentityReport(RFormSheetRepository.readObjects(RFormConfig.SHEETS.TRAINING_PLAN))};
  }
  function repair(expectedRevision, expectedSetsHash) {
    var lock = LockService.getScriptLock();
    lock.waitLock(RFormConfig.LOCK_TIMEOUT_MS);
    RFormSheetRepository.beginOperation();
    RFormSchemaService.beginOperation();
    try {
      RFormSecurityService.assertWriteContext(
        [RFormConfig.SHEETS.DAILY,RFormConfig.SHEETS.INBOX_LOG],
        [RFormConfig.SHEETS.DAY_CLOSURE,RFormConfig.SHEETS.TRAINING_PLAN,RFormConfig.SHEETS.TRAINING_SETS,RFormConfig.SHEETS.QA_LOG]);
      var id = RFormLoggingService.eventId('ISSUE77_CORRECTION',REQUEST);
      var auditRows = RFormSheetRepository.findRowsByExactValue(RFormConfig.SHEETS.INBOX_LOG,'Inbox_Event_ID',id);
      if (auditRows.length > 1) throw new Error('ISSUE77_BLOCKED:DUPLICATE_AUDIT');
      var audit = auditRows.length ? RFormSheetRepository.readRow(RFormConfig.SHEETS.INBOX_LOG,auditRows[0]) : null;
      if (audit && audit.Processing_Status === 'APPLIED') {
        if (audit.Target_Record_ID !== DAY || audit.Correction_Of !== DAY || audit.Event_Type !== 'CORRECTION') {
          throw new Error('ISSUE77_BLOCKED:AUDIT_IDENTITY');
        }
        return {ok:true,idempotentReplay:true,auditId:id,readback:preview()};
      }
      var baseline = RFormTests.runSafetyBaseline();
      if (!baseline.ok) throw new Error('ISSUE77_BLOCKED:SAFETY_BASELINE');
      var s = snapshot();
      RFormRecoveryPolicy.assertIncident(s, expectedRevision, expectedSetsHash);
      var now = new Date();
      var target = {
        Day_Type:'RECOVERY',Morning_Weight:73.7,
        Sleep_Hours:s.originalRecovery.sleepHours,Sleep_Quality:s.originalRecovery.sleepQuality,
        Readiness:s.originalRecovery.readiness,Shoulder_Pain:0,Elbow_Pain:0,Other_Pain:0,
        Steps:'',Day_Status:'OPEN',Daily_Conclusion:'',
        Updated_At:now,Updated_By:RFormConfig.WRITE_ACTOR
      };
      var auditPayload = JSON.stringify({issue:77,before:s.rawDay,target:target,
        expectedRevision:expectedRevision,expectedSetsHash:expectedSetsHash,setCount:11});
      if (auditPayload.length > RFormConfig.MAX_TEXT_LENGTH) throw new Error('ISSUE77_BLOCKED:AUDIT_TOO_LARGE');
      var auditRow;
      if (audit) {
        if (audit.Target_Record_ID !== DAY || audit.Raw_Message !== auditPayload) {
          // Timestamp differs on retry; compare the complete saved before-image and the stable guards.
          var savedPayload = JSON.parse(String(audit.Raw_Message));
          if (audit.Target_Record_ID !== DAY || savedPayload.expectedRevision !== expectedRevision ||
              savedPayload.expectedSetsHash !== expectedSetsHash ||
              RFormUtils.revision('BEFORE',savedPayload.before) !== RFormUtils.revision('BEFORE',s.rawDay)) {
            throw new Error('ISSUE77_BLOCKED:PARTIAL_AUDIT_REQUIRES_REVIEW');
          }
        }
        auditRow = auditRows[0];
      } else {
        auditRow = RFormSheetRepository.appendFromTemplate(RFormConfig.SHEETS.INBOX_LOG,{
          Inbox_Event_ID:id,Received_At:now,Event_Date:RFormUtils.parseDateKey('2026-10-23'),
          Event_Type:'CORRECTION',Raw_Message:auditPayload,Parsed_Entity:'DAILY_INCIDENT_REVISION',
          Target_Sheet:'DAILY',Target_Record_ID:DAY,Validation_Status:'VALID',Missing_Fields:'',
          Processing_Status:'VALIDATED',Applied_At:'',Applied_By:'OWNER',Source_Chat:RFormConfig.SOURCE_CHAT,
          Version:'issue77-v1',Correction_Of:DAY,
          Note:'Owner authorized ghost-day recovery; before-image preserved. No DAY_CLOSE or set mutation.'
        },'CREATE_INBOX_EVENT');
        SpreadsheetApp.flush();
        if (RFormSheetRepository.readRow(RFormConfig.SHEETS.INBOX_LOG,auditRow).Raw_Message !== auditPayload) {
          throw new Error('ISSUE77_BLOCKED:AUDIT_READBACK');
        }
      }
      var before = {};
      Object.keys(target).forEach(function(key) { before[key] = s.rawDay[key]; });
      try {
        RFormSheetRepository.writeFields(RFormConfig.SHEETS.DAILY,s.day.rowNumber,target,'REPAIR_GHOST_RECOVERY');
        SpreadsheetApp.flush();
        var result = snapshot();
        if (result.day.dayType !== 'RECOVERY' || result.day.morningWeight !== 73.7 ||
            result.day.sleepHours !== 7 || result.day.dayStatus !== 'OPEN' || result.day.dailyConclusion !== '' ||
            result.setsHash !== expectedSetsHash || result.closureCount !== 0 || result.session) {
          throw new Error('ISSUE77_BLOCKED:REPAIR_READBACK');
        }
      } catch (error) {
        // Restore exactly the authorized fields; preserve both the before-image and failed audit.
        RFormSheetRepository.writeFields(RFormConfig.SHEETS.DAILY,s.day.rowNumber,before,'REPAIR_GHOST_RECOVERY');
        SpreadsheetApp.flush();
        if (RFormDailyService.revision(RFormDailyService.getByDayId(DAY),DAY) !== expectedRevision) {
          throw new Error('ISSUE77_ROLLBACK_FAILED:' + error.message);
        }
        RFormSheetRepository.writeFields(RFormConfig.SHEETS.INBOX_LOG,auditRow,
          {Processing_Status:'ERROR',Note:'Correction rolled back: '+error.message},'UPDATE_INBOX_EVENT');
        throw error;
      }
      RFormSheetRepository.writeFields(RFormConfig.SHEETS.INBOX_LOG,auditRow,
        {Processing_Status:'APPLIED',Applied_At:new Date()},'UPDATE_INBOX_EVENT');
      SpreadsheetApp.flush();
      if (RFormSheetRepository.readRow(RFormConfig.SHEETS.INBOX_LOG,auditRow).Processing_Status !== 'APPLIED') {
        throw new Error('ISSUE77_BLOCKED:APPLIED_READBACK');
      }
      return {ok:true,idempotentReplay:false,auditId:id,readback:preview()};
    } finally {
      try { SpreadsheetApp.flush(); } finally {
        RFormSchemaService.endOperation();RFormSheetRepository.endOperation();lock.releaseLock();
      }
    }
  }
  return {preview:preview,repair:repair};
}());
function previewIssue77Recovery_() {
  var result=RFormIncidentRecovery.preview();console.log(JSON.stringify(result));return result;
}
