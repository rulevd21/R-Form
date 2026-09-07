// R/Form Channel Control v0.3 enhancements
// Preview verification lock, exact outbound simulation, safe scheduling and next-publication support.

const RFORM_CC_V03 = Object.freeze({
  version: '0.3.0',
  reviewHeaders: Object.freeze([
    'Preview_Review_Hash',
    'Preview_Reviewed_At',
    'Preview_Reviewed_By',
    'Preview_Review_Status'
  ])
});

function rformCcSetupV03() {
  const ss = SpreadsheetApp.openById(RFORM_CC.masterSpreadsheetId);
  const sheet = ss.getSheetByName(RFORM_CC.queueSheet);
  if (!sheet) throw new Error('Sheet not found: ' + RFORM_CC.queueSheet);
  rformCcEnsureReviewHeadersV03_(sheet);
  return {
    ok: true,
    version: RFORM_CC_V03.version,
    headers: RFORM_CC_V03.reviewHeaders.slice(),
    queueSheet: sheet.getName()
  };
}

function rformCcGetPreviewV03(payload) {
  rformCcRequirePayload_(payload, ['contentId']);
  const base = rformCcGetPreviewV021(payload);
  const item = base.item;
  item.Telegram_Text = String(item.Telegram_Text || '').trim();
  const warnings = (base.warnings || []).slice();

  let visuals = base.visuals || [];
  let exactVisual = {visuals: visuals, signatures: [], warning: ''};
  const mode = String(item.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase();
  if (mode !== 'TEXT_ONLY') {
    exactVisual = rformCcResolveAutopostVisualsV03_(String(item.Telegram_Visual_URL || '').trim());
    visuals = exactVisual.visuals;
    if (exactVisual.warning) warnings.push(exactVisual.warning);
  }

  const signature = rformCcBuildReviewSignatureV03_(item, exactVisual.signatures);
  const review = rformCcGetStoredReviewStateV03_(payload.contentId, signature.hash);
  const outbound = rformCcBuildOutboundV03_(item, visuals);
  (outbound.warnings || []).forEach(w => warnings.push(w));

  return {
    ok: true,
    item: item,
    visuals: visuals,
    warnings: rformCcUniqueV03_(warnings),
    textLength: String(item.Telegram_Text || '').length,
    previewGeneratedAt: Utilities.formatDate(new Date(), RFORM_CC.timeZone, 'dd.MM.yyyy HH:mm:ss'),
    review: review,
    outbound: outbound,
    version: RFORM_CC_V03.version
  };
}

function rformCcMarkPreviewReviewedV03(payload) {
  rformCcRequirePayload_(payload, ['contentId']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(RFORM_CC.masterSpreadsheetId);
    const sheet = ss.getSheetByName(RFORM_CC.queueSheet);
    rformCcEnsureReviewHeadersV03_(sheet);

    let ctx = rformCcFindQueueRow_(payload.contentId);
    if (!ctx) throw new Error('Content_ID not found: ' + payload.contentId);
    const item = rformCcNormalizeQueueItem_(ctx.object);
    const exactVisual = String(item.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase() === 'TEXT_ONLY'
      ? {signatures: []}
      : rformCcResolveAutopostVisualsV03_(String(item.Telegram_Visual_URL || '').trim());
    const signature = rformCcBuildReviewSignatureV03_(item, exactVisual.signatures || []);
    const now = new Date();
    const actor = Session.getActiveUser().getEmail() || 'owner';

    // Header map may have changed after setup; refetch context.
    ctx = rformCcFindQueueRow_(payload.contentId);
    rformCcSetByHeader_(ctx, 'Preview_Review_Hash', signature.hash);
    rformCcSetByHeader_(ctx, 'Preview_Reviewed_At', now);
    rformCcSetByHeader_(ctx, 'Preview_Reviewed_By', actor);
    rformCcSetByHeader_(ctx, 'Preview_Review_Status', 'VERIFIED');
    rformCcSetByHeader_(ctx, 'Updated_At', now);

    const fresh = rformCcFindQueueRow_(payload.contentId).object;
    rformCcLog_(payload.contentId, 'PREVIEW_VERIFIED', rformCcDeriveLifecycle_(fresh), rformCcDeriveLifecycle_(fresh),
      'hash=' + signature.hash.slice(0, 12), fresh);

    return {
      state: 'VERIFIED',
      hash: signature.hash,
      reviewedAt: Utilities.formatDate(now, RFORM_CC.timeZone, 'dd.MM.yyyy HH:mm:ss'),
      reviewedBy: actor
    };
  } finally {
    lock.releaseLock();
  }
}

function rformCcGetReviewStatusV03(payload) {
  rformCcRequirePayload_(payload, ['contentId']);
  const ctx = rformCcFindQueueRow_(payload.contentId);
  if (!ctx) throw new Error('Content_ID not found: ' + payload.contentId);
  const item = rformCcNormalizeQueueItem_(ctx.object);
  const exactVisual = String(item.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase() === 'TEXT_ONLY'
    ? {signatures: []}
    : rformCcResolveAutopostVisualsV03_(String(item.Telegram_Visual_URL || '').trim());
  const signature = rformCcBuildReviewSignatureV03_(item, exactVisual.signatures || []);
  return rformCcGetStoredReviewStateV03_(payload.contentId, signature.hash);
}

function rformCcScheduleV03(payload) {
  rformCcRequirePayload_(payload, ['contentId', 'publishAt']);
  const status = rformCcGetReviewStatusV03({contentId: payload.contentId});
  if (status.state !== 'VERIFIED' && status.state !== 'LOCKED') {
    throw new Error('Перед планированием публикацию нужно открыть в предпросмотре и нажать «Проверено». Текущий статус: ' + status.state);
  }

  const result = rformCcSchedule(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = rformCcFindQueueRow_(payload.contentId);
    if (ctx && ctx.headerMap.Preview_Review_Status !== undefined) {
      rformCcSetByHeader_(ctx, 'Preview_Review_Status', 'LOCKED');
    }
  } finally {
    lock.releaseLock();
  }
  return result;
}

function rformCcSaveDraftV03(payload) {
  const result = rformCcSaveDraft(payload);
  rformCcInvalidateReviewV03_({contentId: payload.contentId, reason: 'Draft changed in Channel Control'});
  return result;
}

function rformCcInvalidateReviewV03_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(RFORM_CC.masterSpreadsheetId);
    const sheet = ss.getSheetByName(RFORM_CC.queueSheet);
    rformCcEnsureReviewHeadersV03_(sheet);
    const ctx = rformCcFindQueueRow_(payload.contentId);
    if (!ctx) return;

    if (ctx.headerMap.Preview_Review_Status !== undefined) {
      rformCcSetByHeader_(ctx, 'Preview_Review_Status', 'RECHECK_REQUIRED');
    }
    if (String(ctx.object.Publication_Status || '').toUpperCase() === 'SCHEDULED') {
      rformCcSetByHeader_(ctx, 'AutoPost_Allowed', 'NO');
      rformCcSetByHeader_(ctx, 'Publication_Status', 'REVIEW');
      if (ctx.headerMap.Pipeline_Status !== undefined) {
        rformCcSetByHeader_(ctx, 'Pipeline_Status', 'REVIEW REQUIRED · CONTENT CHANGED AFTER PREVIEW');
      }
    }
    const fresh = rformCcFindQueueRow_(payload.contentId).object;
    rformCcLog_(payload.contentId, 'PREVIEW_INVALIDATED', rformCcDeriveLifecycle_(fresh), rformCcDeriveLifecycle_(fresh), payload.reason || '', fresh);
  } finally {
    lock.releaseLock();
  }
}

function rformCcGetNextPublicationV03() {
  const master = SpreadsheetApp.openById(RFORM_CC.masterSpreadsheetId);
  const queue = rformCcReadSheetObjects_(master.getSheetByName(RFORM_CC.queueSheet))
    .filter(r => r.Content_ID)
    .map(r => rformCcNormalizeQueueItem_(r))
    .filter(r => ['SCHEDULED', 'APPROVED', 'REVIEW', 'PLANNED'].includes(r.Lifecycle_State));

  if (!queue.length) return {item: null, review: null};
  const rank = {SCHEDULED: 0, APPROVED: 1, REVIEW: 2, PLANNED: 3};
  queue.sort((a, b) => {
    const ra = rank[a.Lifecycle_State] ?? 9;
    const rb = rank[b.Lifecycle_State] ?? 9;
    if (ra !== rb) return ra - rb;
    const da = rformCcSortDateV03_(a.Publish_At || a.Date);
    const db = rformCcSortDateV03_(b.Publish_At || b.Date);
    return da - db;
  });
  const item = queue[0];
  let review = null;
  try { review = rformCcGetReviewStatusV03({contentId: item.Content_ID}); } catch (e) { review = {state: 'UNKNOWN', error: e.message}; }
  return {item: item, review: review, version: RFORM_CC_V03.version};
}

function rformCcGetStoredReviewStateV03_(contentId, currentHash) {
  const ctx = rformCcFindQueueRow_(contentId);
  if (!ctx) throw new Error('Content_ID not found: ' + contentId);
  const stored = String(ctx.object.Preview_Review_Hash || '').trim();
  const reviewedAt = ctx.object.Preview_Reviewed_At || '';
  const reviewedBy = ctx.object.Preview_Reviewed_By || '';
  const publication = String(ctx.object.Publication_Status || '').toUpperCase();
  if (!stored) return {state: 'NOT_REVIEWED', currentHash: currentHash, reviewedAt: '', reviewedBy: ''};
  if (stored !== currentHash) return {state: 'RECHECK_REQUIRED', currentHash: currentHash, storedHash: stored, reviewedAt: reviewedAt, reviewedBy: reviewedBy};
  return {state: publication === 'SCHEDULED' ? 'LOCKED' : 'VERIFIED', currentHash: currentHash, storedHash: stored, reviewedAt: reviewedAt, reviewedBy: reviewedBy};
}

function rformCcBuildReviewSignatureV03_(item, visualSignatures) {
  const canonical = JSON.stringify({
    mode: String(item.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase(),
    text: String(item.Telegram_Text || '').trim(),
    visualUrl: String(item.Telegram_Visual_URL || '').trim(),
    visuals: visualSignatures || []
  });
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonical, Utilities.Charset.UTF_8);
  const hash = bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  return {hash: hash, canonical: canonical};
}

function rformCcResolveAutopostVisualsV03_(url) {
  if (!url) return {visuals: [], signatures: [], warning: 'Telegram_Visual_URL пуст.'};
  const id = rformCcExtractDriveIdV03_(url);
  if (!id) return {visuals: [], signatures: [], warning: 'Текущий telegram_autopost_v0_3 поддерживает для media-постов папку Google Drive. URL не распознан как Drive.'};

  let folder;
  try {
    folder = DriveApp.getFolderById(id);
  } catch (e) {
    return {visuals: [], signatures: [], warning: 'Текущий telegram_autopost_v0_3 ожидает ссылку на папку Google Drive. Не удалось открыть папку: ' + e.message};
  }

  const rows = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const mime = f.getMimeType();
    if (mime === MimeType.PNG || mime === 'image/jpeg') {
      rows.push({
        name: f.getName(),
        id: f.getId(),
        size: f.getSize(),
        updated: f.getLastUpdated().toISOString(),
        sourceUrl: f.getUrl(),
        previewUrl: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(f.getId()) + '&sz=w1800'
      });
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const visualRows = rows.slice(0, 10);
  const warning = rows.length > 10 ? 'В папке ' + rows.length + ' изображений. Autopost отправит только первые 10 по имени файла.' : '';
  return {
    visuals: visualRows.map(x => ({name: x.name, previewUrl: x.previewUrl, sourceUrl: x.sourceUrl, id: x.id})),
    signatures: visualRows.map(x => ({id: x.id, name: x.name, size: x.size, updated: x.updated})),
    warning: warning
  };
}

function rformCcBuildOutboundV03_(item, visuals) {
  const mode = String(item.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase();
  const text = String(item.Telegram_Text || '').trim();
  const n = Math.min((visuals || []).length, 10);
  const warnings = [];
  let segments = [];

  if (mode === 'TEXT_ONLY') {
    segments = [{type: 'TEXT_MESSAGE', label: 'Текстовое сообщение', text: text}];
  } else if (mode === 'PHOTO_CAPTION') {
    if (!n) warnings.push('Нет изображения, совместимого с текущим autopost.');
    if (text.length <= 1024) {
      segments = [{type: 'PHOTO_CAPTION', label: 'Фото + подпись', visualCount: Math.min(n, 1), text: text}];
    } else {
      segments = [
        {type: 'PHOTO_ONLY', label: 'Сообщение 1 · фото без подписи', visualCount: Math.min(n, 1), text: ''},
        {type: 'TEXT_MESSAGE', label: 'Сообщение 2 · текст', text: text}
      ];
    }
  } else if (mode === 'ALBUM_CAPTION') {
    if (!n) warnings.push('Нет изображений, совместимых с текущим autopost.');
    if (text.length <= 1024) {
      segments = [{type: 'ALBUM_CAPTION', label: 'Альбом · подпись на первой карточке', visualCount: n, text: text}];
    } else {
      segments = [
        {type: 'ALBUM_ONLY', label: 'Сообщение 1 · альбом без подписи', visualCount: n, text: ''},
        {type: 'TEXT_MESSAGE', label: 'Сообщение 2 · текст после альбома', text: text}
      ];
    }
  } else {
    warnings.push('Неизвестный Telegram_Post_Mode: ' + mode);
  }

  return {segments: segments, warnings: warnings, exactToAutopostV03: true};
}

function rformCcEnsureReviewHeadersV03_(sheet) {
  const required = RFORM_CC_V03.reviewHeaders;
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(String);
  const missing = required.filter(h => !headers.includes(h));
  if (!missing.length) return;
  const neededLastCol = headers.length + missing.length;
  if (sheet.getMaxColumns() < neededLastCol) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), neededLastCol - sheet.getMaxColumns());
  }
  missing.forEach((h, i) => sheet.getRange(1, headers.length + i + 1).setValue(h));
}

function rformCcExtractDriveIdV03_(url) {
  const s = String(url || '');
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = s.match(patterns[i]);
    if (m) return m[1];
  }
  return '';
}

function rformCcSortDateV03_(v) {
  if (!v) return Number.MAX_SAFE_INTEGER;
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
  const d = new Date(s);
  return isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime();
}

function rformCcUniqueV03_(arr) {
  const seen = {};
  return (arr || []).filter(x => {
    const k = String(x || '').trim();
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  });
}
