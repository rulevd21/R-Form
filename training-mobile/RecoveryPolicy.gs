/** Pure recovery/plan invariants. No I/O, writes or status overrides. */
var RFormRecoveryPolicy = (function() {
  'use strict';
  function dayType(sessionType) {
    var type = String(sessionType || '');
    return type === 'RECOVERY' ? 'RECOVERY' : 'TRAINING_' + type;
  }
  function duplicates(values) {
    var seen = {}, duplicate = {};
    values.filter(Boolean).forEach(function(value) {
      if (seen[value]) duplicate[value] = true;
      seen[value] = true;
    });
    return Object.keys(duplicate);
  }
  function planIdentityReport(rows) {
    var active = rows.filter(function(row) {
      return ['ACTIVE','PLANNED'].indexOf(String(row.Plan_Status || '').toUpperCase()) !== -1;
    });
    return {
      duplicatePlanSetIds: duplicates(rows.map(function(row) { return row.Plan_Set_ID; })),
      duplicateVersionKeys: duplicates(rows.map(function(row) {
        return row.Record_Key ? String(row.Plan_ID || '') + '|' + row.Record_Key : '';
      })),
      duplicateActiveKeys: duplicates(active.map(function(row) { return row.Record_Key; })),
      missingVersionIds: rows.filter(function(row) {
        return row.Record_Key && !row.Plan_ID;
      }).map(function(row) { return row.Plan_Set_ID; }),
      activeCount: active.length
    };
  }
  function assertIncident(snapshot, expectedRevision, expectedSetsHash) {
    function require_(condition, message) { if (!condition) throw new Error('ISSUE77_BLOCKED:' + message); }
    require_(snapshot.day && snapshot.day.dayId === 'D-20261023', 'DAY_ID');
    require_(snapshot.day.dateKey === '2026-10-23', 'DATE');
    require_(snapshot.revision === expectedRevision, 'STALE_DAY_REVISION');
    require_(snapshot.setsHash === expectedSetsHash, 'STALE_SETS');
    require_(snapshot.closureCount === 0, 'DAY_CLOSURE_EXISTS');
    require_(!snapshot.session, 'SESSION_EXISTS');
    require_(snapshot.day.dayStatus === 'CLOSED' && snapshot.day.dayType === 'REST', 'NOT_GHOST_STATE');
    require_(snapshot.day.morningWeight === 71.85, 'UNEXPECTED_WEIGHT');
    require_(snapshot.day.dailyConclusion === snapshot.templateConclusion &&
      snapshot.templateConclusion.indexOf('05.08.2026') !== -1, 'NOT_TEMPLATE_CONCLUSION');
    require_(snapshot.planKeys.length === 11 && snapshot.setKeys.length === 11, 'SET_COUNT');
    require_(duplicates(snapshot.planKeys).length === 0 && duplicates(snapshot.setKeys).length === 0, 'DUPLICATE_KEY');
    require_(snapshot.planKeys.every(function(key) { return snapshot.setKeys.indexOf(key) !== -1; }), 'SET_IDENTITY');
    require_(snapshot.duplicateFlags.length === 0, 'DUPLICATE_FLAG');
    require_(snapshot.originalRecovery.morningWeight === 73.7 &&
      snapshot.originalRecovery.sleepHours === 7 &&
      snapshot.originalRecovery.sleepQuality === 9 &&
      snapshot.originalRecovery.readiness === 10 &&
      snapshot.originalRecovery.shoulderPain === 0 &&
      snapshot.originalRecovery.elbowPain === 0 &&
      snapshot.originalRecovery.otherPain === 0, 'ORIGINAL_RECOVERY_EVIDENCE');
    return true;
  }
  return {dayType:dayType, planIdentityReport:planIdentityReport, assertIncident:assertIncident};
}());
