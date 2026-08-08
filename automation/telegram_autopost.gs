const RFORM_AUTOPUBLISH = {
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  queueSheet: 'CONTENT_QUEUE',
  defaultChatId: '@r_form',
  triggerMinutes: 5,
  requiredHeaders: [
    'Publish_At',
    'AutoPost_Allowed',
    'Telegram_Chat_ID',
    'Telegram_Post_Mode',
    'Telegram_Message_ID',
    'Telegram_Post_URL',
    'Posted_At',
    'Publish_Error'
  ]
};

function setupRFormTelegramAutopost() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set in Script Properties.');

  if (!props.getProperty('TELEGRAM_CHAT_ID')) {
    props.setProperty('TELEGRAM_CHAT_ID', RFORM_AUTOPUBLISH.defaultChatId);
  }

  const sheet = getQueueSheet_();
  ensureHeaders_(sheet, RFORM_AUTOPUBLISH.requiredHeaders);
  verifyTelegramAccess_();

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processRFormTelegramQueue')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('processRFormTelegramQueue')
    .timeBased()
    .everyMinutes(RFORM_AUTOPUBLISH.triggerMinutes)
    .create();

  return 'OK: Telegram access verified; CONTENT_QUEUE headers checked; 5-minute trigger created.';
}

function verifyRFormTelegramAccess() {
  return verifyTelegramAccess_();
}

function processRFormTelegramQueue() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const sheet = getQueueSheet_();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    const headers = data[0].map(String);
    const col = makeHeaderMap_(headers);
    const now = new Date();

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const contentId = value_(row, col, 'Content_ID');
      if (!contentId) continue;

      if (String(value_(row, col, 'Public_Data_Allowed')).toUpperCase() !== 'YES') continue;
      if (String(value_(row, col, 'Approval_Status')).toUpperCase() !== 'APPROVED') continue;
      if (String(value_(row, col, 'Text_Status')).toUpperCase() !== 'APPROVED') continue;

      const visualStatus = String(value_(row, col, 'Visual_Status')).toUpperCase();
      if (!['APPROVED', 'NOT_REQUIRED', ''].includes(visualStatus)) continue;

      if (String(value_(row, col, 'AutoPost_Allowed')).toUpperCase() !== 'YES') continue;
      if (String(value_(row, col, 'Publication_Status')).toUpperCase() !== 'SCHEDULED') continue;
      if (value_(row, col, 'Telegram_Message_ID')) continue;

      const publishAt = asDate_(value_(row, col, 'Publish_At'));
      if (!publishAt || publishAt > now) continue;

      try {
        publishQueueRow_(sheet, r + 1, row, col);
      } catch (err) {
        setCellByHeader_(sheet, r + 1, col, 'Publication_Status', 'ERROR');
        setCellByHeader_(sheet, r + 1, col, 'Publish_Error', String(err && err.stack ? err.stack : err));
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function publishQueueRow_(sheet, rowNumber, row, col) {
  const props = PropertiesService.getScriptProperties();
  const chatId = value_(row, col, 'Telegram_Chat_ID') || props.getProperty('TELEGRAM_CHAT_ID') || RFORM_AUTOPUBLISH.defaultChatId;
  const mode = String(value_(row, col, 'Telegram_Post_Mode') || 'AUTO').toUpperCase();
  const textUrl = value_(row, col, 'Text_URL');
  const visualUrl = value_(row, col, 'Visual_URL');
  const text = readText_(textUrl).trim();
  const images = readPngs_(visualUrl);

  let result;
  if (mode === 'TEXT_ONLY' || images.length === 0) {
    result = sendMessage_(chatId, text);
  } else if (images.length === 1 || mode === 'PHOTO_CAPTION') {
    result = sendPhoto_(chatId, images[0], text);
  } else {
    result = sendAlbum_(chatId, images.slice(0, 10), text);
  }

  const messageId = Array.isArray(result) ? result[0].message_id : result.message_id;
  const username = String(chatId).replace(/^@/, '');
  const postUrl = String(chatId).startsWith('@') ? `https://t.me/${username}/${messageId}` : '';
  const postedAt = new Date();

  setCellByHeader_(sheet, rowNumber, col, 'Telegram_Message_ID', String(messageId));
  setCellByHeader_(sheet, rowNumber, col, 'Telegram_Post_URL', postUrl);
  setCellByHeader_(sheet, rowNumber, col, 'Posted_At', postedAt);
  setCellByHeader_(sheet, rowNumber, col, 'Publication_Status', 'PUBLISHED');
  setCellByHeader_(sheet, rowNumber, col, 'Publish_Error', '');
  if (col['Updated_At'] !== undefined) setCellByHeader_(sheet, rowNumber, col, 'Updated_At', postedAt);
}

function readText_(url) {
  if (!url) return '';
  const id = extractDriveId_(url);
  if (!id) throw new Error('Cannot resolve Text_URL: ' + url);
  const file = DriveApp.getFileById(id);
  const mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_DOCS) {
    return DocumentApp.openById(id).getBody().getText();
  }
  return file.getBlob().getDataAsString('UTF-8');
}

