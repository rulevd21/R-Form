// R/Form Content Control API v0.4
// Standalone Apps Script web app for Channel Control.
// Reads CONTENT_QUEUE + DATA_EVENTS, applies allowlisted content actions,
// saves owner-facing event edits, stores private photo/video assets in Drive,
// and can promote an approved event to a PLANNED CONTENT_QUEUE row.
// It never calls Telegram and never sets SCHEDULED/PUBLISHING/PUBLISHED.

const RFORM_CONTENT_API_V04 = Object.freeze({
  version: '0.4.0',
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  queueSheet: 'CONTENT_QUEUE',
  eventsSheet: 'DATA_EVENTS',
  actionLogSheet: 'CONTENT_ACTION_LOG',
  eventLogSheet: 'EVENT_ACTION_LOG',
  assetsRootFolderId: '1m9BcQeUQxk8aYCTmrkINcS-8Tegm1S-v',
  secretProperty: 'RFORM_CONTENT_API_SECRET',
  requestWindowSeconds: 300,
  nonceTtlSeconds: 600,
  maxCommentChars: 500,
  maxFactChars: 5000,
  maxAngleChars: 700,
  maxNoteChars: 2000,
  maxMediaBytes: 30 * 1024 * 1024,
  allowedMediaTypes: Object.freeze([
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime'
  ]),
  queueFields: Object.freeze([
    'Content_ID', 'Date', 'Rubric', 'Public_Data_Allowed', 'Text_Status',
    'Visual_Status', 'Approval_Status', 'Publication_Status', 'Pipeline_Status',
    'Publish_At', 'Distribution_Mode', 'Telegram_Text', 'Blocking_Issue',
    'Preview_Review_Status', 'Content_Type', 'Target_Segment', 'Decision',
    'Editorial_Direction', 'Work_Packet_URL', 'Folder_URL', 'Text_URL',
    'Visual_URL', 'Duplicate_Flag', 'Publish_Error'
  ]),
  eventFields: Object.freeze([
    'Event_ID', 'Date', 'Entity', 'Event_Type', 'Source', 'Fact',
    'Content_Value_Score', 'Editorial_Trigger', 'Manual_Gate',
    'Candidate_Content_ID', 'Status', 'Recommended_Angle_1',
    'Recommended_Angle_2', 'Recommended_Angle_3', 'Owner_Action',
    'Created_At', 'Updated_At',
    'Owner_Fact', 'Owner_Angle', 'Owner_Note', 'Owner_Media_URLs',
    'Owner_Media_Folder_URL', 'Owner_Review_Status', 'Owner_Updated_At'
  ]),
  eventOwnerFields: Object.freeze([
    'Owner_Fact', 'Owner_Angle', 'Owner_Note', 'Owner_Media_URLs',
    'Owner_Media_Folder_URL', 'Owner_Review_Status', 'Owner_Updated_At'
  ]),
  actionFields: Object.freeze([
    'Content_ID', 'Public_Data_Allowed', 'Text_Status', 'Visual_Status',
    'Approval_Status', 'Publication_Status', 'Pipeline_Status',
    'Distribution_Mode', 'Telegram_Text', 'Blocking_Issue',
    'Preview_Review_Status', 'Duplicate_Flag', 'Publish_Error'
  ]),
  actionLogHeaders: Object.freeze([
    'Action_ID', 'Timestamp', 'Content_ID', 'Action', 'Comment',
    'Changed_Fields', 'Previous_Values', 'New_Values', 'Actor',
    'Request_Nonce', 'Result'
  ]),
  eventLogHeaders: Object.freeze([
    'Action_ID', 'Timestamp', 'Event_ID', 'Operation', 'Decision',
    'Details', 'Actor', 'Request_Nonce', 'Result'
  ])
});

const RFORM_CONTENT_ACTIONS_V04 = Object.freeze({
  APPROVE: Object.freeze({
    Approval_Status: 'APPROVED',
    Pipeline_Status: 'APPROVED',
    Preview_Review_Status: 'REVIEWED'
  }),
  RETURN_FOR_REVISION: Object.freeze({
    Approval_Status: 'NOT_READY',
    Publication_Status: 'NOT_READY',
    Pipeline_Status: 'REWORK',
    Preview_Review_Status: 'RECHECK_REQUIRED'
  }),
  HOLD: Object.freeze({
    Publication_Status: 'HOLD',
    Pipeline_Status: 'HOLD'
  }),
  READY_TO_PUBLISH: Object.freeze({
    Publication_Status: 'PLANNED',
    Pipeline_Status: 'READY_FOR_PUBLICATION',
    Preview_Review_Status: 'REVIEWED'
  })
});

const RFORM_EVENT_DECISIONS_V04 = Object.freeze({
  TO_PUBLICATION: 'PUBLICATION',
  TO_WEEKLY: 'WEEKLY',
  DISMISS: 'DISMISSED'
});

