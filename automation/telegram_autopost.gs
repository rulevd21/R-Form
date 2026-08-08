// R/Form Telegram Autopost v0.2
// Safe to add to the EXISTING Apps Script project bound to RFORM_MASTER_DATA_v1.
// Design goals:
// 1) do not replace or modify the training web-app code;
// 2) use an isolated rformTg* namespace for all functions;
// 3) preflight is read-only: no sheet writes, no triggers, no Telegram posts;
// 4) install creates only this module's headers and trigger;
// 5) autopublish remains OFF until explicitly enabled;
// 6) publish ONLY exact Telegram_Text + exact Telegram_Visual_URL from an APPROVED queue row.

const RFORM_TG_AUTOPUBLISH_CONFIG = Object.freeze({
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  queueSheet: 'CONTENT_QUEUE',
  defaultChatId: '@r_form',
  triggerMinutes: 5,
  propertyKeys: Object.freeze({
    token: 'RFORM_TG_BOT_TOKEN',
    chatId: 'RFORM_TG_CHAT_ID',
    enabled: 'RFORM_TG_AUTOPUBLISH_ENABLED'
  }),
  requiredCoreHeaders: Object.freeze([
    'Content_ID',
    'Public_Data_Allowed',
    'Text_Status',
    'Visual_Status',
    'Approval_Status',
    'Publication_Status'
  ]),
  autopostHeaders: Object.freeze([
    'Publish_At',
    'AutoPost_Allowed',
    'Telegram_Chat_ID',
    'Telegram_Post_Mode',
    'Telegram_Text',
    'Telegram_Visual_URL',
    'Telegram_Message_ID',
    'Telegram_Post_URL',
    'Posted_At',
    'Publish_Error'
  ])
});

/**
 * READ-ONLY preflight. Safe to run first in a project that already hosts the
 * R/Form training application. Does NOT change sheets/triggers/properties and
 * does NOT post anything to Telegram.
 */
function rformTgPreflight() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.token);
  const chatId = props.getProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.chatId) || RFORM_TG_AUTOPUBLISH_CONFIG.defaultChatId;
  if (!token) {
    throw new Error('Missing Script Property: ' + RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.token);
  }

  const ss = SpreadsheetApp.openById(RFORM_TG_AUTOPUBLISH_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_TG_AUTOPUBLISH_CONFIG.queueSheet);
  if (!sheet) throw new Error('Sheet not found: ' + RFORM_TG_AUTOPUBLISH_CONFIG.queueSheet);

  const headers = rformTgReadHeaders_(sheet);
  const missingCore = RFORM_TG_AUTOPUBLISH_CONFIG.requiredCoreHeaders.filter(h => !headers.includes(h));
  if (missingCore.length) {
    throw new Error('CONTENT_QUEUE missing required existing headers: ' + missingCore.join(', '));
  }

  const telegram = rformTgVerifyTelegramAccess_(token, chatId);
  const existingHandlers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

  return {
    ok: true,
    mode: 'READ_ONLY_PREFLIGHT',
    spreadsheet: ss.getName(),
    spreadsheetTimeZone: ss.getSpreadsheetTimeZone(),
    scriptTimeZone: Session.getScriptTimeZone(),
    queueSheet: sheet.getName(),
    rowCount: Math.max(sheet.getLastRow() - 1, 0),
    missingAutopostHeaders: RFORM_TG_AUTOPUBLISH_CONFIG.autopostHeaders.filter(h => !headers.includes(h)),
    telegram: telegram,
    currentAutopublishEnabled: props.getProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.enabled) || 'NOT_SET',
    thisModuleTriggerExists: existingHandlers.includes('rformTgProcessQueue'),
    note: 'No data, trigger, property or Telegram message was changed by this preflight.'
  };
}

/**
 * Installation step. Run ONLY after rformTgPreflight() succeeds.
 * Adds this module's columns if absent, creates/replaces only this module's
 * 5-minute trigger, and leaves autopublish DISABLED.
 */