function readPngs_(url) {
  if (!url) return [];
  const id = extractDriveId_(url);
  if (!id) return [];
  let folder;
  try { folder = DriveApp.getFolderById(id); } catch (e) { return []; }
  const items = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.PNG || f.getMimeType() === 'image/jpeg') {
      items.push({name: f.getName(), blob: f.getBlob()});
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return items.map(x => x.blob);
}

function sendMessage_(chatId, text) {
  if (!text) throw new Error('Text is empty.');
  if (text.length > 4096) throw new Error('Telegram text exceeds 4096 characters.');
  return telegram_('sendMessage', {chat_id: chatId, text: text});
}

function sendPhoto_(chatId, blob, text) {
  const payload = {chat_id: chatId, photo: blob};
  if (text && text.length <= 1024) payload.caption = text;
  const result = telegram_('sendPhoto', payload, true);
  if (text && text.length > 1024) sendMessage_(chatId, text);
  return result;
}

function sendAlbum_(chatId, blobs, text) {
  if (!blobs.length) return sendMessage_(chatId, text);
  const payload = {chat_id: chatId};
  const media = [];
  blobs.forEach((blob, i) => {
    const key = 'file' + i;
    payload[key] = blob;
    const item = {type: 'photo', media: 'attach://' + key};
    if (i === 0 && text && text.length <= 1024) item.caption = text;
    media.push(item);
  });
  payload.media = JSON.stringify(media);
  const result = telegram_('sendMediaGroup', payload, true);
  if (text && text.length > 1024) sendMessage_(chatId, text);
  return result;
}

function verifyTelegramAccess_() {
  const me = telegram_('getMe', {});
  const props = PropertiesService.getScriptProperties();
  const chatId = props.getProperty('TELEGRAM_CHAT_ID') || RFORM_AUTOPUBLISH.defaultChatId;
  const chat = telegram_('getChat', {chat_id: chatId});
  const member = telegram_('getChatMember', {chat_id: chatId, user_id: me.id});
  if (!['administrator', 'creator'].includes(member.status)) {
    throw new Error('Bot is not an administrator of ' + chatId + '.');
  }
  if (member.status === 'administrator' && member.can_post_messages === false) {
    throw new Error('Bot does not have can_post_messages permission in ' + chatId + '.');
  }
  return `OK: @${me.username} can access ${chat.title || chatId}; status=${member.status}; can_post_messages=${member.can_post_messages}`;
}

function telegram_(method, payload, multipart) {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing.');
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const options = {
    method: 'post',
    muteHttpExceptions: true,
    payload: payload
  };
  if (!multipart) options.contentType = 'application/x-www-form-urlencoded';
  const res = UrlFetchApp.fetch(url, options);
  const body = res.getContentText();
  let json;
  try { json = JSON.parse(body); } catch (e) { throw new Error('Telegram returned non-JSON response: ' + body); }
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description || body}`);
  return json.result;
}

function getQueueSheet_() {
  const ss = SpreadsheetApp.openById(RFORM_AUTOPUBLISH.spreadsheetId);
  const sheet = ss.getSheetByName(RFORM_AUTOPUBLISH.queueSheet);
  if (!sheet) throw new Error('Sheet not found: ' + RFORM_AUTOPUBLISH.queueSheet);
  return sheet;
}

function ensureHeaders_(sheet, required) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  let next = headers.length + 1;
  required.forEach(h => {
    if (!headers.includes(h)) {
      sheet.getRange(1, next).setValue(h);
      headers.push(h);
      next++;
    }
  });
}

function makeHeaderMap_(headers) {
  const out = {};
  headers.forEach((h, i) => { if (h) out[h] = i; });
  return out;
}

function value_(row, col, name) {
  return col[name] === undefined ? '' : row[col[name]];
}

function setCellByHeader_(sheet, rowNumber, col, name, value) {
  if (col[name] === undefined) throw new Error('Missing header: ' + name);
  sheet.getRange(rowNumber, col[name] + 1).setValue(value);
}

function extractDriveId_(url) {
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

function asDate_(value) {
  if (value instanceof Date && !isNaN(value)) return value;
  if (!value) return null;
  const s = String(value).trim();
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})$/);
  if (ru) return new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]), Number(ru[4]), Number(ru[5]), 0);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