function rformContentApiV04CreateSecret() {
  const secret = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()].join('');
  PropertiesService.getScriptProperties().setProperty(
    RFORM_CONTENT_API_V04.secretProperty,
    secret
  );
  console.log('RFORM_CONTENT_API_SECRET=' + secret);
  return 'Secret created. Copy it directly into Streamlit Secrets.';
}

function rformContentApiV04Preflight() {
  const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
  const queue = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.queueSheet);
  const events = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.eventsSheet);
  const queueHeaders = rformContentApiV04Headers_(queue);
  const eventHeaders = rformContentApiV04Headers_(events);
  const missingQueue = RFORM_CONTENT_API_V04.queueFields.filter(function (name) {
    return queueHeaders.indexOf(name) === -1;
  });
  const missingEvents = RFORM_CONTENT_API_V04.eventFields.filter(function (name) {
    return eventHeaders.indexOf(name) === -1;
  });
  const missingActionFields = RFORM_CONTENT_API_V04.actionFields.filter(function (name) {
    return queueHeaders.indexOf(name) === -1;
  });
  let assetsRootAccessible = false;
  try {
    DriveApp.getFolderById(RFORM_CONTENT_API_V04.assetsRootFolderId).getName();
    assetsRootAccessible = true;
  } catch (error) {
    assetsRootAccessible = false;
  }
  const report = {
    ok: missingQueue.length === 0 && missingEvents.length === 0 &&
      missingActionFields.length === 0 && assetsRootAccessible,
    mode: 'CONTROL_API_PREFLIGHT',
    version: RFORM_CONTENT_API_V04.version,
    capabilities: [
      'content.read', 'content.action', 'event.review', 'event.decision', 'event.media'
    ],
    spreadsheet: spreadsheet.getName(),
    queueRows: Math.max(queue.getLastRow() - 1, 0),
    eventRows: Math.max(events.getLastRow() - 1, 0),
    missingQueueFields: missingQueue,
    missingEventFields: missingEvents,
    missingActionFields: missingActionFields,
    assetsRootAccessible: assetsRootAccessible,
    secretConfigured: !!PropertiesService.getScriptProperties().getProperty(
      RFORM_CONTENT_API_V04.secretProperty
    ),
    telegramCallsPresent: false,
    scheduledStatusCanBeWritten: false
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function doGet() {
  return rformContentApiV04Json_({
    ok: false,
    code: 'METHOD_NOT_ALLOWED',
    message: 'Use a signed POST request.'
  });
}

function doPost(e) {
  try {
    const request = rformContentApiV04ParseRequest_(e);
    rformContentApiV04Authorize_(request);
    const operation = String(request.operation || 'read');
    if (operation === 'content_action') {
      return rformContentApiV04Json_(rformContentApiV04ApplyContentAction_(request));
    }
    if (operation === 'event_review') {
      return rformContentApiV04Json_(rformContentApiV04ApplyEventReview_(request));
    }
    if (operation === 'event_decision') {
      return rformContentApiV04Json_(rformContentApiV04ApplyEventDecision_(request));
    }
    if (operation === 'event_media') {
      return rformContentApiV04Json_(rformContentApiV04ApplyEventMedia_(request));
    }
    return rformContentApiV04Json_(rformContentApiV04Payload_());
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return rformContentApiV04Json_({
      ok: false,
      code: 'REQUEST_REJECTED',
      message: error && error.message ? error.message : 'Request rejected.'
    });
  }
}

function rformContentApiV04Payload_() {
  const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
  const queue = rformContentApiV04ReadRows_(
    rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.queueSheet),
    RFORM_CONTENT_API_V04.queueFields,
    'Content_ID'
  );
  const events = rformContentApiV04ReadRows_(
    rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.eventsSheet),
    RFORM_CONTENT_API_V04.eventFields,
    'Event_ID'
  );
  return {
    ok: true,
    version: RFORM_CONTENT_API_V04.version,
    mode: 'CONTROLLED_WRITE',
    capabilities: [
      'content.read', 'content.action', 'event.review', 'event.decision', 'event.media'
    ],
    generated_at: new Date().toISOString(),
    queue_fields: RFORM_CONTENT_API_V04.queueFields,
    event_fields: RFORM_CONTENT_API_V04.eventFields,
    queue: queue,
    events: events,
    row_counts: {queue: queue.length, events: events.length}
  };
}

function rformContentApiV04ParseRequest_(e) {
  const body = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!body) throw new Error('Пустое тело запроса.');
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error('Некорректный JSON-запрос.');
  }
  return parsed || {};
}

