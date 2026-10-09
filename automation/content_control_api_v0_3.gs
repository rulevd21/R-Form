// R/Form Content Control API v0.3
// Standalone Apps Script web app. Reads content data and applies four allowlisted
// owner actions. It never calls Telegram and never sets SCHEDULED/PUBLISHING/PUBLISHED.

const RFORM_CONTENT_API = Object.freeze({
  version: '0.3.0',
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  queueSheet: 'CONTENT_QUEUE',
  eventsSheet: 'DATA_EVENTS',
  actionLogSheet: 'CONTENT_ACTION_LOG',
  secretProperty: 'RFORM_CONTENT_API_SECRET',
  requestWindowSeconds: 300,
  nonceTtlSeconds: 600,
  maxCommentChars: 500,
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
    'Created_At', 'Updated_At'
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
  ])
});

const RFORM_CONTENT_ACTIONS = Object.freeze({
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

/** One-time secret setup or rotation. The existing secret can be reused. */
function rformContentApiCreateSecret() {
  const secret = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()].join('');
  PropertiesService.getScriptProperties().setProperty(
    RFORM_CONTENT_API.secretProperty,
    secret
  );
  console.log('RFORM_CONTENT_API_SECRET=' + secret);
  return 'Secret created. Copy it directly into Streamlit Secrets.';
}

/** READ-ONLY: validates source sheets, schema and optional action log. */
function rformContentApiPreflight() {
  const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API.spreadsheetId);
  const queue = rformContentApiRequireSheet_(spreadsheet, RFORM_CONTENT_API.queueSheet);
  const events = rformContentApiRequireSheet_(spreadsheet, RFORM_CONTENT_API.eventsSheet);
  const queueHeaders = rformContentApiHeaders_(queue);
  const eventHeaders = rformContentApiHeaders_(events);
  const missingQueue = RFORM_CONTENT_API.queueFields.filter(function (name) {
    return queueHeaders.indexOf(name) === -1;
  });
  const missingEvents = RFORM_CONTENT_API.eventFields.filter(function (name) {
    return eventHeaders.indexOf(name) === -1;
  });
  const missingActionFields = RFORM_CONTENT_API.actionFields.filter(function (name) {
    return queueHeaders.indexOf(name) === -1;
  });
  const actionLog = spreadsheet.getSheetByName(RFORM_CONTENT_API.actionLogSheet);
  const actionLogHeaders = actionLog ? rformContentApiHeaders_(actionLog) : [];
  const missingLogFields = actionLog ? RFORM_CONTENT_API.actionLogHeaders.filter(function (name) {
    return actionLogHeaders.indexOf(name) === -1;
  }) : [];
  const report = {
    ok: missingQueue.length === 0 && missingEvents.length === 0 &&
      missingActionFields.length === 0 && missingLogFields.length === 0,
    mode: 'CONTROL_API_PREFLIGHT',
    version: RFORM_CONTENT_API.version,
    capabilities: ['content.read', 'content.action'],
    spreadsheet: spreadsheet.getName(),
    queueRows: Math.max(queue.getLastRow() - 1, 0),
    eventRows: Math.max(events.getLastRow() - 1, 0),
    missingQueueFields: missingQueue,
    missingEventFields: missingEvents,
    missingActionFields: missingActionFields,
    actionLogExists: !!actionLog,
    missingActionLogFields: missingLogFields,
    secretConfigured: !!PropertiesService.getScriptProperties().getProperty(
      RFORM_CONTENT_API.secretProperty
    ),
    telegramCallsPresent: false,
    scheduledStatusCanBeWritten: false
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/** GET never returns content data. */
function doGet() {
  return rformContentApiJson_({
    ok: false,
    code: 'METHOD_NOT_ALLOWED',
    message: 'Use a signed POST request.'
  });
}

/** Signed read or allowlisted owner action. */
function doPost(e) {
  try {
    const request = rformContentApiParseRequest_(e);
    rformContentApiAuthorize_(request);
    if (String(request.operation || 'read') === 'content_action') {
      return rformContentApiJson_(rformContentApiApplyAction_(request));
    }
    return rformContentApiJson_(rformContentApiPayload_());
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return rformContentApiJson_({
      ok: false,
      code: 'REQUEST_REJECTED',
      message: error && error.message ? error.message : 'Request rejected.'
    });
  }
}

function rformContentApiPayload_() {
  const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API.spreadsheetId);
  const queue = rformContentApiReadRows_(
    rformContentApiRequireSheet_(spreadsheet, RFORM_CONTENT_API.queueSheet),
    RFORM_CONTENT_API.queueFields,
    'Content_ID'
  );
  const events = rformContentApiReadRows_(
    rformContentApiRequireSheet_(spreadsheet, RFORM_CONTENT_API.eventsSheet),
    RFORM_CONTENT_API.eventFields,
    'Event_ID'
  );
  return {
    ok: true,
    version: RFORM_CONTENT_API.version,
    mode: 'CONTROLLED_WRITE',
    capabilities: ['content.read', 'content.action'],
    generated_at: new Date().toISOString(),
    queue_fields: RFORM_CONTENT_API.queueFields,
    event_fields: RFORM_CONTENT_API.eventFields,
    queue: queue,
    events: events,
    row_counts: {queue: queue.length, events: events.length}
  };
}

function rformContentApiParseRequest_(e) {
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

function rformContentApiAuthorize_(request) {
  const secret = PropertiesService.getScriptProperties().getProperty(
    RFORM_CONTENT_API.secretProperty
  );
  if (!secret) throw new Error('Секрет API не настроен.');

  const timestamp = Number(request.timestamp);
  const nonce = String(request.nonce || '');
  const signature = String(request.signature || '');
  const operation = String(request.operation || 'read');
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp)) throw new Error('Некорректное время запроса.');
  if (Math.abs(now - timestamp) > RFORM_CONTENT_API.requestWindowSeconds) {
    throw new Error('Срок действия запроса истёк.');
  }
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Некорректный nonce.');
  if (operation !== 'read' && operation !== 'content_action') {
    throw new Error('Операция не поддерживается.');
  }
  if (!signature) throw new Error('Подпись запроса отсутствует.');

  const message = rformContentApiSignedMessage_(request);
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(message, secret)
  ).replace(/=+$/, '');
  if (!rformContentApiConstantTimeEqual_(signature, expected)) {
    throw new Error('Подпись запроса недействительна.');
  }

  const cache = CacheService.getScriptCache();
  const nonceKey = 'rform_content_nonce_' + nonce;
  if (cache.get(nonceKey)) throw new Error('Повтор запроса отклонён.');
  cache.put(nonceKey, '1', RFORM_CONTENT_API.nonceTtlSeconds);
}