function rformTgInstall() {
  const report = rformTgPreflight();
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(RFORM_TG_AUTOPUBLISH_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_TG_AUTOPUBLISH_CONFIG.queueSheet);

  rformTgEnsureHeaders_(sheet, RFORM_TG_AUTOPUBLISH_CONFIG.autopostHeaders);

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'rformTgProcessQueue')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('rformTgProcessQueue')
    .timeBased()
    .everyMinutes(RFORM_TG_AUTOPUBLISH_CONFIG.triggerMinutes)
    .create();

  props.setProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.enabled, 'NO');

  return {
    ok: true,
    installed: true,
    trigger: 'rformTgProcessQueue every ' + RFORM_TG_AUTOPUBLISH_CONFIG.triggerMinutes + ' minutes',
    autopublishEnabled: 'NO',
    preflight: report,
    next: 'Run rformTgVerifyInstallation(). Do not enable autopublish yet.'
  };
}

/** Read-only verification after installation. */
function rformTgVerifyInstallation() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(RFORM_TG_AUTOPUBLISH_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_TG_AUTOPUBLISH_CONFIG.queueSheet);
  const headers = rformTgReadHeaders_(sheet);
  const missing = RFORM_TG_AUTOPUBLISH_CONFIG.autopostHeaders.filter(h => !headers.includes(h));
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'rformTgProcessQueue');
  return {
    ok: missing.length === 0 && triggers.length === 1,
    missingHeaders: missing,
    triggerCount: triggers.length,
    autopublishEnabled: props.getProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.enabled) || 'NOT_SET',
    expectedAutopublishEnabled: 'NO'
  };
}

/** Explicit owner/operator action after testing. */
function rformTgEnableAutopublish() {
  const verification = rformTgVerifyInstallation();
  if (!verification.ok) throw new Error('Installation verification failed: ' + JSON.stringify(verification));
  PropertiesService.getScriptProperties().setProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.enabled, 'YES');
  return 'R/Form Telegram autopublish ENABLED.';
}

function rformTgDisableAutopublish() {
  PropertiesService.getScriptProperties().setProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.enabled, 'NO');
  return 'R/Form Telegram autopublish DISABLED.';
}

/**
 * Trigger handler. It never publishes unless the module-wide flag is YES.
 * It deliberately does NOT use a project-wide LockService lock, to avoid
 * interfering with the existing training web app in the same Apps Script project.
 */
function rformTgProcessQueue() {
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.enabled)).toUpperCase() !== 'YES') return;

  const ss = SpreadsheetApp.openById(RFORM_TG_AUTOPUBLISH_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_TG_AUTOPUBLISH_CONFIG.queueSheet);
  if (!sheet || sheet.getLastRow() < 2) return;

  const range = sheet.getDataRange();
  const data = range.getValues();
  const display = range.getDisplayValues();
  const headers = data[0].map(String);
  const col = rformTgHeaderMap_(headers);
  const now = new Date();

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const displayRow = display[r];
    const contentId = rformTgValue_(row, col, 'Content_ID');
    if (!contentId) continue;

    if (String(rformTgValue_(row, col, 'Public_Data_Allowed')).toUpperCase() !== 'YES') continue;
    if (String(rformTgValue_(row, col, 'Approval_Status')).toUpperCase() !== 'APPROVED') continue;
    if (String(rformTgValue_(row, col, 'Text_Status')).toUpperCase() !== 'APPROVED') continue;
    if (String(rformTgValue_(row, col, 'AutoPost_Allowed')).toUpperCase() !== 'YES') continue;
    if (String(rformTgValue_(row, col, 'Publication_Status')).toUpperCase() !== 'SCHEDULED') continue;
    if (rformTgValue_(row, col, 'Telegram_Message_ID')) continue;

    const mode = String(rformTgValue_(row, col, 'Telegram_Post_Mode') || 'TEXT_ONLY').toUpperCase();
    const visualStatus = String(rformTgValue_(row, col, 'Visual_Status')).toUpperCase();
    if (mode !== 'TEXT_ONLY' && visualStatus !== 'APPROVED') continue;

    const text = String(rformTgValue_(row, col, 'Telegram_Text') || '').trim();
    if (!text) continue;

    const publishAtRaw = rformTgValue_(row, col, 'Publish_At');
    const publishAtDisplay = rformTgValue_(displayRow, col, 'Publish_At');
    const publishAt = rformTgAsDate_(publishAtRaw, publishAtDisplay);
    if (!publishAt || publishAt > now) continue;

    const rowNumber = r + 1;
    // Claim the row BEFORE external API work. If an execution is interrupted,
    // the row remains PUBLISHING and will not duplicate-post automatically.
    rformTgSetCell_(sheet, rowNumber, col, 'Publication_Status', 'PUBLISHING');
    SpreadsheetApp.flush();

    try {
      rformTgPublishRow_(sheet, rowNumber, row, col, text, mode);
    } catch (err) {
      rformTgSetCell_(sheet, rowNumber, col, 'Publication_Status', 'ERROR');
      rformTgSetCell_(sheet, rowNumber, col, 'Publish_Error', String(err && err.stack ? err.stack : err));
    }
  }
}