function rformContentApiV04Authorize_(request) {
  const secret = PropertiesService.getScriptProperties().getProperty(
    RFORM_CONTENT_API_V04.secretProperty
  );
  if (!secret) throw new Error('Секрет API не настроен.');

  const timestamp = Number(request.timestamp);
  const nonce = String(request.nonce || '');
  const signature = String(request.signature || '');
  const operation = String(request.operation || 'read');
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp)) throw new Error('Некорректное время запроса.');
  if (Math.abs(now - timestamp) > RFORM_CONTENT_API_V04.requestWindowSeconds) {
    throw new Error('Срок действия запроса истёк.');
  }
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Некорректный nonce.');
  if ([
    'read', 'content_action', 'event_review', 'event_decision', 'event_media'
  ].indexOf(operation) === -1) {
    throw new Error('Операция не поддерживается.');
  }
  if (!signature) throw new Error('Подпись запроса отсутствует.');

  const message = rformContentApiV04SignedMessage_(request);
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(message, secret)
  ).replace(/=+$/, '');
  if (!rformContentApiV04ConstantTimeEqual_(signature, expected)) {
    throw new Error('Подпись запроса недействительна.');
  }

  const cache = CacheService.getScriptCache();
  const nonceKey = 'rform_content_nonce_' + nonce;
  if (cache.get(nonceKey)) throw new Error('Повтор запроса отклонён.');
  cache.put(nonceKey, '1', RFORM_CONTENT_API_V04.nonceTtlSeconds);
}

function rformContentApiV04SignedMessage_(request) {
  const timestamp = String(request.timestamp);
  const nonce = String(request.nonce || '');
  const operation = String(request.operation || 'read');
  if (operation === 'read') return timestamp + '.' + nonce;

  if (operation === 'content_action') {
    return [
      timestamp,
      nonce,
      operation,
      String(request.action_id || ''),
      String(request.content_id || ''),
      String(request.action || ''),
      rformContentApiV04Sha256Hex_(String(request.comment || ''))
    ].join('\n');
  }
  if (operation === 'event_review') {
    return [
      timestamp,
      nonce,
      operation,
      String(request.action_id || ''),
      String(request.event_id || ''),
      rformContentApiV04Sha256Hex_(String(request.fact || '').trim()),
      rformContentApiV04Sha256Hex_(String(request.angle || '').trim()),
      rformContentApiV04Sha256Hex_(String(request.note || '').trim())
    ].join('\n');
  }
  if (operation === 'event_decision') {
    return [
      timestamp,
      nonce,
      operation,
      String(request.action_id || ''),
      String(request.event_id || ''),
      String(request.decision || '').trim().toUpperCase(),
      rformContentApiV04Sha256Hex_(String(request.fact || '').trim()),
      rformContentApiV04Sha256Hex_(String(request.angle || '').trim()),
      rformContentApiV04Sha256Hex_(String(request.note || '').trim())
    ].join('\n');
  }
  if (operation === 'event_media') {
    return [
      timestamp,
      nonce,
      operation,
      String(request.action_id || ''),
      String(request.event_id || ''),
      String(request.filename || ''),
      String(request.mime_type || '').trim().toLowerCase(),
      String(request.size || ''),
      String(request.sha256 || '').trim().toLowerCase()
    ].join('\n');
  }
  throw new Error('Операция не поддерживается.');
}

function rformContentApiV04ApplyContentAction_(request) {
  const actionId = String(request.action_id || '').trim();
  const contentId = String(request.content_id || '').trim();
  const action = String(request.action || '').trim().toUpperCase();
  const comment = String(request.comment || '').trim();
  const nonce = String(request.nonce || '');

  rformContentApiV04RequireActionId_(actionId);
  rformContentApiV04RequireRecordId_(contentId, 'Код материала');
  if (!Object.prototype.hasOwnProperty.call(RFORM_CONTENT_ACTIONS_V04, action)) {
    throw new Error('Действие не входит в белый список.');
  }
  if (comment.length > RFORM_CONTENT_API_V04.maxCommentChars) {
    throw new Error('Комментарий слишком длинный.');
  }
  if ((action === 'RETURN_FOR_REVISION' || action === 'HOLD') && !comment) {
    throw new Error('Для этого действия требуется комментарий.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Очередь занята. Повторите попытку.');
  try {
    const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
    const queue = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.queueSheet);
    const headers = rformContentApiV04Headers_(queue);
    const missing = RFORM_CONTENT_API_V04.actionFields.filter(function (name) {
      return headers.indexOf(name) === -1;
    });
    if (missing.length) throw new Error('CONTENT_QUEUE missing action fields: ' + missing.join(', '));

    const logSheet = rformContentApiV04EnsureContentLog_(spreadsheet);
    const prior = rformContentApiV04ExistingLogResult_(logSheet, actionId, 'Action_ID');
    if (prior) return prior;

    const queueRow = rformContentApiV04FindUniqueRow_(queue, 'Content_ID', contentId);
    const columnMap = rformContentApiV04HeaderMap_(headers);
    const rowValues = queue.getRange(queueRow, 1, 1, queue.getLastColumn()).getDisplayValues()[0];
    const value = function (name) {
      return String(rowValues[columnMap[name] - 1] || '').trim();
    };

    rformContentApiV04RequireOpenMaterial_(value);
    if (action === 'READY_TO_PUBLISH') rformContentApiV04RequireReady_(value);

    const updates = RFORM_CONTENT_ACTIONS_V04[action];
    const previous = {};
    const next = {};
    Object.keys(updates).forEach(function (name) {
      previous[name] = value(name);
      next[name] = updates[name];
    });

    logSheet.appendRow([
      actionId, new Date(), contentId, action, rformContentApiV04SafeText_(comment),
      Object.keys(updates).join(','), JSON.stringify(previous), JSON.stringify(next),
      'STREAMLIT_OWNER', nonce, 'PENDING'
    ]);
    const logRow = logSheet.getLastRow();
    const logMap = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(logSheet));
    try {
      Object.keys(updates).forEach(function (name) {
        queue.getRange(queueRow, columnMap[name]).setValue(updates[name]);
      });
      SpreadsheetApp.flush();
      logSheet.getRange(logRow, logMap.Result).setValue('APPLIED');
    } catch (error) {
      Object.keys(previous).forEach(function (name) {
        queue.getRange(queueRow, columnMap[name]).setValue(previous[name]);
      });
      SpreadsheetApp.flush();
      logSheet.getRange(logRow, logMap.Result).setValue('FAILED_ROLLED_BACK');
      throw error;
    }

    return {
      ok: true, status: 'APPLIED', action_id: actionId,
      content_id: contentId, action: action,
      changed_fields: Object.keys(updates), message: 'Action applied and logged.'
    };
  } finally {
    lock.releaseLock();
  }
}

