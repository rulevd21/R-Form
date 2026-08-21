// R/Form Content Read API v0.1
// Standalone Apps Script web app. Reads CONTENT_QUEUE and DATA_EVENTS only.

const RFORM_CONTENT_API = Object.freeze({
  version: '0.1.0',
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  queueSheet: 'CONTENT_QUEUE',
  eventsSheet: 'DATA_EVENTS',
  secretProperty: 'RFORM_CONTENT_API_SECRET',
  requestWindowSeconds: 300,
  nonceTtlSeconds: 600,
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
  ])
});

/**
 * One-time setup or rotation. Run manually, then copy the printed secret
 * directly into Streamlit Secrets. Never paste it into GitHub or chat.
 */
function rformContentApiCreateSecret() {
  const secret = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()].join('');
  PropertiesService.getScriptProperties().setProperty(
    RFORM_CONTENT_API.secretProperty,
    secret
  );
  console.log('RFORM_CONTENT_API_SECRET=' + secret);
  return 'Secret created. Copy it from the execution log directly into Streamlit Secrets.';
}

/** READ-ONLY: validates the data source and schema; does not expose the secret. */
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
  const report = {
    ok: missingQueue.length === 0 && missingEvents.length === 0,
    mode: 'READ_ONLY_PREFLIGHT',
    version: RFORM_CONTENT_API.version,
    spreadsheet: spreadsheet.getName(),
    queueRows: Math.max(queue.getLastRow() - 1, 0),
    eventRows: Math.max(events.getLastRow() - 1, 0),
    missingQueueFields: missingQueue,
    missingEventFields: missingEvents,
    secretConfigured: !!PropertiesService.getScriptProperties().getProperty(
      RFORM_CONTENT_API.secretProperty
    )
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/** GET never returns data. */
function doGet() {
  return rformContentApiJson_({
    ok: false,
    code: 'METHOD_NOT_ALLOWED',
    message: 'Use a signed POST request.'
  });
}

/** Signed, replay-limited, read-only endpoint used by Streamlit. */
function doPost(e) {
  try {
    const request = rformContentApiParseRequest_(e);
    rformContentApiAuthorize_(request);
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
    mode: 'READ_ONLY',
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
  if (!body) throw new Error('Empty request body.');
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error('Invalid JSON request.');
  }
  return parsed || {};
}

function rformContentApiAuthorize_(request) {
  const secret = PropertiesService.getScriptProperties().getProperty(
    RFORM_CONTENT_API.secretProperty
  );
  if (!secret) throw new Error('API secret is not configured.');

  const timestamp = Number(request.timestamp);
  const nonce = String(request.nonce || '');
  const signature = String(request.signature || '');
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid timestamp.');
  if (Math.abs(now - timestamp) > RFORM_CONTENT_API.requestWindowSeconds) {
    throw new Error('Expired request.');
  }
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid nonce.');
  if (!signature) throw new Error('Missing signature.');

  const message = String(timestamp) + '.' + nonce;
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(message, secret)
  ).replace(/=+$/, '');
  if (!rformContentApiConstantTimeEqual_(signature, expected)) {
    throw new Error('Invalid signature.');
  }

  const cache = CacheService.getScriptCache();
  const nonceKey = 'rform_content_nonce_' + nonce;
  if (cache.get(nonceKey)) throw new Error('Request replay rejected.');
  cache.put(nonceKey, '1', RFORM_CONTENT_API.nonceTtlSeconds);
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
