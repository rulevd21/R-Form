// R/Form Channel Control v0.3.2
// Safe rescheduling from the Edit screen without invalidating an already verified content hash.

function rformCcRescheduleV032(payload) {
  rformCcRequirePayload_(payload, ['contentId', 'publishAtLocal']);

  const review = rformCcGetReviewStatusV03({contentId: payload.contentId});
  if (review.state !== 'VERIFIED' && review.state !== 'LOCKED') {
    throw new Error('Перед изменением даты/времени публикация должна быть проверена в Preview. Текущий статус: ' + review.state);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = rformCcFindQueueRow_(payload.contentId);
    if (!ctx) throw new Error('Content_ID not found: ' + payload.contentId);

    rformCcValidateSchedulable_(ctx.object);

    const local = String(payload.publishAtLocal || '').trim().replace('T', ' ');
    const publishAt = Utilities.parseDate(local, RFORM_CC.timeZone, 'yyyy-MM-dd HH:mm');
    if (!publishAt || isNaN(publishAt.getTime())) throw new Error('Некорректная дата/время публикации.');

    const prev = rformCcDeriveLifecycle_(ctx.object);
    rformCcSetByHeader_(ctx, 'Publish_At', publishAt);
    rformCcSetByHeader_(ctx, 'AutoPost_Allowed', 'YES');
    rformCcSetByHeader_(ctx, 'Publication_Status', 'SCHEDULED');
    rformCcSetByHeader_(ctx, 'Pipeline_Status', 'SCHEDULED · CHANNEL CONTROL · RESCHEDULED');
    if (ctx.headerMap.Preview_Review_Status !== undefined) {
      rformCcSetByHeader_(ctx, 'Preview_Review_Status', 'LOCKED');
    }
    rformCcSetByHeader_(ctx, 'Updated_At', new Date());

    const fresh = rformCcFindQueueRow_(payload.contentId).object;
    rformCcLog_(
      payload.contentId,
      'RESCHEDULE',
      prev,
      rformCcDeriveLifecycle_(fresh),
      'Publish_At=' + Utilities.formatDate(publishAt, RFORM_CC.timeZone, 'dd.MM.yyyy HH:mm'),
      fresh
    );
    return rformCcNormalizeQueueItem_(fresh);
  } finally {
    lock.releaseLock();
  }
}