function rformTgPublishRow_(sheet, rowNumber, row, col, text, mode) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.token);
  const chatId = rformTgValue_(row, col, 'Telegram_Chat_ID') || props.getProperty(RFORM_TG_AUTOPUBLISH_CONFIG.propertyKeys.chatId) || RFORM_TG_AUTOPUBLISH_CONFIG.defaultChatId;
  const visualUrl = rformTgValue_(row, col, 'Telegram_Visual_URL');

  let publication;
  if (mode === 'TEXT_ONLY') {
    const msg = rformTgSendMessage_(token, chatId, text);
    publication = {messageId: msg.message_id};
  } else {
    const images = rformTgReadImages_(visualUrl);
    if (!images.length) throw new Error('No images found in Telegram_Visual_URL for mode ' + mode);

    if (mode === 'PHOTO_CAPTION') {
      publication = rformTgSendPhotoPublication_(token, chatId, images[0], text);
    } else if (mode === 'ALBUM_CAPTION') {
      publication = rformTgSendAlbumPublication_(token, chatId, images.slice(0, 10), text);
    } else {
      throw new Error('Unsupported Telegram_Post_Mode: ' + mode);
    }
  }

  const messageId = publication.messageId;
  const username = String(chatId).replace(/^@/, '');
  const postUrl = String(chatId).startsWith('@') ? `https://t.me/${username}/${messageId}` : '';
  const postedAt = new Date();

  rformTgSetCell_(sheet, rowNumber, col, 'Telegram_Message_ID', String(messageId));
  rformTgSetCell_(sheet, rowNumber, col, 'Telegram_Post_URL', postUrl);
  rformTgSetCell_(sheet, rowNumber, col, 'Posted_At', postedAt);
  rformTgSetCell_(sheet, rowNumber, col, 'Publication_Status', 'PUBLISHED');
  rformTgSetCell_(sheet, rowNumber, col, 'Publish_Error', '');
  if (col['Updated_At'] !== undefined) rformTgSetCell_(sheet, rowNumber, col, 'Updated_At', postedAt);
}

