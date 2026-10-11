// R/Form Telegram Content Metrics v1
// Read-only Telegram public-web collector -> canonical CONTENT_REGISTRY.
// No Telegram authentication, no publisher calls, no metric estimation.

const RFORM_TELEGRAM_METRICS_V1 = Object.freeze({
  version: '1.0.0',
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  queueSheet: 'CONTENT_QUEUE',
  registrySheet: 'CONTENT_REGISTRY',
  channel: 'r_form',
  source: 'TELEGRAM_PUBLIC_WEB_PREVIEW',
  checkpointWindows: Object.freeze({
    '24H': Object.freeze({min: 24, max: 36}),
    '72H': Object.freeze({min: 72, max: 96}),
    '7D': Object.freeze({min: 168, max: 192})
  })
});

function rformTelegramMetricsParseCountV1(value) {
  const raw = String(value == null ? '' : value).trim().replace(/\s+/g, '').replace(',', '.');
  if (!raw) return null;
  const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)([KMB])?$/i);
  if (!match) return null;
  const factor = {K: 1e3, M: 1e6, B: 1e9}[String(match[2] || '').toUpperCase()] || 1;
  return Math.round(Number(match[1]) * factor);
}

function rformTelegramMetricsStripTagsV1(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function rformTelegramMetricsExtractClassTextV1(html, className) {
  const safe = String(className).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('<[^>]+class=["\\'][^"\\']*\\b' + safe + '\\b[^"\\']*["\\'][^>]*>([\\s\\S]*?)<\\/[^>]+>', 'gi');
  const out = [];
  let match;
  while ((match = regex.exec(String(html || '')))) out.push(rformTelegramMetricsStripTagsV1(match[1]));
  return out;
}

function rformTelegramMetricsPostBlockV1(html, channel, messageId) {
  const source = String(html || '');
  const key = String(channel || '').replace(/^@/, '') + '/' + String(messageId || '');
  const patterns = [
    'data-post="' + key + '"',
    "data-post='" + key + "'"
  ];
  let start = -1;
  patterns.some(function (pattern) {
    start = source.indexOf(pattern);
    return start >= 0;
  });
  if (start < 0) throw new Error('POST_NOT_FOUND:' + key);
  const next = source.slice(start + 1).search(/data-post=["'][^"']+\/[0-9]+["']/i);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

function rformTelegramMetricsParsePostHtmlV1(html, channel, messageId) {
  const block = rformTelegramMetricsPostBlockV1(html, channel, messageId);
  const viewsText = rformTelegramMetricsExtractClassTextV1(block, 'tgme_widget_message_views')[0] || '';
  const reactionTexts = rformTelegramMetricsExtractClassTextV1(block, 'tgme_widget_message_reaction_count');
  const replyTexts = rformTelegramMetricsExtractClassTextV1(block, 'tgme_widget_message_replies');
  const views = rformTelegramMetricsParseCountV1(viewsText);
  const reactions = reactionTexts.reduce(function (sum, value) {
    const parsed = rformTelegramMetricsParseCountV1(value);
    return sum + (parsed == null ? 0 : parsed);
  }, 0);
  let comments = null;
  if (replyTexts.length) {
    const parsedReply = rformTelegramMetricsParseCountV1(replyTexts[0].replace(/[^0-9.,KMB]/gi, ''));
    if (parsedReply != null) comments = parsedReply;
  }
  if (views == null) throw new Error('VIEWS_NOT_OBSERVED:' + channel + '/' + messageId);
  return {
    views: views,
    reactions: reactionTexts.length ? reactions : null,
    comments: comments,
    shares: null,
    source: RFORM_TELEGRAM_METRICS_V1.source
  };
}

function rformTelegramMetricsCheckpointV1(ageHours, existing) {
  const age = Number(ageHours);
  if (!Number.isFinite(age) || age < 0) return '';
  const current = existing || {};
  const ordered = [
    ['24H', 'views_24h'],
    ['72H', 'views_72h'],
    ['7D', 'views_7d']
  ];
  for (let i = 0; i < ordered.length; i++) {
    const name = ordered[i][0];
    const field = ordered[i][1];
    const window = RFORM_TELEGRAM_METRICS_V1.checkpointWindows[name];
    if (age >= window.min && age < window.max && (current[field] === '' || current[field] == null)) return name;
  }
  return '';
}

function rformTelegramMetricsCheckpointPatchV1(checkpoint, observed) {
  const map = {
    '24H': ['Views_24H', 'Reactions_24H', 'Comments_24H', 'Shares_24H'],
    '72H': ['Views_72H', 'Reactions_72H', 'Comments_72H', 'Shares_72H'],
    '7D': ['Views_7D', 'Reactions_7D', 'Comments_7D', 'Shares_7D']
  };
  const fields = map[checkpoint];
  if (!fields) throw new Error('UNKNOWN_CHECKPOINT:' + checkpoint);
  const patch = {};
  const values = [observed.views, observed.reactions, observed.comments, observed.shares];
  fields.forEach(function (field, index) {
    if (values[index] != null) patch[field] = values[index];
  });
  patch.Metrics_Source = observed.source || RFORM_TELEGRAM_METRICS_V1.source;
  return patch;
}

function rformTelegramMetricsHeaderMapV1_(headers) {
  const map = {};
  headers.forEach(function (header, index) { map[String(header || '').trim()] = index + 1; });
  return map;
}

function rformTelegramMetricsHeadersV1_(sheet) {
  if (!sheet || sheet.getLastColumn() < 1) throw new Error('EMPTY_SHEET');
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
}

function rformTelegramMetricsRowsV1_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const headers = rformTelegramMetricsHeadersV1_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
  return values.map(function (row, index) {
    const out = {_row: index + 2};
    headers.forEach(function (header, column) { out[header] = String(row[column] || '').trim(); });
    return out;
  });
}

function rformTelegramMetricsRequireFieldsV1_(map, names, label) {
  const missing = names.filter(function (name) { return !map[name]; });
  if (missing.length) throw new Error(label + '_MISSING_FIELDS:' + missing.join(','));
}

function rformTelegramMetricsParsePostedAtV1_(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null; // Date-only historical reconciliation cannot support a checkpoint.
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
}

function rformTelegramMetricsMessageIdV1_(row) {
  const explicit = String(row.Telegram_Message_ID || '').trim();
  if (/^\d+$/.test(explicit)) return explicit;
  const url = String(row.Telegram_Post_URL || '').trim();
  const match = url.match(/\/([0-9]+)(?:\?.*)?$/);
  return match ? match[1] : '';
}

function rformTelegramMetricsFetchV1_(channel, messageId) {
  const url = 'https://t.me/s/' + encodeURIComponent(channel) + '/' + encodeURIComponent(messageId);
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {'Accept-Language': 'en-US,en;q=0.9'}
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('TELEGRAM_HTTP_' + code + ':' + channel + '/' + messageId);
  return rformTelegramMetricsParsePostHtmlV1(response.getContentText(), channel, messageId);
}

function rformTelegramMetricsRegistrySeedV1_(queueRow) {
  return {
    Content_ID: queueRow.Content_ID,
    Publication_Date: String(queueRow.Posted_At || queueRow.Date || '').slice(0, 10),
    Platform: 'Telegram',
    Rubric: queueRow.Rubric,
    Post_Link: queueRow.Telegram_Post_URL,
    Status: 'PUBLISHED',
    Audience_Segment: queueRow.Target_Segment,
    Audience_Problem: queueRow.Audience_Problem,
    Content_Function: queueRow.Content_Function,
    Content_Type: queueRow.Content_Type,
    Funnel_Stage: queueRow.Funnel_Stage,
    CTA_Type: queueRow.CTA_Type,
    Editorial_Trigger: queueRow.Editorial_Trigger,
    Reader_Value: queueRow.Reader_Value,
    Hypothesis_ID: queueRow.Hypothesis_ID,
    Distribution_Mode: queueRow.Distribution_Mode,
    Editorial_Direction: queueRow.Editorial_Direction
  };
}

function rformTelegramMetricsEnsureRegistryRowV1_(registry, registryHeaders, registryMap, rows, queueRow) {
  const existing = rows.find(function (row) { return row.Content_ID === queueRow.Content_ID; });
  if (existing) return existing;
  const seed = rformTelegramMetricsRegistrySeedV1_(queueRow);
  const record = registryHeaders.map(function (header) { return seed[header] == null ? '' : seed[header]; });
  registry.appendRow(record);
  const rowNumber = registry.getLastRow();
  const created = {_row: rowNumber};
  registryHeaders.forEach(function (header, index) { created[header] = String(record[index] == null ? '' : record[index]).trim(); });
  rows.push(created);
  return created;
}

function rformTelegramMetricsApplyPatchV1_(sheet, map, rowNumber, patch) {
  Object.keys(patch).forEach(function (field) {
    if (!map[field]) throw new Error('REGISTRY_FIELD_MISSING:' + field);
    sheet.getRange(rowNumber, map[field]).setValue(patch[field]);
  });
}

function rformTelegramMetricsCollectV1(nowOverride) {
  const now = nowOverride instanceof Date ? nowOverride : new Date();
  const ss = SpreadsheetApp.openById(RFORM_TELEGRAM_METRICS_V1.spreadsheetId);
  const queue = ss.getSheetByName(RFORM_TELEGRAM_METRICS_V1.queueSheet);
  const registry = ss.getSheetByName(RFORM_TELEGRAM_METRICS_V1.registrySheet);
  if (!queue || !registry) throw new Error('CANONICAL_SHEET_MISSING');

  const queueHeaders = rformTelegramMetricsHeadersV1_(queue);
  const registryHeaders = rformTelegramMetricsHeadersV1_(registry);
  const queueMap = rformTelegramMetricsHeaderMapV1_(queueHeaders);
  const registryMap = rformTelegramMetricsHeaderMapV1_(registryHeaders);
  rformTelegramMetricsRequireFieldsV1_(queueMap,
    ['Content_ID','Publication_Status','Telegram_Message_ID','Telegram_Post_URL','Posted_At','Hypothesis_ID'], 'QUEUE');
  rformTelegramMetricsRequireFieldsV1_(registryMap,
    ['Content_ID','Views_24H','Reactions_24H','Comments_24H','Shares_24H','Views_72H','Reactions_72H','Comments_72H','Shares_72H','Views_7D','Reactions_7D','Comments_7D','Shares_7D','Metrics_Source','Metrics_Observed_At'], 'REGISTRY');

  const queueRows = rformTelegramMetricsRowsV1_(queue);
  const registryRows = rformTelegramMetricsRowsV1_(registry);
  const result = {version: RFORM_TELEGRAM_METRICS_V1.version, scanned: 0, written: 0, seeded: 0, skipped: [], updates: []};

  queueRows.filter(function (row) {
    return row.Publication_Status === 'PUBLISHED' && !!row.Telegram_Post_URL && !!rformTelegramMetricsMessageIdV1_(row);
  }).forEach(function (queueRow) {
    result.scanned++;
    const postedAt = rformTelegramMetricsParsePostedAtV1_(queueRow.Posted_At);
    if (!postedAt) {
      result.skipped.push({content_id: queueRow.Content_ID, reason: 'CHECKPOINT_TIME_UNKNOWN'});
      return;
    }
    const existingBefore = registryRows.find(function (row) { return row.Content_ID === queueRow.Content_ID; });
    const registryRow = rformTelegramMetricsEnsureRegistryRowV1_(registry, registryHeaders, registryMap, registryRows, queueRow);
    if (!existingBefore) result.seeded++;
    const checkpoint = rformTelegramMetricsCheckpointV1((now.getTime() - postedAt.getTime()) / 3600000, {
      views_24h: registryRow.Views_24H,
      views_72h: registryRow.Views_72H,
      views_7d: registryRow.Views_7D
    });
    if (!checkpoint) {
      result.skipped.push({content_id: queueRow.Content_ID, reason: 'NO_OPEN_CHECKPOINT'});
      return;
    }
    const messageId = rformTelegramMetricsMessageIdV1_(queueRow);
    const observed = rformTelegramMetricsFetchV1_(RFORM_TELEGRAM_METRICS_V1.channel, messageId);
    const patch = rformTelegramMetricsCheckpointPatchV1(checkpoint, observed);
    patch.Metrics_Observed_At = Utilities.formatDate(now, 'Europe/Moscow', 'dd.MM.yyyy HH:mm:ss');
    rformTelegramMetricsApplyPatchV1_(registry, registryMap, registryRow._row, patch);
    result.written++;
    result.updates.push({content_id: queueRow.Content_ID, checkpoint: checkpoint, message_id: messageId, observed: observed});
  });

  console.log('RFORM_TELEGRAM_METRICS_V1 ' + JSON.stringify({
    version: result.version,
    scanned: result.scanned,
    written: result.written,
    seeded: result.seeded,
    skipped: result.skipped.length
  }));
  return result;
}

function rformTelegramMetricsInstallTriggerV1() {
  const handler = 'rformTelegramMetricsCollectV1';
  const existing = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === handler;
  });
  if (existing.length > 1) throw new Error('DUPLICATE_METRICS_TRIGGERS:' + existing.length);
  if (existing.length === 1) return {ok: true, status: 'ALREADY_INSTALLED', trigger_count: 1};
  ScriptApp.newTrigger(handler).timeBased().everyHours(6).create();
  return {ok: true, status: 'INSTALLED', trigger_count: 1};
}