function rformContentApiV04ApplyEventReview_(request) {
  const actionId = String(request.action_id || '').trim();
  const eventId = String(request.event_id || '').trim();
  const fact = String(request.fact || '').trim();
  const angle = String(request.angle || '').trim();
  const note = String(request.note || '').trim();
  const nonce = String(request.nonce || '');
  rformContentApiV04RequireActionId_(actionId);
  rformContentApiV04RequireRecordId_(eventId, 'Код события');
  rformContentApiV04ValidateOwnerText_(fact, angle, note);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Журнал событий занят. Повторите попытку.');
  try {
    const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
    const events = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.eventsSheet);
    const row = rformContentApiV04FindUniqueRow_(events, 'Event_ID', eventId);
    const map = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(events));
    rformContentApiV04RequireEventOwnerSchema_(map);
    rformContentApiV04RequireOpenEvent_(events, row, map);
    const log = rformContentApiV04EnsureEventLog_(spreadsheet);
    const prior = rformContentApiV04ExistingEventLogResult_(log, actionId);
    if (prior) return prior;

    rformContentApiV04WriteEventOwner_(events, row, map, {
      Owner_Fact: fact,
      Owner_Angle: angle,
      Owner_Note: note,
      Owner_Review_Status: 'EDITED',
      Owner_Updated_At: new Date()
    });
    const details = {fact: fact, angle: angle, note: note};
    rformContentApiV04AppendEventLog_(log, actionId, eventId, 'EVENT_REVIEW', '', details, nonce, 'APPLIED');
    return {ok: true, status: 'APPLIED', event_id: eventId, review_status: 'EDITED'};
  } finally {
    lock.releaseLock();
  }
}

function rformContentApiV04ApplyEventDecision_(request) {
  const actionId = String(request.action_id || '').trim();
  const eventId = String(request.event_id || '').trim();
  const decision = String(request.decision || '').trim().toUpperCase();
  const fact = String(request.fact || '').trim();
  const angle = String(request.angle || '').trim();
  const note = String(request.note || '').trim();
  const nonce = String(request.nonce || '');
  rformContentApiV04RequireActionId_(actionId);
  rformContentApiV04RequireRecordId_(eventId, 'Код события');
  rformContentApiV04ValidateOwnerText_(fact, angle, note);
  if (!Object.prototype.hasOwnProperty.call(RFORM_EVENT_DECISIONS_V04, decision)) {
    throw new Error('Редакционное решение не поддерживается.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Журнал событий занят. Повторите попытку.');
  try {
    const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
    const events = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.eventsSheet);
    const row = rformContentApiV04FindUniqueRow_(events, 'Event_ID', eventId);
    const map = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(events));
    rformContentApiV04RequireEventOwnerSchema_(map);
    rformContentApiV04RequireOpenEvent_(events, row, map);
    const log = rformContentApiV04EnsureEventLog_(spreadsheet);
    const prior = rformContentApiV04ExistingEventLogResult_(log, actionId);
    if (prior) return prior;

    let candidateContentId = '';
    if (decision === 'TO_PUBLICATION') {
      candidateContentId = rformContentApiV04PromoteEvent_(spreadsheet, events, row, map, fact, angle, note);
    }
    const updates = {
      Owner_Fact: fact,
      Owner_Angle: angle,
      Owner_Note: note,
      Owner_Review_Status: RFORM_EVENT_DECISIONS_V04[decision],
      Owner_Updated_At: new Date()
    };
    if (candidateContentId && map.Candidate_Content_ID) {
      events.getRange(row, map.Candidate_Content_ID).setValue(candidateContentId);
    }
    rformContentApiV04WriteEventOwner_(events, row, map, updates);
    const details = {
      fact: fact, angle: angle, note: note,
      candidate_content_id: candidateContentId
    };
    rformContentApiV04AppendEventLog_(log, actionId, eventId, 'EVENT_DECISION', decision, details, nonce, 'APPLIED');
    return {
      ok: true, status: 'APPLIED', event_id: eventId, decision: decision,
      review_status: RFORM_EVENT_DECISIONS_V04[decision],
      candidate_content_id: candidateContentId
    };
  } finally {
    lock.releaseLock();
  }
}

