// R/Form Channel Control v0.2
// Web control layer over RFORM_MASTER_DATA_v1 + current content calendar.
// Designed to live in the SAME standalone Apps Script project as telegram_autopost_v0_3.gs.
// This keeps existing Script Properties (RFORM_TG_BOT_TOKEN, RFORM_TG_CHAT_ID) and autopost trigger intact.

const RFORM_CC = Object.freeze({
  version: '0.2.0',
  masterSpreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  calendarSpreadsheetId: '1lDBGMRQqpgzCd1IhasH3sGYxVz_kAIoIi6WjpND7s80',
  queueSheet: 'CONTENT_QUEUE',
  registrySheet: 'CONTENT_REGISTRY',
  calendarSheet: 'CALENDAR',
  publicationsSheet: 'PUBLICATIONS',
  backlogSheet: 'BACKLOG',
  auditSheet: 'CONTROL_LOG',
  timeZone: 'Europe/Moscow',
  tokenProperty: 'RFORM_TG_BOT_TOKEN',
  defaultChatId: '@r_form',
  previewMaxVisuals: 10
});

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('R/Form · Channel Control')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function rformCcSetup() {
  const ss = SpreadsheetApp.openById(RFORM_CC.calendarSpreadsheetId);
  let log = ss.getSheetByName(RFORM_CC.auditSheet);
  if (!log) {
    log = ss.insertSheet(RFORM_CC.auditSheet);
    log.getRange(1, 1, 1, 10).setValues([[
      'Timestamp','Action','Content_ID','Previous_State','New_State',
      'Details','Actor','Telegram_Message_ID','Telegram_Post_URL','Version'
    ]]);
    log.setFrozenRows(1);
  }
  return {
    ok: true,
    version: RFORM_CC.version,
    master: SpreadsheetApp.openById(RFORM_CC.masterSpreadsheetId).getName(),
    calendar: ss.getName(),
    auditSheet: log.getName(),
    telegramTokenConfigured: !!PropertiesService.getScriptProperties().getProperty(RFORM_CC.tokenProperty)
  };
}

function rformCcGetDashboardData() {
  const master = SpreadsheetApp.openById(RFORM_CC.masterSpreadsheetId);
  const queue = rformCcReadSheetObjects_(master.getSheetByName(RFORM_CC.queueSheet));

  const calendarSs = SpreadsheetApp.openById(RFORM_CC.calendarSpreadsheetId);
  const calendar = rformCcReadSheetObjects_(calendarSs.getSheetByName(RFORM_CC.calendarSheet));
  const publications = rformCcReadSheetObjects_(calendarSs.getSheetByName(RFORM_CC.publicationsSheet));
  const backlog = rformCcReadSheetObjects_(calendarSs.getSheetByName(RFORM_CC.backlogSheet));

  const queueView = queue
    .filter(r => r.Content_ID)
    .map(r => rformCcNormalizeQueueItem_(r));

  const priority = queueView.filter(r => ['ERROR','REVIEW','APPROVED','SCHEDULED','PLANNED'].includes(r.Lifecycle_State));
  const published = queueView.filter(r => r.Lifecycle_State === 'PUBLISHED');

  return {
    version: RFORM_CC.version,
    generatedAt: Utilities.formatDate(new Date(), RFORM_CC.timeZone, 'dd.MM.yyyy HH:mm:ss'),
    summary: {
      actionRequired: priority.filter(r => ['ERROR','REVIEW','APPROVED'].includes(r.Lifecycle_State)).length,
      scheduled: priority.filter(r => r.Lifecycle_State === 'SCHEDULED').length,
      planned: priority.filter(r => r.Lifecycle_State === 'PLANNED').length,
      publishedTracked: published.length
    },
    queue: priority.slice(0, 80),
    calendar: calendar.filter(r => r.Date).slice(0, 120),
    publications: publications.filter(r => r.Date || r.Publication_Date || r.Content_ID).slice(0, 120),
    backlog: backlog.filter(r => Object.values(r).some(Boolean)).slice(0, 80)
  };
}

function rformCcGetContent(contentId) {
  const row = rformCcFindQueueRow_(contentId);
  if (!row) throw new Error('Content_ID not found: ' + contentId);
  return rformCcNormalizeQueueItem_(row.object);
}