function rformContentApiSignedMessage_(request) {
  const timestamp = String(request.timestamp);
  const nonce = String(request.nonce || '');
  const operation = String(request.operation || 'read');
  if (operation === 'read') return timestamp + '.' + nonce;

  const comment = String(request.comment || '');
  const commentHash = rformContentApiSha256Hex_(comment);
  return [
    timestamp,
    nonce,
    operation,
    String(request.action_id || ''),
    String(request.content_id || ''),
    String(request.action || ''),
    commentHash
  ].join('\n');
}

function rformContentApiApplyAction_(request) {
  const actionId = String(request.action_id || '').trim();
  const contentId = String(request.content_id || '').trim();
  const action = String(request.action || '').trim().toUpperCase();
  const comment = String(request.comment || '').trim();
  const nonce = String(request.nonce || '');

  if (!/^[a-f0-9]{32}$/.test(actionId)) throw new Error('Некорректный идентификатор действия.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(contentId)) {
    throw new Error('Некорректный код материала.');
  }
  if (!Object.prototype.hasOwnProperty.call(RFORM_CONTENT_ACTIONS, action)) {
    throw new Error('Действие не входит в белый список.');
  }
  if (comment.length > RFORM_CONTENT_API.maxCommentChars) {
    throw new Error('Комментарий слишком длинный.');
  }
  if ((action === 'RETURN_FOR_REVISION' || action === 'HOLD') && !comment) {
    throw new Error('Для этого действия требуется комментарий.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Очередь занята. Повторите попытку.');
  try {
    const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API.spreadsheetId);
    const queue = rformContentApiRequireSheet_(spreadsheet, RFORM_CONTENT_API.queueSheet);
    const headers = rformContentApiHeaders_(queue);
    const missing = RFORM_CONTENT_API.actionFields.filter(function (name) {
      return headers.indexOf(name) === -1;
    });
    if (missing.length) throw new Error('CONTENT_QUEUE missing action fields: ' + missing.join(', '));

    const logSheet = rformContentApiEnsureActionLog_(spreadsheet);
    const existingLogRow = rformContentApiFindRow_(logSheet, 'Action_ID', actionId);
    if (existingLogRow) {
      const resultColumn = rformContentApiHeaderMap_(rformContentApiHeaders_(logSheet)).Result;
      const priorResult = String(logSheet.getRange(existingLogRow, resultColumn).getDisplayValue());
      if (priorResult === 'APPLIED' || priorResult === 'APPLIED_RECOVERED') {
        return {
          ok: true,
          status: 'ALREADY_APPLIED',
          action_id: actionId,
          content_id: contentId,
          action: action,
          message: 'Action was already applied.'
        };
      }
      throw new Error('Предыдущее выполнение этого действия завершилось неуспешно. Отправьте новое действие.');
    }

    const queueRow = rformContentApiFindUniqueContentRow_(queue, contentId);
    const columnMap = rformContentApiHeaderMap_(headers);
    const rowValues = queue.getRange(queueRow, 1, 1, queue.getLastColumn()).getDisplayValues()[0];
    const value = function (name) {
      return String(rowValues[columnMap[name] - 1] || '').trim();
    };

    rformContentApiRequireOpenMaterial_(value);
    if (action === 'READY_TO_PUBLISH') rformContentApiRequireReady_(value);

    const updates = RFORM_CONTENT_ACTIONS[action];
    const previous = {};
    const next = {};
    Object.keys(updates).forEach(function (name) {
      if (!columnMap[name]) throw new Error('Missing update field: ' + name);
      previous[name] = value(name);
      next[name] = updates[name];
    });

    logSheet.appendRow([
      actionId,
      new Date(),
      contentId,
      action,
      rformContentApiSafeText_(comment),
      Object.keys(updates).join(','),
      JSON.stringify(previous),
      JSON.stringify(next),
      'STREAMLIT_OWNER',
      nonce,
      'PENDING'
    ]);
    const logRow = logSheet.getLastRow();
    const logMap = rformContentApiHeaderMap_(rformContentApiHeaders_(logSheet));

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
      ok: true,
      status: 'APPLIED',
      action_id: actionId,
      content_id: contentId,
      action: action,
      changed_fields: Object.keys(updates),
      message: 'Action applied and logged.'
    };
  } finally {
    lock.releaseLock();
  }
}