function rformContentApiV04ApplyEventMedia_(request) {
  const actionId = String(request.action_id || '').trim();
  const eventId = String(request.event_id || '').trim();
  const filename = String(request.filename || '').trim();
  const mimeType = String(request.mime_type || '').trim().toLowerCase();
  const expectedSize = Number(request.size);
  const expectedSha = String(request.sha256 || '').trim().toLowerCase();
  const base64Data = String(request.data_base64 || '');
  const nonce = String(request.nonce || '');
  rformContentApiV04RequireActionId_(actionId);
  rformContentApiV04RequireRecordId_(eventId, 'Код события');
  if (!filename || filename.length > 180) throw new Error('Некорректное имя файла.');
  if (RFORM_CONTENT_API_V04.allowedMediaTypes.indexOf(mimeType) === -1) {
    throw new Error('Разрешены JPG, PNG, WEBP, MP4 и MOV.');
  }
  if (!Number.isFinite(expectedSize) || expectedSize < 1 || expectedSize > RFORM_CONTENT_API_V04.maxMediaBytes) {
    throw new Error('Размер файла превышает лимит 30 МБ.');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha)) throw new Error('Некорректный SHA-256 файла.');

  let bytes;
  try {
    bytes = Utilities.base64Decode(base64Data);
  } catch (error) {
    throw new Error('Файл не удалось декодировать.');
  }
  if (bytes.length !== expectedSize) throw new Error('Размер файла не совпадает с подписью запроса.');
  const actualSha = rformContentApiV04Sha256BytesHex_(bytes);
  if (actualSha !== expectedSha) throw new Error('Контрольная сумма файла не совпадает.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Хранилище занято. Повторите попытку.');
  try {
    const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
    const events = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.eventsSheet);
    const row = rformContentApiV04FindUniqueRow_(events, 'Event_ID', eventId);
    const map = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(events));
    rformContentApiV04RequireEventOwnerSchema_(map);
    rformContentApiV04RequireOpenEvent_(events, row, map);
    const log = rformContentApiV04EnsureEventLog_(spreadsheet);
    const prior = rformContentApiV04ExistingEventLogResult_(log, actionId);
    if (prior) return prior;

    const root = DriveApp.getFolderById(RFORM_CONTENT_API_V04.assetsRootFolderId);
    const folder = rformContentApiV04EventFolder_(root, eventId);
    const safeName = rformContentApiV04SafeFilename_(filename);
    const storedName = actualSha.slice(0, 12) + '__' + safeName;
    let file = null;
    const existing = folder.getFilesByName(storedName);
    if (existing.hasNext()) {
      file = existing.next();
    } else {
      file = folder.createFile(Utilities.newBlob(bytes, mimeType, storedName));
      file.setDescription('R/Form DATA_EVENT asset · ' + eventId);
    }
    const fileUrl = file.getUrl();
    const folderUrl = 'https://drive.google.com/drive/folders/' + folder.getId();
    const urls = rformContentApiV04ReadUrlList_(events.getRange(row, map.Owner_Media_URLs).getDisplayValue());
    if (urls.indexOf(fileUrl) === -1) urls.push(fileUrl);
    events.getRange(row, map.Owner_Media_URLs).setValue(JSON.stringify(urls));
    events.getRange(row, map.Owner_Media_Folder_URL).setValue(folderUrl);
    const currentReview = String(events.getRange(row, map.Owner_Review_Status).getDisplayValue() || '').trim();
    if (!currentReview) events.getRange(row, map.Owner_Review_Status).setValue('EDITED');
    events.getRange(row, map.Owner_Updated_At).setValue(new Date());

    const details = {
      file_url: fileUrl, folder_url: folderUrl, filename: storedName,
      mime_type: mimeType, size: expectedSize, sha256: actualSha
    };
    rformContentApiV04AppendEventLog_(log, actionId, eventId, 'EVENT_MEDIA', '', details, nonce, 'APPLIED');
    return {
      ok: true, status: 'APPLIED', event_id: eventId,
      file_url: fileUrl, folder_url: folderUrl, filename: storedName
    };
  } finally {
    lock.releaseLock();
  }
}

