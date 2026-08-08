// R/Form Telegram Autopost v0.3
// Standalone Apps Script project. Does NOT modify the training web-app project.

const RFORM_TG = Object.freeze({
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  queueSheet: 'CONTENT_QUEUE',
  defaultChatId: '@r_form',
  triggerMinutes: 5,
  props: Object.freeze({
    token: 'RFORM_TG_BOT_TOKEN',
    chatId: 'RFORM_TG_CHAT_ID',
    enabled: 'RFORM_TG_AUTOPUBLISH_ENABLED'
  }),
  coreHeaders: Object.freeze([
    'Content_ID','Public_Data_Allowed','Text_Status','Visual_Status',
    'Approval_Status','Publication_Status'
  ]),
  autopostHeaders: Object.freeze([
    'Publish_At','AutoPost_Allowed','Telegram_Chat_ID','Telegram_Post_Mode',
    'Telegram_Text','Telegram_Visual_URL','Telegram_Message_ID',
    'Telegram_Post_URL','Posted_At','Publish_Error'
  ])
});

/** READ-ONLY: no sheet writes, no triggers, no Telegram posts. */
function rformTgPreflight() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(RFORM_TG.props.token);
  const chatId = props.getProperty(RFORM_TG.props.chatId) || RFORM_TG.defaultChatId;
  if (!token) throw new Error('Missing Script Property: ' + RFORM_TG.props.token);

  const ss = SpreadsheetApp.openById(RFORM_TG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_TG.queueSheet);
  if (!sheet) throw new Error('Sheet not found: ' + RFORM_TG.queueSheet);

  const headers = rformTgReadHeaders_(sheet);
  const missingCore = RFORM_TG.coreHeaders.filter(h => !headers.includes(h));
  if (missingCore.length) throw new Error('CONTENT_QUEUE missing required headers: ' + missingCore.join(', '));

  // Important: do NOT call getChatMember for the bot itself here.
  // Some channel configurations return PARTICIPANT_ID_INVALID for that self-check.
  const me = rformTgTelegram_(token, 'getMe', {});
  const chat = rformTgTelegram_(token, 'getChat', {chat_id: chatId});
  const handlers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

  const report = {
    ok: true,
    mode: 'READ_ONLY_PREFLIGHT',
    botUsername: '@' + me.username,
    chat: chat.title || chatId,
    chatId: chat.id,
    spreadsheet: ss.getName(),
    spreadsheetTimeZone: ss.getSpreadsheetTimeZone(),
    scriptTimeZone: Session.getScriptTimeZone(),
    queueSheet: sheet.getName(),
    rowCount: Math.max(sheet.getLastRow() - 1, 0),
    missingAutopostHeaders: RFORM_TG.autopostHeaders.filter(h => !headers.includes(h)),
    autopublishEnabled: props.getProperty(RFORM_TG.props.enabled) || 'NOT_SET',
    triggerExists: handlers.includes('rformTgProcessQueue'),
    note: 'Preflight passed. Posting permission is checked separately by rformTgPermissionTest().' 
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Controlled permission test: sends one silent test message and immediately deletes it.
 * Run only after rformTgPreflight() succeeds.
 */
function rformTgPermissionTest() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(RFORM_TG.props.token);
  const chatId = props.getProperty(RFORM_TG.props.chatId) || RFORM_TG.defaultChatId;
  if (!token) throw new Error('Missing Script Property: ' + RFORM_TG.props.token);

  const text = 'R/Form autopost · техническая проверка';
  const msg = rformTgTelegram_(token, 'sendMessage', {
    chat_id: chatId,
    text: text,
    disable_notification: true
  });

  let deleted = false;
  try {
    deleted = !!rformTgTelegram_(token, 'deleteMessage', {
      chat_id: chatId,
      message_id: msg.message_id
    });
  } catch (e) {
    console.log('Test post sent but automatic delete failed: ' + e.message);
  }

  const report = {
    ok: true,
    canPostMessages: true,
    messageId: msg.message_id,
    testMessageDeleted: deleted,
    note: deleted ? 'Posting permission confirmed; test message removed.' : 'Posting permission confirmed; delete the test message manually.'
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/** Install trigger; autopublish remains OFF. */
function rformTgInstall() {
  const report = rformTgPreflight();
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(RFORM_TG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_TG.queueSheet);

  rformTgEnsureHeaders_(sheet, RFORM_TG.autopostHeaders);

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'rformTgProcessQueue')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('rformTgProcessQueue')
    .timeBased()
    .everyMinutes(RFORM_TG.triggerMinutes)
    .create();

  props.setProperty(RFORM_TG.props.enabled, 'NO');
  const out = {
    ok: true,
    installed: true,
    trigger: 'rformTgProcessQueue every ' + RFORM_TG.triggerMinutes + ' minutes',
    autopublishEnabled: 'NO',
    preflight: report
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function rformTgVerifyInstallation() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(RFORM_TG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_TG.queueSheet);
  const headers = rformTgReadHeaders_(sheet);
  const missing = RFORM_TG.autopostHeaders.filter(h => !headers.includes(h));
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'rformTgProcessQueue');
  const report = {
    ok: missing.length === 0 && triggers.length === 1,
    missingHeaders: missing,
    triggerCount: triggers.length,
    autopublishEnabled: props.getProperty(RFORM_TG.props.enabled) || 'NOT_SET',
    expectedAutopublishEnabled: 'NO'
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function rformTgEnableAutopublish() {
  const v = rformTgVerifyInstallation();
  if (!v.ok) throw new Error('Installation verification failed: ' + JSON.stringify(v));
  PropertiesService.getScriptProperties().setProperty(RFORM_TG.props.enabled, 'YES');
  return 'R/Form Telegram autopublish ENABLED.';
}

function rformTgDisableAutopublish() {
  PropertiesService.getScriptProperties().setProperty(RFORM_TG.props.enabled, 'NO');
  return 'R/Form Telegram autopublish DISABLED.';
}

function rformTgProcessQueue() {
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(RFORM_TG.props.enabled)).toUpperCase() !== 'YES') return;

  const ss = SpreadsheetApp.openById(RFORM_TG.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_TG.queueSheet);
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
    if (!rformTgValue_(row, col, 'Content_ID')) continue;
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

    const publishAt = rformTgAsDate_(
      rformTgValue_(row, col, 'Publish_At'),
      rformTgValue_(displayRow, col, 'Publish_At')
    );
    if (!publishAt || publishAt > now) continue;

    const rowNumber = r + 1;
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
  const token = props.getProperty(RFORM_TG.props.token);
  const chatId = rformTgValue_(row, col, 'Telegram_Chat_ID') || props.getProperty(RFORM_TG.props.chatId) || RFORM_TG.defaultChatId;
  const visualUrl = rformTgValue_(row, col, 'Telegram_Visual_URL');

  let publication;
  if (mode === 'TEXT_ONLY') {
    const msg = rformTgTelegram_(token, 'sendMessage', {chat_id: chatId, text: text});
    publication = {messageId: msg.message_id};
  } else {
    const images = rformTgReadImages_(visualUrl);
    if (!images.length) throw new Error('No images found in Telegram_Visual_URL for mode ' + mode);
    if (mode === 'PHOTO_CAPTION') publication = rformTgSendPhoto_(token, chatId, images[0], text);
    else if (mode === 'ALBUM_CAPTION') publication = rformTgSendAlbum_(token, chatId, images.slice(0, 10), text);
    else throw new Error('Unsupported Telegram_Post_Mode: ' + mode);
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

function rformTgSendPhoto_(token, chatId, blob, text) {
  const payload = {chat_id: chatId, photo: blob};
  if (text.length <= 1024) {
    payload.caption = text;
    const photo = rformTgTelegram_(token, 'sendPhoto', payload);
    return {messageId: photo.message_id};
  }
  const photo = rformTgTelegram_(token, 'sendPhoto', payload);
  const msg = rformTgTelegram_(token, 'sendMessage', {chat_id: chatId, text: text});
  return {messageId: msg.message_id, mediaMessageId: photo.message_id};
}

function rformTgSendAlbum_(token, chatId, blobs, text) {
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
  const album = rformTgTelegram_(token, 'sendMediaGroup', payload);
  if (text.length > 1024) {
    const msg = rformTgTelegram_(token, 'sendMessage', {chat_id: chatId, text: text});
    return {messageId: msg.message_id, mediaMessageId: album[0].message_id};
  }
  return {messageId: album[0].message_id};
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
    if (mime === MimeType.PNG || mime === 'image/jpeg') items.push({name: f.getName(), blob: f.getBlob()});
  }
  items.sort((a,b) => a.name.localeCompare(b.name, 'ru'));
  return items.map(x => x.blob);
}

function rformTgTelegram_(token, method, payload) {
  if (!token) throw new Error('Telegram bot token is missing.');
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'post',
    muteHttpExceptions: true,
    payload: payload || {}
  });
  const body = res.getContentText();
  let json;
  try { json = JSON.parse(body); } catch (e) { throw new Error('Telegram returned non-JSON: ' + body); }
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description || body}`);
  return json.result;
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

function rformTgReadHeaders_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(String);
}

function rformTgHeaderMap_(headers) {
  const out = {};
  headers.forEach((h,i) => { if (h) out[h] = i; });
  return out;
}

function rformTgValue_(row, col, name) {
  return col[name] === undefined ? '' : row[col[name]];
}

function rformTgSetCell_(sheet, rowNumber, col, name, value) {
  if (col[name] === undefined) throw new Error('Missing header: ' + name);
  sheet.getRange(rowNumber, col[name] + 1).setValue(value);
}

function rformTgExtractDriveId_(url) {
  if (!url) return '';
  const s = String(url);
  const patterns = [/\/d\/([a-zA-Z0-9_-]{20,})/,/folders\/([a-zA-Z0-9_-]{20,})/ ,/[?&]id=([a-zA-Z0-9_-]{20,})/,/^([a-zA-Z0-9_-]{20,})$/];
  for (const p of patterns) { const m = s.match(p); if (m) return m[1]; }
  return '';
}

function rformTgAsDate_(raw, display) {
  if (raw instanceof Date && !isNaN(raw)) return raw;
  const s = String(display || raw || '').trim();
  if (!s) return null;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})$/);
  if (ru) return new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]), Number(ru[4]), Number(ru[5]), 0);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