function rformTgReadImages_(url) {
  if (!url) return [];
  const id = rformTgExtractDriveId_(url);
  if (!id) throw new Error('Cannot resolve Telegram_Visual_URL: ' + url);
  const folder = DriveApp.getFolderById(id);
  const items = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const mime = f.getMimeType();
    if (mime === MimeType.PNG || mime === 'image/jpeg') {
      items.push({name: f.getName(), blob: f.getBlob()});
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return items.map(x => x.blob);
}

function rformTgSendPhotoPublication_(token, chatId, blob, text) {
  const payload = {chat_id: chatId, photo: blob};
  if (text.length <= 1024) {
    payload.caption = text;
    const photo = rformTgTelegram_(token, 'sendPhoto', payload, true);
    return {messageId: photo.message_id};
  }
  const photo = rformTgTelegram_(token, 'sendPhoto', payload, true);
  const msg = rformTgSendMessage_(token, chatId, text);
  return {messageId: msg.message_id, mediaMessageId: photo.message_id};
}

function rformTgSendAlbumPublication_(token, chatId, blobs, text) {
  const payload = {chat_id: chatId};
  const media = [];
  blobs.forEach((blob, i) => {
    const key = 'file' + i;
    payload[key] = blob;
    const item = {type: 'photo', media: 'attach://' + key};
    if (i === 0 && text.length <= 1024) item.caption = text;
    media.push(item);
  });
  payload.media = JSON.stringify(media);
  const album = rformTgTelegram_(token, 'sendMediaGroup', payload, true);
  if (text.length > 1024) {
    const msg = rformTgSendMessage_(token, chatId, text);
    return {messageId: msg.message_id, mediaMessageId: album[0].message_id};
  }
  return {messageId: album[0].message_id};
}

function rformTgSendMessage_(token, chatId, text) {
  if (!text) throw new Error('Telegram_Text is empty.');
  if (text.length > 4096) throw new Error('Telegram_Text exceeds 4096 characters.');
  return rformTgTelegram_(token, 'sendMessage', {chat_id: chatId, text: text}, false);
}

function rformTgVerifyTelegramAccess_(token, chatId) {
  const me = rformTgTelegram_(token, 'getMe', {}, false);
  const chat = rformTgTelegram_(token, 'getChat', {chat_id: chatId}, false);
  const member = rformTgTelegram_(token, 'getChatMember', {chat_id: chatId, user_id: me.id}, false);
  if (!['administrator', 'creator'].includes(member.status)) {
    throw new Error('Bot is not an administrator of ' + chatId + '.');
  }
  if (member.status === 'administrator' && member.can_post_messages === false) {
    throw new Error('Bot lacks can_post_messages in ' + chatId + '.');
  }
  return {
    botUsername: '@' + me.username,
    chat: chat.title || chatId,
    status: member.status,
    canPostMessages: member.can_post_messages
  };
}

function rformTgTelegram_(token, method, payload, multipart) {
  if (!token) throw new Error('Telegram bot token is missing.');
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const options = {method: 'post', muteHttpExceptions: true, payload: payload};
  if (!multipart) options.contentType = 'application/x-www-form-urlencoded';
  const res = UrlFetchApp.fetch(url, options);
  const body = res.getContentText();
  let json;
  try { json = JSON.parse(body); } catch (e) { throw new Error('Telegram returned non-JSON: ' + body); }
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description || body}`);
  return json.result;
}

function rformTgReadHeaders_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(String);
}

function rformTgEnsureHeaders_(sheet, required) {
  const headers = rformTgReadHeaders_(sheet);
  let next = headers.length + 1;
  required.forEach(h => {
    if (!headers.includes(h)) {
      sheet.getRange(1, next).setValue(h);
      headers.push(h);
      next++;
    }
  });
}

function rformTgHeaderMap_(headers) {
  const out = {};
  headers.forEach((h, i) => { if (h) out[h] = i; });
  return out;
}

function rformTgValue_(row, col, name) {
  return col[name] === undefined ? '' : row[col[name]];
}

function rformTgSetCell_(sheet, rowNumber, col, name, value) {
  if (col[name] === undefined) throw new Error('Missing autopost header: ' + name);
  sheet.getRange(rowNumber, col[name] + 1).setValue(value);
}

function rformTgExtractDriveId_(url) {
  if (!url) return '';
  const s = String(url);
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]{20,})/,
    /folders\/([a-zA-Z0-9_-]{20,})/,
    /[?&]id=([a-zA-Z0-9_-]{20,})/,
    /^([a-zA-Z0-9_-]{20,})$/
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return '';
}

function rformTgAsDate_(raw, displayed) {
  if (raw instanceof Date && !isNaN(raw)) return raw;
  const text = String(displayed || raw || '').trim();
  if (!text) return null;
  // Preferred explicit form for automation: 2026-08-12T19:30:00+03:00
  const iso = new Date(text);
  if (!isNaN(iso)) return iso;
  // Fallback for a Moscow spreadsheet display like 12.08.2026 19:30.
  const ru = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})$/);
  if (ru) {
    const dd = String(ru[1]).padStart(2, '0');
    const mm = String(ru[2]).padStart(2, '0');
    const hh = String(ru[4]).padStart(2, '0');
    const min = String(ru[5]).padStart(2, '0');
    return new Date(`${ru[3]}-${mm}-${dd}T${hh}:${min}:00+03:00`);
  }
  return null;
}