function rformContentApiV04PromoteEvent_(spreadsheet, events, row, eventMap, fact, angle, note) {
  const eventValues = events.getRange(row, 1, 1, events.getLastColumn()).getDisplayValues()[0];
  const eventValue = function (name) {
    return eventMap[name] ? String(eventValues[eventMap[name] - 1] || '').trim() : '';
  };
  const existingCandidate = eventValue('Candidate_Content_ID');
  const queue = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.queueSheet);
  if (existingCandidate) {
    const existingRow = rformContentApiV04FindOptionalRow_(queue, 'Content_ID', existingCandidate);
    if (existingRow) return existingCandidate;
  }

  const eventId = eventValue('Event_ID');
  const eventDate = eventValue('Date');
  const contentId = rformContentApiV04CandidateId_(eventId, eventDate);
  const existingRow = rformContentApiV04FindOptionalRow_(queue, 'Content_ID', contentId);
  if (existingRow) return contentId;

  const headers = rformContentApiV04Headers_(queue);
  const map = rformContentApiV04HeaderMap_(headers);
  const values = new Array(headers.length).fill('');
  const set = function (name, value) {
    if (map[name]) values[map[name] - 1] = value;
  };
  const source = eventValue('Source');
  const entity = eventValue('Entity');
  const rubric = rformContentApiV04Rubric_(source, entity);
  const folderUrl = eventValue('Owner_Media_Folder_URL');
  const mediaUrls = rformContentApiV04ReadUrlList_(eventValue('Owner_Media_URLs'));
  const now = new Date();
  const today = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Etc/GMT', 'dd.MM.yyyy');

  set('Content_ID', contentId);
  if (/^S-/i.test(entity)) set('Session_ID', entity);
  set('Date', today);
  set('Rubric', rubric);
  set('Main_Training_Fact', fact);
  set('Decision', angle);
  set('Public_Data_Allowed', 'YES');
  set('Source_Packet_Status', 'READY');
  set('Text_Status', 'NOT_READY');
  set('Visual_Status', 'NOT_READY');
  set('Approval_Status', 'PENDING');
  set('Publication_Status', 'PLANNED');
  set('Created_At', now);
  set('Updated_At', now);
  set('Task_ID', 'RFORM-EVENT-' + rformContentApiV04ShortHash_(eventId));
  set('Pipeline_Status', 'PLANNED');
  set('Current_Stage', 'BRIEF');
  set('Current_Chat', 'CHANNEL_CONTROL');
  set('Next_Chat', '04_TELEGRAM_STUDIO');
  set('Folder_URL', folderUrl);
  if (mediaUrls.length) {
    set('Visual_URL', mediaUrls[0]);
    set('Telegram_Visual_URL', mediaUrls[0]);
  }
  set('Editorial_Trigger', eventValue('Editorial_Trigger'));
  set('Content_Function', /DECISION|CONTROL/i.test(eventValue('Event_Type')) ? 'TRUST' : 'PROOF');
  set('Content_Type', 'PROOF');
  set('Funnel_Stage', 'TRUST');
  set('Reader_Value', angle);
  set('Proof_Source', source || eventId);
  set('CTA_Type', 'RETURN_TO_CHANNEL');
  set('Distribution_Mode', 'ORGANIC');
  set('Editorial_Direction', angle);
  set('AutoPost_Allowed', 'NO');
  set('Telegram_Chat_ID', '@r_form');
  set('Preview_Review_Status', 'NOT_REVIEWED');
  if (note) set('Audience_Problem', note);

  queue.appendRow(values);
  SpreadsheetApp.flush();
  return contentId;
}

function rformContentApiV04CandidateId_(eventId, eventDate) {
  const m = String(eventDate || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  let dateKey;
  if (m) {
    dateKey = m[3] + ('0' + m[2]).slice(-2) + ('0' + m[1]).slice(-2);
  } else {
    dateKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/GMT', 'yyyyMMdd');
  }
  return 'CNT-' + dateKey + '-EVENT-' + rformContentApiV04ShortHash_(eventId);
}

function rformContentApiV04ShortHash_(value) {
  return rformContentApiV04Sha256Hex_(String(value)).slice(0, 10).toUpperCase();
}

function rformContentApiV04Rubric_(source, entity) {
  const text = (String(source || '') + ' ' + String(entity || '')).toUpperCase();
  if (text.indexOf('NUTRITION') !== -1) return 'NUTRITION_CASE';
  if (text.indexOf('TRAINING') !== -1 || /^S-/i.test(String(entity || ''))) return 'TRAINING_LOG';
  return 'DECISION / AI_CHECK';
}

function rformContentApiV04WriteEventOwner_(sheet, row, map, updates) {
  Object.keys(updates).forEach(function (name) {
    if (!map[name]) throw new Error('DATA_EVENTS missing field: ' + name);
    const value = updates[name] instanceof Date ? updates[name] : rformContentApiV04SafeText_(updates[name]);
    sheet.getRange(row, map[name]).setValue(value);
  });
  SpreadsheetApp.flush();
}

function rformContentApiV04RequireEventOwnerSchema_(map) {
  const missing = RFORM_CONTENT_API_V04.eventOwnerFields.filter(function (name) {
    return !map[name];
  });
  if (missing.length) throw new Error('DATA_EVENTS missing owner fields: ' + missing.join(', '));
}

function rformContentApiV04RequireOpenEvent_(sheet, row, map) {
  const status = map.Status ? String(sheet.getRange(row, map.Status).getDisplayValue()).trim().toUpperCase() : '';
  const ownerStatus = map.Owner_Review_Status ? String(sheet.getRange(row, map.Owner_Review_Status).getDisplayValue()).trim().toUpperCase() : '';
  if (['PUBLISHED', 'ALREADY_IN_PIPELINE', 'FILTERED_OUT_V03'].indexOf(status) !== -1) {
    throw new Error('Событие уже обработано системой.');
  }
  if (['PUBLICATION', 'WEEKLY', 'DISMISSED'].indexOf(ownerStatus) !== -1) {
    throw new Error('Редакционное решение по событию уже принято.');
  }
}

function rformContentApiV04ValidateOwnerText_(fact, angle, note) {
  if (!fact) throw new Error('Факт для публикации обязателен.');
  if (!angle) throw new Error('Главная мысль обязательна.');
  if (fact.length > RFORM_CONTENT_API_V04.maxFactChars) throw new Error('Факт слишком длинный.');
  if (angle.length > RFORM_CONTENT_API_V04.maxAngleChars) throw new Error('Главная мысль слишком длинная.');
  if (note.length > RFORM_CONTENT_API_V04.maxNoteChars) throw new Error('Комментарий слишком длинный.');
}

function rformContentApiV04EventFolder_(root, eventId) {
  const name = String(eventId).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160);
  const folders = root.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return root.createFolder(name);
}

