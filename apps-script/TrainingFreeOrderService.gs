'use strict';

function swapTrainingFreeExercises(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const eventId = trainingFreeValidateEventId_(payload.eventId);
  const sessionId = trainingExerciseValidateSessionId_(payload.sessionId);
  const firstId = trainingFreeValidateExerciseInstanceId_(payload.firstExerciseInstanceId);
  const secondId = trainingFreeValidateExerciseInstanceId_(payload.secondExerciseInstanceId);
  trainingFreeValidateSource_(payload.source);
  if (firstId === secondId) throw new Error('VALIDATION:EXERCISE_SWAP_SAME_INSTANCE');

  const ctx = trainingFreeSetContext_(sessionId);
  const inboxId = trainingFreeInboxId_(eventId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const duplicate = trainingFreeFindRowByExact_(ctx.inbox, ctx.ih.Inbox_Event_ID, inboxId);
    if (duplicate) {
      return {status:'ALREADY_APPLIED',eventId,sessionId,version:RFORM_TRAINING_FREE_VERSION,state:getTrainingFreeSessionState(sessionId)};
    }
    const sessionRow = trainingFreeRequireFreeSessionRow_(ctx.sessions, ctx.sh, sessionId, true);
    const all = trainingFreeRowsByValue_(ctx.sets, ctx.th.Session_ID, sessionId);
    const firstRows = all.filter(x => String(x.values[ctx.th.Exercise_Instance_ID - 1] || '') === firstId);
    const secondRows = all.filter(x => String(x.values[ctx.th.Exercise_Instance_ID - 1] || '') === secondId);
    if (!firstRows.length || !secondRows.length) throw new Error('TRAINING_EXERCISE_INSTANCE_NOT_FOUND');

    const firstOrder = Number(firstRows[0].values[ctx.th.Exercise_Order - 1]);
    const secondOrder = Number(secondRows[0].values[ctx.th.Exercise_Order - 1]);
    if (!Number.isInteger(firstOrder) || !Number.isInteger(secondOrder)) throw new Error('VALIDATION:EXERCISE_ORDER');
    const previous = firstRows.concat(secondRows).map(x => ({row:x.row,order:x.values[ctx.th.Exercise_Order - 1]}));

    firstRows.forEach(x => ctx.sets.getRange(x.row, ctx.th.Exercise_Order).setValue(secondOrder));
    secondRows.forEach(x => ctx.sets.getRange(x.row, ctx.th.Exercise_Order).setValue(firstOrder));
    SpreadsheetApp.flush();

    try {
      trainingFreeWriteAudit_(ctx.inbox, ctx.ih, {
        inboxId,
        eventDate:ctx.sessions.getRange(sessionRow, ctx.sh.Date).getValue(),
        eventType:'TRAINING_FREE_EXERCISE_UPDATE',
        rawMessage:JSON.stringify(payload),
        parsedEntity:JSON.stringify({action:'SWAP_ORDER',firstExerciseInstanceId:firstId,secondExerciseInstanceId:secondId,firstOrder,secondOrder}),
        targetSheet:'TRAINING_SETS',
        targetRecordId:`${firstId},${secondId}`,
        note:'FREE exercise order swapped atomically.'
      });
    } catch (auditError) {
      previous.forEach(x => ctx.sets.getRange(x.row, ctx.th.Exercise_Order).setValue(x.order));
      SpreadsheetApp.flush();
      throw auditError;
    }

    return {status:'APPLIED',eventId,sessionId,version:RFORM_TRAINING_FREE_VERSION,state:getTrainingFreeSessionState(sessionId)};
  } finally {
    lock.releaseLock();
  }
}