function rformCcGetPreview(payload) {
  rformCcRequirePayload_(payload, ['contentId']);
  const ctx = rformCcFindQueueRow_(payload.contentId);
  if (!ctx) throw new Error('Content_ID not found: ' + payload.contentId);

  const item = rformCcNormalizeQueueItem_(ctx.object);
  const mode = String(item.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase();
  const text = String(item.Telegram_Text || '');
  const warnings = [];
  let visualResult = {visuals: [], sourceType: 'NONE', warning: ''};

  if (mode !== 'TEXT_ONLY') {
    const visualUrl = String(item.Telegram_Visual_URL || '').trim();
    if (!visualUrl) {
      warnings.push('Для ' + mode + ' не задан Telegram_Visual_URL.');
    } else {
      visualResult = rformCcResolveVisuals_(visualUrl);
      if (visualResult.warning) warnings.push(visualResult.warning);
      if (!visualResult.visuals.length) warnings.push('Визуал не удалось отобразить в предпросмотре. Проверьте ссылку на исходник.');
    }
    if (String(item.Visual_Status || '').toUpperCase() !== 'APPROVED') {
      warnings.push('Visual_Status ещё не APPROVED.');
    }
    if (text.length > 1024) {
      warnings.push('Текст длиннее media-caption текущего контура; autopost может отправить его отдельным текстовым сообщением.');
    }
  }

  if (!text.trim()) warnings.push('Telegram_Text пуст.');

  return {
    item: item,
    visuals: visualResult.visuals,
    visualSourceType: visualResult.sourceType,
    warnings: warnings,
    textLength: text.length,
    previewGeneratedAt: Utilities.formatDate(new Date(), RFORM_CC.timeZone, 'dd.MM.yyyy HH:mm:ss')
  };
}

function rformCcSaveDraft(payload) {
  rformCcRequirePayload_(payload, ['contentId']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = rformCcFindQueueRow_(payload.contentId);
    if (!ctx) throw new Error('Content_ID not found: ' + payload.contentId);
    const prev = rformCcDeriveLifecycle_(ctx.object);

    if (payload.text !== undefined) rformCcSetByHeader_(ctx, 'Telegram_Text', String(payload.text));
    if (payload.visualUrl !== undefined) rformCcSetByHeader_(ctx, 'Telegram_Visual_URL', String(payload.visualUrl));
    if (payload.mode !== undefined) rformCcSetByHeader_(ctx, 'Telegram_Post_Mode', String(payload.mode).toUpperCase());
    rformCcSetByHeader_(ctx, 'Updated_At', new Date());

    const fresh = rformCcFindQueueRow_(payload.contentId).object;
    const next = rformCcDeriveLifecycle_(fresh);
    rformCcLog_(payload.contentId, 'SAVE_DRAFT', prev, next, 'Draft fields updated', fresh);
    return rformCcNormalizeQueueItem_(fresh);
  } finally {
    lock.releaseLock();
  }
}

function rformCcApprove(payload) {
  rformCcRequirePayload_(payload, ['contentId']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = rformCcFindQueueRow_(payload.contentId);
    if (!ctx) throw new Error('Content_ID not found: ' + payload.contentId);
    const prev = rformCcDeriveLifecycle_(ctx.object);
    const mode = String(ctx.object.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase();
    const text = String(ctx.object.Telegram_Text || '').trim();
    if (!text) throw new Error('Cannot approve: Telegram_Text is empty.');

    rformCcSetByHeader_(ctx, 'Text_Status', 'APPROVED');
    if (mode === 'TEXT_ONLY') {
      if (ctx.headerMap.Visual_Status !== undefined) rformCcSetByHeader_(ctx, 'Visual_Status', 'NOT_REQUIRED');
      rformCcSetByHeader_(ctx, 'Approval_Status', 'APPROVED');
    } else {
      const visualUrl = String(ctx.object.Telegram_Visual_URL || '').trim();
      const visualStatus = String(ctx.object.Visual_Status || '').toUpperCase();
      if (!visualUrl) throw new Error('Cannot approve: visual URL is required for ' + mode + '.');
      if (visualStatus !== 'APPROVED') {
        rformCcSetByHeader_(ctx, 'Approval_Status', 'NOT_READY');
        throw new Error('Text approved, but Visual_Status must be APPROVED before overall approval.');
      }
      rformCcSetByHeader_(ctx, 'Approval_Status', 'APPROVED');
    }
    rformCcSetByHeader_(ctx, 'Updated_At', new Date());

    const fresh = rformCcFindQueueRow_(payload.contentId).object;
    const next = rformCcDeriveLifecycle_(fresh);
    rformCcLog_(payload.contentId, 'APPROVE', prev, next, 'Owner approval from Channel Control', fresh);
    return rformCcNormalizeQueueItem_(fresh);
  } finally {
    lock.releaseLock();
  }
}

function rformCcSchedule(payload) {
  rformCcRequirePayload_(payload, ['contentId','publishAt']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = rformCcFindQueueRow_(payload.contentId);
    if (!ctx) throw new Error('Content_ID not found: ' + payload.contentId);
    const prev = rformCcDeriveLifecycle_(ctx.object);
    rformCcValidateSchedulable_(ctx.object);

    const publishAt = new Date(payload.publishAt);
    if (isNaN(publishAt.getTime())) throw new Error('Invalid publishAt.');

    rformCcSetByHeader_(ctx, 'Publish_At', publishAt);
    rformCcSetByHeader_(ctx, 'AutoPost_Allowed', 'YES');
    rformCcSetByHeader_(ctx, 'Publication_Status', 'SCHEDULED');
    rformCcSetByHeader_(ctx, 'Pipeline_Status', 'SCHEDULED · CHANNEL CONTROL');
    rformCcSetByHeader_(ctx, 'Updated_At', new Date());

    const fresh = rformCcFindQueueRow_(payload.contentId).object;
    const next = rformCcDeriveLifecycle_(fresh);
    rformCcLog_(payload.contentId, 'SCHEDULE', prev, next,
      'Publish_At=' + Utilities.formatDate(publishAt, RFORM_CC.timeZone, 'dd.MM.yyyy HH:mm'), fresh);
    return rformCcNormalizeQueueItem_(fresh);
  } finally {
    lock.releaseLock();
  }
}

function rformCcHold(payload) {
  return rformCcSetTerminalState_(payload, 'HOLD', 'HOLD · CHANNEL CONTROL');
}

function rformCcCancel(payload) {
  return rformCcSetTerminalState_(payload, 'CANCELLED', 'CANCELLED · CHANNEL CONTROL');
}

function rformCcSupersede(payload) {
  return rformCcSetTerminalState_(payload, 'SUPERSEDED', 'SUPERSEDED · CHANNEL CONTROL');
}

function rformCcEditPublished(payload) {
  rformCcRequirePayload_(payload, ['contentId','text','confirm']);
  if (payload.confirm !== true) throw new Error('Explicit confirmation is required to edit a live Telegram post.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = rformCcFindQueueRow_(payload.contentId);
    if (!ctx) throw new Error('Content_ID not found: ' + payload.contentId);
    const prev = rformCcDeriveLifecycle_(ctx.object);
    if (prev !== 'PUBLISHED') throw new Error('Live edit is allowed only for PUBLISHED content.');

    const messageId = String(ctx.object.Telegram_Message_ID || '').trim();
    if (!messageId) throw new Error('Telegram_Message_ID is missing; live edit cannot be targeted safely.');
    const text = String(payload.text || '').trim();
    if (!text) throw new Error('Published text cannot be empty.');

    const chatId = String(ctx.object.Telegram_Chat_ID || RFORM_CC.defaultChatId).trim();
    const token = PropertiesService.getScriptProperties().getProperty(RFORM_CC.tokenProperty);
    if (!token) throw new Error('Missing Script Property: ' + RFORM_CC.tokenProperty);

    const mode = String(ctx.object.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase();
    let methodUsed = 'editMessageText';
    if (mode === 'TEXT_ONLY') {
      rformCcTelegram_(token, 'editMessageText', {chat_id: chatId, message_id: messageId, text: text});
    } else {
      if (text.length > 1024) {
        // Existing autopost v0.3 may have sent long copy as a separate text message and stored that text message ID.
        rformCcTelegram_(token, 'editMessageText', {chat_id: chatId, message_id: messageId, text: text});
        methodUsed = 'editMessageText';
      } else {
        try {
          rformCcTelegram_(token, 'editMessageCaption', {chat_id: chatId, message_id: messageId, caption: text});
          methodUsed = 'editMessageCaption';
        } catch (captionErr) {
          rformCcTelegram_(token, 'editMessageText', {chat_id: chatId, message_id: messageId, text: text});
          methodUsed = 'editMessageText fallback';
        }
      }
    }

    rformCcSetByHeader_(ctx, 'Telegram_Text', text);
    rformCcSetByHeader_(ctx, 'Updated_At', new Date());
    rformCcSetByHeader_(ctx, 'Publish_Error', '');

    const fresh = rformCcFindQueueRow_(payload.contentId).object;
    rformCcLog_(payload.contentId, 'EDIT_PUBLISHED', prev, 'PUBLISHED', methodUsed, fresh);
    return rformCcNormalizeQueueItem_(fresh);
  } finally {
    lock.releaseLock();
  }
}

function rformCcSetTerminalState_(payload, publicationStatus, pipelineStatus) {
  rformCcRequirePayload_(payload, ['contentId']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = rformCcFindQueueRow_(payload.contentId);
    if (!ctx) throw new Error('Content_ID not found: ' + payload.contentId);
    const prev = rformCcDeriveLifecycle_(ctx.object);
    if (prev === 'PUBLISHED' && publicationStatus !== 'SUPERSEDED') {
      throw new Error('Published content cannot be moved to ' + publicationStatus + '. Use live edit or supersede.');
    }
    rformCcSetByHeader_(ctx, 'AutoPost_Allowed', 'NO');
    rformCcSetByHeader_(ctx, 'Publication_Status', publicationStatus);
    rformCcSetByHeader_(ctx, 'Pipeline_Status', pipelineStatus);
    rformCcSetByHeader_(ctx, 'Updated_At', new Date());
    if (publicationStatus === 'SUPERSEDED' && ctx.headerMap.Text_Status !== undefined) {
      rformCcSetByHeader_(ctx, 'Text_Status', 'SUPERSEDED');
    }
    const fresh = rformCcFindQueueRow_(payload.contentId).object;
    const next = rformCcDeriveLifecycle_(fresh);
    rformCcLog_(payload.contentId, publicationStatus, prev, next, payload.reason || '', fresh);
    return rformCcNormalizeQueueItem_(fresh);
  } finally {
    lock.releaseLock();
  }
}

function rformCcValidateSchedulable_(r) {
  if (String(r.Public_Data_Allowed || '').toUpperCase() !== 'YES') throw new Error('Public_Data_Allowed must be YES.');
  if (String(r.Text_Status || '').toUpperCase() !== 'APPROVED') throw new Error('Text_Status must be APPROVED.');
  if (String(r.Approval_Status || '').toUpperCase() !== 'APPROVED') throw new Error('Approval_Status must be APPROVED.');
  const mode = String(r.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase();
  if (mode !== 'TEXT_ONLY' && String(r.Visual_Status || '').toUpperCase() !== 'APPROVED') {
    throw new Error('Visual_Status must be APPROVED for ' + mode + '.');
  }
  if (!String(r.Telegram_Text || '').trim()) throw new Error('Telegram_Text is empty.');
}

function rformCcResolveVisuals_(visualUrl) {
  const url = String(visualUrl || '').trim();
  const result = {visuals: [], sourceType: 'NONE', warning: ''};
  if (!url) return result;

  try {
    const folderMatch = url.match(/\/folders\/([A-Za-z0-9_-]{15,})/);
    if (folderMatch) {
      result.sourceType = 'DRIVE_FOLDER';
      const folder = DriveApp.getFolderById(folderMatch[1]);
      const iterator = folder.getFiles();
      const files = [];
      while (iterator.hasNext()) {
        const file = iterator.next();
        const mime = String(file.getMimeType() || '');
        if (mime.indexOf('image/') === 0 || mime === 'application/pdf') {
          files.push(file);
        }
      }
      files.sort((a, b) => String(a.getName()).localeCompare(String(b.getName()), 'ru', {numeric: true}));
      result.visuals = files.slice(0, RFORM_CC.previewMaxVisuals).map(rformCcPreviewFile_);
      if (files.length > RFORM_CC.previewMaxVisuals) {
        result.warning = 'Показаны первые ' + RFORM_CC.previewMaxVisuals + ' визуалов из ' + files.length + '.';
      }
      return result;
    }

    const id = rformCcExtractDriveId_(url);
    if (id) {
      result.sourceType = 'DRIVE_FILE';
      try {
        result.visuals = [rformCcPreviewFile_(DriveApp.getFileById(id))];
        return result;
      } catch (fileErr) {
        try {
          const folder = DriveApp.getFolderById(id);
          const iterator = folder.getFiles();
          const files = [];
          while (iterator.hasNext()) {
            const file = iterator.next();
            const mime = String(file.getMimeType() || '');
            if (mime.indexOf('image/') === 0 || mime === 'application/pdf') files.push(file);
          }
          files.sort((a, b) => String(a.getName()).localeCompare(String(b.getName()), 'ru', {numeric: true}));
          result.sourceType = 'DRIVE_FOLDER';
          result.visuals = files.slice(0, RFORM_CC.previewMaxVisuals).map(rformCcPreviewFile_);
          return result;
        } catch (folderErr) {
          throw fileErr;
        }
      }
    }

    if (/^https?:\/\//i.test(url)) {
      result.sourceType = 'EXTERNAL_URL';
      result.visuals = [{
        id: '',
        name: 'Visual',
        mimeType: 'external',
        previewUrl: url,
        sourceUrl: url
      }];
      return result;
    }
  } catch (e) {
    result.warning = 'Не удалось получить визуал из Google Drive: ' + (e.message || e);
    return result;
  }

  result.warning = 'Формат Visual URL не распознан.';
  return result;
}

function rformCcPreviewFile_(file) {
  const id = file.getId();
  return {
    id: id,
    name: file.getName(),
    mimeType: file.getMimeType(),
    previewUrl: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600',
    sourceUrl: file.getUrl()
  };
}

function rformCcExtractDriveId_(url) {
  const value = String(url || '').trim();
  if (/^[A-Za-z0-9_-]{15,}$/.test(value)) return value;
  const patterns = [
    /\/d\/([A-Za-z0-9_-]{15,})/,
    /[?&]id=([A-Za-z0-9_-]{15,})/,
    /\/file\/d\/([A-Za-z0-9_-]{15,})/
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = value.match(patterns[i]);
    if (match) return match[1];
  }
  return '';
}

function rformCcNormalizeQueueItem_(r) {
  return {
    Content_ID: r.Content_ID || '',
    Date: r.Date || '',
    Rubric: r.Rubric || '',
    Series_ID: r.Series_ID || '',
    Topic: r.Main_Training_Fact || r.Reader_Value || r.Audience_Problem || '',
    Audience_Problem: r.Audience_Problem || '',
    Reader_Value: r.Reader_Value || '',
    Content_Function: r.Content_Function || '',
    Lifecycle_State: rformCcDeriveLifecycle_(r),
    Text_Status: r.Text_Status || '',
    Visual_Status: r.Visual_Status || '',
    Approval_Status: r.Approval_Status || '',
    Publication_Status: r.Publication_Status || '',
    Pipeline_Status: r.Pipeline_Status || '',
    Publish_At: r.Publish_At || '',
    AutoPost_Allowed: r.AutoPost_Allowed || '',
    Telegram_Post_Mode: r.Telegram_Post_Mode || 'TEXT_ONLY',
    Telegram_Text: r.Telegram_Text || '',
    Telegram_Visual_URL: r.Telegram_Visual_URL || '',
    Telegram_Message_ID: r.Telegram_Message_ID || '',
    Telegram_Post_URL: r.Telegram_Post_URL || '',
    Posted_At: r.Posted_At || '',
    Blocking_Issue: r.Blocking_Issue || '',
    Current_Stage: r.Current_Stage || '',
    Current_Chat: r.Current_Chat || '',
    Next_Chat: r.Next_Chat || '',
    Text_URL: r.Text_URL || '',
    Visual_URL: r.Visual_URL || '',
    Folder_URL: r.Folder_URL || '',
    Publish_Error: r.Publish_Error || '',
    Updated_At: r.Updated_At || ''
  };
}

function rformCcDeriveLifecycle_(r) {
  const publication = String(r.Publication_Status || '').toUpperCase();
  const pipeline = String(r.Pipeline_Status || '').toUpperCase();
  const text = String(r.Text_Status || '').toUpperCase();
  const approval = String(r.Approval_Status || '').toUpperCase();
  const error = String(r.Publish_Error || '').trim();

  if (error || publication === 'ERROR' || publication === 'PUBLISHING') return 'ERROR';
  if (publication === 'SUPERSEDED' || text === 'SUPERSEDED' || pipeline.includes('SUPERSEDED') || pipeline.includes('ЗАМЕНЕНО')) return 'SUPERSEDED';
  if (publication === 'CANCELLED' || pipeline.includes('CANCELLED')) return 'CANCELLED';
  if (publication === 'HOLD' || pipeline.includes('HOLD')) return 'HOLD';
  if (publication === 'PUBLISHED' || pipeline.includes('ОПУБЛИКОВАНО')) return 'PUBLISHED';
  if (publication === 'SCHEDULED' || pipeline.includes('SCHEDULED')) return 'SCHEDULED';
  if (approval === 'APPROVED') return 'APPROVED';
  if (text === 'APPROVED' || text === 'READY' || pipeline.includes('READY') || pipeline.includes('ГОТОВО')) return 'REVIEW';
  if (pipeline.includes('PLANNED') || publication === 'PLANNED') return 'PLANNED';
  if (r.Content_ID) return 'DRAFT';
  return 'IDEA';
}

function rformCcFindQueueRow_(contentId) {
  const ss = SpreadsheetApp.openById(RFORM_CC.masterSpreadsheetId);
  const sheet = ss.getSheetByName(RFORM_CC.queueSheet);
  if (!sheet) throw new Error('Sheet not found: ' + RFORM_CC.queueSheet);
  const data = sheet.getDataRange().getValues();
  if (!data.length) return null;
  const headers = data[0].map(String);
  const headerMap = rformCcHeaderMap_(headers);
  const idCol = headerMap.Content_ID;
  if (idCol === undefined) throw new Error('CONTENT_QUEUE missing Content_ID header.');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(contentId)) {
      return {
        ss: ss,
        sheet: sheet,
        rowNumber: i + 1,
        headers: headers,
        headerMap: headerMap,
        object: rformCcRowToObject_(headers, data[i])
      };
    }
  }
  return null;
}

function rformCcSetByHeader_(ctx, header, value) {
  const idx = ctx.headerMap[header];
  if (idx === undefined) throw new Error('Required header not found in CONTENT_QUEUE: ' + header);
  ctx.sheet.getRange(ctx.rowNumber, idx + 1).setValue(value);
}

function rformCcReadSheetObjects_(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return [];
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(r => rformCcRowToObject_(headers, r));
}

function rformCcRowToObject_(headers, row) {
  const out = {};
  headers.forEach((h, i) => { if (h) out[h] = row[i] === undefined ? '' : row[i]; });
  return out;
}

function rformCcHeaderMap_(headers) {
  const map = {};
  headers.forEach((h, i) => { if (h) map[String(h)] = i; });
  return map;
}

function rformCcRequirePayload_(payload, keys) {
  if (!payload || typeof payload !== 'object') throw new Error('Payload is required.');
  keys.forEach(k => {
    if (payload[k] === undefined || payload[k] === null || payload[k] === '') throw new Error('Missing payload field: ' + k);
  });
}

function rformCcLog_(contentId, action, previousState, newState, details, row) {
  const ss = SpreadsheetApp.openById(RFORM_CC.calendarSpreadsheetId);
  let sheet = ss.getSheetByName(RFORM_CC.auditSheet);
  if (!sheet) rformCcSetup();
  sheet = ss.getSheetByName(RFORM_CC.auditSheet);
  sheet.appendRow([
    new Date(), action, contentId, previousState, newState, details || '',
    Session.getActiveUser().getEmail() || 'OWNER',
    row.Telegram_Message_ID || '', row.Telegram_Post_URL || '', RFORM_CC.version
  ]);
}

function rformCcTelegram_(token, method, payload) {
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  });
  const text = response.getContentText();
  let json;
  try { json = JSON.parse(text); } catch (e) { throw new Error('Telegram returned non-JSON response: ' + text); }
  if (!json.ok) throw new Error('Telegram ' + method + ' failed: ' + (json.description || text));
  return json.result;
}