function rformContentApiV04SafeFilename_(filename) {
  const normalized = String(filename || '')
    .replace(/[\\/]+/g, '_')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/^\.+/, '')
    .trim();
  return (normalized || 'asset').slice(0, 160);
}

function rformContentApiV04ReadUrlList_(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch (error) {
    // Legacy single URL below.
  }
  return text.split(/\s*\n\s*/).filter(Boolean);
}

function rformContentApiV04EnsureContentLog_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(RFORM_CONTENT_API_V04.actionLogSheet);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(RFORM_CONTENT_API_V04.actionLogSheet);
    sheet.getRange(1, 1, 1, RFORM_CONTENT_API_V04.actionLogHeaders.length)
      .setValues([RFORM_CONTENT_API_V04.actionLogHeaders]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const headers = rformContentApiV04Headers_(sheet);
  const missing = RFORM_CONTENT_API_V04.actionLogHeaders.filter(function (name) {
    return headers.indexOf(name) === -1;
  });
  if (missing.length) throw new Error('CONTENT_ACTION_LOG missing fields: ' + missing.join(', '));
  return sheet;
}

function rformContentApiV04EnsureEventLog_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(RFORM_CONTENT_API_V04.eventLogSheet);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(RFORM_CONTENT_API_V04.eventLogSheet);
    sheet.getRange(1, 1, 1, RFORM_CONTENT_API_V04.eventLogHeaders.length)
      .setValues([RFORM_CONTENT_API_V04.eventLogHeaders]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const headers = rformContentApiV04Headers_(sheet);
  const missing = RFORM_CONTENT_API_V04.eventLogHeaders.filter(function (name) {
    return headers.indexOf(name) === -1;
  });
  if (missing.length) throw new Error('EVENT_ACTION_LOG missing fields: ' + missing.join(', '));
  return sheet;
}

function rformContentApiV04AppendEventLog_(sheet, actionId, eventId, operation, decision, details, nonce, result) {
  sheet.appendRow([
    actionId, new Date(), eventId, operation, decision,
    JSON.stringify(details || {}), 'STREAMLIT_OWNER', nonce, result
  ]);
}

function rformContentApiV04ExistingLogResult_(sheet, actionId, idHeader) {
  const row = rformContentApiV04FindOptionalRow_(sheet, idHeader, actionId);
  if (!row) return null;
  const map = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(sheet));
  const result = String(sheet.getRange(row, map.Result).getDisplayValue());
  if (result === 'APPLIED' || result === 'APPLIED_RECOVERED') {
    return {ok: true, status: 'ALREADY_APPLIED', action_id: actionId};
  }
  throw new Error('Предыдущее выполнение этого действия завершилось неуспешно. Отправьте новое действие.');
}

function rformContentApiV04ExistingEventLogResult_(sheet, actionId) {
  const row = rformContentApiV04FindOptionalRow_(sheet, 'Action_ID', actionId);
  if (!row) return null;
  const map = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(sheet));
  const result = String(sheet.getRange(row, map.Result).getDisplayValue());
  if (result !== 'APPLIED') {
    throw new Error('Предыдущее выполнение этого действия завершилось неуспешно. Отправьте новое действие.');
  }
  let details = {};
  try {
    details = JSON.parse(String(sheet.getRange(row, map.Details).getDisplayValue()) || '{}');
  } catch (error) {
    details = {};
  }
  details.ok = true;
  details.status = 'ALREADY_APPLIED';
  details.action_id = actionId;
  return details;
}