function rformContentApiRequireOpenMaterial_(value) {
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

function rformContentApiRequireReady_(value) {
  const issues = [];
  const yes = ['YES', 'ДА', 'TRUE', '1'];
  if (yes.indexOf(String(value('Public_Data_Allowed')).toUpperCase()) === -1) {
    issues.push('публичные данные не разрешены');
  }
  if (String(value('Text_Status')).toUpperCase() !== 'APPROVED') {
    issues.push('текст не утверждён');
  }
  if (String(value('Approval_Status')).toUpperCase() !== 'APPROVED') {
    issues.push('нет утверждения владельца');
  }
  const mode = String(value('Distribution_Mode')).toUpperCase();
  if (['', 'TEXT_ONLY', 'TEXT', 'ТЕКСТ'].indexOf(mode) === -1 &&
      String(value('Visual_Status')).toUpperCase() !== 'APPROVED') {
    issues.push('визуал не утверждён');
  }
  if (!value('Telegram_Text')) issues.push('текст для Telegram отсутствует');
  if (value('Blocking_Issue')) issues.push('есть блокирующая проблема');
  if (value('Publish_Error')) issues.push('есть ошибка публикации');
  if (['YES', 'ДА', 'TRUE', '1', 'DUPLICATE'].indexOf(
      String(value('Duplicate_Flag')).toUpperCase()) !== -1) {
    issues.push('установлен признак дубликата');
  }
  if (issues.length) throw new Error('Материал не готов: ' + issues.join('; '));
}

function rformContentApiEnsureActionLog_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(RFORM_CONTENT_API.actionLogSheet);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(RFORM_CONTENT_API.actionLogSheet);
    sheet.getRange(1, 1, 1, RFORM_CONTENT_API.actionLogHeaders.length)
      .setValues([RFORM_CONTENT_API.actionLogHeaders]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const headers = rformContentApiHeaders_(sheet);
  const missing = RFORM_CONTENT_API.actionLogHeaders.filter(function (name) {
    return headers.indexOf(name) === -1;
  });
  if (missing.length) throw new Error('CONTENT_ACTION_LOG missing fields: ' + missing.join(', '));
  return sheet;
}

function rformContentApiFindUniqueContentRow_(sheet, contentId) {
  const headers = rformContentApiHeaders_(sheet);
  const map = rformContentApiHeaderMap_(headers);
  const column = map.Content_ID;
  if (!column) throw new Error('CONTENT_QUEUE missing Content_ID.');
  if (sheet.getLastRow() < 2) throw new Error('Код материала не найден.');
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1)
    .getDisplayValues();
  const matches = [];
  values.forEach(function (row, index) {
    if (String(row[0]).trim() === contentId) matches.push(index + 2);
  });
  if (matches.length === 0) throw new Error('Код материала не найден.');
  if (matches.length > 1) throw new Error('Обнаружен повторяющийся код материала; действие отклонено.');
  return matches[0];
}

function rformContentApiFindRow_(sheet, idHeader, idValue) {
  if (sheet.getLastRow() < 2) return 0;
  const map = rformContentApiHeaderMap_(rformContentApiHeaders_(sheet));
  const column = map[idHeader];
  if (!column) throw new Error('Missing log identifier field: ' + idHeader);
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let index = 0; index < values.length; index++) {
    if (String(values[index][0]).trim() === idValue) return index + 2;
  }
  return 0;
}

function rformContentApiHeaderMap_(headers) {
  const map = {};
  headers.forEach(function (header, index) { map[header] = index + 1; });
  return map;
}

function rformContentApiSha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function rformContentApiSafeText_(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function rformContentApiConstantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function rformContentApiReadRows_(sheet, selectedFields, idField) {
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(function (value) { return String(value).trim(); });
  const indexes = {};
  headers.forEach(function (header, index) { indexes[header] = index; });
  const missing = selectedFields.filter(function (name) {
    return !Object.prototype.hasOwnProperty.call(indexes, name);
  });
  if (missing.length) {
    throw new Error(sheet.getName() + ' missing fields: ' + missing.join(', '));
  }

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

function rformContentApiRequireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function rformContentApiHeaders_(sheet) {
  if (sheet.getLastColumn() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
}

function rformContentApiJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