function rformContentApiV04FindUniqueRow_(sheet, idHeader, idValue) {
  const headers = rformContentApiV04Headers_(sheet);
  const map = rformContentApiV04HeaderMap_(headers);
  const column = map[idHeader];
  if (!column) throw new Error(sheet.getName() + ' missing ' + idHeader + '.');
  if (sheet.getLastRow() < 2) throw new Error('Запись не найдена.');
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getDisplayValues();
  const matches = [];
  values.forEach(function (row, index) {
    if (String(row[0]).trim() === idValue) matches.push(index + 2);
  });
  if (matches.length === 0) throw new Error('Запись не найдена.');
  if (matches.length > 1) throw new Error('Обнаружен повторяющийся идентификатор; действие отклонено.');
  return matches[0];
}

function rformContentApiV04FindOptionalRow_(sheet, idHeader, idValue) {
  if (sheet.getLastRow() < 2) return 0;
  const map = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(sheet));
  const column = map[idHeader];
  if (!column) return 0;
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let index = 0; index < values.length; index++) {
    if (String(values[index][0]).trim() === idValue) return index + 2;
  }
  return 0;
}

function rformContentApiV04RequireOpenMaterial_(value) {
  const publication = String(value('Publication_Status')).toUpperCase();
  const pipeline = String(value('Pipeline_Status')).toUpperCase();
  const textStatus = String(value('Text_Status')).toUpperCase();
  const terminal = ['PUBLISHED', 'SUPERSEDED', 'CANCELLED'];
  if (terminal.indexOf(publication) !== -1 || terminal.indexOf(textStatus) !== -1 ||
      pipeline.indexOf('PUBLISHED') !== -1 || pipeline.indexOf('SUPERSEDED') !== -1 ||
      pipeline.indexOf('CANCELLED') !== -1) {
    throw new Error('Закрытые материалы нельзя изменять из приложения.');
  }
}

function rformContentApiV04RequireReady_(value) {
  const issues = [];
  const yes = ['YES', 'ДА', 'TRUE', '1'];
  if (yes.indexOf(String(value('Public_Data_Allowed')).toUpperCase()) === -1) {
    issues.push('публичные данные не разрешены');
  }
  if (String(value('Text_Status')).toUpperCase() !== 'APPROVED') issues.push('текст не утверждён');
  if (String(value('Approval_Status')).toUpperCase() !== 'APPROVED') issues.push('нет утверждения владельца');
  const mode = String(value('Distribution_Mode')).toUpperCase();
  if (['', 'TEXT_ONLY', 'TEXT', 'ТЕКСТ'].indexOf(mode) === -1 &&
      String(value('Visual_Status')).toUpperCase() !== 'APPROVED') {
    issues.push('визуал не утверждён');
  }
  if (!value('Telegram_Text')) issues.push('текст для Telegram отсутствует');
  if (value('Blocking_Issue')) issues.push('есть блокирующая проблема');
  if (value('Publish_Error')) issues.push('есть ошибка публикации');
  if (['YES', 'ДА', 'TRUE', '1', 'DUPLICATE'].indexOf(String(value('Duplicate_Flag')).toUpperCase()) !== -1) {
    issues.push('установлен признак дубликата');
  }
  if (issues.length) throw new Error('Материал не готов: ' + issues.join('; '));
}

function rformContentApiV04RequireActionId_(value) {
  if (!/^[a-f0-9]{32}$/.test(String(value || ''))) throw new Error('Некорректный идентификатор действия.');
}

function rformContentApiV04RequireRecordId_(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(String(value || ''))) {
    throw new Error((label || 'Идентификатор') + ' некорректен.');
  }
}

function rformContentApiV04HeaderMap_(headers) {
  const map = {};
  headers.forEach(function (header, index) { map[header] = index + 1; });
  return map;
}

function rformContentApiV04Sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return rformContentApiV04BytesToHex_(bytes);
}

function rformContentApiV04Sha256BytesHex_(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return rformContentApiV04BytesToHex_(digest);
}

function rformContentApiV04BytesToHex_(bytes) {
  return bytes.map(function (byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function rformContentApiV04SafeText_(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function rformContentApiV04ConstantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function rformContentApiV04ReadRows_(sheet, selectedFields, idField) {
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(function (value) { return String(value).trim(); });
  const indexes = {};
  headers.forEach(function (header, index) { indexes[header] = index; });
  const missing = selectedFields.filter(function (name) {
    return !Object.prototype.hasOwnProperty.call(indexes, name);
  });
  if (missing.length) throw new Error(sheet.getName() + ' missing fields: ' + missing.join(', '));
  return values.slice(1).filter(function (row) {
    return String(row[indexes[idField]] || '').trim() !== '';
  }).map(function (row) {
    const record = {};
    selectedFields.forEach(function (name) {
      record[name] = String(row[indexes[name]] || '').trim();
    });
    return record;
  });
}

function rformContentApiV04RequireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function rformContentApiV04Headers_(sheet) {
  if (sheet.getLastColumn() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
}

function rformContentApiV04Json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
