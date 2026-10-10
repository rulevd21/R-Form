// R/Form Content Control API v0.7.0
// Standalone Apps Script web app for Channel Control.
// Reads CONTENT_QUEUE + DATA_EVENTS, applies allowlisted content actions,
// saves owner-facing event edits, stores private photo/video assets in Drive,
// and can promote an approved event to a PLANNED CONTENT_QUEUE row.
// It never calls Telegram. One explicit owner approval may set SCHEDULED;
// the separate Telegram Autopost project remains the only publishing transport.

const RFORM_CONTENT_API_V04 = Object.freeze({
  version: '0.7.0',
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  queueSheet: 'CONTENT_QUEUE',
  eventsSheet: 'DATA_EVENTS',
  trainingSessionsSheet: 'TRAINING_SESSIONS',
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
  maxPublicationVisualBytes: 5 * 1024 * 1024,
  maxQueuePreviewAssets: 10,
  maxQueuePreviewBytes: 15 * 1024 * 1024,
  maxTelegramChars: 4096,
  allowedMediaTypes: Object.freeze([
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime'
  ]),
  queueFields: Object.freeze([
    'Content_ID', 'Session_ID', 'Date', 'Rubric', 'Main_Training_Fact',
    'Main_Deviation', 'Public_Data_Allowed', 'Text_Status',
    'Visual_Status', 'Approval_Status', 'Publication_Status', 'Pipeline_Status',
    'Updated_At', 'Publish_At', 'Distribution_Mode', 'Telegram_Text', 'Blocking_Issue',
    'Preview_Review_Status', 'Content_Type', 'Target_Segment', 'Decision',
    'Editorial_Direction', 'Work_Packet_URL', 'Folder_URL', 'Text_URL',
    'Visual_URL', 'Proof_Source', 'Duplicate_Flag', 'Publish_Error', 'Current_Stage',
    'Audience_Problem', 'Telegram_Post_Mode', 'Telegram_Visual_URL', 'Telegram_Message_ID',
    'Telegram_Post_URL', 'Posted_At',
    'Source_Packet_Status', 'AutoPost_Allowed', 'Preview_Review_Hash', 'Preview_Reviewed_At', 'Preview_Reviewed_By'
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
  trainingSessionFields: Object.freeze([
    'Session_ID', 'Date', 'Session_Type', 'Actual_Duration', 'Readiness',
    'Pain_After', 'Session_Goal', 'Main_Result', 'Plan_Status',
    'Technique_Status', 'Session_Conclusion', 'Session_Decision', 'Session_Status'
  ]),
  proposalFields: Object.freeze([
    'Content_ID', 'Session_ID', 'Date', 'Rubric', 'Main_Training_Fact',
    'Main_Deviation', 'Decision', 'Public_Data_Allowed', 'Source_Packet_Status',
    'Text_Status', 'Visual_Status', 'Approval_Status', 'Publication_Status',
    'Created_At', 'Updated_At', 'Duplicate_Flag', 'Task_ID', 'Pipeline_Status',
    'Current_Stage', 'Current_Chat', 'Next_Chat', 'Blocking_Issue',
    'Content_Function', 'Content_Type', 'Funnel_Stage', 'Reader_Value',
    'Proof_Source', 'CTA_Type', 'Distribution_Mode', 'Editorial_Direction',
    'Folder_URL', 'Visual_URL', 'Telegram_Visual_URL',
    'Publish_At', 'AutoPost_Allowed', 'Telegram_Chat_ID', 'Telegram_Post_Mode',
    'Telegram_Text', 'Telegram_Message_ID', 'Telegram_Post_URL', 'Posted_At',
    'Publish_Error', 'Preview_Review_Hash', 'Preview_Reviewed_At',
    'Preview_Reviewed_By', 'Preview_Review_Status'
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
  const sessions = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.trainingSessionsSheet);
  const queueHeaders = rformContentApiV04Headers_(queue);
  const eventHeaders = rformContentApiV04Headers_(events);
  const sessionHeaders = rformContentApiV04Headers_(sessions);
  const missingQueue = RFORM_CONTENT_API_V04.queueFields.filter(function (name) {
    return queueHeaders.indexOf(name) === -1;
  });
  const missingEvents = RFORM_CONTENT_API_V04.eventFields.filter(function (name) {
    return eventHeaders.indexOf(name) === -1;
  });
  const missingActionFields = RFORM_CONTENT_API_V04.actionFields.filter(function (name) {
    return queueHeaders.indexOf(name) === -1;
  });
  const missingTrainingFields = RFORM_CONTENT_API_V04.trainingSessionFields.filter(function (name) {
    return sessionHeaders.indexOf(name) === -1;
  });
  const missingProposalFields = RFORM_CONTENT_API_V04.proposalFields.filter(function (name) {
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
      missingActionFields.length === 0 && missingTrainingFields.length === 0 &&
      missingProposalFields.length === 0 && assetsRootAccessible,
    mode: 'CONTROL_API_PREFLIGHT',
    version: RFORM_CONTENT_API_V04.version,
    capabilities: [
      'content.read', 'content.action_status', 'content.read_owner', 'content.action', 'event.review', 'event.decision', 'event.media',
      'training.read', 'publication.propose', 'publication.visual',
      'publication.approve_schedule', 'publication.queue_approve_schedule',
      'publication.queue_assets', 'publication.owner_workspace', 'publication.channel_reconcile', 'publication.owner_preview_prepare'
    ],
    spreadsheet: spreadsheet.getName(),
    queueRows: Math.max(queue.getLastRow() - 1, 0),
    eventRows: Math.max(events.getLastRow() - 1, 0),
    trainingSessionRows: Math.max(sessions.getLastRow() - 1, 0),
    missingQueueFields: missingQueue,
    missingEventFields: missingEvents,
    missingActionFields: missingActionFields,
    missingTrainingFields: missingTrainingFields,
    missingProposalFields: missingProposalFields,
    assetsRootAccessible: assetsRootAccessible,
    secretConfigured: !!PropertiesService.getScriptProperties().getProperty(
      RFORM_CONTENT_API_V04.secretProperty
    ),
    telegramCallsPresent: false,
    scheduledStatusCanBeWritten: true,
    scheduledRequiresExplicitOwnerApproval: true
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
    if (operation === 'action_status') return rformContentApiV04Json_(rformContentApiV04ActionStatus_(request));
    if (operation === 'read_owner') return rformContentApiV04Json_(rformContentApiV04Payload_(true));
    if (operation === 'owner_workspace') return rformContentApiV04Json_(rformContentApiV04Workspace_(request));
    if (operation === 'queue_owner_preview_prepare') {
      return rformContentApiV04Json_(rformContentApiV04PrepareOwnerPreview_(request));
    }
    if (operation === 'queue_text_draft_save') {
      return rformContentApiV04Json_(rformContentApiV04SaveQueueTextDraft_(request));
    }
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
    if (operation === 'publication_approval') {
      return rformContentApiV04Json_(rformContentApiV04ApplyPublicationApproval_(request));
    }
    if (operation === 'queue_publication_approval') {
      return rformContentApiV04Json_(rformContentApiV04ApplyQueuePublicationApproval_(request));
    }
    if (operation === 'queue_publication_assets') {
      return rformContentApiV04Json_(rformContentApiV04QueuePublicationAssets_(request));
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

function rformContentApiV04Payload_(ownerOnly) {
  const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
  const queue = rformContentApiV04ReadRows_(
    rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.queueSheet),
    RFORM_CONTENT_API_V04.queueFields,
    'Content_ID'
  );
  const events = ownerOnly ? [] : rformContentApiV04ReadRows_(
    rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.eventsSheet),
    RFORM_CONTENT_API_V04.eventFields,
    'Event_ID'
  );
  const trainingSessions = ownerOnly ? [] : rformContentApiV04ReadRows_(
    rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.trainingSessionsSheet),
    RFORM_CONTENT_API_V04.trainingSessionFields,
    'Session_ID'
  );
  const workspaceContext=rformContentApiV04WorkspaceContext_(spreadsheet);
  const channelPosts=rformContentApiV04ChannelPosts_(workspaceContext);
  return {
    ok: true,
    version: RFORM_CONTENT_API_V04.version,
    mode: 'CONTROLLED_WRITE',
    capabilities: [
      'content.read', 'content.action_status', 'content.read_owner', 'content.action', 'event.review', 'event.decision', 'event.media',
      'training.read', 'publication.propose', 'publication.visual',
      'publication.approve_schedule', 'publication.queue_approve_schedule',
      'publication.queue_assets', 'publication.owner_workspace', 'publication.channel_reconcile', 'publication.owner_preview_prepare', 'publication.queue_text_draft_save'
    ],
    generated_at: new Date().toISOString(),
    queue_fields: RFORM_CONTENT_API_V04.queueFields,
    event_fields: RFORM_CONTENT_API_V04.eventFields,
    training_session_fields: RFORM_CONTENT_API_V04.trainingSessionFields,
    queue: queue,
    events: events,
    training_sessions: trainingSessions,
    workspace_meta: rformContentApiV04WorkspaceMeta_(workspaceContext),
    channel_review: rformContentApiV04ChannelReview_(workspaceContext),
    channel_posts: Object.keys(channelPosts).map(function(id){return channelPosts[id];}),
    row_counts: {queue: queue.length, events: events.length, training_sessions: trainingSessions.length}
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
    'read', 'read_owner', 'action_status', 'content_action', 'event_review', 'event_decision', 'event_media',
    'publication_approval', 'queue_publication_approval', 'queue_publication_assets',
    'queue_owner_preview_prepare', 'queue_text_draft_save', 'owner_workspace'
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
  if (operation === 'read_owner') return [timestamp, nonce, operation].join('\n');
  if (operation === 'action_status') return [timestamp, nonce, operation, String(request.action_id || ''), String(request.content_id || '')].join('\n');
  if (operation === 'owner_workspace') return [timestamp, nonce, operation, String(request.action_id || ''), String(request.content_id || ''), String(request.source_hash || ''), rformContentApiV04Sha256Hex_(JSON.stringify(request.payload || {}))].join('\n');
  if (operation === 'queue_owner_preview_prepare') {
    return [timestamp, nonce, operation, String(request.action_id || ''),
      String(request.content_id || ''), String(request.source_hash || '')].join('\n');
  }
  if (operation === 'queue_text_draft_save') {
    return [timestamp, nonce, operation, String(request.action_id || ''),
      String(request.content_id || ''), String(request.source_hash || ''),
      rformContentApiV04Sha256Hex_(String(request.telegram_text || '').trim())].join('\n');
  }

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
  if (operation === 'publication_approval') {
    const lines = [
      timestamp,
      nonce,
      operation,
      String(request.action_id || ''),
      String(request.proposal_id || ''),
      String(request.session_id || ''),
      String(request.source_hash || '').trim().toLowerCase(),
      String(request.mode || '').trim().toUpperCase(),
      String(request.target_content_id || ''),
      rformContentApiV04Sha256Hex_(String(request.title || '').trim()),
      rformContentApiV04Sha256Hex_(String(request.angle || '').trim()),
      rformContentApiV04Sha256Hex_(String(request.telegram_text || '').trim())
    ];
    if (String(request.visual_sha256 || '').trim()) {
      lines.push(
        String(request.visual_filename || ''),
        String(request.visual_mime_type || '').trim().toLowerCase(),
        String(request.visual_size || ''),
        String(request.visual_sha256 || '').trim().toLowerCase()
      );
    }
    return lines.join('\n');
  }
  if (operation === 'queue_publication_approval') {
    const lines = [
      timestamp,
      nonce,
      operation,
      String(request.action_id || ''),
      String(request.content_id || ''),
      rformContentApiV04Sha256Hex_(String(request.telegram_text || '').trim()),
      rformContentApiV04Sha256Hex_(String(request.telegram_visual_url || '').trim()),
      String(request.telegram_post_mode || '').trim().toUpperCase()
    ];
    if (request.expected_workspace_hash) lines.push(String(request.expected_workspace_hash));
    if (request.expected_workspace_hash) lines.push(String(request.expected_asset_hash || ''));
    return lines.join('\n');
  }
  if (operation === 'queue_publication_assets') {
    return [
      timestamp,
      nonce,
      operation,
      String(request.content_id || '')
    ].join('\n');
  }
  throw new Error('Операция не поддерживается.');
}

function rformContentApiV04ApplyPublicationApproval_(request) {
  const actionId = String(request.action_id || '').trim();
  const proposalId = String(request.proposal_id || '').trim();
  const sessionId = String(request.session_id || '').trim();
  const sourceHash = String(request.source_hash || '').trim().toLowerCase();
  const mode = String(request.mode || '').trim().toUpperCase();
  const targetContentId = String(request.target_content_id || '').trim();
  const title = String(request.title || '').trim();
  const angle = String(request.angle || '').trim();
  const telegramText = String(request.telegram_text || '').trim();
  const visualFilename = String(request.visual_filename || '').trim();
  const visualMimeType = String(request.visual_mime_type || '').trim().toLowerCase();
  const expectedVisualSize = Number(request.visual_size || 0);
  const expectedVisualSha = String(request.visual_sha256 || '').trim().toLowerCase();
  const visualBase64 = String(request.visual_data_base64 || '');
  const hasVisual = !!expectedVisualSha;
  const nonce = String(request.nonce || '');

  rformContentApiV04RequireActionId_(actionId);
  rformContentApiV04RequireRecordId_(proposalId, 'Код предложения');
  rformContentApiV04RequireRecordId_(sessionId, 'Код тренировки');
  if (['UPDATE_EXISTING', 'CREATE_NEW'].indexOf(mode) === -1) {
    throw new Error('Режим предложения не поддерживается.');
  }
  if (mode === 'UPDATE_EXISTING') {
    rformContentApiV04RequireRecordId_(targetContentId, 'Код материала');
  }
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Некорректный хэш исходных данных.');
  if (!title || title.length > 240) throw new Error('Название публикации некорректно.');
  if (!angle || angle.length > RFORM_CONTENT_API_V04.maxAngleChars) {
    throw new Error('Главная мысль публикации некорректна.');
  }
  if (!telegramText || telegramText.length > RFORM_CONTENT_API_V04.maxTelegramChars) {
    throw new Error('Текст публикации пуст или превышает лимит Telegram.');
  }

  let visualBytes = null;
  if (hasVisual) {
    if (!visualFilename || visualFilename.length > 180) {
      throw new Error('Некорректное имя визуала.');
    }
    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(visualMimeType) === -1) {
      throw new Error('Разрешены PNG, JPG и WEBP.');
    }
    if (!Number.isFinite(expectedVisualSize) || expectedVisualSize < 1 ||
        expectedVisualSize > RFORM_CONTENT_API_V04.maxPublicationVisualBytes) {
      throw new Error('Размер визуала превышает лимит 5 МБ.');
    }
    if (!/^[a-f0-9]{64}$/.test(expectedVisualSha)) {
      throw new Error('Некорректная контрольная сумма визуала.');
    }
    try {
      visualBytes = Utilities.base64Decode(visualBase64);
    } catch (error) {
      throw new Error('Визуал не удалось декодировать.');
    }
    if (visualBytes.length !== expectedVisualSize) {
      throw new Error('Размер визуала не совпадает с подписью запроса.');
    }
    if (rformContentApiV04Sha256BytesHex_(visualBytes) !== expectedVisualSha) {
      throw new Error('Контрольная сумма визуала не совпадает.');
    }
  } else if (visualFilename || visualMimeType || expectedVisualSize || visualBase64) {
    throw new Error('Визуал передан не полностью.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Очередь занята. Повторите попытку.');
  try {
    const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
    const sessions = rformContentApiV04RequireSheet_(
      spreadsheet, RFORM_CONTENT_API_V04.trainingSessionsSheet
    );
    const sessionHeaders = rformContentApiV04Headers_(sessions);
    const missingTraining = RFORM_CONTENT_API_V04.trainingSessionFields.filter(function (name) {
      return sessionHeaders.indexOf(name) === -1;
    });
    if (missingTraining.length) {
      throw new Error('TRAINING_SESSIONS missing fields: ' + missingTraining.join(', '));
    }
    const sessionRow = rformContentApiV04FindUniqueRow_(sessions, 'Session_ID', sessionId);
    const sessionMap = rformContentApiV04HeaderMap_(sessionHeaders);
    const sessionValues = sessions.getRange(
      sessionRow, 1, 1, sessions.getLastColumn()
    ).getDisplayValues()[0];
    const sessionValue = function (name) {
      return String(sessionValues[sessionMap[name] - 1] || '').trim();
    };
    if (sessionValue('Session_Status').toUpperCase() !== 'CLOSED') {
      throw new Error('Тренировка ещё не закрыта. Публикация не подготовлена.');
    }
    const actualSourceHash = rformContentApiV04SessionSourceHash_(sessionValue);
    if (actualSourceHash !== sourceHash) {
      throw new Error('Данные тренировки изменились. Обновите страницу и проверьте новый вариант.');
    }

    const queue = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.queueSheet);
    const queueHeaders = rformContentApiV04Headers_(queue);
    const queueMap = rformContentApiV04HeaderMap_(queueHeaders);
    const missingProposal = RFORM_CONTENT_API_V04.proposalFields.filter(function (name) {
      return queueHeaders.indexOf(name) === -1;
    });
    if (missingProposal.length) {
      throw new Error('CONTENT_QUEUE missing proposal fields: ' + missingProposal.join(', '));
    }
    const logSheet = rformContentApiV04EnsureContentLog_(spreadsheet);
    const prior = rformContentApiV04ExistingLogResult_(logSheet, actionId, 'Action_ID');
    if (prior) return prior;

    let contentId = targetContentId;
    let queueRow = 0;
    if (mode === 'UPDATE_EXISTING') {
      queueRow = rformContentApiV04FindUniqueRow_(queue, 'Content_ID', contentId);
    } else {
      contentId = rformContentApiV04PublicationId_(sessionId, sessionValue('Date'));
      queueRow = rformContentApiV04FindOptionalRow_(queue, 'Content_ID', contentId);
    }

    let currentValues = [];
    const currentValue = function (name) {
      return queueRow ? String(currentValues[queueMap[name] - 1] || '').trim() : '';
    };
    if (queueRow) {
      currentValues = queue.getRange(queueRow, 1, 1, queue.getLastColumn()).getDisplayValues()[0];
      rformContentApiV04RequireOpenMaterial_(currentValue);
      if (['SCHEDULED', 'PUBLISHING', 'PUBLISHED'].indexOf(
        currentValue('Publication_Status').toUpperCase()
      ) !== -1 || currentValue('Telegram_Message_ID')) {
        throw new Error('Материал уже передан в публикацию. Повторная отправка запрещена.');
      }
    }

    const now = new Date();
    let visualFile = null;
    let createdVisualFile = false;
    let visualFileUrl = '';
    let visualFolderUrl = '';
    if (hasVisual) {
      const root = DriveApp.getFolderById(RFORM_CONTENT_API_V04.assetsRootFolderId);
      const folder = rformContentApiV04PublicationFolder_(root, contentId, expectedVisualSha);
      const safeName = rformContentApiV04SafeFilename_(visualFilename);
      const storedName = expectedVisualSha.slice(0, 12) + '__' + safeName;
      const existingFiles = folder.getFilesByName(storedName);
      if (existingFiles.hasNext()) {
        visualFile = existingFiles.next();
      } else {
        visualFile = folder.createFile(
          Utilities.newBlob(visualBytes, visualMimeType, storedName)
        );
        visualFile.setDescription('R/Form publication visual · ' + contentId);
        createdVisualFile = true;
      }
      visualFileUrl = visualFile.getUrl();
      visualFolderUrl = 'https://drive.google.com/drive/folders/' + folder.getId();
    }
    const updates = {
      Session_ID: sessionId,
      Date: sessionValue('Date'),
      Main_Training_Fact: sessionValue('Main_Result'),
      Main_Deviation: sessionValue('Plan_Status'),
      Decision: angle,
      Public_Data_Allowed: 'YES',
      Source_Packet_Status: 'READY',
      Text_Status: 'APPROVED',
      Approval_Status: 'APPROVED',
      Publication_Status: 'SCHEDULED',
      Updated_At: now,
      Duplicate_Flag: 'NO',
      Pipeline_Status: 'SCHEDULED',
      Current_Stage: 'SCHEDULED',
      Current_Chat: 'CHANNEL_CONTROL',
      Next_Chat: 'TELEGRAM_AUTOPOST',
      Blocking_Issue: '',
      Reader_Value: angle,
      Proof_Source: 'RFORM_MASTER_DATA_v1 / ' + sessionId,
      Distribution_Mode: hasVisual ? 'ORGANIC' : 'TEXT_ONLY',
      Editorial_Direction: angle,
      Publish_At: now,
      AutoPost_Allowed: 'YES',
      Telegram_Chat_ID: '@r_form',
      Telegram_Post_Mode: hasVisual ? 'PHOTO_CAPTION' : 'TEXT_ONLY',
      Telegram_Text: telegramText,
      Telegram_Message_ID: '',
      Telegram_Post_URL: '',
      Posted_At: '',
      Publish_Error: '',
      Preview_Review_Hash: rformContentApiV04Sha256Hex_(
        telegramText + (hasVisual ? '\n' + expectedVisualSha : '')
      ),
      Preview_Reviewed_At: now,
      Preview_Reviewed_By: 'STREAMLIT_OWNER',
      Preview_Review_Status: 'REVIEWED'
    };
    if (hasVisual) {
      updates.Visual_Status = 'APPROVED';
      updates.Folder_URL = visualFolderUrl;
      updates.Visual_URL = visualFileUrl;
      updates.Telegram_Visual_URL = visualFolderUrl;
    }
    if (!queueRow) {
      updates.Content_ID = contentId;
      updates.Rubric = 'TRAINING_LOG';
      if (!hasVisual) updates.Visual_Status = 'NOT_READY';
      updates.Created_At = now;
      updates.Task_ID = 'RFORM-AUTO-' + sessionId;
      updates.Content_Function = 'PROOF';
      updates.Content_Type = 'PROOF';
      updates.Funnel_Stage = 'TRUST';
      updates.CTA_Type = 'RETURN_TO_CHANNEL';
    }

    const previous = {};
    Object.keys(updates).forEach(function (name) {
      previous[name] = currentValue(name);
    });
    logSheet.appendRow([
      actionId, now, contentId, 'APPROVE_AND_SCHEDULE',
      rformContentApiV04SafeText_(proposalId + ' · ' + title),
      Object.keys(updates).join(','), JSON.stringify(previous), JSON.stringify(updates),
      'STREAMLIT_OWNER', nonce, 'PENDING'
    ]);
    const logRow = logSheet.getLastRow();
    const logMap = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(logSheet));
    let createdRow = 0;
    try {
      if (!queueRow) {
        const values = new Array(queueHeaders.length).fill('');
        Object.keys(updates).forEach(function (name) {
          values[queueMap[name] - 1] = updates[name];
        });
        queue.appendRow(values);
        queueRow = queue.getLastRow();
        createdRow = queueRow;
      } else {
        Object.keys(updates).forEach(function (name) {
          const value = updates[name] instanceof Date
            ? updates[name]
            : rformContentApiV04SafeText_(updates[name]);
          queue.getRange(queueRow, queueMap[name]).setValue(value);
        });
      }
      SpreadsheetApp.flush();
      logSheet.getRange(logRow, logMap.Result).setValue('APPLIED');
    } catch (error) {
      if (createdVisualFile && visualFile) {
        try {
          visualFile.setTrashed(true);
        } catch (cleanupError) {
          console.error('Visual cleanup failed: ' + cleanupError.message);
        }
      }
      if (createdRow) {
        queue.deleteRow(createdRow);
      } else {
        Object.keys(previous).forEach(function (name) {
          queue.getRange(queueRow, queueMap[name]).setValue(previous[name]);
        });
      }
      SpreadsheetApp.flush();
      logSheet.getRange(logRow, logMap.Result).setValue('FAILED_ROLLED_BACK');
      throw error;
    }
    return {
      ok: true,
      status: 'APPLIED',
      action_id: actionId,
      proposal_id: proposalId,
      content_id: contentId,
      publication_status: 'SCHEDULED',
      auto_post_allowed: 'YES',
      visual_attached: hasVisual,
      telegram_post_mode: hasVisual ? 'PHOTO_CAPTION' : 'TEXT_ONLY',
      publish_at: now.toISOString(),
      message: 'Publication approved and handed to Telegram Autopost.'
    };
  } finally {
    lock.releaseLock();
  }
}

function rformContentApiV04SessionSourceHash_(value) {
  return rformContentApiV04Sha256Hex_(
    RFORM_CONTENT_API_V04.trainingSessionFields.map(function (name) {
      return String(value(name) || '').trim();
    }).join('\n')
  );
}

function rformContentApiV04QueuePublicationAssets_(request) {
  const contentId = String(request.content_id || '').trim();
  rformContentApiV04RequireRecordId_(contentId, 'Код материала');

  const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
  const queue = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.queueSheet);
  const headers = rformContentApiV04Headers_(queue);
  const map = rformContentApiV04HeaderMap_(headers);
  const required = [
    'Content_ID', 'Public_Data_Allowed', 'Publication_Status', 'Pipeline_Status',
    'Text_Status', 'Telegram_Text', 'Telegram_Post_Mode', 'Telegram_Visual_URL'
  ];
  const missing = required.filter(function (name) { return !map[name]; });
  if (missing.length) {
    throw new Error('CONTENT_QUEUE missing preview fields: ' + missing.join(', '));
  }

  const row = rformContentApiV04FindUniqueRow_(queue, 'Content_ID', contentId);
  const values = queue.getRange(row, 1, 1, queue.getLastColumn()).getDisplayValues()[0];
  const value = function (name) {
    return String(values[map[name] - 1] || '').trim();
  };
  rformContentApiV04RequireOpenMaterial_(value);
  if (['YES', 'ДА', 'TRUE', '1'].indexOf(value('Public_Data_Allowed').toUpperCase()) === -1) {
    throw new Error('Публичные данные для материала не разрешены.');
  }
  if (!value('Telegram_Text')) throw new Error('Текст публикации отсутствует.');
  if (value('Telegram_Post_Mode').toUpperCase() === 'TEXT_ONLY') {
    return {ok: true, content_id: contentId, version: 0, assets: []};
  }

  const folderId = rformContentApiV04DriveFolderId_(value('Telegram_Visual_URL'));
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const candidates = [];
  let newestVersion = -1;
  while (files.hasNext()) {
    const file = files.next();
    const mimeType = String(file.getMimeType() || '').toLowerCase();
    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) === -1) continue;
    const size = Number(file.getSize() || 0);
    if (!Number.isFinite(size) || size < 1 || size > RFORM_CONTENT_API_V04.maxPublicationVisualBytes) {
      continue;
    }
    const filename = String(file.getName() || '');
    const versionMatch = filename.match(/(?:^|[_-])v(\d+)(?:[_-]|$)/i);
    const orderMatch = filename.match(/card[-_ ]?(\d+)/i);
    const version = versionMatch ? Number(versionMatch[1]) : 0;
    const order = orderMatch ? Number(orderMatch[1]) : 999;
    newestVersion = Math.max(newestVersion, version);
    candidates.push({file: file, filename: filename, mimeType: mimeType, size: size,
      version: version, order: order});
  }

  const selected = candidates.filter(function (item) {
    return item.version === newestVersion;
  }).sort(function (left, right) {
    return left.order - right.order || left.filename.localeCompare(right.filename);
  }).slice(0, RFORM_CONTENT_API_V04.maxQueuePreviewAssets);

  let totalSize = 0;
  const assets = selected.map(function (item, index) {
    totalSize += item.size;
    if (totalSize > RFORM_CONTENT_API_V04.maxQueuePreviewBytes) {
      throw new Error('Комплект изображений превышает лимит 15 МБ.');
    }
    return {
      file_id: item.file.getId(),
      sha256: rformContentApiV04Sha256BytesHex_(item.file.getBlob().getBytes()),
      filename: item.filename,
      mime_type: item.mimeType,
      size: item.size,
      version: item.version,
      order: item.order === 999 ? index + 1 : item.order,
      data_base64: Utilities.base64Encode(item.file.getBlob().getBytes())
    };
  });
  return {
    ok: true,
    content_id: contentId,
    version: newestVersion < 0 ? 0 : newestVersion,
    assets: assets
  };
}

function rformContentApiV04ApplyQueuePublicationApproval_(request) {
  const actionId = String(request.action_id || '').trim();
  const contentId = String(request.content_id || '').trim();
  const telegramText = String(request.telegram_text || '').trim();
  const expectedVisualUrl = String(request.telegram_visual_url || '').trim();
  const expectedPostMode = String(request.telegram_post_mode || '').trim().toUpperCase() || 'TEXT_ONLY';
  const nonce = String(request.nonce || '');

  rformContentApiV04RequireActionId_(actionId);
  rformContentApiV04RequireRecordId_(contentId, 'Код материала');
  if (!telegramText || telegramText.length > RFORM_CONTENT_API_V04.maxTelegramChars) {
    throw new Error('Текст публикации пуст или превышает лимит Telegram.');
  }
  if (['TEXT_ONLY', 'PHOTO_CAPTION', 'ALBUM_CAPTION'].indexOf(expectedPostMode) === -1) {
    throw new Error('Режим Telegram не поддерживается.');
  }
  if (expectedPostMode !== 'TEXT_ONLY' && !expectedVisualUrl) {
    throw new Error('Для публикации с изображением отсутствует ссылка на визуал.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Очередь занята. Повторите попытку.');
  try {
    const spreadsheet = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
    const queue = rformContentApiV04RequireSheet_(spreadsheet, RFORM_CONTENT_API_V04.queueSheet);
    const headers = rformContentApiV04Headers_(queue);
    const map = rformContentApiV04HeaderMap_(headers);
    const required = [
      'Content_ID', 'Public_Data_Allowed', 'Text_Status', 'Visual_Status',
      'Approval_Status', 'Publication_Status', 'Pipeline_Status', 'Current_Stage',
      'Updated_At', 'Blocking_Issue', 'Distribution_Mode', 'Publish_At',
      'AutoPost_Allowed', 'Telegram_Chat_ID', 'Telegram_Post_Mode', 'Telegram_Text',
      'Telegram_Visual_URL', 'Duplicate_Flag', 'Publish_Error',
      'Preview_Review_Hash', 'Preview_Reviewed_At', 'Preview_Reviewed_By',
      'Preview_Review_Status'
    ];
    const missing = required.filter(function (name) { return !map[name]; });
    if (missing.length) throw new Error('CONTENT_QUEUE missing queue approval fields: ' + missing.join(', '));

    const logSheet = rformContentApiV04EnsureContentLog_(spreadsheet);
    const prior = rformContentApiV04ExistingLogResult_(logSheet, actionId, 'Action_ID');
    if (prior) return prior;

    const row = rformContentApiV04FindUniqueRow_(queue, 'Content_ID', contentId);
    const rowValues = queue.getRange(row, 1, 1, queue.getLastColumn()).getDisplayValues()[0];
    const value = function (name) {
      return String(rowValues[map[name] - 1] || '').trim();
    };
    rformContentApiV04RequireOpenMaterial_(value);
    if(value('Publication_Status') !== 'PLANNED' || value('AutoPost_Allowed') !== 'NO' ||
      value('Publish_At') || value('Telegram_Message_ID') || value('Posted_At') ||
      ['READY','APPROVED'].indexOf(value('Text_Status'))===-1 ||
      ['READY','APPROVED','NOT_REQUIRED'].indexOf(value('Visual_Status'))===-1) throw new Error('Материал не готов или уже передан в публикацию.');
    if (['YES', 'ДА', 'TRUE', '1'].indexOf(value('Public_Data_Allowed').toUpperCase()) === -1) {
      throw new Error('Публичные данные для материала не разрешены.');
    }
    if (!value('Telegram_Chat_ID')) throw new Error('Telegram Chat ID не указан.');
    if (value('Blocking_Issue') &&
        !rformContentApiV04IsInformationalVisualNote_(value('Blocking_Issue'))) {
      throw new Error('Материал имеет блокирующую проблему.');
    }
    if (value('Publish_Error')) throw new Error('Сначала устраните ошибку публикации.');
    if (['YES', 'ДА', 'TRUE', '1', 'DUPLICATE'].indexOf(value('Duplicate_Flag').toUpperCase()) !== -1) {
      throw new Error('Материал отмечен как дубликат.');
    }
    if (value('Telegram_Text') !== telegramText) throw new Error('Текст изменился. Проверьте актуальный предпросмотр.');
    if (request.expected_workspace_hash && request.expected_workspace_hash !== rformContentApiV04WorkspaceHash_(value)) throw new Error('Версия материала изменилась.');
    if(request.expected_workspace_hash) {
      if(value('Current_Stage') !== 'OWNER_FINAL_PREVIEW') throw new Error('Требуется финальный предпросмотр.');
      const assets=expectedPostMode==='TEXT_ONLY'?[]:rformContentApiV04QueuePublicationAssets_({content_id:contentId}).assets;
      const fingerprint=rformContentApiV04Sha256Hex_(JSON.stringify(assets.map(function(a) {return [a.file_id,a.sha256];})));
      if(request.expected_asset_hash!==fingerprint) throw new Error('Фотографии изменились после предпросмотра.');
      rformContentApiV04TrainingFresh_(spreadsheet,value);
    }
    if (value('Telegram_Visual_URL') !== expectedVisualUrl ||
        (value('Telegram_Post_Mode').toUpperCase() || 'TEXT_ONLY') !== expectedPostMode) {
      throw new Error('Состав визуала изменился. Обновите данные и проверьте предпросмотр повторно.');
    }

    const now = new Date();
    const updates = {
      Text_Status: 'APPROVED',
      Visual_Status: expectedPostMode === 'TEXT_ONLY' ? 'NOT_REQUIRED' : 'APPROVED',
      Approval_Status: 'APPROVED',
      Publication_Status: 'SCHEDULED',
      Pipeline_Status: 'SCHEDULED · OWNER APPROVED',
      Current_Stage: 'AUTOPUBLISH_QUEUE',
      Updated_At: now,
      Publish_At: now,
      AutoPost_Allowed: 'YES',
      Telegram_Text: telegramText,
      Preview_Review_Hash: rformContentApiV04Sha256Hex_(telegramText + '\n' + expectedVisualUrl),
      Preview_Reviewed_At: now,
      Preview_Reviewed_By: 'STREAMLIT_OWNER',
      Preview_Review_Status: 'REVIEWED'
    };
    const previous = {};
    const next = {};
    Object.keys(updates).forEach(function (name) {
      previous[name] = value(name);
      next[name] = updates[name] instanceof Date ? updates[name].toISOString() : updates[name];
    });

    logSheet.appendRow([
      actionId, now, contentId, 'APPROVE_AND_SCHEDULE',
      rformContentApiV04SafeText_('Owner approved existing queue material'),
      Object.keys(updates).join(','), JSON.stringify(previous), JSON.stringify(next),
      'STREAMLIT_OWNER', nonce, 'PENDING'
    ]);
    const logRow = logSheet.getLastRow();
    const logMap = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(logSheet));
    try {
      Object.keys(updates).forEach(function (name) {
        const nextValue = updates[name] instanceof Date
          ? updates[name]
          : rformContentApiV04SafeText_(updates[name]);
        queue.getRange(row, map[name]).setValue(nextValue);
      });
      SpreadsheetApp.flush();
      Object.keys(updates).forEach(function(name) {
        const range=queue.getRange(row,map[name]);
        const expected=updates[name];
        if(expected instanceof Date) {
          const stored=range.getValue();
          if(!(stored instanceof Date) || stored.getTime()!==expected.getTime()) throw new Error('Approval date readback mismatch');
        } else if(range.getDisplayValue()!==String(expected)) throw new Error('Approval readback mismatch');
      });
      logSheet.getRange(logRow, logMap.Result).setValue('APPLIED');
    } catch (error) {
      Object.keys(previous).forEach(function (name) {
        queue.getRange(row, map[name]).setValue(previous[name]);
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
      publication_status: 'SCHEDULED',
      auto_post_allowed: 'YES',
      telegram_post_mode: expectedPostMode,
      publish_at: now.toISOString(),
      message: 'Existing publication approved and handed to Telegram Autopost.'
    };
  } finally {
    lock.releaseLock();
  }
}

function rformContentApiV04PublicationId_(sessionId, sessionDate) {
  const match = String(sessionDate || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const dateKey = match
    ? match[3] + ('0' + match[2]).slice(-2) + ('0' + match[1]).slice(-2)
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/GMT', 'yyyyMMdd');
  return ('CNT-' + dateKey + '-' + String(sessionId || 'TRAINING'))
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .slice(0, 160);
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

function rformContentApiV04PublicationFolder_(root, contentId, visualSha) {
  const name = ('PUBLICATION__' + String(contentId) + '__' + String(visualSha).slice(0, 12))
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 140);
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

function rformContentApiV04DriveFolderId_(value) {
  const match = String(value || '').match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (!match) throw new Error('Ссылка на папку визуалов некорректна.');
  return match[1];
}

function rformContentApiV04IsInformationalVisualNote_(value) {
  return /^Visual\s+v\d+\s+approved\b/i.test(String(value || '').trim());
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
  const terminal = ['PUBLISHED', 'SUPERSEDED', 'CANCELLED', 'ARCHIVED'];
  if (rformContentApiV04Archived_(value) || terminal.indexOf(publication) !== -1 || terminal.indexOf(textStatus) !== -1 ||
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


// Preparation-only operations for existing TEXT_ONLY material; no owner approval.
const RFORM_OWNER_PREVIEW_FIELDS = Object.freeze([
  'Content_ID', 'Current_Stage', 'Pipeline_Status', 'Source_Packet_Status',
  'Public_Data_Allowed', 'Text_Status', 'Visual_Status', 'Approval_Status',
  'Publication_Status', 'AutoPost_Allowed', 'Publish_At', 'Duplicate_Flag',
  'Blocking_Issue', 'Publish_Error', 'Telegram_Text', 'Telegram_Post_Mode',
  'Telegram_Visual_URL', 'Telegram_Message_ID', 'Telegram_Post_URL', 'Posted_At',
  'Preview_Review_Status', 'Preview_Review_Hash', 'Preview_Reviewed_At',
  'Preview_Reviewed_By', 'Updated_At'
]);

function rformContentApiV04OwnerPreviewHash_(value) {
  return rformContentApiV04Sha256Hex_(JSON.stringify(RFORM_OWNER_PREVIEW_FIELDS.map(function (name) {
    return value(name);
  })));
}

function rformContentApiV04PrepareOwnerPreview_(request) {
  return rformContentApiV04QueuePreparation_(request, false);
}

function rformContentApiV04SaveQueueTextDraft_(request) {
  return rformContentApiV04QueuePreparation_(request, true);
}

function rformContentApiV04QueuePreparation_(request, saveDraft) {
  const actionId = String(request.action_id || '').trim();
  const contentId = String(request.content_id || '').trim();
  const sourceHash = String(request.source_hash || '').trim();
  const nextText = String(request.telegram_text || '').trim();
  const action = saveDraft ? 'SAVE_TEXT_DRAFT' : 'PREPARE_OWNER_PREVIEW';
  const auditComment = saveDraft ? JSON.stringify({source_hash: sourceHash,
    text_hash: rformContentApiV04Sha256Hex_(nextText)}) : sourceHash;
  rformContentApiV04RequireActionId_(actionId);
  rformContentApiV04RequireRecordId_(contentId, 'Код материала');
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Некорректная версия материала.');
  if (saveDraft && (!nextText || nextText.length > RFORM_CONTENT_API_V04.maxTelegramChars)) {
    throw new Error('Текст публикации пуст или превышает лимит Telegram.');
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Очередь занята.');
  try {
    const ss = SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
    const queue = rformContentApiV04RequireSheet_(ss, RFORM_CONTENT_API_V04.queueSheet);
    const map = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(queue));
    RFORM_OWNER_PREVIEW_FIELDS.forEach(function (field) {
      if (!map[field]) throw new Error('CONTENT_QUEUE missing field: ' + field);
    });
    // Existing audit schema only: preparation must never create a sheet or column.
    const log = rformContentApiV04RequireSheet_(ss, RFORM_CONTENT_API_V04.actionLogSheet);
    const lm = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(log));
    RFORM_CONTENT_API_V04.actionLogHeaders.forEach(function (field) {
      if (!lm[field]) throw new Error('CONTENT_ACTION_LOG missing field: ' + field);
    });
    const prior = rformContentApiV04FindOptionalRow_(log, 'Action_ID', actionId);
    if (prior) {
      const priorRow = log.getRange(prior, 1, 1, log.getLastColumn()).getDisplayValues()[0];
      if (priorRow[lm.Content_ID - 1] !== contentId ||
          priorRow[lm.Action - 1] !== action ||
          priorRow[lm.Comment - 1] !== auditComment) throw new Error('Action_ID относится к другому запросу.');
      if (priorRow[lm.Result - 1] !== 'APPLIED') throw new Error('Исход предыдущего запроса не подтверждён. Проверьте текущий статус.');
      const currentRow = rformContentApiV04FindUniqueRow_(queue, 'Content_ID', contentId);
      const current = queue.getRange(currentRow, 1, 1, queue.getLastColumn()).getDisplayValues()[0];
      const previousValues = JSON.parse(priorRow[lm.Previous_Values - 1]);
      const nextValues = JSON.parse(priorRow[lm.New_Values - 1]);
      const originalValue = function (field) {
        return Object.prototype.hasOwnProperty.call(previousValues, field)
          ? String(previousValues[field]).trim() : String(current[map[field] - 1] || '').trim();
      };
      if (Object.keys(nextValues).some(function (field) {
            return String(current[map[field] - 1] || '').trim() !== nextValues[field];
          }) ||
          rformContentApiV04OwnerPreviewHash_(originalValue) !== sourceHash) {
        throw new Error('Подготовка уже выполнялась, но материал изменился. Проверьте текущий статус.');
      }
      return {ok: true, status: 'ALREADY_APPLIED', action_id: actionId, content_id: contentId};
    }
    const row = rformContentApiV04FindUniqueRow_(queue, 'Content_ID', contentId);
    const values = queue.getRange(row, 1, 1, queue.getLastColumn()).getDisplayValues()[0];
    const value = function (name) { return String(values[map[name] - 1] || '').trim(); };
    if (rformContentApiV04OwnerPreviewHash_(value) !== sourceHash) throw new Error('Материал изменился. Обновите данные перед подготовкой.');
    if (value('Current_Stage') !== 'CHANNEL_CONTROL_REVIEW') throw new Error('Материал не на этапе подготовки финального предпросмотра.');
    if (value('Publication_Status') !== 'PLANNED' || value('AutoPost_Allowed') !== 'NO' ||
        value('Publish_At') || ['NOT_READY', 'PENDING'].indexOf(value('Approval_Status')) === -1) {
      throw new Error('Материал уже согласован, отложен или имеет расписание.');
    }
    if (['READY', 'READY_FOR_SOURCE_DATA'].indexOf(value('Source_Packet_Status')) === -1 ||
        value('Public_Data_Allowed') !== 'YES' || value('Text_Status') !== 'READY' ||
        value('Visual_Status') !== 'NOT_REQUIRED' || value('Telegram_Post_Mode') !== 'TEXT_ONLY' ||
        value('Telegram_Visual_URL') || !value('Telegram_Text') ||
        value('Telegram_Text').length > RFORM_CONTENT_API_V04.maxTelegramChars) {
      throw new Error('Для этой операции нужен готовый TEXT_ONLY материал без визуала.');
    }
    if (value('Duplicate_Flag') || value('Blocking_Issue') || value('Publish_Error') ||
        value('Telegram_Message_ID') || value('Telegram_Post_URL') || value('Posted_At') ||
        /HOLD|SUPERSEDED|ARCHIV|REWORK/i.test(value('Pipeline_Status'))) throw new Error('Материал закрыт, заблокирован или является дублем.');
    if ((!saveDraft && (['NOT_REVIEWED', 'RECHECK_REQUIRED'].indexOf(value('Preview_Review_Status')) === -1 ||
        value('Preview_Review_Hash') || value('Preview_Reviewed_At') || value('Preview_Reviewed_By'))) ||
        (saveDraft && ['NOT_REVIEWED', 'RECHECK_REQUIRED', 'REVIEWED'].indexOf(value('Preview_Review_Status')) === -1)) {
      throw new Error('Сначала требуется сброс устаревшего согласования штатным workflow.');
    }
    if (saveDraft && nextText === value('Telegram_Text')) throw new Error('Текст не изменился.');
    const next = saveDraft ? {Telegram_Text: nextText,
      Updated_At: Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy HH:mm:ss'),
      Preview_Review_Status: 'RECHECK_REQUIRED', Preview_Review_Hash: '',
      Preview_Reviewed_At: '', Preview_Reviewed_By: ''} : {Current_Stage: 'OWNER_FINAL_PREVIEW'};
    const fields = Object.keys(next);
    const previous = {};
    fields.forEach(function (field) { previous[field] = String(values[map[field] - 1] || ''); });
    log.appendRow([actionId, new Date(), contentId, action, auditComment,
      fields.join(','), JSON.stringify(previous), JSON.stringify(next), 'STREAMLIT_PREPARATION',
      String(request.nonce || ''), 'PENDING']);
    const logRow = log.getLastRow();
    try {
      fields.forEach(function (field) {
        // Keep the signed timestamp literal: Sheets may parse date-like strings
        // and hide seconds under the existing dd.mm.yyyy hh:mm format.
        const writeValue = field === 'Updated_At' ? "'" + next[field] : rformContentApiV04SafeText_(next[field]);
        queue.getRange(row, map[field]).setValue(writeValue);
      });
      SpreadsheetApp.flush();
      const readback = queue.getRange(row, 1, 1, queue.getLastColumn()).getDisplayValues()[0];
      RFORM_OWNER_PREVIEW_FIELDS.forEach(function (field) {
        const expected = Object.prototype.hasOwnProperty.call(next, field) ? next[field] : value(field);
        if (String(readback[map[field] - 1] || '').trim() !== expected) throw new Error('Readback mismatch: ' + field);
      });
      log.getRange(logRow, lm.Result).setValue('APPLIED');
      SpreadsheetApp.flush();
      if (log.getRange(logRow, lm.Result).getDisplayValue() !== 'APPLIED') throw new Error('Audit readback mismatch');
      return {ok: true, status: 'APPLIED', action_id: actionId, content_id: contentId,
        changed_fields: fields, current_stage: value('Current_Stage') === 'CHANNEL_CONTROL_REVIEW' && !saveDraft
          ? 'OWNER_FINAL_PREVIEW' : value('Current_Stage'), source_hash: rformContentApiV04OwnerPreviewHash_(function (field) {
            return Object.prototype.hasOwnProperty.call(next, field) ? next[field] : value(field);
          })};
    } catch (error) {
      // No POST replay. A failed rollback/audit leaves an explicitly unknown outcome.
      try {
        fields.forEach(function (field) {
          queue.getRange(row, map[field]).setValue(rformContentApiV04SafeText_(previous[field]));
        });
        SpreadsheetApp.flush();
        fields.forEach(function (field) {
          if (queue.getRange(row, map[field]).getDisplayValue() !== previous[field]) throw new Error('Rollback readback mismatch');
        });
        log.getRange(logRow, lm.Result).setValue('FAILED_ROLLED_BACK');
        SpreadsheetApp.flush();
      } catch (rollbackError) {
        try { log.getRange(logRow, lm.Result).setValue('OUTCOME_UNKNOWN'); SpreadsheetApp.flush(); } catch (auditError) {}
        throw new Error('Исход подготовки неизвестен. Проверьте текущий статус; автоматический повтор отключён.');
      }
      throw error;
    }
  } finally { lock.releaseLock(); }
}

// Owner workspace: CONTENT_QUEUE is canonical; action log owns version/reminder history.
const RFORM_WORKSPACE_FIELDS = Object.freeze(RFORM_OWNER_PREVIEW_FIELDS.concat(['Session_ID', 'Proof_Source']));

function rformContentApiV04WorkspaceHash_(value) {
  return rformContentApiV04Sha256Hex_(JSON.stringify(RFORM_WORKSPACE_FIELDS.map(value)));
}

function rformContentApiV04WorkspaceContext_(spreadsheet) {
  const ss = spreadsheet || SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
  const queue = rformContentApiV04RequireSheet_(ss, RFORM_CONTENT_API_V04.queueSheet);
  const log = rformContentApiV04RequireSheet_(ss, RFORM_CONTENT_API_V04.actionLogSheet);
  const map = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(queue));
  const lm = rformContentApiV04HeaderMap_(rformContentApiV04Headers_(log));
  RFORM_WORKSPACE_FIELDS.forEach(function(f) { if (!map[f]) throw new Error('Missing queue field: ' + f); });
  RFORM_CONTENT_API_V04.actionLogHeaders.forEach(function(f) { if (!lm[f]) throw new Error('Missing audit field: ' + f); });
  return {ss:ss, queue:queue, log:log, map:map, lm:lm};
}

function rformContentApiV04WorkspaceRecords_(c) {
  if(c.records) return c.records;
  if (c.log.getLastRow() < 2) return c.records=[];
  return c.records=c.log.getRange(2, 1, c.log.getLastRow()-1, c.log.getLastColumn()).getDisplayValues()
    .map(function(row) {
      const out = {};
      Object.keys(c.lm).forEach(function(k) { out[k] = String(row[c.lm[k]-1] || ''); });
      return out;
    });
}

function rformContentApiV04WorkspaceMeta_(context) {
  const c = context || rformContentApiV04WorkspaceContext_();
  const meta = {};
  rformContentApiV04WorkspaceRecords_(c).forEach(function(r) {
    if (r.Result !== 'APPLIED' || !/^OWNER_(SAVE|HOLD|RETURN|REMINDER|AI_REQUEST|AI_PROPOSAL|ARCHIVE|RESTORE|LINK_PUBLICATION)$/.test(r.Action)) return;
    const m = meta[r.Content_ID] || {versions:[], reminder:null, ai:null};
    let n; try { n = JSON.parse(r.New_Values || '{}'); } catch (_) { return; }
    if (r.Action === 'OWNER_SAVE') m.versions.push({action_id:r.Action_ID, at:r.Timestamp});
    if (r.Action === 'OWNER_HOLD' || r.Action === 'OWNER_REMINDER') m.reminder = n._meta || null;
    if (['OWNER_RETURN','OWNER_ARCHIVE','OWNER_RESTORE','OWNER_LINK_PUBLICATION'].indexOf(r.Action)!==-1) m.reminder = null;
    if (r.Action==='OWNER_ARCHIVE') m.archive=n._meta;
    if (r.Action==='OWNER_RESTORE') m.archive=null;
    if (r.Action==='OWNER_LINK_PUBLICATION') m.publication=n._meta;
    if (r.Action === 'OWNER_AI_REQUEST') m.ai = Object.assign({request_id:r.Action_ID, status:'REQUESTED'}, n._meta);
    if (r.Action === 'OWNER_AI_PROPOSAL') m.ai = Object.assign({proposal_id:r.Action_ID, status:'PROPOSED'}, n._meta);
    m.versions = m.versions.slice(-10);
    meta[r.Content_ID] = m;
  });
  const posts=rformContentApiV04ChannelPosts_(c);
  if(c.queue.getLastRow()>1) c.queue.getRange(2,1,c.queue.getLastRow()-1,c.queue.getLastColumn()).getDisplayValues().forEach(function(raw) {
    const id=String(raw[c.map.Content_ID-1] || ''),messageId=String(raw[c.map.Telegram_Message_ID-1] || '');
    if(raw[c.map.Publication_Status-1]!=='PUBLISHED' || !posts[messageId]) return;
    const p=posts[messageId],m=meta[id] || {versions:[],reminder:null,ai:null};
    m.publication=Object.assign({},m.publication || {},{message_id:p.message_id,event_hash:p.hash,
      post_url:p.post_url,published_text:p.text,channel_revision:p.revision,published_date:p.date});
    meta[id]=m;
  });
  return meta;
}

function rformContentApiV04WorkspaceMutable_(value) {
  if (['PLANNED', 'HOLD', 'NOT_READY'].indexOf(value('Publication_Status')) === -1 ||
      value('AutoPost_Allowed') !== 'NO' || value('Publish_At') ||
      value('Telegram_Message_ID') || value('Telegram_Post_URL') || value('Posted_At') ||
      rformContentApiV04Archived_(value) ||
      value('Duplicate_Flag') || value('Publish_Error')) throw new Error('Материал закрыт, имеет расписание или заблокирован.');
}

function rformContentApiV04WorkspaceCommit_(c, request, row, action, updates, metadata) {
  const before = c.queue.getRange(row,1,1,c.queue.getLastColumn()).getDisplayValues()[0];
  const previous = {}, next = {};
  Object.keys(updates).forEach(function(f) {
    if (!c.map[f]) throw new Error('Missing field: ' + f);
    previous[f] = String(before[c.map[f]-1] || '');
    next[f] = String(updates[f]);
  });
  if (metadata) next._meta = metadata;
  const identity = rformContentApiV04Sha256Hex_(JSON.stringify([
    request.content_id || '', request.source_hash || '', request.payload || {}
  ]));
  c.records=null; c.log.appendRow([request.action_id,new Date(),request.content_id,action,identity,
    Object.keys(updates).join(','),JSON.stringify(previous),JSON.stringify(next),
    'OWNER_WORKSPACE',request.nonce || '', 'PENDING']);
  const lr = c.log.getLastRow();
  try {
    Object.keys(updates).forEach(function(f) {
      const text = next[f];
      c.queue.getRange(row,c.map[f]).setValue(f === 'Updated_At' ? "'" + text : rformContentApiV04SafeText_(text));
    });
    SpreadsheetApp.flush();
    const readback = c.queue.getRange(row,1,1,c.queue.getLastColumn()).getDisplayValues()[0];
    // Verify unchanged fields too, including all publication controls.
    Object.keys(c.map).forEach(function(f) {
      const expected = Object.prototype.hasOwnProperty.call(updates,f) ? next[f] : String(before[c.map[f]-1] || '');
      if (String(readback[c.map[f]-1] || '') !== expected) throw new Error('Readback mismatch');
    });
    c.log.getRange(lr,c.lm.Result).setValue('APPLIED');c.records=null;
    SpreadsheetApp.flush();
    if (c.log.getRange(lr,c.lm.Result).getDisplayValue() !== 'APPLIED') throw new Error('Audit readback mismatch');
    return {ok:true,status:'APPLIED',action_id:request.action_id,content_id:request.content_id,
      source_hash:rformContentApiV04WorkspaceHash_(function(f) { return String(readback[c.map[f]-1] || '').trim(); })};
  } catch(error) {
    try {
      Object.keys(previous).forEach(function(f) {
        // Force literals on rollback; do not lose seconds or leading formula characters.
        c.queue.getRange(row,c.map[f]).setValue("'" + previous[f]);
      });
      SpreadsheetApp.flush();
      Object.keys(previous).forEach(function(f) {
        if(c.queue.getRange(row,c.map[f]).getDisplayValue() !== previous[f]) throw new Error('Rollback mismatch');
      });
      c.log.getRange(lr,c.lm.Result).setValue('FAILED_ROLLED_BACK');
    } catch(_) {
      try { c.log.getRange(lr,c.lm.Result).setValue('OUTCOME_UNKNOWN'); } catch(__) {}
      throw new Error('Исход операции неизвестен. Проверьте статус; повтор отключён.');
    }
    throw error;
  }
}

function rformContentApiV04Workspace_(request) {
  const p = request.payload || {};
  rformContentApiV04RequireActionId_(String(request.action_id || ''));
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Очередь занята.');
  try {
    const c = rformContentApiV04WorkspaceContext_();
    if (p.action === 'sync_training') return rformContentApiV04TrainingDrafts_(c,request);
    if (p.action === 'channel_record') return rformContentApiV04ChannelRecord_(c,request);
    if (p.action === 'reconcile_channel') return rformContentApiV04ReconcileChannel_(c,request);
    if (p.action === 'channel_dismiss') {
      const event=rformContentApiV04ChannelEvent_(c,p);
      const prior=rformContentApiV04WorkspaceRecords_(c).find(function(r){return r.Action_ID===request.action_id;});
      if(prior) {
        if(prior.Action!=='CHANNEL_DISMISS' || prior.Result!=='APPLIED' || JSON.parse(prior.New_Values)._meta.event_hash!==event.hash) throw new Error('Исход предыдущего запроса не подтверждён.');
        return {ok:true,status:'ALREADY_APPLIED'};
      }
      c.records=null; c.log.appendRow([request.action_id,new Date(),'CHANNEL-'+event.message_id,'CHANNEL_DISMISS',event.hash,'','{}',
        JSON.stringify({_meta:{event_hash:event.hash}}),'OWNER_WORKSPACE',request.nonce || '','PENDING']);
      const lr=c.log.getLastRow();SpreadsheetApp.flush();
      if(JSON.parse(c.log.getRange(lr,c.lm.New_Values).getDisplayValue())._meta.event_hash!==event.hash) throw new Error('Dismiss readback mismatch');
      c.log.getRange(lr,c.lm.Result).setValue('APPLIED');c.records=null;SpreadsheetApp.flush();
      if(c.log.getRange(lr,c.lm.Result).getDisplayValue()!=='APPLIED') throw new Error('Dismiss audit mismatch');
      return {ok:true,status:'APPLIED'};
    }
    rformContentApiV04RequireRecordId_(request.content_id,'Код материала');
    const row = rformContentApiV04FindUniqueRow_(c.queue,'Content_ID',request.content_id);
    const raw = c.queue.getRange(row,1,1,c.queue.getLastColumn()).getDisplayValues()[0];
    const value = function(f) { return String(raw[c.map[f]-1] || '').trim(); };
    const identity = rformContentApiV04Sha256Hex_(JSON.stringify([request.content_id,request.source_hash || '',p]));
    const records = rformContentApiV04WorkspaceRecords_(c);
    const prior = records.find(function(r) { return r.Action_ID === request.action_id; });
    if(prior) {
      if(prior.Content_ID !== request.content_id || prior.Comment !== identity) throw new Error('Action_ID относится к другому запросу.');
      if(prior.Result !== 'APPLIED') throw new Error('Исход предыдущего запроса не подтверждён.');
      const next = JSON.parse(prior.New_Values || '{}');
      Object.keys(next).filter(function(k) { return k !== '_meta'; }).forEach(function(f) {
        if(value(f) !== String(next[f]).trim()) throw new Error('После операции материал изменился.');
      });
      return {ok:true,status:'ALREADY_APPLIED',action_id:request.action_id,metadata:next._meta || null};
    }
    if (request.source_hash !== rformContentApiV04WorkspaceHash_(value)) throw new Error('Материал изменился. Откройте актуальную карточку.');
    if(['archive','restore'].indexOf(p.action)!==-1) return rformContentApiV04ArchiveAction_(c,request,row,value);
    rformContentApiV04WorkspaceMutable_(value);
    if(p.action==='link_publication') return rformContentApiV04LinkPublication_(c,request,row,value,rformContentApiV04ChannelEvent_(c,p));
    if(p.action === 'stage_photo') return rformContentApiV04WorkspaceStagePhoto_(c,request,row);
    if(p.action === 'draft_assets') {
      const files=rformContentApiV04WorkspaceFiles_(c,request,p.asset_ids,value);
      return {ok:true,assets:files.map(function(f) {return {file_id:f.getId(),mime_type:f.getMimeType(),
        filename:f.getName(),data_base64:Utilities.base64Encode(f.getBlob().getBytes())};})};
    }
    const now = Utilities.formatDate(new Date(),'Europe/Moscow','dd.MM.yyyy HH:mm:ss');
    const invalidate = {Approval_Status:'NOT_READY',AutoPost_Allowed:'NO',Publish_At:'',
      Preview_Review_Status:'RECHECK_REQUIRED',Preview_Review_Hash:'',
      Preview_Reviewed_At:'',Preview_Reviewed_By:'',Updated_At:now};
    if(p.action === 'save') {
      const text = String(p.text || '').trim();
      if(!text || text.length > 4096) throw new Error('Текст должен содержать от 1 до 4096 символов.');
      if(value('Public_Data_Allowed') !== 'YES') throw new Error('Публичные данные не разрешены.');
      const updates = Object.assign({},invalidate,{Telegram_Text:text,Text_Status:'READY'});
      if(p.asset_ids !== undefined) {
        const ids = p.asset_ids;
        if(!Array.isArray(ids) || ids.length>10 || new Set(ids).size !== ids.length) throw new Error('Некорректный комплект фотографий.');
        const manifest = rformContentApiV04WorkspaceRevision_(c,request,ids,value);
        updates.Telegram_Visual_URL = manifest.url;
        updates.Telegram_Post_Mode = ids.length === 0 ? 'TEXT_ONLY' : (ids.length === 1 ? 'PHOTO_CAPTION' : 'ALBUM_CAPTION');
        updates.Visual_Status = ids.length ? 'READY' : 'NOT_REQUIRED';
      }
      return rformContentApiV04WorkspaceCommit_(c,request,row,'OWNER_SAVE',updates,
        {text:text,visual_url:updates.Telegram_Visual_URL === undefined?value('Telegram_Visual_URL'):updates.Telegram_Visual_URL});
    }
    if(p.action === 'hold' || p.action === 'reminder') {
      const due = String(p.review_at || '');
      if(due && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+03:00$/.test(due) ||
        !Number.isFinite(Date.parse(due)) || Date.parse(due) <= Date.now())) throw new Error('Нужна будущая дата рассмотрения по Москве.');
      if(p.action === 'reminder' && !rformContentApiV04Held_(value)) throw new Error('Напоминание доступно для отложенного материала.');
      const updates = Object.assign({},invalidate,{Publication_Status:'HOLD',Pipeline_Status:'HOLD'});
      return rformContentApiV04WorkspaceCommit_(c,request,row,p.action === 'hold'?'OWNER_HOLD':'OWNER_REMINDER',
        updates,{review_at:due,notify:!!p.notify});
    }
    if(p.action === 'return') {
      if(!rformContentApiV04Held_(value)) throw new Error('Материал не отложен.');
      return rformContentApiV04WorkspaceCommit_(c,request,row,'OWNER_RETURN',
        Object.assign({},invalidate,{Publication_Status:'PLANNED',Pipeline_Status:'READY · CHANNEL CONTROL',Current_Stage:'CHANNEL_CONTROL_REVIEW'}));
    }
    if(p.action === 'prepare') {
      rformContentApiV04TrainingFresh_(c.ss,value);
      if(value('Publication_Status') !== 'PLANNED' || value('Public_Data_Allowed') !== 'YES' ||
        ['READY','READY_FOR_SOURCE_DATA'].indexOf(value('Source_Packet_Status')) === -1 ||
        value('Text_Status') !== 'READY' || value('Blocking_Issue') || !value('Telegram_Text')) throw new Error('Материал ещё не готов к предпросмотру.');
      const mode=value('Telegram_Post_Mode');
      if(mode !== 'TEXT_ONLY') {
        const packet = rformContentApiV04QueuePublicationAssets_({content_id:request.content_id});
        const expectedCount = mode === 'PHOTO_CAPTION' ? 1 : packet.assets.length;
        if(!packet.assets.length || packet.assets.length !== expectedCount ||
          ['PHOTO_CAPTION','ALBUM_CAPTION'].indexOf(mode) === -1 ||
          (mode === 'ALBUM_CAPTION' && packet.assets.length<2)) throw new Error('Некорректный состав фотографий.');
      } else if(value('Telegram_Visual_URL')) throw new Error('TEXT_ONLY содержит визуал.');
      return rformContentApiV04WorkspaceCommit_(c,request,row,'OWNER_PREPARE',
        Object.assign({},invalidate,{Current_Stage:'OWNER_FINAL_PREVIEW'}));
    }
    if(p.action === 'ai_request') {
      const instruction=String(p.instruction || '').trim();
      if(!instruction || instruction.length>2000) throw new Error('Поручение должно содержать от 1 до 2000 символов.');
      return rformContentApiV04WorkspaceCommit_(c,request,row,'OWNER_AI_REQUEST',{},
        {source_hash:request.source_hash,instruction:instruction,status:'REQUESTED'});
    }
    if(p.action === 'version_read') {
      const version=records.find(function(r) {return r.Action_ID===p.version_id && r.Content_ID===request.content_id && r.Action==='OWNER_SAVE' && r.Result==='APPLIED';});
      if(!version) throw new Error('Версия не найдена.');
      const snapshot=JSON.parse(version.New_Values)._meta;
      const ids=[];
      if(snapshot.visual_url) {
        const iterator=DriveApp.getFolderById(rformContentApiV04DriveFolderId_(snapshot.visual_url)).getFiles();
        const files=[];
        while(iterator.hasNext()) {const f=iterator.next();files.push({id:f.getId(),name:f.getName()});}
        files.sort(function(a,b){return a.name.localeCompare(b.name);}).forEach(function(f){ids.push(f.id);});
      }
      return {ok:true,text:snapshot.text,asset_ids:ids};
    }
    if(p.action === 'ai_proposal') {
      const ai=records.find(function(r) {return r.Action_ID === p.request_id && r.Action === 'OWNER_AI_REQUEST' && r.Content_ID===request.content_id && r.Result==='APPLIED';});
      const latestAi=(rformContentApiV04WorkspaceMeta_(c)[request.content_id] || {}).ai;
      if(!ai || !latestAi || latestAi.request_id!==p.request_id || latestAi.status!=='REQUESTED' ||
        JSON.parse(ai.New_Values)._meta.source_hash !== request.source_hash) throw new Error('Запрос ИИ устарел или отсутствует.');
      if(records.some(function(r) {return r.Action==='OWNER_AI_PROPOSAL' && r.Content_ID===request.content_id && r.Result==='APPLIED' && JSON.parse(r.New_Values || '{}')._meta.request_id===p.request_id;})) throw new Error('Для запроса уже есть предложение.');
      const proposal=String(p.text || '').trim();
      if(!proposal || proposal.length>4096) throw new Error('Некорректное предложение ИИ.');
      // A worker can propose only, never save or approve a material.
      return rformContentApiV04WorkspaceCommit_(c,request,row,'OWNER_AI_PROPOSAL',{},
        {source_hash:request.source_hash,request_id:p.request_id,text:proposal});
    }
    throw new Error('Действие workspace не поддерживается.');
  } finally { lock.releaseLock(); }
}

function rformContentApiV04WorkspaceStagePhoto_(c,request,row) {
  const p=request.payload;
  if(['image/jpeg','image/png'].indexOf(p.mime_type)===-1) throw new Error('Поддерживаются JPEG и PNG.');
  const bytes=Utilities.base64Decode(String(p.data_base64 || ''));
  if(!bytes.length || bytes.length>RFORM_CONTENT_API_V04.maxPublicationVisualBytes) throw new Error('Фото должно быть не более 5 МБ.');
  const u=function(i) {return (bytes[i]+256)%256;};
  const jpeg=u(0)===255 && u(1)===216 && u(2)===255;
  const png=[137,80,78,71,13,10,26,10].every(function(v,i) {return u(i)===v;});
  if((p.mime_type==='image/jpeg'&&!jpeg)||(p.mime_type==='image/png'&&!png)) throw new Error('Содержимое не соответствует формату фото.');
  const root=DriveApp.getFolderById(RFORM_CONTENT_API_V04.assetsRootFolderId);
  const folder=root.createFolder('OWNER_STAGE_'+request.action_id);
  const file=folder.createFile(Utilities.newBlob(bytes,p.mime_type,'photo.'+(jpeg?'jpg':'png')));
  const result=rformContentApiV04WorkspaceCommit_(c,request,row,'OWNER_STAGE_PHOTO',{},
    {file_id:file.getId(),content_id:request.content_id,source_hash:request.source_hash});
  result.metadata={file_id:file.getId()}; return result;
}

function rformContentApiV04WorkspaceRevision_(c,request,ids,value) {
  if(!ids.length) return {url:''};
  const files=rformContentApiV04WorkspaceFiles_(c,request,ids,value);
  // New private immutable directory per committed revision; Autopost sees exactly this set.
  const folder=DriveApp.getFolderById(RFORM_CONTENT_API_V04.assetsRootFolderId).createFolder('OWNER_REV_'+request.action_id);
  files.forEach(function(f,i) { f.makeCopy('card-'+('0'+(i+1)).slice(-2)+'_v01.'+(f.getMimeType()==='image/png'?'png':'jpg'),folder); });
  return {url:folder.getUrl()};
}

function rformContentApiV04WorkspaceFiles_(c,request,ids,value) {
  if(!Array.isArray(ids) || ids.length>10 || new Set(ids).size!==ids.length) throw new Error('Некорректный комплект фото.');
  const allowed={};
  rformContentApiV04WorkspaceRecords_(c).forEach(function(r) {
    if(r.Content_ID===request.content_id && r.Action==='OWNER_STAGE_PHOTO' && r.Result==='APPLIED') {
      const m=JSON.parse(r.New_Values || '{}')._meta;
      if(m && m.source_hash===request.source_hash) allowed[m.file_id]=true;
    }
    if(r.Content_ID===request.content_id && r.Action==='OWNER_SAVE' && r.Result==='APPLIED') {
      const snapshot=JSON.parse(r.New_Values || '{}')._meta;
      if(snapshot && snapshot.visual_url) {
        const iterator=DriveApp.getFolderById(rformContentApiV04DriveFolderId_(snapshot.visual_url)).getFiles();
        while(iterator.hasNext()) allowed[iterator.next().getId()]=true;
      }
    }
  });
  if(value('Telegram_Visual_URL')) {
    const existing=DriveApp.getFolderById(rformContentApiV04DriveFolderId_(value('Telegram_Visual_URL'))).getFiles();
    while(existing.hasNext()) { const f=existing.next(); allowed[f.getId()]=true; }
  }
  let total=0;
  const files=ids.map(function(id) {
    if(!allowed[id]) throw new Error('Фото не принадлежит текущему материалу или версии.');
    const f=DriveApp.getFileById(id);
    if(['image/jpeg','image/png'].indexOf(f.getMimeType())===-1 || f.getSize()>5*1024*1024) throw new Error('Неподдерживаемое фото.');
    total+=f.getSize();return f;
  });
  if(total>15*1024*1024) throw new Error('Комплект превышает 15 МБ.');
  return files;
}

function rformContentApiV04EnableTrainingDrafts() {
  const existingProps=PropertiesService.getScriptProperties();
  const existingBaseline=existingProps.getProperty('RFORM_AUTO_DRAFT_BASELINE');
  if(existingBaseline) {
    existingProps.setProperty('RFORM_AUTO_DRAFT_ENABLED','YES');
    return {ok:true,status:'ALREADY_CONFIGURED',baseline_closed_sessions:JSON.parse(existingBaseline).length,publication_enabled:false};
  }
  const c=rformContentApiV04WorkspaceContext_();
  const sheet=rformContentApiV04RequireSheet_(c.ss,RFORM_CONTENT_API_V04.trainingSessionsSheet);
  const rows=rformContentApiV04ReadRows_(sheet,RFORM_CONTENT_API_V04.trainingSessionFields,'Session_ID');
  const baseline=rows.filter(function(r) {return r.Session_Status==='CLOSED';}).map(function(r) {return r.Session_ID;});
  const props=PropertiesService.getScriptProperties();
  // Mark only already closed sessions; in-progress sessions may close after enablement.
  const encoded=JSON.stringify(baseline);
  if(encoded.length>8000) throw new Error('Baseline exceeds property limit; use a bounded reviewed migration.');
  props.setProperty('RFORM_AUTO_DRAFT_BASELINE',encoded);
  props.setProperty('RFORM_AUTO_DRAFT_ENABLED','YES');
  return {ok:true,baseline_closed_sessions:baseline.length,publication_enabled:false};
}

function rformContentApiV04DisableTrainingDrafts() {
  PropertiesService.getScriptProperties().setProperty('RFORM_AUTO_DRAFT_ENABLED','NO');
  return {ok:true};
}

function rformContentApiV04TrainingText_(s) {
  const result=String(s.Main_Result || '').trim();
  if(!result) throw new Error('В закрытой тренировке отсутствует Main_Result.');
  // Keep complete exercise groups, including their varying sets and RIR.
  // Never cut a numeric tuple or manufacture an interpretation from Plan_Status.
  const groups=result.split(/;\s+(?=[А-ЯЁA-Z][а-яёa-z])/).filter(Boolean);
  if(!groups.length) throw new Error('Нет полного списка фактов.');
  const parts=[s.Date+' · Тренировка '+s.Session_Type,
    groups.map(function(g,i){return (i+1)+'. '+g;}).join('\n\n')];
  if(s.Actual_Duration) parts.push('Продолжительность: '+s.Actual_Duration+' мин.');
  parts.push('#RForm_Training');
  const text=parts.join('\n\n');
  // A long report requires editorial preparation; never silently drop exercises.
  if(text.length>4096) throw new Error('Полный отчёт превышает лимит Telegram; подготовьте карточки.');
  return text;
}

function rformContentApiV04TrainingDrafts_(c,request) {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('RFORM_AUTO_DRAFT_ENABLED')!=='YES') return {ok:true,status:'DISABLED',created:[]};
  const baselineRaw=props.getProperty('RFORM_AUTO_DRAFT_BASELINE');
  if(!baselineRaw) throw new Error('Baseline отсутствует. Автоматический импорт истории запрещён.');
  const baseline=JSON.parse(baselineRaw);
  if(!Array.isArray(baseline) || baseline.some(function(id){return typeof id!=='string';})) throw new Error('Baseline повреждён. Требуется проверка.');
  const sessions=rformContentApiV04ReadRows_(rformContentApiV04RequireSheet_(c.ss,RFORM_CONTENT_API_V04.trainingSessionsSheet),
    RFORM_CONTENT_API_V04.trainingSessionFields.concat(['Completed_At','Duplicate_Flag']),'Session_ID');
  const queue=rformContentApiV04ReadRows_(c.queue,RFORM_CONTENT_API_V04.queueFields,'Content_ID');
  const created=[],blocked=[];
  const unique={};
  sessions.forEach(function(s) {unique[s.Session_ID]=(unique[s.Session_ID]||0)+1;});
  sessions.filter(function(s) {return s.Session_Status==='CLOSED' && baseline.indexOf(s.Session_ID)===-1;})
    .forEach(function(s) {
    if(created.length>=3) return;
    if(unique[s.Session_ID]!==1) {blocked.push({session_id:s.Session_ID,reason:'DUPLICATE_SESSION'});return;}
    if(!s.Completed_At || /^(YES|TRUE|1|DUPLICATE|ДА)$/i.test(s.Duplicate_Flag || '')) {
      blocked.push({session_id:s.Session_ID,reason:'COMPLETION_NOT_VERIFIED'});return;
    }
    const covered=queue.some(function(q) {
      if(q.Session_ID===s.Session_ID) return true; // Includes HOLD: never recreate a deferred draft.
      const m=String(q.Proof_Source || '').match(/COVERS:([^\s·]+)/);
      return m && m[1].split(',').indexOf(s.Session_ID)!==-1;
    });
    if(covered) return;
    const cardsEnabled=props.getProperty('RFORM_AUTO_CARDS_ENABLED')==='YES';
    let text,packet;try {
      if(cardsEnabled) {
        packet=rformContentApiV04CardPacket_(s,rformContentApiV04CardRows_(c.ss,s.Session_ID));
        text=rformContentApiV04CardCaption_(packet);
      } else text=rformContentApiV04TrainingText_(s);
    } catch(error) {blocked.push({session_id:s.Session_ID,code:'FACT_PACKET_NOT_READY',reason:'Проверьте подходы: '+String(error.message).slice(0,160),detail:String(error.message).slice(0,200)});return;}
    const id=rformContentApiV04PublicationId_(s.Session_ID,s.Date);
    const actionId=rformContentApiV04Sha256Hex_('TRAINING_DRAFT_V1\n'+s.Session_ID).slice(0,32);
    const records=rformContentApiV04WorkspaceRecords_(c);
    if(records.some(function(r) {return r.Action_ID===actionId;})) {blocked.push({session_id:s.Session_ID,reason:'CHECK_PRIOR_OUTCOME'});return;}
    const item={Content_ID:id,Session_ID:s.Session_ID,Date:s.Date,Rubric:'TRAINING_LOG',
      Main_Training_Fact:s.Main_Result,Decision:s.Session_Decision,Public_Data_Allowed:'YES',
      Source_Packet_Status:'READY',Text_Status:'READY',Visual_Status:'NOT_REQUIRED',Approval_Status:'NOT_READY',
      Publication_Status:'PLANNED',Pipeline_Status:'READY · OWNER DRAFT',Current_Stage:'OWNER_FINAL_PREVIEW',
      Telegram_Text:text,Telegram_Post_Mode:'TEXT_ONLY',Telegram_Chat_ID:'@r_form',
      AutoPost_Allowed:'NO',Publish_At:'',Preview_Review_Status:'NOT_REVIEWED',
      Proof_Source:'TRAINING_SESSIONS / '+s.Session_ID+' / COVERS:'+s.Session_ID,
      Updated_At:Utilities.formatDate(new Date(),'Europe/Moscow','dd.MM.yyyy HH:mm:ss'),
      Created_At:Utilities.formatDate(new Date(),'Europe/Moscow','dd.MM.yyyy HH:mm:ss')};
    if(cardsEnabled) {
      item.Visual_Status='READY';item.Telegram_Post_Mode='PHOTO_CAPTION';
      item.Telegram_Visual_URL='';item.Visual_URL='';
    }
    Object.keys(item).forEach(function(f) {if(!c.map[f]) throw new Error('Missing training draft field: '+f);});
    c.records=null; c.log.appendRow([actionId,new Date(),id,'AUTO_TRAINING_DRAFT',s.Session_ID,Object.keys(item).join(','),
      '{}',JSON.stringify(Object.assign({},item,{_meta:{training_hash:rformContentApiV04TrainingHash_(s),sets_hash:packet?packet.sets_hash:null}})),'TRAINING_DRAFT_WORKER',request.nonce || '','PENDING']);
    const lr=c.log.getLastRow();
    try {
      if(cardsEnabled) {
        const manifest=rformContentApiV04CardAssets_(packet,actionId);
        if(packet.sets_hash!==rformContentApiV04CardHash_(rformContentApiV04CardRows_(c.ss,s.Session_ID)))throw new Error('Подходы изменились при подготовке карточки.');
        const fresh=rformContentApiV04ReadRows_(rformContentApiV04RequireSheet_(c.ss,RFORM_CONTENT_API_V04.trainingSessionsSheet),
          RFORM_CONTENT_API_V04.trainingSessionFields.concat(['Completed_At','Duplicate_Flag']),'Session_ID').filter(function(r){return r.Session_ID===s.Session_ID;});
        if(fresh.length!==1 || rformContentApiV04TrainingHash_(fresh[0])!==rformContentApiV04TrainingHash_(s))throw new Error('Тренировка изменилась при подготовке карточки.');
        item.Telegram_Visual_URL=manifest.url;item.Visual_URL=manifest.url;
        item.Telegram_Post_Mode=manifest.count===1?'PHOTO_CAPTION':'ALBUM_CAPTION';
        c.log.getRange(lr,c.lm.New_Values).setValue(JSON.stringify(Object.assign({},item,{_meta:{training_hash:rformContentApiV04TrainingHash_(s),sets_hash:packet.sets_hash}})));
      }
      const row=new Array(c.queue.getLastColumn()).fill('');
      Object.keys(item).forEach(function(f) {row[c.map[f]-1]="'"+String(item[f]);});
      c.queue.appendRow(row);SpreadsheetApp.flush();
      const qr=rformContentApiV04FindUniqueRow_(c.queue,'Content_ID',id);
      const read=c.queue.getRange(qr,1,1,c.queue.getLastColumn()).getDisplayValues()[0];
      Object.keys(item).forEach(function(f) {if(String(read[c.map[f]-1] || '')!==String(item[f])) throw new Error('Draft readback mismatch');});
      c.log.getRange(lr,c.lm.Result).setValue('APPLIED');c.records=null;SpreadsheetApp.flush();
      if(c.log.getRange(lr,c.lm.Result).getDisplayValue()!=='APPLIED') throw new Error('Audit mismatch');
      created.push(id);queue.push(item);
    } catch(_) {
      try {
        const qr=rformContentApiV04FindOptionalRow_(c.queue,'Content_ID',id);
        if(qr) {
          c.queue.getRange(qr,c.map.Current_Stage).setValue('CHANNEL_CONTROL_REVIEW');
          c.queue.getRange(qr,c.map.Blocking_Issue).setValue('AUTO_DRAFT_OUTCOME_UNKNOWN');
          c.queue.getRange(qr,c.map.AutoPost_Allowed).setValue('NO');
        }
        c.log.getRange(lr,c.lm.Result).setValue('OUTCOME_UNKNOWN');
        SpreadsheetApp.flush();
      } catch(__) {}
      throw new Error('Исход создания черновика неизвестен; автоматический повтор отключён.');
    }
  });
  return {ok:true,status:'APPLIED',created:created,blocked:blocked};
}

function rformContentApiV04TrainingHash_(s) {
  return rformContentApiV04Sha256Hex_(JSON.stringify(RFORM_CONTENT_API_V04.trainingSessionFields.concat(['Completed_At','Duplicate_Flag']).map(function(f) {return String(s[f] || '').trim();})));
}

function rformContentApiV04TrainingFresh_(ss,value) {
  if(!value('Session_ID')) return;
  const log=rformContentApiV04RequireSheet_(ss,RFORM_CONTENT_API_V04.actionLogSheet);
  const c={log:log,lm:rformContentApiV04HeaderMap_(rformContentApiV04Headers_(log))};
  const record=rformContentApiV04WorkspaceRecords_(c).find(function(r) {
    return r.Content_ID===value('Content_ID') && r.Action==='AUTO_TRAINING_DRAFT' && r.Result==='APPLIED';
  });
  if(!record) return; // Existing editorial objects keep their established fact QA.
  const meta=JSON.parse(record.New_Values)._meta;
  const expected=meta.training_hash;
  const sessions=rformContentApiV04ReadRows_(rformContentApiV04RequireSheet_(ss,RFORM_CONTENT_API_V04.trainingSessionsSheet),
    RFORM_CONTENT_API_V04.trainingSessionFields.concat(['Completed_At','Duplicate_Flag']),'Session_ID').filter(function(s) {return s.Session_ID===value('Session_ID');});
  if(sessions.length!==1 || sessions[0].Session_Status!=='CLOSED' ||
    expected!==rformContentApiV04TrainingHash_(sessions[0])) throw new Error('Исходная тренировка изменилась; требуется сверка фактов.');
  if(meta.sets_hash && meta.sets_hash!==rformContentApiV04CardHash_(rformContentApiV04CardRows_(ss,value('Session_ID'))))
    throw new Error('Исходные подходы изменились; требуется пересоздать карточки и сверить факты.');
}

// Channel observations use the existing action log, never another queue or publisher.
const RFORM_CHANNEL = Object.freeze({chatIdProperty:'RFORM_TG_CHAT_ID', username:'r_form'});

function rformContentApiV04ChannelChatId_() {
  const value = String(PropertiesService.getScriptProperties().getProperty(RFORM_CHANNEL.chatIdProperty) || '').trim();
  if (!/^-100\d+$/.test(value)) throw new Error('RFORM_TG_CHAT_ID is missing or invalid.');
  return value;
}

function rformContentApiV04ChannelChatIdOrEmpty_() {
  try { return rformContentApiV04ChannelChatId_(); } catch (_) { return ''; }
}

function rformContentApiV04Archived_(value) {
  return ['ARCHIVED','CANCELLED','SUPERSEDED'].indexOf(value('Publication_Status'))!==-1 ||
    /ARCHIV|SUPERSEDED|CANCELLED|ЗАКРЫТО|ЗАМЕНЕНО/i.test(value('Pipeline_Status')+' '+value('Current_Stage')+' '+value('Text_Status')) ||
    value('Current_Stage')==='EDITORIAL_GATE_CLOSED' || /^TEST-/.test(value('Content_ID'));
}

function rformContentApiV04ChannelPosts_(c) {
  const posts={};
  const channelId=rformContentApiV04ChannelChatIdOrEmpty_();
  rformContentApiV04WorkspaceRecords_(c).forEach(function(r) {
    if(r.Action!=='CHANNEL_POST' || r.Result!=='APPLIED') return;
    let p;try {p=JSON.parse(r.New_Values)._meta;} catch(_) {return;}
    if(!p || p.channel_id!==channelId) return;
    const old=posts[p.message_id];
    if(!old || p.revision>old.revision) posts[p.message_id]=p;
  });
  return posts;
}

function rformContentApiV04ChannelHash_(p) {
  return rformContentApiV04Sha256Hex_(JSON.stringify([p.channel_id,p.message_id,p.date,p.revision,p.text,p.media_group_id,p.media]));
}

function rformContentApiV04ChannelEvent_(c,p) {
  const event=rformContentApiV04ChannelPosts_(c)[String(p.message_id)];
  if(!event || event.hash!==p.event_hash) throw new Error('Факт публикации отсутствует или изменился. Повторите сверку.');
  return event;
}

function rformContentApiV04ChannelRecord_(c,request) {
  const p=request.payload;
  const channelId=rformContentApiV04ChannelChatId_();
  if(String(p.channel_id)!==channelId || !Number.isSafeInteger(p.message_id) || p.message_id<1 ||
    !Number.isSafeInteger(p.date) || p.date<1 || p.date>Date.now()/1000+300 ||
    !Number.isSafeInteger(p.revision) || p.revision<p.date || p.revision>Date.now()/1000+300 ||
    typeof p.text!=='string' || p.text.length>4096 || !Array.isArray(p.media) || p.media.length>10 ||
    p.media.some(function(m){return !m || ['photo','video','document'].indexOf(m.type)===-1 || typeof m.file_id!=='string' || m.file_id.length>200;}))
    throw new Error('Некорректное наблюдение канала.');
  const event={channel_id:channelId,message_id:p.message_id,date:p.date,revision:p.revision,
    text:p.text,media_group_id:String(p.media_group_id || '').slice(0,100),media:p.media,
    post_url:'https://t.me/'+RFORM_CHANNEL.username+'/'+p.message_id};
  event.hash=rformContentApiV04ChannelHash_(event);
  const prior=rformContentApiV04WorkspaceRecords_(c).find(function(r){return r.Action_ID===request.action_id;});
  if(prior) {
    if(prior.Action!=='CHANNEL_POST' || prior.Result!=='APPLIED' || JSON.parse(prior.New_Values)._meta.hash!==event.hash)
      throw new Error('Исход наблюдения не подтверждён или Action_ID занят.');
    return {ok:true,status:'ALREADY_APPLIED',event:event};
  }
  const old=rformContentApiV04ChannelPosts_(c)[p.message_id];
  if(old && old.hash===event.hash) return {ok:true,status:'ALREADY_OBSERVED',event:old};
  if(old && old.revision>event.revision) return {ok:true,status:'STALE_OBSERVATION',event:old};
  if(old && old.revision===event.revision) {
    if(old.text===event.text && old.date===event.date) return {ok:true,status:'ALREADY_OBSERVED',event:old};
    throw new Error('Конфликт версий публикации; требуется сверка.');
  }
  c.records=null; c.log.appendRow([request.action_id,new Date(),'CHANNEL-'+p.message_id,'CHANNEL_POST',event.hash,'',
    JSON.stringify(old || {}),JSON.stringify({_meta:event}),'CHANNEL_OBSERVER',request.nonce || '','PENDING']);
  const lr=c.log.getLastRow();SpreadsheetApp.flush();
  if(JSON.parse(c.log.getRange(lr,c.lm.New_Values).getDisplayValue())._meta.hash!==event.hash) throw new Error('Observation readback mismatch');
  c.log.getRange(lr,c.lm.Result).setValue('APPLIED');c.records=null;SpreadsheetApp.flush();
  if(c.log.getRange(lr,c.lm.Result).getDisplayValue()!=='APPLIED') throw new Error('Observation audit mismatch');
  // Recording an observation never mutates CONTENT_QUEUE. Existing Poll resolves exact matches.
  return {ok:true,status:'APPLIED',event:event};
}

function rformContentApiV04ChannelNormalize_(s) {
  // Preserve punctuation and numbers: only whitespace is ignored for automatic matches.
  return String(s || '').trim().replace(/\s+/g,' ');
}

function rformContentApiV04ChannelScore_(a,b) {
  const tokens=function(s){return new Set(String(s || '').toLowerCase().match(/[а-яёa-z0-9]{3,}/g) || []);};
  const x=tokens(a),y=tokens(b);if(!x.size || !y.size) return 0;
  let common=0;x.forEach(function(t){if(y.has(t))common++;});
  return common>=6?common/Math.min(x.size,y.size):0;
}

function rformContentApiV04ChannelReview_(c) {
  const posts=rformContentApiV04ChannelPosts_(c),records=rformContentApiV04WorkspaceRecords_(c);
  const linked=new Set(),dismissed=new Set();
  records.forEach(function(r) {
    if(r.Result!=='APPLIED' || ['OWNER_LINK_PUBLICATION','OWNER_ARCHIVE','CHANNEL_DISMISS'].indexOf(r.Action)===-1) return;
    let m;try {m=JSON.parse(r.New_Values)._meta;} catch(_) {return;}
    if(m && m.event_hash) (r.Action==='CHANNEL_DISMISS'?dismissed:linked).add(m.event_hash);
  });
  const rows=c.queue.getLastRow()<2?[]:c.queue.getRange(2,1,c.queue.getLastRow()-1,c.queue.getLastColumn()).getDisplayValues();
  rows.forEach(function(r){const id=String(r[c.map.Telegram_Message_ID-1] || '');if(posts[id] && r[c.map.Publication_Status-1]==='PUBLISHED') linked.add(posts[id].hash);});
  return Object.keys(posts).map(function(id){return posts[id];}).filter(function(p){return p.text.trim() && !linked.has(p.hash) && !dismissed.has(p.hash);})
    .map(function(p) {
      const candidates=rows.map(function(raw,i) {
        const v=function(f){return String(raw[c.map[f]-1] || '').trim();};
        if(rformContentApiV04Archived_(v) || ['PLANNED','NOT_READY','HOLD'].indexOf(v('Publication_Status'))===-1) return null;
        const text=v('Telegram_Text');
        const exact=text.length>=80 && rformContentApiV04ChannelNormalize_(text)===rformContentApiV04ChannelNormalize_(p.text);
        const score=rformContentApiV04ChannelScore_(text,p.text);
        return (exact || score>=0.55)?{content_id:v('Content_ID'),title:text.split('\n')[0],row:i+2,source_hash:rformContentApiV04WorkspaceHash_(v),exact:exact,score:score}:null;
      }).filter(Boolean).sort(function(a,b){return Number(b.exact)-Number(a.exact) || b.score-a.score;});
      return {event:p,candidates:candidates.slice(0,3),exact_count:candidates.filter(function(q){return q.exact;}).length};
    }).sort(function(a,b){return b.event.date-a.event.date;});
}

function rformContentApiV04ReconcileChannel_(c,request) {
  const applied=[],blocked=[];
  rformContentApiV04ChannelReview_(c).filter(function(r){return r.exact_count===1;}).slice(0,3).forEach(function(r) {
    const match=r.candidates[0],raw=c.queue.getRange(match.row,1,1,c.queue.getLastColumn()).getDisplayValues()[0];
    const v=function(f){return String(raw[c.map[f]-1] || '').trim();};
    try {rformContentApiV04WorkspaceMutable_(v);} catch(_) {return;}
    const aid=rformContentApiV04Sha256Hex_('EXACT\n'+match.content_id+'\n'+r.event.hash).slice(0,32);
    const prior=rformContentApiV04WorkspaceRecords_(c).find(function(log){return log.Action_ID===aid;});
    if(prior) {if(prior.Result!=='APPLIED')blocked.push(match.content_id);return;} // Never replay uncertain writes.
    const derived={action_id:aid,content_id:match.content_id,source_hash:match.source_hash,nonce:request.nonce,
      payload:{action:'link_publication',message_id:r.event.message_id,event_hash:r.event.hash,automatic:true}};
    applied.push(rformContentApiV04LinkPublication_(c,derived,match.row,v,r.event));
  });
  return {ok:true,applied:applied,blocked:blocked};
}

function rformContentApiV04LinkPublication_(c,request,row,value,event) {
  // Preserve the prepared draft and private assets; published edition lives in the audited observation.
  const id=String(event.message_id);
  const rows=c.queue.getLastRow()<2?[]:c.queue.getRange(2,1,c.queue.getLastRow()-1,c.queue.getLastColumn()).getDisplayValues();
  if(rows.some(function(r,i){return i+2!==row && String(r[c.map.Telegram_Message_ID-1] || '')===id;})) throw new Error('Публикация уже связана с другим материалом.');
  return rformContentApiV04WorkspaceCommit_(c,request,row,'OWNER_LINK_PUBLICATION',{
    Publication_Status:'PUBLISHED',Pipeline_Status:'PUBLISHED · MANUAL RECONCILED',Current_Stage:'PUBLISHED',
    Approval_Status:'NOT_READY',AutoPost_Allowed:'NO',Publish_At:'',Preview_Review_Status:'NOT_REQUIRED',
    Preview_Review_Hash:'',Preview_Reviewed_At:'',Preview_Reviewed_By:'',
    Telegram_Message_ID:id,Telegram_Post_URL:event.post_url,
    Posted_At:Utilities.formatDate(new Date(event.date*1000),'Europe/Moscow','dd.MM.yyyy HH:mm:ss'),
    Updated_At:Utilities.formatDate(new Date(),'Europe/Moscow','dd.MM.yyyy HH:mm:ss')
  },{event_hash:event.hash,message_id:event.message_id,post_url:event.post_url,automatic:!!request.payload.automatic,
    draft_text:value('Telegram_Text'),published_text:event.text});
}

function rformContentApiV04ArchiveAction_(c,request,row,value) {
  const p=request.payload,archived=rformContentApiV04Archived_(value);
  if(['PLANNED','NOT_READY','HOLD','ARCHIVED','CANCELLED','SUPERSEDED'].indexOf(value('Publication_Status'))===-1 ||
    value('AutoPost_Allowed')!=='NO' || value('Publish_At') || value('Telegram_Message_ID') || value('Telegram_Post_URL') || value('Posted_At') ||
    value('Publish_Error')) throw new Error('Материал имеет публикацию, расписание или неопределённый исход.');
  const now=Utilities.formatDate(new Date(),'Europe/Moscow','dd.MM.yyyy HH:mm:ss');
  const updates={Approval_Status:'NOT_READY',AutoPost_Allowed:'NO',Publish_At:'',Preview_Review_Status:'RECHECK_REQUIRED',
    Preview_Review_Hash:'',Preview_Reviewed_At:'',Preview_Reviewed_By:'',Updated_At:now};
  if(p.action==='restore') {
    if(!archived || /^TEST-/.test(value('Content_ID')) || value('Duplicate_Flag')) throw new Error('Нельзя восстановить эту запись.');
    if(value('Text_Status')==='SUPERSEDED') updates.Text_Status=value('Telegram_Text')?'READY':'NOT_READY';
    return rformContentApiV04WorkspaceCommit_(c,request,row,'OWNER_RESTORE',Object.assign(updates,{
      Publication_Status:'PLANNED',Pipeline_Status:'REWORK',Current_Stage:'CHANNEL_CONTROL_REVIEW'
    }),{reason:'MANUAL_RESTORE'});
  }
  if(archived) throw new Error('Материал уже в архиве.');
  if(['CANCELLED_BY_OWNER','REPLACED_BY_POST','STALE','TECHNICAL_TEST'].indexOf(p.reason)===-1) throw new Error('Укажите причину архива.');
  if(p.reason==='TECHNICAL_TEST' && !/^TEST-/.test(value('Content_ID'))) throw new Error('Это не техническая запись.');
  const event=p.reason==='REPLACED_BY_POST'?rformContentApiV04ChannelEvent_(c,p):null;
  return rformContentApiV04WorkspaceCommit_(c,request,row,'OWNER_ARCHIVE',Object.assign(updates,{
    Publication_Status:event?'SUPERSEDED':'CANCELLED',Pipeline_Status:'ARCHIVED',Current_Stage:'ARCHIVED'
  }),{reason:p.reason,event_hash:event?event.hash:null,post_url:event?event.post_url:null});
}

// Authenticated receipt lookup; never modifies queue, audit or publication state.
function rformContentApiV04ActionStatus_(request) {
  rformContentApiV04RequireActionId_(String(request.action_id || ''));
  const records=rformContentApiV04WorkspaceRecords_(rformContentApiV04WorkspaceContext_());
  const found=records.filter(function(r){return r.Action_ID===request.action_id;});
  if(found.length>1) return {ok:true,status:'OUTCOME_UNKNOWN',action_id:request.action_id};
  if(!found.length) return {ok:true,status:'NOT_FOUND',action_id:request.action_id};
  const r=found[0];
  if(String(r.Content_ID)!==String(request.content_id || '')) throw new Error('Action_ID относится к другому материалу.');
  return {ok:true,status:r.Result,action_id:r.Action_ID,content_id:r.Content_ID,at:r.Timestamp};
}

function rformContentApiV04Held_(value) {
  return value('Publication_Status')==='HOLD' || /HOLD|ПАУЗА/i.test(value('Pipeline_Status'));
}

// Operator bridge for the existing ChatGPT executor. No key, provider or trigger.
// A bounded proposal packet is staged as a Script Property; canonical commit
// still goes through Workspace_ and its freshness/idempotency/audit checks.
function rformContentApiV04SubmitChatGPTProposal() {
  const props=PropertiesService.getScriptProperties(),key='RFORM_CHATGPT_PROPOSAL';
  const raw=props.getProperty(key);
  if(!raw) return {ok:true,status:'NO_PACKET',publication_enabled:false};
  if(Utilities.newBlob(raw).getBytes().length>8500) throw new Error('Пакет предложения превышает лимит.');
  const p=JSON.parse(raw),fields=['content_id','source_hash','request_id','text'];
  if(Object.keys(p).some(function(k){return fields.indexOf(k)===-1;}) ||
    fields.some(function(k){return typeof p[k]!=='string' || !p[k].trim();})) throw new Error('Некорректный пакет предложения.');
  rformContentApiV04RequireRecordId_(p.content_id,'Код материала');
  if(!/^[a-f0-9]{32}$/.test(p.request_id) || !/^[a-f0-9]{64}$/.test(p.source_hash)) throw new Error('Некорректная идентичность предложения.');
  const actionId=rformContentApiV04Sha256Hex_('CHATGPT_PROPOSAL_V1\n'+JSON.stringify(p)).slice(0,32);
  const result=rformContentApiV04Workspace_({action_id:actionId,content_id:p.content_id,source_hash:p.source_hash,
    nonce:'CHATGPT_OPERATOR',payload:{action:'ai_proposal',request_id:p.request_id,text:p.text}});
  const ai=(rformContentApiV04WorkspaceMeta_()[p.content_id] || {}).ai;
  if(!ai || ai.proposal_id!==actionId || ai.request_id!==p.request_id || ai.text!==p.text.trim()) throw new Error('Предложение не подтверждено чтением. Пакет сохранён.');
  // Do not clear a different operator's newer packet.
  if(props.getProperty(key)===raw) props.deleteProperty(key);
  console.log(JSON.stringify({event:'CHATGPT_PROPOSAL_APPLIED',content_id:p.content_id,action_id:actionId,publication_enabled:false}));
  return {ok:true,status:result.status,content_id:p.content_id,action_id:actionId,publication_enabled:false};
}

// Server-side deterministic indexed PNG: no external image service or new OAuth scopes.
const RFORM_CARD_SET_FIELDS = Object.freeze(['Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original',
  'Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR',
  'Record_Key','Duplicate_Flag','Exercise_Instance_ID','Load_Value','Load_Unit']);

function rformContentApiV04CardRows_(ss,id) {
  const sheet=rformContentApiV04RequireSheet_(ss,'TRAINING_SETS');
  // Older planned rows leave optional load/instance columns blank, but the schema includes them.
  return rformContentApiV04ReadRows_(sheet,RFORM_CARD_SET_FIELDS,'Session_ID').filter(function(r){return r.Session_ID===id;});
}
function rformContentApiV04CardHash_(rows) {
  const normalized=rows.map(function(r){return RFORM_CARD_SET_FIELDS.map(function(f){return String(r[f]||'').trim();});});
  normalized.sort(function(a,b){return JSON.stringify(a).localeCompare(JSON.stringify(b));});
  return rformContentApiV04Sha256Hex_(JSON.stringify(normalized));
}
function rformContentApiV04CardPacket_(s,rows) {
  if(!rows.length) throw new Error('Нет фактических подходов TRAINING_SETS.');
  const paired=['CHEST_SUPPORTED_DUMBBELL_ROW','DUMBBELL_CHEST_FLY','DUMBBELL_REAR_DELT_FLY'];
  const bench=['COMPETITION_BENCH_PRESS','BARBELL_BENCH_PRESS','PAUSED_BENCH_PRESS','CLOSE_GRIP_BENCH_PRESS'];
  const groups={},ids={},keys={};let total=0,benchTotal=0,count=0,hasPair=false,externalOnly=false;
  function number(value,zero) {
    const raw=String(value).trim().replace(',','.');
    if(!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error('Нет корректного веса/повторений.');
    const n=Number(raw);if(!Number.isFinite(n) || (zero?n<0:n<=0)) throw new Error('Неверный вес/повторения.');return n;
  }
  rows.forEach(function(r){
    if(!r.Set_ID || ids[r.Set_ID] || (r.Record_Key && keys[r.Record_Key]) || /^(YES|TRUE|1|DUPLICATE|ДА)$/i.test(r.Duplicate_Flag||''))
      throw new Error('Дубли подходов: требуется сверка.');
    ids[r.Set_ID]=true;if(r.Record_Key)keys[r.Record_Key]=true;
    const type=String(r.Set_Type).toUpperCase();
    if(type==='WARMUP')return;
    if(['WORKING','ACCESSORY'].indexOf(type)===-1)throw new Error('Неизвестный тип подхода.');
    const name=String(r.Exercise_Name_Original||'').trim(),code=String(r.Exercise_Name_Normalized||'').trim();
    if(!name || !code)throw new Error('Упражнение не определено.');
    const reps=number(r.Reps,false);if(!Number.isInteger(reps)||reps>1000)throw new Error('Некорректные повторения.');
    const order=number(r.Exercise_Order,false),setNumber=number(r.Set_Number,false);
    if(!Number.isInteger(order)||!Number.isInteger(setNumber))throw new Error('Некорректный порядок подходов.');
    const unit=String(r.Load_Unit||'').trim().toUpperCase();
    const weight=number(r.Load_Value!=='' && r.Load_Value!==undefined?r.Load_Value:r.Weight_Kg,true);
    if(weight>1000)throw new Error('Вес превышает допустимый диапазон.');
    if(r.Load_Value!=='' && r.Load_Value!==undefined && r.Weight_Kg!=='' && ['KG','KG_TOTAL','KG_PER_HAND','KG_ADDITIONAL'].indexOf(unit)!==-1 && weight!==number(r.Weight_Kg,true))
      throw new Error('Load_Value и Weight_Kg расходятся.');
    if(/BODYWEIGHT|PULLUP|CHINUP|PUSHUP|DIP/.test(code) && unit!=='KG_ADDITIONAL')throw new Error('Для упражнения с весом тела укажите дополнительный вес в KG_ADDITIONAL.');
    let factor=1;
    if(unit==='KG_PER_HAND'){if(!/DUMBBELL/.test(code))throw new Error('Единица для гантелей не соответствует упражнению.');factor=2;}
    else if(unit==='KG_ADDITIONAL')externalOnly=true;
    else if(unit && ['KG','KG_TOTAL'].indexOf(unit)===-1)throw new Error('Неизвестная единица нагрузки: '+unit);
    else if(/DUMBBELL/.test(code)) {
      if(unit==='KG_TOTAL')factor=1;
      else if(paired.indexOf(code)!==-1)factor=2; // Confirmed R/Form convention: one dumbbell in these bilateral exercises.
      else throw new Error('Уточните вес гантелей: один снаряд или оба.');
    } else if(!unit && !/BARBELL|BENCH_PRESS|DEADLIFT/.test(code))throw new Error('Уточните единицы нагрузки упражнения.');
    if(factor===2)hasPair=true;
    const tonnage=weight*factor*reps;total+=tonnage;if(bench.indexOf(code)!==-1)benchTotal+=tonnage;
    const key=String(order)+'/'+String(r.Exercise_Instance_ID||code);
    if(!groups[key])groups[key]={order:order,name:name,code:code,sets:[],numbers:{}};
    const g=groups[key];if(g.name!==name||g.code!==code||g.numbers[setNumber])throw new Error('Конфликт упражнения/номеров подходов.');
    g.numbers[setNumber]=true;
    const rir=String(r.RIR||'').trim();if(rir && (!/^\d+(?:[.,]\d+)?$/.test(rir)||Number(rir.replace(',','.'))>20))throw new Error('Некорректный RIR.');
    g.sets.push({number:setNumber,weight:weight,reps:reps,rir:rir||'—',factor:factor});count++;
  });
  if(!count)throw new Error('Нет рабочих подходов.');
  const exercises=Object.keys(groups).map(function(k){const g=groups[k];g.sets.sort(function(a,b){return a.number-b.number;});return g;})
    .sort(function(a,b){return a.order-b.order;});
  const seenOrders={};exercises.forEach(function(g){if(seenOrders[g.order])throw new Error('Конфликт порядка упражнений.');seenOrders[g.order]=true;});
  if(exercises.length>50||count>200)throw new Error('Отчёт превышает лимит карточек.');
  return {session_id:s.Session_ID,date:s.Date,type:s.Session_Type,duration:s.Actual_Duration,
    exercises:exercises,count:count,bench:Math.round(benchTotal*100)/100,total:Math.round(total*100)/100,
    paired:hasPair,all_dumbbells_per_hand:exercises.every(function(g){return !/DUMBBELL/.test(g.code)||g.sets.every(function(t){return t.factor===2;});}),external_only:externalOnly,sets_hash:rformContentApiV04CardHash_(rows)};
}
function rformContentApiV04CardNumber_(n){return String(n).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,' ');}
function rformContentApiV04CardCaption_(p) {
  return p.date+' · Тренировка '+p.type+'\n\n'+(p.duration?p.duration+' минут. ':'')+'Записано рабочих подходов: '+p.count+'.\n\n'+
    'Тоннаж жима: '+rformContentApiV04CardNumber_(p.bench)+' кг.\nОбщий тоннаж тренировки: '+rformContentApiV04CardNumber_(p.total)+' кг.\n\n'+
    'Полный список упражнений, веса, повторения и RIR — на карточках.\n\n'+
    'Тоннаж = вес снарядов × повторения. Разминка и масса тела не учитываются.'+
    (p.paired?' В упражнениях с двумя гантелями учтены оба снаряда.':'')+
    (p.external_only?' Для упражнений с весом тела учтён только дополнительный вес.':'')+'\n\n#RForm_Training';
}
function rformContentApiV04CardFacts_(g) {
  const parts=[];g.sets.forEach(function(s){
    const value=rformContentApiV04CardNumber_(s.weight)+' кг × '+s.reps;
    const last=parts[parts.length-1];if(last && last.value===value && last.factor===s.factor)last.count++;
    else parts.push({value:value,count:1,factor:s.factor});
  });
  return parts.map(function(p){return p.value+(p.count>1?' × '+p.count:'');}).join('; ');
}
// Palette slots 0..15 white, 16..31 steel, 32..47 green on carbon.
function rformContentApiV04CardPalette_(){
  const bg=[11,16,22],ends=[[242,245,247],[127,168,188],[111,155,132]],p=[];
  ends.forEach(function(end){for(let i=0;i<16;i++)for(let c=0;c<3;c++)p.push(Math.round(bg[c]+(end[c]-bg[c])*i/15));});
  p.push(41,64,78);return p;
}
function rformContentApiV04CardWidth_(s,font){
  let w=0;Array.from(s).forEach(function(ch){const g=RFORM_CARD_FONT[font][ch];if(!g)throw new Error('Неподдерживаемый символ: '+ch);w+=g[0];});return w;
}
function rformContentApiV04CardWrap_(s,font,width){
  const lines=[];let line='';String(s).split(/\s+/).forEach(function(word){
    if(rformContentApiV04CardWidth_(word,font)>width)throw new Error('Слишком длинное слово на карточке.');
    const trial=line?line+' '+word:word;
    if(line && rformContentApiV04CardWidth_(trial,font)>width){lines.push(line);line=word;}else line=trial;
  });if(line)lines.push(line);return lines;
}
function rformContentApiV04CardPages_(p){
  const pages=[];let blocks=[],height=265;
  p.exercises.forEach(function(g,i){
    const title=rformContentApiV04CardWrap_((i+1)+'. '+g.name,'title',870);
    const fact=rformContentApiV04CardWrap_('ФАКТ  '+rformContentApiV04CardFacts_(g),'detail',870);
    const rir=rformContentApiV04CardWrap_('RIR  '+g.sets.map(function(s){return s.rir;}).join(' / '),'detail',870);
    const h=60+title.length*48+24+fact.length*43+rir.length*43+20;
    if(h>1900)throw new Error('Упражнение превышает размер карточки.');
    if(blocks.length && height+h+145>2450){pages.push({blocks:blocks,height:height+145});blocks=[];height=265;}
    blocks.push({title:title,fact:fact,rir:rir,y:height,h:h});height+=h+24;
  });pages.push({blocks:blocks,height:height+145});
  if(pages.length>10 || pages.reduce(function(n,page){return n+1080*page.height;},0)>14*1024*1024)throw new Error('Пакет изображений превышает лимит.');
  return pages;
}
function rformContentApiV04CardPng_(p,page,index,pageCount){
  const w=1080,h=page.height,pixels=new Uint8Array(w*h),cache={};
  function pixel(x,y,color){if(x>=0&&x<w&&y>=0&&y<h)pixels[y*w+x]=color;}
  function rect(x,y,rw,rh,color,thickness){for(let t=0;t<thickness;t++){
    for(let a=x+t;a<x+rw-t;a++){pixel(a,y+t,color);pixel(a,y+rh-t-1,color);}
    for(let b=y+t;b<y+rh-t;b++){pixel(x+t,b,color);pixel(x+rw-t-1,b,color);}
  }}
  function text(s,x,y,font,color){Array.from(s).forEach(function(ch){
    const g=RFORM_CARD_FONT[font][ch];if(!g)throw new Error('Неподдерживаемый символ.');
    const key=font+'/'+ch;let glyph=cache[key];
    if(!glyph){glyph=new Uint8Array(g[3]*g[4]);const runs=Utilities.base64Decode(g[5]);let n=0;
      for(let i=0;i<runs.length;i+=2){const len=runs[i]&255,val=runs[i+1]&255;glyph.fill(val,n,n+len);n+=len;}cache[key]=glyph;}
    for(let gy=0;gy<g[4];gy++)for(let gx=0;gx<g[3];gx++){const v=glyph[gy*g[3]+gx];if(v)pixel(x+g[1]+gx,y+g[2]+gy,color+v);}
    x+=g[0];
  });}
  rect(24,24,1032,h-42,48,2);
  text('R/FORM · TRAINING LOG',60,55,'small',16);
  text('ТРЕНИРОВКА '+p.type,60,105,'heading',0);
  const subtitle=p.date+(p.duration?' · '+p.duration+' минут':'')+' · '+p.count+' подходов';
  text(subtitle,60,185,'small',16);
  page.blocks.forEach(function(b){rect(55,b.y,970,b.h,47,3);let y=b.y+25;
    b.title.forEach(function(line){text(line,82,y,'title',0);y+=48;});y+=24;
    b.fact.forEach(function(line){text(line,82,y,'detail',0);y+=43;});
    b.rir.forEach(function(line){text(line,82,y,'detail',16);y+=43;});
  });
  text(p.paired && p.all_dumbbells_per_hand?'Вес гантелей — для одного снаряда.':'Тоннаж и метод расчёта — в подписи.',60,h-122,'small',16);
  text('R/Form by Rulev Denis · '+(index+1)+'/'+pageCount,60,h-75,'small',16);
  return rformContentApiV04PngBytes_(w,h,pixels,rformContentApiV04CardPalette_());
}
function rformContentApiV04PngBytes_(w,h,pixels,palette){
  function u32(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
  const crcTable=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
  function chunk(type,data){
    const out=new Uint8Array(data.length+12);out.set(u32(data.length));
    for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);out.set(data,8);
    let crc=0xffffffff;for(let i=4;i<data.length+8;i++)crc=crcTable[(crc^out[i])&255]^(crc>>>8);
    out.set(u32((crc^0xffffffff)>>>0),out.length-4);return out;
  }
  const raw=new Uint8Array((w+1)*h);for(let y=0;y<h;y++)raw.set(pixels.subarray(y*w,(y+1)*w),y*(w+1)+1);
  // Stored DEFLATE blocks: no third-party library, network call or authorization.
  const z=new Uint8Array(raw.length+Math.ceil(raw.length/65535)*5+6);z.set([0x78,0x01]);let pos=2,a=1,b=0;
  for(let offset=0;offset<raw.length;offset+=65535){const len=Math.min(65535,raw.length-offset),last=offset+len===raw.length;
    z.set([last?1:0,len&255,len>>>8,(~len)&255,((~len)>>>8)&255],pos);pos+=5;
    z.set(raw.subarray(offset,offset+len),pos);pos+=len;
    for(let j=0;j<len;j++){a=(a+raw[offset+j])%65521;b=(b+a)%65521;}
  }
  z.set(u32(((b<<16)|a)>>>0),pos);
  const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',u32(w).concat(u32(h),[8,3,0,0,0])),chunk('PLTE',palette),chunk('IDAT',z),chunk('IEND',[])];
  const result=new Uint8Array(chunks.reduce(function(n,c){return n+c.length;},0));pos=0;
  chunks.forEach(function(c){result.set(c,pos);pos+=c.length;});
  return Array.from(result,function(n){return n>127?n-256:n;});
}
function rformContentApiV04CardAssets_(p,actionId){
  const pages=rformContentApiV04CardPages_(p),blobs=pages.map(function(page,i){
    const bytes=rformContentApiV04CardPng_(p,page,i,pages.length);
    if(bytes.length>RFORM_CONTENT_API_V04.maxPublicationVisualBytes)throw new Error('Карточка превышает лимит файла.');
    return Utilities.newBlob(bytes,'image/png','card-'+String(i+1).padStart(2,'0')+'_v01.png');
  });
  const folder=DriveApp.getFolderById(RFORM_CONTENT_API_V04.assetsRootFolderId).createFolder('AUTO_CARD_'+actionId);
  const files=blobs.map(function(blob){const f=folder.createFile(blob);
    if(f.getSize()!==blob.getBytes().length || rformContentApiV04Sha256BytesHex_(f.getBlob().getBytes())!==rformContentApiV04Sha256BytesHex_(blob.getBytes()))throw new Error('Не подтверждено сохранение карточки.');return f;});
  return {url:folder.getUrl(),count:files.length};
}
function rformContentApiV04EnableTrainingCards(){
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('RFORM_AUTO_DRAFT_ENABLED')!=='YES' || !props.getProperty('RFORM_AUTO_DRAFT_BASELINE'))throw new Error('Сначала требуется действующий baseline автоматических черновиков.');
  rformContentApiV04CardRows_(SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId),'__SCHEMA_CHECK__');
  props.setProperty('RFORM_AUTO_CARDS_ENABLED','YES');
  const result={ok:props.getProperty('RFORM_AUTO_CARDS_ENABLED')==='YES',version:RFORM_CONTENT_API_V04.version,
    automatic_cards:true,publication_enabled:false,baseline_preserved:true};console.log(JSON.stringify(result));return result;
}
function rformContentApiV04TrainingCardsSelfCheck(){
  const ss=SpreadsheetApp.openById(RFORM_CONTENT_API_V04.spreadsheetId);
  const sessions=rformContentApiV04ReadRows_(rformContentApiV04RequireSheet_(ss,'TRAINING_SESSIONS'),RFORM_CONTENT_API_V04.trainingSessionFields,'Session_ID');
  const s=sessions.filter(function(r){return r.Session_ID==='S-20261009-C';});if(s.length!==1)throw new Error('Контрольная тренировка не уникальна.');
  const p=rformContentApiV04CardPacket_(s[0],rformContentApiV04CardRows_(ss,s[0].Session_ID));
  if(p.count!==14||p.exercises.length!==5||p.bench!==1920||p.total!==8610)throw new Error('Контрольный тоннаж расходится.');
  const manifest=rformContentApiV04CardAssets_(p,'SELF_CHECK_'+p.sets_hash.slice(0,16));
  const result={ok:true,version:RFORM_CONTENT_API_V04.version,count:p.count,exercises:p.exercises.length,bench_kg:p.bench,total_kg:p.total,
    cards:manifest.count,private_visual_url:manifest.url,queue_changed:false,publication_enabled:false};console.log(JSON.stringify(result));return result;
}

// DejaVu Sans raster glyphs; font license in automation/post_templates/fonts/LICENSE-DejaVu.txt.
const RFORM_CARD_FONT = {"small":{" ":[9,0,26,9,0,""],"!":[11,0,6,11,20,"BAABDgEPAQsIAAEOAQ8BCwgAAQ4BDwELCAABDgEPAQsIAAEOAQ8BCwgAAQ4BDwELCAABDgEPAQsIAAEOAQ8BCwgAAQ4BDwELCAABDgEPAQsIAAENAQ8BCggAAQwBDwEJCAABCwEPAQgIAAEKAQ8BCCkAAQ4BDwELCAABDgEPAQsIAAEOAQ8BCwQA"],"\"":[12,0,6,12,20,"AgABBgEPAQ0CAAEGAQ8BDAQAAQYBDwENAgABBgEPAQwEAAEGAQ8BDQIAAQYBDwEMBAABBgEPAQ0CAAEGAQ8BDAQAAQYBDwENAgABBgEPAQwEAAEGAQ8BDQIAAQYBDwEMBAABBgEPAQ0CAAEGAQ8BDJ4A"],"#":[23,0,8,23,18,"CQABBwEPAQoDAAEHAQ8BCg4AAQsBDwEGAwABCwEPAQYOAAEOAQ8BAgIAAQECDwECDQABBAEPAQ0DAAEEAQ8BDQ4AAQgBDwEJAwABCAEPAQkJAAEGEA8BCAUAAQYQDwEICQABBQEPAQwDAAEFAQ8BDA4AAQkBDwEIAwABCQEPAQgOAAENAQ8BBAMAAQ0BDwEEDQABAgEPAQ4DAAECAQ8BDgoAAQ4QDwYAAQ4QDwoAAQ4BDwEDAwABDgEPAQMNAAEDAQ8BDgMAAQMBDwEODgABBwEPAQoDAAEHAQ8BCg4AAQsBDwEGAwABCwEPAQUNAAEBAg8BAgIAAQECDwEBCQA="],"$":[17,0,6,17,24,"BwABAwEPAQIOAAEDAQ8BAg4AAQMBDwECCwABAgEIAQwBDgIPAQ0BCgEGAQEGAAEGCQ8BCwUAAQMCDwEMAQUBBAEPAgMBBQEJAQoFAAEJAQ8BDgEBAQABAwEPAQIJAAELAQ8BCwIAAQMBDwECCQABCwEPAQ0CAAEDAQ8BAgkAAQcCDwEJAQEBAwEPAQIJAAEBAQwDDwENAQ8BBwEDCQABAQEJAQ4FDwEOAQgBAQgAAQEBBQEJBQ8BDAEBCQABAwEPAQIBAwELAg8BCQkAAQMBDwECAgABDAEPAQ0JAAEDAQ8BAgIAAQgBDwEOCQABAwEPAQICAAEMAQ8BCwQAAgoBBQECAQEBAwEPAQMBBQEMAg8BBQQAAQwKDwEHBQABAQEFAQkBDAENAg8BDgEMAQgBAgsAAQMBDwECDgABAwEPAQIOAAEDAQ8BAg4AAQMBDwECBwA="],"%":[26,0,6,26,20,"AwABAwELAg4BCwEECAABBgEPAQsIAAEEBg8BBQYAAQEBDgEPAQIIAAENAQ8BCgICAQoBDwEOAQEFAAEJAQ8BCAgAAQQBDwEOAQEDAAEOAQ8BBQQAAQMBDwENCQABBwEPAQsEAAEJAQ8BCAQAAQwBDwEECQABCAEPAQkEAAEIAQ8BCQMAAQcBDwEKCgABBwEPAQsEAAEJAQ8BCAIAAQICDgEBCgABBAEPAQ4BAQMAAQ0BDwEFAgABCgEPAQYMAAENAQ8BCgICAQkBDwEOAQEBAAEFAQ8BDA0AAQQGDwEFAQABAQENAQ8BAwIAAQcBDQEPAQ4BCQEBBgABBAELAg4BCwEEAgABCAEPAQkCAAEKBQ8BDQEBDAABAwEPAQ4BAQEAAQUCDwEGAQEBBAEOAQ8BCAwAAQsBDwEFAgABCgEPAQkDAAEFAQ8BDgsAAQYBDwELAwABDQEPAQQDAAEBAg8BAQkAAQEBDgEPAQIDAAEOAQ8BAwQAAg8BAgkAAQkBDwEHBAABDQEPAQQDAAEBAg8BAQgAAQQBDwENBQABCgEPAQkDAAEFAQ8BDgkAAQwBDwEEBQABBQIPAQYBAQEEAQ0BDwEICAABBwEPAQoHAAEKBQ8BDQEBBwABAgIOAQEIAAEHAQ0BDwEOAQkBAQMA"],"&":[21,0,6,21,20,"BgABBgEMAQ4BDwENAQsBBgEBCwABAQEMBw8BCgsAAQkCDwEJAQIBAAEBAQQCCQsAAQ4BDwELEQABAQIPAQcSAAENAQ8BCxIAAQcCDwEHEQABAQEOAg8BBg8AAQEBCwQPAQUOAAELAQ8BDgEEAQ0CDwEFBQABAwIPAQMDAAEHAg8BBAEAAQIBDQIPAQUEAAEFAg8BAQMAAQ0BDwEKAwABAgENAg8BBAMAAQkBDwEMAwABAgIPAQUEAAECAQ4BDwEOAQQCAAENAQ8BBwMAAQQCDwEEBQABAwEOAQ8BDgEDAQUBDwEOAQEDAAEDAg8BBgYAAQMBDgEPAQ4BDQEPAQcFAAEOAQ8BCwcAAQQBDgIPAQwGAAEJAg8BBwYAAQEBDAIPAQ4BAgUAAQEBDQIPAQoBBAEBAQABAgEHAQ4EDwENAQEFAAEBAQsIDwEMAQMBBgIPAQwBAQYAAQUBCgENAQ8BDgENAQoBBAMAAQgCDwELAQA="],"'":[7,0,6,7,20,"AgABBgEPAQ0EAAEGAQ8BDQQAAQYBDwENBAABBgEPAQ0EAAEGAQ8BDQQAAQYBDwENBAABBgEPAQ1dAA=="],"(":[11,0,5,11,24,"BQABAQEOAQ8BAgcAAQkBDwEJBwABAgIPAQIHAAEKAQ8BCgcAAQECDwEEBwABBwEPAQ4IAAEMAQ8BCgcAAQECDwEGBwABBAIPAQMHAAEHAg8BAQcAAQgCDwgAAQoBDwEOCAABCQEPAQ4IAAEIAg8IAAEHAg8BAQcAAQQCDwEDBwABAQIPAQYIAAEMAQ8BCggAAQcBDwEOCAABAQIPAQQIAAEKAQ8BCggAAQICDwECCAABCQEPAQkIAAEBAQ4BDwECAgA="],")":[11,0,5,11,24,"AgABCQEPAQgIAAECAg8BAggAAQkBDwEKCAABAgIPAQMIAAEMAQ8BCQgAAQYBDwEOAQEHAAECAg8BBQgAAQ4BDwEJCAABCgEPAQ0IAAEIAg8IAAEHAg8BAQcAAQYCDwEDBwABBgIPAQMHAAEHAg8BAQcAAQgCDwgAAQoBDwENCAABDgEPAQkHAAECAg8BBQcAAQYBDwEOAQEHAAEMAQ8BCQcAAQICDwEDBwABCQEPAQoHAAECAg8BAgcAAQkBDwEIBgA="],"*":[14,0,6,14,20,"BgABDwEIDAABDwEIBwABCgEGAwABDwEIAgABAgELAQMBAAEBAQsBDwEMAQMBAAEPAQgBAAEHAQ8BDgEFAwABBQENAQ8BCAEPAQoBDQEPAQkBAQYAAQYBDgIPAQsBAggAAQYBDgIPAQsBAgYAAQQBDQEPAQgBDwEKAQ0BDwEJAQECAAEBAQsBDwEMAQMBAAEPAQgBAAEHAQ8BDgEFAgABCgEGAwABDwEIAgABAgELAQMHAAEPAQgMAAEPAQh2AA=="],"+":[23,0,10,23,16,"CgABDAEPAQYUAAEMAQ8BBhQAAQwBDwEGFAABDAEPAQYUAAEMAQ8BBhQAAQwBDwEGFAABDAEPAQYMAAECEA8BDAUAAQIQDwEMDQABDAEPAQYUAAEMAQ8BBhQAAQwBDwEGFAABDAEPAQYUAAEMAQ8BBhQAAQwBDwEGFAABDAEPAQYKAA=="],",":[9,0,23,9,6,"AwABDAEPAQ4GAAEMAQ8BDgYAAQ4BDwELBQABAwIPAQMFAAEIAQ8BCQYAAQwBDgECBAA="],"-":[10,0,18,10,8,"AQABCgYPAQYCAAEKBg8BBj0A"],".":[9,0,23,9,3,"AgABAgIPAQoFAAECAg8BCgUAAQICDwEKAwA="],"/":[9,0,6,10,22,"BgABBAEPAQ4HAAEJAQ8BCQcAAQ4BDwEFBgABBAEPAQ4BAQYAAQgBDwEKBwABDQEPAQYGAAEDAg8BAQYAAQcBDwELBwABDAEPAQcGAAECAg8BAgYAAQYBDwEMBwABCwEPAQgGAAEBAg8BAwYAAQUBDwENBwABCgEPAQkHAAEOAQ8BBAYAAQQBDwEOBwABCQEPAQoHAAEOAQ8BBQYAAQMCDwEBBgABCAEPAQsHAAENAQ8BBgcA"],"0":[17,0,6,17,20,"BQABAwEKAQ0BDwEOAQsBBQkAAQcHDwEKBwABBgIPAQsBAwEAAQIBCQIPAQgFAAEBAQ4BDwEMBQABCgIPAQIEAAEGAg8BBAUAAQICDwEJBAABCwEPAQ4HAAEMAQ8BDQQAAQ4BDwELBwABCAIPAQECAAEBAg8BCQcAAQYCDwEEAgABAgIPAQgHAAEFAg8BBQIAAQMCDwEHBwABBQIPAQUCAAEDAg8BBwcAAQUCDwEFAgABAgIPAQgHAAEFAg8BBQIAAQECDwEJBwABBgIPAQQDAAEOAQ8BCwcAAQgCDwEBAwABCwEPAQ4HAAEMAQ8BDQQAAQYCDwEEBQABAgIPAQkEAAEBAQ4BDwEMBQABCgIPAQIFAAEGAg8BCwEDAQABAgEJAg8BCAcAAQcHDwEKCQABAwEKAQ0BDwEOAQsBBQUA"],"1":[17,0,6,17,20,"AwABAgEFAQgBCwEOAg8BBQkABw8BBQkAAQ0BCgEHAQQBBQIPAQUNAAEEAg8BBQ0AAQQCDwEFDQABBAIPAQUNAAEEAg8BBQ0AAQQCDwEFDQABBAIPAQUNAAEEAg8BBQ0AAQQCDwEFDQABBAIPAQUNAAEEAg8BBQ0AAQQCDwEFDQABBAIPAQUNAAEEAg8BBQ0AAQQCDwEFDQABBAIPAQUJAAEKCg8BCgUAAQoKDwEKAgA="],"2":[17,0,6,17,20,"AgABAQEFAQkBDAENAQ8BDgEMAQgBAgcAAQ0JDwEHBgABDQEPAQsBBgECAQABAQEFAQ0CDwEGBQABCgEDBgABAgEOAQ8BDg4AAQgCDwEEDQABBQIPAQUNAAEHAg8BBA0AAQwCDwEBDAABBQIPAQoMAAECAQ4BDwEOAQILAAEBAQ0CDwEFCwABAQEMAg8BBwwAAQsCDwEHDAABCwIPAQgMAAEKAg8BCQwAAQkCDwEJDAABCQIPAQoMAAEIAg8BCg0ADA8BBwQADA8BBwIA"],"3":[17,0,6,17,20,"AwABAwEHAQsBDQEOAQ8BDQELAQYHAAEFCQ8BDQECBQABBQELAQcBBAECAQABAQEEAQoCDwENDgABCAIPAQUNAAECAg8BCA0AAQICDwEHDQABBwIPAQMKAAEBAQMBCQIPAQcIAAEIBQ8BCwEECQABCAUPAQ0BBwwAAQEBAwEKAg8BCw4AAQcCDwEHDgABDQEPAQ0OAAEKAg8OAAEKAQ8BDg4AAQ4BDwEMDQABCAIPAQcEAAEMAQgBBAECAQEBAAEBAQUBCwIPAQwFAAEOCQ8BCwEBBQABAgEGAQoBDAEOAQ8BDgEMAQkBBAUA"],"4":[17,0,6,17,20,"CQABDAIPAQ0MAAEHAw8BDQsAAQMCDwEOAQ8BDQsAAQwBDwEHAQwBDwENCgABBwEPAQwBAAEMAQ8BDQkAAQICDwEDAQABDAEPAQ0JAAEMAQ8BCQIAAQwBDwENCAABBwEPAQ0BAQIAAQwBDwENBwABAgEOAQ8BBQMAAQwBDwENBwABCwEPAQoEAAEMAQ8BDQYAAQYBDwEOAQIEAAEMAQ8BDQUAAQIBDgEPAQYFAAEMAQ8BDQUAAQkBDwEMBgABDAEPAQ0FAAEKDQ8BCgIAAQoNDwEKCwABDAEPAQ0OAAEMAQ8BDQ4AAQwBDwENDgABDAEPAQ0OAAEMAQ8BDQQA"],"5":[17,0,6,17,20,"AgABAQoPAQYFAAEBCg8BBgUAAQECDwEFDQABAQIPAQUNAAEBAg8BBQ0AAQECDwEFDQABAQIPAQUNAAEBAg8BDAENAQ8BDgEMAQkBAwcAAQEJDwEIBgABAQELAQYBAwEBAQABAgEGAQ4CDwEIDQABAQENAg8BAw0AAQQCDwEIDgABDgEPAQsOAAENAQ8BDA4AAQ4BDwELDQABBAIPAQgMAAEBAQ0CDwEDBAABDAEIAQQBAgEBAQABAgEGAQ0CDwEIBQABDgkPAQgGAAECAQYBCgEMAQ4BDwEOAQwBCAECBQA="],"6":[17,0,6,17,20,"BgABAwEJAQ0CDgEMAQkBBAgAAQkIDwEDBgABCgIPAQoBBAEBAQABAgEGAQsBAwUAAQYCDwEHDAABAQEOAQ8BCw0AAQYCDwEEDQABCgEPAQ4OAAEOAQ8BCwEAAQYBCwEOAQ8BDQEJAQMGAAIPAQoBCwcPAQcEAAEBBA8BDAEEAgEBBQENAg8BBQMAAQEDDwEMAQEEAAECAQ4BDwENAwABAQMPAQUGAAEIAg8BAwMAAQ4CDwEBBgABBAIPAQYDAAEMAg8HAAEDAg8BBwMAAQkCDwEBBgABBAIPAQYDAAEEAg8BBQYAAQgCDwEDBAABDAEPAQwBAQQAAQIBDgEPAQ0FAAEEAg8BDAEEAgEBBQENAg8BBAYAAQUBDgcPAQUIAAECAQkBDQIOAQ0BCAECBAA="],"7":[17,0,6,17,20,"AgABDAsPAQ0EAAEMCw8BCw0AAQgCDwEFDQABDQEPAQ4BAQwAAQQCDwEJDQABCgIPAQMMAAEBAQ4BDwENDQABBgIPAQcNAAELAg8BAQwAAQICDwELDQABCAIPAQUNAAENAQ8BDg0AAQQCDwEIDQABCgIPAQMMAAEBAQ4BDwEMDQABBgIPAQYNAAELAg8BAQwAAQICDwEKDQABCAIPAQQNAAENAQ8BDQkA"],"8":[17,0,6,17,20,"BAABAQEIAQwBDgEPAQ4BDAEJAQIHAAEEAQ4IDwEGBQABAgEOAQ8BDgEHAQIBAAECAQYBDgIPAQQEAAEIAg8BBgUAAQMCDwEKBAABCgIPAQEGAAENAQ8BDQQAAQkCDwEBBgABDQEPAQsEAAEEAg8BBgUAAQMCDwEHBQABCQEPAQ4BBwECAQABAgEGAQ4BDwELBwABBQEMBQ8BDQEHCAABCAENBQ8BDgEJAQEFAAEBAQsBDwEOAQcBAgEAAQEBBgEOAQ8BDQECBAABCQIPAQQFAAECAQ4BDwELBAABDgEPAQsHAAEJAg8BAgIAAQICDwEIBwABBgIPAQQCAAECAg8BCAcAAQYCDwEEAwACDwELBwABCQIPAQIDAAELAg8BBAUAAQIBDgEPAQ0EAAEDAg8BDgEHAQIBAAEBAQYBDgIPAQUFAAEFAQ4IDwEHBwABAgEIAQwBDgEPAQ4BDAEJAQIEAA=="],"9":[17,0,6,17,20,"BAABAQEHAQwBDgEPAQ0BCQEDCAABBAEOBw8BBwYAAQIBDgEPAQ4BBgEBAQABAwEKAg8BBgUAAQoCDwEEBQABCgEPAQ4BAQMAAQECDwELBgABAwIPAQcDAAEDAg8BBwcAAQ4BDwELAwABBAIPAQYHAAENAQ8BDgMAAQMCDwEHBwABDgIPAQICAAEBAg8BCwYAAQMDDwEDAwABCwIPAQMFAAEKAw8BBAMAAQMCDwEOAQYBAQEAAQMBCgQPAQQEAAEFAQ4GDwEMAQgCDwEDBQABAgEIAQ0CDgEMAQcBAAEJAg8BAQ0AAQwBDwENDQABAQIPAQgNAAEIAg8BAgwAAQQCDwEJBgABDAEGAQMCAQEDAQgCDwEMAQEGAAgPAQoBAQcAAQMBCAEMAQ4BDwENAQoBBAYA"],":":[9,0,12,9,14,"AwABDAEPAQ4GAAEMAQ8BDgYAAQwBDwEOTgABDAEPAQ4GAAEMAQ8BDgYAAQwBDwEOAwA="],";":[9,0,12,9,17,"AwABDAEPAQ4GAAEMAQ8BDgYAAQwBDwEOTgABDAEPAQ4GAAEMAQ8BDgYAAQ4BDwELBQABAwIPAQMFAAEIAQ8BCQYAAQwBDgECBAA="],"<":[23,0,10,23,16,"EQABAwEIAQoRAAECAQgBDQIPAQwOAAECAQcBDAQPAQwBBQsAAQEBBgELBA8BDAEHAQIKAAEBAQUBCgQPAQwBBwECCwABBAEKAQ4DDwENAQgBAw0AAQIDDwENAQgBAxAAAQIDDwENAQgBAxEAAQQBCgEOAw8BDQEHAQIQAAEBAQUBCgQPAQwBBwECEAABAQEGAQsEDwEMAQcBAhAAAQIBBwEMBA8BCwEFEQABAgEIAQ0CDwEMFAABAwEIAQoxAA=="],"=":[23,0,14,23,12,"AgABAhAPAQwFAAECEA8BDEoAAQIQDwEMBQABAhAPAQx2AA=="],">":[23,0,10,23,16,"AgABAgEMAQYBARMAAQIDDwELAQYBARAAAQEBCAENAw8BDgEKAQURAAEEAQkBDgMPAQ4BCQEEEQABBAEJAQ4DDwEOAQgBAxEAAQUBCgEOAw8BDQEIAQIQAAEBAQUBCgMPAQwRAAEFAQoBDgIPAQwOAAEEAQoBDgMPAQ0BCAECCwABBAEJAQ4DDwEOAQgBAwsAAQMBCQEOAw8BDgEJAQQLAAEBAQgBDQQPAQoBBQ4AAQIDDwELAQYBARAAAQIBDAEGAQE/AA=="],"?":[14,0,6,14,20,"AwABAQEHAQwBDgEPAQ0BCQECBQABBgEOBg8BDgEDAwABAQEPAQ4BBwECAQABAgEIAg8BDQMAAQEBCQEBBQABCQIPAQQKAAEEAg8BBgoAAQYCDwEFCgABDAEPAQ4BAQkAAQoCDwEGCQABCgIPAQgJAAEJAg8BCAkAAQQCDwEJCgABCQEPAQ4BAQoAAQsBDwEMCwABDAEPAQsLAAEMAQ8BCycAAQ0BDwEMCwABDQEPAQwLAAENAQ8BDAYA"],"@":[27,0,7,27,24,"CQABAwEHAQsBDQEOAQ8BDQELAQcBAQ8AAQMBCwoPAQgBAQwAAQgCDwEOAQgBBAECAQABAQECAQUBCgIPAQ0BBAoAAQoBDwEOAQcJAAECAQsBDwEOAQMIAAEJAQ8BDgEDDAABCAEPAQ4BAgYAAQUBDwEOAQIOAAEIAQ8BCwYAAQ0BDwEFBAABBAELAg4BDAEGAQABDAEPAQICAAEMAQ8BBAQAAQUBDwEKBAABBwYPAQoBDAEPAQICAAEFAQ8BCgQAAQoBDwEEAwABAwIPAQoBAgEAAQIBCQMPAQICAAEBAQ8BDQQAAg4EAAEKAQ8BCwUAAQoCDwECAwABDQEPAwABAQEPAQsEAAEOAQ8BBAUAAQMCDwECAwABDAEPAQECAAEDAQ8BCgQAAg8BAgUAAQECDwECAwABDQEPAwABAwEPAQoEAAIPAQIFAAEBAg8BAgIAAQEBDwENAwABAQEPAQwEAAEOAQ8BBAUAAQMCDwECAgABBwEPAQgEAAIOBAABCgEPAQsFAAEKAg8BAgEAAQMBDgEPAQIEAAEKAQ8BBAMAAQMCDwEKAQIBAAECAQkDDwEDAQcBDgEPAQUFAAEGAQ8BCgQAAQcGDwEKAQwDDwEOAQUGAAEBAQ0BDwEEBAABBQELAg4BDAEGAQABCwENAQsBBgEBCAABBgEPAQ4BAhgAAQoBDwENAQIXAAEBAQsBDwEOAQYJAAECAQoBCQwAAQkCDwENAQgBBAECAQABAQEDAQYBCwIPAQgNAAEEAQwJDwEMAQQQAAEEAQgBDAENAQ8BDgEMAQkBBAkA"],"A":[18,0,6,19,20,"BwABBwIPAQ4PAAENAw8BBQ0AAQMEDwEKDQABCQEPAQ4BCAIPAQEMAAEOAQ8BCQECAg8BBwsAAQUCDwEEAQABDAEPAQwLAAELAQ8BDQIAAQcCDwEDCQABAgIPAQgCAAEBAg8BCAkAAQcCDwEDAwABCwEPAQ4JAAENAQ8BDQQAAQYCDwEFBwABAwIPAQcEAAEBAg8BCgcAAQkCDwECBQABCgIPAQEGAAEOAQ8BDAYAAQUCDwEHBQABBQwPAQwFAAELDQ8BAwMAAQICDwEJCAABAgIPAQgDAAEHAg8BBAkAAQwBDwEOAwABDQEPAQ4KAAEGAg8BBQEAAQMCDwEICgABAQIPAQoBAAEJAg8BAwsAAQoCDwEB"],"B":[19,0,6,19,20,"AgABBQcPAQ4BDAEIAQIHAAEFCw8BBgYAAQUCDwEFBAABAgEHAQ4CDwEDBQABBQIPAQUGAAEEAg8BCQUAAQUCDwEFBwABDgEPAQsFAAEFAg8BBQcAAQ4BDwEKBQABBQIPAQUGAAEEAg8BBwUAAQUCDwEFBAABAgEGAQ4BDwENAQEFAAEFCQ8BDgEIAQEGAAEFCg8BCwEDBgABBQIPAQUEAAEBAQQBDAEPAQ4BBAUAAQUCDwEFBwABDAEPAQ4BAQQAAQUCDwEFBwABBgIPAQYEAAEFAg8BBQcAAQQCDwEIBAABBQIPAQUHAAEEAg8BCQQAAQUCDwEFBwABBgIPAQcEAAEFAg8BBQcAAQwCDwEDBAABBQIPAQUEAAEBAQQBDAIPAQoFAAEFCw8BCgEBBQABBQcPAQ4BDQEKAQQFAA=="],"C":[19,0,6,19,20,"BgABAQEGAQoBDQEOAQ8BDQELAQcBAQgAAQcBDgkPAQgBAQUAAQoCDwEOAQcBAwEBAQABAgEGAQwCDwEGBAABCAIPAQoBAQcAAQYBDgEGAwABAwIPAQwKAAEDAQUDAAEKAg8BAw8AAg8BDA8AAQQCDwEJDwABBgIPAQYPAAEHAg8BBQ8AAQcCDwEFDwABBgIPAQYPAAEEAg8BCRAAAg8BDBAAAQoCDwEDDwABAwIPAQwKAAEDAQUEAAEIAg8BCgEBBwABBQEOAQYFAAEKAg8BDgEHAQMBAQEAAQIBBgELAg8BBgYAAQcBDgkPAQgBAQcAAQEBBgELAQ0BDgEPAQ0BCwEHAQEDAA=="],"D":[21,0,6,21,20,"AgABBQYPAQ4BDQELAQgBAwkAAQULDwEMAQQHAAEFAg8BBQMAAQEBAgEFAQoDDwEIBgABBQIPAQUHAAEDAQ0CDwEGBQABBQIPAQUIAAECAQ4BDwEOAQEEAAEFAg8BBQkAAQcCDwEHBAABBQIPAQUJAAEBAg8BDAQAAQUCDwEFCgABDQIPBAABBQIPAQUKAAELAg8BAQMAAQUCDwEFCgABCgIPAQMDAAEFAg8BBQoAAQoCDwECAwABBQIPAQUKAAELAg8BAQMAAQUCDwEFCgABDQIPBAABBQIPAQUJAAEBAg8BDAQAAQUCDwEFCQABBwIPAQcEAAEFAg8BBQgAAQIBDgEPAQ4BAQQAAQUCDwEFBwABAwENAg8BBgUAAQUCDwEFAwABAQECAQUBCgMPAQgGAAEFCw8BDAEEBwABBQYPAQ4BDQELAQgBAwcA"],"E":[17,0,6,17,20,"AgABBQwPAQEDAAEFDA8BAQMAAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQULDwEKBAABBQsPAQoEAAEFAg8BBQ0AAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQUCDwEFDQABBQwPAQUDAAEFDA8BBQEA"],"F":[16,0,6,16,20,"AgABBQsPBAABBQsPBAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQoPAQIEAAEFCg8BAgQAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFCgA="],"G":[21,0,6,21,20,"BgABAQEGAQoBDQEOAQ8BDgEMAQkBBAoAAQcBDgkPAQ0BBgcAAQoCDwEOAQgBAwEBAQABAgEEAQkBDgIPAQMFAAEIAg8BCgEBBwABAQEJAQ8BAwQAAQMCDwEMCwABBgEDBAABCgIPAQMQAAEBAg8BDBEAAQQCDwEJEQABBgIPAQYRAAEHAg8BBREAAQcCDwEFBgABBAYPAQsDAAEGAg8BBgYAAQQGDwELAwABBAIPAQkLAAEOAQ8BCwMAAQECDwEMCwABDgEPAQsEAAEKAg8BAwoAAQ4BDwELBAABAwIPAQwKAAEOAQ8BCwUAAQkCDwEKAQEIAAEOAQ8BCwYAAQoCDwEOAQcBAwEBAQABAQECAQYBCwIPAQsHAAEHAQ4KDwEJAQIIAAEBAQYBCgENAQ4BDwEOAQ0BCgEGAQEEAA=="],"H":[20,0,6,20,20,"AgABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUODwEKBAABBQ4PAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgIA"],"I":[8,0,6,8,20,"AgABBQIPAQUEAAEFAg8BBQQAAQUCDwEFBAABBQIPAQUEAAEFAg8BBQQAAQUCDwEFBAABBQIPAQUEAAEFAg8BBQQAAQUCDwEFBAABBQIPAQUEAAEFAg8BBQQAAQUCDwEFBAABBQIPAQUEAAEFAg8BBQQAAQUCDwEFBAABBQIPAQUEAAEFAg8BBQQAAQUCDwEFBAABBQIPAQUEAAEFAg8BBQIA"],"J":[8,-2,6,10,25,"BAABBQIPAQUGAAEFAg8BBQYAAQUCDwEFBgABBQIPAQUGAAEFAg8BBQYAAQUCDwEFBgABBQIPAQUGAAEFAg8BBQYAAQUCDwEFBgABBQIPAQUGAAEFAg8BBQYAAQUCDwEFBgABBQIPAQUGAAEFAg8BBQYAAQUCDwEFBgABBQIPAQUGAAEFAg8BBQYAAQUCDwEFBgABBQIPAQUGAAEGAg8BBAYAAQgCDwECBgABDAEPAQ4FAAECAQkCDwEIAwABBgQPAQwBAQMAAQYBDwEOAQwBBwEBBAA="],"K":[18,0,6,19,20,"AgABBQIPAQUHAAEGAg8BDQECAwABBQIPAQUGAAEGAg8BDQECBAABBQIPAQUFAAEHAg8BDQECBQABBQIPAQUEAAEIAg8BDAEBBgABBQIPAQUDAAEIAg8BDAEBBwABBQIPAQUCAAEJAg8BCwEBCAABBQIPAQUBAAEJAg8BCwEBCQABBQIPAQUBCgIPAQoLAAEFAg8BDQIPAQoMAAEFBQ8BAgwAAQUCDwEMAg8BDQECCwABBQIPAQUBCQIPAQ0BAQoAAQUCDwEFAQABCQIPAQwBAQkAAQUCDwEFAgABCQIPAQwBAQgAAQUCDwEFAwABCQIPAQwBAQcAAQUCDwEFBAABCgIPAQwBAQYAAQUCDwEFBQABCgIPAQwBAQUAAQUCDwEFBgABCgIPAQwBAQQAAQUCDwEFBwABCgIPAQsBAQMAAQUCDwEFCAABCwIPAQsBAQ=="],"L":[15,0,6,15,20,"AgABBQIPAQULAAEFAg8BBQsAAQUCDwEFCwABBQIPAQULAAEFAg8BBQsAAQUCDwEFCwABBQIPAQULAAEFAg8BBQsAAQUCDwEFCwABBQIPAQULAAEFAg8BBQsAAQUCDwEFCwABBQIPAQULAAEFAg8BBQsAAQUCDwEFCwABBQIPAQULAAEFAg8BBQsAAQUCDwEFCwABBQsPAQ0CAAEFCw8BDQ=="],"M":[23,0,6,23,20,"AgABBQMPAQwJAAEIAw8BCgQAAQUEDwEDCAABDQMPAQoEAAEFAg8BDgEPAQgHAAEEBA8BCgQAAQUCDwEJAQ8BDgcAAQkBDwEKAQ4BDwEKBAABBQIPAQQBDgEPAQQFAAEBAQ4BDwEEAQ4BDwEKBAABBQIPAQQBCQEPAQoFAAEGAQ8BDQEAAQ4BDwEKBAABBQIPAgQCDwEBBAABCwEPAQgBAAEOAQ8BCgQAAQUCDwEEAQABDQEPAQYDAAECAg8BAgEAAQ4BDwEKBAABBQIPAQQBAAEHAQ8BDAMAAQcBDwEMAgABDgEPAQoEAAEFAg8BBAEAAQICDwECAgABDQEPAQYCAAEOAQ8BCgQAAQUCDwEEAgABCwEPAQgBAAEEAg8BAQIAAQ4BDwEKBAABBQIPAQQCAAEGAQ8BDQEAAQkBDwEKAwABDgEPAQoEAAEFAg8BBAIAAQEBDgEPAQUBDgEPAQQDAAEOAQ8BCgQAAQUCDwEEAwABCQEPAQ4BDwEOBAABDgEPAQoEAAEFAg8BBAMAAQQDDwEIBAABDgEPAQoEAAEFAg8BBAQAAQ0CDwEDBAABDgEPAQoEAAEFAg8BBAwAAQ4BDwEKBAABBQIPAQQMAAEOAQ8BCgQAAQUCDwEEDAABDgEPAQoEAAEFAg8BBAwAAQ4BDwEKAgA="],"N":[20,0,6,20,20,"AgABBQMPAQcIAAIPAQgEAAEFAw8BDgEBBwACDwEIBAABBQQPAQgHAAIPAQgEAAEFAg8BDQEPAQ4BAQYAAg8BCAQAAQUCDwEGAg8BCQYAAg8BCAQAAQUCDwEEAQkCDwECBQACDwEIBAABBQIPAQQBAgIPAQkFAAIPAQgEAAEFAg8BBAEAAQgCDwECBAACDwEIBAABBQIPAQQBAAEBAQ4BDwEKBAACDwEIBAABBQIPAQQCAAEIAg8BAwMAAg8BCAQAAQUCDwEEAgABAQEOAQ8BCwMAAg8BCAQAAQUCDwEEAwABBwIPAQQCAAIPAQgEAAEFAg8BBAMAAQEBDgEPAQsCAAIPAQgEAAEFAg8BBAQAAQYCDwEEAQACDwEIBAABBQIPAQQFAAENAQ8BDAEAAg8BCAQAAQUCDwEEBQABBgIPAQUCDwEIBAABBQIPAQQGAAENAQ8BDQIPAQgEAAEFAg8BBAYAAQUEDwEIBAABBQIPAQQHAAEMAw8BCAQAAQUCDwEEBwABBAMPAQgCAA=="],"O":[21,0,6,21,20,"BgABAgEHAQwBDgEPAQ4BDAEJAQMLAAEICQ8BCgEBCAABCwIPAQ0BBgECAQABAQEEAQsCDwENAQIGAAEJAg8BCgcAAQcCDwEMBQABAwIPAQwJAAEJAg8BBwQAAQoCDwEDCQABAQEOAQ8BDgMAAQECDwENCwABCQIPAQQCAAEEAg8BCQsAAQUCDwEHAgABBgIPAQYLAAEDAg8BCQIAAQcCDwEFCwABAgIPAQoCAAEHAg8BBQsAAQICDwEKAgABBgIPAQYLAAEDAg8BCQIAAQQCDwEJCwABBQIPAQcCAAEBAg8BDQsAAQkCDwEEAwABCgIPAQMJAAEBAQ4BDwEOBAABAwIPAQwJAAEIAg8BBwUAAQkCDwEKBwABBgIPAQwHAAELAg8BDQEGAQIBAAEBAQQBCwIPAQ0BAggAAQgJDwEKAQEKAAECAQcBDAEOAQ8BDgEMAQkBAwYA"],"P":[16,0,6,16,20,"AgABBQYPAQ4BDQEJAQMFAAEFCg8BCAQAAQUCDwEFAwABAQEGAQ4CDwEHAwABBQIPAQUFAAECAg8BDgMAAQUCDwEFBgABCgIPAQMCAAEFAg8BBQYAAQcCDwEFAgABBQIPAQUGAAEHAg8BBQIAAQUCDwEFBgABCgIPAQMCAAEFAg8BBQUAAQICDwEOAwABBQIPAQUDAAEBAQUBDgIPAQcDAAEFCg8BCQQAAQUGDwEOAQ0BCQEDBQABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQoA"],"Q":[21,0,6,21,23,"BgABAgEHAQwBDgEPAQ4BDAEJAQMLAAEICQ8BCgEBCAABCwIPAQ0BBgECAQABAQEEAQsCDwENAQIGAAEJAg8BCgcAAQcCDwEMBQABAwIPAQwJAAEJAg8BBwQAAQoCDwEDCQABAQEOAQ8BDQMAAQECDwENCwABCQIPAQQCAAEEAg8BCQsAAQUCDwEHAgABBgIPAQYLAAEDAg8BCQIAAQcCDwEFCwABAgIPAQoCAAEHAg8BBQsAAQICDwELAgABBgIPAQYLAAEDAg8BCgIAAQQCDwEJCwABBQIPAQgCAAEBAg8BDQsAAQkCDwEEAwABCgIPAQMJAAEBAQ4BDwEOBAABAwIPAQwJAAEIAg8BBwUAAQkCDwEKBwABBgIPAQ0HAAELAg8BDQEGAQIBAAEBAQQBCwIPAQ0BAggAAQgJDwELAQEKAAECAQcBDAEOBA8BChIAAQsCDwEIEQABAQELAg8BBxEAAQEBDAIPAQYDAA=="],"R":[19,0,6,19,20,"AgABBQYPAQ4BDQEKAQUIAAEFCg8BCwEBBgABBQIPAQUDAAECAQUBDQIPAQkGAAEFAg8BBQUAAQEBDgIPAQEFAAEFAg8BBQYAAQkCDwEEBQABBQIPAQUGAAEHAg8BBQUAAQUCDwEFBgABCQIPAQMFAAEFAg8BBQUAAQEBDgEPAQ4BAQUAAQUCDwEFAwABAgEFAQ0CDwEGBgABBQkPAQ4BBgcAAQUJDwEICAABBQIPAQUCAAEBAQMBCQIPAQoHAAEFAg8BBQUAAQgCDwEFBgABBQIPAQUGAAENAQ8BDQYAAQUCDwEFBgABBgIPAQYFAAEFAg8BBQcAAQ4BDwENBQABBQIPAQUHAAEHAg8BBQQAAQUCDwEFBwABAQEOAQ8BDAQAAQUCDwEFCAABCQIPAQQDAAEFAg8BBQgAAQICDwELAQA="],"S":[17,0,6,17,20,"BAABAgEIAQwBDgEPAQ4BDQELAQcBBAYAAQYBDgkPAQcEAAEEAg8BDgEHAQMCAQEDAQcBDQEPAQcEAAEMAQ8BDgECBwACBgMAAQICDwEJDQABAwIPAQcNAAECAg8BCg4AAQ0CDwEGDQABBQMPAQ4BCQEGAQMKAAEGAQ4GDwELAQUIAAEBAQYBCwEOBQ8BDAEBCgABAgEFAQkDDwEMDQABAgEOAg8BBQ0AAQYCDwEIDQABAwIPAQkNAAEEAg8BCAIAAQIBCgECCAABCwIPAQQCAAECAg8BCwEGAQIBAQEAAQIBBQEMAg8BCwMAAQILDwELAQEEAAECAQYBCQEMAQ0BDgEPAQ4BDAEJAQQEAA=="],"T":[16,-1,6,18,20,"AQEQDwEJAQEQDwEJBwABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJBwA="],"U":[20,0,6,20,20,"AgABCgIPCQABBAIPAQYEAAEKAg8JAAEEAg8BBgQAAQoCDwkAAQQCDwEGBAABCgIPCQABBAIPAQYEAAEKAg8JAAEEAg8BBgQAAQoCDwkAAQQCDwEGBAABCgIPCQABBAIPAQYEAAEKAg8JAAEEAg8BBgQAAQoCDwkAAQQCDwEGBAABCgIPCQABBAIPAQYEAAEKAg8JAAEEAg8BBgQAAQoCDwkAAQQCDwEGBAABCgIPAQEIAAEEAg8BBgQAAQkCDwEBCAABBQIPAQUEAAEHAg8BBAgAAQgCDwEDBAABAwIPAQgIAAEMAQ8BDgYAAQwBDwEOAQIGAAEGAg8BCQYAAQMCDwEOAQcBAgEAAQEBAwEJAg8BDQEBBwABBAEOCA8BDAECCQABAQEHAQsBDgEPAQ4BDQEKAQUGAA=="],"V":[18,0,6,19,20,"AQkCDwEDCwABCwIPAQEBAwIPAQgKAAEBAg8BCgIAAQ0BDwEOCgABBwIPAQUCAAEHAg8BBAkAAQwBDwEOAwABAgIPAQoIAAEDAg8BCAQAAQsCDwEBBwABCAIPAQMEAAEFAg8BBgcAAQ4BDwEMBgABDgEPAQwGAAEEAg8BBwYAAQkCDwECBQABCgIPAQEGAAEDAg8BCAQAAQECDwEKCAABDQEPAQ0EAAEGAg8BBQgAAQcCDwEEAwABDAEPAQ4JAAECAg8BCQIAAQICDwEICgABCwEPAQ4BAQEAAQgCDwEDCgABBQIPAQUBAAENAQ8BDAwAAQ4BDwELAQQCDwEHDAABCQIPAQsCDwEBDAABAwQPAQoOAAENAw8BBQ4AAQcCDwEOCAA="],"W":[27,0,6,27,20,"AQABDgEPAQsHAAEEAg8BDgcAAQECDwEKAgABCwEPAQ4HAAEIAw8BAwYAAQQCDwEHAgABBwIPAQMGAAELAw8BBwYAAQgCDwEDAgABBAIPAQcGAAIPAQkBDwELBgABCwEPAQ4EAAIPAQoFAAEEAQ8BDgEDAQ8BDgYAAQ4BDwELBAABCwEPAQ4FAAEHAQ8BCgEAAQ4BDwEDBAABBAIPAQcEAAEIAg8BAwQAAQsBDwEHAQABCwEPAQcEAAEHAg8BAwQAAQQCDwEGBAABDgEPAQMBAAEHAQ8BCgQAAQsBDwEOBQABAQIPAQoDAAEDAQ8BDgIAAQMBDwEOBAABDgEPAQsGAAEMAQ8BDgMAAQcBDwELAwACDwEDAgABAwIPAQcGAAEIAg8BAgIAAQsBDwEHAwABCwEPAQYCAAEHAg8BAwYAAQQCDwEGAgABDgEPAQMDAAEIAQ8BCgIAAQsBDwEOBwABAQIPAQoBAAEDAQ8BDgQAAQQBDwEOAgABDgEPAQsIAAEMAQ8BDQEAAQcBDwELBAABAQIPAQIBAwIPAQcIAAEIAg8BAgEKAQ8BCAUAAQwBDwIGAg8BAwgAAQQCDwEGAQ4BDwEEBQABCAEPAgoBDwEOCQABAQIPAQwCDwEBBQABBQEPAQ0BDgEPAQsKAAEMAw8BDAYAAQEEDwEHCgABCAMPAQgHAAENAw8BBAoAAQQDDwEEBwABCQMPBgA="],"X":[18,0,6,19,20,"AQABAQEOAQ8BDQEBBwABAQENAQ8BDQEBAwABBQIPAQgHAAEKAg8BAwUAAQoCDwEDBQABBQIPAQgGAAEBAQ4BDwEMBAABAQEOAQ8BDAgAAQUCDwEIAwABCgIPAQMJAAEKAg8BAwEAAQUCDwEHCgABAgEOAQ8BDAECAQ4BDwEMDAABBgIPAQ4CDwEDDQABCwMPAQcOAAEEAg8BDg8AAQsDDwEHDQABBwIPAQ4BDwEOAQILAAECAQ4BDwELAQICDwELCwABDAEPAQ4BAgEAAQcCDwEGCQABBwIPAQYDAAEMAQ8BDgECBwABAwIPAQsEAAEDAg8BCwcAAQwBDwEOAQIFAAEIAg8BBQUAAQgCDwEFBwABDAEPAQ4BAQMAAQMCDwEKCAABAwIPAQoDAAENAQ8BDgEBCQABCAIPAQUBAA=="],"Y":[16,-1,6,18,20,"AQABCwIPAQMJAAEKAg8BAwEAAQIBDgEPAQwIAAEFAg8BCAMAAQYCDwEHBgABAQENAQ8BDQUAAQsCDwECBQABCQIPAQMFAAECAQ4BDwEMBAABBAIPAQgHAAEGAg8BBwIAAQEBDQEPAQ0BAQgAAQsCDwECAQABCQIPAQMJAAECAQ4BDwEMAQQCDwEICwABBgQPAQ0BAQwAAQsDDwEDDQABAgIPAQoOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkHAA=="],"Z":[18,0,6,19,20,"AQABBw8PAwABBw8PDwABCwIPAQoOAAEIAg8BDQEBDQABBQIPAQ4BAg0AAQIBDgIPAQUNAAEBAQwCDwEIDgABCgIPAQsOAAEGAg8BDQEBDQABAwMPAQMNAAEBAQ0CDwEGDgABCwIPAQkOAAEIAg8BDA4AAQUCDwEOAQINAAECAQ4CDwEEDQABAQENAg8BBw4AAQoCDwELDgABBwIPAQ0BAQ4AAQwPDwEEAgABDA8PAQQBAA=="],"[":[11,0,5,11,24,"AgABCgQPAQ4FAAEKBA8BDgUAAQoBDwELCAABCgEPAQsIAAEKAQ8BCwgAAQoBDwELCAABCgEPAQsIAAEKAQ8BCwgAAQoBDwELCAABCgEPAQsIAAEKAQ8BCwgAAQoBDwELCAABCgEPAQsIAAEKAQ8BCwgAAQoBDwELCAABCgEPAQsIAAEKAQ8BCwgAAQoBDwELCAABCgEPAQsIAAEKAQ8BCwgAAQoBDwELCAABCgEPAQsIAAEKBA8BDgUAAQoEDwEOAwA="],"\\":[9,0,6,10,22,"AQ0BDwEGBwABCAEPAQsHAAEDAg8BAQcAAQ4BDwEFBwABCQEPAQoHAAEEAQ8BDggAAQ4BDwEEBwABCgEPAQkHAAEFAQ8BDQcAAQECDwEDBwABCwEPAQgHAAEGAQ8BDAcAAQICDwECBwABDAEPAQcHAAEHAQ8BCwcAAQMCDwEBBwABDQEPAQYHAAEIAQ8BCgcAAQQBDwEOAQEHAAEOAQ8BBQcAAQkBDwEJBwABBAEPAQ4BAA=="],"]":[11,0,5,11,24,"AgABBgUPAQMEAAEGBQ8BAwcAAQMCDwEDBwABAwIPAQMHAAEDAg8BAwcAAQMCDwEDBwABAwIPAQMHAAEDAg8BAwcAAQMCDwEDBwABAwIPAQMHAAEDAg8BAwcAAQMCDwEDBwABAwIPAQMHAAEDAg8BAwcAAQMCDwEDBwABAwIPAQMHAAEDAg8BAwcAAQMCDwEDBwABAwIPAQMHAAEDAg8BAwcAAQMCDwEDBwABAwIPAQMEAAEGBQ8BAwQAAQYFDwEDAgA="],"^":[23,0,6,23,20,"CQABBwIPAQ4BAxEAAQgEDwEOAQMPAAEIAg8BCwEEAQ4BDwEOAQMNAAEIAg8BCQIAAQIBDQEPAQ4BBAsAAQkCDwEHBAABAQELAQ8BDgEECQABCQEPAQ4BBQcAAQkBDwEOAQQHAAEJAQ8BDgEDCQABBwIPAQT/AC8A"],"_":[14,-1,26,15,6,"PAABBA0PAQwBBA0PAQw="],"`":[14,0,4,14,22,"AgABBQIPAQMLAAEHAQ8BDQEBCwABCQEPAQoMAAELAQ8BBwsAAQEBDAEPAQPzAA=="],"a":[17,0,11,17,15,"AwABAwEIAQsBDQEPAQ4BDAEIAQIHAAEECA8BDgEEBgABBAELAQYBAwECAQABAgEGAQ0BDwEOAQINAAEBAQ4BDwEIDgABCAEPAQwOAAEFAg8GAAEBAQYBCwENAQ4GDwEBBAABAwENCg8BAQQAAQ0BDwEOAQcBAwEBAwABBQIPAQEDAAEDAg8BBQYAAQcCDwEBAwABBQIPAQEGAAELAg8BAQMAAQQCDwEEBQABBQMPAQEDAAEBAQ4BDwEOAQUBAQEAAQMBCAEPAQoCDwEBBAABBQcPAQgBBQIPAQEFAAEDAQoBDgEPAQ4BCgEEAQABBQIPAQECAA=="],"b":[17,0,5,17,21,"AgABCAEPAQ0OAAEIAQ8BDQ4AAQgBDwENDgABCAEPAQ0OAAEIAQ8BDQ4AAQgBDwENDgABCAEPAQ0BAAEBAQgBDQEPAQ4BCgEDBgABCAEPAQ0BAgENBg8BBgUAAQgBDwEOAQwBDQEFAgEBBQENAg8BBAQAAQgCDwEOAQEEAAEBAQ0BDwENBAABCAIPAQYGAAEGAg8BAwMAAQgCDwECBgABAQIPAQcDAAEIAQ8BDggAAQ4BDwEJAwABCAEPAQ4IAAENAQ8BCgMAAQgBDwEOCAABDgEPAQkDAAEIAg8BAgYAAQECDwEHAwABCAIPAQYGAAEGAg8BAwMAAQgCDwEOAQEEAAEBAQ0BDwENBAABCAEPAQ4BDAENAQUCAQEEAQ0CDwEEBAABCAEPAQ0BAgENBg8BBgUAAQgBDwENAQABAQEIAQ0BDwEOAQoBAwQA"],"c":[15,0,11,15,15,"BQABBQEKAQ0BDwEOAQwBCQEEBQABAgEMCA8BAwMAAQEBDQIPAQkBAwIBAQMBBgELAQIDAAEJAg8BBQoAAQECDwEKCwABBQIPAQULAAEHAg8BAgsAAQcCDwEBCwABBwIPAQILAAEEAg8BBQsAAQECDwEKDAABCQIPAQULAAEBAQ0CDwEJAQMCAQEDAQYBCwECBAABAgEMCA8BAwYAAQUBCgEOAQ8BDgEMAQkBBAIA"],"d":[17,0,5,17,21,"DAABCwEPAQoOAAELAQ8BCg4AAQsBDwEKDgABCwEPAQoOAAELAQ8BCg4AAQsBDwEKBgABAgEJAQ0BDwENAQkBAgEAAQsBDwEKBQABBQYPAQ4BAwELAQ8BCgQAAQICDwEOAQUCAQEEAQwBDQEMAQ8BCgQAAQsBDwEOAQIEAAEBAQwCDwEKAwABAQIPAQgGAAEEAg8BCgMAAQUCDwEDBwABDgEPAQoDAAEHAg8BAQcAAQwBDwEKAwABCAIPCAABCwEPAQoDAAEHAg8BAQcAAQwBDwEKAwABBQIPAQMHAAEOAQ8BCgMAAQECDwEIBgABBAIPAQoEAAELAQ8BDgECBAABAQEMAg8BCgQAAQICDwEOAQUCAQEEAQwBDQEMAQ8BCgUAAQUGDwEOAQMBCwEPAQoGAAECAQkBDQEPAQ0BCQECAQABCwEPAQoCAA=="],"e":[17,0,11,17,15,"BQABBQEKAQ0BDwEOAQwBBwEBBwABAQEMBw8BDQEDBQABAQENAQ8BDgEHAQIBAAEBAQUBDQEPAQ0BAQQAAQgBDwEOAQIFAAECAQ4BDwEIAwABAQEOAQ8BBwcAAQgBDwENAwABBAIPAQMHAAEEAg8BAQIAAQcNDwECAgABBw0PAQMCAAEHAg8BAQ0AAQUCDwEEDQABAQIPAQoOAAEJAg8BBQ0AAQEBDAIPAQkBBAEBAQABAgEDAQYBCgEIBQABAQELCQ8BCQcAAQQBCgENAQ4BDwENAQwBCQEFAQECAA=="],"f":[10,0,5,11,21,"BAABAwEKAQ0DDwQAAQMBDgUPBAABCgEPAQ0BAwcAAQ4BDwEIBwABAQIPAQYHAAEBAg8BBgUAAQYIDwEGAQABBggPAQYDAAEBAg8BBgcAAQECDwEGBwABAQIPAQYHAAEBAg8BBgcAAQECDwEGBwABAQIPAQYHAAEBAg8BBgcAAQECDwEGBwABAQIPAQYHAAEBAg8BBgcAAQECDwEGBwABAQIPAQYHAAEBAg8BBgUA"],"g":[17,0,11,17,21,"BAABAgEJAQ0BDwENAQkBAgEAAQsBDwEKBQABBQYPAQ4BAwELAQ8BCgQAAQMCDwENAQUCAQEEAQwBDQEMAQ8BCgQAAQsBDwEOAQIEAAEBAQwCDwEKAwABAgIPAQgGAAEEAg8BCgMAAQUCDwEDBwABDgEPAQoDAAEHAg8BAQcAAQwBDwEKAwABCAIPCAABCwEPAQoDAAEHAg8BAQcAAQwBDwEKAwABBQIPAQMHAAEOAQ8BCgMAAQICDwEIBgABBAIPAQoEAAELAQ8BDgECBQABDAIPAQoEAAEDAg8BDQEFAgEBBAEMAQ0BDAEPAQoFAAEFBg8BDgEEAQsBDwEKBgABAgEJAQ0BDwENAQkBAgEAAQwBDwEJDgABDgEPAQcNAAEEAg8BBAwAAQEBDAEPAQ4GAAEJAQgBAwECAQABAQEFAQwCDwEGBgABCwgPAQgHAAECAQcBCwENAg4BDQEJAQMFAA=="],"h":[17,0,5,17,21,"AgABCAEPAQ0OAAEIAQ8BDQ4AAQgBDwENDgABCAEPAQ0OAAEIAQ8BDQ4AAQgBDwENDgABCAEPAQ0BAAEBAQcBDQEPAQ4BCwEDBgABCAEPAQ0BAQEMBg8BBQUAAQgBDwEOAQsBDQEFAgEBBAENAQ8BDgEBBAABCAIPAQ0BAQQAAQMCDwEGBAABCAIPAQUGAAENAQ8BCgQAAQgCDwEBBgABCgEPAQsEAAEIAQ8BDgcAAQkBDwEMBAABCAEPAQ0HAAEJAQ8BDAQAAQgBDwENBwABCQEPAQwEAAEIAQ8BDQcAAQkBDwEMBAABCAEPAQ0HAAEJAQ8BDAQAAQgBDwENBwABCQEPAQwEAAEIAQ8BDQcAAQkBDwEMBAABCAEPAQ0HAAEJAQ8BDAQAAQgBDwENBwABCQEPAQwCAA=="],"i":[8,0,5,8,21,"AgABBwIPBQABBwIPBQABBwIPHQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPAwA="],"j":[8,-1,5,9,27,"AwABBwIPBgABBwIPBgABBwIPIQABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwIPBgABBwEPAQ4GAAEHAQ8BDgYAAQoBDwEMBAABAQEFAQ4BDwEIAwABBwMPAQ4BAQMAAQcBDwEOAQoBAgQA"],"k":[16,0,5,16,21,"AgABCAEPAQ0NAAEIAQ8BDQ0AAQgBDwENDQABCAEPAQ0NAAEIAQ8BDQ0AAQgBDwENDQABCAEPAQ0GAAEGAg8BCgMAAQgBDwENBQABCAIPAQgEAAEIAQ8BDQQAAQoCDwEHBQABCAEPAQ0CAAEBAQsCDwEFBgABCAEPAQ0BAAEBAQwBDwEOAQQHAAEIAQ8BDQECAQ0BDwEOAQMIAAEIAQ8CDgEPAQ0BAgkAAQgEDwEMAQEJAAEIAQ8BDQEEAg8BDAEBCAABCAEPAQ0BAAEEAQ4BDwENAQEHAAEIAQ8BDQIAAQQBDgEPAQ0BAgYAAQgBDwENAwABBAEOAQ8BDQECBQABCAEPAQ0EAAEDAQ4BDwENAQIEAAEIAQ8BDQUAAQMBDgEPAQ0BAgMAAQgBDwENBgABAwEOAQ8BDQEC"],"l":[8,0,5,8,21,"AgABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPBQABBwIPAwA="],"m":[26,0,11,26,15,"AgABCAEPAQ0BAAEBAQgBDQEOAQ0BCQEBAwABBAELAg4BDAEGBgABCAEPAQ0BAgENBQ8BDQEBAQABBwYPAQkFAAEIAQ8BDgELAQwBBAIBAQYCDwEJAQUBDwEIAQIBAAECAQsCDwEDBAABCAIPAQ0BAQQAAQgBDwEOAQ0BBwQAAQEBDgEPAQkEAAEIAg8BBQUAAQMCDwENBgABCgEPAQ0EAAEIAg8BAQUAAQECDwEJBgABBwEPAQ4EAAEIAQ8BDgcAAg8BBwYAAQcCDwQAAQgBDwENBwACDwEHBgABBwIPBAABCAEPAQ0HAAIPAQcGAAEHAg8EAAEIAQ8BDQcAAg8BBwYAAQcCDwQAAQgBDwENBwACDwEHBgABBwIPBAABCAEPAQ0HAAIPAQcGAAEHAg8EAAEIAQ8BDQcAAg8BBwYAAQcCDwQAAQgBDwENBwACDwEHBgABBwIPBAABCAEPAQ0HAAIPAQcGAAEHAg8CAA=="],"n":[17,0,11,17,15,"AgABCAEPAQ0BAAEBAQcBDQEPAQ4BCwEDBgABCAEPAQ0BAQEMBg8BBQUAAQgBDwEOAQsBDQEFAgEBBAENAQ8BDgEBBAABCAIPAQ0BAQQAAQMCDwEGBAABCAIPAQUGAAENAQ8BCgQAAQgCDwEBBgABCgEPAQsEAAEIAQ8BDgcAAQkBDwEMBAABCAEPAQ0HAAEJAQ8BDAQAAQgBDwENBwABCQEPAQwEAAEIAQ8BDQcAAQkBDwEMBAABCAEPAQ0HAAEJAQ8BDAQAAQgBDwENBwABCQEPAQwEAAEIAQ8BDQcAAQkBDwEMBAABCAEPAQ0HAAEJAQ8BDAQAAQgBDwENBwABCQEPAQwCAA=="],"o":[17,0,11,17,15,"BAABAQEHAQwBDgEPAQ0BCgEECAABAwEOBw8BCgYAAQIBDgEPAQ4BBgEBAQABAwELAg8BCQUAAQoCDwEDBQABCgIPAQMDAAEBAg8BCQYAAQICDwEJAwABBQIPAQQHAAEMAQ8BDQMAAQcCDwECBwABCQIPAwABCAIPAQEHAAEIAg8DAAEHAg8BAgcAAQkCDwMAAQUCDwEEBwABDAEPAQ0DAAEBAg8BCQYAAQICDwEJBAABCgIPAQMFAAEKAg8BAwQAAQIBDgEPAQ4BBgEBAQABAwEKAg8BCQYAAQMBDgcPAQoIAAEBAQcBDAEOAQ8BDQEKAQQFAA=="],"p":[17,0,11,17,21,"AgABCAEPAQ0BAAEBAQgBDQEPAQ4BCgEDBgABCAEPAQ0BAgENBg8BBgUAAQgBDwEOAQwBDQEFAgEBBQENAg8BBAQAAQgCDwEOAQEEAAEBAQ0BDwENBAABCAIPAQYGAAEGAg8BAwMAAQgCDwECBgABAQIPAQcDAAEIAQ8BDggAAQ4BDwEJAwABCAEPAQ4IAAENAQ8BCgMAAQgBDwEOCAABDgEPAQkDAAEIAg8BAgYAAQECDwEHAwABCAIPAQYGAAEGAg8BAwMAAQgCDwEOAQEEAAEBAQ0BDwENBAABCAEPAQ4BDAENAQUCAQEEAQ0CDwEEBAABCAEPAQ0BAgENBg8BBgUAAQgBDwENAQABAQEIAQ0BDwEOAQoBAwYAAQgBDwENDgABCAEPAQ0OAAEIAQ8BDQ4AAQgBDwENDgABCAEPAQ0OAAEIAQ8BDQwA"],"q":[17,0,11,17,21,"BAABAgEJAQ0BDwENAQkBAgEAAQsBDwEKBQABBQYPAQ4BAwELAQ8BCgQAAQICDwEOAQUCAQEEAQwBDQEMAQ8BCgQAAQsBDwEOAQIEAAEBAQwCDwEKAwABAQIPAQgGAAEEAg8BCgMAAQUCDwEDBwABDgEPAQoDAAEHAg8BAQcAAQwBDwEKAwABCAIPCAABCwEPAQoDAAEHAg8BAQcAAQwBDwEKAwABBQIPAQMHAAEOAQ8BCgMAAQECDwEIBgABBAIPAQoEAAELAQ8BDgECBAABAQEMAg8BCgQAAQICDwEOAQUCAQEEAQwBDQEMAQ8BCgUAAQUGDwEOAQMBCwEPAQoGAAECAQkBDQEPAQ0BCQECAQABCwEPAQoOAAELAQ8BCg4AAQsBDwEKDgABCwEPAQoOAAELAQ8BCg4AAQsBDwEKDgABCwEPAQoCAA=="],"r":[11,0,11,12,15,"AgABCAEPAQ0BAAEBAQgBDQEOAQ8BAQIAAQgBDwENAQIBDQQPAQECAAEIAQ8BDgEMAQ0BBQEBBQABCAIPAQ0BAQcAAQgCDwEGCAABCAIPAQEIAAEIAQ8BDgkAAQgBDwENCQABCAEPAQ0JAAEIAQ8BDQkAAQgBDwENCQABCAEPAQ0JAAEIAQ8BDQkAAQgBDwENCQABCAEPAQ0HAA=="],"s":[14,0,11,14,15,"AwABAwEJAQ0BDgEPAQ0BDAEHAQIEAAEFCA8BDgMAAQEBDgEPAQwBBAEBAQABAgEDAQcBDAMAAQUCDwECCgABBgIPCwABAwIPAQkBAQoAAQsDDwELAQgBBAEBBgABAQEJBQ8BDgEJAQEGAAEBAQUBCQEMAw8BDQEBCQABAQEJAg8BCAsAAQ0BDwELCwABDQEPAQoCAAEHAQsBBgEDAQIBAAEBAQQBCwIPAQUCAAEICQ8BCAMAAQEBBAEIAQwBDQEPAQ4BDQEJAQMDAA=="],"t":[11,0,7,11,19,"AgABCAEPAQ4IAAEIAQ8BDggAAQgBDwEOCAABCAEPAQ4GAAEECA8BDgEAAQQIDwEOAwABCAEPAQ4IAAEIAQ8BDggAAQgBDwEOCAABCAEPAQ4IAAEIAQ8BDggAAQgBDwEOCAABCAEPAQ4IAAEIAQ8BDggAAQcBDwEOCAABBgIPAQEHAAEDAg8BCAEBBwABCwUPAQ4EAAEBAQgBDAEOAg8BDgEA"],"u":[17,0,11,17,15,"AgABCwEPAQsHAAEMAQ8BCgQAAQsBDwELBwABDAEPAQoEAAELAQ8BCwcAAQwBDwEKBAABCwEPAQsHAAEMAQ8BCgQAAQsBDwELBwABDAEPAQoEAAELAQ8BCwcAAQwBDwEKBAABCwEPAQsHAAEMAQ8BCgQAAQsBDwELBwABDAEPAQoEAAEKAQ8BCwcAAQwBDwEKBAABCgEPAQwHAAEOAQ8BCgQAAQgBDwEOBgABAwIPAQoEAAEFAg8BBQUAAQwCDwEKBQABDQEPAQ4BBQIBAQQBDAENAQwBDwEKBQABBAYPAQ0BAgEMAQ8BCgYAAQMBCgEOAQ8BDQEIAQEBAAEMAQ8BCgIA"],"v":[16,0,11,16,15,"AQEBDgEPAQgIAAEJAQ8BDgEBAQABCgEPAQ4IAAEOAQ8BCQIAAQQCDwEEBgABBQIPAQQDAAENAQ8BCgYAAQoBDwENBAABCAEPAQ4BAQQAAQECDwEIBAABAwIPAQYEAAEGAg8BAgUAAQwBDwELBAABDAEPAQwGAAEGAg8BAgIAAQICDwEGBgABAQIPAQcCAAEIAg8BAQcAAQoBDwENAgABDQEPAQoIAAEFAg8BAwEEAg8BBAkAAQ4BDwIJAQ8BDgoAAQkBDwIOAQ8BCAoAAQMEDwEDCwABDQIPAQwGAA=="],"w":[22,0,11,22,15,"AQABCwEPAQoFAAEIAg8BCQUAAQkBDwEMAgABBwEPAQ4FAAEMAg8BDQUAAQ0BDwEJAgABAwIPAQMDAAEBBA8BAgMAAQICDwEFAwABDgEPAQcDAAEEAQ8BDQELAQ8BBgMAAQYCDwEBAwABCwEPAQsDAAEIAQ8BCQEHAQ8BCgMAAQoBDwEMBAABBwEPAQ4DAAEMAQ8BBQEEAQ8BDQMAAQ4BDwEIBAABAwIPAQQBAAEBAg8BAQEAAQ4BDwECAQABAgIPAQQFAAEOAQ8BCAEAAQUBDwEMAgABCwEPAQYBAAEGAg8BAQUAAQoBDwELAQABCQEPAQgCAAEHAQ8BCgEAAQoBDwEMBgABBgIPAQEBDQEPAQQCAAEDAQ8BDgEAAQ4BDwEIBgABAgIPAQYCDwEBAwABDgEPAQYCDwEEBwABDgEPAQ0BDwEMBAABCgEPAQ0BDwEOCAABCgMPAQgEAAEGAw8BCwgAAQYDDwEEBAABAwMPAQcIAAECAg8BDgYAAQ4CDwEDBAA="],"x":[16,0,11,16,15,"AQABBgIPAQcGAAEGAg8BBwMAAQoCDwEEBAABAwIPAQsEAAEBAQ0BDwENAQECAAEBAQ0BDwEOAQEFAAEDAg8BCgIAAQkCDwEEBwABBwIPAQYBBQIPAQgJAAEKAg8BDgEPAQwKAAEBAQ0CDwEOAQILAAELAg8BCgsAAQcEDwEFCQABAwIPAQoBCwEPAQ4BAgcAAQEBDQEPAQ0BAQECAQ4BDwEMBwABCgIPAQMCAAEFAg8BCAUAAQYCDwEHBAABCQIPAQQDAAECAQ4BDwELBgABDAEPAQ4BAQIAAQwBDwEOAQEGAAEDAQ4BDwELAQA="],"y":[16,0,11,16,21,"AQEBDgEPAQkIAAEJAQ8BDgEBAQABCQEPAQ4HAAEBAQ4BDwEJAgABAwIPAQUGAAEGAg8BAwMAAQwBDwELBgABDAEPAQwEAAEGAg8BAgQAAQICDwEGBAABAQEOAQ8BCAQAAQgCDwEBBQABCQEPAQ4EAAEOAQ8BCgYAAQMCDwEFAgABBQIPAQQHAAEMAQ8BCwIAAQsBDwENCAABBgIPAgICDwEHCAABAQEOAQ8BBwEIAg8BAgkAAQkBDwENAQ4BDwELCgABAgQPAQULAAELAg8BDgwAAQYCDwEIDAABBwIPAQIMAAENAQ8BCwwAAQQCDwEFCwABAwENAQ8BDQoAAQ0EDwEECgABDQEPAQ4BCwEECQA="],"z":[14,0,11,14,15,"AQABCAsPAgABCAsPCgABAwEOAQ8BDAkAAQIBDQEPAQ0BAQgAAQEBDAEPAQ4BAgkAAQoCDwEECQABCAIPAQYJAAEGAg8BCAkAAQQCDwELCQABAgEOAQ8BDAEBCAABAQENAQ8BDgECCQABCwEPAQ4BAwkAAQkCDwEFCgABDQsPAgABDQsPAQA="],"{":[17,0,5,17,25,"CAABAQEIAQwBDgEPAQwLAAEMBA8BDAoAAQQCDwEJAQIMAAEHAg8BAQ0AAQgBDwEODgABCAEPAQ4OAAEIAQ8BDg4AAQgBDwEODgABCQEPAQ0OAAEMAQ8BDAwAAQIBCAIPAQcKAAEJAw8BDgEHCwABCQMPAQ0BBg0AAQIBCgIPAQUOAAENAQ8BCw4AAQoBDwENDgABCAEPAQ4OAAEIAQ8BDg4AAQgBDwEODgABCAEPAQ4OAAEIAQ8BDg4AAQYCDwEBDQABAwIPAQoBAg0AAQwEDwEMCwABAQEHAQwBDgEPAQwDAA=="],"|":[9,0,5,9,27,"AwABCQEPAQoGAAEJAQ8BCgYAAQkBDwEKBgABCQEPAQoGAAEJAQ8BCgYAAQkBDwEKBgABCQEPAQoGAAEJAQ8BCgYAAQkBDwEKBgABCQEPAQoGAAEJAQ8BCgYAAQkBDwEKBgABCQEPAQoGAAEJAQ8BCgYAAQkBDwEKBgABCQEPAQoGAAEJAQ8BCgYAAQkBDwEKBgABCQEPAQoGAAEJAQ8BCgYAAQkBDwEKBgABCQEPAQoGAAEJAQ8BCgYAAQkBDwEKBgABCQEPAQoGAAEJAQ8BCgYAAQkBDwEKAwA="],"}":[17,0,5,17,25,"AwABCQEPAQ4BDAEJAQILAAEJBA8BDgEBDAABAQEHAg8BBg4AAQ0BDwEJDgABCwEPAQoOAAELAQ8BCg4AAQsBDwEKDgABCwEPAQoOAAELAQ8BCw4AAQkBDwEODgABBAIPAQoBAw0AAQUBDQMPAQwLAAEEAQwDDwEMCgABAwIPAQsBAwwAAQgCDwEBDQABCgEPAQwOAAELAQ8BCw4AAQsBDwEKDgABCwEPAQoOAAELAQ8BCg4AAQsBDwEKDgABDQEPAQkMAAEBAQcCDwEGCgABCQQPAQ0BAQoAAQkBDwEOAQwBCAEBCAA="],"~":[23,0,15,23,11,"EwABAQcAAQEBCAEMAg4BCwEGAQEGAAEFAQsGAAEHAQ4GDwEOAQoBBAIBAQQBCgEPAQwFAAECAQ8BDgEHAQIBAAECAQYBDAcPAQ0BAwUAAQIBCQEBBgABAwEIAQwCDgELAQaPAA=="],"А":[18,0,6,19,20,"BwABBwIPAQ4PAAENAw8BBQ0AAQMEDwEKDQABCQEPAQ4BCAIPAQEMAAEOAQ8BCQECAg8BBwsAAQUCDwEEAQABDAEPAQwLAAELAQ8BDQIAAQcCDwEDCQABAgIPAQgCAAEBAg8BCAkAAQcCDwEDAwABCwEPAQ4JAAENAQ8BDQQAAQYCDwEFBwABAwIPAQcEAAEBAg8BCgcAAQkCDwECBQABCgIPAQEGAAEOAQ8BDAYAAQUCDwEHBQABBQwPAQwFAAELDQ8BAwMAAQICDwEJCAABAgIPAQgDAAEHAg8BBAkAAQwBDwEOAwABDQEPAQ4KAAEGAg8BBQEAAQMCDwEICgABAQIPAQoBAAEJAg8BAwsAAQoCDwEB"],"Б":[19,0,6,19,20,"AgABBQwPAQQFAAEFDA8BBAUAAQUCDwEFDwABBQIPAQUPAAEFAg8BBQ8AAQUCDwEFDwABBQIPAQUPAAEFAg8BBQ8AAQUHDwEOAQ0BCgEEBwABBQsPAQsBAQUAAQUCDwEFBAABAQEEAQwCDwEKBQABBQIPAQUHAAEMAg8BAwQAAQUCDwEFBwABBgIPAQcEAAEFAg8BBQcAAQQCDwEJBAABBQIPAQUHAAEEAg8BCQQAAQUCDwEFBwABBgIPAQcEAAEFAg8BBQcAAQwCDwEDBAABBQIPAQUEAAEBAQQBDAIPAQsFAAEFCw8BCwEBBQABBQcPAQ4BDQEKAQUFAA=="],"В":[19,0,6,19,20,"AgABBQcPAQ4BDAEIAQIHAAEFCw8BBgYAAQUCDwEFBAABAgEHAQ4CDwEDBQABBQIPAQUGAAEEAg8BCQUAAQUCDwEFBwABDgEPAQsFAAEFAg8BBQcAAQ4BDwEKBQABBQIPAQUGAAEEAg8BBwUAAQUCDwEFBAABAgEGAQ4BDwENAQEFAAEFCQ8BDgEIAQEGAAEFCg8BCwEDBgABBQIPAQUEAAEBAQQBDAEPAQ4BBAUAAQUCDwEFBwABDAEPAQ4BAQQAAQUCDwEFBwABBgIPAQYEAAEFAg8BBQcAAQQCDwEIBAABBQIPAQUHAAEEAg8BCQQAAQUCDwEFBwABBgIPAQcEAAEFAg8BBQcAAQwCDwEDBAABBQIPAQUEAAEBAQQBDAIPAQoFAAEFCw8BCgEBBQABBQcPAQ4BDQEKAQQFAA=="],"Г":[16,0,6,16,20,"AgABBQsPAQ0DAAEFCw8BDQMAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQoA"],"Д":[21,0,6,21,24,"BQABAwsPAQgIAAEDCw8BCAgAAQMCDwEHBQABAgIPAQgIAAEDAg8BBwUAAQICDwEICAABAwIPAQcFAAECAg8BCAgAAQMCDwEHBQABAgIPAQgIAAEEAg8BBgUAAQICDwEICAABBAIPAQYFAAECAg8BCAgAAQUCDwEFBQABAgIPAQgIAAEHAg8BBAUAAQICDwEICAABCAIPAQIFAAECAg8BCAgAAQoCDwEBBQABAgIPAQgIAAEMAQ8BDQYAAQICDwEICAABDgEPAQsGAAECAg8BCAcAAQMCDwEIBgABAgIPAQgHAAEHAg8BBAYAAQICDwEIBgABAQEOAQ8BDgcAAQICDwEIBQABAgEMAg8BBwcAAQICDwEIBAABChEPAQwCAAEKEQ8BDAIAAQoBDwEJDQABBwEPAQwCAAEKAQ8BCQ0AAQcBDwEMAgABCgEPAQkNAAEHAQ8BDAIAAQoBDwEJDQABBwEPAQwBAA=="],"Е":[17,0,6,17,20,"AgABBQwPAQEDAAEFDA8BAQMAAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQULDwEKBAABBQsPAQoEAAEFAg8BBQ0AAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQUCDwEFDQABBQwPAQUDAAEFDA8BBQEA"],"Ж":[29,0,6,29,20,"AQABCAIPAQoIAAEMAQ8BDQgAAQkCDwEKAwABCgIPAQkHAAEMAQ8BDQcAAQgCDwELBQABCwIPAQcGAAEMAQ8BDQYAAQYCDwEMAQEFAAEBAQwCDwEGBQABDAEPAQ0FAAEFAg8BDQEBBwABAQENAg8BBQQAAQwBDwENBAABBAIPAQ0BAgkAAQIBDQIPAQQDAAEMAQ8BDQMAAQMBDgEPAQ4BAgsAAQIBDgEPAQ4BAwIAAQwBDwENAgABAgEOAQ8BDgEDDQABAwIPAQ4BAgEAAQwBDwENAQABAQENAg8BBA4AAQMDDwENAQEBDAEPAQ0BAQEMAw8BBA4AAQwBDwEOAg8BDAENAQ8BDQELAg8BDgEPAQ0BAQwAAQcCDwEFAQcHDwEIAQMCDwEICwABAgIPAQoCAAEIBQ8BCgIAAQkCDwEDCgABCwEPAQ4BAgMAAQoDDwELAwABAQENAQ8BDAkAAQYCDwEGBQABDQEPAQ4BAQQAAQUCDwEHBwABAQEOAQ8BDAYAAQwBDwENBgABCgEPAQ4BAgYAAQkCDwEDBgABDAEPAQ0GAAECAQ4BDwELBQABBAIPAQgHAAEMAQ8BDQcAAQYCDwEFBAABDQEPAQ0IAAEMAQ8BDQgAAQwBDwEOAQECAAEIAg8BBAgAAQwBDwENCAABAwIPAQkBAAEDAg8BCQkAAQwBDwENCQABCAIPAQQ="],"З":[17,0,6,17,20,"BAABBQEKAQ0BDwEOAQ0BCgEGBwABBQENCA8BDQEEBQACDwENAQQBAQEAAQEBAgEGAQ0CDwEDBAABDwELAQEGAAEBAQ4BDwEMBAABCQkAAQoCDw4AAQkCDw0AAQEBDgEPAQsLAAECAQUBDQIPAQQHAAEMBg8BDQEECAABDAUPAQ0BBgEBCwABAQECAQYBDQEPAQ0BAg0AAQEBDQEPAQ0OAAEGAg8BBA0AAQICDwEHDQABAwIPAQcCAAEDAQUJAAEGAg8BBQIAAQMBDwEHBwABAgENAQ8BDgEBAgABAwIPAQsBBQEBAQABAQEDAQcBDgIPAQUEAAEIAQ4IDwENAQQGAAEBAQYBCgENAQ8BDgENAQoBBQUA"],"И":[20,0,6,20,20,"AgABBQIPAQQHAAEEAw8BCAQAAQUCDwEEBwABDAMPAQgEAAEFAg8BBAYAAQUEDwEIBAABBQIPAQQGAAENAQ8BDQIPAQgEAAEFAg8BBAUAAQYCDwEFAg8BCAQAAQUCDwEEBQABDQEPAQwBAQIPAQgEAAEFAg8BBAQAAQYCDwEEAQACDwEIBAABBQIPAQQDAAEBAQ4BDwELAgACDwEIBAABBQIPAQQDAAEHAg8BBAIAAg8BCAQAAQUCDwEEAgABAQEOAQ8BCwMAAg8BCAQAAQUCDwEEAgABCAIPAQMDAAIPAQgEAAEFAg8BBAEAAQEBDgEPAQoEAAIPAQgEAAEFAg8BBAEAAQgCDwECBAACDwEIBAABBQIPAQQBAgIPAQkFAAIPAQgEAAEFAg8BBAEJAg8BAgUAAg8BCAQAAQUCDwEGAg8BCQYAAg8BCAQAAQUCDwENAQ8BDgEBBgACDwEIBAABBQQPAQgHAAIPAQgEAAEFAw8BDgEBBwACDwEIBAABBQMPAQcIAAIPAQgCAA=="],"Й":[20,0,1,20,25,"BQABAQEPAQwBAwIAAQMBDAEODAABCQYPAQgNAAEHAQwCDgEMAQYxAAEFAg8BBAcAAQQDDwEIBAABBQIPAQQHAAEMAw8BCAQAAQUCDwEEBgABBQQPAQgEAAEFAg8BBAYAAQ0BDwENAg8BCAQAAQUCDwEEBQABBgIPAQUCDwEIBAABBQIPAQQFAAENAQ8BDAEBAg8BCAQAAQUCDwEEBAABBgIPAQQBAAIPAQgEAAEFAg8BBAMAAQEBDgEPAQsCAAIPAQgEAAEFAg8BBAMAAQcCDwEEAgACDwEIBAABBQIPAQQCAAEBAQ4BDwELAwACDwEIBAABBQIPAQQCAAEIAg8BAwMAAg8BCAQAAQUCDwEEAQABAQEOAQ8BCgQAAg8BCAQAAQUCDwEEAQABCAIPAQIEAAIPAQgEAAEFAg8BBAECAg8BCQUAAg8BCAQAAQUCDwEEAQkCDwECBQACDwEIBAABBQIPAQYCDwEJBgACDwEIBAABBQIPAQ0BDwEOAQEGAAIPAQgEAAEFBA8BCAcAAg8BCAQAAQUDDwEOAQEHAAIPAQgEAAEFAw8BBwgAAg8BCAIA"],"К":[19,0,6,19,20,"AgABBQIPAQUIAAEKAg8BCwMAAQUCDwEFBwABCQIPAQsBAQMAAQUCDwEFBgABCQIPAQwBAQQAAQUCDwEFBQABCAIPAQwBAQUAAQUCDwEFBAABCAIPAQ0BAQYAAQUCDwEFAwABBwIPAQ0BAQcAAQUCDwEFAgABBgIPAQ0BAggAAQUCDwEFAQABBgIPAQ4BAgkAAQUCDwIFAw8BDgEBCQABBQIPAQkCDwEOAg8BCgkAAQUEDwEOAQMBCQIPAQUIAAEFAw8BDgEDAQABAQENAQ8BDgEBBwABBQIPAQ4BBAMAAQQCDwEKBwABBQIPAQYFAAEJAg8BBQYAAQUCDwEFBQABAQENAQ8BDgEBBQABBQIPAQUGAAEEAg8BCgUAAQUCDwEFBwABCQIPAQUEAAEFAg8BBQcAAQEBDQEPAQ4BAQMAAQUCDwEFCAABBAIPAQoDAAEFAg8BBQkAAQkCDwEF"],"Л":[20,0,6,20,20,"BQABAQsPAQoHAAEBCw8BCgcAAQECDwEJBgACDwEKBwABAQIPAQkGAAIPAQoHAAEBAg8BCQYAAg8BCgcAAQECDwEIBgACDwEKBwABAgIPAQgGAAIPAQoHAAECAg8BCAYAAg8BCgcAAQMCDwEHBgACDwEKBwABBAIPAQYGAAIPAQoHAAEFAg8BBQYAAg8BCgcAAQcCDwEDBgACDwEKBwABCQIPAQEGAAIPAQoHAAEMAQ8BDQcAAg8BCgYAAQECDwEJBwACDwEKBgABBgIPAQUHAAIPAQoFAAEDAQ4BDwEMCAACDwEKAwABAgEHAQ4BDwEOAQMIAAIPAQoDAAENAg8BDQEDCQACDwEKAwABDAEKAQULAAIPAQoCAA=="],"М":[23,0,6,23,20,"AgABBQMPAQwJAAEIAw8BCgQAAQUEDwEDCAABDQMPAQoEAAEFAg8BDgEPAQgHAAEEBA8BCgQAAQUCDwEJAQ8BDgcAAQkBDwEKAQ4BDwEKBAABBQIPAQQBDgEPAQQFAAEBAQ4BDwEEAQ4BDwEKBAABBQIPAQQBCQEPAQoFAAEGAQ8BDQEAAQ4BDwEKBAABBQIPAgQCDwEBBAABCwEPAQgBAAEOAQ8BCgQAAQUCDwEEAQABDQEPAQYDAAECAg8BAgEAAQ4BDwEKBAABBQIPAQQBAAEHAQ8BDAMAAQcBDwEMAgABDgEPAQoEAAEFAg8BBAEAAQICDwECAgABDQEPAQYCAAEOAQ8BCgQAAQUCDwEEAgABCwEPAQgBAAEEAg8BAQIAAQ4BDwEKBAABBQIPAQQCAAEGAQ8BDQEAAQkBDwEKAwABDgEPAQoEAAEFAg8BBAIAAQEBDgEPAQUBDgEPAQQDAAEOAQ8BCgQAAQUCDwEEAwABCQEPAQ4BDwEOBAABDgEPAQoEAAEFAg8BBAMAAQQDDwEIBAABDgEPAQoEAAEFAg8BBAQAAQ0CDwEDBAABDgEPAQoEAAEFAg8BBAwAAQ4BDwEKBAABBQIPAQQMAAEOAQ8BCgQAAQUCDwEEDAABDgEPAQoEAAEFAg8BBAwAAQ4BDwEKAgA="],"Н":[20,0,6,20,20,"AgABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUODwEKBAABBQ4PAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgIA"],"О":[21,0,6,21,20,"BgABAgEHAQwBDgEPAQ4BDAEJAQMLAAEICQ8BCgEBCAABCwIPAQ0BBgECAQABAQEEAQsCDwENAQIGAAEJAg8BCgcAAQcCDwEMBQABAwIPAQwJAAEJAg8BBwQAAQoCDwEDCQABAQEOAQ8BDgMAAQECDwENCwABCQIPAQQCAAEEAg8BCQsAAQUCDwEHAgABBgIPAQYLAAEDAg8BCQIAAQcCDwEFCwABAgIPAQoCAAEHAg8BBQsAAQICDwEKAgABBgIPAQYLAAEDAg8BCQIAAQQCDwEJCwABBQIPAQcCAAEBAg8BDQsAAQkCDwEEAwABCgIPAQMJAAEBAQ4BDwEOBAABAwIPAQwJAAEIAg8BBwUAAQkCDwEKBwABBgIPAQwHAAELAg8BDQEGAQIBAAEBAQQBCwIPAQ0BAggAAQgJDwEKAQEKAAECAQcBDAEOAQ8BDgEMAQkBAwYA"],"П":[20,0,6,20,20,"AgABBQ4PAQoEAAEFDg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgQAAQUCDwEFCQACDwEKBAABBQIPAQUJAAIPAQoEAAEFAg8BBQkAAg8BCgIA"],"Р":[16,0,6,16,20,"AgABBQYPAQ4BDQEJAQMFAAEFCg8BCAQAAQUCDwEFAwABAQEGAQ4CDwEHAwABBQIPAQUFAAECAg8BDgMAAQUCDwEFBgABCgIPAQMCAAEFAg8BBQYAAQcCDwEFAgABBQIPAQUGAAEHAg8BBQIAAQUCDwEFBgABCgIPAQMCAAEFAg8BBQUAAQICDwEOAwABBQIPAQUDAAEBAQUBDgIPAQcDAAEFCg8BCQQAAQUGDwEOAQ0BCQEDBQABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQwAAQUCDwEFDAABBQIPAQUMAAEFAg8BBQoA"],"С":[19,0,6,19,20,"BgABAQEGAQoBDQEOAQ8BDQELAQcBAQgAAQcBDgkPAQgBAQUAAQoCDwEOAQcBAwEBAQABAgEGAQwCDwEGBAABCAIPAQoBAQcAAQYBDgEGAwABAwIPAQwKAAEDAQUDAAEKAg8BAw8AAg8BDA8AAQQCDwEJDwABBgIPAQYPAAEHAg8BBQ8AAQcCDwEFDwABBgIPAQYPAAEEAg8BCRAAAg8BDBAAAQoCDwEDDwABAwIPAQwKAAEDAQUEAAEIAg8BCgEBBwABBQEOAQYFAAEKAg8BDgEHAQMBAQEAAQIBBgELAg8BBgYAAQcBDgkPAQgBAQcAAQEBBgELAQ0BDgEPAQ0BCwEHAQEDAA=="],"Т":[16,-1,6,18,20,"AQEQDwEJAQEQDwEJBwABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJDgABAQIPAQkOAAEBAg8BCQ4AAQECDwEJBwA="],"У":[16,0,6,16,20,"AQUCDwEICAABAgIPAQwBAAEOAQ8BDgEBBwABCAIPAQUBAAEIAg8BBgcAAQ4BDwEOAgABAgIPAQwGAAEFAg8BCAMAAQoCDwEDBQABDAIPAQIDAAEEAg8BCgQAAQMCDwEKBQABDQIPAQEDAAEKAg8BBAUAAQcCDwEIAgABAQIPAQ0GAAEBAg8BDgIAAQcCDwEGBwABCgIPAQUBAAENAQ8BDgEBBwABAwIPAQwBBQIPAQkJAAEMAg8BDQIPAQMJAAEGBA8BCwoAAQEBDgMPAQULAAEJAg8BDgwAAQUCDwEIDAABCgIPAQIKAAEBAQYCDwEKCQABBgQPAQ4BAgkAAQYBDwEOAQ0BCQECCAA="],"Ф":[23,0,6,23,20,"CgABCwIPFAABCwIPEAABAwEIAQsBDQMPAQ4BDAEJAQQKAAECAQsLDwENAQUHAAEEAQ4CDwELAQYBAgELAg8BAQEEAQkDDwEIBQABAgEOAg8BBQMAAQsCDwMAAQMBDQIPAQUEAAEKAg8BBgQAAQsCDwQAAQICDwENAwABAQIPAQ0FAAELAg8FAAEJAg8BBAIAAQQCDwEJBQABCwIPBQABBQIPAQgCAAEFAg8BBwUAAQsCDwUAAQMCDwEJAgABBgIPAQYFAAELAg8FAAEDAg8BCQIAAQQCDwEIBQABCwIPBQABBAIPAQgCAAEBAg8BCwUAAQsCDwUAAQgCDwEEAwABCgIPAQMEAAELAg8EAAEBAQ4BDwENBAABAgEOAQ8BDQECAwABCwIPAwABAQEKAg8BBQUAAQUBDgEPAQ4BBwEBAQABCwIPAQABAQEFAQ0CDwEIBwABAwELAw8BDQEOAg8BDAMPAQ0BBQoAAQMBCAELAQ0DDwEOAQwBCQEEEAABCwIPFAABCwIPCgA="],"Х":[18,0,6,19,20,"AQABAQEOAQ8BDQEBBwABAQENAQ8BDQEBAwABBQIPAQgHAAEKAg8BAwUAAQoCDwEDBQABBQIPAQgGAAEBAQ4BDwEMBAABAQEOAQ8BDAgAAQUCDwEIAwABCgIPAQMJAAEKAg8BAwEAAQUCDwEHCgABAgEOAQ8BDAECAQ4BDwEMDAABBgIPAQ4CDwEDDQABCwMPAQcOAAEEAg8BDg8AAQsDDwEHDQABBwIPAQ4BDwEOAQILAAECAQ4BDwELAQICDwELCwABDAEPAQ4BAgEAAQcCDwEGCQABBwIPAQYDAAEMAQ8BDgECBwABAwIPAQsEAAEDAg8BCwcAAQwBDwEOAQIFAAEIAg8BBQUAAQgCDwEFBwABDAEPAQ4BAQMAAQMCDwEKCAABAwIPAQoDAAENAQ8BDgEBCQABCAIPAQUBAA=="],"Ц":[21,0,6,21,24,"AgABBQIPAQUJAAIPAQoFAAEFAg8BBQkAAg8BCgUAAQUCDwEFCQACDwEKBQABBQIPAQUJAAIPAQoFAAEFAg8BBQkAAg8BCgUAAQUCDwEFCQACDwEKBQABBQIPAQUJAAIPAQoFAAEFAg8BBQkAAg8BCgUAAQUCDwEFCQACDwEKBQABBQIPAQUJAAIPAQoFAAEFAg8BBQkAAg8BCgUAAQUCDwEFCQACDwEKBQABBQIPAQUJAAIPAQoFAAEFAg8BBQkAAg8BCgUAAQUCDwEFCQACDwEKBQABBQIPAQUJAAIPAQoFAAEFAg8BBQkAAg8BCgUAAQUCDwEFCQACDwEKBQABBRAPAQ0DAAEFEA8BDRIAAQUBDwENEgABBQEPAQ0SAAEFAQ8BDRIAAQUBDwENAQA="],"Ч":[19,0,6,19,20,"AgABCgEPAQ4IAAEMAQ8BDQUAAQoBDwEOCAABDAEPAQ0FAAEKAQ8BDggAAQwBDwENBQABCgEPAQ4IAAEMAQ8BDQUAAQoBDwEOCAABDAEPAQ0FAAEKAQ8BDggAAQwBDwENBQABCgIPCAABDAEPAQ0FAAEIAg8BAwcAAQwBDwENBQABBAIPAQgHAAEMAQ8BDQYAAQ0CDwEHAQEFAAEMAQ8BDQYAAQMBDgoPAQ0HAAECAQkBDQgPAQ0QAAEMAQ8BDRAAAQwBDwENEAABDAEPAQ0QAAEMAQ8BDRAAAQwBDwENEAABDAEPAQ0QAAEMAQ8BDRAAAQwBDwENAwA="],"Ш":[29,0,6,29,20,"AgABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBAABBRcPAQMEAAEFFw8BAwIA"],"Щ":[30,0,6,30,24,"AgABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBQIPAQUHAAENAQ8BDAcAAQcCDwEDBQABBRkPAQcDAAEFGQ8BBxsAAQwBDwEHGwABDAEPAQcbAAEMAQ8BBxsAAQwBDwEHAQA="],"Ъ":[22,0,6,22,20,"AQMIDwEEDAABAwgPAQQSAAEGAg8BBBIAAQYCDwEEEgABBgIPAQQSAAEGAg8BBBIAAQYCDwEEEgABBgIPAQQSAAEGBw8BDgENAQoBBAoAAQYLDwEKCQABBgIPAQQEAAEBAQUBDAIPAQkIAAEGAg8BBAYAAQEBDQIPAQIHAAEGAg8BBAcAAQcCDwEGBwABBgIPAQQHAAEEAg8BCAcAAQYCDwEEBwABBAIPAQgHAAEGAg8BBAcAAQcCDwEGBwABBgIPAQQGAAEBAQ0CDwECBwABBgIPAQQEAAEBAQUBDAIPAQkIAAEGCw8BCgkAAQYHDwEOAQ0BCgEEBAA="],"Ы":[24,0,6,24,20,"AgABBQIPAQUMAAEHAg8BAwQAAQUCDwEFDAABBwIPAQMEAAEFAg8BBQwAAQcCDwEDBAABBQIPAQUMAAEHAg8BAwQAAQUCDwEFDAABBwIPAQMEAAEFAg8BBQwAAQcCDwEDBAABBQIPAQUMAAEHAg8BAwQAAQUCDwEFDAABBwIPAQMEAAEFBw8BDgENAQoBBAQAAQcCDwEDBAABBQsPAQsBAQIAAQcCDwEDBAABBQIPAQUEAAEBAQQBDAIPAQoCAAEHAg8BAwQAAQUCDwEFBwABDAIPAQMBAAEHAg8BAwQAAQUCDwEFBwABBgIPAQcBAAEHAg8BAwQAAQUCDwEFBwABBAIPAQkBAAEHAg8BAwQAAQUCDwEFBwABBAIPAQkBAAEHAg8BAwQAAQUCDwEFBwABBgIPAQcBAAEHAg8BAwQAAQUCDwEFBgABAQENAg8BAwEAAQcCDwEDBAABBQIPAQUEAAEBAQQBDAIPAQoCAAEHAg8BAwQAAQULDwELAQECAAEHAg8BAwQAAQUHDwEOAQ0BCgEEBAABBwIPAQMCAA=="],"Ь":[19,0,6,19,20,"AgABBQIPAQUPAAEFAg8BBQ8AAQUCDwEFDwABBQIPAQUPAAEFAg8BBQ8AAQUCDwEFDwABBQIPAQUPAAEFAg8BBQ8AAQUHDwEOAQ0BCgEEBwABBQsPAQsBAQUAAQUCDwEFBAABAQEEAQwCDwEKBQABBQIPAQUHAAEMAg8BAwQAAQUCDwEFBwABBgIPAQcEAAEFAg8BBQcAAQQCDwEJBAABBQIPAQUHAAEEAg8BCQQAAQUCDwEFBwABBgIPAQcEAAEFAg8BBQYAAQEBDQIPAQMEAAEFAg8BBQQAAQEBBAEMAg8BCgUAAQULDwELAQEFAAEFBw8BDgENAQoBBAUA"],"Э":[19,0,6,19,20,"AwABAgEIAQsBDgEPAQ4BDQEKAQYBAQcAAQEBCQkPAQ0BBQYAAQgCDwELAQUBAgEAAQEBAwEHAQ0CDwEIBQABCAEOAQUHAAEBAQsCDwEGBAABBgECCQABAQENAQ8BDgEBDwABBgIPAQgQAAEOAQ8BDRAAAQsCDwEBDwABCAIPAQMFAA0PAQUFAA0PAQUPAAEIAg8BAw8AAQsCDwECDwABDgEPAQ0PAAEGAg8BCAMAAQYBAgkAAQEBDQIPAQEDAAEIAQ4BBQcAAQEBCwIPAQYEAAEIAg8BCwEFAQIBAAEBAQMBBwENAg8BCAUAAQEBCQkPAQ4BBQgAAQIBBwELAQ4BDwEOAQ0BCgEGAQEGAA=="],"Ю":[29,0,6,29,20,"AgABAwIPAQcIAAECAQgBDAEOAQ8BDgEMAQgBAwgAAQMCDwEHBwABCQkPAQoBAQYAAQMCDwEHBQABAQELAg8BDAEFAQIBAAEBAQUBDAIPAQwBAQUAAQMCDwEHBQABCQIPAQkHAAEIAg8BCwUAAQMCDwEHBAABBAIPAQsJAAEKAg8BBgQAAQMCDwEHBAABCwIPAQIJAAEBAg8BDQQAAQMCDwEHAwABAQIPAQsLAAEKAg8BAgMAAQMCDwEHAwABBQIPAQcLAAEHAg8BBgMAAQMCDwEHAwABBwIPAQULAAEEAg8BCAMAAQMJDwEECwABAwIPAQkDAAEDCQ8BBAsAAQMCDwEJAwABAwIPAQcDAAEHAg8BBQsAAQQCDwEIAwABAwIPAQcDAAEFAg8BBwsAAQcCDwEGAwABAwIPAQcDAAEBAg8BCwsAAQoCDwECAwABAwIPAQcEAAELAg8BAgkAAQECDwENBAABAwIPAQcEAAEEAg8BCwkAAQoCDwEGBAABAwIPAQcFAAEJAg8BCQcAAQgCDwELBQABAwIPAQcFAAEBAQsCDwEMAQUBAgEAAQEBBQEMAg8BDAEBBQABAwIPAQcHAAEJCQ8BCgEBBgABAwIPAQcIAAECAQgBDAEOAQ8BDgEMAQgBAwYA"],"Я":[19,0,6,19,20,"BQABBAEKAQ0BDgcPAQIFAAEBAQsLDwECBQABCQIPAQwBBQECBAABCAIPAQIEAAECAg8BDgEBBgABCAIPAQIEAAEGAg8BCQcAAQgCDwECBAABBwIPAQcHAAEIAg8BAgQAAQcCDwEJBwABCAIPAQIEAAEEAg8BDgEBBgABCAIPAQIFAAENAg8BDQEFAQIEAAEIAg8BAgUAAQMBDgsPAQIGAAEBAQgBDgkPAQIIAAECAg8BCQMAAQgCDwECCAABCQEPAQ4BAQMAAQgCDwECBwABAwIPAQcEAAEIAg8BAgcAAQwBDwENBQABCAIPAQIGAAEHAg8BBAUAAQgCDwECBQABAgEOAQ8BCwYAAQgCDwECBQABCgIPAQIGAAEIAg8BAgQAAQQCDwEJBwABCAIPAQIEAAENAQ8BDgEBBwABCAIPAQICAA=="],"а":[17,0,11,17,15,"AwABAwEIAQsBDQEPAQ4BDAEIAQIHAAEECA8BDgEEBgABBAELAQYBAwECAQABAgEGAQ0BDwEOAQINAAEBAQ4BDwEIDgABCAEPAQwOAAEFAg8GAAEBAQYBCwENAQ4GDwEBBAABAwENCg8BAQQAAQ0BDwEOAQcBAwEBAwABBQIPAQEDAAEDAg8BBQYAAQcCDwEBAwABBQIPAQEGAAELAg8BAQMAAQQCDwEEBQABBQMPAQEDAAEBAQ4BDwEOAQUBAQEAAQMBCAEPAQoCDwEBBAABBQcPAQgBBQIPAQEFAAEDAQoBDgEPAQ4BCgEEAQABBQIPAQECAA=="],"б":[17,0,4,17,22,"DAACAQkAAQQBCQEMAQ4DDwEKBwABAwENBw8BDQYAAQQDDwELAQYBBAEDAQEHAAECAQ4BDwEOAQQMAAEKAQ8BDgECDAABAQIPAQYNAAEFAg8BAgEGAQsBDgEPAQ4BCwEFBgABBgIPAQ0HDwELAQEEAAEIBA8BBwECAQABAwEJAg8BCwQAAQcDDwEFBQABCAIPAQUDAAEHAg8BCwYAAQEBDgEPAQsDAAEGAg8BBgcAAQkBDwEOAwABBgIPAQQHAAEHAg8BAgIAAQYCDwEDBwABBgIPAQICAAEFAg8BBAcAAQcCDwECAgABAwIPAQYHAAEJAQ8BDgQAAQ4BDwELBgABAQEOAQ8BCwQAAQgCDwEFBQABCAIPAQUEAAEBAQ4CDwEHAQIBAAECAQkCDwELBgABAwENBw8BCwEBBwABAQEHAQwBDgEPAQ4BCwEFBQA="],"в":[16,0,11,16,15,"AgABCAYPAQ4BCwEGBgABCAkPAQsFAAEIAQ8BDQMAAQEBAwELAg8BBgQAAQgBDwENBgABDgEPAQkEAAEIAQ8BDQYAAQ4BDwEIBAABCAEPAQ0DAAEBAQMBCwIPAQIEAAEICA8BCwEDBQABCAgPAQ0BBgUAAQgBDwENBAABAgEHAg8BCAQAAQgBDwENBgABCAIPAQEDAAEIAQ8BDQYAAQUCDwEEAwABCAEPAQ0GAAEIAg8BAwMAAQgBDwENBAABAgEHAg8BDgQAAQgJDwEOAQQEAAEIBg8BDgEMAQgBAgMA"],"г":[14,0,11,14,15,"AgABCAkPAQ0DAAEICQ8BDQMAAQgBDwENCwABCAEPAQ0LAAEIAQ8BDQsAAQgBDwENCwABCAEPAQ0LAAEIAQ8BDQsAAQgBDwENCwABCAEPAQ0LAAEIAQ8BDQsAAQgBDwENCwABCAEPAQ0LAAEIAQ8BDQsAAQgBDwENCQA="],"д":[19,0,11,19,19,"BQABCgkPAQUIAAEKCQ8BBQgAAQoBDwEMBAABAgIPAQUIAAEKAQ8BDAQAAQICDwEFCAABCwEPAQsEAAECAg8BBQgAAQsBDwELBAABAgIPAQUIAAENAQ8BCgQAAQICDwEFCAABDgEPAQgEAAECAg8BBQcAAQICDwEGBAABAgIPAQUHAAEFAg8BAwQAAQICDwEFBwABCgEPAQ4FAAECAg8BBQYAAQIBDgEPAQgFAAECAg8BBQUAAQIBDAIPAQIFAAECAg8BBQQAAQkPDwEEAgABCQ8PAQQCAAEJAQ8BBQsAAQoBDwEEAgABCQEPAQULAAEKAQ8BBAIAAQkBDwEFCwABCgEPAQQCAAEJAQ8BBQsAAQoBDwEEAQA="],"е":[17,0,11,17,15,"BQABBQEKAQ0BDwEOAQwBBwEBBwABAQEMBw8BDQEDBQABAQENAQ8BDgEHAQIBAAEBAQUBDQEPAQ0BAQQAAQgBDwEOAQIFAAECAQ4BDwEIAwABAQEOAQ8BBwcAAQgBDwENAwABBAIPAQMHAAEEAg8BAQIAAQcNDwECAgABBw0PAQMCAAEHAg8BAQ0AAQUCDwEEDQABAQIPAQoOAAEJAg8BBQ0AAQEBDAIPAQkBBAEBAQABAgEDAQYBCgEIBQABAQELCQ8BCQcAAQQBCgENAQ4BDwENAQwBCQEFAQECAA=="],"ж":[24,0,11,24,15,"AQABAQEMAQ8BDQEBBAABAQIPAQYFAAEKAQ8BDgEDAwABAQENAQ8BDAEBAwABAQIPAQYEAAEIAg8BBAUAAQIBDQEPAQsBAQIAAQECDwEGAwABBwIPAQUHAAEDAQ4BDwEKAgABAQIPAQYCAAEGAg8BBgkAAQMBDgEPAQkBAAEBAg8BBgEAAQUCDwEICwABBQIPAQgBAQIPAQYBBAIPAQkMAAEIAw8BCAIPAQgBDgIPAQwLAAEDAg8BCwYPAQwCDwEHCgABDAEPAQwBAAEIBA8BDAEBAQcCDwECCAABBwIPAQICAAEJAg8BDQEBAgABDAEPAQwHAAECAg8BBwMAAQECDwEGAwABAwIPAQcGAAEMAQ8BDAQAAQECDwEGBAABBwEPAQ4BAgQAAQcCDwEDBAABAQIPAQYFAAEMAQ8BCwMAAQIBDgEPAQcFAAEBAg8BBgUAAQMCDwEGAgABCwEPAQwGAAEBAg8BBgYAAQgBDwEOAQI="],"з":[14,0,11,14,15,"AgABAQEGAQoBDQIOAQ0BCQEDBQABCwgPAQYEAAEKAQgBBAECAQABAQEFAQ0CDwECCgABAwIPAQUKAAECAg8BAwgAAQEBBQENAQ8BCwYAAQUEDwENAQgHAAEFBA8BDgEKAQIJAAEBAQUBDAEPAQ4BAgoAAQEBDQEPAQkLAAEKAQ8BCwoAAQEBDgEPAQkCAAEEAQsBBQEDAgEBAgEGAQ0CDwEEAgABBAkPAQcEAAEEAQkBDAEOAQ8BDgEMAQgBAgMA"],"и":[18,0,11,18,15,"AgABCAEPAQ0GAAEFAw8BAQQAAQgBDwENBQABAQENAw8BAQQAAQgBDwENBQABCAQPAQEEAAEIAQ8BDQQAAQICDwEKAg8BAQQAAQgBDwENBAABCgEPAQwBBQIPAQEEAAEIAQ8BDQMAAQQCDwEDAQUCDwEBBAABCAEPAQ0DAAENAQ8BCQEAAQUCDwEBBAABCAEPAQ0CAAEHAQ8BDgEBAQABBQIPAQEEAAEIAQ8BDQEAAQIBDgEPAQYCAAEFAg8BAQQAAQgBDwENAQABCgEPAQwDAAEFAg8BAQQAAQgBDwENAQQCDwEDAwABBQIPAQEEAAEIAQ8BDQEMAQ8BCQQAAQUCDwEBBAABCAMPAQ4BAQQAAQUCDwEBBAABCAMPAQcFAAEFAg8BAQQAAQgCDwENBgABBQIPAQECAA=="],"й":[18,0,5,18,21,"BAABBAEPAQUEAAIMCQABAQEPAQ0BBAIBAQgBDwEJCgABCAUPAQ4BAgsAAQYBDAEOAQ0BCgECLAABCAEPAQ0GAAEFAw8BAQQAAQgBDwENBQABAQENAw8BAQQAAQgBDwENBQABCAQPAQEEAAEIAQ8BDQQAAQICDwEKAg8BAQQAAQgBDwENBAABCgEPAQwBBQIPAQEEAAEIAQ8BDQMAAQQCDwEDAQUCDwEBBAABCAEPAQ0DAAENAQ8BCQEAAQUCDwEBBAABCAEPAQ0CAAEHAQ8BDgEBAQABBQIPAQEEAAEIAQ8BDQEAAQIBDgEPAQYCAAEFAg8BAQQAAQgBDwENAQABCgEPAQwDAAEFAg8BAQQAAQgBDwENAQQCDwEDAwABBQIPAQEEAAEIAQ8BDQEMAQ8BCQQAAQUCDwEBBAABCAMPAQ4BAQQAAQUCDwEBBAABCAMPAQcFAAEFAg8BAQQAAQgCDwENBgABBQIPAQECAA=="],"к":[16,0,11,16,15,"AgABCAEPAQ0FAAEBAQsBDwEOAQQDAAEIAQ8BDQUAAQsCDwEEBAABCAEPAQ0EAAELAg8BBAUAAQgBDwENAwABCgIPAQUGAAEIAQ8BDQIAAQoCDwEFBwABCAEPAQ0BAAEJAg8BBggAAQgBDwENAQkDDwEICAABCAQPAQsCDwEDBwABCAMPAQcBAAEMAQ8BDQEBBgABCAIPAQcCAAECAQ4BDwEJBgABCAEPAQ0EAAEGAg8BBAUAAQgBDwENBQABCwEPAQ4BAQQAAQgBDwENBQABAgEOAQ8BCgQAAQgBDwENBgABBQIPAQYDAAEIAQ8BDQcAAQoBDwEOAQI="],"л":[17,0,11,17,15,"BQAKDwcACg8HAAIPAQcEAAEGAg8HAAIPAQcEAAEGAg8HAAIPAQcEAAEGAg8GAAEBAg8BBgQAAQYCDwYAAQICDwEFBAABBgIPBgABAwIPAQQEAAEGAg8GAAEFAg8BAgQAAQYCDwYAAQcBDwEOBQABBgIPBgABCwEPAQsFAAEGAg8FAAEEAg8BBgUAAQYCDwMAAQIBBwEOAQ8BDQYAAQYCDwMAAw8BDQECBgABBgIPAwABDgELAQYIAAEGAg8CAA=="],"м":[20,0,11,20,15,"AgABCAMPAQMHAAEMAg8BDgQAAQgDDwEJBgABAwMPAQ4EAAEIAQ8BDgEPAQ4BAQUAAQoBDwEOAQ8BDgQAAQgBDwENAQkBDwEHBAABAQEPAQ4BCQEPAQ4EAAEIAQ8BDQEDAQ8BDQQAAQcBDwEJAQgBDwEOBAABCAEPAQ0BAAEMAQ8BBAMAAQ0BDwECAQgBDwEOBAABCAEPAQ0BAAEFAQ8BCgIAAQUBDwELAQABCAEPAQ4EAAEIAQ8BDQIAAQ4BDwECAQABCwEPAQUBAAEIAQ8BDgQAAQgBDwENAgABCAEPAQgBAgEPAQ0CAAEIAQ8BDgQAAQgBDwENAgABAQEPAQ4BCQEPAQcCAAEIAQ8BDgQAAQgBDwENAwABCgMPAQECAAEIAQ8BDgQAAQgBDwENAwABAwIPAQkDAAEIAQ8BDgQAAQgBDwENCgABCAEPAQ4EAAEIAQ8BDQoAAQgBDwEOBAABCAEPAQ0KAAEIAQ8BDgIA"],"н":[18,0,11,18,15,"AgABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAwPAQMEAAEIDA8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMCAA=="],"о":[17,0,11,17,15,"BAABAQEHAQwBDgEPAQ0BCgEECAABAwEOBw8BCgYAAQIBDgEPAQ4BBgEBAQABAwELAg8BCQUAAQoCDwEDBQABCgIPAQMDAAEBAg8BCQYAAQICDwEJAwABBQIPAQQHAAEMAQ8BDQMAAQcCDwECBwABCQIPAwABCAIPAQEHAAEIAg8DAAEHAg8BAgcAAQkCDwMAAQUCDwEEBwABDAEPAQ0DAAEBAg8BCQYAAQICDwEJBAABCgIPAQMFAAEKAg8BAwQAAQIBDgEPAQ4BBgEBAQABAwEKAg8BCQYAAQMBDgcPAQoIAAEBAQcBDAEOAQ8BDQEKAQQFAA=="],"п":[18,0,11,18,15,"AgABCAwPAQMEAAEIDA8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMCAA=="],"р":[17,0,11,17,21,"AgABCAEPAQ0BAAEBAQgBDQEPAQ4BCgEDBgABCAEPAQ0BAgENBg8BBgUAAQgBDwEOAQwBDQEFAgEBBQENAg8BBAQAAQgCDwEOAQEEAAEBAQ0BDwENBAABCAIPAQYGAAEGAg8BAwMAAQgCDwECBgABAQIPAQcDAAEIAQ8BDggAAQ4BDwEJAwABCAEPAQ4IAAENAQ8BCgMAAQgBDwEOCAABDgEPAQkDAAEIAg8BAgYAAQECDwEHAwABCAIPAQYGAAEGAg8BAwMAAQgCDwEOAQEEAAEBAQ0BDwENBAABCAEPAQ4BDAENAQUCAQEEAQ0CDwEEBAABCAEPAQ0BAgENBg8BBgUAAQgBDwENAQABAQEIAQ0BDwEOAQoBAwYAAQgBDwENDgABCAEPAQ0OAAEIAQ8BDQ4AAQgBDwENDgABCAEPAQ0OAAEIAQ8BDQwA"],"с":[15,0,11,15,15,"BQABBQEKAQ0BDwEOAQwBCQEEBQABAgEMCA8BAwMAAQEBDQIPAQkBAwIBAQMBBgELAQIDAAEJAg8BBQoAAQECDwEKCwABBQIPAQULAAEHAg8BAgsAAQcCDwEBCwABBwIPAQILAAEEAg8BBQsAAQECDwEKDAABCQIPAQULAAEBAQ0CDwEJAQMCAQEDAQYBCwECBAABAgEMCA8BAwYAAQUBCgEOAQ8BDgEMAQkBBAIA"],"т":[16,0,11,16,15,"AQMNDwEOAQABAw0PAQ4HAAEFAg8BAQwAAQUCDwEBDAABBQIPAQEMAAEFAg8BAQwAAQUCDwEBDAABBQIPAQEMAAEFAg8BAQwAAQUCDwEBDAABBQIPAQEMAAEFAg8BAQwAAQUCDwEBDAABBQIPAQEMAAEFAg8BAQYA"],"у":[16,0,11,16,21,"AQEBDgEPAQkIAAEJAQ8BDgEBAQABCQEPAQ4HAAEBAQ4BDwEJAgABAwIPAQUGAAEGAg8BAwMAAQwBDwELBgABDAEPAQwEAAEGAg8BAgQAAQICDwEGBAABAQEOAQ8BCAQAAQgCDwEBBQABCQEPAQ4EAAEOAQ8BCgYAAQMCDwEFAgABBQIPAQQHAAEMAQ8BCwIAAQsBDwENCAABBgIPAgICDwEHCAABAQEOAQ8BBwEIAg8BAgkAAQkBDwENAQ4BDwELCgABAgQPAQULAAELAg8BDgwAAQYCDwEIDAABBwIPAQIMAAENAQ8BCwwAAQQCDwEFCwABAwENAQ8BDQoAAQ0EDwEECgABDQEPAQ4BCwEECQA="],"ф":[23,0,5,23,27,"CgABCgEPAQwUAAEKAQ8BDBQAAQoBDwEMFAABCgEPAQwUAAEKAQ8BDBQAAQoBDwEMDgABBQEMAg4BCAEBAQoBDwEMAQABCAENAQ8BDAEGBwABBwUPAQsBCgEPAQwBCgUPAQkFAAEEAg8BCwEDAQEBBQEOAw8BDgEGAQEBAgEKAg8BBQQAAQwBDwEMBAABAwMPAQQEAAELAQ8BDQMAAQICDwEGBQABCgEPAQwFAAEEAg8BAwIAAQUCDwECBQABCgEPAQwFAAEBAg8BBwIAAQcCDwEBBQABCgEPAQwGAAEOAQ8BCAIAAQgCDwYAAQoBDwEMBgABDgEPAQkCAAEHAg8BAQUAAQoBDwEMBgABDgEPAQgCAAEFAg8BAgUAAQoBDwEMBQABAQIPAQcCAAECAg8BBgUAAQoBDwEMBQABBAIPAQQDAAEMAQ8BDAQAAQMDDwEEBAABCwEPAQ0EAAEFAg8BCwEDAQEBBQEOAw8BDgEGAQEBAgEKAg8BBgUAAQgFDwELAQoBDwEMAQoFDwEJBwABBQEMAg4BCAEBAQoBDwEMAQABCAENAQ8BDAEGDgABCgEPAQwUAAEKAQ8BDBQAAQoBDwEMFAABCgEPAQwUAAEKAQ8BDBQAAQoBDwEMCgA="],"х":[16,0,11,16,15,"AQABBgIPAQcGAAEGAg8BBwMAAQoCDwEEBAABAwIPAQsEAAEBAQ0BDwENAQECAAEBAQ0BDwEOAQEFAAEDAg8BCgIAAQkCDwEEBwABBwIPAQYBBQIPAQgJAAEKAg8BDgEPAQwKAAEBAQ0CDwEOAQILAAELAg8BCgsAAQcEDwEFCQABAwIPAQoBCwEPAQ4BAgcAAQEBDQEPAQ0BAQECAQ4BDwEMBwABCgIPAQMCAAEFAg8BCAUAAQYCDwEHBAABCQIPAQQDAAECAQ4BDwELBgABDAEPAQ4BAQIAAQwBDwEOAQEGAAEDAQ4BDwELAQA="],"ц":[18,0,11,18,19,"AgABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgBDwENBwABBAIPAQMEAAEIAQ8BDQcAAQQCDwEDBAABCAEPAQ0HAAEEAg8BAwQAAQgODwECAgABCA4PAQIPAAEMAQ8BAg8AAQwBDwECDwABDAEPAQIPAAEMAQ8BAg=="],"ч":[16,0,11,16,15,"AgACDwEGBgABDgEPAQgEAAIPAQYGAAEOAQ8BCAQAAg8BBgYAAQ4BDwEIBAACDwEGBgABDgEPAQgEAAIPAQcGAAEOAQ8BCAQAAQ0BDwELBgABDgEPAQgEAAEIAg8BCAECBAABDgEPAQgEAAEBAQ0JDwEIBQABAQEIAQ0HDwEIDQABDgEPAQgNAAEOAQ8BCA0AAQ4BDwEIDQABDgEPAQgNAAEOAQ8BCA0AAQ4BDwEIAgA="],"ш":[25,0,11,25,15,"AgABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCBMPAQQEAAEIEw8BBAIA"],"щ":[25,0,11,25,19,"AgABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCAEPAQ0GAAENAQ8BCAUAAQMCDwEEBAABCBUPAQMCAAEIFQ8BAxYAAQsBDwEDFgABCwEPAQMWAAELAQ8BAxYAAQsBDwED"],"ъ":[19,0,11,19,15,"AQMHDwEBCgABAwcPAQEPAAEGAg8BAQ8AAQYCDwEBDwABBgIPAQEPAAEGAg8BAQ8AAQYGDwEOAQwBCQECCAABBgoPAQUHAAEGAg8BAQMAAQIBBgEOAQ8BDgEBBgABBgIPAQEFAAEFAg8BBgYAAQYCDwEBBQABAgIPAQcGAAEGAg8BAQUAAQUCDwEGBgABBgIPAQEDAAECAQYBDgEPAQ4BAQYAAQYKDwEGBwABBgYPAQ4BDQEJAQMDAA=="],"ы":[21,0,11,21,15,"AgABCAEPAQ0LAAEIAQ8BDgQAAQgBDwENCwABCAEPAQ4EAAEIAQ8BDQsAAQgBDwEOBAABCAEPAQ0LAAEIAQ8BDgQAAQgBDwENCwABCAEPAQ4EAAEIAQ8BDQsAAQgBDwEOBAABCAYPAQ4BDAEIAQEDAAEIAQ8BDgQAAQgJDwEOAQMCAAEIAQ8BDgQAAQgBDwENBAABAgEHAg8BDQIAAQgBDwEOBAABCAEPAQ0GAAEIAg8BAwEAAQgBDwEOBAABCAEPAQ0GAAEFAg8BBAEAAQgBDwEOBAABCAEPAQ0GAAEIAg8BAwEAAQgBDwEOBAABCAEPAQ0EAAECAQcCDwENAgABCAEPAQ4EAAEICQ8BDgEEAgABCAEPAQ4EAAEIBg8BDgEMAQgBAgMAAQgBDwEOAgA="],"ь":[16,0,11,16,15,"AgABCAEPAQ0NAAEIAQ8BDQ0AAQgBDwENDQABCAEPAQ0NAAEIAQ8BDQ0AAQgBDwENDQABCAYPAQ4BDAEIAQEFAAEICQ8BDgEDBAABCAEPAQ0EAAECAQcCDwENBAABCAEPAQ0GAAEIAg8BAwMAAQgBDwENBgABBQIPAQQDAAEIAQ8BDQYAAQgCDwEDAwABCAEPAQ0EAAECAQcCDwENBAABCAkPAQ4BBAQAAQgGDwEOAQwBCAECAwA="],"э":[15,0,11,15,15,"AQABAQEFAQoBDQIOAQwBCQECBgABCAgPAQgFAAEHAQoBBQECAQABAQEEAQoCDwEIDAABCQIPAQMLAAEBAQ4BDwEKDAABCQEPAQ4FAAENCQ8BAQQAAQ0JDwECCwABBwIPAQELAAEKAQ8BDgsAAQEBDgEPAQoLAAEKAg8BBAMAAQcBCQEEAQIBAAEBAQUBDAIPAQkEAAEICA8BCQUAAQEBBgELAQ0CDgENAQkBAwUA"],"ю":[23,0,11,23,15,"AgABBwIPBQABAQEHAQsBDgEPAQ4BCwEGBwABBwIPBAABAgENBw8BDAEBBQABBwIPAwABAQENAg8BCAECAQABAgEIAg8BDAUAAQcCDwMAAQcCDwEGBQABBwIPAQYEAAEHAg8DAAENAQ8BDAcAAQ0BDwEMBAABBwIPAgABAgIPAQcHAAEIAg8BAQMAAQcHDwEFBwABBgIPAQMDAAEHBw8BBAcAAQUCDwEDAwABBwIPAgABAwIPAQUHAAEGAg8BAwMAAQcCDwIAAQICDwEHBwABCAIPAQEDAAEHAg8DAAENAQ8BDAcAAQ0BDwEMBAABBwIPAwABBwIPAQYFAAEHAg8BBgQAAQcCDwMAAQEBDAIPAQgBAgEAAQIBCAIPAQwFAAEHAg8EAAECAQ0HDwEMAQEFAAEHAg8GAAEGAQsBDgEPAQ4BCwEGBQA="],"я":[16,0,11,16,15,"BAABBAEKAQ0BDgUPAQ4FAAEICQ8BDgQAAQICDwENAQUBAQMAAQcBDwEOBAABBwIPAQQFAAEHAQ8BDgQAAQcCDwYAAQcBDwEOBAABBgIPAQQFAAEHAQ8BDgQAAQEBDgEPAQ0BBQEBAwABBwEPAQ4FAAEDAQwIDwEOBwABBQcPAQ4HAAELAQ8BDgEDAgABBwEPAQ4GAAEGAg8BBgMAAQcBDwEOBQABAgEOAQ8BCgQAAQcBDwEOBQABCwEPAQ0BAQQAAQcBDwEOBAABBwIPAQQFAAEHAQ8BDgMAAQICDwEIBgABBwEPAQ4CAA=="],"Ё":[17,0,1,17,25,"BAABAgIPAQkCAAEOAQ8BCwgAAQICDwEJAgABDgEPAQsIAAECAg8BCQIAAQ4BDwELKAABBQwPAQEDAAEFDA8BAQMAAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQULDwEKBAABBQsPAQoEAAEFAg8BBQ0AAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQUCDwEFDQABBQIPAQUNAAEFAg8BBQ0AAQUCDwEFDQABBQwPAQUDAAEFDA8BBQEA"],"ё":[17,0,6,17,20,"BAABAwIPAQgCAAIPAQoIAAEDAg8BCAIAAg8BCggAAQMCDwEIAgACDwEKKwABBQEKAQ0BDwEOAQwBBwEBBwABAQEMBw8BDQEDBQABAQENAQ8BDgEHAQIBAAEBAQUBDQEPAQ0BAQQAAQgBDwEOAQIFAAECAQ4BDwEIAwABAQEOAQ8BBwcAAQgBDwENAwABBAIPAQMHAAEEAg8BAQIAAQcNDwECAgABBw0PAQMCAAEHAg8BAQ0AAQUCDwEEDQABAQIPAQoOAAEJAg8BBQ0AAQEBDAIPAQkBBAEBAQABAgEDAQYBCgEIBQABAQELCQ8BCQcAAQQBCgENAQ4BDwENAQwBCQEFAQECAA=="],"·":[9,0,15,9,11,"AgABAgIPAQoFAAECAg8BCgUAAQICDwEKSwA="],"×":[23,0,10,23,16,"BAABBAEKAQEJAAEDAQsBAQcAAQEBDgEPAQsBAQcAAQMBDgEPAQoIAAEFAg8BCwEBBQABAwEOAQ8BDQECCQABBQIPAQwBAQMAAQQBDgEPAQ0BAgsAAQUCDwEMAQEBAAEEAQ4BDwENAQINAAEFAg8BDAEFAQ4BDwENAQIPAAEFBA8BDQEBEQABCAMPAQMRAAEFBA8BDAEBDwABBQIPAQwBBQEOAQ8BDQEBDQABBQIPAQwBAQEAAQQBDgEPAQ0BAQsAAQUCDwEMAQEDAAEEAQ4BDwENAQIJAAEFAg8BCwEBBQABBAEOAQ8BDQECBwABAQEOAQ8BCwEBBwABAwEOAQ8BCggAAQQBCwEBCQABAwELAQEbAA=="],"—":[27,0,18,27,8,"AQABChcPAQoCAAEKFw8BCqMA"],"–":[14,0,18,14,8,"AQABCgoPAQMCAAEKCg8BA1UA"],"№":[28,0,6,28,20,"AgABBQMPAQcJAAEFAQsBDgEHCgABBQMPAQ4BAQcAAQYDDwEHCgABBQQPAQgHAAENAQ8BDQEDCwABBQIPAQ4CDwECBgACDwEIDAABBQIPAQcCDwEJBgACDwEIDAABBQIPAQQBCwIPAQIFAAIPAQgMAAEFAg8BBAEDAg8BCgUAAg8BCAwAAQUCDwEEAQABCgIPAQMEAAIPAQgDAAEIAQ4BDQEGBQABBQIPAQQBAAECAg8BCwQAAg8BCAIAAQcEDwEEBAABBQIPAQQCAAEJAg8BBAMAAg8BCAEAAQECDgEDAQUBDwELBAABBQIPAQQCAAECAQ4BDwEMAwACDwEIAQABAwEPAQoCAAENAQ8EAAEFAg8BBAMAAQgCDwEFAgACDwEIAQABBQEPAQgCAAELAQ8BAgMAAQUCDwEEAwABAQEOAQ8BDQIAAg8BCAEAAQMBDwEJAgABCwEPAQEDAAEFAg8BBAQAAQcCDwEGAQACDwEIAQABAQIOAQIBBAEPAQ0EAAEFAg8BBAQAAQEBDgEPAQ0BAQIPAQgCAAEHBA8BBQQAAQUCDwEEBQABBgIPAQcCDwEIAwABCAIOAQcFAAEFAg8BAwYAAQ0BDwEOAg8BCAsAAQIBCwIPAQEGAAEFBA8BCAoAAQQDDwEJCAABDAMPAQgBAAEFBg8BAwEAAQQBDgEMAQcJAAEEAw8BCAEAAQUGDwEDAQA="],"…":[27,0,23,27,3,"AwABDQEPAQ4GAAENAQ8BDQYAAQ4BDwENBgABDQEPAQ4GAAENAQ8BDQYAAQ4BDwENBgABDQEPAQ4GAAENAQ8BDQYAAQ4BDwENAwA="]},"detail":{" ":[10,0,28,10,0,""],"!":[14,0,6,14,22,"BAABDAQPAQcIAAEMBA8BBwgAAQwEDwEHCAABDAQPAQcIAAEMBA8BBwgAAQwEDwEHCAABDAQPAQcIAAEMBA8BBwgAAQwEDwEHCAABCwQPAQYIAAEJBA8BBAgAAQcEDwECCAABBQQPCQABAwMPAQ4JAAECAw8BDCUAAQwEDwEHCAABDAQPAQcIAAEMBA8BBwgAAQwEDwEHCAABDAQPAQcEAA=="],"\"":[16,0,6,16,22,"AgABAgMPAQUCAAELAg8BDAUAAQIDDwEFAgABCwIPAQwFAAECAw8BBQIAAQsCDwEMBQABAgMPAQUCAAELAg8BDAUAAQIDDwEFAgABCwIPAQwFAAECAw8BBQIAAQsCDwEMBQABAgMPAQUCAAELAg8BDAUAAQIDDwEFAgABCwIPAQzjAA=="],"#":[25,0,6,25,22,"CQABAQMPAQMDAAENAg8BBQ0AAQQDDwMAAQIDDwECDQABCAIPAQsDAAEFAg8BDQ4AAQsCDwEIAwABCQIPAQoOAAEOAg8BBAMAAQ0CDwEGDQABAwMPAQECAAEBAw8BAggAAQQTDwEBBAABBBMPAQEEAAEEEw8BAQgAAQQDDwEBAgABAgMPAQINAAEIAg8BCwMAAQYCDwENDgABDAIPAQcDAAEKAg8BCQ0AAQEDDwEEAwABDgIPAQYJABMPAQYFABMPAQYFABMPAQYJAAMPAQQDAAENAg8BBg0AAQMDDwEBAgABAgMPAQINAAEHAg8BDAMAAQUCDwEODgABCwIPAQkDAAEJAg8BCg4AAQ4CDwEFAwABDAIPAQcNAAECAw8BAQIAAQEDDwEDCQA="],"$":[21,0,6,21,26,"CQABCwEPAQoSAAELAQ8BChIAAQsBDwEKDgABAgEIAQsBDQMPAQ0BDAEKAQcBAwgAAQkMDwEIBgABCg0PAQgFAAEDBA8BDAEEAQsBDwEKAQIBBQEJAQ4BDwEIBQABCAQPAQIBAAELAQ8BCgMAAQECBwUAAQkEDwEBAQABCwEPAQoLAAEJBA8BCAEAAQsBDwEKCwABBgUPAQ0BDgEPAQsBAwoAAQEBDQoPAQsBBgEBBwABAwENCw8BDQEDBwABAQEHAQwKDwEOAQIJAAEBAQQBDQEPAQ4GDwEICwABCwEPAQoBAQEIBA8BCwsAAQsBDwEKAgABDgMPAQwEAAEIAQYBAQQAAQsBDwEKAgABDgMPAQsEAAEJAQ8BDgEJAQUBAgEAAQsBDwEKAQIBCAQPAQcEAAEJDg8BDQEBBAABCQ0PAQsBAgUAAQEBBAEHAQoBDAENAQ4DDwEOAQwBCAEEDgABCwEPAQoSAAELAQ8BChIAAQsBDwEKEgABCwEPAQoJAA=="],"%":[30,0,6,30,22,"AwABAgEJAQ0BDwEOAQwBBwEBCAABAgEOAg8BAwgAAQUHDwEMAQEHAAEKAg8BCAgAAQIDDwEJAQEBAwENAg8BCwYAAQUCDwENAQEIAAEJAw8BAQIAAQYDDwEEBAABAQENAg8BBQkAAQ0CDwELAwABAgMPAQgEAAEIAg8BCwoAAw8BCgMAAQEDDwEJAwABAwIPAQ4BAgoAAw8BCgMAAQEDDwEJAwABDAIPAQcLAAENAg8BCwMAAQIDDwEIAgABBgIPAQwMAAEJAw8BAQIAAQYDDwEDAQABAQEOAg8BAwwAAQIDDwEJAQEBAwENAg8BCwIAAQoCDwEJDgABBQcPAQwBAQEAAQQCDwEOAQECAAEHAQwBDgEPAQ0BCgEDBgABAgEJAQ0BDwEOAQwBBwEBAgABDQIPAQUBAAEBAQwHDwEGDgABCAIPAQsCAAELAg8BDgEDAQEBCQMPAQMMAAECAg8BDgECAQABAwMPAQcCAAEBAQ4CDwEKDAABCwIPAQcCAAEHAw8BAwMAAQsCDwEOCwABBgIPAQ0DAAEJAw8BAQMAAQkDDwEBCQABAQEOAg8BBAMAAQkDDwECAwABCQMPAQEJAAEJAg8BCQQAAQcDDwEDAwABCwIPAQ4JAAEEAg8BDgEBBAABAwMPAQcDAAEOAg8BCgkAAQ0CDwEFBgABCwIPAQ4BAwEBAQkDDwEDCAABBwIPAQsHAAEBAQwHDwEGCAABAgMPAQIJAAEHAQwBDgEPAQ0BCgEDAwA="],"&":[26,0,6,26,22,"BwABAQEGAQsBDgEPAQ4BDQELAQgBBAEBDgABAwENCQ8BCg0AAQIBDgoPAQoNAAEJBA8BDQEDAQABAQEFAQsBDwEKDQABDQQPAQUFAAEEAQgNAAEOBA8BBhQAAQsEDwENFAABBAUPAQkTAAEDAQ4FDwEHEQABBggPAQUFAAELAw8BDQUAAQYKDwEEBAABDAMPAQoEAAEDBQ8BCQENBA8BDgEDAgABAQQPAQgEAAELBA8BCgEAAQMBDgQPAQ4BAgEAAQUEDwEEAwABAQUPAQICAAEEBQ8BDQECAQwDDwEOBAABAwQPAQ4EAAEGBQ8BDgQPAQkEAAECBA8BDgUAAQcJDwECBAABAQUPAQQFAAEJBw8BBwYAAQsEDwEMAQEFAAEMBQ8BDAcAAQMFDwENAQUBAQEAAQMBCQcPAQcHAAEGEg8BBwcAAQQBDQoPAQ0BDAUPAQcIAAEFAQoBDQEOAQ8BDgENAQsBCAEEAQABAQEMBQ8BBgEA"],"'":[9,0,6,9,22,"AgABAgMPAQUEAAECAw8BBQQAAQIDDwEFBAABAgMPAQUEAAECAw8BBQQAAQIDDwEFBAABAgMPAQUEAAECAw8BBYAA"],"(":[14,0,5,14,27,"BgABBQQPAQIIAAENAw8BCQgAAQcEDwECBwABAQEOAw8BCggAAQYEDwEFCAABDAMPAQ4IAAEDBA8BCQgAAQgEDwEGCAABDAQPAQIIAAQPAQ4IAAEDBA8BDAgAAQUEDwELCAABBgQPAQkIAAEGBA8BCQgAAQYEDwEKCAABBQQPAQsIAAEDBA8BDAkABA8BDgkAAQwEDwECCAABCAQPAQUIAAEDBA8BCQkAAQwDDwEOCQABBgQPAQUIAAEBAQ4DDwEKCQABBwQPAQIIAAEBAQ0DDwEJCQABBQQPAQICAA=="],")":[14,0,5,14,27,"AgABBQMPAQ4BAQkAAQ0DDwEJCQABBgQPAQIJAAEOAw8BCgkAAQkEDwECCAABBAQPAQgJAAEOAw8BDQkAAQoEDwEDCAABBwQPAQcIAAEDBA8BCwgAAQEEDwENCQAFDwkAAQ4EDwEBCAABDQQPAQIIAAEOBA8BAQgABQ8IAAEBBA8BDggAAQMEDwELCAABBwQPAQcIAAEKBA8BAwgAAQ4DDwENCAABBAQPAQgIAAEJBA8BAggAAQ4DDwEKCAABBgQPAQIIAAENAw8BCQgAAQUDDwEOAQEGAA=="],"*":[16,0,6,16,22,"BgABBgIPAQEMAAEGAg8BAQcAAggBAQIAAQYCDwEBAgABAgELAQMBAAEBAQ4BDwENAQUBAAEGAg8CAQEIAg8BCwEAAQIBCwMPAQsBCQIPAQcBDQMPAQkDAAEFAQ0IDwELAQIGAAEGAQ4EDwEMAQQIAAEHAQ4EDwENAQQGAAEFAQ0IDwELAQICAAECAQsDDwELAQgCDwEGAQ0DDwEJAQABAQEOAQ8BDQEFAQABBgIPAgEBCAIPAQsCAAIIAQECAAEGAg8BAQIAAQIBCwEDBwABBgIPAQEMAAEGAg8BAYYA"],"+":[25,0,9,25,19,"CgABAwMPAQUUAAEDAw8BBRQAAQMDDwEFFAABAwMPAQUUAAEDAw8BBRQAAQMDDwEFFAABAwMPAQUUAAEDAw8BBQ0AAQwRDwEOBgABDBEPAQ4GAAEMEQ8BDg0AAQMDDwEFFAABAwMPAQUUAAEDAw8BBRQAAQMDDwEFFAABAwMPAQUUAAEDAw8BBRQAAQMDDwEFFAABAwMPAQUKAA=="],",":[11,0,22,11,10,"AwABDgQPAQUFAAEOBA8BBQUAAQ4EDwEFBQABDgQPAQUFAAEOBA8BBAQAAQMEDwEKBQABBwMPAQ4BAQUAAQsDDwEFBQABAQMPAQsGAAEEAg8BDgECBQA="],"-":[12,0,17,12,11,"AQABBggPAQwCAAEGCA8BDAIAAQYIDwEMAgABBggPAQxVAA=="],".":[11,0,22,11,6,"AwABDgQPAQUFAAEOBA8BBQUAAQ4EDwEFBQABDgQPAQUFAAEOBA8BBQUAAQ4EDwEFAgA="],"/":[11,0,6,11,25,"BwABBwIPAQwHAAELAg8BBwYAAQEDDwEDBgABBgIPAQ0HAAEKAg8BCAcAAQ4CDwEEBgABBQIPAQ4HAAEJAg8BCgcAAQ4CDwEFBgABAwMPAQEGAAEIAg8BCwcAAQ0CDwEGBgABAgMPAQEGAAEHAg8BDAcAAQwCDwEHBgABAQMPAQIGAAEGAg8BDQcAAQoCDwEIBgABAQEOAg8BBAYAAQUCDwEOBwABCQIPAQkHAAEOAg8BBQYAAQMCDwEOAQEGAAEIAg8BCgcAAQ0CDwEGBwA="],"0":[21,0,6,21,22,"BgABAwEIAQwBDgEPAQ4BDAEIAQIKAAEBAQoJDwEICAABAQEMCw8BCgcAAQoNDwEIBQABBAUPAQsBAgEAAQMBDAUPAQIEAAEKBA8BDQEBAwABAQEOBA8BCAQABQ8BCAUAAQoEDwENAwABAwUPAQUFAAEHBQ8BAQIAAQYFDwEDBQABBQUPAQQCAAEHBQ8BAgUAAQQFDwEFAgABCAUPAQEFAAEDBQ8BBgIAAQgFDwEBBQABAwUPAQYCAAEHBQ8BAgUAAQQFDwEFAgABBgUPAQMFAAEFBQ8BBAIAAQMFDwEFBQABBwUPAQEDAAUPAQgFAAEKBA8BDQQAAQoEDwENAQEDAAEBAQ4EDwEIBAABBAUPAQsBAgEAAQMBDAUPAQIFAAEKDQ8BCAYAAQEBDAsPAQoIAAEBAQoJDwEICwABAwEIAQwBDgEPAQ4BDAEIAQIGAA=="],"1":[21,0,6,21,22,"AwABAQEDAQYBCQEMBQ8BDAoAAQkJDwEMCgABCQkPAQwKAAEJCQ8BDAoAAQkBDAEJAQYBAwEIBA8BDA8AAQgEDwEMDwABCAQPAQwPAAEIBA8BDA8AAQgEDwEMDwABCAQPAQwPAAEIBA8BDA8AAQgEDwEMDwABCAQPAQwPAAEIBA8BDA8AAQgEDwEMDwABCAQPAQwPAAEIBA8BDA8AAQgEDwEMCgABBw4PAQwFAAEHDg8BDAUAAQcODwEMBQABBw4PAQwCAA=="],"2":[21,0,6,21,22,"AwABAwEGAQkBCwENAQ4BDwEOAQ0BCwEHAQIIAAEIDA8BCAcAAQgNDwELBgABCA4PAQYFAAEIAQ8BDgEJAQUBAgEAAQIBBgEOBQ8BDAUAAgcBAQYAAQIBDgUPDwABCgUPAQEOAAEJBQ8PAAEMBA8BCw4AAQUFDwEFDQABAwEOBA8BCg0AAQQBDgQPAQwBAQwAAQYFDwEMAQEMAAEIBQ8BCwEBDAABCQUPAQkMAAEBAQsFDwEHDAABAgEMBQ8BBgwAAQMBDQQPAQ4BBA0AAQkPDwEEBAABCQ8PAQQEAAEJDw8BBAQAAQkPDwEEAgA="],"3":[21,0,6,21,22,"AwABAgEFAQkBCwENAQ4BDwEOAQ0BCwEIAQQIAAEBDA8BDAECBgABAQ0PAQ4BAQUAAQEODwEIBQABAQENAQkBBQEDAQEBAAECAQUBDAUPAQ0OAAEBAQ0EDwEODwABCwQPAQ0OAAEBAQ0EDwEJDAABAQEFAQwEDwEOAQIIAAEECQ8BDAECCQABBAgPAQkBAQoAAQQJDwEOAQYJAAEECw8BBwwAAQEBBAEJBQ8BDgEBDgABBwUPAQUOAAEDBQ8BBwQAAQsBAwgAAQcFDwEGBAACDwELAQYBAwEBAQABAQEEAQkGDwEDBAAPDwEMBQAODwENAQIFAAEEAQwLDwEKAQEIAAEDAQgBCwEOAg8BDgEMAQoBBwECBgA="],"4":[21,0,6,21,22,"CQABAwYPAQYMAAEBAQ0GDwEGDAABCAcPAQYLAAEECA8BBgoAAQEBDQgPAQYKAAEIAw8BCAEOBA8BBgkAAQQDDwEMAQABDgQPAQYIAAEBAQ0DDwEDAQABDgQPAQYIAAEIAw8BCAIAAQ4EDwEGBwABBAMPAQwDAAEOBA8BBgYAAQEBDQMPAQMDAAEOBA8BBgYAAQgDDwEIBAABDgQPAQYFAAEEAw8BDAUAAQ4EDwEGBQABCgMPAQMFAAEOBA8BBgUAAQoRDwEIAgABChEPAQgCAAEKEQ8BCAIAAQoRDwEIDAABDgQPAQYPAAEOBA8BBg8AAQ4EDwEGDwABDgQPAQYEAA=="],"5":[21,0,6,21,22,"AwABDA0PAQMGAAEMDQ8BAwYAAQwNDwEDBgABDA0PAQMGAAEMAw8BChAAAQwDDwEKEAABDAMPAQoQAAEMAw8BDQEMAQ4BDwEOAQwBCQEECQABDAsPAQsBAgcAAQwMDwENAQIGAAEMDQ8BCwYAAQwBDwEMAQYBAgEAAQEBBAELBg8BBAUAAQkBBAcAAQgFDwEIDgABAQUPAQoPAAENBA8BCw4AAQEFDwEKBAABCQEGCAABCAUPAQgEAAEKAQ8BDgEJAQUBAgEAAQEBBAELBg8BAwQAAQoODwEKBQABCg0PAQwBAQUAAQIBCQsPAQkBAQgAAQEBBQEJAQwBDgEPAQ4BDQELAQcBAgYA"],"6":[21,0,6,21,22,"BwABAQEHAQsBDQIOAQ0BCgEECwABCAEOCA8BDAEDBwABAQELCw8BDAcAAQsMDwEMBgABBwUPAQsBBQECAQABAQEEAQoBDwEMBQABAQEOBA8BCAcAAQIBCQUAAQYEDwEMDwABCgQPAQcBAwEJAQ0BDwEOAQwBCQEDBwABDgQPAQwIDwEIBgAPDwEKBAABARAPAQUDAAECBg8BDgEFAQEBAgEHBQ8BDAMAAQEGDwEFBAABCQUPAQEDAAYPBQABBAUPAQMDAAENBA8BDgUAAQMFDwEDAwABCQUPBQABBAUPAQIDAAEEBQ8BBQQAAQkEDwEOBQABDQQPAQ4BBQEBAQIBBwUPAQkFAAEEDQ8BDgECBgABBwwPAQQIAAEGAQ4IDwENAQMKAAEBAQcBCwENAQ8BDgENAQoBBQYA"],"7":[21,0,6,21,22,"AgAQDwEHBAAQDwEHBAAQDwEHBAAQDwEFDgABCgQPAQ0OAAECBQ8BBw4AAQkEDwEOAQENAAEBAQ4EDwEIDgABBwUPAQIOAAENBA8BCQ4AAQYFDwEDDgABDAQPAQsOAAEEBQ8BBA4AAQsEDwEMDgABAwUPAQUOAAEJBA8BDQ4AAQEFDwEHDgABCAQPAQ4BAQ0AAQEBDgQPAQgOAAEGBQ8BAg4AAQ0EDwEKDgABBQUPAQMKAA=="],"8":[21,0,6,21,22,"BQABAwEIAQsBDQEOAQ8BDgENAQsBBwECCAABAQEKCw8BCQcAAQwNDwEKBQABBQ8PAQMEAAEJBQ8BCAECAQABAgEJBQ8BBwQAAQoEDwELBQABDgQPAQgEAAEHBA8BCwUAAQ4EDwEGBAABAgEOBA8BCAECAQABAgEJBA8BDgEBBQABBQEOCw8BDQEDBwABAgEIAQ4HDwEOAQcBAQgAAQUBDAkPAQsBBAcAAQkNDwEHBQABBgUPAQgBAgEBAQIBCQUPAQQEAAENBA8BCAUAAQoEDwELAwABAQUPAQQFAAEGBA8BDgMAAQIFDwEEBQABBgUPAwABAQUPAQgFAAEKBA8BDgQAAQ0FDwEHAQIBAAECAQkFDwELBAABBw8PAQUFAAEMDQ8BCgYAAQEBCQsPAQgJAAECAQgBCwENAQ4BDwEOAQ0BCwEHAQIFAA=="],"9":[21,0,6,21,22,"BQABAQEGAQsBDQIOAQ0BCgEGCwABBQEOCA8BDQEECAABBwwPAQUGAAEEDQ8BDgECBQABDAQPAQ4BBgIBAQYBDgQPAQoEAAECBQ8BBgQAAQcFDwECAwABBQUPAQIEAAEDBQ8BBgMAAQYFDwUAAQEFDwEKAwABBgUPAQIEAAEDBQ8BDAMAAQQFDwEGBAABBwUPAQ0DAAEBAQ4EDwEOAQUCAQEGAQ4FDwEOBAABCA8PAQ4EAAEBAQwODwEMBQABAQELCA8BDAQPAQsHAAEEAQoBDQIOAQ0BCQECAQoEDwEHDgABAQEOBA8BAwUAAQoBAQcAAQsEDwEMBgABDwEOAQgBAwEBAQABAgEGAQ0FDwEEBgANDwEJBwAMDwEJCAABBQENCA8BDgEGCwABBgEKAQ4BDwEOAQ0BCgEGAQEHAA=="],":":[12,0,12,12,16,"AwABCgQPAQoGAAEKBA8BCgYAAQoEDwEKBgABCgQPAQoGAAEKBA8BCgYAAQoEDwEKNgABCgQPAQoGAAEKBA8BCgYAAQoEDwEKBgABCgQPAQoGAAEKBA8BCgYAAQoEDwEKAwA="],";":[12,0,12,12,20,"AwABCgQPAQoGAAEKBA8BCgYAAQoEDwEKBgABCgQPAQoGAAEKBA8BCgYAAQoEDwEKNgABCgQPAQoGAAEKBA8BCgYAAQoEDwEKBgABCgQPAQoGAAEKBA8BCAYAAQ4DDwEOAQEFAAEDBA8BBQYAAQcDDwEKBwABCwIPAQ4BAQcAAQ4CDwEFBgA="],"<":[25,0,10,25,18,"EwABAgEHAQwTAAEBAQYBCwIPAQ4RAAEFAQoFDwEODgABAwEJAQ4HDwEMCwABAgEIAQ0HDwENAQgBAgkAAQEBBgEMBw8BDQEIAQMKAAEFAQoHDwEOAQkBAw0AAQwFDwEOAQkBBBAAAQwEDwEIEwABDAUPAQ4BCQEDEAABBQELBw8BDQEIAQMPAAEBAQYBDAcPAQ0BCAEDDwABAgEIAQ0HDwENAQcBAg8AAQMBCQEOBw8BDBEAAQUBCgUPAQ4TAAEBAQYBCwIPAQ4WAAECAQcBDBwA"],"=":[25,0,14,25,14,"AwABDBEPAQ4GAAEMEQ8BDgYAAQwRDwEOUQABDBEPAQ4GAAEMEQ8BDgYAAQwRDwEOgAA="],">":[25,0,10,25,18,"AwABCwEIAQIWAAEMAg8BDAEHAQETAAEMBQ8BCwEFAQEQAAEKBw8BDgEJAQQPAAECAQcBDAcPAQ0BCAEDDwABAgEHAQ0HDwEMAQcBAg8AAQMBCAENBw8BCwEGEAABAwEIAQ0FDwEOEwABBwQPAQ4QAAEDAQgBDQUPAQ4NAAECAQcBDQcPAQsBBgoAAQIBBwEMBw8BDAEHAQIJAAECAQcBDAcPAQ4BCAEDCwABCgcPAQ4BCgEEDgABDAUPAQsBBQEBEAABDAIPAQwBBwEBEwABCwEIAQIsAA=="],"?":[17,0,6,17,22,"AgABDgYPAQ4BDAEIAQMGAAEOCg8BCQUAAQ4LDwEJBAABDgEPAQoBBQECAQABAwELBQ8BAQMAAQoBAwUAAQEFDwEFCwABDQQPAQYKAAECBQ8BBQoAAQsFDwEBCQABCQUPAQkJAAEJBQ8BDAEBCAABBwUPAQwBAQgAAQMFDwEMAQEJAAEJBA8BDgEBCgABDQQPAQgLAAEOBA8BBi0AAQ4EDwEGCwABDgQPAQYLAAEOBA8BBgsAAQ4EDwEGCwABDgQPAQYGAA=="],"@":[30,0,6,30,26,"CgABAgEGAQsBDQEOAQ8BDgEMAQoBBgEBEQABAwEKCw8BCQECDgABCA4PAQ4BBgsAAQEBCwQPAQoBBgEDAQEBAAECAQMBBwELBA8BCAoAAQsDDwEJAQEJAAEDAQsDDwEHCAABCQIPAQ4BBQ0AAQgDDwEDBgABBAMPAQQPAAEIAg8BDAYAAQwCDwEHBAABAwEKAQ4BDwENAQcBAAEMAg8BBAIAAQwCDwEDBAABAwIPAQwEAAEGBg8BCQEMAg8BBAIAAQUCDwEIBAABBwIPAQUDAAEDCA8BDgIPAQQCAAEBAg8BCwQAAQsCDwEBAwABCwMPAQcCAQEGBA8BBAMAAQ4BDwEMBAABDQEPAQ0DAAEBAw8BCAQAAQcDDwEEAwABDQEPAQ0EAAIPAQsDAAECAw8BBAQAAQMDDwEEAgABAQIPAQsEAAIPAQsDAAECAw8BBAQAAQMDDwEEAgABBgIPAQgEAAENAQ8BDQMAAQEDDwEIBAABBwMPAQQBAAECAQ4CDwEDBAABDAIPAQEDAAELAw8BBgIBAQYBDgMPAQQBBQENAg8BCgUAAQgCDwEFAwABBAgPAQ4GDwEMAQEFAAEDAg8BDAQAAQYGDwEJAQwFDwEJAQEHAAEMAg8BBgQAAQMBCgEOAQ8BDQEHAQABDAEPAQ4BDAEIAQIJAAEEAg8BDgEDCgABAQ8AAQoCDwEOAQQMAAEIAQQLAAEBAQwDDwEIAQEIAAEDAQsBDwENDAABAgEMAw8BDgEJAQUBAgIBAQIBBQEKBA8BBgwAAQEBCg4PAQkPAAEEAQsKDwELAQQSAAEDAQcBCwENAQ4BDwENAQsBBwEDCgA="],"A":[23,0,6,24,22,"CAABDgYPAQIPAAEFBw8BCA8AAQoHDwENDgABAQkPAQQNAAEGCQ8BCQ0AAQwEDwEMBA8BDgEBCwABAgUPAQMBDgQPAQULAAEIBA8BDAEAAQkEDwELCwABDQQPAQcBAAEEBQ8BAgkAAQQFDwECAgABDgQPAQcJAAEJBA8BDAMAAQkEDwENCAABAQEOBA8BBwMAAQQFDwEDBwABBQUPAQIEAAENBA8BCQcAAQsEDwEMBQABCAQPAQ4GAAECEQ8BBQUAAQcRDwEKBQABDBIPAQEDAAEDEw8BBgMAAQkFDwEBCAABDAQPAQwDAAEOBA8BCgkAAQcFDwECAQABBQUPAQUJAAECBQ8BCAEAAQoEDwEOAQEKAAEMBA8BDQEA"],"B":[23,0,6,23,22,"AgABBAkPAQ4BDQELAQgBAwgAAQQODwEKAQEGAAEEDw8BDAYAAQQQDwEGBQABBAUPAQYDAAECAQoFDwEKBQABBAUPAQYEAAEBAQ4EDwEMBQABBAUPAQYFAAEMBA8BDAUAAQQFDwEGBAABAQEOBA8BCgUAAQQFDwEGAwABAgEKBQ8BBQUAAQQPDwEKBgABBA4PAQcHAAEEDg8BDgEHBgABBBAPAQkFAAEEBQ8BBgMAAQEBBAEMBQ8BAwQAAQQFDwEGBQABAgUPAQgEAAEEBQ8BBgYAAQ4EDwEKBAABBAUPAQYFAAECBQ8BCgQAAQQFDwEGAwABAQEEAQwFDwEIBAABBBEPAQQEAAEEEA8BCQUAAQQPDwEIBgABBAoPAQ4BDQEKAQcBAgUA"],"C":[22,0,6,22,22,"CAABBAEIAQsBDQEOAQ8BDgEMAQoBBgECCQABBQEMCw8BCgEBBQABAQEKDg8BAQUAAQsPDwEBBAABCQYPAQwBBQECAQABAQECAQYBCgIPAQEDAAEDBg8BBwgAAQIBCgEBAwABCgUPAQkPAAEOBA8BDgEBDgABBAUPAQoPAAEGBQ8BBw8AAQcFDwEFDwABBwUPAQUPAAEGBQ8BBw8AAQQFDwEKEAABDgQPAQ4BAQ8AAQoFDwEJDwABAwYPAQcIAAECAQoBAQQAAQkGDwEMAQUBAgEAAQEBAgEFAQoCDwEBBQABCw8PAQEFAAEBAQoODwEBBwABBQEMCw8BCgEBCQABBAEIAQsBDQEOAQ8BDgENAQoBBgECAwA="],"D":[25,0,6,25,22,"AgABBAcPAg4BDQELAQkBBgECCgABBA4PAQsBBAgAAQQQDwEIBwABBBEPAQkGAAEEBQ8BBgIAAQEBAwEHAQ0GDwEGBQABBAUPAQYFAAEBAQoFDwEOAQEEAAEEBQ8BBgcAAQsFDwEIBAABBAUPAQYHAAEDBQ8BDAQAAQQFDwEGCAABDAUPAQEDAAEEBQ8BBggAAQkFDwEDAwABBAUPAQYIAAEIBQ8BBAMAAQQFDwEGCAABCAUPAQQDAAEEBQ8BBggAAQkFDwEDAwABBAUPAQYIAAEMBQ8BAQMAAQQFDwEGBwABAwUPAQwEAAEEBQ8BBgcAAQsFDwEIBAABBAUPAQYFAAEBAQoFDwEOAQEEAAEEBQ8BBgIAAQEBAwEHAQ4GDwEGBQABBBEPAQkGAAEEEA8BBwcAAQQODwEKAQMIAAEECA8BDgENAQsBCQEGAQIIAA=="],"E":[20,0,6,21,22,"AgABBA8PBQABBA8PBQABBA8PBQABBA8PBQABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDgABBAUPAQYOAAEEBQ8BBg4AAQQODwEGBQABBA4PAQYFAAEEDg8BBgUAAQQODwEGBQABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDgABBAUPAQYOAAEEBQ8BBg4AAQQPDwEEBAABBA8PAQQEAAEEDw8BBAQAAQQPDwEEAgA="],"F":[20,0,6,21,22,"AgABBA8PBQABBA8PBQABBA8PBQABBA8PBQABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDgABBAUPAQYOAAEEBQ8BBg4AAQQODwEGBQABBA4PAQYFAAEEDg8BBgUAAQQODwEGBQABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDgABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDgABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDAA="],"G":[25,0,6,25,22,"CAABAwEHAQsBDQEOAQ8CDgEMAQoBBgEDCwABBAEMDA8BDAEFBwABAQEJDw8BCQcAAQsQDwEJBgABCQYPAQ0BBgEDAQEBAAEBAQMBBgEKAg8BCQUAAQMGDwEICQABAQEHAQgFAAEKBQ8BCRIAAQ4EDwEOAQERAAEEBQ8BChIAAQYFDwEHEgABBwUPAQUFAAEGCA8BBgMAAQcFDwEFBQABBggPAQYDAAEGBQ8BBwUAAQYIDwEGAwABBAUPAQoFAAEGCA8BBgQAAQ4EDwEOAQEIAAEOBA8BBgQAAQoFDwEICAABDgQPAQYEAAEDBg8BBwcAAQ4EDwEGBQABCQYPAQwBBgECAQEBAAEBAQQBDgQPAQYGAAELEQ8BBgYAAQEBChAPAQYIAAEFAQwMDwEMAQYLAAEEAQgBCwENAQ4BDwEOAQ0BCwEJAQYBAQUA"],"H":[25,0,6,25,22,"AgABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBBMPAQUEAAEEEw8BBQQAAQQTDwEFBAABBBMPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUCAA=="],"I":[11,0,6,11,22,"AgABBAUPAQYEAAEEBQ8BBgQAAQQFDwEGBAABBAUPAQYEAAEEBQ8BBgQAAQQFDwEGBAABBAUPAQYEAAEEBQ8BBgQAAQQFDwEGBAABBAUPAQYEAAEEBQ8BBgQAAQQFDwEGBAABBAUPAQYEAAEEBQ8BBgQAAQQFDwEGBAABBAUPAQYEAAEEBQ8BBgQAAQQFDwEGBAABBAUPAQYEAAEEBQ8BBgQAAQQFDwEGBAABBAUPAQYCAA=="],"J":[11,-2,6,13,28,"BAABBAUPAQYGAAEEBQ8BBgYAAQQFDwEGBgABBAUPAQYGAAEEBQ8BBgYAAQQFDwEGBgABBAUPAQYGAAEEBQ8BBgYAAQQFDwEGBgABBAUPAQYGAAEEBQ8BBgYAAQQFDwEGBgABBAUPAQYGAAEEBQ8BBgYAAQQFDwEGBgABBAUPAQYGAAEEBQ8BBgYAAQQFDwEGBgABBAUPAQYGAAEEBQ8BBgYAAQUFDwEFBgABBwUPAQQGAAENBQ8BAgMAAQEBAwELBQ8BDAMAAQoIDwEFAwABCgcPAQkEAAEKBg8BBwUAAQoBDwEOAQ0BCgEHAQEGAA=="],"K":[23,0,6,25,22,"AgABBAUPAQYGAAECAQ0FDwEJBAABBAUPAQYFAAECAQ0FDwEIBQABBAUPAQYEAAECAQ0FDwEIBgABBAUPAQYDAAECAQ0FDwEIBwABBAUPAQYCAAECAQ0FDwEICAABBAUPAQYBAAECAQ0FDwEICQABBAUPAQYBAgEOBQ8BCAoAAQQFDwEIAQ4FDwEICwABBAsPAQcMAAEECg8BBw0AAQQJDwEMDgABBAoPAQkNAAEECw8BCQwAAQQFDwEMBg8BCQsAAQQFDwEGAQcGDwEJCgABBAUPAQYBAAEHBg8BCQkAAQQFDwEGAgABBgYPAQkIAAEEBQ8BBgMAAQYGDwEJBwABBAUPAQYEAAEGBg8BCgYAAQQFDwEGBQABBgYPAQoFAAEEBQ8BBgYAAQYGDwEKBAABBAUPAQYHAAEGBg8BCgEA"],"L":[19,0,6,19,22,"AgABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBA8PAQQCAAEEDw8BBAIAAQQPDwEEAgABBA8PAQQ="],"M":[30,0,6,30,22,"AgABBAcPAQIIAAEEBw8BAQQAAQQHDwEICAABCwcPAQEEAAEEBw8BDgEBBgABAggPAQEEAAEECA8BBgYAAQgIDwEBBAABBAgPAQwFAAEBAQ4IDwEBBAABBAkPAQMEAAEGCQ8BAQQAAQQFDwEMAw8BCgQAAQwDDwEMBQ8BAQQAAQQFDwEFBA8BAQIAAQQEDwEGBQ8BAQQAAQQFDwEBAQ0DDwEHAgABCgMPAQoBBAUPAQEEAAEEBQ8BAQEGAw8BDQEAAQEEDwIEBQ8BAQQAAQQFDwIBAQ4DDwEFAQcDDwENAQABBAUPAQEEAAEEBQ8BAQEAAQkDDwELAQ0DDwEHAQABBAUPAQEEAAEEBQ8BAQEAAQMHDwEOAQEBAAEEBQ8BAQQAAQQFDwEBAgABCwYPAQkCAAEEBQ8BAQQAAQQFDwEBAgABBQYPAQMCAAEEBQ8BAQQAAQQFDwEBAwABDQQPAQsDAAEEBQ8BAQQAAQQFDwEBAwABBwQPAQUDAAEEBQ8BAQQAAQQFDwEBAwABAQMPAQ4EAAEEBQ8BAQQAAQQFDwEBDAABBAUPAQEEAAEEBQ8BAQwAAQQFDwEBBAABBAUPAQEMAAEEBQ8BAQQAAQQFDwEBDAABBAUPAQECAA=="],"N":[25,0,6,25,22,"AgABBAYPAQUHAAUPAQUEAAEEBg8BDAcABQ8BBQQAAQQHDwEFBgAFDwEFBAABBAcPAQ0GAAUPAQUEAAEECA8BBgUABQ8BBQQAAQQIDwEOAQEEAAUPAQUEAAEECQ8BBwQABQ8BBQQAAQQFDwEKAw8BDgEBAwAFDwEFBAABBAUPAQMBDgMPAQgDAAUPAQUEAAEEBQ8BAQEIAw8BDgEBAgAFDwEFBAABBAUPAgEBDgMPAQkCAAUPAQUEAAEEBQ8BAQEAAQcEDwECAQAFDwEFBAABBAUPAQEBAAEBAQ4DDwEJAQAFDwEFBAABBAUPAQECAAEGBA8BAwUPAQUEAAEEBQ8BAQMAAQ0DDwEKBQ8BBQQAAQQFDwEBAwABBgkPAQUEAAEEBQ8BAQQAAQwIDwEFBAABBAUPAQEEAAEFCA8BBQQAAQQFDwEBBQABDAcPAQUEAAEEBQ8BAQUAAQQHDwEFBAABBAUPAQEGAAELBg8BBQQAAQQFDwEBBgABAwYPAQUCAA=="],"O":[26,0,6,26,22,"BwABAQEGAQkBDAEOAQ8BDgENAQsBCAEDDQABAQEIAQ4KDwEMAQQKAAECAQwODwEHCAABAQENEA8BBwcAAQsFDwEOAQcBAgEAAQEBBAELBg8BBAUAAQUFDwEOAQMGAAEJBQ8BDAUAAQsFDwEFCAABDAUPAQQDAAEBBQ8BDQkAAQYFDwEIAwABBAUPAQkJAAEBBQ8BDAMAAQYFDwEGCgABDgQPAQ0DAAEHBQ8BBQoAAQ0EDwEOAwABBwUPAQUKAAENBA8BDgMAAQYFDwEGCgABDgQPAQ0DAAEEBQ8BCQkAAQEFDwEMAwABAQUPAQ0JAAEGBQ8BCAQAAQsFDwEFCAABDAUPAQQEAAEFBQ8BDgECBgABCQUPAQwGAAEMBQ8BDgEHAQIBAAEBAQQBCwYPAQQGAAEBAQ0QDwEHCAABAgEMDg8BBwoAAQEBCAEOCg8BDAEEDQABAQEGAQoBDQEOAQ8BDgENAQsBCAEDCAA="],"P":[22,0,6,22,22,"AgABBAoPAQ4BDAEJAQQHAAEEDg8BDAEDBQABBA8PAQ4BAwQAAQQQDwENBAABBAUPAQYDAAECAQcGDwEFAwABBAUPAQYFAAEHBQ8BCQMAAQQFDwEGBQABAgUPAQsDAAEEBQ8BBgUAAQIFDwELAwABBAUPAQYFAAEHBQ8BCQMAAQQFDwEGAwABAgEHBg8BBQMAAQQQDwENBAABBA8PAQ4BAwQAAQQODwEMAQMFAAEECg8BDgEMAQkBBAcAAQQFDwEGDwABBAUPAQYPAAEEBQ8BBg8AAQQFDwEGDwABBAUPAQYPAAEEBQ8BBg8AAQQFDwEGDwABBAUPAQYNAA=="],"Q":[26,0,6,26,26,"BwABAQEGAQkBDAEOAQ8BDgENAQsBCAEEDQABAQEIAQ4KDwEMAQQKAAECAQwODwEICAABAQENEA8BCAcAAQsFDwEOAQcBAgEAAQEBBAELBg8BBAUAAQUFDwEOAQMGAAEJBQ8BDAUAAQsFDwEFCAABDAUPAQQDAAEBBQ8BDQkAAQYFDwEIAwABBAUPAQkJAAEBBQ8BDAMAAQYFDwEGCgABDgQPAQ0DAAEHBQ8BBQoAAQ0EDwEOAwABBwUPAQUKAAENBQ8DAAEGBQ8BBgoAAQ4EDwEOAwABBAUPAQkJAAEBBQ8BCwMAAQEFDwENCQABBgUPAQgEAAEMBQ8BBAgAAQwFDwEDBAABBQUPAQ0BAgYAAQkFDwEMBgABDAUPAQ4BBwECAQABAQEEAQsGDwEDBgABAgEOEA8BBggAAQIBDQ4PAQYKAAEBAQgBDgoPAQsBAw0AAQEBBgEJAQwBDgYPAQQUAAEEBA8BDgEDFAABBQQPAQ4BAhQAAQYEDwENAQEUAAEIBA8BDAEBAwA="],"R":[23,0,6,23,22,"AgABBAkPAQ4BDQELAQcBAggAAQQODwEJBwABBA8PAQoGAAEEEA8BAwUAAQQFDwEGAgABAQEEAQ0FDwEIBQABBAUPAQYEAAEDBQ8BCgUAAQQFDwEGBQAFDwEKBQABBAUPAQYFAAUPAQkFAAEEBQ8BBgQAAQMFDwEFBQABBAUPAQYCAAEBAQQBDQQPAQ0GAAEEDg8BDgEDBgABBAwPAQ4BCQEBBwABBAwPAQ4BCQEBBwABBA4PAQwHAAEEBQ8BBgEAAQEBBAEMBQ8BCQYAAQQFDwEGAwABAQENBQ8BAwUAAQQFDwEGBAABBQUPAQoFAAEEBQ8BBgUAAQwFDwEDBAABBAUPAQYFAAEEBQ8BCwQAAQQFDwEGBgABDAUPAQMDAAEEBQ8BBgYAAQQFDwELAwABBAUPAQYHAAELBQ8BBA=="],"S":[22,0,6,22,22,"BQABAQEGAQoBDQEOAQ8BDgENAQwBCgEHAQQBAQgAAQYBDgsPAQ4HAAEHDg8GAAECDw8GAAEIBQ8BBwECAgABAgEEAQgBDQIPBgABCwQPAQgIAAEEAQsGAAEMBA8BBRAAAQwEDwEKEAABCQUPAQ0BBwEEAQEMAAEDCQ8BDQEKAQYBAQkAAQgMDwEJAQEIAAEHAQ4LDwEOAQIIAAEBAQcBCwoPAQwMAAEDAQYBCgEOBg8BAg4AAQEBCQUPAQUPAAECBQ8BBgQAAggBAggAAQQFDwEEBAABCgIPAQwBBwEEAQIBAQEAAQIBBgEOBQ8BAQQAAQoPDwELBQABCg4PAQ4BAgUAAQYBDQwPAQwBAggAAQIBBgEJAQsBDQEOAQ8CDgEMAQkBBAYA"],"T":[20,0,6,21,22,"AQ0TDwEEAQ0TDwEEAQ0TDwEEAQ0TDwEEBwABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBBwA="],"U":[24,0,6,24,22,"AgABBAUPAQYHAAUPAQkEAAEEBQ8BBgcABQ8BCQQAAQQFDwEGBwAFDwEJBAABBAUPAQYHAAUPAQkEAAEEBQ8BBgcABQ8BCQQAAQQFDwEGBwAFDwEJBAABBAUPAQYHAAUPAQkEAAEEBQ8BBgcABQ8BCQQAAQQFDwEGBwAFDwEJBAABBAUPAQYHAAUPAQkEAAEEBQ8BBgcABQ8BCQQAAQQFDwEGBwAFDwEJBAABBAUPAQYHAAUPAQkEAAEDBQ8BBgYAAQEFDwEJBAABAgUPAQcGAAECBQ8BCAQAAQEFDwEKBgABBQUPAQYFAAEMBQ8BAgUAAQsFDwECBQABBgUPAQ0BBAEBAQABAwEKBQ8BDAYAAQEBDQ8PAQQHAAEDAQ4NDwEHCQABAgEMCg8BDgEFDAABAwEIAQwCDgEPAQ4BDAEJAQUHAA=="],"V":[23,0,6,24,22,"AQoEDwEOAQEKAAEMBA8BDQEAAQUFDwEFCQABAgUPAQgCAAEOBA8BCwkAAQcFDwECAgABCQUPAQEIAAENBA8BDAMAAQMFDwEGBwABAwUPAQYEAAENBA8BDAcAAQgFDwEBBAABBwUPAQIGAAEOBA8BCgUAAQIFDwEHBQABBAUPAQUGAAELBA8BDQUAAQkEDwEOBwABBQUPAQMDAAEBAQ4EDwEJBwABAQEOBA8BCAMAAQUFDwEDCAABCQQPAQ4DAAELBA8BDQkAAQQFDwEEAQABAQUPAQcKAAENBA8BCQEAAQYFDwECCgABCAQPAQ4BAQEMBA8BCwsAAQIFDwEHBQ8BBQwAAQwJDwEOAQEMAAEGCQ8BCQ0AAQEJDwEEDgABCgcPAQ0PAAEFBw8BCBAAAQ4GDwECCAA="],"W":[33,0,6,33,22,"AQAFDwEGBgABBAUPAQYGAAEFBQ8BAQEAAQsEDwEKBgABCAUPAQkGAAEIBA8BDAIAAQgEDwENBgABCwUPAQ0GAAEMBA8BCQIAAQQFDwECBQAHDwEBBAABAQUPAQUCAAEBBQ8BBQQAAQMHDwEFBAABBAUPAQEDAAEMBA8BCQQAAQcDDwENAw8BCAQAAQgEDwENBAABCQQPAQ0EAAELAw8BBgMPAQwEAAELBA8BCQQAAQUFDwEBAwABDgMPAQEBDgMPAQEDAAEOBA8BBgQAAQEFDwEFAgABAwMPAQwBAAELAw8BBAIAAQMFDwECBQABDQQPAQgCAAEGAw8BCAEAAQcDDwEHAgABBwQPAQ4GAAEJBA8BDAIAAQoDDwEFAQABAwMPAQsCAAEKBA8BCgYAAQYFDwEBAQABDQMPAQECAAMPAQ4CAAEOBA8BBwYAAQIFDwEEAQIDDwEMAwABCwMPAQMBAgUPAQMHAAEOBA8BBwEFAw8BCQMAAQgDDwIGBQ8IAAEKBA8BCwEJAw8BBQMAAQQDDwIKBA8BCwgAAQcEDwEOAQwDDwECAwABAQMPAQ4BDQQPAQgIAAEDCA8BDQUAAQwIDwEECQABDgcPAQoFAAEJCA8BAQkAAQsHDwEGBQABBQcPAQwKAAEIBw8BAwUAAQEHDwEJCgABBAYPAQ4HAAENBg8BBQoAAQEGDwELBwABCQYPAQIFAA=="],"X":[23,0,6,23,22,"AQABDAQPAQ4BAgcAAQEBDgQPAQ0BAQEAAQIFDwELBwABCgUPAQMDAAEHBQ8BBwUAAQYFDwEIBQABCwQPAQ4BAgMAAQIBDgQPAQwGAAECAQ4EDwEMAwABCwUPAQMHAAEGBQ8BBwEAAQYFDwEICQABCwUPAQQBDgQPAQwKAAECAQ4KDwEDCwABBgkPAQcNAAELBw8BDA4AAQEBDgYPAQIOAAEFBw8BBg0AAQEBDgcPAQ4BAgwAAQoJDwEMCwABBQUPAQwFDwEHCQABAgEOBA8BDQEBAQsFDwECCAABCwUPAQMBAAECAQ4EDwEMBwABBgUPAQgDAAEGBQ8BBwUAAQIBDgQPAQwFAAELBQ8BAwQAAQsFDwEDBQABAgEOBA8BDAMAAQYFDwEHBwABBgUPAQgBAAECAQ4EDwEMCQABCgUPAQM="],"Y":[22,-1,6,24,22,"AQEBDgUPAQMIAAEHBQ8BCgIAAQUFDwEMBwABAgUPAQ4BAQMAAQoFDwEHBgABCwUPAQYEAAEBAQ4EDwEOAQIEAAEGBQ8BCwYAAQUFDwELAwABAQEOBA8BDgECBwABCgUPAQYCAAEKBQ8BBggAAQIBDgQPAQ4BAQEEBQ8BCwoAAQYFDwEKAQ0EDwEOAQILAAELCg8BBwwAAQIBDggPAQwOAAEGCA8BAw8AAQsGDwEHEAABAgUPAQ0SAAEOBA8BChIAAQ4EDwEKEgABDgQPAQoSAAEOBA8BChIAAQ4EDwEKEgABDgQPAQoSAAEOBA8BChIAAQ4EDwEKEgABDgQPAQoJAA=="],"Z":[22,0,6,22,22,"AQABBRIPAQECAAEFEg8BAQIAAQUSDwEBAgABBREPAQ4OAAEFBg8BBA0AAQMBDgUPAQYNAAEBAQ0FDwEJDgABCwUPAQwOAAEIBQ8BDgECDQABBgYPAQMNAAEDBg8BBg0AAQEBDQUPAQkOAAEMBQ8BCw4AAQkFDwENAQENAAEGBQ8BDgEDDQABBAYPAQUNAAECAQ4FDwEIDQABAQEMBQ8BCw4AAQgSDwEGAgABChIPAQYCAAEKEg8BBgIAAQoSDwEGAQA="],"[":[14,0,5,14,27,"AgABBggPAQoEAAEGCA8BCgQAAQYIDwEKBAABBgQPAQgIAAEGBA8BCAgAAQYEDwEICAABBgQPAQgIAAEGBA8BCAgAAQYEDwEICAABBgQPAQgIAAEGBA8BCAgAAQYEDwEICAABBgQPAQgIAAEGBA8BCAgAAQYEDwEICAABBgQPAQgIAAEGBA8BCAgAAQYEDwEICAABBgQPAQgIAAEGBA8BCAgAAQYEDwEICAABBgQPAQgIAAEGBA8BCAgAAQYEDwEICAABBggPAQoEAAEGCA8BCgQAAQYIDwEKAgA="],"\\":[11,0,6,11,25,"AQ0CDwEGBwABCAIPAQoHAAEDAg8BDgEBBwABDgIPAQUHAAEJAg8BCQcAAQUCDwEOBwABAQEOAg8BBAcAAQoCDwEIBwABBgIPAQ0HAAEBAw8BAgcAAQwCDwEHBwABBwIPAQwHAAECAw8BAQcAAQ0CDwEGBwABCAIPAQsHAAEDAw8BAQcAAQ4CDwEFBwABCQIPAQoHAAEFAg8BDggAAQ4CDwEEBwABCgIPAQgHAAEGAg8BDQcAAQEDDwEDBwABCwIPAQcHAAEHAg8BDA=="],"]":[14,0,5,14,27,"AgAJDwECBAAJDwECBAAJDwECCAABDQQPAQIIAAENBA8BAggAAQ0EDwECCAABDQQPAQIIAAENBA8BAggAAQ0EDwECCAABDQQPAQIIAAENBA8BAggAAQ0EDwECCAABDQQPAQIIAAENBA8BAggAAQ0EDwECCAABDQQPAQIIAAENBA8BAggAAQ0EDwECCAABDQQPAQIIAAENBA8BAggAAQ0EDwECCAABDQQPAQIIAAENBA8BAggAAQ0EDwECBAAJDwECBAAJDwECBAAJDwECAgA="],"^":[25,0,6,25,22,"CgABCgMPAQwBARIAAQoFDwEMAQEQAAEKBw8BCwEBDgABCQQPAQ0EDwELDQABCQQPAQcBAAEFAQ4DDwELCwABCAMPAQ0BAwMAAQIBDAMPAQoJAAEIAw8BCQEBBgABCAMPAQoHAAEHAg8BDgEFCQABBAENAg8BCf8AYgA="],"_":[15,0,28,15,7,"PAAtDw=="],"`":[15,0,4,15,24,"AQABAwEOAg8BDAsAAQQDDwEICwABBgMPAQQLAAEHAg8BDQEBCwABCQIPAQkMAAEKAg8BBf8AFAA="],"a":[20,0,12,20,16,"AgABBAcPAg4BCwEJAQQHAAEEDA8BDAECBQABBA0PAQ0BAQQAAQQBDAEIAQQBAgEBAQABAQECAQYBDgQPAQcOAAEHBA8BCwYAAQQBCAELAQ0BDggPAQ0EAAEBAQsNDwENBAABDA4PAQ0DAAEFBQ8BCgEDAQECAAEGBA8BDQMAAQkEDwEMBQABBwQPAQ0DAAEKBA8BCQUAAQsEDwENAwABCQQPAQwEAAEEBQ8BDQMAAQYFDwEIAgEBBQEOBQ8BDQQAAQ0JDwEJBA8BDQQAAQMBDQYPAQ4BBQEGBA8BDQUAAQEBCAEMAg4BDQEIAQIBAAEGBA8BDQIA"],"b":[21,0,5,21,23,"AgABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDwABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDwABBwQPAQwPAAEHBA8BDAIAAQYBCwEOAQ8BDQEJAQIGAAEHBA8BDAEBAQwHDwEGBQABBwQPAgwJDwEFBAABBwYPAQgBAgEAAQQBDQQPAQ4BAQMAAQcFDwEIBAABAgEOBA8BBwMAAQcFDwECBQABCgQPAQwDAAEHBA8BDQYAAQYFDwMAAQcEDwEMBgABBQUPAQECAAEHBA8BDAYAAQUFDwEBAgABBwQPAQ0GAAEGBQ8DAAEHBQ8BAgUAAQoEDwEMAwABBwUPAQgEAAECAQ4EDwEHAwABBwYPAQgBAQEAAQQBDQQPAQ4BAQMAAQcEDwIMCQ8BBQQAAQcEDwEMAQEBDAcPAQYFAAEHBA8BDAIAAQYBDAEOAQ8BDQEJAQIEAA=="],"c":[18,0,12,18,16,"BgABBQEJAQwBDgEPAQ4BDAEKAQYBAQYAAQUBDgkPAQwFAAEICw8BDAQAAQYFDwENAQUBAQEAAQIBBwEOAQwDAAEBAQ4EDwEMAQEFAAEBAQgDAAEFBQ8BBAsAAQkEDwEODAABCgQPAQwMAAEKBA8BDAwAAQkEDwEODAABBQUPAQMLAAEBAQ4EDwEMAQEFAAEBAQgEAAEGBQ8BDQEFAQEBAAECAQYBDgEMBQABCAsPAQwGAAEGAQ4JDwEMCAABBQEJAQwBDgEPAQ4BDAEKAQYBAQIA"],"d":[21,0,5,21,23,"DQABBQQPAQ4PAAEFBA8BDg8AAQUEDwEODwABBQQPAQ4PAAEFBA8BDg8AAQUEDwEODwABBQQPAQ4HAAEGAQsBDgEPAQ0BCQECAQABBQQPAQ4FAAEBAQwGDwEOAgUEDwEOBAABAQENCQ8BCQQPAQ4EAAEIBQ8BCAECAQABBAENBQ8BDgMAAQEBDgQPAQgEAAECBQ8BDgMAAQUFDwECBQABCgQPAQ4DAAEIBA8BDQYAAQYEDwEOAwABCQQPAQwGAAEFBA8BDgMAAQkEDwEMBgABBQQPAQ4DAAEIBA8BDQYAAQYEDwEOAwABBQUPAQIFAAEKBA8BDgMAAQEBDgQPAQgEAAECBQ8BDgQAAQkFDwEIAQEBAAEEAQ0FDwEOBAABAQENCQ8BCQQPAQ4FAAEBAQwGDwEOAgUEDwEOBwABBgELAQ4BDwENAQkBAgEAAQUEDwEOAgA="],"e":[20,0,12,20,16,"BQABAQEGAQoBDQEOAQ8BDgEMAQgBAgkAAQYBDgkPAQgHAAEJDA8BCgUAAQcFDwEIAQIBAAEEAQ0EDwEHAwABAQEOBA8BCQQAAQMEDwEOAQECAAEFBQ8BAQUAAQsEDwEGAgABCQQPAQwGAAEJBA8BCgIAAQoQDwEMAgABChAPAQ0CAAEJEA8BDQIAAQUEDwEMDgABAQEOBA8BBAgAAQMBCgECAwABBwQPAQ4BCAEDAQEBAAEBAQQBBwENAg8BAgQAAQkODwECBQABBgEODA8BAgYAAQEBBgEKAQ0BDgEPAQ4BDQEMAQsBCAEFAQICAA=="],"f":[13,0,5,14,23,"BQABAwEJAQ0BDgQPAQUEAAEHCA8BBQMAAQMJDwEFAwABCQQPAQ0BAwcAAQsEDwEICAABDAQPAQYIAAEMBA8BBgUAAQYLDwEOAQABBgsPAQ4BAAEGCw8BDgQAAQwEDwEGCAABDAQPAQYIAAEMBA8BBggAAQwEDwEGCAABDAQPAQYIAAEMBA8BBggAAQwEDwEGCAABDAQPAQYIAAEMBA8BBggAAQwEDwEGCAABDAQPAQYIAAEMBA8BBggAAQwEDwEGBQA="],"g":[21,0,12,21,22,"BQABBgELAQ4BDwENAQkBAgEAAQUEDwEOBQABAQEMBg8BDgIFBA8BDgQAAQEBDAkPAQkEDwEOBAABCAUPAQgBAgEAAQQBDQUPAQ4DAAEBAQ4EDwEJBAABAgUPAQ4DAAEFBQ8BAgUAAQoEDwEOAwABCAQPAQ4GAAEHBA8BDgMAAQkEDwEMBgABBQQPAQ4DAAEJBA8BDAYAAQUEDwEOAwABCAQPAQ0GAAEHBA8BDgMAAQUFDwECBQABCgQPAQ4DAAEBAQ4EDwEIBAABAgUPAQ4EAAEIBQ8BBwEBAQABBAENBQ8BDgQAAQEBDAkPAQkEDwEOBQABAQEMBg8BDgIFBA8BDgcAAQYBCwEOAQ8BDQEJAQIBAAEGBA8BDQ8AAQoEDwEKBQABCAEEBwABBAUPAQUFAAEKAQ8BCwEFAQIBAAEBAQMBCAUPAQwGAAEKDA8BDQEBBgABCgsPAQkBAQcAAQEBBAEIAQwBDQEOAQ8BDgENAQoBBwEBBgA="],"h":[21,0,5,21,23,"AgABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDwABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDwABBwQPAQwPAAEHBA8BDAIAAQUBCwEOAQ8BDQEKAQQGAAEHBA8BDAEBAQsHDwEHBQABBwQPAQwBCwkPAQQEAAEHBg8BCAECAQEBBgUPAQoEAAEHBQ8BCQQAAQgEDwENBAABBwUPAQIEAAEFBQ8EAAEHBA8BDgUAAQQFDwQAAQcEDwEMBQABBAUPBAABBwQPAQwFAAEEBQ8EAAEHBA8BDAUAAQQFDwQAAQcEDwEMBQABBAUPBAABBwQPAQwFAAEEBQ8EAAEHBA8BDAUAAQQFDwQAAQcEDwEMBQABBAUPBAABBwQPAQwFAAEEBQ8EAAEHBA8BDAUAAQQFDwIA"],"i":[10,0,5,10,23,"AgABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDBgAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMAgA="],"j":[10,-1,5,11,29,"AwABBwQPAQwFAAEHBA8BDAUAAQcEDwEMBQABBwQPAQwFAAEHBA8BDBsAAQcEDwEMBQABBwQPAQwFAAEHBA8BDAUAAQcEDwEMBQABBwQPAQwFAAEHBA8BDAUAAQcEDwEMBQABBwQPAQwFAAEHBA8BDAUAAQcEDwEMBQABBwQPAQwFAAEHBA8BDAUAAQcEDwEMBQABBwQPAQwFAAEHBA8BDAUAAQcEDwELBQABCAQPAQsFAAEKBA8BCQMAAQEBBgUPAQUCAAcPAQwDAAYPAQ0BAgMAAw8BDgEMAQcBAQQA"],"k":[20,0,5,21,23,"AgABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDwABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDwABBwQPAQwPAAEHBA8BDAUAAQoFDwEFAwABBwQPAQwEAAELBA8BDgEEBAABBwQPAQwCAAEBAQsEDwEOAQMFAAEHBA8BDAEAAQEBCwQPAQ0BAwYAAQcEDwEMAQEBDAQPAQ0BAgcAAQcEDwIMBA8BDAEBCAABBwkPAQsBAQkAAQcJDwECCgABBwkPAQ0BAgkAAQcEDwENAQ4EDwENAQIIAAEHBA8BDAEDAQ4EDwENAQIHAAEHBA8BDAEAAQMBDgQPAQ0BAgYAAQcEDwEMAgABBAEOBA8BDQECBQABBwQPAQwDAAEEBQ8BDQECBAABBwQPAQwEAAEFBQ8BDQECAwABBwQPAQwFAAEFBQ8BDQEC"],"l":[10,0,5,10,23,"AgABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAQAAQcEDwEMBAABBwQPAQwEAAEHBA8BDAIA"],"m":[31,0,12,31,16,"AgABCAQPAQwBAAEBAQcBDAIOAQsBBAQAAQYBDAEOAQ8BDQEJAQMGAAEIBA8BDAECAQwGDwEJAQABAgEMBw8BBQUAAQgEDwIMCA8BBwEMCQ8BAgQAAQgGDwEGAQEBAgELBg8BDAEDAQEBBQEOBA8BCAQAAQgFDwEHAwABAwUPAQ4BAQMAAQkEDwEMBAABCAUPAQEDAAEBBQ8BCgQAAQcEDwENBAABCAQPAQ0FAAUPAQYEAAEGBA8BDQQAAQgEDwEMBQABDgQPAQUEAAEGBA8BDQQAAQgEDwEMBQABDgQPAQUEAAEGBA8BDQQAAQgEDwEMBQABDgQPAQUEAAEGBA8BDQQAAQgEDwEMBQABDgQPAQUEAAEGBA8BDQQAAQgEDwEMBQABDgQPAQUEAAEGBA8BDQQAAQgEDwEMBQABDgQPAQUEAAEGBA8BDQQAAQgEDwEMBQABDgQPAQUEAAEGBA8BDQQAAQgEDwEMBQABDgQPAQUEAAEGBA8BDQQAAQgEDwEMBQABDgQPAQUEAAEGBA8BDQIA"],"n":[21,0,12,21,16,"AgABBwQPAQwCAAEFAQsBDgEPAQ0BCgEEBgABBwQPAQwBAQELBw8BBwUAAQcEDwEMAQsJDwEEBAABBwYPAQgBAgEBAQYFDwEKBAABBwUPAQkEAAEIBA8BDQQAAQcFDwECBAABBQUPBAABBwQPAQ4FAAEEBQ8EAAEHBA8BDAUAAQQFDwQAAQcEDwEMBQABBAUPBAABBwQPAQwFAAEEBQ8EAAEHBA8BDAUAAQQFDwQAAQcEDwEMBQABBAUPBAABBwQPAQwFAAEEBQ8EAAEHBA8BDAUAAQQFDwQAAQcEDwEMBQABBAUPBAABBwQPAQwFAAEEBQ8CAA=="],"o":[21,0,12,21,16,"BQABAQEGAQoBDQEOAQ8BDgEMAQkBBAoAAQcBDgkPAQ0BAwcAAQoNDwEEBQABBwUPAQgBAgEAAQMBDAQPAQ4BAgMAAQEBDgQPAQgEAAEBAQ0EDwEJAwABBQUPAQIFAAEHBA8BDgMAAQkEDwENBgABBAUPAQMCAAEKBA8BDAYAAQMFDwEEAgABCgQPAQwGAAEDBQ8BBAIAAQkEDwENBgABBAUPAQMCAAEFBQ8BAQUAAQcEDwEOAwABAQEOBA8BCAQAAQEBDQQPAQkEAAEHBQ8BCAECAQABAwEMBA8BDgECBQABCg0PAQQHAAEHAQ4JDwENAQMJAAEBAQYBCgENAQ4BDwEOAQwBCQEEBgA="],"p":[21,0,12,21,22,"AgABBwQPAQwCAAEGAQsBDgEPAQ0BCQECBgABBwQPAQwBAQEMBw8BBgUAAQcEDwIMCQ8BBQQAAQcGDwEIAQIBAAEEAQ0EDwEOAQEDAAEHBQ8BCAQAAQIBDgQPAQcDAAEHBQ8BAgUAAQoEDwEMAwABBwQPAQ0GAAEGBQ8DAAEHBA8BDAYAAQUFDwEBAgABBwQPAQwGAAEFBQ8BAQIAAQcEDwENBgABBgUPAwABBwUPAQIFAAEKBA8BDAMAAQcFDwEIBAABAgEOBA8BBwMAAQcGDwEIAQEBAAEEAQ0EDwEOAQEDAAEHBA8CDAkPAQUEAAEHBA8BDAEBAQwHDwEGBQABBwQPAQwCAAEGAQwBDgEPAQ0BCQECBgABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDwABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDQA="],"q":[21,0,12,21,22,"BQABBgELAQ4BDwENAQkBAgEAAQUEDwEOBQABAQEMBg8BDgIFBA8BDgQAAQEBDQkPAQkEDwEOBAABCQUPAQgBAgEAAQQBDQUPAQ4DAAEBAQ4EDwEIBAABAgUPAQ4DAAEFBQ8BAgUAAQoEDwEOAwABCAQPAQ0GAAEGBA8BDgMAAQkEDwEMBgABBQQPAQ4DAAEJBA8BDAYAAQUEDwEOAwABCAQPAQ0GAAEGBA8BDgMAAQUFDwECBQABCgQPAQ4DAAEBAQ4EDwEIBAABAgUPAQ4EAAEIBQ8BCAEBAQABBAENBQ8BDgQAAQEBDQkPAQkEDwEOBQABAQEMBg8BDgIFBA8BDgcAAQYBCwEOAQ8BDQEJAQIBAAEFBA8BDg8AAQUEDwEODwABBQQPAQ4PAAEFBA8BDg8AAQUEDwEODwABBQQPAQ4PAAEFBA8BDgIA"],"r":[15,0,12,15,16,"AgABBwQPAQwCAAEHAQwBDgEPAQoCAAEHBA8BDAECAQwEDwEKAgABBwQPAgwFDwEKAgABBwsPAQoCAAEHBg8BCwEEAgEBBQEIAgABBwUPAQsIAAEHBQ8BAwgAAQcEDwEOCQABBwQPAQwJAAEHBA8BDAkAAQcEDwEMCQABBwQPAQwJAAEHBA8BDAkAAQcEDwEMCQABBwQPAQwJAAEHBA8BDAcA"],"s":[18,0,12,18,16,"BAABBgEKAQ0BDgEPAQ4BDQEMAQkBBwEDBQABAwENCw8BBQQAAQ0MDwEFAwABBAQPAQwBAwEBAQABAgEFAQoCDwEFAwABBgQPAQQGAAEBAQgBBQMAAQYEDwEIDAABAgUPAQ4BCwEJAQcBBQEBBwABCAoPAQwBBgYAAQUBCwoPAQkHAAEBAQQBBgEIAQoBDgUPAQIMAAEMBA8BBgIAAQMBCQECBwABCQQPAQYCAAEDAg8BCgEGAQMBAQEAAQIBBgUPAQQCAAEDDQ8BDAMAAQMMDwEMAQIEAAECAQUBCQELAQ0BDgIPAQ4BDAEJAQQEAA=="],"t":[14,0,7,14,21,"AwAFDwEECAAFDwEECAAFDwEECAAFDwEECAAFDwEEBQABCQwPAQoBCQwPAQoBCQwPAQoDAAUPAQQIAAUPAQQIAAUPAQQIAAUPAQQIAAUPAQQIAAUPAQQIAAUPAQQIAAUPAQQIAAEOBA8BBQgAAQ0EDwELAQIHAAEICQ8BAwMAAQEBDQgPAQMEAAEBAQgBDAEOBQ8BAw=="],"u":[21,0,12,21,16,"AgABCgQPAQkFAAEGBA8BDQQAAQoEDwEJBQABBgQPAQ0EAAEKBA8BCQUAAQYEDwENBAABCgQPAQkFAAEGBA8BDQQAAQoEDwEJBQABBgQPAQ0EAAEKBA8BCQUAAQYEDwENBAABCgQPAQkFAAEGBA8BDQQAAQoEDwEJBQABBgQPAQ0EAAEKBA8BCQUAAQcEDwENBAABCgQPAQkFAAEIBA8BDQQAAQkEDwEKBQABDAQPAQ0EAAEIBA8BDQQAAQQFDwENBAABBQUPAQoCAQEFAQ4FDwENBQABDQgPAQ4BCQQPAQ0FAAEDAQ4GDwENAQMBBgQPAQ0GAAEBAQgBDAIOAQwBCAEBAQABBgQPAQ0CAA=="],"v":[20,0,12,20,16,"AQUEDwENBwABBQQPAQ0CAAEOBA8BBAYAAQoEDwEIAgABCAQPAQkFAAEBBQ8BAgIAAQIEDwEOAQEEAAEHBA8BCgQAAQsEDwEFBAABDAQPAQQEAAEFBA8BCwMAAQMEDwENBgABDgQPAQICAAEIBA8BBwYAAQgEDwEHAgABDQQPAQEGAAECBA8BDQEAAQQEDwEKCAABCwQPAQMBCgQPAQQIAAEFBA8BCQEOAw8BDQoAAQ0IDwEHCgABCAgPAQEKAAECBw8BCgwAAQsGDwEEDAABBAUPAQ0HAA=="],"w":[28,0,12,28,16,"AQABDAQPAQQEAAEHBA8BAwQAAQgEDwEIAgABCAQPAQgEAAELBA8BBwQAAQwEDwEEAgABBAQPAQwEAAEOBA8BCgMAAQEEDwEOBAABDgQPAQECAAEDBQ8BDgMAAQUEDwELBAABCwQPAQQCAAEHBg8BAwIAAQgEDwEHBAABBwQPAQgCAAELAg8BDAMPAQcCAAEMBA8BAwQAAQMEDwEMAgABDgIPAQcBDAIPAQoBAAEBBA8BDgYAAQ4EDwEBAQMDDwEDAQgCDwEOAQABBQQPAQoGAAEKBA8BBAEHAg8BDgEAAQQDDwEDAQkEDwEGBgABBgQPAQgBCwIPAQsBAAEBAw8BBwEMBA8BAgYAAQIEDwEMAQ4CDwEHAgABCwIPAQwEDwENCAABDQcPAQMCAAEIBw8BCQgAAQkGDwEOAwABBAcPAQQIAAEFBg8BCwQABw8BAQgAAQEGDwEHBAABCwUPAQsKAAELBQ8BAwQAAQgFDwEHBQA="],"x":[19,0,12,19,16,"AQEBDAQPAQoFAAEEBQ8BBAEAAQIBDgQPAQUDAAEBAQ4EDwEHAwABBQQPAQ4BAgIAAQsEDwELBQABCQQPAQsBAAEHBA8BDQEBBgABDAQPAQkFDwEDBwABAgEOCA8BBgkAAQUHDwEKCwABCQUPAQ0BAQsAAQwGDwEECgABCQcPAQ0BAQgAAQYJDwELBwABAwEOBA8BBQENBA8BBwUAAQEBDQQPAQgBAAEDBQ8BBAQAAQoEDwEMAwABBwQPAQ4BAQIAAQYEDwEOAQIEAAELBA8BCwEAAQMFDwEFBQABAgEOBA8BCA=="],"y":[20,0,12,20,22,"AQYEDwEMBwABBgQPAQwBAAEBAQ4EDwEDBgABCwQPAQYCAAEIBA8BCQUAAQIFDwEBAgABAgQPAQ4BAQQAAQcEDwEKBAABCgQPAQcEAAEMBA8BBAQAAQMEDwENAwABAgQPAQ0GAAEMBA8BBAIAAQcEDwEHBgABBQQPAQoCAAEMBA8BAQcAAQ0EDwEBAQMEDwEKCAABBwQPAQcBCAQPAQQIAAEBAQ4DDwINAw8BDQoAAQkIDwEHCgABAggPAQILAAELBg8BCwwAAQQGDwEFDQABDAQPAQ0OAAEHBA8BCA4AAQoEDwECDAABAQEHBA8BCgsABw8BDgECCwAGDwEOAQQMAAMPAQ4BDAEIAQIKAA=="],"z":[17,0,12,17,16,"AQABBA4PAgABBA4PAgABBA4PCgABBwYPCQABBgYPAQUIAAEFBg8BBggAAQUGDwEHCAABBAYPAQgIAAEDAQ4FDwEJCAABAwEOBQ8BCggAAQIBDgUPAQsIAAECAQ0FDwELAQEIAAEJBQ8BDAEBCQABCg4PAgABCg4PAgABCg4PAQA="],"{":[21,0,5,21,28,"CgABAwEJAQ0BDgMPAQkMAAEGBw8BCQsAAQIIDwEJCwABBwQPAQ4BBQEBDQABCQQPAQgPAAEKBA8BBQ8AAQoEDwEEDwABCgQPAQQPAAEKBA8BBA8AAQsEDwEEDwABDQQPAQMOAAEDBQ8BAgwAAQEBBAENBA8BDAsAAQQHDwENAQILAAEEBg8BDQECDAABBAgPAQUNAAEBAQQBDAQPAQ4PAAECBQ8BAg8AAQwEDwEEDwABCwQPAQQPAAEKBA8BBA8AAQoEDwEEDwABCgQPAQUPAAEKBA8BCA8AAQcEDwEOAQUBAQ0AAQIIDwEJDAABBwcPAQkNAAEDAQkBDQEOAw8BCQMA"],"|":[11,0,5,11,30,"AwABAwMPAQIGAAEDAw8BAgYAAQMDDwECBgABAwMPAQIGAAEDAw8BAgYAAQMDDwECBgABAwMPAQIGAAEDAw8BAgYAAQMDDwECBgABAwMPAQIGAAEDAw8BAgYAAQMDDwECBgABAwMPAQIGAAEDAw8BAgYAAQMDDwECBgABAwMPAQIGAAEDAw8BAgYAAQMDDwECBgABAwMPAQIGAAEDAw8BAgYAAQMDDwECBgABAwMPAQIGAAEDAw8BAgYAAQMDDwECBgABAwMPAQIGAAEDAw8BAgYAAQMDDwECBgABAwMPAQIGAAEDAw8BAgYAAQMDDwECAwA="],"}":[21,0,5,21,28,"AwABBAQPAQ0BCwEFDQABBAcPAQsMAAEECA8BBw0AAQEBAwEMBA8BDA8AAQMFDxAABQ8BAQ8AAQ4EDwEBDwABDgQPAQEPAAEOBA8BAQ8AAQ4EDwEBDwABDQQPAQMPAAELBA8BCA8AAQcFDwEHAQIOAAEKBw8BCQwAAQEBCQYPAQkLAAEBAQwHDwEJCwABCAQPAQ4BBgECDQABDAQPAQcPAAEOBA8BAg8AAQ4EDwEBDwABDgQPAQEPAAEOBA8BAQ8ABQ8BAQ4AAQIFDw4AAQMBCwQPAQ0LAAEECA8BCAsAAQQHDwEMAQELAAEEBA8BDgELAQYKAA=="],"~":[25,0,15,25,13,"FQABAQgAAQQBCQENAQ8BDgELAQcBAgcAAQQBDQYAAQIBCwgPAQsBBgEDAgEBBQELAQ8BDgYAAQwRDwEOBgABDAEPAQsBBQECAQABAgEGAQsIDwEMAQMGAAEMAQUHAAEBAQYBCwENAQ8BDQEKAQUIAAEBqwA="],"А":[23,0,6,24,22,"CAABDgYPAQIPAAEFBw8BCA8AAQoHDwENDgABAQkPAQQNAAEGCQ8BCQ0AAQwEDwEMBA8BDgEBCwABAgUPAQMBDgQPAQULAAEIBA8BDAEAAQkEDwELCwABDQQPAQcBAAEEBQ8BAgkAAQQFDwECAgABDgQPAQcJAAEJBA8BDAMAAQkEDwENCAABAQEOBA8BBwMAAQQFDwEDBwABBQUPAQIEAAENBA8BCQcAAQsEDwEMBQABCAQPAQ4GAAECEQ8BBQUAAQcRDwEKBQABDBIPAQEDAAEDEw8BBgMAAQkFDwEBCAABDAQPAQwDAAEOBA8BCgkAAQcFDwECAQABBQUPAQUJAAECBQ8BCAEAAQoEDwEOAQEKAAEMBA8BDQEA"],"Б":[23,0,6,23,22,"AgABBBAPAQQFAAEEEA8BBAUAAQQQDwEEBQABBBAPAQQFAAEEBQ8BBhAAAQQFDwEGEAABBAUPAQYQAAEEBQ8BBhAAAQQFDwEGEAABBAoPAQ4BDAEKAQUBAQcAAQQODwEOAQYGAAEEEA8BBwUAAQQRDwECBAABBAUPAQYDAAEBAQQBDAUPAQcEAAEEBQ8BBgUAAQIFDwEKBAABBAUPAQYGAAEOBA8BCwQAAQQFDwEGBQABAgUPAQoEAAEEBQ8BBgMAAQEBBAEMBQ8BBwQAAQQRDwECBAABBBAPAQcFAAEEDg8BDgEGBgABBAoPAQ4BDAEKAQUBAQUA"],"В":[23,0,6,23,22,"AgABBAkPAQ4BDQELAQgBAwgAAQQODwEKAQEGAAEEDw8BDAYAAQQQDwEGBQABBAUPAQYDAAECAQoFDwEKBQABBAUPAQYEAAEBAQ4EDwEMBQABBAUPAQYFAAEMBA8BDAUAAQQFDwEGBAABAQEOBA8BCgUAAQQFDwEGAwABAgEKBQ8BBQUAAQQPDwEKBgABBA4PAQcHAAEEDg8BDgEHBgABBBAPAQkFAAEEBQ8BBgMAAQEBBAEMBQ8BAwQAAQQFDwEGBQABAgUPAQgEAAEEBQ8BBgYAAQ4EDwEKBAABBAUPAQYFAAECBQ8BCgQAAQQFDwEGAwABAQEEAQwFDwEIBAABBBEPAQQEAAEEEA8BCQUAAQQPDwEIBgABBAoPAQ4BDQEKAQcBAgUA"],"Г":[19,0,6,19,22,"AgABBA8PAQQCAAEEDw8BBAIAAQQPDwEEAgABBA8PAQQCAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYMAAEEBQ8BBgwAAQQFDwEGDAABBAUPAQYKAA=="],"Д":[27,0,6,27,27,"BQABAw8PAQwKAAEDDw8BDAoAAQMPDwEMCgABAw8PAQwKAAEDBQ8BBwQAAQwEDwEMCgABAwUPAQcEAAEMBA8BDAoAAQMFDwEHBAABDAQPAQwKAAEDBQ8BBgQAAQwEDwEMCgABAwUPAQYEAAEMBA8BDAoAAQQFDwEGBAABDAQPAQwKAAEEBQ8BBQQAAQwEDwEMCgABBAUPAQQEAAEMBA8BDAoAAQUFDwEDBAABDAQPAQwKAAEGBQ8BAgQAAQwEDwEMCgABBwUPBQABDAQPAQwKAAEKBA8BDAUAAQwEDwEMCQABAgEOBA8BCQUAAQwEDwEMCAABAgENBQ8BBAUAAQwEDwEMBgABAxYPAQ4DAAEDFg8BDgMAAQMWDwEOAwABAxYPAQ4DAAEDBA8BAQ0AAQUDDwEOAwABAwQPAQENAAEFAw8BDgMAAQMEDwEBDQABBQMPAQ4DAAEDBA8BAQ0AAQUDDwEOAwABAwQPAQENAAEFAw8BDgIA"],"Е":[20,0,6,21,22,"AgABBA8PBQABBA8PBQABBA8PBQABBA8PBQABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDgABBAUPAQYOAAEEBQ8BBg4AAQQODwEGBQABBA4PAQYFAAEEDg8BBgUAAQQODwEGBQABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDgABBAUPAQYOAAEEBQ8BBg4AAQQPDwEEBAABBA8PAQQEAAEEDw8BBAQAAQQPDwEEAgA="],"Ж":[37,0,6,37,22,"AQABAwEOBA8BCwcAAQcFDwEDBgABAgEOBA8BDAEBAwABBAUPAQoGAAEHBQ8BAwUAAQEBDQQPAQ0BAQUAAQUFDwEJBQABBwUPAQMEAAEBAQwEDwEOAQIHAAEGBQ8BCAQAAQcFDwEDBAABCwQPAQ4BAwkAAQgFDwEGAwABBwUPAQMDAAEKBQ8BBAsAAQkFDwEFAgABBwUPAQMCAAEJBQ8BBQ0AAQoFDwEEAQABBwUPAQMBAAEHBQ8BBg4AAQEBCwQPAQ4BAwEHBQ8BAwEGBQ8BCBAAAQEBDQQPAQ4BCQUPAQcFDwEKEQABAgEOEQ8BDBEAAQsTDwEHDwABBxUPAQMNAAECAQ4PDwEOBQ8BDA0AAQwFDwEHAQYIDwEOAQMBCgUPAQgLAAEHBQ8BCwIAAQcGDwEOAQMBAAEBAQ4FDwEDCQABAwUPAQ4BAgMAAQoFDwEFAwABBQUPAQ0JAAEMBQ8BBgQAAQcFDwEDBAABCgUPAQgHAAEIBQ8BCwUAAQcFDwEDBAABAQEOBQ8BAwUAAQMFDwEOAQIFAAEHBQ8BAwUAAQQFDwENAQEEAAENBQ8BBQYAAQcFDwEDBgABCQUPAQkDAAEIBQ8BCgcAAQcFDwEDBgABAQENBQ8BBAEAAQMFDwEOAQEHAAEHBQ8BAwcAAQQFDwENAQE="],"З":[21,0,6,21,22,"AgABAQEEAQcBCgEMAg4BDwEOAQ0BCwEJAQUBAQcAAQgMDwEOAQgGAAEIDg8BCgUAAQgPDwEFBAABBwEKAQcBBAECAQECAAECAQYBDQUPAQoOAAECBQ8BDA8AAQ0EDwELDgABAgUPAQcMAAECAQUBDQQPAQ0BAQcAAQQKDwELAQEIAAEECQ8BCAEBCQABBAoPAQ4BBQgAAQQMDwEFCwABAQECAQUBCgUPAQ0PAAEJBQ8BAw4AAQUFDwEFAwABCwEDCQABCQUPAQQDAAIPAQsBBgEDAQECAAEBAQQBCgYPAQEDABAPAQoEAA8PAQwBAQQAAQQBDAwPAQkBAQcAAQMBCAELAQ0BDgEPAQ4BDQEMAQkBBgEBBQA="],"И":[25,0,6,25,22,"AgABBAUPAQEGAAEDBg8BBQQAAQQFDwEBBgABCwYPAQUEAAEEBQ8BAQUAAQQHDwEFBAABBAUPAQEFAAEMBw8BBQQAAQQFDwEBBAABBQgPAQUEAAEEBQ8BAQQAAQ0IDwEFBAABBAUPAQEDAAEGCQ8BBQQAAQQFDwEBAwABDQMPAQoFDwEFBAABBAUPAQECAAEHBA8BAwUPAQUEAAEEBQ8BAQEAAQEBDgMPAQkBAAUPAQUEAAEEBQ8BAQEAAQgEDwECAQAFDwEFBAABBAUPAgEBDgMPAQkCAAUPAQUEAAEEBQ8BAQEJAw8BDgEBAgAFDwEFBAABBAUPAQMEDwEIAwAFDwEFBAABBAUPAQsDDwEOAQEDAAUPAQUEAAEECQ8BBwQABQ8BBQQAAQQIDwEOAQEEAAUPAQUEAAEECA8BBgUABQ8BBQQAAQQHDwENBgAFDwEFBAABBAcPAQUGAAUPAQUEAAEEBg8BDAcABQ8BBQQAAQQGDwEFBwAFDwEFAgA="],"Й":[25,0,1,25,27,"BwABCwEPAQcEAAEFAQ8BDQ8AAQYCDwEGAgEBBQEOAQ8BCRAAAQwGDwENAQEQAAEBAQcBDAIPAQ0BCAEBJAABBAUPAQEGAAEDBg8BBQQAAQQFDwEBBgABCwYPAQUEAAEEBQ8BAQUAAQQHDwEFBAABBAUPAQEFAAEMBw8BBQQAAQQFDwEBBAABBQgPAQUEAAEEBQ8BAQQAAQ0IDwEFBAABBAUPAQEDAAEGCQ8BBQQAAQQFDwEBAwABDQMPAQoFDwEFBAABBAUPAQECAAEHBA8BAwUPAQUEAAEEBQ8BAQEAAQEBDgMPAQkBAAUPAQUEAAEEBQ8BAQEAAQgEDwECAQAFDwEFBAABBAUPAgEBDgMPAQkCAAUPAQUEAAEEBQ8BAQEJAw8BDgEBAgAFDwEFBAABBAUPAQMEDwEIAwAFDwEFBAABBAUPAQsDDwEOAQEDAAUPAQUEAAEECQ8BBwQABQ8BBQQAAQQIDwEOAQEEAAUPAQUEAAEECA8BBgUABQ8BBQQAAQQHDwENBgAFDwEFBAABBAcPAQUGAAUPAQUEAAEEBg8BDAcABQ8BBQQAAQQGDwEFBwAFDwEFAgA="],"К":[25,0,6,25,22,"AgABBAUPAQYHAAEFBQ8BDgEDAwABBAUPAQYGAAEEBQ8BDgEDBAABBAUPAQYFAAEEAQ4EDwEOAQMFAAEEBQ8BBgQAAQQBDgQPAQ4BAwYAAQQFDwEGAwABAwEOBA8BDgEEBwABBAUPAQYCAAEDAQ4FDwEECAABBAUPAQYBAAEDAQ4FDwEECQABBAUPAQYBAgEOBQ8BBQoAAQQFDwEIAQ4FDwEFCwABBAwPAQULAAEEDA8BDgEBCgABBA0PAQsKAAEECA8BDQUPAQYJAAEEBw8BBwECAQ4EDwEOAQIIAAEEBg8BBwIAAQYFDwEMCAABBAUPAQkEAAEKBQ8BCAcAAQQFDwEGBAABAQEOBQ8BAwYAAQQFDwEGBQABBAUPAQ0BAQUAAQQFDwEGBgABCQUPAQkFAAEEBQ8BBgYAAQEBDQUPAQUEAAEEBQ8BBgcAAQMFDwEOAQEDAAEEBQ8BBggAAQcFDwELAQA="],"Л":[25,0,6,25,22,"BgABBg8PAQIIAAEGDw8BAggAAQYPDwECCAABBg8PAQIIAAEGBQ8BBAMAAQcFDwECCAABBgUPAQMDAAEHBQ8BAggAAQYFDwEDAwABBwUPAQIIAAEHBQ8BAwMAAQcFDwECCAABBwUPAQIDAAEHBQ8BAggAAQgFDwECAwABBwUPAQIIAAEIBQ8BAQMAAQcFDwECCAABCQUPBAABBwUPAQIIAAELBA8BDQQAAQcFDwECCAABDQQPAQsEAAEHBQ8BAggABQ8BCAQAAQcFDwECBwABBQUPAQUEAAEHBQ8BAgYAAQIBDQUPAQEEAAEHBQ8BAgMAAQEBAwEIAQ4FDwELBQABBwUPAQIDAAEJBw8BDgEDBQABBwUPAQIDAAEJBg8BDgEEBgABBwUPAQIDAAEJBA8BDgEIAQEHAAEHBQ8BAgMAAQkBDQEKAQcBBAoAAQcFDwECAgA="],"М":[30,0,6,30,22,"AgABBAcPAQIIAAEEBw8BAQQAAQQHDwEICAABCwcPAQEEAAEEBw8BDgEBBgABAggPAQEEAAEECA8BBgYAAQgIDwEBBAABBAgPAQwFAAEBAQ4IDwEBBAABBAkPAQMEAAEGCQ8BAQQAAQQFDwEMAw8BCgQAAQwDDwEMBQ8BAQQAAQQFDwEFBA8BAQIAAQQEDwEGBQ8BAQQAAQQFDwEBAQ0DDwEHAgABCgMPAQoBBAUPAQEEAAEEBQ8BAQEGAw8BDQEAAQEEDwIEBQ8BAQQAAQQFDwIBAQ4DDwEFAQcDDwENAQABBAUPAQEEAAEEBQ8BAQEAAQkDDwELAQ0DDwEHAQABBAUPAQEEAAEEBQ8BAQEAAQMHDwEOAQEBAAEEBQ8BAQQAAQQFDwEBAgABCwYPAQkCAAEEBQ8BAQQAAQQFDwEBAgABBQYPAQMCAAEEBQ8BAQQAAQQFDwEBAwABDQQPAQsDAAEEBQ8BAQQAAQQFDwEBAwABBwQPAQUDAAEEBQ8BAQQAAQQFDwEBAwABAQMPAQ4EAAEEBQ8BAQQAAQQFDwEBDAABBAUPAQEEAAEEBQ8BAQwAAQQFDwEBBAABBAUPAQEMAAEEBQ8BAQQAAQQFDwEBDAABBAUPAQECAA=="],"Н":[25,0,6,25,22,"AgABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBBMPAQUEAAEEEw8BBQQAAQQTDwEFBAABBBMPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUCAA=="],"О":[26,0,6,26,22,"BwABAQEGAQkBDAEOAQ8BDgENAQsBCAEDDQABAQEIAQ4KDwEMAQQKAAECAQwODwEHCAABAQENEA8BBwcAAQsFDwEOAQcBAgEAAQEBBAELBg8BBAUAAQUFDwEOAQMGAAEJBQ8BDAUAAQsFDwEFCAABDAUPAQQDAAEBBQ8BDQkAAQYFDwEIAwABBAUPAQkJAAEBBQ8BDAMAAQYFDwEGCgABDgQPAQ0DAAEHBQ8BBQoAAQ0EDwEOAwABBwUPAQUKAAENBA8BDgMAAQYFDwEGCgABDgQPAQ0DAAEEBQ8BCQkAAQEFDwEMAwABAQUPAQ0JAAEGBQ8BCAQAAQsFDwEFCAABDAUPAQQEAAEFBQ8BDgECBgABCQUPAQwGAAEMBQ8BDgEHAQIBAAEBAQQBCwYPAQQGAAEBAQ0QDwEHCAABAgEMDg8BBwoAAQEBCAEOCg8BDAEEDQABAQEGAQoBDQEOAQ8BDgENAQsBCAEDCAA="],"П":[25,0,6,25,22,"AgABBBMPAQUEAAEEEw8BBQQAAQQTDwEFBAABBBMPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUEAAEEBQ8BBgcAAQQFDwEFBAABBAUPAQYHAAEEBQ8BBQQAAQQFDwEGBwABBAUPAQUCAA=="],"Р":[22,0,6,22,22,"AgABBAoPAQ4BDAEJAQQHAAEEDg8BDAEDBQABBA8PAQ4BAwQAAQQQDwENBAABBAUPAQYDAAECAQcGDwEFAwABBAUPAQYFAAEHBQ8BCQMAAQQFDwEGBQABAgUPAQsDAAEEBQ8BBgUAAQIFDwELAwABBAUPAQYFAAEHBQ8BCQMAAQQFDwEGAwABAgEHBg8BBQMAAQQQDwENBAABBA8PAQ4BAwQAAQQODwEMAQMFAAEECg8BDgEMAQkBBAcAAQQFDwEGDwABBAUPAQYPAAEEBQ8BBg8AAQQFDwEGDwABBAUPAQYPAAEEBQ8BBg8AAQQFDwEGDwABBAUPAQYNAA=="],"С":[22,0,6,22,22,"CAABBAEIAQsBDQEOAQ8BDgEMAQoBBgECCQABBQEMCw8BCgEBBQABAQEKDg8BAQUAAQsPDwEBBAABCQYPAQwBBQECAQABAQECAQYBCgIPAQEDAAEDBg8BBwgAAQIBCgEBAwABCgUPAQkPAAEOBA8BDgEBDgABBAUPAQoPAAEGBQ8BBw8AAQcFDwEFDwABBwUPAQUPAAEGBQ8BBw8AAQQFDwEKEAABDgQPAQ4BAQ8AAQoFDwEJDwABAwYPAQcIAAECAQoBAQQAAQkGDwEMAQUBAgEAAQEBAgEFAQoCDwEBBQABCw8PAQEFAAEBAQoODwEBBwABBQEMCw8BCgEBCQABBAEIAQsBDQEOAQ8BDgENAQoBBgECAwA="],"Т":[20,0,6,21,22,"AQ0TDwEEAQ0TDwEEAQ0TDwEEAQ0TDwEEBwABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBDgABCQUPAQEOAAEJBQ8BAQ4AAQkFDwEBBwA="],"У":[23,0,6,23,22,"AQABDQQPAQ4BAQgAAQ0EDwEOAQEBAAEGBQ8BBwcAAQYFDwEIAgABAQEOBA8BDgEBBgABDQUPAQEDAAEHBQ8BBwUAAQUFDwEJBAABAQEOBA8BDgUAAQwFDwECBQABCAUPAQYDAAEEBQ8BCgYAAQEBDgQPAQ0DAAEMBQ8BAwcAAQkFDwEGAQABBAUPAQsIAAECBQ8BDQEAAQsFDwEECQABCQUPAQgFDwEMCgABAgsPAQULAAEKCQ8BDQwAAQMJDwEGDQABCwcPAQ0OAAEDBw8BBw8AAQsFDwEOAQEPAAEGBQ8BCA8AAQQBDQQPAQ4BAQwAAQkIDwEIDQABCQcPAQ0BAQ0AAQkGDwEMAQIOAAEJAQ8CDgEMAQkBBQwA"],"Ф":[30,0,6,30,22,"DAABDgQPAQsYAAEOBA8BCxMAAQMBBwEKAQwBDgYPAQ4BDAEJAQYBAgwAAQYBDBAPAQsBBAgAAQIBDBQPAQoGAAEBAQ0WDwEKBQABCQYPAQkBBAEBAQ4EDwELAQIBBQELBg8BBQMAAQEGDwEEAwABDgQPAQsDAAEIBQ8BCwMAAQQFDwEKBAABDgQPAQsEAAENBQ8BAQIAAQYFDwEGBAABDgQPAQsEAAEKBQ8BAgIAAQcFDwEFBAABDgQPAQsEAAEJBQ8BAwIAAQYFDwEGBAABDgQPAQsEAAEKBQ8BAgIAAQQFDwEKBAABDgQPAQsEAAENBQ8BAQIAAQEGDwEEAwABDgQPAQsDAAEIBQ8BDAQAAQkGDwEJAQQBAQEOBA8BCwECAQUBCwYPAQUEAAEBAQ0WDwEKBgABAgEMFA8BCgkAAQYBDRAPAQsBBAwAAQMBBwEKAQwBDgYPAQ4BDAEJAQYBAhMAAQ4EDwELGAABDgQPAQsYAAEOBA8BCwwA"],"Х":[23,0,6,23,22,"AQABDAQPAQ4BAgcAAQEBDgQPAQ0BAQEAAQIFDwELBwABCgUPAQMDAAEHBQ8BBwUAAQYFDwEIBQABCwQPAQ4BAgMAAQIBDgQPAQwGAAECAQ4EDwEMAwABCwUPAQMHAAEGBQ8BBwEAAQYFDwEICQABCwUPAQQBDgQPAQwKAAECAQ4KDwEDCwABBgkPAQcNAAELBw8BDA4AAQEBDgYPAQIOAAEFBw8BBg0AAQEBDgcPAQ4BAgwAAQoJDwEMCwABBQUPAQwFDwEHCQABAgEOBA8BDQEBAQsFDwECCAABCwUPAQMBAAECAQ4EDwEMBwABBgUPAQgDAAEGBQ8BBwUAAQIBDgQPAQwFAAELBQ8BAwQAAQsFDwEDBQABAgEOBA8BDAMAAQYFDwEHBwABBgUPAQgBAAECAQ4EDwEMCQABCgUPAQM="],"Ц":[28,0,6,28,27,"AgABBAUPAQYHAAEEBQ8BBQcAAQQFDwEGBwABBAUPAQUHAAEEBQ8BBgcAAQQFDwEFBwABBAUPAQYHAAEEBQ8BBQcAAQQFDwEGBwABBAUPAQUHAAEEBQ8BBgcAAQQFDwEFBwABBAUPAQYHAAEEBQ8BBQcAAQQFDwEGBwABBAUPAQUHAAEEBQ8BBgcAAQQFDwEFBwABBAUPAQYHAAEEBQ8BBQcAAQQFDwEGBwABBAUPAQUHAAEEBQ8BBgcAAQQFDwEFBwABBAUPAQYHAAEEBQ8BBQcAAQQFDwEGBwABBAUPAQUHAAEEBQ8BBgcAAQQFDwEFBwABBAUPAQYHAAEEBQ8BBQcAAQQFDwEGBwABBAUPAQUHAAEEBQ8BBgcAAQQFDwEFBwABBBcPBAABBBcPBAABBBcPBAABBBcPFwABBAQPFwABBAQPFwABBAQPFwABBAQPFwABBAQPAgA="],"Ч":[24,0,6,24,22,"AgABCQUPAQEGAAECBQ8BBwQAAQkFDwEBBgABAgUPAQcEAAEJBQ8BAQYAAQIFDwEHBAABCQUPAQEGAAECBQ8BBwQAAQkFDwEBBgABAgUPAQcEAAEJBQ8BAgYAAQIFDwEHBAABCQUPAQMGAAECBQ8BBwQAAQgFDwEGBgABAgUPAQcEAAEGBQ8BDQEDBQABAgUPAQcEAAECEg8BBwUAAQoRDwEHBQABAQEMEA8BBwYAAQEBBwEMAQ4NDwEHEQABAgUPAQcRAAECBQ8BBxEAAQIFDwEHEQABAgUPAQcRAAECBQ8BBxEAAQIFDwEHEQABAgUPAQcRAAECBQ8BBxEAAQIFDwEHAgA="],"Ш":[37,0,6,37,22,"AgABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBAABBB8PAQQEAAEEHw8BBAQAAQQfDwEEBAABBB8PAQQCAA=="],"Щ":[40,0,6,40,27,"AgABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBAUPAQYGAAEEBQ8BBQYAAQUFDwEEBwABBCMPBAABBCMPBAABBCMPBAABBCMPIwABBAQPIwABBAQPIwABBAQPIwABBAQPIwABBAQPAgA="],"Ъ":[28,0,6,28,22,"AQABBwwNAQQOAAEIDA8BBQ4AAQgMDwEFDgABCAwPAQUOAAEDBgYBCQUPAQUVAAEFBQ8BBRUAAQUFDwEFFQABBQUPAQUVAAEFBQ8BCgQIAQcBBQECDgABBQ0PAQ0BBgwAAQUPDwEMAQEKAAEFEA8BCgoAAQUFDwEMAwsBDQcPAQMJAAEFBQ8BBQQAAQEBCwUPAQcJAAEFBQ8BBQUAAQIFDwEJCQABBQUPAQUGAAUPAQoJAAEFBQ8BBQUAAQMFDwEJCQABBQUPAQUEAAEDAQwFDwEFCQABBQUPBA0BDgYPAQ4BAQkAAQUQDwEFCgABBQ4PAQ0BBAsAAQUKDwEOAQwBCQEFBQA="],"Ы":[31,0,6,31,22,"AgABBAUPAQYNAAEFBQ8BBQQAAQQFDwEGDQABBQUPAQUEAAEEBQ8BBg0AAQUFDwEFBAABBAUPAQYNAAEFBQ8BBQQAAQQFDwEGDQABBQUPAQUEAAEEBQ8BBg0AAQUFDwEFBAABBAUPAQYNAAEFBQ8BBQQAAQQFDwEGDQABBQUPAQUEAAEECg8BDgEMAQkBBQUAAQUFDwEFBAABBA4PAQ0BBAMAAQUFDwEFBAABBBAPAQUCAAEFBQ8BBQQAAQQQDwEOAQEBAAEFBQ8BBQQAAQQFDwEGAwABAQEEAQ0FDwEGAQABBQUPAQUEAAEEBQ8BBgUAAQQFDwEJAQABBQUPAQUEAAEEBQ8BBgYAAQ4EDwELAQABBQUPAQUEAAEEBQ8BBgYAAQ4EDwELAQABBQUPAQUEAAEEBQ8BBgUAAQQFDwEJAQABBQUPAQUEAAEEBQ8BBgMAAQEBBQENBQ8BBgEAAQUFDwEFBAABBBAPAQ4BAQEAAQUFDwEFBAABBBAPAQUCAAEFBQ8BBQQAAQQODwENAQQDAAEFBQ8BBQQAAQQKDwEOAQwBCQEFBQABBQUPAQUCAA=="],"Ь":[23,0,6,23,22,"AgABBAUPAQYQAAEEBQ8BBhAAAQQFDwEGEAABBAUPAQYQAAEEBQ8BBhAAAQQFDwEGEAABBAUPAQYQAAEEBQ8BBhAAAQQKDwEOAQwBCQEFCAABBA4PAQ0BBAYAAQQQDwEFBQABBBAPAQ4BAQQAAQQFDwEGAwABAQEEAQ0FDwEGBAABBAUPAQYFAAEEBQ8BCQQAAQQFDwEGBgABDgQPAQsEAAEEBQ8BBgYAAQ4EDwELBAABBAUPAQYFAAEEBQ8BCQQAAQQFDwEGAwABAQEFAQ0FDwEGBAABBBAPAQ4BAQQAAQQQDwEFBQABBA4PAQ0BBAYAAQQKDwEOAQwBCQEFBgA="],"Э":[22,0,5,22,24,"BgABAQEDAQQBAwECDgABBQEKAQ4GDwELAQcBAQgAAQEBDQwPAQgHAAEBDg8BDAECBQABAQUPAg0BDgcPAQ0BAQQAAQEBDwEOAQgBAwQAAQMBCQYPAQsEAAEBAQgBAQgAAQUGDwEEDwABCAUPAQsPAAEBAQ4FDwEBBgAJAQEKBQ8BBAUAAQYPDwEGBQABBg8PAQcFAAEGDw8BBwUAAQYPDwEGBQABAQkDAQsFDwEFDwABDQUPAQEOAAEGBQ8BDAMAAQEBBgkAAQMBDgUPAQUDAAEBAQ8BDAEGAQEFAAEGAQ4FDwEMBAABAQQPAQwBCwEKAQwHDwEOAQIEAAEBDg8BDgEDBQABAQ0PAQsBAgcAAQEBBwEMBw8BDgEKAQMMAAEBAQQBBQEGAQUBBAEDCgA="],"Ю":[35,0,6,35,22,"AgABBAUPAQYIAAEDAQgBCwENAQ4BDwEOAQ0BCgEGAQEJAAEEBQ8BBgYAAQMBDAoPAQ4BCAEBBwABBAUPAQYFAAEGDg8BDQECBgABBAUPAQYEAAEFEA8BDgECBQABBAUPAQYDAAECBg8BDAEFAQEBAAECAQcBDgUPAQwFAAEEBQ8BBgMAAQsFDwEKBgABAgENBQ8BBQQAAQQFDwEGAgABAgUPAQ0BAQcAAQQFDwEMBAABBAUPAQYCAAEIBQ8BBwkAAQwFDwEBAwABBAUPAQYCAAELBQ8BAgkAAQgFDwEFAwABBA4PCgABBQUPAQcDAAEEDQ8BDgoAAQQFDwEIAwABBA0PAQ4KAAEEBQ8BCAMAAQQODwoAAQUFDwEHAwABBAUPAQYCAAELBQ8BAgkAAQgFDwEFAwABBAUPAQYCAAEIBQ8BBwkAAQwFDwEBAwABBAUPAQYCAAEDBQ8BDQgAAQQFDwEMBAABBAUPAQYDAAELBQ8BCQYAAQIBDQUPAQUEAAEEBQ8BBgMAAQIGDwEMAQUBAQEAAQIBBwEOBQ8BDAUAAQQFDwEGBAABBhAPAQ4BAgUAAQQFDwEGBQABBg4PAQ0BAwYAAQQFDwEGBgABAwEMCg8BDgEIAQEHAAEEBQ8BBggAAQMBCAELAQ0BDgEPAQ4BDQEKAQYBAQcA"],"Я":[23,0,6,23,22,"BgABAwEIAQsCDgkPAQUGAAEBAQoODwEFBgABDA8PAQUFAAEGBQ8BCwEDAwABBAUPAQUFAAEMBA8BDgEBBAABBAUPAQUFAAUPAQsFAAEEBQ8BBQQAAQEFDwEJBQABBAUPAQUFAAUPAQkFAAEEBQ8BBQUAAQsEDwELBQABBAUPAQUFAAEDBA8BDgEBBAABBAUPAQUGAAEFBA8BDAEDAwABBAUPAQUHAAEEAQ4NDwEFCAABAgENDA8BBQgAAQINDwEFCAABCwUPAQcBAAEEBQ8BBQcAAQQFDwENAgABBAUPAQUHAAENBQ8BBAIAAQQFDwEFBgABBwUPAQoDAAEEBQ8BBQUAAQEBDgQPAQ4BAQMAAQQFDwEFBQABCQUPAQcEAAEEBQ8BBQQAAQMFDwEMBQABBAUPAQUEAAEMBQ8BAwUAAQQFDwEFAgA="],"а":[20,0,12,20,16,"AgABBAcPAg4BCwEJAQQHAAEEDA8BDAECBQABBA0PAQ0BAQQAAQQBDAEIAQQBAgEBAQABAQECAQYBDgQPAQcOAAEHBA8BCwYAAQQBCAELAQ0BDggPAQ0EAAEBAQsNDwENBAABDA4PAQ0DAAEFBQ8BCgEDAQECAAEGBA8BDQMAAQkEDwEMBQABBwQPAQ0DAAEKBA8BCQUAAQsEDwENAwABCQQPAQwEAAEEBQ8BDQMAAQYFDwEIAgEBBQEOBQ8BDQQAAQ0JDwEJBA8BDQQAAQMBDQYPAQ4BBQEGBA8BDQUAAQEBCAEMAg4BDQEIAQIBAAEGBA8BDQIA"],"б":[21,0,4,21,24,"DwACAQoAAQEBAwEGAQcBCQELAQwBDQIPAQkIAAECAQoLDwEBBgABAgEOBg8BDgENAQwBCwEJAQgBAgYAAQwDDwENAQcBAw0AAQcDDwELAQEPAAEOAg8BDgEBDwABBAMPAQkQAAEHAw8BBgEEAQkBDAEOAQ8BDgENAQoBBgEBBgABCQMPAQ4JDwEOAQYFAAEKDw8BCQQAAQoGDwELAQMBAAECAQgFDwEGAwABCAUPAQ0BAQQAAQkEDwEOAQECAAEHBQ8BBwUAAQIFDwEEAgABBgUPAQMGAAEOBA8BCAIAAQYFDwECBgABDQQPAQkCAAEFBQ8BAgYAAQ0EDwEJAgABBAUPAQMGAAEOBA8BCAIAAQEFDwEHBQABAgUPAQQDAAELBA8BDQEBBAABCQQPAQ4BAQMAAQMFDwELAQMBAAECAQgFDwEGBQABBg0PAQkHAAEEAQ0JDwEOAQcKAAEFAQkBDAEOAQ8BDgENAQoBBgEBBQA="],"в":[19,0,12,19,16,"AgABBwgPAQ4BDQEKAQUGAAEHDA8BDAEBBAABBw0PAQkEAAEHBA8BDAIAAQEBBgQPAQ0EAAEHBA8BDAQABA8BDgQAAQcEDwEMAwABBgQPAQoEAAEHDA8BDgECBAABBwsPAQ4BBAUAAQcNDwEHBAABBwQPAQwDAAEDAQwEDwEDAwABBwQPAQwEAAEFBA8BCAMAAQcEDwEMBAABBQQPAQoDAAEHBA8BDAMAAQMBDAQPAQgDAAEHDg8BAwMAAQcNDwEGBAABBwkPAQ4BCwEIAQIDAA=="],"г":[16,0,12,16,16,"AgABBwsPAQ4DAAEHCw8BDgMAAQcLDwEOAwABBwQPAQwKAAEHBA8BDAoAAQcEDwEMCgABBwQPAQwKAAEHBA8BDAoAAQcEDwEMCgABBwQPAQwKAAEHBA8BDAoAAQcEDwEMCgABBwQPAQwKAAEHBA8BDAoAAQcEDwEMCgABBwQPAQwIAA=="],"д":[24,0,12,24,20,"BQABBQ0PAQwJAAEFDQ8BDAkAAQUNDwEMCQABBQQPAQ0DAAEGBA8BDAkAAQYEDwENAwABBgQPAQwJAAEGBA8BDQMAAQYEDwEMCQABBwQPAQwDAAEGBA8BDAkAAQgEDwELAwABBgQPAQwJAAEKBA8BCQMAAQYEDwEMCQABDAQPAQcDAAEGBA8BDAgAAQEFDwEFAwABBgQPAQwIAAEJBQ8BAQMAAQYEDwEMBgABAQEIBQ8BDAQAAQYEDwEMBQABBRQPAQgCAAEFFA8BCAIAAQUUDwEIAgABBQMPAQcMAAEDAw8BCAIAAQUDDwEHDAABAwMPAQgCAAEFAw8BBwwAAQMDDwEIAgABBQMPAQcMAAEDAw8BCAEA"],"е":[20,0,12,20,16,"BQABAQEGAQoBDQEOAQ8BDgEMAQgBAgkAAQYBDgkPAQgHAAEJDA8BCgUAAQcFDwEIAQIBAAEEAQ0EDwEHAwABAQEOBA8BCQQAAQMEDwEOAQECAAEFBQ8BAQUAAQsEDwEGAgABCQQPAQwGAAEJBA8BCgIAAQoQDwEMAgABChAPAQ0CAAEJEA8BDQIAAQUEDwEMDgABAQEOBA8BBAgAAQMBCgECAwABBwQPAQ4BCAEDAQEBAAEBAQQBBwENAg8BAgQAAQkODwECBQABBgEODA8BAgYAAQEBBgEKAQ0BDgEPAQ4BDQEMAQsBCAEFAQICAA=="],"ж":[30,0,12,30,16,"AQABBwUPAQQEAAEKBA8BCAQAAQcFDwEFAwABBgUPAQUDAAEKBA8BCAMAAQcFDwEEBQABBgUPAQUCAAEKBA8BCAIAAQgEDwEOAQQHAAEFBQ8BBQEAAQoEDwEIAQABCQQPAQ4BAwkAAQQBDgQPAQYBCgQPAQgBCQQPAQ4BAwsAAQQBDgQPAQ4EDwEOBA8BDQECDQABBg4PAQMNAAEBAQ0ODwELDQABChAPAQgLAAEHBA8BDAELBg8BDAEOBA8BBQkAAQQEDwEOAQIBAQEMBA8BDAEBAQUEDwEOAQIHAAECAQ4EDwEFAgABCgQPAQgCAAEIBA8BDQEBBgABDAQPAQgDAAEKBA8BCAMAAQsEDwEKBQABCQQPAQsEAAEKBA8BCAMAAQEBDQQPAQcDAAEGBA8BDgEBBAABCgQPAQgEAAEDBQ8BBAEAAQMFDwEEBQABCgQPAQgFAAEGBA8BDgEC"],"з":[17,0,12,17,16,"AgABAQEFAQkBDAENAQ4BDwEOAQ0BCgEGAQEFAAEMCg8BDQEDBAABDAsPAQwEAAEMAQ0BBwECAgEBAgEHBQ8BAQMAAQgBAQYAAQsEDwEBCQABAgEHBA8BCwYAAQwIDwELAQIGAAEMBw8BCQEBBwABDAgPAQ4BBAkAAQEBAwEHAQ4DDwEOAQILAAEGBA8BBgIAAQcBBgcAAQYEDwEHAgABCAEPAQ0BBwEDAgABAgEHBQ8BBQIAAQgMDwENAwABCAsPAQwBAgMAAQEBBAEIAQwBDQEOAQ8BDgENAQwBCQEEBAA="],"и":[21,0,12,21,16,"AgABBwQPAQwEAAEEBQ8BCAQAAQcEDwEMBAABDQUPAQgEAAEHBA8BDAMAAQgGDwEIBAABBwQPAQwCAAECBw8BCAQAAQcEDwEMAgABCwcPAQgEAAEHBA8BDAEAAQUIDwEIBAABBwQPAQwBAQEOCA8BCAQAAQcEDwEMAQkEDwEOBA8BCAQAAQcEDwEOBA8BCQELBA8BCAQAAQcIDwEOAQEBCwQPAQgEAAEHCA8BBgEAAQsEDwEIBAABBwcPAQsCAAELBA8BCAQAAQcHDwECAgABCwQPAQgEAAEHBg8BCAMAAQsEDwEIBAABBwUPAQ0BAQMAAQsEDwEIBAABBwUPAQQEAAELBA8BCAIA"],"й":[21,0,5,21,23,"BQABBQEPAQ0FAAENAQ8BBgoAAQECDwEKAQIBAAECAQkCDwECCwABBwcPAQcNAAEFAQsBDgEPAQ4BCwEFSAABBwQPAQwEAAEEBQ8BCAQAAQcEDwEMBAABDQUPAQgEAAEHBA8BDAMAAQgGDwEIBAABBwQPAQwCAAECBw8BCAQAAQcEDwEMAgABCwcPAQgEAAEHBA8BDAEAAQUIDwEIBAABBwQPAQwBAQEOCA8BCAQAAQcEDwEMAQkEDwEOBA8BCAQAAQcEDwEOBA8BCQELBA8BCAQAAQcIDwEOAQEBCwQPAQgEAAEHCA8BBgEAAQsEDwEIBAABBwcPAQsCAAELBA8BCAQAAQcHDwECAgABCwQPAQgEAAEHBg8BCAMAAQsEDwEIBAABBwUPAQ0BAQMAAQsEDwEIBAABBwUPAQQEAAELBA8BCAIA"],"к":[20,0,12,20,16,"AgABBwQPAQwEAAECAQwEDwELAQECAAEHBA8BDAMAAQIBDQQPAQoEAAEHBA8BDAIAAQMBDgQPAQoFAAEHBA8BDAEAAQMBDgQPAQkGAAEHBA8BDAEEAQ4EDwEIBwABBwQPAQ4FDwEGCAABBwkPAQkJAAEHCQ8BDgEDCAABBwoPAQ0BAQcAAQcFDwEOAQsEDwELBwABBwQPAQ4BAgEBAQwEDwEIBgABBwQPAQwCAAECAQ4EDwEFBQABBwQPAQwDAAEEBA8BDgEDBAABBwQPAQwEAAEHBA8BDQEBAwABBwQPAQwFAAEKBA8BCwMAAQcEDwEMBQABAQENBA8BCA=="],"л":[22,0,12,22,16,"BQABCw0PAQcHAAELDQ8BBwcAAQsNDwEHBwABCwQPAQgDAAEMBA8BBwcAAQsEDwEIAwABDAQPAQcHAAELBA8BBwMAAQwEDwEHBwABDAQPAQcDAAEMBA8BBwcAAQwEDwEGAwABDAQPAQcHAAENBA8BBQMAAQwEDwEHBwABDgQPAQMDAAEMBA8BBwYAAQIFDwQAAQwEDwEHBgABCgQPAQsEAAEMBA8BBwQAAQQBCwUPAQMEAAEMBA8BBwMAAQUGDwEHBQABDAQPAQcDAAEFBA8BDgEFBgABDAQPAQcDAAEFAQ4BDQEKAQUBAQcAAQwEDwEHAgA="],"м":[25,0,12,25,16,"AgABBwUPAQwGAAEEBg8FAAEHBg8BBAUAAQsGDwUAAQcGDwELBAABAwcPBQABBwcPAQMDAAEKBw8FAAEHBw8BCgIAAQIIDwUAAQcIDwECAQABCQgPBQABBwgPAQkBAgkPBQABBwQPAQwBDgIPAQ4BCQMPAQsFDwUAAQcEDwEMAQgGDwEOAQUFDwUAAQcEDwEMAQEBDgUPAQkBBAUPBQABBwQPAQwBAAEJBQ8BAgEEBQ8FAAEHBA8BDAEAAQIEDwEKAQABBAUPBQABBwQPAQwCAAEKAw8BAwEAAQQFDwUAAQcEDwEMCAABBAUPBQABBwQPAQwIAAEEBQ8FAAEHBA8BDAgAAQQFDwMA"],"н":[21,0,12,21,16,"AgABBwQPAQwFAAUPAQMEAAEHBA8BDAUABQ8BAwQAAQcEDwEMBQAFDwEDBAABBwQPAQwFAAUPAQMEAAEHBA8BDAUABQ8BAwQAAQcEDwEMBQAFDwEDBAABBw8PAQMEAAEHDw8BAwQAAQcPDwEDBAABBwQPAQwFAAUPAQMEAAEHBA8BDAUABQ8BAwQAAQcEDwEMBQAFDwEDBAABBwQPAQwFAAUPAQMEAAEHBA8BDAUABQ8BAwQAAQcEDwEMBQAFDwEDBAABBwQPAQwFAAUPAQMCAA=="],"о":[21,0,12,21,16,"BQABAQEGAQoBDQEOAQ8BDgEMAQkBBAoAAQcBDgkPAQ0BAwcAAQoNDwEEBQABBwUPAQgBAgEAAQMBDAQPAQ4BAgMAAQEBDgQPAQgEAAEBAQ0EDwEJAwABBQUPAQIFAAEHBA8BDgMAAQkEDwENBgABBAUPAQMCAAEKBA8BDAYAAQMFDwEEAgABCgQPAQwGAAEDBQ8BBAIAAQkEDwENBgABBAUPAQMCAAEFBQ8BAQUAAQcEDwEOAwABAQEOBA8BCAQAAQEBDQQPAQkEAAEHBQ8BCAECAQABAwEMBA8BDgECBQABCg0PAQQHAAEHAQ4JDwENAQMJAAEBAQYBCgENAQ4BDwEOAQwBCQEEBgA="],"п":[21,0,12,21,16,"AgABBw8PAQMEAAEHDw8BAwQAAQcPDwEDBAABBwQPAQwFAAUPAQMEAAEHBA8BDAUABQ8BAwQAAQcEDwEMBQAFDwEDBAABBwQPAQwFAAUPAQMEAAEHBA8BDAUABQ8BAwQAAQcEDwEMBQAFDwEDBAABBwQPAQwFAAUPAQMEAAEHBA8BDAUABQ8BAwQAAQcEDwEMBQAFDwEDBAABBwQPAQwFAAUPAQMEAAEHBA8BDAUABQ8BAwQAAQcEDwEMBQAFDwEDBAABBwQPAQwFAAUPAQMCAA=="],"р":[21,0,12,21,22,"AgABBwQPAQwCAAEGAQsBDgEPAQ0BCQECBgABBwQPAQwBAQEMBw8BBgUAAQcEDwIMCQ8BBQQAAQcGDwEIAQIBAAEEAQ0EDwEOAQEDAAEHBQ8BCAQAAQIBDgQPAQcDAAEHBQ8BAgUAAQoEDwEMAwABBwQPAQ0GAAEGBQ8DAAEHBA8BDAYAAQUFDwEBAgABBwQPAQwGAAEFBQ8BAQIAAQcEDwENBgABBgUPAwABBwUPAQIFAAEKBA8BDAMAAQcFDwEIBAABAgEOBA8BBwMAAQcGDwEIAQEBAAEEAQ0EDwEOAQEDAAEHBA8CDAkPAQUEAAEHBA8BDAEBAQwHDwEGBQABBwQPAQwCAAEGAQwBDgEPAQ0BCQECBgABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDwABBwQPAQwPAAEHBA8BDA8AAQcEDwEMDQA="],"с":[18,0,12,18,16,"BgABBQEJAQwBDgEPAQ4BDAEKAQYBAQYAAQUBDgkPAQwFAAEICw8BDAQAAQYFDwENAQUBAQEAAQIBBwEOAQwDAAEBAQ4EDwEMAQEFAAEBAQgDAAEFBQ8BBAsAAQkEDwEODAABCgQPAQwMAAEKBA8BDAwAAQkEDwEODAABBQUPAQMLAAEBAQ4EDwEMAQEFAAEBAQgEAAEGBQ8BDQEFAQEBAAECAQYBDgEMBQABCAsPAQwGAAEGAQ4JDwEMCAABBQEJAQwBDgEPAQ4BDAEKAQYBAQIA"],"т":[17,0,12,18,16,"AQ0QDwEEAQ0QDwEEAQ0QDwEEBgABDgQPAQUMAAEOBA8BBQwAAQ4EDwEFDAABDgQPAQUMAAEOBA8BBQwAAQ4EDwEFDAABDgQPAQUMAAEOBA8BBQwAAQ4EDwEFDAABDgQPAQUMAAEOBA8BBQwAAQ4EDwEFDAABDgQPAQUGAA=="],"у":[20,0,12,20,22,"AQYEDwEMBwABBgQPAQwBAAEBAQ4EDwEDBgABCwQPAQYCAAEIBA8BCQUAAQIFDwEBAgABAgQPAQ4BAQQAAQcEDwEKBAABCgQPAQcEAAEMBA8BBAQAAQMEDwENAwABAgQPAQ0GAAEMBA8BBAIAAQcEDwEHBgABBQQPAQoCAAEMBA8BAQcAAQ0EDwEBAQMEDwEKCAABBwQPAQcBCAQPAQQIAAEBAQ4DDwINAw8BDQoAAQkIDwEHCgABAggPAQILAAELBg8BCwwAAQQGDwEFDQABDAQPAQ0OAAEHBA8BCA4AAQoEDwECDAABAQEHBA8BCgsABw8BDgECCwAGDwEOAQQMAAMPAQ4BDAEIAQIKAA=="],"ф":[30,0,5,30,29,"DAABCwQPAQgYAAELBA8BCBgAAQsEDwEIGAABCwQPAQgYAAELBA8BCBgAAQsEDwEIGAABCwQPAQgRAAEEAQoBDQEPAQwBBAEAAQsEDwEIAQABBgENAQ4BDQEJAQIJAAEJBg8BBAELBA8CCAYPAQYHAAEJBw8BDQEMBA8BCwgPAQUFAAEEBQ8BCgIBAQcFDwEOAQUBAQECAQwEDwEOAQEEAAELBA8BDAQAAQsEDwEIAwABAgUPAQcDAAEBBQ8BBgQAAQsEDwEIBAABCgQPAQwDAAEDBQ8BAwQAAQsEDwEIBAABBgUPAwABBQUPAQIEAAELBA8BCAQAAQUFDwEBAgABBQUPAQEEAAELBA8BCAQAAQUFDwEBAgABAwUPAQMEAAELBA8BCAQAAQYFDwMAAQEFDwEGBAABCwQPAQgEAAEKBA8BDAQAAQsEDwEMBAABCwQPAQgDAAECBQ8BBwQAAQQFDwEKAgEBBwUPAQ4BBQEBAQIBDAQPAQ4BAQUAAQkHDwEOAQwEDwELCA8BBQcAAQkGDwEEAQsEDwIIBg8BBgkAAQQBCgENAQ8BDAEEAQABCwQPAQgBAAEGAQ0BDwENAQkBAhEAAQsEDwEIGAABCwQPAQgYAAELBA8BCBgAAQsEDwEIGAABCwQPAQgYAAELBA8BCAwA"],"х":[19,0,12,19,16,"AQEBDAQPAQoFAAEEBQ8BBAEAAQIBDgQPAQUDAAEBAQ4EDwEHAwABBQQPAQ4BAgIAAQsEDwELBQABCQQPAQsBAAEHBA8BDQEBBgABDAQPAQkFDwEDBwABAgEOCA8BBgkAAQUHDwEKCwABCQUPAQ0BAQsAAQwGDwEECgABCQcPAQ0BAQgAAQYJDwELBwABAwEOBA8BBQENBA8BBwUAAQEBDQQPAQgBAAEDBQ8BBAQAAQoEDwEMAwABBwQPAQ4BAQIAAQYEDwEOAQIEAAELBA8BCwEAAQMFDwEFBQABAgEOBA8BCA=="],"ц":[22,0,12,22,20,"AgABBwQPAQwFAAUPAQMFAAEHBA8BDAUABQ8BAwUAAQcEDwEMBQAFDwEDBQABBwQPAQwFAAUPAQMFAAEHBA8BDAUABQ8BAwUAAQcEDwEMBQAFDwEDBQABBwQPAQwFAAUPAQMFAAEHBA8BDAUABQ8BAwUAAQcEDwEMBQAFDwEDBQABBwQPAQwFAAUPAQMFAAEHBA8BDAUABQ8BAwUAAQcEDwEMBQAFDwEDBQABBwQPAQwFAAUPAQMFAAEHEQ8BDgMAAQcRDwEOAwABBxEPAQ4SAAEMAg8BDhIAAQwCDwEOEgABDAIPAQ4SAAEMAg8BDgEA"],"ч":[21,0,12,21,16,"AQABAQUPAQMDAAEBBQ8BAwQAAQEFDwEDAwABAQUPAQMEAAEBBQ8BAwMAAQEFDwEDBAABAQUPAQMDAAEBBQ8BAwQAAQEFDwEFAwABAQUPAQMFAAEOBA8BCwECAgABAQUPAQMFAAEKDg8BAwUAAQMBDg0PAQMGAAECAQoBDgsPAQMOAAEBBQ8BAw4AAQEFDwEDDgABAQUPAQMOAAEBBQ8BAw4AAQEFDwEDDgABAQUPAQMOAAEBBQ8BAwMA"],"ш":[32,0,12,32,16,"AgABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBwQPAQwFAAEMBA8BBwQAAQEFDwECBAABBxoPAQIEAAEHGg8BAgQAAQcaDwECAgA="],"щ":[33,0,12,33,20,"AgABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBwQPAQwFAAEMBA8BBwQAAQEFDwECBQABBxwPAQ0DAAEHHA8BDQMAAQccDwENHQABDQIPAQ0dAAENAg8BDR0AAQ0CDwENHQABDQIPAQ0BAA=="],"ъ":[23,0,11,23,17,"AQIKBgEDCwABBgoPAQcLAAEGCg8BBwsAAQUFDAEOBA8BBxEAAQwEDwEHEQABDAQPAQcRAAEMBA8BCAMDAQINAAEMCg8BDAEHAQEJAAEMDA8BDQECCAABDA0PAQwIAAEMBA8BBwIBAQIBBQUPAQIHAAEMBA8BBwQAAQoEDwEFBwABDAQPAQcEAAELBA8BBAcAAQwEDwEJAgQBBQEJBQ8BAgcAAQwNDwELCAABDAwPAQwBAQgAAQwIDwEOAQ0BCgEFBAA="],"ы":[27,0,12,27,16,"AgABBwQPAQwLAAEIBA8BCwQAAQcEDwEMCwABCAQPAQsEAAEHBA8BDAsAAQgEDwELBAABBwQPAQwLAAEIBA8BCwQAAQcEDwEMCwABCAQPAQsEAAEHBA8BDAsAAQgEDwELBAABBwgPAQ4BDQELAQcBAQMAAQgEDwELBAABBwwPAQ4BBAIAAQgEDwELBAABBw0PAQ4BAQEAAQgEDwELBAABBwQPAQwDAAEDAQwEDwEHAQABCAQPAQsEAAEHBA8BDAQAAQUEDwEJAQABCAQPAQsEAAEHBA8BDAQAAQUEDwEJAQABCAQPAQsEAAEHBA8BDAMAAQMBDQQPAQcBAAEIBA8BCwQAAQcNDwEOAQIBAAEIBA8BCwQAAQcMDwEOAQQCAAEIBA8BCwQAAQcJDwENAQsBBwEBAwABCAQPAQsCAA=="],"ь":[19,0,12,19,16,"AgABBwQPAQwNAAEHBA8BDA0AAQcEDwEMDQABBwQPAQwNAAEHBA8BDA0AAQcEDwEMDQABBwgPAQ4BDQELAQcBAQUAAQcMDwEOAQQEAAEHDQ8BDgEBAwABBwQPAQwDAAEDAQwEDwEHAwABBwQPAQwEAAEFBA8BCQMAAQcEDwEMBAABBQQPAQkDAAEHBA8BDAMAAQMBDQQPAQcDAAEHDQ8BDgECAwABBwwPAQ4BBAQAAQcJDwENAQsBBwEBAwA="],"э":[18,0,11,18,18,"AgABAQEEAQgBCgILAQoBCQEFAQEIAAkPAQ4BCAEBBgALDwEMAQIFAAwPAQwBAQQAAQ8BCQEDAgABAQEFAQ0FDwEHBAABAgYAAQIBDgQPAQ4MAAEGBQ8BAwQAAQEGCwEMBQ8BBgQAAQEMDwEHBAABAQwPAQcFAAYEAQYFDwEFCwABCQUPAQIDAAEHBgABBgUPAQwEAAEPAQ0BCAEGAQUBBwELBg8BBAQADA8BCAUACw8BCAYAAQoBDgYPAQ4BCgEDCQABAwEEAgYBBQEDCAA="],"ю":[29,0,12,29,16,"AgABBwQPAQwGAAEEAQkBDAEOAQ8BDgENAQsBBwEBBwABBwQPAQwEAAECAQwKDwEIBgABBwQPAQwDAAEDAQ4MDwELBQABBwQPAQwCAAEBAQ0EDwENAQQCAQEHBQ8BCQQAAQcEDwEMAgABCAQPAQ4BAgQAAQcFDwECAwABBwQPAQwCAAENBA8BCQYAAQ4EDwEHAwABBwQPAQwBAwEHBQ8BBgYAAQsEDwEKAwABBwwPAQQGAAEKBA8BDAMAAQcMDwEEBgABCgQPAQwDAAEHBA8BDQIHBQ8BBgYAAQsEDwEKAwABBwQPAQwCAAENBA8BCQYAAQ4EDwEHAwABBwQPAQwCAAEHBA8BDgECBAABBgUPAQIDAAEHBA8BDAIAAQEBDQQPAQ0BBAEAAQEBBgUPAQkEAAEHBA8BDAMAAQMBDgwPAQsFAAEHBA8BDAQAAQMBDAoPAQgGAAEHBA8BDAYAAQQBCQEMAQ4BDwEOAQ0BCwEHAQEFAA=="],"я":[19,0,12,19,16,"BAABBAEKAQwBDggPAQwFAAEKDA8BDAQAAQcNDwEMBAABCwQPAQsBAgIAAQcEDwEMBAABDQQPAQQDAAEHBA8BDAQAAQsEDwEEAwABBwQPAQwEAAEFBA8BCwECAgABBwQPAQwFAAEKDA8BDAYAAQoLDwEMBgABAQEOCg8BDAYAAQkEDwEGAQABBwQPAQwFAAEEBA8BDAIAAQcEDwEMBQABDQQPAQMCAAEHBA8BDAQAAQgEDwEIAwABBwQPAQwDAAECBA8BDQEBAwABBwQPAQwDAAELBA8BBQQAAQcEDwEMAgA="],"Ё":[20,0,0,21,28,"BQABCAIPAQ0CAAEMAg8BCgsAAQgCDwENAgABDAIPAQoLAAEIAg8BDQIAAQwCDwEKCwABCAIPAQ0CAAEMAg8BCjIAAQQPDwUAAQQPDwUAAQQPDwUAAQQPDwUAAQQFDwEGDgABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDgABBAUPAQYOAAEEDg8BBgUAAQQODwEGBQABBA4PAQYFAAEEDg8BBgUAAQQFDwEGDgABBAUPAQYOAAEEBQ8BBg4AAQQFDwEGDgABBAUPAQYOAAEEDw8BBAQAAQQPDwEEBAABBA8PAQQEAAEEDw8BBAIA"],"ё":[20,0,5,20,23,"BQABAwMPAQMBAAEHAw8KAAEDAw8BAwEAAQcDDwoAAQMDDwEDAQABBwMPCgABAwMPAQMBAAEHAw9GAAEBAQYBCgENAQ4BDwEOAQwBCAECCQABBgEOCQ8BCAcAAQkMDwEKBQABBwUPAQgBAgEAAQQBDQQPAQcDAAEBAQ4EDwEJBAABAwQPAQ4BAQIAAQUFDwEBBQABCwQPAQYCAAEJBA8BDAYAAQkEDwEKAgABChAPAQwCAAEKEA8BDQIAAQkQDwENAgABBQQPAQwOAAEBAQ4EDwEECAABAwEKAQIDAAEHBA8BDgEIAQMBAQEAAQEBBAEHAQ0CDwECBAABCQ4PAQIFAAEGAQ4MDwECBgABAQEGAQoBDQEOAQ8BDgENAQwBCwEIAQUBAgIA"],"·":[11,0,15,11,13,"AwABDgQPAQUFAAEOBA8BBQUAAQ4EDwEFBQABDgQPAQUFAAEOBA8BBQUAAQ4EDwEFTwA="],"×":[25,0,10,25,18,"BQABBAEKCwABCAEGCQABBAIPAQoJAAEIAg8BBgcAAQEBDgMPAQoHAAEIBA8BAgcAAQUEDwEJBQABCAQPAQYJAAEFBA8BCQMAAQcEDwEHCwABBQQPAQkBAAEHBA8BBw0AAQUEDwELBA8BBw8AAQYHDwEIEQABBgUPAQgSAAEGBQ8BCBEAAQUHDwEHDwABBQQPAQwEDwEHDQABBQQPAQkBAAEHBA8BBwsAAQUEDwEJAwABCAQPAQcJAAEFBA8BCgUAAQgEDwEGBwABAQEOAw8BCgcAAQgEDwECBwABBAIPAQoJAAEIAg8BBgkAAQQBCgsAAQgBBgUA"],"—":[30,0,17,30,11,"AQABBhoPAQYCAAEGGg8BBgIAAQYaDwEGAgABBhoPAQbTAA=="],"–":[15,0,17,15,11,"AQABBgsPAQYCAAEGCw8BBgIAAQYLDwEGAgABBgsPAQZqAA=="],"№":[36,0,6,36,22,"AgABAwYNAQQJAAEFAQkBCwEMAQ0BAQ0AAQQGDwEMBwABAQENBQ8BAQ0AAQQHDwEFBgABCAYPAQENAAEEBw8BDAYAAQ0EDwENAQYOAAEECA8BBQUAAQ4EDwEGDwABBAgPAQ0FAAUPAQUPAAEECQ8BBgQABQ8BBQQAAQEBBwIJAQYBAQUAAQQFDwELAw8BDgEBAwAFDwEFAwABAwEOBA8BDQECBAABBAUPAQMEDwEHAwAFDwEFAgABAQEOAg8BCgELAg8BDQQAAQQFDwEBAQkDDwEOAQECAAUPAQUCAAEGAg8BCgIAAQsCDwEEAwABBAUPAgEBDgMPAQgCAAUPAQUCAAEJAg8BBQIAAQYCDwEIAwABBAUPAQEBAAEIBA8BAgEABQ8BBQIAAQsCDwEDAgABBQIPAQkDAAEEBQ8BAQEAAQEBDgMPAQkBAAUPAQUCAAEKAg8BBAIAAQYCDwEJAwABBAUPAQECAAEHBA8BAgUPAQUCAAEHAg8BBwIAAQkCDwEGAwABBAUPAQEDAAENAw8BCgUPAQUCAAECAg8BDgEEAQUBDgIPAQEDAAEEBQ8BAQMAAQYJDwEFAwABCAYPAQYEAAEEBQ8BAQQAAQ0IDwEFBAABBgEMAg8BDAEFBQABBAUPAQEEAAEFCA8BBQ4AAQQBCwQPAQ4GAAEMBw8BBQ4ABg8BCwYAAQQHDwEFAgABCggOAQkCAAUPAQ4BAwcAAQsGDwEFAgABCwgPAQkCAAEPAQ4BDQELAQgBAggAAQMGDwEFAgABCwgPAQkBAA=="],"…":[30,0,22,30,6,"AgABCQQPAQoEAAEKBA8BCgQAAQoEDwEJBAABCQQPAQoEAAEKBA8BCgQAAQoEDwEJBAABCQQPAQoEAAEKBA8BCgQAAQoEDwEJBAABCQQPAQoEAAEKBA8BCgQAAQoEDwEJBAABCQQPAQoEAAEKBA8BCgQAAQoEDwEJBAABCQQPAQoEAAEKBA8BCgQAAQoEDwEJAgA="]},"title":{" ":[13,0,35,13,0,""],"!":[17,0,8,17,27,"BQABDAUPAQoKAAEMBQ8BCgoAAQwFDwEKCgABDAUPAQoKAAEMBQ8BCgoAAQwFDwEKCgABDAUPAQoKAAEMBQ8BCgoAAQwFDwEKCgABDAUPAQoKAAEMBQ8BCgoAAQoFDwEICgABCAUPAQYKAAEHBQ8BBQoAAQUFDwEDCgABAwUPAQEKAAEBBA8BDgwAAQ4DDwEMPgABDAUPAQoKAAEMBQ8BCgoAAQwFDwEKCgABDAUPAQoKAAEMBQ8BCgoAAQwFDwEKBQA="],"\"":[19,0,8,19,27,"AwABBwMPAQwDAAEIAw8BCwYAAQcDDwEMAwABCAMPAQsGAAEHAw8BDAMAAQgDDwELBgABBwMPAQwDAAEIAw8BCwYAAQcDDwEMAwABCAMPAQsGAAEHAw8BDAMAAQgDDwELBgABBwMPAQwDAAEIAw8BCwYAAQcDDwEMAwABCAMPAQsGAAEHAw8BDAMAAQgDDwELBgABBwMPAQwDAAEIAw8BC/8ARwA="],"#":[31,0,8,31,27,"DAABCgMPAQUEAAENAw8BAhEAAQ4DDwEBAwABAgMPAQ0RAAEDAw8BDQQAAQYDDwEJEQABBgMPAQkEAAEJAw8BBREAAQoDDwEFBAABDQMPAQIRAAEOAw8BAQMAAQIDDwENEQABAwMPAQ0EAAEGAw8BCQsAAQYXDwEHBgABBhcPAQcGAAEGFw8BBwYAAQYXDwEHCwABBgMPAQkEAAEJAw8BBhEAAQoDDwEFBAABDQMPAQIRAAEOAw8BAgMAAQIDDwEOEQABAwMPAQ0EAAEGAw8BChEAAQcDDwEJBAABCgMPAQYLAAEHFw8BBgYAAQcXDwEGBgABBxcPAQYGAAEHFw8BBgsAAQkDDwEHBAABDAMPAQMRAAEMAw8BAwMAAQEDDwEOEQABAQMPAQ4EAAEEAw8BCxEAAQUDDwELBAABCAMPAQcRAAEJAw8BBwQAAQwDDwEDEQABDAMPAQMDAAEBAw8BDhEAAQEDDwEOBAABBAMPAQsMAA=="],"$":[26,0,7,26,33,"CwABCQIPAQUWAAEJAg8BBRYAAQkCDwEFFgABCQIPAQUSAAEDAQgBCwENAQ4DDwENAQwBCgEIAQYBAwoAAQMBDA4PAQkIAAEFEA8BCQcAAQIRDwEJBwABCQUPAQsBBAEJAg8BBgECAQQBCAEMAg8BCQcAAQ4EDwENAQEBAAEIAg8BBQQAAQICCAYAAQEFDwEKAgABCAIPAQUNAAEBBQ8BDQIAAQgCDwEFDgAGDwEJAQIBCAIPAQUOAAEMCg8BCQEDAQEMAAEGDQ8BDAEHAQIKAAELDw8BCAkAAQEBCQ8PAQsKAAEDAQkBDg0PAQcMAAEDAQYBDAoPAQ0OAAEIAg8BBwEFAQsGDwECDQABCAIPAQUCAAEMBQ8BAw0AAQgCDwEFAgABCAUPAQMEAAEBAQsBBQYAAQgCDwEFAgABCgUPAQEEAAEBAg8BDgEKAQYBBAEBAQABCAIPAQYBAgEIBQ8BDAUAAQETDwEEBQABARIPAQgGAAEBEA8BDQEFCAABAgEEAQcBCQELAQwBDQEOBA8BDQELAQgBBBIAAQkCDwEFFgABCQIPAQUWAAEJAg8BBRYAAQkCDwEFFgABCAIPAQULAA=="],"%":[37,0,8,37,27,"BAABAQEIAQwBDgEPAQ4BCwEGAQELAAEFAw8BCgsAAQUBDgcPAQ0BAwkAAQEBDgIPAQ4BAgoAAQQKDwEOAQIIAAEJAw8BBgsAAQ0DDwENAQMBAAEFAQ4DDwELBwABAwMPAQwLAAEFBA8BBAMAAQcEDwECBgABDAMPAQMLAAEJAw8BDgQAAQIEDwEGBQABBwMPAQgMAAELAw8BDAUABA8BCAQAAQIBDgIPAQ0BAQwAAQwDDwELBQABDgMPAQkEAAELAw8BBA0AAQsDDwEMBQAEDwEIAwABBQMPAQoOAAEJAw8BDgQAAQIEDwEGAgABAQEOAg8BDgECDgABBQQPAQQDAAEHBA8BAgIAAQkDDwEGEAABDQMPAQ0BAwEAAQUBDgMPAQsCAAEDAw8BDBEAAQQKDwEOAQICAAEMAw8BAwMAAQYBCwEOAQ8BDgEMAQgBAgcAAQUBDgcPAQ0BAwIAAQcDDwEIAgABAwENCA8BBgcAAQEBCAEMAQ4BDwEOAQsBBgEBAgABAgEOAg8BDQEBAQABAgEOCg8BBREAAQsDDwEEAgABCgQPAQUBAQEDAQ0DDwEOAQEPAAEFAw8BCgIAAQIEDwEJAwABBAQPAQYOAAEBAQ4CDwEOAQICAAEGBA8BAwQAAQ0DDwEKDgABCQMPAQYDAAEIBA8BAQQAAQsDDwEMDQABAwMPAQwEAAEIBA8FAAEKAw8BDQ0AAQwDDwEDBAABCAQPAQEEAAELAw8BDAwAAQcDDwEIBQABBQQPAQMEAAENAw8BCgsAAQIBDgIPAQ0BAQUAAQIEDwEIAwABAwQPAQYLAAELAw8BBAcAAQoEDwEFAQABAwEMAw8BDgEBCgABBQMPAQoIAAECAQ4KDwEFCgABAQENAg8BDgECCQABAgENCA8BBQsAAQkDDwEGDAABBgELAQ4BDwEOAQwBCAECBAA="],"&":[32,0,8,32,27,"CgABBAEJAQwBDgEPAQ4BDQEMAQoBBwEEAQESAAEDAQwLDwEMEQABBA0PAQwQAAEBAQ4NDwEMEAABBwYPAQkBAgEAAQEBAwEHAQ0BDwEMEAABCgUPAQwHAAEFAQkQAAELBQ8BCxkAAQkGDwECGAABBAYPAQsZAAELBg8BCRcAAQEBCwcPAQkVAAEEAQ4JDwEIBgABAwUPAQYGAAEEDA8BCAUAAQUFDwEEBQABAwEOBQ8BDAEOBg8BCAQAAQgFDwEBBQABDAUPAQoBAAEDAQ4GDwEIAwABDQQPAQwFAAEEBQ8BDgEBAgABBAEOBg8BCAEAAQUFDwEHBQABCAUPAQkEAAEEAQ4GDwEIAQ0FDwECBQABCwUPAQcFAAEEAQ4LDwEJBgABCwUPAQkGAAEEAQ4JDwEOAQEGAAEKBQ8BDgEBBgABBAEOCA8BBAcAAQcGDwEMAQEGAAEGBw8BCQgAAQIHDwENAQYBAgEAAQEBAwEIAQ4IDwEECAABChYPAQ4BAgcAAQEBDRYPAQwBAQcAAQIBDA4PAQ4BDQYPAQoJAAEHAQ4KDwEOAQkBAQECAQ4GDwEICQABAQEFAQkBDAEOAQ8CDgEMAQkBBQEBAwABBQcPAQUBAA=="],"'":[11,0,8,11,27,"AwABBwMPAQwGAAEHAw8BDAYAAQcDDwEMBgABBwMPAQwGAAEHAw8BDAYAAQcDDwEMBgABBwMPAQwGAAEHAw8BDAYAAQcDDwEMBgABBwMPAQy+AA=="],"(":[17,0,7,17,33,"CAABCwQPAQoKAAEEBQ8BAwoAAQ0EDwELCgABBgUPAQQKAAENBA8BDAoAAQUFDwEHCgABCwUPAQEJAAECBQ8BCwoAAQcFDwEHCgABDAUPAQMJAAEBBQ8BDgoAAQQFDwEMCgABBwUPAQkKAAEJBQ8BCAoAAQsFDwEGCgABDAUPAQUKAAEMBQ8BBQoAAQwFDwEFCgABCwUPAQYKAAEJBQ8BCAoAAQcFDwEJCgABBAUPAQwKAAEBBQ8BDgsAAQwFDwEDCgABBwUPAQcKAAECBQ8BCwsAAQwFDwEBCgABBQUPAQcLAAENBA8BDAsAAQYFDwEECwABDQQPAQsLAAEFBQ8BAwsAAQsEDwEKAwA="],")":[17,0,7,17,33,"AwABDAQPAQkLAAEEBQ8BAwsAAQwEDwEMCwABBQUPAQQLAAENBA8BDAsAAQgFDwEDCgABAgUPAQoLAAENBQ8BAQoAAQgFDwEGCgABBAUPAQoKAAEBBQ8BDgsAAQ0FDwEDCgABCwUPAQYKAAEJBQ8BCAoAAQcFDwEKCgABBwUPAQoKAAEGBQ8BCwoAAQcFDwEKCgABBwUPAQoKAAEJBQ8BCAoAAQsFDwEGCgABDQUPAQMJAAEBBQ8BDgoAAQQFDwEKCgABCAUPAQYKAAENBQ8BAQkAAQMFDwEKCgABCAUPAQQKAAEOBA8BDAoAAQUFDwEECgABDAQPAQwKAAEEBQ8BAwoAAQwEDwEJCAA="],"*":[19,0,8,19,27,"CAABDQIPAQMPAAENAg8BAw8AAQ0CDwEDCAABAwEMAQQEAAENAg8BAwMAAQIBCQEHAgABCwIPAQsBAwIAAQ0CDwEDAQABAQEIAg8BDgECAQEBDQQPAQoBAgENAg8BBAEHAQ4DDwEOAQUCAAEFAQ0LDwEOAQgBAQUAAQUBDQcPAQ4BCAEBCQABCgUPAQ4BAwkAAQUBDQgPAQgBAQUAAQUBDQcPAQ4DDwEOAQgBAQEAAQEBDQQPAQoBAgENAg8BBAEHAQ4DDwEOAQUBAAELAg8BCwEDAgABDQIPAQMBAAEBAQgBDgEPAQ4BAgEAAQMBDAEEBAABDQIPAQMDAAECAQkBBwkAAQ0CDwEDDwABDQIPAQMPAAENAg8BA8UA"],"+":[31,0,11,31,24,"DQABCgMPAQoaAAEKAw8BChoAAQoDDwEKGgABCgMPAQoaAAEKAw8BChoAAQoDDwEKGgABCgMPAQoaAAEKAw8BChoAAQoDDwEKGgABCgMPAQoQAAEBFw8BAQYAAQEXDwEBBgABARcPAQEGAAEBFw8BARAAAQoDDwEKGgABCgMPAQoaAAEKAw8BChoAAQoDDwEKGgABCgMPAQoaAAEKAw8BChoAAQoDDwEKGgABCgMPAQoaAAEKAw8BChoAAQoDDwEKDQA="],",":[14,0,28,14,12,"AwABAwYPAQQGAAEDBg8BBAYAAQMGDwEEBgABAwYPAQQGAAEDBg8BBAYAAQQGDwEDBgABCAUPAQgHAAEMBA8BDAcAAQEFDwEDBwABBQQPAQgIAAEJAw8BDAkAAQ0DDwEDBwA="],"-":[15,0,21,15,14,"AgALDwEFAwALDwEFAwALDwEFAwALDwEFAwALDwEFiAA="],".":[14,0,28,14,7,"AwABAwYPAQQGAAEDBg8BBAYAAQMGDwEEBgABAwYPAQQGAAEDBg8BBAYAAQMGDwEEBgABAwYPAQQDAA=="],"/":[14,0,8,14,30,"CQABCgMPAQUJAAEOAw8BAQgAAQQDDwELCQABCQMPAQYJAAEOAw8BAQgAAQQDDwEMCQABCAMPAQcJAAENAw8BAggAAQMDDwEMCQABCAMPAQgJAAEMAw8BAwgAAQIDDwENCQABBwMPAQgJAAEMAw8BAwgAAQEDDwEOCQABBgMPAQkJAAELAw8BBAgAAQEDDwEOCQABBQMPAQoJAAEKAw8BBQgAAQEBDgMPAQEIAAEFAw8BCgkAAQkDDwEGCQABDgMPAQEIAAEEAw8BCwkAAQkDDwEGCQABDQMPAQIIAAEDAw8BDAkAAQgDDwEHCQABDQMPAQIJAA=="],"0":[26,0,8,26,27,"CAABAwEIAQwBDQEPAQ4BDQELAQcBAg4AAQMBCwoPAQkBAQsAAQUNDwENAQIJAAEEDw8BDQECBwABAQEOEA8BCwcAAQkGDwEMAQQCAQEFAQ4GDwEFBQABAQEOBQ8BDQEBBAABAwYPAQsFAAEGBg8BBwYAAQsGDwECBAABCgYPAQIGAAEGBg8BBgQAAQ0FDwEOBwABBAYPAQkDAAEBBg8BDQcAAQIGDwEMAwABAgYPAQwHAAEBBg8BDQMAAQMGDwELCAAGDwEOAwABAwYPAQsIAAYPAQ4DAAEDBg8BCwgABg8BDgMAAQIGDwEMBwABAQYPAQ0DAAEBBg8BDQcAAQIGDwEMBAABDQYPBwABBAYPAQkEAAEKBg8BAgYAAQcGDwEGBAABBgYPAQcGAAELBg8BAgQAAQEBDgUPAQ0BAQQAAQQGDwELBgABCQYPAQwBBAIBAQYBDgYPAQUGAAEBAQ4QDwELCAABBA8PAQ4BAgkAAQUNDwENAQILAAEDAQsKDwEJAQEOAAEDAQgBDAENAQ8BDgENAQsBBwECCAA="],"1":[26,0,8,26,27,"BAABAQEDAQYBCAEKAQ0HDwEBDAABDAwPAQEMAAEMDA8BAQwAAQwMDwEBDAABDAwPAQEMAAIMAQoBBwEFAQIBCAYPAQESAAEIBg8BARIAAQgGDwEBEgABCAYPAQESAAEIBg8BARIAAQgGDwEBEgABCAYPAQESAAEIBg8BARIAAQgGDwEBEgABCAYPAQESAAEIBg8BARIAAQgGDwEBEgABCAYPAQESAAEIBg8BARIAAQgGDwEBEgABCAYPAQESAAEIBg8BAQwAAQoSDwEDBgABChIPAQMGAAEKEg8BAwYAAQoSDwEDBgABChIPAQMCAA=="],"2":[26,0,8,26,27,"BgABAwEHAQkBDAIOAQ8BDgENAQoBBgEBCwABAwEIAQ4MDwEJAQEJABAPAQ0BAggAEQ8BDQEBBwASDwEIBwAEDwEKAQUBAgEAAQEBBAELBw8BDgcAAQ8BDgEIAQEHAAEJBw8BAwYAAQoBAgkAAQEBDgYPAQQSAAELBg8BBRIAAQoGDwEDEgABDQUPAQ4SAAEFBg8BCBEAAQEBDgUPAQ0BARAAAQEBDQUPAQ4BAxAAAQMBDQYPAQUQAAEFAQ4GDwEFEAABBwYPAQ4BBBAAAQoGDwENAQMPAAEBAQwGDwEMAQEPAAEDAQ0GDwEKEAABBQEOBg8BBxAAAQcGDwEOAQUQAAEBEw8BCAUAAQETDwEIBQABARMPAQgFAAEBEw8BCAUAAQETDwEIAwA="],"3":[26,0,8,26,27,"BgABAgEGAQoBDAEOAQ8CDgENAQoBCAEDDAABBgEMDA8BDAEECQABBhAPAQcIAAEGEQ8BBAcAAQYRDwELBwABBgIPAQsBBgEDAQEBAAEBAQMBCAgPBwABBQEIAQEIAAEEBw8BAhIAAQ0GDwECEgABDQUPAQ4SAAEEBg8BCQ8AAQEBBAEIBg8BDgECCwABDgsPAQ0BAwwAAQ4JDwEMAQUOAAEOCg8BDAEFDQABDgwPAQoBAQsAAQ4NDwEKDwABAQEDAQcBDQcPAQMSAAELBg8BCRIAAQQGDwELEgABBAYPAQsFAAEHAQgBAgoAAQsGDwEKBQABCAIPAQwBBwEEAQIBAQEAAQEBAwEHAQ0HDwEHBQABCBIPAQ4BAQUAAQgSDwEGBgABCBEPAQYHAAEBAQcBDQ0PAQoBAgsAAQMBBwEKAQ0BDgIPAQ4BDQELAQkBBQEBCAA="],"4":[26,0,8,26,27,"DAABDQcPAQMQAAEICA8BAw8AAQMJDwEDDgABAQENCQ8BAw4AAQgKDwEDDQABBAsPAQMMAAEBAQ0DDwEOAQgGDwEDDAABCQQPAgYGDwEDCwABBAQPAQsBAAEGBg8BAwoAAQEBDQMPAQ4BAgEAAQYGDwEDCgABCQQPAQYCAAEGBg8BAwkAAQQEDwELAwABBgYPAQMIAAEBAQ0DDwEOAQIDAAEGBg8BAwgAAQkEDwEFBAABBgYPAQMHAAEFBA8BCgUAAQYGDwEDBgABAQEOAw8BDgEBBQABBgYPAQMGAAEFBA8BBQYAAQYGDwEDBgABBRYPAQECAAEFFg8BAQIAAQUWDwEBAgABBRYPAQECAAEFFg8BAQ4AAQYGDwEDEgABBgYPAQMSAAEGBg8BAxIAAQYGDwEDEgABBgYPAQMFAA=="],"5":[26,0,8,26,27,"AwABAREPAQMHAAEBEQ8BAwcAAQERDwEDBwABAREPAQMHAAEBEQ8BAwcAAQEFDwEHEwABAQUPAQcTAAEBBQ8BBxMAAQEFDwEMAQsBDgEPAQ4BDQELAQgBAwsAAQEODwELAQMJAAEBEA8BBQgAAQERDwEEBwABAREPAQ0BAQYAAQECDwENAQgBBAECAQABAQEDAQcBDgcPAQYGAAEBAQsBBAgAAQIBDQYPAQsSAAEEBw8TAAEOBg8BARIAAQwGDwECEgABDgYPAQEEAAECAQkBAQoAAQQGDwEOBQABAgEPAQ4BBwEBBwABAgENBg8BCwUAAQIDDwEOAQkBBQECAQABAQEDAQcBDgcPAQUFAAECEg8BDAYAAQIRDwEOAQIHAAEGAQ4ODwENAQMJAAEBAQcBDgoPAQ4BCAEBDQABBAEIAQwBDQIPAQ4BDAEJAQYBAQgA"],"6":[26,0,8,26,27,"CQABAQEFAQkBDAENAg4BDQELAQcBAg4AAQcBDgoPAQsBBAoAAQIBDQ4PCQABAwEODw8IAAEBAQ0QDwgAAQoHDwEJAQQBAQEAAQEBAwEHAQwCDwcAAQMGDwENAQIIAAEDAQsHAAEJBg8BAhIAAQ4FDwEIEgABAwYPAQMBAQEHAQsBDgEPAQ4BDAEJAQQJAAEGBg8BBwEOCA8BDAEDBwABCBIPAQUGAAEJEg8BDgEDBQABChMPAQwFAAEKBw8BDgEHAQIBAQEDAQkHDwEDBAABCQcPAQUFAAEJBg8BCAQAAQgGDwEOBgABAgYPAQoEAAEGBg8BDAcABg8BCwQAAQMGDwEMBwAGDwEKBQABDgUPAQ4GAAECBg8BCQUAAQgGDwEGBQABCQYPAQUFAAECBg8BDgEHAQIBAQEDAQkGDwEOAQEGAAEIEQ8BBwgAAQwPDwELCQABAQEMDQ8BCwEBCgABAQEHAQ4JDwEOAQcOAAEBAQYBCgENAQ4BDwEOAQwBCQEFCAA="],"7":[26,0,8,26,27,"AgABCBMPAQwFAAEIEw8BDAUAAQgTDwEMBQABCBMPAQwFAAEIEw8BCBIAAQsGDwECEQABAwYPAQkSAAEKBg8BAxEAAQIGDwELEgABCQYPAQQRAAEBAQ4FDwEMEgABBwYPAQUSAAEOBQ8BDRIAAQYGDwEGEgABDAUPAQ4BAREAAQQGDwEIEgABCwYPAQERAAEDBg8BCRIAAQoGDwECEQABAgYPAQoSAAEIBg8BBBEAAQEBDgUPAQwSAAEHBg8BBRIAAQ0FDwENEgABBQYPAQYSAAEMBQ8BDgEBEQABBAYPAQgNAA=="],"8":[26,0,8,26,27,"BwABBAEIAQsBDQEOAg8BDgENAQoBBwEDDAABBQENDA8BCwEDCQABCA8PAQ4BBAcAAQURDwEOAQIGAAEMEg8BCAYABw8BCQEDAgEBBAEMBg8BCwUAAQIGDwELBQABAQEOBQ8BDQUAAQEGDwEHBgABDAUPAQwGAAENBQ8BCwUAAQEBDgUPAQgGAAEGBg8BCQEDAgEBBAEMBQ8BDgECBwABCRAPAQUJAAEFAQ0MDwELAQMLAAEDAQwKDwEJAQEKAAECAQoNDwEOAQgIAAECAQ0QDwELBwABDAYPAQkBAwIBAQQBCwYPAQgFAAEEBg8BBgYAAQoFDwEOAQEEAAEJBQ8BDgcAAQQGDwEEBAABCwUPAQ0HAAECBg8BBgQAAQoFDwEOBwABBAYPAQYEAAEJBg8BBgYAAQoGDwEFBAABBgcPAQgBAwIBAQQBCwcPAQEEAAEBAQ4SDwELBgABBxIPAQMHAAEIEA8BBQkAAQUBDQwPAQsBAwwAAQQBCAELAQ0BDgIPAQ4BDQEKAQcBAgcA"],"9":[26,0,8,26,27,"BwABAgEHAQoBDQEOAQ8BDQEMAQkBBA4AAQEBCgoPAQ0BBAsAAQMBDQ0PAQcJAAECAQ4PDwEHCAABDBEPAQMGAAEFBg8BDgEFAQEBAAECAQkGDwEMBgABCgYPAQQFAAELBg8BAwUAAQ0FDwENBgABBAYPAQkFAAYPAQoGAAECBg8BDQQAAQEGDwEKBgABAgcPAQEEAAYPAQ0GAAEEBw8BAwQAAQ0GDwEEBQABCgcPAQQEAAEIBg8BDgEGAQIBAQEDAQoIDwEFBAABAhQPAQUFAAEIEw8BBAYAAQoSDwEDBwABBgEOCA8BDAEIBg8BAQgAAQEBBgEKAQ0BDgEPAQ0BCgEFAQABCAUPAQ0TAAENBQ8BCRIAAQcGDwEEBgABBAEJAQEIAAEGBg8BDAcAAQQCDwEKAQUBAgEAAQEBAgEFAQsHDwEFBwABBBAPAQkIAAEEDw8BCwEBCAABBA4PAQkLAAEGAQ0KDwEMAQQOAAEEAQkBDAEOAQ8BDgENAQsBBwEDCgA="],":":[15,0,15,15,20,"BAABDQUPAQoIAAENBQ8BCggAAQ0FDwEKCAABDQUPAQoIAAENBQ8BCggAAQ0FDwEKCAABDQUPAQpiAAENBQ8BCggAAQ0FDwEKCAABDQUPAQoIAAENBQ8BCggAAQ0FDwEKCAABDQUPAQoIAAENBQ8BCgQA"],";":[15,0,15,15,25,"BAABDQUPAQoIAAENBQ8BCggAAQ0FDwEKCAABDQUPAQoIAAENBQ8BCggAAQ0FDwEKCAABDQUPAQpiAAENBQ8BCggAAQ0FDwEKCAABDQUPAQoIAAENBQ8BCggAAQ0FDwEKCAABDgUPAQgHAAECBQ8BDQEBBwABBwUPAQMIAAELBA8BCAkAAQ4DDwENCQABBAQPAQMJAAEIAw8BCAgA"],"<":[31,0,13,31,22,"GAABAQEGAQwBARgAAQEBBQELAw8BARYAAQQBCQEOBQ8BARMAAQMBCAENCA8BARAAAQEBBwEMCg8BCwEBDQABAQEFAQsKDwELAQYBAQ0AAQQBCgEOCQ8BDAEHAQINAAEDAQgBDgkPAQwBBwECDgABAQENCQ8BDQEIAQIRAAEBBw8BDQEIAQMUAAEBBQ8BDgEGFwABAQcPAQ0BCAEDFAABAQENCQ8BDAEHAQITAAEDAQgBDgkPAQwBBwECEwABBAEKAQ4JDwEMAQYBARIAAQEBBgELCg8BCwEGAQESAAECAQcBDAoPAQsBARMAAQMBCAENCA8BARYAAQQBCQEOBQ8BARgAAQEBBQELAw8BARsAAQEBBgEMAQEiAA=="],"=":[31,0,17,31,18,"AwABARcPAQEGAAEBFw8BAQYAAQEXDwEBBgABARcPAQGCAAEBFw8BAQYAAQEXDwEBBgABARcPAQEGAAEBFw8BAb0A"],">":[31,0,13,31,22,"AwABAQEMAQYBARsAAQEDDwELAQUBARgAAQEFDwEOAQkBBBYAAQEIDwENAQgBAxMAAQEBCwoPAQwBBwEBEgABAQEGAQsKDwELAQUBARIAAQIBBwEMCQ8BDgEKAQQTAAECAQcBDAkPAQ4BCAEDEwABAgEIAQ0JDwENAQEUAAEDAQgBDQcPAQEXAAEGAQ4FDwEBFAABAgEIAQ0HDwEBEQABAgEHAQwJDwENAQEOAAECAQcBDAkPAQ4BCAEDDQABAQEGAQwJDwEOAQoBBA0AAQEBBgELCg8BCwEGAQENAAEBAQsKDwEMAQcBAhAAAQEIDwENAQgBAxMAAQEFDwEOAQkBBBYAAQEDDwELAQUBARgAAQEBDAEGAQE3AA=="],"?":[21,0,8,21,27,"AwABAwEGAQkBCwEMAQ0BDgEPAQ4BDAEJAQUBAQcAAQcMDwEOAQYGAAEHDg8BBwUAAQcPDwEDBAABBw8PAQoEAAEHAg8BCwEGAQMCAQEDAQkGDwEOBAABBgEIAQEHAAELBg8OAAEIBg8OAAELBQ8BDQ0AAQUGDwEIDAABBQYPAQ4BAgsAAQYHDwEFCwABBwcPAQYLAAEGBw8BBQsAAQIBDgYPAQQMAAEHBg8BBg0AAQoFDwEODgABCwUPAQxNAAELBQ8BDA4AAQsFDwEMDgABCwUPAQwOAAELBQ8BDA4AAQsFDwEMDgABCwUPAQwIAA=="],"@":[37,0,8,37,32,"DQABAgEHAQoBDAEOAQ8CDgEMAQkBBgECFwABBAEMDA8BCwEEEwABAwEMEA8BCwECEAABBgUPAQsBBwEEAQIBAQEAAQEBBAEHAQwEDwEOAQUOAAEJBA8BCQECCgABAwELBA8BBgwAAQkDDwENAQMOAAEFAQ4DDwEECgABBwMPAQwBARAAAQMBDgIPAQ4BAQgAAQIDDwENAQESAAEEAw8BCggAAQsDDwECBQABAgEJAQ0CDgEMAQYBAAEJAw8BAwIAAQkDDwECBgABAwMPAQcFAAEGBw8BCwEJAw8BAwIAAQEBDgIPAQkGAAEJAg8BDgEBBAABBQkPAQ4DDwEDAwABCQIPAQ0GAAEOAg8BCQQAAQEBDgMPAQsBAwEAAQMBCwUPAQMDAAEFAw8BAgQAAQMDDwEEBAABCAMPAQ0BAQQAAQ0EDwEDAwABAgMPAQQEAAEFAw8BAQQAAQwDDwEHBQABBgQPAQMDAAEBAw8BBQQAAQcCDwEOBQAEDwEDBQABAgQPAQMEAAMPAQUEAAEIAg8BDQQAAQEEDwEBBgAEDwEDAwABAgMPAQQEAAEIAg8BDQQAAQEEDwEBBgAEDwEDAwABBAMPAQIEAAEHAg8BDgUABA8BAwUAAQIEDwEDAwABCQIPAQ0FAAEGAw8BAQQAAQwDDwEHBQABBgQPAQMCAAECAw8BBwUAAQMDDwEFBAABCAMPAQ0BAQQAAQ0EDwEDAQABAQEMAg8BDgEBBgABDgIPAQkEAAEBAQ4DDwELAQMBAAEDAQsFDwEEAQYBDQMPAQQHAAEKAg8BDgEBBAABBgkPAQ4HDwEOAQUIAAEEAw8BCAUAAQYHDwELAQkGDwELAQIKAAEMAg8BDgECBQABAgEJAQ0BDwEOAQwBBgEAAQkCDwEOAQsBCAECDAABAwMPAQ0BAQwAAgESAAEIAw8BCwEBIAABCgMPAQ0BAg4AAQgBBxAAAQsEDwEJAQEKAAEGAQ0CDwEDEAABCQUPAQsBBgEDAQIBAAEBAQIBBQEJAQ4EDwEMEQABBAENEA8BCwECEwABBgENDA8BCgEEFwABAwEHAQsBDQEOAQ8BDgENAQwBCAEFAQEMAA=="],"A":[29,0,8,29,27,"CQABAQEOBw8BChMAAQYIDwEOAQESAAELCQ8BBhEAAQIKDwELEQABBwsPAQIQAAENCw8BCA8AAQQGDwEMBQ8BDQ8AAQkFDwEOAQQGDwEEDgABDgUPAQgBAAEOBQ8BCQ0AAQUGDwEDAQABCQUPAQ4BAQwAAQsFDwENAgABAwYPAQULAAEBBg8BCAMAAQ0FDwELCwABBwYPAQMDAAEIBg8BAgoAAQwFDwENBAABAwYPAQcJAAEDBg8BBwUAAQ0FDwEMCQABCAYPAQIFAAEIBg8BAwgAAQ4FDwEMBgABAgYPAQkHAAEFFA8BDgcAAQoVDwEFBQABARYPAQoFAAEGFw8BAQQAAQwXDwEGAwABAgYPAQsKAAEBBg8BDAMAAQgGDwEGCwABCwYPAQICAAENBg8BAQsAAQYGDwEIAQABBAYPAQoMAAEBBg8BDQEAAQkGDwEFDQABCwYPAQQ="],"B":[28,0,8,28,27,"AwABCQsPAQ4BDQELAQkBBAsAAQkQDwEOAQcJAAEJEg8BCggAAQkTDwEHBwABCRMPAQ4HAAEJBg8BBQMAAQEBAwEKBw8BBAYAAQkGDwEFBgABDAYPAQYGAAEJBg8BBQYAAQgGDwEHBgABCQYPAQUGAAEIBg8BBgYAAQkGDwEFBgABDAYPAQMGAAEJBg8BBQMAAQEBAwEKBg8BDAcAAQkSDwEOAQMHAAEJEQ8BDQEECAABCREPAQkBAggAAQkTDwEGBwABCRQPAQUGAAEJBg8BBQQAAQEBBAELBg8BDQYAAQkGDwEFBwABCwYPAQQFAAEJBg8BBQcAAQYGDwEIBQABCQYPAQUHAAEGBg8BCQUAAQkGDwEFBwABCwYPAQgFAAEJBg8BBQQAAQEBBAELBw8BBQUAAQkVDwEBBQABCRQPAQgGAAEJEw8BCgcAAQkRDwEOAQYIAAEJDA8BDgENAQsBCAEEBwA="],"C":[27,0,8,27,27,"CgABAQEFAQkBDAENAQ4BDwEOAQ0BCwEIAQQNAAEDAQoMDwEOAQkBAggAAQEBChAPAQwHAAECAQ0RDwEMBgABAQENEg8BDAYAAQwIDwEKAQUBAgIBAQIBBQEJAQ4CDwEMBQABBgcPAQ0BAwgAAQEBBwEOAQwEAAEBAQ4GDwENAQELAAECAQkEAAEFBw8BBBIAAQkGDwEMEwABDQYPAQYTAAcPAQMSAAEBBw8BAhIAAQIHDwEBEgABAQcPAQETAAcPAQMTAAENBg8BBhMAAQkGDwEMEwABBQcPAQQSAAEBAQ4GDwENAQELAAECAQkFAAEGBw8BDQEDCAABAQEHAQ4BDAYAAQwIDwEKAQUBAgIBAQIBBQEJAQ4CDwEMBgABAQENEg8BDAcAAQIBDREPAQwIAAEBAQoQDwEMCgABAwEKDA8BDgEJAQIMAAECAQUBCQEMAQ0BDgEPAQ4BDQELAQgBBAUA"],"D":[31,0,8,31,27,"AwABCQgPAg4BDQEMAQsBCQEGAQMOAAEJEA8BDQEIAQELAAEJEg8BDgEGCgABCRQPAQkJAAEJFQ8BCQgAAQkGDwEFAgABAQECAQQBCAEOCA8BBgcAAQkGDwEFBwABCAcPAQ4BAQYAAQkGDwEFCAABBgcPAQkGAAEJBg8BBQkAAQkGDwEOBgABCQYPAQUJAAECBw8BBAUAAQkGDwEFCgABDAYPAQgFAAEJBg8BBQoAAQgGDwEJBQABCQYPAQUKAAEHBg8BCwUAAQkGDwEFCgABBgYPAQsFAAEJBg8BBQoAAQcGDwEKBQABCQYPAQUKAAEIBg8BCQUAAQkGDwEFCgABDAYPAQgFAAEJBg8BBQkAAQIHDwEEBQABCQYPAQUJAAEJBg8BDgYAAQkGDwEFCAABBgcPAQkGAAEJBg8BBQcAAQgHDwEOAQEGAAEJBg8BBQIAAQEBAgEEAQgBDggPAQYHAAEJFQ8BCQgAAQkUDwEJCQABCRIPAQ4BBgoAAQkQDwENAQgBAQsAAQkJDwEOAQ0BDAELAQkBBgEDCwA="],"E":[25,0,8,25,27,"AwABCRIPAQMFAAEJEg8BAwUAAQkSDwEDBQABCRIPAQMFAAEJEg8BAwUAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkRDwEHBgABCREPAQcGAAEJEQ8BBwYAAQkRDwEHBgABCREPAQcGAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJEg8BCAUAAQkSDwEIBQABCRIPAQgFAAEJEg8BCAUAAQkSDwEIAgA="],"F":[25,0,8,25,27,"AwABCRIPAQMFAAEJEg8BAwUAAQkSDwEDBQABCRIPAQMFAAEJEg8BAwUAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkRDwEHBgABCREPAQcGAAEJEQ8BBwYAAQkRDwEHBgABCREPAQcGAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFDgA="],"G":[30,0,8,30,27,"CgABAQEFAQgBCwENAQ4CDwEOAQ0BCwEJAQUBAg4AAQMBCQ4PAQwBBwEBCgABCRIPAQoIAAECAQwTDwEKBwABAQENFA8BCgcAAQwIDwEMAQcBAwEBAQABAQECAQUBCQENAw8BCgYAAQYHDwEOAQQKAAEFAQsBDwEKBQABAQEOBg8BDgECDQABBQEIBQABBQcPAQQVAAEJBg8BDBYAAQ0GDwEHFgAHDwEDFQABAQcPAQIGAAEDCg8BCgMAAQIHDwEBBgABAwoPAQoDAAEBBw8BAQYAAQMKDwEKBAAHDwEDBgABAwoPAQoEAAENBg8BBgYAAQMKDwEKBAABCQYPAQsLAAEOBQ8BCgQAAQUHDwEECgABDgUPAQoEAAEBAQ4GDwENAQEJAAEOBQ8BCgUAAQYHDwENAQMIAAEOBQ8BCgYAAQwIDwELAQYBAgEBAQABAQECAQUGDwEKBgABAQENFQ8BCgcAAQIBDRQPAQoIAAEBAQoSDwEOAQYKAAEDAQoODwELAQYOAAECAQUBCQEMAQ0BDgEPAQ4BDQEMAQoBBwEEAQEGAA=="],"H":[31,0,8,31,27,"AwABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJFw8BCAYAAQkXDwEIBgABCRcPAQgGAAEJFw8BCAYAAQkXDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgDAA=="],"I":[14,0,8,14,27,"AwABCQYPAQUGAAEJBg8BBQYAAQkGDwEFBgABCQYPAQUGAAEJBg8BBQYAAQkGDwEFBgABCQYPAQUGAAEJBg8BBQYAAQkGDwEFBgABCQYPAQUGAAEJBg8BBQYAAQkGDwEFBgABCQYPAQUGAAEJBg8BBQYAAQkGDwEFBgABCQYPAQUGAAEJBg8BBQYAAQkGDwEFBgABCQYPAQUGAAEJBg8BBQYAAQkGDwEFBgABCQYPAQUGAAEJBg8BBQYAAQkGDwEFBgABCQYPAQUGAAEJBg8BBQYAAQkGDwEFAwA="],"J":[14,-3,8,17,34,"BgABCQYPAQUJAAEJBg8BBQkAAQkGDwEFCQABCQYPAQUJAAEJBg8BBQkAAQkGDwEFCQABCQYPAQUJAAEJBg8BBQkAAQkGDwEFCQABCQYPAQUJAAEJBg8BBQkAAQkGDwEFCQABCQYPAQUJAAEJBg8BBQkAAQkGDwEFCQABCQYPAQUJAAEJBg8BBQkAAQkGDwEFCQABCQYPAQUJAAEJBg8BBQkAAQkGDwEFCQABCQYPAQUJAAEJBg8BBQkAAQkGDwEFCQABCQYPAQUJAAELBg8BBAgAAQEBDgYPAQMIAAEIBg8BDgYAAQEBAwEJBw8BCgQAAQELDwEDBAABAQoPAQgFAAEBCQ8BCQYAAQEHDwENAQUHAAEBAg8BDgENAQsBCAEECQA="],"K":[29,0,8,30,27,"AwABCQYPAQUIAAEDAQ4GDwENAQEEAAEJBg8BBQcAAQMBDgYPAQ0BAQUAAQkGDwEFBgABAwEOBg8BDAEBBgABCQYPAQUFAAEDAQ4GDwEMAQEHAAEJBg8BBQQAAQQBDgYPAQwBAQgAAQkGDwEFAwABBAEOBg8BDAEBCQABCQYPAQUCAAEEAQ4GDwEMAQEKAAEJBg8BBQEAAQQHDwEMAQELAAEJBg8BBQEEBw8BDAEBDAABCQYPAQoHDwELAQENAAEJDQ8BCwEBDgABCQwPAQsBAQ8AAQkLDwEMEQABCQsPAQ4BBBAAAQkMDwEOAQQPAAEJDQ8BDgEEDgABCQYPAQwHDwEOAQQNAAEJBg8BBQEHBw8BDgEEDAABCQYPAQUBAAEHBw8BDgEECwABCQYPAQUCAAEHBw8BDgEECgABCQYPAQUDAAEHCA8BBAkAAQkGDwEFBAABBwgPAQQIAAEJBg8BBQUAAQcIDwEEBwABCQYPAQUGAAEHCA8BBAYAAQkGDwEFBwABBggPAQUFAAEJBg8BBQgAAQYIDwEFBAABCQYPAQUJAAEGCA8BBQ=="],"L":[24,0,8,24,27,"AwABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJEg8BCAQAAQkSDwEIBAABCRIPAQgEAAEJEg8BCAQAAQkSDwEIAQA="],"M":[37,0,8,37,27,"AwABCQgPAQcLAAEKCA8BBgYAAQkIDwENCgABAQkPAQYGAAEJCQ8BBQkAAQcJDwEGBgABCQkPAQsJAAENCQ8BBgYAAQkKDwECBwABBQoPAQYGAAEJCg8BCAcAAQsKDwEGBgABCQoPAQ4BAQUAAQMLDwEGBgABCQYPAQ4EDwEGBQABCQQPAQ4GDwEGBgABCQYPAQgEDwEMBAABAQEOBA8BBwYPAQYGAAEJBg8BAgUPAQQDAAEHBA8BDQEDBg8BBgYAAQkGDwEAAQoEDwEKAwABDQQPAQcBAwYPAQYGAAEJBg8BAAEEBQ8BAgEAAQUFDwEBAQMGDwEGBgABCQYPAgABDAQPAQgBAAELBA8BCQEAAQMGDwEGBgABCQYPAgABBgQPAQ4BAwUPAQMBAAEDBg8BBgYAAQkGDwIAAQEBDgQPAQ0EDwEMAgABAwYPAQYGAAEJBg8DAAEICQ8BBQIAAQMGDwEGBgABCQYPAwABAggPAQ4DAAEDBg8BBgYAAQkGDwQAAQsHDwEIAwABAwYPAQYGAAEJBg8EAAEEBw8BAgMAAQMGDwEGBgABCQYPBQABDQUPAQoEAAEDBg8BBgYAAQkGDwUAAQcFDwEEBAABAwYPAQYGAAEJBg8FAAEBAQ4DDwEMBQABAwYPAQYGAAEJBg8QAAEDBg8BBgYAAQkGDxAAAQMGDwEGBgABCQYPEAABAwYPAQYGAAEJBg8QAAEDBg8BBgYAAQkGDxAAAQMGDwEGAwA="],"N":[31,0,8,31,27,"AwABCQcPAQcJAAYPAQgGAAEJBw8BDgEBCAAGDwEIBgABCQgPAQcIAAYPAQgGAAEJCA8BDgEBBwAGDwEIBgABCQkPAQgHAAYPAQgGAAEJCg8BAgYABg8BCAYAAQkKDwEJBgAGDwEIBgABCQsPAQIFAAYPAQgGAAEJBg8BDgQPAQoFAAYPAQgGAAEJBg8BBwUPAQMEAAYPAQgGAAEJBg8BAQEOBA8BCwQABg8BCAYAAQkGDwEAAQYFDwEEAwAGDwEIBgABCQYPAgABDQQPAQwDAAYPAQgGAAEJBg8CAAEFBQ8BBQIABg8BCAYAAQkGDwMAAQwEDwEMAgAGDwEIBgABCQYPAwABBQUPAQYBAAYPAQgGAAEJBg8EAAEMBA8BDQEBBg8BCAYAAQkGDwQAAQQFDwEHBg8BCAYAAQkGDwUAAQsEDwEOBg8BCAYAAQkGDwUAAQMLDwEIBgABCQYPBgABCgoPAQgGAAEJBg8GAAECCg8BCAYAAQkGDwcAAQkJDwEIBgABCQYPBwABAQEOCA8BCAYAAQkGDwgAAQgIDwEIBgABCQYPCAABAQEOBw8BCAYAAQkGDwkAAQcHDwEIAwA="],"O":[31,0,8,31,27,"CgABBAEHAQsBDQEOAQ8BDgENAQwBCQEFAQEQAAEBAQYBDQwPAQoBAg0AAQMBDRAPAQcLAAEFEw8BCwkAAQQVDwEKBwABAQEOBw8BDAEGAQIBAAEBAQMBCQgPAQcGAAEIBw8BCAcAAQMBDgYPAQ4BAQQAAQEBDgYPAQkJAAEDBw8BBwQAAQYGDwEOAQEKAAEJBg8BDQQAAQoGDwEJCwABAwcPAQEDAAEOBg8BBQwAAQ4GDwEFAwAHDwEDDAABCwYPAQcCAAEBBw8BAQwAAQoGDwEIAgABAgcPAQEMAAEJBg8BCQIAAQEHDwEBDAABCgYPAQgDAAcPAQIMAAELBg8BBwMAAQ4GDwEFDAABDgYPAQUDAAEKBg8BCQsAAQMHDwECAwABBgYPAQ4BAQoAAQkGDwENBAABAQEOBg8BCQkAAQMHDwEHBQABCAcPAQgHAAECAQ0GDwEOAQEFAAEBAQ4HDwEMAQUBAgEAAQEBAwEICA8BBwcAAQQVDwEKCQABBRMPAQsLAAEDAQ0QDwEIDQABAQEGAQ0MDwEKAQMRAAEEAQcBCwENAQ4BDwEOAQ0BDAEJAQUBAQkA"],"P":[27,0,8,27,27,"AwABCQwPAQ4BDAEJAQYBAQkAAQkQDwEOAQgIAAEJEg8BDQECBgABCRMPAQ0BAQUAAQkUDwEIBQABCQYPAQUEAAECAQgHDwEOBQABCQYPAQUGAAEFBw8BBAQAAQkGDwEFBwABDAYPAQcEAAEJBg8BBQcAAQkGDwEIBAABCQYPAQUHAAEJBg8BCAQAAQkGDwEFBwABDAYPAQcEAAEJBg8BBQYAAQUHDwEEBAABCQYPAQUEAAECAQgHDwEOBQABCRQPAQgFAAEJEw8BDQEBBQABCRIPAQ0BAgYAAQkQDwEOAQgBAQcAAQkMDwEOAQwBCQEGAQEJAAEJBg8BBRMAAQkGDwEFEwABCQYPAQUTAAEJBg8BBRMAAQkGDwEFEwABCQYPAQUTAAEJBg8BBRMAAQkGDwEFEwABCQYPAQUQAA=="],"Q":[31,0,8,31,32,"CgABBAEHAQsBDQEOAQ8BDgENAQwBCQEFAQIQAAEBAQYBDQwPAQoBAw0AAQMBDRAPAQgLAAEFEw8BCwEBCAABBBUPAQoHAAEBAQ4HDwEMAQYBAgEAAQEBAwEJCA8BBwYAAQgHDwEIBwABAwEOBg8BDgEBBAABAQEOBg8BCQkAAQMHDwEIBAABBgYPAQ4BAQoAAQkGDwENBAABCgYPAQkLAAEDBw8BAgMAAQ4GDwEFDAABDgYPAQUDAAcPAQMMAAELBg8BBwIAAQEHDwEBDAABCgYPAQgCAAECBw8BAQwAAQkGDwEJAgABAQcPAQEMAAEKBg8BCAMABw8BAgwAAQsGDwEHAwABDgYPAQUMAAEOBg8BBQMAAQoGDwEJCwABAwcPAQIDAAEGBg8BDgEBCgABCQYPAQwEAAEBBw8BCAkAAQMHDwEGBQABCQcPAQcHAAECAQ0GDwENBgABAQEOBw8BCwEFAQIBAAEBAQMBCAgPAQUHAAEEFQ8BCQkAAQUTDwEJCwABAwENDw8BDgEGDQABAQEGAQ0MDwEKAQIRAAEEAQcBCwENAQ4HDwEKGAABAgEOBQ8BCBgAAQQGDwEGGAABBQYPAQUYAAEHBQ8BDgEDGAABCAUPAQ4BAgMA"],"R":[28,0,8,28,27,"AwABCQsPAQ4BDQELAQgBBAsAAQkQDwENAQUJAAEJEg8BCAgAAQkTDwEFBwABCRMPAQwHAAEJBg8BBQMAAQEBBQENBw8BAQYAAQkGDwEFBQABAgcPAQMGAAEJBg8BBQYAAQsGDwEEBgABCQYPAQUGAAEKBg8BBAYAAQkGDwEFBgABCwYPAQEGAAEJBg8BBQUAAQIGDwEMBwABCQYPAQUDAAEBAQUBDQYPAQQHAAEJEg8BCAgAAQkQDwEOAQUJAAEJDw8BCwEBCgABCRAPAQ0BAwkAAQkRDwEOAQIIAAEJBg8BBQIAAQIBBwEOBg8BDAgAAQkGDwEFBAABAwcPAQcHAAEJBg8BBQUAAQcGDwEOAQEGAAEJBg8BBQYAAQ0GDwEHBgABCQYPAQUGAAEGBg8BDgEBBQABCQYPAQUHAAENBg8BBwUAAQkGDwEFBwABBgYPAQ4BAQQAAQkGDwEFCAABDQYPAQcEAAEJBg8BBQgAAQYGDwEOAQEDAAEJBg8BBQkAAQ0GDwEH"],"S":[27,0,8,27,27,"BwABAgEHAQoBDQEOAg8BDgENAQsBCgEHAQQBAQsAAQIBCw4PAQwBAggAAQQBDhAPAQMHAAECAQ4RDwEDBwABChIPAQMHAAEOBQ8BDgEIAQMBAQEAAQEBAgEEAQcBCwEOAg8BAwYAAQMGDwEFCQABAQEFAQsBAgYAAQUGDxQAAQUGDwEDEwABAwYPAQ0BBgEBEgABDggPAQwBCQEGAQQBAQ0AAQcNDwEMAQcBAgsAAQoPDwEJAQEKAAEIDw8BDQECCgABAgEIAQ4NDwENDQABAwEGAQkBDAoPAQYQAAEBAQUBCgcPAQoTAAEFBg8BDRQAAQ0FDwEOBQABAgEKAQMMAAEMBQ8BDQUAAQICDwEKAQQJAAEDBg8BCwUAAQIEDwENAQkBBQEDAQEBAAEBAQMBCAEOBg8BBwUAAQIUDwECBQABAhMPAQgGAAECEg8BCggAAQQBCQEODQ8BDgEGDAABAgEGAQkBCwENAQ4CDwEOAQ0BCwEIAQQIAA=="],"T":[25,0,8,26,27,"AQwYDwEBAQwYDwEBAQwYDwEBAQwYDwEBAQwYDwEBCQABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQEJAA=="],"U":[30,0,8,30,27,"AwABCQYPAQUIAAEFBg8BCgYAAQkGDwEFCAABBQYPAQoGAAEJBg8BBQgAAQUGDwEKBgABCQYPAQUIAAEFBg8BCgYAAQkGDwEFCAABBQYPAQoGAAEJBg8BBQgAAQUGDwEKBgABCQYPAQUIAAEFBg8BCgYAAQkGDwEFCAABBQYPAQoGAAEJBg8BBQgAAQUGDwEKBgABCQYPAQUIAAEFBg8BCgYAAQkGDwEFCAABBQYPAQoGAAEJBg8BBQgAAQUGDwEKBgABCQYPAQUIAAEFBg8BCgYAAQkGDwEFCAABBQYPAQoGAAEJBg8BBQgAAQUGDwEKBgABCQYPAQUIAAEFBg8BCgYAAQkGDwEGCAABBQYPAQkGAAEIBg8BBwgAAQYGDwEIBgABBgYPAQkIAAEIBg8BBwYAAQMGDwENCAABDQYPAQMHAAEOBg8BBwYAAQYGDwEOCAABCAcPAQkBAwEBAQABAwEIBw8BCQgAAQIBDhMPAQIJAAEFEg8BBgsAAQYQDwEGDQABAwELDA8BCwEDEAABAgEHAQoBDQEOAg8BDgENAQoBBwECCQA="],"V":[29,0,8,29,27,"AQkGDwEFDQABCwYPAgQGDwELDAABAQYPAQ0CAAENBg8BAQsAAQYGDwEIAgABCAYPAQYLAAEMBg8BAgIAAQIGDwEMCgABAgYPAQwEAAEMBg8BAgkAAQgGDwEGBAABBgYPAQgJAAENBg8BAQQAAQEGDwENCAABAwYPAQoGAAEKBg8BAwcAAQkGDwEFBgABBQYPAQkHAAEOBQ8BDggAAQ4FDwEOBgABBAYPAQkIAAEIBg8BBQUAAQoGDwEDCAABAwYPAQoEAAEBAQ4FDwEMCgABDAUPAQ4BAQMAAQYGDwEHCgABBwYPAQYDAAELBg8BAgoAAQEGDwELAgABAQYPAQsMAAELBg8BAgEAAQcGDwEFDAABBQYPAQcBAAEMBQ8BDgEBDQABDgUPAQwBAgYPAQkOAAEJBg8BCgYPAQQOAAEEDA8BDRAAAQ0LDwEIEAABBwsPAQIQAAECCg8BCxIAAQsJDwEGEgABBggPAQ4BARIAAQEBDgcPAQoKAA=="],"W":[41,0,8,41,27,"AQABDAUPAQ0IAAEBBg8BDQgAAQEGDwEIAgABCAYPAQIHAAEEBw8BAgcAAQUGDwEFAgABBAYPAQUHAAEIBw8BBQcAAQgGDwEBAgABAQYPAQkHAAELBw8BCQcAAQwFDwEMBAABDAUPAQ0HAAgPAQwGAAEBBg8BCQQAAQkGDwEBBQABBAkPAQEFAAEEBg8BBQQAAQUGDwEFBQABBwQPAQ4EDwEEBQABCAYPAQIEAAECBg8BCAUAAQsEDwEIBA8BCAUAAQsFDwENBgABDQUPAQwFAAEOAw8BDQECBA8BCwUAAQ4FDwEKBgABCgYPAQEDAAEDBA8BCgEAAQ4DDwEOBAABAwYPAQYGAAEGBg8BBAMAAQYEDwEGAQABCgQPAQMDAAEHBg8BAwYAAQIGDwEIAwABCgQPAQMBAAEGBA8BBwMAAQoFDwEOCAABDgUPAQsDAAENAw8BDgIAAQMEDwEKAwABDgUPAQsIAAEKBQ8BDgIAAQIEDwELAwABDgMPAQ4CAAEDBg8BBwgAAQcGDwEDAQABBQQPAQcDAAELBA8BAgEAAQYGDwEECAABAwYPAQcBAAEJBA8BBAMAAQcEDwEGAQABCgYPCgABDgUPAQoBAAEMBA8EAAEDBA8BCgEAAQ0FDwEMCgABCwUPAQ4BAQQPAQwFAAQPAQ0BAgYPAQgKAAEIBg8BBwQPAQgFAAELBA8BBwYPAQQKAAEEBg8BDgQPAQQFAAEIBA8BDgYPAQEKAAEBCw8BAQUAAQQKDwEMDAABDAkPAQwGAAEBCg8BCQwAAQgJDwEJBwABDAkPAQUMAAEFCQ8BBQcAAQgJDwECDAABAQkPAQIHAAEFCA8BDQ4AAQ0HDwENCAABAQgPAQoOAAEJBw8BCgkAAQ0HDwEGBwA="],"X":[29,0,8,29,27,"AQABCQYPAQoKAAEDBg8BDgECAgABAQENBg8BBQgAAQEBDQYPAQYEAAEEBg8BDgEBBwABCQYPAQsGAAEIBg8BCwYAAQQGDwEOAQIHAAENBg8BBgQAAQEBDQYPAQUIAAEDBg8BDgECAwABCQYPAQoKAAEIBg8BCwIAAQQGDwEOAQELAAEMBg8BBgEBAQ0GDwEFDAABAwYPAQ4BCwYPAQoOAAEHDA8BDQEBDwABDAsPAQQQAAECAQ4JDwEJEgABBggPAQ0BARIAAQIIDwEKEwABDAkPAQQRAAEHCg8BDgEBDwABAwwPAQoPAAEMDQ8BBQ0AAQgGDwELAQQGDwEOAQELAAEDBg8BDgECAQABCQYPAQoKAAEBAQ0GDwEGAgABAQENBg8BBQkAAQgGDwELBAABBAYPAQ4BAgcAAQQGDwEOAQIFAAEIBg8BCwYAAQEBDQYPAQUHAAEMBg8BBgUAAQkGDwEKCAABAwYPAQ4BAgMAAQQGDwEOAQEJAAEHBg8BCwIAAQEBDQYPAQULAAEMBg8BBwEA"],"Y":[27,-1,8,29,27,"AQEBDgYPAQkLAAEMBg8BDAIAAQYHDwEDCQABBgcPAQMDAAELBg8BDAgAAQIBDgYPAQgEAAECAQ4GDwEHBwABCwYPAQwGAAEGBw8BAgUAAQUHDwEDBwABCwYPAQsEAAEBAQ4GDwEICAABAgEOBg8BBgMAAQkGDwENCgABBgYPAQ4BAQEAAQQHDwEDCwABCwYPAQoBAAENBg8BCAwAAQIBDgYPAQsGDwENAQENAAEHDQ8BBA8AAQwLDwEJEAABAgoPAQ0BAREAAQcJDwEEEwABDAcPAQkUAAEDBg8BDgEBFAABAQYPAQ0VAAEBBg8BDRUAAQEGDwENFQABAQYPAQ0VAAEBBg8BDRUAAQEGDwENFQABAQYPAQ0VAAEBBg8BDRUAAQEGDwENFQABAQYPAQ0VAAEBBg8BDQsA"],"Z":[27,0,8,27,27,"AgABDhUPAQsEAAEOFQ8BCwQAAQ4VDwELBAABDhUPAQsEAAEOFQ8BCBEAAQQHDwELEQABAgEOBg8BDQEBEAABAQENBg8BDgECEQABCwcPAQURAAEIBw8BBxEAAQUHDwEKEQABAwEOBg8BDAEBEAABAQENBg8BDgECEQABDAcPAQQRAAEJBw8BBhEAAQcHDwEJEQABBAcPAQsRAAECAQ4GDwENAQEQAAEBAQ0GDwEOAQMRAAEKBw8BBREAAQgHDwEIEQABBQcPAQoRAAECAQ4WDwEDAgABBRcPAQMCAAEFFw8BAwIAAQUXDwEDAgABBRcPAQMBAA=="],"[":[17,0,7,17,33,"AwABDAoPAQYFAAEMCg8BBgUAAQwKDwEGBQABDAoPAQYFAAEMBQ8BBQoAAQwFDwEFCgABDAUPAQUKAAEMBQ8BBQoAAQwFDwEFCgABDAUPAQUKAAEMBQ8BBQoAAQwFDwEFCgABDAUPAQUKAAEMBQ8BBQoAAQwFDwEFCgABDAUPAQUKAAEMBQ8BBQoAAQwFDwEFCgABDAUPAQUKAAEMBQ8BBQoAAQwFDwEFCgABDAUPAQUKAAEMBQ8BBQoAAQwFDwEFCgABDAUPAQUKAAEMBQ8BBQoAAQwFDwEFCgABDAUPAQUKAAEMBQ8BBQoAAQwKDwEGBQABDAoPAQYFAAEMCg8BBgUAAQwKDwEGAgA="],"\\":[14,0,8,14,30,"AQ0DDwECCQABCAMPAQcJAAEDAw8BDAoAAQ0DDwECCQABCQMPAQYJAAEEAw8BCwoAAQ4DDwEBCQABCQMPAQYJAAEFAw8BCgkAAQEBDgMPAQEJAAEKAw8BBQkAAQUDDwEKCQABAQMPAQ4KAAELAw8BBAkAAQYDDwEJCQABAQMPAQ4KAAEMAw8BAwkAAQcDDwEICQABAgMPAQ0KAAEMAw8BAwkAAQgDDwEICQABAwMPAQwKAAENAw8BAgkAAQgDDwEHCQABBAMPAQwKAAEOAw8BAQkAAQkDDwEGCQABBAMPAQsKAAEOAw8BAQkAAQoDDwEF"],"]":[17,0,7,17,33,"AgABBwoPAQsFAAEHCg8BCwUAAQcKDwELBQABBwoPAQsKAAEGBQ8BCwoAAQYFDwELCgABBgUPAQsKAAEGBQ8BCwoAAQYFDwELCgABBgUPAQsKAAEGBQ8BCwoAAQYFDwELCgABBgUPAQsKAAEGBQ8BCwoAAQYFDwELCgABBgUPAQsKAAEGBQ8BCwoAAQYFDwELCgABBgUPAQsKAAEGBQ8BCwoAAQYFDwELCgABBgUPAQsKAAEGBQ8BCwoAAQYFDwELCgABBgUPAQsKAAEGBQ8BCwoAAQYFDwELCgABBgUPAQsKAAEGBQ8BCwUAAQcKDwELBQABBwoPAQsFAAEHCg8BCwUAAQcKDwELAwA="],"^":[31,0,8,31,27,"DAABBAEOAw8BDgEEFwABAwEOBQ8BDgEDFQABAwEOBw8BDgEDEwABAgEOCQ8BDgECEQABAgENBQ8BDAUPAQ0BAg8AAQIBDQQPAQ4BBQEAAQUBDgQPAQ0BAg0AAQEBDQQPAQwBAgMAAQIBDAQPAQ0BAQsAAQEBDAQPAQgHAAEIBA8BDAEBCQABAQEMAw8BDgEECQABBAENAw8BDAEBBwABAQELAw8BCwEBCwABAQELAw8BCwEB/wD/ABQA"],"_":[18,0,35,19,9,"cgASDwEIEg8BCBIPAQg="],"`":[18,0,5,19,30,"AQABAQEMBA8BAw0AAQEBDAMPAQ0BAQ0AAQEBDQMPAQkOAAECAQ0DDwEFDgABAgENAg8BDgECDgABAgEOAg8BDA8AAQMBDgIPAQj/AL0A"],"a":[25,0,15,25,20,"BAABAwEGAQgBCwEMAg4BDwIOAQwBCgEHAQIKAAEKDg8BCgECCAABCg8PAQ4BAgcAAQoQDwENBwABCgEPAQ4BCQEFAQIBAQEAAQEBAgEFAQwGDwEGBgABCAEGCgABDAUPAQoSAAEIBQ8BDggAAQIBBgEKAQwCDgsPBgABAQEJEQ8BAQQAAQEBDRIPAQEEAAEKEw8BAQMAAQEGDwEOAQgBAwEBAwABBwYPAQEDAAEEBg8BBgYAAQgGDwEBAwABBgYPAQIGAAENBg8BAQMAAQUGDwEFBQABCAcPAQEDAAECBg8BDgEGAQEBAAEDAQoIDwEBBAABCwwPAQoGDwEBBAABAgEOCg8BBgEHBg8BAQUAAQMBDQcPAQ4BBgEAAQcGDwEBBgABAQEGAQsBDgEPAQ4BDAEHAQICAAEHBg8BAQIA"],"b":[26,0,7,26,28,"AwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJAgABAwEIAQwBDgEPAQ0BCgEFCQABDQUPAQkBAQEKCA8BDAECBwABDQUPAQoBDAoPAQ4BAwYAAQ0SDwENAQEFAAENEw8BCAUAAQ0HDwEKAQMBAAEBAQQBDAYPAQ4BAQQAAQ0GDwEJBgABDAYPAQUEAAENBQ8BDgEBBgABBAYPAQkEAAENBQ8BCwgABg8BCwQAAQ0FDwEJCAABDQUPAQwEAAENBQ8BCQgAAQ0FDwEMBAABDQUPAQsIAAYPAQsEAAENBQ8BDgEBBgABBAYPAQkEAAENBg8BCAYAAQwGDwEFBAABDQcPAQkBAwEAAQEBBAEMBg8BDgEBBAABDRMPAQgFAAENEg8BDQEBBQABDQUPAQoBDAoPAQ4BAwYAAQ0FDwEJAQEBCggPAQwBAgcAAQ0FDwEJAgABAwEJAQwBDgEPAQ0BCgEFBgA="],"c":[22,0,15,22,20,"BwABAQEFAQkBDAENAQ4BDwENAQsBBwEBCQABAQEIAQ4KDwEIAQEGAAEDAQ0NDwEHBQABAwEODg8BBwUAAQ0PDwEHBAABBwcPAQ0BBgECAgEBAgEGAQwBDwEHBAABDQYPAQoIAAEFAQYDAAECBg8BDQEBDQABBAYPAQgOAAEFBg8BBg4AAQUGDwEGDgABBAYPAQgOAAECBg8BDQ8AAQ0GDwEKCAABBQEGBAABBwcPAQ0BBgECAQABAQECAQYBDAEPAQcFAAENDw8BBwUAAQMBDg4PAQcGAAEDAQ0NDwEHBwABAQEIAQ4KDwEIAQEJAAEBAQUBCQEMAQ0BDgEPAQ0BCwEHAQEEAA=="],"d":[26,0,7,26,28,"EAABAgYPAQYSAAECBg8BBhIAAQIGDwEGEgABAgYPAQYSAAECBg8BBhIAAQIGDwEGEgABAgYPAQYSAAECBg8BBggAAQIBCAEMAQ4BDwENAQsBBgEBAQABAgYPAQYHAAEHCA8BDQEEAQIGDwEGBgABCQsPAQcGDwEGBQABBxMPAQYEAAECFA8BBgQAAQgHDwEHAQIBAAEBAQYBDgcPAQYEAAENBg8BBQUAAQIBDgYPAQYDAAEBBg8BDAcAAQgGDwEGAwABBAYPAQgHAAEEBg8BBgMAAQUGDwEGBwABAgYPAQYDAAEFBg8BBgcAAQIGDwEGAwABBAYPAQcHAAEEBg8BBgMAAQEGDwEMBwABCAYPAQYEAAENBg8BBQUAAQIBDgYPAQYEAAEIBw8BBwECAQABAQEGAQ4HDwEGBAABAhQPAQYFAAEHEw8BBgYAAQkLDwEHBg8BBgcAAQgIDwENAQQBAgYPAQYIAAECAQgBDAEOAQ8BDQELAQYBAQEAAQIGDwEGAgA="],"e":[25,0,15,25,20,"BwABAQEGAQoBDQEOAQ8BDgENAQsBBwECDAABAQEJCw8BCQEBCQABBAEODQ8BDQEDBwABAwEODw8BDgECBQABAQENBg8BCAECAQABAQEGAQ4FDwEMBQABBwYPAQUFAAECAQ4FDwEFBAABDQUPAQsHAAEJBQ8BCwMAAQIGDwEGBwABBgYPAQECAAEEFQ8BAwIAAQUVDwEEAgABBhUPAQUCAAEEFQ8BBQIAAQIGDwEEEgABDQUPAQkSAAEHBg8BBQoAAQQBCgEFBAABAQENBg8BCgEEAQEBAAEBAQIBBAEGAQoBDgIPAQUFAAEDAQ4RDwEFBgABBAENEA8BBQcAAQEBCQEODg8BBQkAAQEBBgEJAQwBDQEOAQ8BDgENAQwBCwEJAQcBBQECAwA="],"f":[16,0,7,17,28,"BgABAQEGAQoBDQEOBQ8BBgUAAQMBDQkPAQYEAAEBAQ4KDwEGBAABCAsPAQYEAAENBQ8BDgEEAQEIAAYPAQgJAAEBBg8BBgkAAQEGDwEGBgABBA4PAQ4BAAEEDg8BDgEAAQQODwEOAQABBA4PAQ4BAAEEDg8BDgQAAQEGDwEGCQABAQYPAQYJAAEBBg8BBgkAAQEGDwEGCQABAQYPAQYJAAEBBg8BBgkAAQEGDwEGCQABAQYPAQYJAAEBBg8BBgkAAQEGDwEGCQABAQYPAQYJAAEBBg8BBgkAAQEGDwEGCQABAQYPAQYJAAEBBg8BBgYA"],"g":[26,0,15,26,28,"BgABAgEIAQwBDgEPAQ0BCwEGAQEBAAECBg8BBgcAAQcIDwENAQQBAgYPAQYGAAEJCw8BBwYPAQYFAAEGEw8BBgQAAQEBDhMPAQYEAAEIBw8BCAECAQABAQEGAQ4HDwEGBAABDQYPAQUFAAEDBw8BBgMAAQEGDwEMBwABCQYPAQYDAAEEBg8BCAcAAQQGDwEGAwABBQYPAQYHAAECBg8BBgMAAQUGDwEGBwABAgYPAQYDAAEEBg8BBwcAAQQGDwEGAwABAQYPAQsHAAEIBg8BBgQAAQ0GDwEEBQABAgEOBg8BBgQAAQgHDwEHAQIBAAEBAQYBDgcPAQYEAAEBAQ4TDwEGBQABBhMPAQYGAAEJCw8BBwYPAQYHAAEHCA8BDQEEAQIGDwEFCAABAgEIAQwBDgEPAQ0BCwEGAQEBAAEDBg8BBBIAAQYGDwECEgABDAUPAQ0HAAEKAQQJAAEIBg8BCAcAAQ0BDwENAQcBBAEBAQABAQECAQYBDAYPAQ4BAQcAAQ0QDwEECAABDQ4PAQ4BBAkAAQ0MDwEOAQkBAQoAAQEBBAEIAQsBDAENAQ4BDwEOAQ0BDAEJAQUBAQgA"],"h":[26,0,7,26,28,"AwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJAgABAgEIAQwBDgEPAQ4BCwEGCQABDQUPAQkBAQEJCA8BDAECBwABDQUPAQoBDAoPAQ0HAAENEg8BBwYAAQ0SDwENBgABDQcPAQsBBAIBAQcHDwECBQABDQYPAQsFAAEHBg8BBQUAAQ0GDwECBQABAwYPAQYFAAENBQ8BDAYAAQIGDwEHBQABDQUPAQoGAAEBBg8BBwUAAQ0FDwEJBgABAQYPAQcFAAENBQ8BCQYAAQEGDwEHBQABDQUPAQkGAAEBBg8BBwUAAQ0FDwEJBgABAQYPAQcFAAENBQ8BCQYAAQEGDwEHBQABDQUPAQkGAAEBBg8BBwUAAQ0FDwEJBgABAQYPAQcFAAENBQ8BCQYAAQEGDwEHBQABDQUPAQkGAAEBBg8BBwUAAQ0FDwEJBgABAQYPAQcCAA=="],"i":[13,0,7,13,28,"AwABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJIAABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQMA"],"j":[13,-2,7,15,36,"BQABDQUPAQkIAAENBQ8BCQgAAQ0FDwEJCAABDQUPAQkIAAENBQ8BCQgAAQ0FDwEJJgABDQUPAQkIAAENBQ8BCQgAAQ0FDwEJCAABDQUPAQkIAAENBQ8BCQgAAQ0FDwEJCAABDQUPAQkIAAENBQ8BCQgAAQ0FDwEJCAABDQUPAQkIAAENBQ8BCQgAAQ0FDwEJCAABDQUPAQkIAAENBQ8BCQgAAQ0FDwEJCAABDQUPAQkIAAENBQ8BCQgAAQ0FDwEJCAABDQUPAQkIAAENBQ8BCQgAAQ4FDwEICAAGDwEHBwABBAYPAQQFAAEBAQQBDQUPAQ4BAQMAAQQJDwEJBAABBAgPAQ0BAQQAAQQHDwEMAQIFAAEEAw8BDgENAQoBBQcA"],"k":[25,0,7,26,28,"AwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJBgABBwYPAQ0BAgQAAQ0FDwEJBQABCAYPAQwBAQUAAQ0FDwEJBAABCAYPAQwBAQYAAQ0FDwEJAwABCAYPAQsBAQcAAQ0FDwEJAgABCAYPAQoJAAENBQ8BCQEAAQgGDwEJCgABDQUPAQkBCAYPAQgLAAENBQ8BDgYPAQcMAAENCw8BBg0AAQ0KDwENAQINAAENCw8BDQECDAABDQUPAQ4GDwENAQELAAENBQ8CCQYPAQ0BAQoAAQ0FDwEJAQABCgYPAQwBAQkAAQ0FDwEJAgABCwYPAQwBAQgAAQ0FDwEJAgABAQELBg8BDAEBBwABDQUPAQkDAAEBAQwGDwEMAQEGAAENBQ8BCQQAAQEBDAYPAQwBAQUAAQ0FDwEJBQABAQENBg8BDAEBBAABDQUPAQkGAAECAQ0GDwEMAQE="],"l":[13,0,7,13,28,"AwABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkGAAENBQ8BCQYAAQ0FDwEJBgABDQUPAQkDAA=="],"m":[39,0,15,39,20,"AwABDgUPAQkCAAEEAQoBDQEPAQ4BDAEHAQEFAAEFAQsBDQEPAQ4BCwEHAQEJAAEOBQ8BCQEBAQsHDwEOAQMCAAEDAQ0HDwENAQMIAAEOBQ8BCgENCg8BAgEDCg8BDgECBwABDhEPAQwBDgsPAQoHAAEOHw8BAQYAAQ4HDwEJAQIBAQEDAQ0IDwEJAQIBAQEDAQ0GDwEFBgABDgYPAQkEAAEEBw8BCQQAAQMGDwEIBgABDgYPAQEEAAEBBw8BAgUAAQ4FDwEJBgABDgUPAQwGAAEOBQ8BDAYAAQ0FDwEJBgABDgUPAQoGAAEOBQ8BCgYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJBgABDgUPAQkGAAEOBQ8BCQYAAQ0FDwEJAwA="],"n":[26,0,15,26,20,"AwABDQUPAQkCAAECAQgBDAEOAQ8BDgELAQYJAAENBQ8BCQEBAQkIDwEMAQIHAAENBQ8BCgEMCg8BDQcAAQ0SDwEHBgABDRIPAQ0GAAENBw8BCwEEAgEBBwcPAQIFAAENBg8BCwUAAQcGDwEFBQABDQYPAQIFAAEDBg8BBgUAAQ0FDwEMBgABAgYPAQcFAAENBQ8BCgYAAQEGDwEHBQABDQUPAQkGAAEBBg8BBwUAAQ0FDwEJBgABAQYPAQcFAAENBQ8BCQYAAQEGDwEHBQABDQUPAQkGAAEBBg8BBwUAAQ0FDwEJBgABAQYPAQcFAAENBQ8BCQYAAQEGDwEHBQABDQUPAQkGAAEBBg8BBwUAAQ0FDwEJBgABAQYPAQcFAAENBQ8BCQYAAQEGDwEHBQABDQUPAQkGAAEBBg8BBwIA"],"o":[25,0,15,25,20,"BwABAgEGAQoBDQEOAQ8BDgENAQsBCAEEDAABAgEKCw8BDQEFCQABBAEODg8BCQcAAQQRDwEJBQABAQEOEg8BBgQAAQcHDwEIAQIBAAEBAQUBDQYPAQ0EAAENBg8BBQUAAQEBDQYPAQQCAAECBg8BCwcAAQUGDwEIAgABBAYPAQcHAAEBBg8BCwIAAQUGDwEFCAABDgUPAQwCAAEGBg8BBQgAAQ4FDwEMAgABBAYPAQcHAAEBBg8BCwIAAQIGDwELBwABBQYPAQgDAAENBg8BBQUAAQEBDQYPAQQDAAEHBw8BCAECAQABAQEFAQwGDwENBAABAQEOEg8BBgUAAQQRDwEJBwABBAEODg8BCQkAAQIBCgsPAQ0BBQwAAQIBBwEKAQ0BDgEPAQ4BDQELAQgBBAcA"],"p":[26,0,15,26,28,"AwABDQUPAQkCAAEDAQgBDAEOAQ8BDQEKAQUJAAENBQ8BCQEBAQoIDwEMAQIHAAENBQ8BCgEMCg8BDgEDBgABDRIPAQ0BAQUAAQ0TDwEIBQABDQcPAQoBAwEAAQEBBAEMBg8BDgEBBAABDQYPAQkGAAEMBg8BBQQAAQ0FDwEOAQEGAAEEBg8BCQQAAQ0FDwELCAAGDwELBAABDQUPAQkIAAENBQ8BDAQAAQ0FDwEJCAABDQUPAQwEAAENBQ8BCwgABg8BCwQAAQ0FDwEOAQEGAAEEBg8BCQQAAQ0GDwEIBgABDAYPAQUEAAENBw8BCQEDAQABAQEEAQwGDwEOAQEEAAENEw8BCAUAAQ0SDwENAQEFAAENBQ8BCgEMCg8BDgEDBgABDQUPAQkBAQEKCA8BDAECBwABDQUPAQkCAAEDAQkBDAEOAQ8BDQEKAQUJAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEAA="],"q":[26,0,15,26,28,"BgABAgEIAQwBDgEPAQ0BCwEGAQEBAAECBg8BBgcAAQcIDwENAQQBAgYPAQYGAAEJCw8BBwYPAQYFAAEHEw8BBgQAAQIUDwEGBAABCAcPAQcBAgEAAQEBBgEOBw8BBgQAAQ0GDwEFBQABAgEOBg8BBgMAAQIGDwEMBwABCAYPAQYDAAEEBg8BCAcAAQQGDwEGAwABBQYPAQYHAAECBg8BBgMAAQUGDwEGBwABAgYPAQYDAAEEBg8BBwcAAQQGDwEGAwABAQYPAQwHAAEIBg8BBgQAAQ0GDwEFBQABAgEOBg8BBgQAAQgHDwEHAQIBAAEBAQYBDgcPAQYEAAECFA8BBgUAAQcTDwEGBgABCQsPAQcGDwEGBwABCAgPAQ0BBAECBg8BBggAAQIBCAEMAQ4BDwENAQsBBgEBAQABAgYPAQYSAAECBg8BBhIAAQIGDwEGEgABAgYPAQYSAAECBg8BBhIAAQIGDwEGEgABAgYPAQYSAAECBg8BBhIAAQIGDwEGAgA="],"r":[18,0,15,19,20,"AwABDQUPAQkCAAEBAQcBDAEOAg8BAgMAAQ0FDwEJAQABBQEOBQ8BAgMAAQ0FDwEJAQUHDwECAwABDQUPAQsBDgcPAQIDAAENDg8BAgMAAQ0HDwEOAQcBAgEAAQIBBAEKAQIDAAENBg8BDgECCgABDQYPAQULAAENBQ8BDgwAAQ0FDwELDAABDQUPAQkMAAENBQ8BCQwAAQ0FDwEJDAABDQUPAQkMAAENBQ8BCQwAAQ0FDwEJDAABDQUPAQkMAAENBQ8BCQwAAQ0FDwEJDAABDQUPAQkJAA=="],"s":[22,0,15,22,20,"BQABAwEIAQsBDQEOAQ8BDgENAQwBCwEJAQcBBAEBBgABAgELDQ8BDgUAAQEBDQ4PAQ4FAAEJDw8BDgUAAQ4FDwEIAQMBAQEAAQEBAwEGAQoBDgEPAQ4EAAEBBQ8BCwgAAQEBBgELBQAFDwEMEAABDQUPAQwBBwEEAQMBAQsAAQgKDwENAQsBBwEDBwABAQENDQ8BDAEDBgABAQEJDg8BAwcAAQEBBQEJAQwBDgkPAQwMAAEBAQMBBgEMBg8BAQ4AAQEBDgUPAQMDAAEKAQYBAQgAAQEGDwEDAwABDAIPAQsBBwEEAQIBAQEAAQEBBAEMBg8BAQMAAQwQDwEKBAABDA8PAQ0BAgQAAQwODwEKAQEFAAEBAQMBBgEIAQsBDAENAQ4CDwEOAQ0BCgEHAQIFAA=="],"t":[18,0,9,18,26,"AwABBAYPAQMKAAEEBg8BAwoAAQQGDwEDCgABBAYPAQMKAAEEBg8BAwoAAQQGDwEDBwABCA8PAQ0BAAEIDw8BDQEAAQgPDwENAQABCA8PAQ0BAAEIDw8BDQQAAQQGDwEDCgABBAYPAQMKAAEEBg8BAwoAAQQGDwEDCgABBAYPAQMKAAEEBg8BAwoAAQQGDwEDCgABBAYPAQMKAAEEBg8BBAoAAQMGDwELAQIJAAEBDA8BBAUAAQsLDwEEBQABBQsPAQQGAAEICg8BBAcAAQMBCQEMAQ4GDwEEAQA="],"u":[26,0,15,26,20,"AgABAgYPAQYGAAEEBg8BBAQAAQIGDwEGBgABBAYPAQQEAAECBg8BBgYAAQQGDwEEBAABAgYPAQYGAAEEBg8BBAQAAQIGDwEGBgABBAYPAQQEAAECBg8BBgYAAQQGDwEEBAABAgYPAQYGAAEEBg8BBAQAAQIGDwEFBgABBAYPAQQEAAECBg8BBQYAAQQGDwEEBAABAgYPAQUGAAEEBg8BBAQAAQIGDwEGBgABBQYPAQQEAAECBg8BBgYAAQcGDwEEBAABAQYPAQgGAAEMBg8BBAUABg8BDAUAAQYHDwEEBQABDAYPAQoBAgEAAQIBCAgPAQQFAAEIEw8BBAUAAQITDwEEBgABCAoPAQ4BBwYPAQQHAAEJCA8BDAEDAQQGDwEECAABAwEJAQ0CDgENAQoBBQIAAQQGDwEEAgA="],"v":[24,0,15,24,20,"AQQGDwEDCAABAQYPAQYBAAENBQ8BCQgAAQcFDwEOAQEBAAEHBQ8BDggAAQwFDwEJAgABAQYPAQUGAAEDBg8BAwMAAQoFDwEKBgABCAUPAQwEAAEEBg8BAQUAAQ0FDwEGBQABDQUPAQYEAAEEBQ8BDgEBBQABBwUPAQsEAAEKBQ8BCQYAAQEGDwECAgABAQEOBQ8BAwcAAQoFDwEHAgABBQUPAQwIAAEEBQ8BDQIAAQsFDwEGCQABDQUPAQMBAgUPAQ4BAQkAAQcFDwEJAQcFDwEJCgABAQUPAQ4BDAUPAQMLAAEKCg8BDAwAAQQKDwEGDQABDQgPAQ4BAQ0AAQcIDwEJDgABAQgPAQMPAAEKBg8BDAgA"],"w":[34,0,15,34,20,"AQABCQUPAQsGAAELBA8BDgYAAQgFDwEMAgABBQUPAQ4GAAEOBQ8BAwUAAQwFDwEIAgABAQYPAQMEAAEDBg8BBgQAAQEGDwEEAwABDAUPAQcEAAEHBg8BCgQAAQQFDwEOBAABCAUPAQoEAAELBg8BDgQAAQgFDwELBAABBAUPAQ4EAAEOBw8BAwMAAQwFDwEHBQABDgUPAQMCAAEDBA8BDQMPAQYCAAEBBg8BAwUAAQsFDwEHAgABBwMPAQwBCQMPAQoCAAEEBQ8BDgYAAQcFDwEKAgABCwMPAQgBBQMPAQ4CAAEIBQ8BCgYAAQMFDwEOAgABDgMPAQQBAgQPAQMBAAEMBQ8BBQcAAQ4FDwIDBA8BAQEAAQ0DDwEGAQEGDwEBBwABCgUPAQYBBwMPAQwCAAEJAw8BCgEEBQ8BDQgAAQYFDwEKAQsDDwEIAgABBQMPAQ4BCAUPAQgIAAECBQ8CDgMPAQQCAAECBA8BDgUPAQQJAAENCQ8BAQMAAQ0JDwEBCQABCQgPAQwEAAEJCA8BCwoAAQUIDwEIBAABBggPAQcKAAEBCA8BBQQAAQIIDwEDCwABDAcPAQEFAAENBg8BDgwAAQgGDwEMBgABCQYPAQoGAA=="],"x":[24,0,15,24,20,"AQABCwUPAQ4BAgYAAQQGDwEIAgABAQENBQ8BDAUAAQEBDQUPAQwEAAEDBg8BCAQAAQoFDwEOAQIFAAEHBg8BAwIAAQYGDwEFBwABCwUPAQ0BAQECAQ4FDwEICAABAQENBQ8BCQEMBQ8BDAoAAQQLDwEOAQILAAEHCg8BBQ0AAQsIDwEIDgABAQEOBg8BDQ8AAQUIDwEDDQABAgEOCA8BDQEBDAABDAoPAQsLAAEJBQ8BDgYPAQcJAAEFBg8BBQEHBg8BAwcAAQIBDgUPAQkCAAELBQ8BDQEBBgABDAUPAQ0BAQIAAQIBDgUPAQoFAAEJBg8BAwQAAQUGDwEHAwABBQYPAQcGAAEJBg8BAwEAAQIBDgUPAQsHAAEBAQ0FDwENAQE="],"y":[24,0,15,24,28,"AQUGDwECCAABAwYPAQQBAAENBQ8BCAgAAQgFDwENAgABBwUPAQ4IAAENBQ8BBwIAAQEBDgUPAQUGAAEDBg8BAgMAAQkFDwELBgABCAUPAQsEAAEDBg8BAgUAAQ0FDwEFBQABCwUPAQgEAAEDBQ8BDgYAAQUFDwEOBAABCQUPAQkHAAENBQ8BBQMAAQ4FDwEDBwABBwUPAQsCAAEEBQ8BDAgAAQEBDgUPAQIBAAEJBQ8BBgkAAQkFDwEIAQABDgUPAQEJAAECBQ8BDgEEBQ8BCgsAAQsFDwENBQ8BBAsAAQQKDwENDQABDQkPAQcNAAEGCQ8BAg0AAQEBDgcPAQsPAAEIBw8BBQ8AAQIGDwEOEQABCwUPAQkRAAELBQ8BAxAAAQMFDwEMDwABAQEEAQ0FDwEFDAABBAkPAQwNAAEECA8BDgECDQABBAcPAQ4BBA4AAQQEDwEOAQwBBwEBDAA="],"z":[22,0,15,22,20,"AgABDRAPAQwEAAENEA8BDAQAAQ0QDwEMBAABDRAPAQwEAAENEA8BCA0AAQMBDgUPAQkNAAEDAQ4FDwEJDQABAwEOBQ8BCQ0AAQMBDgUPAQkNAAEDAQ4FDwEJDQABAwEOBQ8BCQ0AAQMBDgUPAQkNAAEDAQ4FDwEJDQABBAEOBQ8BCQ0AAQQBDgUPAQkNAAEDAQ4QDwEMAwABBREPAQwDAAEFEQ8BDAMAAQURDwEMAwABBREPAQwCAA=="],"{":[26,0,7,26,34,"DQABBAEJAQwBDgQPAQsPAAEBAQsIDwELDwABCwkPAQsOAAEECg8BCw4AAQgGDwEJAQMBARAAAQoFDwELEwABCwUPAQgTAAELBQ8BBhMAAQsFDwEGEwABCwUPAQYTAAELBQ8BBhMAAQwFDwEGEgABAQYPAQUSAAEGBg8BAw8AAQEBAwEIBg8BDQ4AAQYKDwEFDgABBggPAQoBAw8AAQYIDwENAQYPAAEGCg8BBhAAAQEBAwEIBg8BDhMAAQcGDwEDEgABAQYPAQUTAAENBQ8BBhMAAQwFDwEGEwABCwUPAQYTAAELBQ8BBhMAAQsFDwEGEwABCwUPAQgTAAEKBQ8BDBMAAQgGDwEJAQMBARAAAQMKDwELDwABCwkPAQsPAAEBAQsIDwELEQABBAEJAQwBDgQPAQsEAA=="],"|":[14,0,7,14,37,"BAABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwJAAEEAw8BDAkAAQQDDwEMCQABBAMPAQwFAA=="],"}":[26,0,7,26,34,"BAABBgQPAQ4BDQEKAQYBARAAAQYIDwENAQMPAAEGCQ8BDgECDgABBgoPAQkRAAECAQYBDgUPAQ0TAAEGBg8TAAECBg8BARIAAQEGDwEBEgABAQYPAQESAAEBBg8BARIAAQEGDwECEwAGDwEDEwAGDwEFEwABDAUPAQsTAAEIBg8BCwEEAQEQAAEBAQ0JDwELDwABAQEIAQ4HDwELDwABAwELCA8BCw4AAQIBDgkPAQsOAAEJBg8BCwEEAQEQAAENBQ8BDBMABg8BBhIAAQEGDwEDEgABAQYPAQISAAEBBg8BARIAAQEGDwEBEgABAQYPAQESAAEDBg8BARIAAQYGDxEAAQIBBgEOBQ8BDQ4AAQYKDwEIDgABBgkPAQ4BAg4AAQYIDwENAQMPAAEGBA8BDgENAQoBBgEBDAA="],"~":[31,0,19,31,16,"GgABAgoAAQEBBwELAQ0BDwEOAQwBCQEFAQEJAAEHAQ4BAQcAAQIBCQoPAQwBBwEEAQEBAAEBAQQBCAEOAg8BAQYAAQEBDhYPAQEGAAEBFg8BDgEBBgABAQMPAQkBBAECAQABAQEEAQcBDAoPAQkBAgcAAQEBDwELAQIIAAEBAQYBCQEMAQ4BDwEOAQsBBwECCQABAQEH/wATAA=="],"А":[29,0,8,29,27,"CQABAQEOBw8BChMAAQYIDwEOAQESAAELCQ8BBhEAAQIKDwELEQABBwsPAQIQAAENCw8BCA8AAQQGDwEMBQ8BDQ8AAQkFDwEOAQQGDwEEDgABDgUPAQgBAAEOBQ8BCQ0AAQUGDwEDAQABCQUPAQ4BAQwAAQsFDwENAgABAwYPAQULAAEBBg8BCAMAAQ0FDwELCwABBwYPAQMDAAEIBg8BAgoAAQwFDwENBAABAwYPAQcJAAEDBg8BBwUAAQ0FDwEMCQABCAYPAQIFAAEIBg8BAwgAAQ4FDwEMBgABAgYPAQkHAAEFFA8BDgcAAQoVDwEFBQABARYPAQoFAAEGFw8BAQQAAQwXDwEGAwABAgYPAQsKAAEBBg8BDAMAAQgGDwEGCwABCwYPAQICAAENBg8BAQsAAQYGDwEIAQABBAYPAQoMAAEBBg8BDQEAAQkGDwEFDQABCwYPAQQ="],"Б":[28,0,8,28,27,"AwABCRMPAQwHAAEJEw8BDAcAAQkTDwEMBwABCRMPAQwHAAEJEw8BDAcAAQkGDwEFFAABCQYPAQUUAAEJBg8BBRQAAQkGDwEFFAABCQYPAQUUAAEJBg8BBRQAAQkMDwEOAQ0BCgEHAQIKAAEJEQ8BCwEDCAABCRMPAQcHAAEJFA8BBQYAAQkUDwEOBgABCQYPAQUEAAEBAQQBCwcPAQQFAAEJBg8BBQcAAQsGDwEHBQABCQYPAQUHAAEGBg8BCAUAAQkGDwEFBwABBgYPAQgFAAEJBg8BBQcAAQsGDwEHBQABCQYPAQUEAAEBAQQBCwcPAQQFAAEJFA8BDgYAAQkUDwEFBgABCRMPAQcHAAEJEQ8BDAEDCAABCQwPAQ4BDQEKAQcBAgcA"],"В":[28,0,8,28,27,"AwABCQsPAQ4BDQELAQkBBAsAAQkQDwEOAQcJAAEJEg8BCggAAQkTDwEHBwABCRMPAQ4HAAEJBg8BBQMAAQEBAwEKBw8BBAYAAQkGDwEFBgABDAYPAQYGAAEJBg8BBQYAAQgGDwEHBgABCQYPAQUGAAEIBg8BBgYAAQkGDwEFBgABDAYPAQMGAAEJBg8BBQMAAQEBAwEKBg8BDAcAAQkSDwEOAQMHAAEJEQ8BDQEECAABCREPAQkBAggAAQkTDwEGBwABCRQPAQUGAAEJBg8BBQQAAQEBBAELBg8BDQYAAQkGDwEFBwABCwYPAQQFAAEJBg8BBQcAAQYGDwEIBQABCQYPAQUHAAEGBg8BCQUAAQkGDwEFBwABCwYPAQgFAAEJBg8BBQQAAQEBBAELBw8BBQUAAQkVDwEBBQABCRQPAQgGAAEJEw8BCgcAAQkRDwEOAQYIAAEJDA8BDgENAQsBCAEEBwA="],"Г":[24,0,8,24,27,"AwABCRIPAQgEAAEJEg8BCAQAAQkSDwEIBAABCRIPAQgEAAEJEg8BCAQAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFEAABCQYPAQUQAAEJBg8BBRAAAQkGDwEFDQA="],"Д":[33,0,8,33,33,"BwABDBIPAQ4NAAEMEg8BDg0AAQwSDwEODQABDBIPAQ4NAAEMEg8BDg0AAQwGDwECBQAGDwEODQABDQYPAQIFAAYPAQ4NAAENBg8BAgUABg8BDg0AAQ0GDwECBQAGDwEODQABDQYPAQEFAAYPAQ4NAAENBg8BAQUABg8BDg0AAQ0GDwEBBQAGDwEODQABDgYPBgAGDwEODQABDgUPAQ4GAAYPAQ4NAAEOBQ8BDQYABg8BDg0ABg8BDAYABg8BDgwAAQEGDwELBgAGDwEODAABAgYPAQkGAAYPAQ4MAAEEBg8BBgYABg8BDgwAAQkGDwEEBgAGDwEOCwABAwYPAQ4HAAYPAQ4KAAEDAQ4GDwEKBwAGDwEOCAABDBsPAQsEAAEMGw8BCwQAAQwbDwELBAABDBsPAQsEAAEMGw8BCwQAAQwEDwEHEQABCAQPAQsEAAEMBA8BBxEAAQgEDwELBAABDAQPAQcRAAEIBA8BCwQAAQwEDwEHEQABCAQPAQsEAAEMBA8BBxEAAQgEDwELBAABDAQPAQcRAAEIBA8BCwIA"],"Е":[25,0,8,25,27,"AwABCRIPAQMFAAEJEg8BAwUAAQkSDwEDBQABCRIPAQMFAAEJEg8BAwUAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkRDwEHBgABCREPAQcGAAEJEQ8BBwYAAQkRDwEHBgABCREPAQcGAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJEg8BCAUAAQkSDwEIBQABCRIPAQgFAAEJEg8BCAUAAQkSDwEIAgA="],"Ж":[45,0,8,45,27,"AQABAQEMBg8BBwkAAQwGDwECCAABAwEOBQ8BDgEDAwABAQENBg8BBggAAQwGDwECBwABAgEOBg8BBAUAAQIBDQYPAQUHAAEMBg8BAgYAAQIBDQYPAQUHAAECAQ4GDwEEBgABDAYPAQIFAAEBAQ0GDwEGCQABAwEOBQ8BDgEDBQABDAYPAQIEAAEBAQwGDwEHCwABBAYPAQ4BAgQAAQwGDwECBAABCwYPAQgNAAEFBg8BDQEBAwABDAYPAQIDAAEKBg8BCg8AAQcGDwEMAQECAAEMBg8BAgIAAQgGDwELEQABCAYPAQsCAAEMBg8BAgEAAQcGDwEMAQESAAEJBg8BCgEAAQwGDwECAQYGDwENAQEUAAELBg8BCQEMBg8BBgYPAQ4BAhQAAQEBDRYPAQMUAAEJFw8BDRMAAQQZDwEIEQABAQENGg8BBBAAAQkGDwIODA8BDQYPAQ0BAQ4AAQQHDwEFAQQLDwEIAQIBDgYPAQkNAAEBAQ4GDwEKAgABBQkPAQkCAAEGBw8BBAwAAQoGDwEOAQEDAAEGBw8BCwQAAQoGDwENAQEKAAEFBw8BBQUAAQ0GDwECBAABAQEOBg8BCgkAAQEBDgYPAQoGAAEMBg8BAgUAAQUHDwEFCAABCwYPAQ0BAQYAAQwGDwECBgABCgYPAQ4BAQYAAQYHDwEEBwABDAYPAQIGAAEBAQ4GDwEKBQABAgEOBg8BCQgAAQwGDwECBwABBAcPAQUEAAELBg8BDQEBCAABDAYPAQIIAAEJBg8BDgECAgABBwcPAQQJAAEMBg8BAggAAQEBDQYPAQsBAAECAQ4GDwEICgABDAYPAQIJAAEEBw8BBg=="],"З":[26,0,8,26,27,"BgABBAEHAQoBDQEOAQ8CDgENAQsBCAEEAQEKAAEDAQoBDgwPAQ4BCQECCAABDhAPAQ4BBQcAAQ4SDwEDBgABDhIPAQsGAAEOAQ8BDgEJAQYBAwECAQEBAAEBAQMBCAgPAQEFAAELAQQKAAEEBw8BAxIAAQwGDwEDEgABDAYPAQERAAEEBg8BCg8AAQIBBAEIAQ4FDwEOAQIKAAEODA8BDQEDCwABDgoPAQ0BBg0AAQ4LDwEMAQYMAAEODQ8BCwEBCgABDg4PAQsOAAEBAQIBAwEHAQ0HDwEEEgABCgYPAQkSAAEDBg8BDBIAAQMGDwEMBAABBwEIAQILAAEKBg8BCwQAAQgCDwEMAQcBBAECAQECAAEBAQMBBgEMBw8BBwQAAQgUDwECBAABCBMPAQYFAAEIEg8BBgYAAQEBBwENDg8BCgEDCgABAwEHAQoBDAIOAQ8CDgENAQsBCAEFAQEHAA=="],"И":[31,0,8,31,27,"AwABCQYPCQABBwcPAQgGAAEJBg8IAAEBAQ4HDwEIBgABCQYPCAABCAgPAQgGAAEJBg8HAAEBAQ4IDwEIBgABCQYPBwABCQkPAQgGAAEJBg8GAAECCg8BCAYAAQkGDwYAAQoKDwEIBgABCQYPBQABAwsPAQgGAAEJBg8FAAELBA8BDgYPAQgGAAEJBg8EAAEEBQ8BBwYPAQgGAAEJBg8EAAEMBA8BDQEBBg8BCAYAAQkGDwMAAQUFDwEGAQAGDwEIBgABCQYPAwABDAQPAQ0CAAYPAQgGAAEJBg8CAAEFBQ8BBQIABg8BCAYAAQkGDwIAAQ0EDwEMAwAGDwEIBgABCQYPAQABBgUPAQQDAAYPAQgGAAEJBg8BAQEOBA8BCwQABg8BCAYAAQkGDwEHBQ8BAwQABg8BCAYAAQkGDwEOBA8BCgUABg8BCAYAAQkLDwECBQAGDwEIBgABCQoPAQkGAAYPAQgGAAEJCg8BAgYABg8BCAYAAQkJDwEIBwAGDwEIBgABCQgPAQ4BAQcABg8BCAYAAQkIDwEHCAAGDwEIBgABCQcPAQ4BAQgABg8BCAYAAQkHDwEHCQAGDwEIAwA="],"Й":[31,0,0,31,35,"CAABAQIPAQoFAAEBAQ0BDwENEwABDAIPAQoBAwIBAQQBDAIPAQkTAAEFCg8BAhQAAQgIDwEFFgABBAEKAQ0CDwENAQkBAmwAAQkGDwkAAQcHDwEIBgABCQYPCAABAQEOBw8BCAYAAQkGDwgAAQgIDwEIBgABCQYPBwABAQEOCA8BCAYAAQkGDwcAAQkJDwEIBgABCQYPBgABAgoPAQgGAAEJBg8GAAEKCg8BCAYAAQkGDwUAAQMLDwEIBgABCQYPBQABCwQPAQ4GDwEIBgABCQYPBAABBAUPAQcGDwEIBgABCQYPBAABDAQPAQ0BAQYPAQgGAAEJBg8DAAEFBQ8BBgEABg8BCAYAAQkGDwMAAQwEDwENAgAGDwEIBgABCQYPAgABBQUPAQUCAAYPAQgGAAEJBg8CAAENBA8BDAMABg8BCAYAAQkGDwEAAQYFDwEEAwAGDwEIBgABCQYPAQEBDgQPAQsEAAYPAQgGAAEJBg8BBwUPAQMEAAYPAQgGAAEJBg8BDgQPAQoFAAYPAQgGAAEJCw8BAgUABg8BCAYAAQkKDwEJBgAGDwEIBgABCQoPAQIGAAYPAQgGAAEJCQ8BCAcABg8BCAYAAQkIDwEOAQEHAAYPAQgGAAEJCA8BBwgABg8BCAYAAQkHDwEOAQEIAAYPAQgGAAEJBw8BBwkABg8BCAMA"],"К":[30,0,8,30,27,"AwABCQYPAQUJAAEEBw8BCQQAAQkGDwEFCAABBAcPAQkFAAEJBg8BBQcAAQQBDgYPAQoGAAEJBg8BBQYAAQMBDgYPAQoHAAEJBg8BBQUAAQMBDgYPAQoIAAEJBg8BBQQAAQMBDgYPAQoJAAEJBg8BBQMAAQMBDgYPAQsKAAEJBg8BBQIAAQMBDgYPAQsLAAEJBg8BBQEAAQIBDgYPAQsBAQsAAQkGDwEFAQIBDQYPAQsBAQwAAQkGDwEHAQ0GDwEMAQENAAEJDg8BDA4AAQkPDwEHDQABCRAPAQMMAAEJEA8BDQEBCwABCQkPAQ0BDgYPAQkLAAEJCA8BDQEBAQYHDwEFCgABCQcPAQ0BAgIAAQoGDwEOAQEJAAEJBg8BDQECAwABAQENBg8BCwkAAQkGDwEGBQABBAcPAQYIAAEJBg8BBQYAAQgGDwEOAQIHAAEJBg8BBQcAAQwGDwEMBwABCQYPAQUHAAEDBw8BCAYAAQkGDwEFCAABBwcPAQQFAAEJBg8BBQkAAQsGDwENAQEEAAEJBg8BBQkAAQIBDgYPAQoEAAEJBg8BBQoAAQUHDwEF"],"Л":[31,0,8,31,27,"CAABDRIPAQULAAENEg8BBQsAAQ0SDwEFCwABDRIPAQULAAENEg8BBQsAAQ0GDwEBBAABCQYPAQULAAENBg8BAQQAAQkGDwEFCwABDQYPAQEEAAEJBg8BBQsAAQ4GDwEBBAABCQYPAQULAAEOBg8FAAEJBg8BBQsAAQ4GDwUAAQkGDwEFCwAGDwEOBQABCQYPAQUKAAEBBg8BDQUAAQkGDwEFCgABAgYPAQwFAAEJBg8BBQoAAQMGDwELBQABCQYPAQUKAAEEBg8BCQUAAQkGDwEFCgABBgYPAQcFAAEJBg8BBQoAAQkGDwEFBQABCQYPAQUKAAENBg8BAgUAAQkGDwEFCQABBQYPAQ0GAAEJBg8BBQgAAQQBDgYPAQkGAAEJBg8BBQUAAQIBBQELCA8BBAYAAQkGDwEFBAABBAoPAQoHAAEJBg8BBQQAAQQJDwEMAQEHAAEJBg8BBQQAAQQIDwEICQABCQYPAQUEAAEEBQ8BDQEIAQIKAAEJBg8BBQQAAQQBDQELAQkBBgECDQABCQYPAQUDAA=="],"М":[37,0,8,37,27,"AwABCQgPAQcLAAEKCA8BBgYAAQkIDwENCgABAQkPAQYGAAEJCQ8BBQkAAQcJDwEGBgABCQkPAQsJAAENCQ8BBgYAAQkKDwECBwABBQoPAQYGAAEJCg8BCAcAAQsKDwEGBgABCQoPAQ4BAQUAAQMLDwEGBgABCQYPAQ4EDwEGBQABCQQPAQ4GDwEGBgABCQYPAQgEDwEMBAABAQEOBA8BBwYPAQYGAAEJBg8BAgUPAQQDAAEHBA8BDQEDBg8BBgYAAQkGDwEAAQoEDwEKAwABDQQPAQcBAwYPAQYGAAEJBg8BAAEEBQ8BAgEAAQUFDwEBAQMGDwEGBgABCQYPAgABDAQPAQgBAAELBA8BCQEAAQMGDwEGBgABCQYPAgABBgQPAQ4BAwUPAQMBAAEDBg8BBgYAAQkGDwIAAQEBDgQPAQ0EDwEMAgABAwYPAQYGAAEJBg8DAAEICQ8BBQIAAQMGDwEGBgABCQYPAwABAggPAQ4DAAEDBg8BBgYAAQkGDwQAAQsHDwEIAwABAwYPAQYGAAEJBg8EAAEEBw8BAgMAAQMGDwEGBgABCQYPBQABDQUPAQoEAAEDBg8BBgYAAQkGDwUAAQcFDwEEBAABAwYPAQYGAAEJBg8FAAEBAQ4DDwEMBQABAwYPAQYGAAEJBg8QAAEDBg8BBgYAAQkGDxAAAQMGDwEGBgABCQYPEAABAwYPAQYGAAEJBg8QAAEDBg8BBgYAAQkGDxAAAQMGDwEGAwA="],"Н":[31,0,8,31,27,"AwABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJFw8BCAYAAQkXDwEIBgABCRcPAQgGAAEJFw8BCAYAAQkXDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgDAA=="],"О":[31,0,8,31,27,"CgABBAEHAQsBDQEOAQ8BDgENAQwBCQEFAQEQAAEBAQYBDQwPAQoBAg0AAQMBDRAPAQcLAAEFEw8BCwkAAQQVDwEKBwABAQEOBw8BDAEGAQIBAAEBAQMBCQgPAQcGAAEIBw8BCAcAAQMBDgYPAQ4BAQQAAQEBDgYPAQkJAAEDBw8BBwQAAQYGDwEOAQEKAAEJBg8BDQQAAQoGDwEJCwABAwcPAQEDAAEOBg8BBQwAAQ4GDwEFAwAHDwEDDAABCwYPAQcCAAEBBw8BAQwAAQoGDwEIAgABAgcPAQEMAAEJBg8BCQIAAQEHDwEBDAABCgYPAQgDAAcPAQIMAAELBg8BBwMAAQ4GDwEFDAABDgYPAQUDAAEKBg8BCQsAAQMHDwECAwABBgYPAQ4BAQoAAQkGDwENBAABAQEOBg8BCQkAAQMHDwEHBQABCAcPAQgHAAECAQ0GDwEOAQEFAAEBAQ4HDwEMAQUBAgEAAQEBAwEICA8BBwcAAQQVDwEKCQABBRMPAQsLAAEDAQ0QDwEIDQABAQEGAQ0MDwEKAQMRAAEEAQcBCwENAQ4BDwEOAQ0BDAEJAQUBAQkA"],"П":[31,0,8,31,27,"AwABCRcPAQgGAAEJFw8BCAYAAQkXDwEIBgABCRcPAQgGAAEJFw8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgGAAEJBg8BBQkAAQYGDwEIBgABCQYPAQUJAAEGBg8BCAYAAQkGDwEFCQABBgYPAQgDAA=="],"Р":[27,0,8,27,27,"AwABCQwPAQ4BDAEJAQYBAQkAAQkQDwEOAQgIAAEJEg8BDQECBgABCRMPAQ0BAQUAAQkUDwEIBQABCQYPAQUEAAECAQgHDwEOBQABCQYPAQUGAAEFBw8BBAQAAQkGDwEFBwABDAYPAQcEAAEJBg8BBQcAAQkGDwEIBAABCQYPAQUHAAEJBg8BCAQAAQkGDwEFBwABDAYPAQcEAAEJBg8BBQYAAQUHDwEEBAABCQYPAQUEAAECAQgHDwEOBQABCRQPAQgFAAEJEw8BDQEBBQABCRIPAQ0BAgYAAQkQDwEOAQgBAQcAAQkMDwEOAQwBCQEGAQEJAAEJBg8BBRMAAQkGDwEFEwABCQYPAQUTAAEJBg8BBRMAAQkGDwEFEwABCQYPAQUTAAEJBg8BBRMAAQkGDwEFEwABCQYPAQUQAA=="],"С":[27,0,8,27,27,"CgABAQEFAQkBDAENAQ4BDwEOAQ0BCwEIAQQNAAEDAQoMDwEOAQkBAggAAQEBChAPAQwHAAECAQ0RDwEMBgABAQENEg8BDAYAAQwIDwEKAQUBAgIBAQIBBQEJAQ4CDwEMBQABBgcPAQ0BAwgAAQEBBwEOAQwEAAEBAQ4GDwENAQELAAECAQkEAAEFBw8BBBIAAQkGDwEMEwABDQYPAQYTAAcPAQMSAAEBBw8BAhIAAQIHDwEBEgABAQcPAQETAAcPAQMTAAENBg8BBhMAAQkGDwEMEwABBQcPAQQSAAEBAQ4GDwENAQELAAECAQkFAAEGBw8BDQEDCAABAQEHAQ4BDAYAAQwIDwEKAQUBAgIBAQIBBQEJAQ4CDwEMBgABAQENEg8BDAcAAQIBDREPAQwIAAEBAQoQDwEMCgABAwEKDA8BDgEJAQIMAAECAQUBCQEMAQ0BDgEPAQ4BDQELAQgBBAUA"],"Т":[25,0,8,26,27,"AQwYDwEBAQwYDwEBAQwYDwEBAQwYDwEBAQwYDwEBCQABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQESAAENBg8BARIAAQ0GDwEBEgABDQYPAQEJAA=="],"У":[29,0,8,29,27,"AQABCwYPAQkKAAECBw8BAwIAAQMGDwEOAQEJAAEJBg8BCwQAAQsGDwEICAABAQcPAQQEAAEEBg8BDgEBBwABCAYPAQwGAAEMBg8BCAYAAQEBDgYPAQQGAAEEBg8BDgEBBQABBwYPAQwIAAEMBg8BBwQAAQEBDgYPAQUIAAEFBg8BDgEBAwABBgYPAQ0KAAENBg8BBwMAAQ0GDwEGCgABBgYPAQ4BAQEAAQYGDwEODAABDQYPAQcBAAENBg8BBwwAAQYGDwEOAQUGDwEOAQENAAEOBg8BDgYPAQgOAAEHDQ8BAQ4AAQEBDgsPAQkQAAEHCw8BAhAAAQEBDgkPAQoSAAEICQ8BAxIAAQEBDgcPAQsUAAEJBw8BAxQAAQYGDwELEwABAQEGAQ4GDwEEEAABCAoPAQwRAAEICg8BBBEAAQgJDwEHEgABCAcPAQ4BBhMAAQgCDwEOAQ0BCwEIAQQQAA=="],"Ф":[37,0,8,37,27,"DgABAgYPAQwdAAECBg8BDB0AAQIGDwEMGAABAQEFAQgBCgEMAQ4HDwEOAQwBCgEHAQMRAAEFAQsSDwEOAQkBAwwAAQQBDRcPAQoBAgkAAQcaDwEOAQMHAAEGHA8BDgECBQABAQEOBw8BDQEHAgMGDwEMAQEBBAEIAQ4HDwEKBQABBwcPAQgDAAECBg8BDAMAAQEBCwcPAQIEAAEMBg8BCgQAAQIGDwEMBAABAQEOBg8BBwQABw8BBAQAAQIGDwEMBQABCQYPAQoDAAEBBw8BAgQAAQIGDwEMBQABBgYPAQsDAAECBw8BAQQAAQIGDwEMBQABBQYPAQwDAAEBBw8BAQQAAQIGDwEMBQABBgYPAQsEAAcPAQQEAAECBg8BDAUAAQkGDwEKBAABDAYPAQoEAAECBg8BDAQAAQEBDgYPAQcEAAEHBw8BBwMAAQIGDwEMAwABAQELBw8BAgQAAQEBDgcPAQwBBwIDBg8BDAEBAQQBCAEOBw8BCgYAAQYcDwEOAQIHAAEHGg8BDgEDCQABBAENFw8BCwECDAABBQELEg8BDgEJAQQQAAEBAQUBCAELAQwBDgcPAQ4BDAEKAQcBBBgAAQIGDwEMHQABAgYPAQwdAAECBg8BDA8A"],"Х":[29,0,8,29,27,"AQABCQYPAQoKAAEDBg8BDgECAgABAQENBg8BBQgAAQEBDQYPAQYEAAEEBg8BDgEBBwABCQYPAQsGAAEIBg8BCwYAAQQGDwEOAQIHAAENBg8BBgQAAQEBDQYPAQUIAAEDBg8BDgECAwABCQYPAQoKAAEIBg8BCwIAAQQGDwEOAQELAAEMBg8BBgEBAQ0GDwEFDAABAwYPAQ4BCwYPAQoOAAEHDA8BDQEBDwABDAsPAQQQAAECAQ4JDwEJEgABBggPAQ0BARIAAQIIDwEKEwABDAkPAQQRAAEHCg8BDgEBDwABAwwPAQoPAAEMDQ8BBQ0AAQgGDwELAQQGDwEOAQELAAEDBg8BDgECAQABCQYPAQoKAAEBAQ0GDwEGAgABAQENBg8BBQkAAQgGDwELBAABBAYPAQ4BAgcAAQQGDwEOAQIFAAEIBg8BCwYAAQEBDQYPAQUHAAEMBg8BBgUAAQkGDwEKCAABAwYPAQ4BAgMAAQQGDwEOAQEJAAEHBg8BCwIAAQEBDQYPAQULAAEMBg8BBwEA"],"Ц":[34,0,8,34,33,"AwABCQYPAQUJAAEGBg8BCAkAAQkGDwEFCQABBgYPAQgJAAEJBg8BBQkAAQYGDwEICQABCQYPAQUJAAEGBg8BCAkAAQkGDwEFCQABBgYPAQgJAAEJBg8BBQkAAQYGDwEICQABCQYPAQUJAAEGBg8BCAkAAQkGDwEFCQABBgYPAQgJAAEJBg8BBQkAAQYGDwEICQABCQYPAQUJAAEGBg8BCAkAAQkGDwEFCQABBgYPAQgJAAEJBg8BBQkAAQYGDwEICQABCQYPAQUJAAEGBg8BCAkAAQkGDwEFCQABBgYPAQgJAAEJBg8BBQkAAQYGDwEICQABCQYPAQUJAAEGBg8BCAkAAQkGDwEFCQABBgYPAQgJAAEJBg8BBQkAAQYGDwEICQABCQYPAQUJAAEGBg8BCAkAAQkGDwEFCQABBgYPAQgJAAEJBg8BBQkAAQYGDwEICQABCQYPAQUJAAEGBg8BCAkAAQkcDwECBAABCRwPAQIEAAEJHA8BAgQAAQkcDwECBAABCRwPAQIbAAECBQ8BAhsAAQIFDwECGwABAgUPAQIbAAECBQ8BAhsAAQIFDwECGwABAgUPAQIBAA=="],"Ч":[30,0,8,30,27,"AwAGDwEOCQABBwYPAQgGAAYPAQ4JAAEHBg8BCAYABg8BDgkAAQcGDwEIBgAGDwEOCQABBwYPAQgGAAYPAQ4JAAEHBg8BCAYABg8BDgkAAQcGDwEIBgAHDwkAAQcGDwEIBgAHDwEBCAABBwYPAQgGAAcPAQMIAAEHBg8BCAYAAQ4GDwEGCAABBwYPAQgGAAELBg8BDgEFAQEGAAEHBg8BCAYAAQgWDwEIBgABAhYPAQgHAAEIFQ8BCAgAAQgUDwEICQABAwEJAQ0BDhAPAQgWAAEHBg8BCBYAAQcGDwEIFgABBwYPAQgWAAEHBg8BCBYAAQcGDwEIFgABBwYPAQgWAAEHBg8BCBYAAQcGDwEIFgABBwYPAQgWAAEHBg8BCBYAAQcGDwEIAwA="],"Ш":[46,0,8,46,27,"AwABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCQYPAQUIAAEJBg8BBQgAAQoGDwEEBgABCSYPAQQGAAEJJg8BBAYAAQkmDwEEBgABCSYPAQQGAAEJJg8BBAMA"],"Щ":[49,0,8,49,33,"AwABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCQYPAQUIAAEJBg8BBQgAAQoGDwEECQABCSoPAQwFAAEJKg8BDAUAAQkqDwEMBQABCSoPAQwFAAEJKg8BDCsAAQYEDwEMKwABBgQPAQwrAAEGBA8BDCsAAQYEDwEMKwABBgQPAQwrAAEGBA8BDAIA"],"Ъ":[35,0,8,35,27,"AQABAw8PAQoSAAEDDw8BChIAAQMPDwEKEgABAw8PAQoSAAEDDw8BChIAAQEIBAEHBg8BChsAAQQGDwEKGwABBAYPAQobAAEEBg8BChsAAQQGDwEKGwABBAYPAQ0FCgEJAQgBBgEDEgABBBAPAQ4BCQEBDwABBBIPAQ4BBQ4AAQQUDwEFDQABBBQPAQ4BAQwAAQQGDwENBAgBCQELCA8BBgwAAQQGDwEKBgABAgENBg8BCgwAAQQGDwEKBwABBAYPAQwMAAEEBg8BCgcAAQEGDwENDAABBAYPAQoHAAEBBg8BDQwAAQQGDwEKBwABBgYPAQsMAAEEBg8BCgYAAQUBDgYPAQcMAAEEBg8BDgQLAQwBDggPAQIMAAEEFA8BCA0AAQQTDwEKDgABBBEPAQ0BBQ8AAQQMDwEOAQ0BCwEIAQQHAA=="],"Ы":[38,0,8,38,27,"AwABCQYPAQURAAYPAQ4GAAEJBg8BBREABg8BDgYAAQkGDwEFEQAGDwEOBgABCQYPAQURAAYPAQ4GAAEJBg8BBREABg8BDgYAAQkGDwEFEQAGDwEOBgABCQYPAQURAAYPAQ4GAAEJBg8BBREABg8BDgYAAQkGDwEFEQAGDwEOBgABCQYPAQURAAYPAQ4GAAEJDA8BDgEMAQoBBwECBwAGDwEOBgABCREPAQoBAgUABg8BDgYAAQkTDwEFBAAGDwEOBgABCRQPAQMDAAYPAQ4GAAEJFA8BDAMABg8BDgYAAQkGDwEFBAABAQEEAQwHDwECAgAGDwEOBgABCQYPAQUGAAEBAQ0GDwEGAgAGDwEOBgABCQYPAQUHAAEHBg8BCAIABg8BDgYAAQkGDwEFBwABBgYPAQkCAAYPAQ4GAAEJBg8BBQcAAQcGDwEIAgAGDwEOBgABCQYPAQUGAAEBAQ0GDwEGAgAGDwEOBgABCQYPAQUEAAEBAQQBDAcPAQICAAYPAQ4GAAEJFA8BDAMABg8BDgYAAQkUDwEDAwAGDwEOBgABCRMPAQUEAAYPAQ4GAAEJEQ8BCgECBQAGDwEOBgABCQwPAQ4BDAEKAQcBAgcABg8BDgMA"],"Ь":[28,0,8,28,27,"AwABCQYPAQUUAAEJBg8BBRQAAQkGDwEFFAABCQYPAQUUAAEJBg8BBRQAAQkGDwEFFAABCQYPAQUUAAEJBg8BBRQAAQkGDwEFFAABCQYPAQUUAAEJDA8BDgEMAQoBBwECCgABCREPAQoBAggAAQkTDwEFBwABCRQPAQMGAAEJFA8BDAYAAQkGDwEFBAABAQEEAQwHDwECBQABCQYPAQUGAAEBAQ0GDwEGBQABCQYPAQUHAAEHBg8BCAUAAQkGDwEFBwABBgYPAQkFAAEJBg8BBQcAAQcGDwEIBQABCQYPAQUGAAEBAQ0GDwEGBQABCQYPAQUEAAEBAQQBDAcPAQIFAAEJFA8BDAYAAQkUDwEDBgABCRMPAQUHAAEJEQ8BCgECCAABCQwPAQ4BDAEKAQcBAgcA"],"Э":[27,0,7,27,29,"BwABAgEFAQYBBwEGAQUBBAEBDwABAQEGAQoBDggPAQwBCQECCwABBgEODg8BCgECCQABChAPAQ4BBQgAAQoSDwEIBwABCgQPAQ0BCwIJAQoBDQkPAQYGAAEKAQ8BDQEHAQIGAAEDAQoIDwEDBQABCQEHCwABBwcPAQoTAAEJBw8BAxIAAQEBDgYPAQgTAAEIBg8BDAgACwEBBQcPAQEGAAEFEw8BAgYAAQUTDwEDBgABBRMPAQQGAAEFEw8BAwYAAQUTDwECBgABAQsCAQYHDwEBEgABCAYPAQwSAAEBAQ4GDwEIEgABCQcPAQMEAAEIAQYLAAEGBw8BCwUAAQoBDwENAQYBAQYAAQIBCQgPAQMFAAEKBA8BDAEKAggBCQEMCQ8BBwYAAQoSDwEJBwABChEPAQcIAAEGAQ4ODwELAQMKAAEBAQcBCwkPAQ0BCgEDDwABAQEDAQYBBwEIAQcBBgEFAQIMAA=="],"Ю":[43,0,8,43,27,"AwABCQYPAQUKAAEBAQUBCQEMAQ0BDgEPAQ4BDQELAQgBBAEBDAABCQYPAQUIAAECAQkBDgsPAQ4BCAEBCgABCQYPAQUHAAEFAQ4PDwEOAQUJAAEJBg8BBQYAAQcTDwEICAABCQYPAQUFAAEGFQ8BBwcAAQkGDwEFBAABAggPAQoBBQEBAQABAQEEAQoIDwEEBgABCQYPAQUEAAELBw8BBQcAAQUHDwEMBgABCQYPAQUDAAEEBw8BBgkAAQYHDwEEBQABCQYPAQUDAAEJBg8BDAsAAQwGDwEJBQABCQYPAQUDAAEOBg8BBgsAAQYGDwENBQABCQYPAQUCAAECBw8BAgsAAQIHDwECBAABCRAPAQ4NAAEOBg8BBAQAAQkQDwENDQABDQYPAQUEAAEJEA8BDQ0AAQwGDwEGBAABCRAPAQ0NAAENBg8BBQQAAQkQDwEODQABDgYPAQQEAAEJBg8BBQIAAQIHDwECCwABAgcPAQIEAAEJBg8BBQMAAQ4GDwEGCwABBgYPAQ0FAAEJBg8BBQMAAQkGDwEMCwABDAYPAQoFAAEJBg8BBQMAAQQHDwEGCQABBQcPAQQFAAEJBg8BBQQAAQsHDwEFBwABBAcPAQwGAAEJBg8BBQQAAQIIDwEKAQQBAQEAAQEBBAEKCA8BBAYAAQkGDwEFBQABBhUPAQcHAAEJBg8BBQYAAQcTDwEICAABCQYPAQUHAAEFAQ4PDwEOAQUJAAEJBg8BBQgAAQIBCQEOCw8BDgEIAQEKAAEJBg8BBQoAAQEBBQEJAQwBDQEOAQ8BDgENAQwBCAEFAQEJAA=="],"Я":[28,0,8,28,27,"CAABAwEIAQsBDQEODA8BAQgAAQMBDBEPAQEHAAEFEw8BAQYAAQIUDwEBBgABCgYPAQ4BBgECBAABDQYPAQEFAAEBBw8BAwYAAQ0GDwEBBQABAwYPAQwHAAENBg8BAQUAAQUGDwEKBwABDQYPAQEFAAEFBg8BCQcAAQ0GDwEBBQABAwYPAQoHAAENBg8BAQYAAQ4FDwENBwABDQYPAQEGAAEGBg8BBAYAAQ0GDwEBBwABCQUPAQ4BBgECBAABDQYPAQEIAAEJEg8BAQkAAQYRDwEBCgABAxAPAQEKAAEHEA8BAQkAAQIBDgYPAQcCAAENBg8BAQkAAQoGDwENAwABDQYPAQEIAAEEBw8BBAMAAQ0GDwEBCAABDAYPAQoEAAENBg8BAQcAAQYGDwEOAQIEAAENBg8BAQYAAQEBDgYPAQcFAAENBg8BAQYAAQkGDwENBgABDQYPAQEFAAEDBw8BBAYAAQ0GDwEBBQABCwYPAQoHAAENBg8BAQQAAQUGDwEOAQIHAAENBg8BAQIA"],"а":[25,0,15,25,20,"BAABAwEGAQgBCwEMAg4BDwIOAQwBCgEHAQIKAAEKDg8BCgECCAABCg8PAQ4BAgcAAQoQDwENBwABCgEPAQ4BCQEFAQIBAQEAAQEBAgEFAQwGDwEGBgABCAEGCgABDAUPAQoSAAEIBQ8BDggAAQIBBgEKAQwCDgsPBgABAQEJEQ8BAQQAAQEBDRIPAQEEAAEKEw8BAQMAAQEGDwEOAQgBAwEBAwABBwYPAQEDAAEEBg8BBgYAAQgGDwEBAwABBgYPAQIGAAENBg8BAQMAAQUGDwEFBQABCAcPAQEDAAECBg8BDgEGAQEBAAEDAQoIDwEBBAABCwwPAQoGDwEBBAABAgEOCg8BBgEHBg8BAQUAAQMBDQcPAQ4BBgEAAQcGDwEBBgABAQEGAQsBDgEPAQ4BDAEHAQICAAEHBg8BAQIA"],"б":[26,0,6,26,29,"EgABAQECDwABAgEEAQYBBwEJAQoBDAENAQ4CDwEFCwABBAELAQ4LDwEKCgABCQ8PAQEIAAEJEA8BBgcAAQUJDwEOAQ0BDAEKAQgBBwEFAQMIAAENBQ8BCgEGAQMBAQ8AAQYEDwENAQMTAAEMBA8BAxMAAQEEDwELAQABBAEJAQwCDgEPAQ4BDAEJAQYBAQgAAQQEDwEMAQ0KDwEOAQkBAQYAAQUSDwENAQMFAAEGEw8BDgECBAABBhQPAQwEAAEECA8BCwEEAQEBAAEDAQkHDwEFAwABAgcPAQsGAAEIBg8BCwMAAQEHDwEDBwABDgUPAQ4DAAEBBg8BDQgAAQoGDwECAwAGDwEMCAABCAYPAQMDAAYPAQwIAAEIBg8BAwMAAQ0FDwENCAABCgYPAQIDAAEMBg8BAwcAAQ4FDwEOBAABCAYPAQsGAAEHBg8BCwQAAQIHDwELAQQBAQEAAQMBCQcPAQUFAAEJEg8BDAYAAQEBDBAPAQ4BAgcAAQIBDA4PAQ0BAwoAAQcBDgoPAQ4BCQEBDQABBQEJAQwBDQEOAQ8BDgENAQoBBgEBBwA="],"в":[23,0,15,23,20,"AwABDQkPAg4BDAEJAQUIAAENDg8BDQEEBgABDQ8PAQ4BAgUAAQ0QDwEJBQABDRAPAQwFAAENBQ8BCQMAAQEBBwUPAQ0FAAENBQ8BCQMAAQEBBwUPAQsFAAENEA8BBAUAAQ0ODwEOAQYGAAENDg8BCQEBBgABDQ8PAQ4BAwUAAQ0QDwEOAQEEAAENBQ8BCQMAAQEBAwEMBQ8BBwQAAQ0FDwEJBQABBQUPAQoEAAENBQ8BCQMAAQEBAwEMBQ8BCwQAAQ0RDwEKBAABDREPAQUEAAENEA8BCwUAAQ0PDwEKAQEFAAENCg8BDgENAQsBCAEDBAA="],"г":[19,0,15,19,20,"AwABDQ4PAQcDAAENDg8BBwMAAQ0ODwEHAwABDQ4PAQcDAAENDg8BBwMAAQ0FDwEJDAABDQUPAQkMAAENBQ8BCQwAAQ0FDwEJDAABDQUPAQkMAAENBQ8BCQwAAQ0FDwEJDAABDQUPAQkMAAENBQ8BCQwAAQ0FDwEJDAABDQUPAQkMAAENBQ8BCQwAAQ0FDwEJDAABDQUPAQkMAAENBQ8BCQkA"],"д":[30,0,15,30,25,"BgABAREPAQcLAAEBEQ8BBwsAAQERDwEHCwABAREPAQcLAAEBEQ8BBwsAAQEGDwEGBAAGDwEHCwABAgYPAQYEAAYPAQcLAAECBg8BBQQABg8BBwsAAQMGDwEFBAAGDwEHCwABBQYPAQMEAAYPAQcLAAEHBg8BAQQABg8BBwsAAQsFDwEOBQAGDwEHCgABAgYPAQsFAAYPAQcKAAELBg8BBwUABg8BBwgAAQIBCwcPAQIFAAYPAQcHAAEOGA8BDAQAAQ4YDwEMBAABDhgPAQwEAAEOGA8BDAQAAQ4YDwEMBAABDgMPAQsQAAEMAw8BDAQAAQ4DDwELEAABDAMPAQwEAAEOAw8BCxAAAQwDDwEMBAABDgMPAQsQAAEMAw8BDAQAAQ4DDwELEAABDAMPAQwCAA=="],"е":[25,0,15,25,20,"BwABAQEGAQoBDQEOAQ8BDgENAQsBBwECDAABAQEJCw8BCQEBCQABBAEODQ8BDQEDBwABAwEODw8BDgECBQABAQENBg8BCAECAQABAQEGAQ4FDwEMBQABBwYPAQUFAAECAQ4FDwEFBAABDQUPAQsHAAEJBQ8BCwMAAQIGDwEGBwABBgYPAQECAAEEFQ8BAwIAAQUVDwEEAgABBhUPAQUCAAEEFQ8BBQIAAQIGDwEEEgABDQUPAQkSAAEHBg8BBQoAAQQBCgEFBAABAQENBg8BCgEEAQEBAAEBAQIBBAEGAQoBDgIPAQUFAAEDAQ4RDwEFBgABBAENEA8BBQcAAQEBCQEODg8BBQkAAQEBBgEJAQwBDQEOAQ8BDgENAQwBCwEJAQcBBQECAwA="],"ж":[37,0,15,37,20,"AQABBAEOBQ8BDAEBBQABDAUPAQoFAAECAQ0FDwENAQIDAAEEAQ4FDwEMAQEEAAEMBQ8BCgQAAQMBDgUPAQ0BAgUAAQMBDgUPAQwBAQMAAQwFDwEKAwABAwEOBQ8BDQECBwABAwEOBQ8BDAEBAgABDAUPAQoCAAEDAQ4FDwENAQEJAAECAQ4FDwENAQEBAAEMBQ8BCgEAAQQBDgUPAQwBAQsAAQIBDQUPAQ0BAgEMBQ8BCgEEAQ4FDwEMAQENAAECAQ0FDwENAQ4FDwENBg8BCwEBDwABAgENEQ8BCwEBEQABCREPAQYRAAEFEw8BAw8AAQMBDhMPAQ0BAQ0AAQEBDQUPAQ4PDwELDQABCgUPAQ0BAQEKBw8BCAEEBg8BBwsAAQcGDwEDAgABDQUPAQsCAAEHBg8BBAkAAQMGDwEGAwABDAUPAQoDAAEKBQ8BDgECBwABAQENBQ8BCgQAAQwFDwEKAwABAQENBQ8BDAcAAQsFDwENAQEEAAEMBQ8BCgQAAQIBDgUPAQkFAAEIBQ8BDgEDBQABDAUPAQoFAAEFBg8BBQMAAQUGDwEGBgABDAUPAQoGAAEJBQ8BDgECAQABAgEOBQ8BCQcAAQwFDwEKBwABDAUPAQ0BAQ=="],"з":[22,0,15,22,20,"AgABBAgPAQ4BDQELAQgBAwgAAQQNDwEMAQIGAAEEDg8BDQEBBQABBA8PAQYFAAEEAQsBBgEDAQIBAQIAAQIBBQEMBQ8BCQ8AAQUFDwEIDAABAQECAQYBDQUPAQUIAAEMCw8BDAkAAQwJDwEOAQgKAAEMCQ8BCAECCgABDAsPAQcJAAEMDA8BBgwAAQEBAwEGAQwFDwENEAABDQUPAQIDAAEDAQoBAwkAAQ0FDwECAwABAwIPAQ0BBwEEAQEBAAEBAQIBBgEMBQ8BDgQAAQMQDwEJBAABAw8PAQ0BAQQAAQMODwEJAQEGAAECAQYBCQEMAQ0BDgIPAQ4BDQEMAQkBBgEBBgA="],"и":[26,0,15,26,20,"AwABDQUPAQkFAAEDBg8BDAYAAQ0FDwEJBQABDAYPAQwGAAENBQ8BCQQAAQcHDwEMBgABDQUPAQkDAAECAQ4HDwEMBgABDQUPAQkDAAEKCA8BDAYAAQ0FDwEJAgABBAkPAQwGAAENBQ8BCQIAAQ0JDwEMBgABDQUPAQkBAAEICg8BDAYAAQ0FDwEJAQILDwEMBgABDQUPAQkBCwUPAQ0FDwEMBgABDQUPAQ0FDwIKBQ8BDAYAAQ0KDwEOAQEBCgUPAQwGAAENCg8BBgEAAQoFDwEMBgABDQkPAQwCAAEKBQ8BDAYAAQ0JDwEDAgABCgUPAQwGAAENCA8BCQMAAQoFDwEMBgABDQcPAQ4BAQMAAQoFDwEMBgABDQcPAQUEAAEKBQ8BDAYAAQ0GDwELBQABCgUPAQwGAAENBg8BAgUAAQoFDwEMAwA="],"й":[26,0,7,26,28,"BgABAQIPAQsGAAEMAg8OAAEMAg8BCQEDAgEBAwEKAg8BDA4AAQYKDwEFDwABCQgPAQgRAAEEAQoBDQIPAQ0BCgEEWgABDQUPAQkFAAEDBg8BDAYAAQ0FDwEJBQABDAYPAQwGAAENBQ8BCQQAAQcHDwEMBgABDQUPAQkDAAECAQ4HDwEMBgABDQUPAQkDAAEKCA8BDAYAAQ0FDwEJAgABBAkPAQwGAAENBQ8BCQIAAQ0JDwEMBgABDQUPAQkBAAEICg8BDAYAAQ0FDwEJAQILDwEMBgABDQUPAQkBCwUPAQ0FDwEMBgABDQUPAQ0FDwIKBQ8BDAYAAQ0KDwEOAQEBCgUPAQwGAAENCg8BBgEAAQoFDwEMBgABDQkPAQwCAAEKBQ8BDAYAAQ0JDwEDAgABCgUPAQwGAAENCA8BCQMAAQoFDwEMBgABDQcPAQ4BAQMAAQoFDwEMBgABDQcPAQUEAAEKBQ8BDAYAAQ0GDwELBQABCgUPAQwGAAENBg8BAgUAAQoFDwEMAwA="],"к":[25,0,15,25,20,"AwABDQUPAQkFAAEBAQsGDwEFBAABDQUPAQkEAAEBAQsGDwEEBQABDQUPAQkDAAEBAQwFDwEOAQQGAAENBQ8BCQIAAQIBDQUPAQ4BAwcAAQ0FDwEJAQABAgENBQ8BDgEDCAABDQUPAQkBAwEOBQ8BDQECCQABDQUPAQsBDgUPAQ0BAgoAAQ0LDwEMAQELAAENCw8BCAwAAQ0MDwEFCwABDQwPAQ4BAgoAAQ0HDwEOBQ8BDQEBCQABDQYPAQkBAgEOBQ8BCgkAAQ0FDwEKAgABAwYPAQcIAAENBQ8BCQMAAQYGDwEEBwABDQUPAQkEAAEKBQ8BDgECBgABDQUPAQkEAAEBAQwFDwEMBgABDQUPAQkFAAECAQ4FDwEJBQABDQUPAQkGAAEEBg8BBgQAAQ0FDwEJBwABCAYPAQM="],"л":[27,0,15,27,20,"BgABCBEPCQABCBEPCQABCBEPCQABCBEPCQABCBEPCQABCAYPBAABBwYPCQABCAUPAQ4EAAEHBg8JAAEIBQ8BDgQAAQcGDwkAAQkFDwEOBAABBwYPCQABCgUPAQ0EAAEHBg8JAAELBQ8BDAQAAQcGDwkAAQ0FDwEKBAABBwYPCAABAgYPAQgEAAEHBg8HAAEBAQwGDwEGBAABBwYPBQABAgEGAQ0HDwECBAABBwYPBQABDggPAQoFAAEHBg8FAAEOBw8BDgECBQABBwYPBQABDgYPAQ0BAwYAAQcGDwUAAQ4FDwEJAQEHAAEHBg8FAAIOAQ0BCgEGAQEJAAEHBg8DAA=="],"м":[30,0,15,30,20,"AwABDQYPAQwIAAEJBw8BAgUAAQ0HDwEDBgABAQEOBw8BAgUAAQ0HDwEKBgABBwgPAQIFAAENCA8BAgUAAQ4IDwECBQABDQgPAQkEAAEGCQ8BAgUAAQ0JDwEBAwABDQkPAQIFAAENCQ8BCAIAAQUKDwECBQABDQkPAQ4BAQEAAQwKDwECBQABDQoPAQcBAwsPAQIFAAENBQ8BCgEOAw8BDQEKBA8BCQYPAQIFAAENBQ8BCQEICA8BDAEFBg8BAgUAAQ0FDwEJAQIIDwIFBg8BAgUAAQ0FDwEJAQABCQYPAQ0BAAEFBg8BAgUAAQ0FDwEJAQABAgYPAQYBAAEFBg8BAgUAAQ0FDwEJAgABCgQPAQ4CAAEFBg8BAgUAAQ0FDwEJAgABAwQPAQcCAAEFBg8BAgUAAQ0FDwEJCgABBQYPAQIFAAENBQ8BCQoAAQUGDwECBQABDQUPAQkKAAEFBg8BAgUAAQ0FDwEJCgABBQYPAQICAA=="],"н":[26,0,15,26,20,"AwABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwYAAQ0FDwEJBgAGDwEHBgABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwYAAQ0FDwEJBgAGDwEHBgABDQUPAQkGAAYPAQcGAAENEg8BBwYAAQ0SDwEHBgABDRIPAQcGAAENEg8BBwYAAQ0SDwEHBgABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwYAAQ0FDwEJBgAGDwEHBgABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwYAAQ0FDwEJBgAGDwEHBgABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwMA"],"о":[25,0,15,25,20,"BwABAgEGAQoBDQEOAQ8BDgENAQsBCAEEDAABAgEKCw8BDQEFCQABBAEODg8BCQcAAQQRDwEJBQABAQEOEg8BBgQAAQcHDwEIAQIBAAEBAQUBDQYPAQ0EAAENBg8BBQUAAQEBDQYPAQQCAAECBg8BCwcAAQUGDwEIAgABBAYPAQcHAAEBBg8BCwIAAQUGDwEFCAABDgUPAQwCAAEGBg8BBQgAAQ4FDwEMAgABBAYPAQcHAAEBBg8BCwIAAQIGDwELBwABBQYPAQgDAAENBg8BBQUAAQEBDQYPAQQDAAEHBw8BCAECAQABAQEFAQwGDwENBAABAQEOEg8BBgUAAQQRDwEJBwABBAEODg8BCQkAAQIBCgsPAQ0BBQwAAQIBBwEKAQ0BDgEPAQ4BDQELAQgBBAcA"],"п":[26,0,15,26,20,"AwABDRIPAQcGAAENEg8BBwYAAQ0SDwEHBgABDRIPAQcGAAENEg8BBwYAAQ0FDwEJBgAGDwEHBgABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwYAAQ0FDwEJBgAGDwEHBgABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwYAAQ0FDwEJBgAGDwEHBgABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwYAAQ0FDwEJBgAGDwEHBgABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwYAAQ0FDwEJBgAGDwEHBgABDQUPAQkGAAYPAQcGAAENBQ8BCQYABg8BBwMA"],"р":[26,0,15,26,28,"AwABDQUPAQkCAAEDAQgBDAEOAQ8BDQEKAQUJAAENBQ8BCQEBAQoIDwEMAQIHAAENBQ8BCgEMCg8BDgEDBgABDRIPAQ0BAQUAAQ0TDwEIBQABDQcPAQoBAwEAAQEBBAEMBg8BDgEBBAABDQYPAQkGAAEMBg8BBQQAAQ0FDwEOAQEGAAEEBg8BCQQAAQ0FDwELCAAGDwELBAABDQUPAQkIAAENBQ8BDAQAAQ0FDwEJCAABDQUPAQwEAAENBQ8BCwgABg8BCwQAAQ0FDwEOAQEGAAEEBg8BCQQAAQ0GDwEIBgABDAYPAQUEAAENBw8BCQEDAQABAQEEAQwGDwEOAQEEAAENEw8BCAUAAQ0SDwENAQEFAAENBQ8BCgEMCg8BDgEDBgABDQUPAQkBAQEKCA8BDAECBwABDQUPAQkCAAEDAQkBDAEOAQ8BDQEKAQUJAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEwABDQUPAQkTAAENBQ8BCRMAAQ0FDwEJEAA="],"с":[22,0,15,22,20,"BwABAQEFAQkBDAENAQ4BDwENAQsBBwEBCQABAQEIAQ4KDwEIAQEGAAEDAQ0NDwEHBQABAwEODg8BBwUAAQ0PDwEHBAABBwcPAQ0BBgECAgEBAgEGAQwBDwEHBAABDQYPAQoIAAEFAQYDAAECBg8BDQEBDQABBAYPAQgOAAEFBg8BBg4AAQUGDwEGDgABBAYPAQgOAAECBg8BDQ8AAQ0GDwEKCAABBQEGBAABBwcPAQ0BBgECAQABAQECAQYBDAEPAQcFAAENDw8BBwUAAQMBDg4PAQcGAAEDAQ0NDwEHBwABAQEIAQ4KDwEIAQEJAAEBAQUBCQEMAQ0BDgEPAQ0BCwEHAQEEAA=="],"т":[21,0,15,22,20,"AQ0UDwEEAQ0UDwEEAQ0UDwEEAQ0UDwEEAQ0UDwEEBwABCAUPAQ4PAAEIBQ8BDg8AAQgFDwEODwABCAUPAQ4PAAEIBQ8BDg8AAQgFDwEODwABCAUPAQ4PAAEIBQ8BDg8AAQgFDwEODwABCAUPAQ4PAAEIBQ8BDg8AAQgFDwEODwABCAUPAQ4PAAEIBQ8BDg8AAQgFDwEOCAA="],"у":[24,0,15,24,28,"AQUGDwECCAABAwYPAQQBAAENBQ8BCAgAAQgFDwENAgABBwUPAQ4IAAENBQ8BBwIAAQEBDgUPAQUGAAEDBg8BAgMAAQkFDwELBgABCAUPAQsEAAEDBg8BAgUAAQ0FDwEFBQABCwUPAQgEAAEDBQ8BDgYAAQUFDwEOBAABCQUPAQkHAAENBQ8BBQMAAQ4FDwEDBwABBwUPAQsCAAEEBQ8BDAgAAQEBDgUPAQIBAAEJBQ8BBgkAAQkFDwEIAQABDgUPAQEJAAECBQ8BDgEEBQ8BCgsAAQsFDwENBQ8BBAsAAQQKDwENDQABDQkPAQcNAAEGCQ8BAg0AAQEBDgcPAQsPAAEIBw8BBQ8AAQIGDwEOEQABCwUPAQkRAAELBQ8BAxAAAQMFDwEMDwABAQEEAQ0FDwEFDAABBAkPAQwNAAEECA8BDgECDQABBAcPAQ4BBA4AAQQEDwEOAQwBBwEBDAA="],"ф":[37,0,7,37,36,"DwABDQUPAQkeAAENBQ8BCR4AAQ0FDwEJHgABDQUPAQkeAAENBQ8BCR4AAQ0FDwEJHgABDQUPAQkeAAENBQ8BCRYAAQYBCwENAQ8BDgEMAQkBAwENBQ8BCQEFAQoBDQIOAQ0BCQEEDAABAwENFw8BCwEBCQABBAEOGQ8BDQEBBwABAgEOGw8BCwcAAQodDwEGBQABAgcPAQoBAgEAAQMBCgcPAQcBAgEAAQMBDAYPAQ0FAAEHBg8BCgUAAQ0FDwEJBAABAQENBg8BAwQAAQsGDwECBQABDQUPAQkFAAEGBg8BBgQAAQ0FDwENBgABDQUPAQkFAAECBg8BCAQAAQ4FDwELBgABDQUPAQkFAAEBBg8BCgQAAQ4FDwELBgABDQUPAQkFAAEBBg8BCgQAAQ0FDwENBgABDQUPAQkFAAECBg8BCAQAAQsGDwECBQABDQUPAQkFAAEGBg8BBgQAAQcGDwEKBQABDQUPAQkEAAEBAQ0GDwEDBAABAgcPAQoBAgEAAQMBCgcPAQcBAgEAAQMBDAYPAQ0GAAEKHQ8BBgYAAQIBDhsPAQsIAAEEAQ4ZDwENAQIJAAEDAQ0XDwELAQEMAAEGAQsBDQEPAQ4BDAEJAQMBDQUPAQkBBQEKAQ0CDgENAQoBBBYAAQ0FDwEJHgABDQUPAQkeAAENBQ8BCR4AAQ0FDwEJHgABDQUPAQkeAAENBQ8BCR4AAQ0FDwEJHgABDQUPAQkPAA=="],"х":[24,0,15,24,20,"AQABCwUPAQ4BAgYAAQQGDwEIAgABAQENBQ8BDAUAAQEBDQUPAQwEAAEDBg8BCAQAAQoFDwEOAQIFAAEHBg8BAwIAAQYGDwEFBwABCwUPAQ0BAQECAQ4FDwEICAABAQENBQ8BCQEMBQ8BDAoAAQQLDwEOAQILAAEHCg8BBQ0AAQsIDwEIDgABAQEOBg8BDQ8AAQUIDwEDDQABAgEOCA8BDQEBDAABDAoPAQsLAAEJBQ8BDgYPAQcJAAEFBg8BBQEHBg8BAwcAAQIBDgUPAQkCAAELBQ8BDQEBBgABDAUPAQ0BAQIAAQIBDgUPAQoFAAEJBg8BAwQAAQUGDwEHAwABBQYPAQcGAAEJBg8BAwEAAQIBDgUPAQsHAAEBAQ0FDwENAQE="],"ц":[27,0,15,27,25,"AwABDQUPAQkGAAYPAQcHAAENBQ8BCQYABg8BBwcAAQ0FDwEJBgAGDwEHBwABDQUPAQkGAAYPAQcHAAENBQ8BCQYABg8BBwcAAQ0FDwEJBgAGDwEHBwABDQUPAQkGAAYPAQcHAAENBQ8BCQYABg8BBwcAAQ0FDwEJBgAGDwEHBwABDQUPAQkGAAYPAQcHAAENBQ8BCQYABg8BBwcAAQ0FDwEJBgAGDwEHBwABDQUPAQkGAAYPAQcHAAENBQ8BCQYABg8BBwcAAQ0FDwEJBgAGDwEHBwABDRUPAQwEAAENFQ8BDAQAAQ0VDwEMBAABDRUPAQwEAAENFQ8BDBYAAQwDDwEMFgABDAMPAQwWAAEMAw8BDBYAAQwDDwEMFgABDAMPAQwBAA=="],"ч":[25,0,15,25,20,"AgABCQUPAQ0FAAEEBg8BAwUAAQkFDwENBQABBAYPAQMFAAEJBQ8BDQUAAQQGDwEDBQABCQUPAQ0FAAEEBg8BAwUAAQkFDwENBQABBAYPAQMFAAEJBQ8BDgUAAQQGDwEDBQABCQYPAQIEAAEEBg8BAwUAAQgGDwEKAQIDAAEEBg8BAwUAAQYSDwEDBQABAhIPAQMGAAEKEQ8BAwYAAQEBDBAPAQMHAAEBAQcBDAEODQ8BAxEAAQQGDwEDEQABBAYPAQMRAAEEBg8BAxEAAQQGDwEDEQABBAYPAQMRAAEEBg8BAxEAAQQGDwEDAwA="],"ш":[39,0,15,39,20,"AwABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDQUPAQkGAAELBQ8BDAYAAQgFDwEOBgABDR8PAQ4GAAENHw8BDgYAAQ0fDwEOBgABDR8PAQ4GAAENHw8BDgMA"],"щ":[41,0,15,41,25,"AwABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDQUPAQkGAAELBQ8BDAYAAQgFDwEOCAABDSMPAQUEAAENIw8BBQQAAQ0jDwEFBAABDSMPAQUEAAENIw8BBSMAAQUEDwEFIwABBQQPAQUjAAEFBA8BBSMAAQUEDwEFIwABBQQPAQUBAA=="],"ъ":[28,0,14,28,21,"AQENBA4AAQQNDwECDQABBA0PAQINAAEEDQ8BAg0AAQMGDAENBg8BAhQAAQUGDwECFAABBQYPAQIUAAEFBg8BAhQAAQUGDwEJBAgBBwEFAQINAAEFDg8BDAEGCwABBRAPAQoKAAEFEQ8BCAkAAQUGDwEIAwcBCQEOBQ8BDgkAAQUGDwECBAABAgEOBQ8BAwgAAQUGDwECBQABDAUPAQQIAAEFBg8BAgUAAQ0FDwEECAABBQYPAQIDAQEDAQoGDwECCAABBREPAQwJAAEFEA8BDgEDCQABBQ8PAQwBAwoAAQULDwEOAQwBCQEEBQA="],"ы":[33,0,15,33,20,"AwABDQUPAQkOAAYPAQcFAAENBQ8BCQ4ABg8BBwUAAQ0FDwEJDgAGDwEHBQABDQUPAQkOAAYPAQcFAAENBQ8BCQ4ABg8BBwUAAQ0FDwEJDgAGDwEHBQABDQUPAQkOAAYPAQcFAAENCg8BDgENAQoBBgEBBQAGDwEHBQABDQ4PAQ4BBwQABg8BBwUAAQ0QDwEHAwAGDwEHBQABDREPAQICAAYPAQcFAAENEQ8BBwIABg8BBwUAAQ0FDwEJAwABAQEDAQwFDwEKAgAGDwEHBQABDQUPAQkFAAEFBQ8BCwIABg8BBwUAAQ0FDwEJAwABAQEDAQwFDwEKAgAGDwEHBQABDREPAQgCAAYPAQcFAAENEQ8BAgIABg8BBwUAAQ0QDwEIAwAGDwEHBQABDQ4PAQ4BBwQABg8BBwUAAQ0KDwEOAQ0BCgEGAQEFAAYPAQcCAA=="],"ь":[23,0,15,23,20,"AwABDQUPAQkQAAENBQ8BCRAAAQ0FDwEJEAABDQUPAQkQAAENBQ8BCRAAAQ0FDwEJEAABDQUPAQkQAAENCg8BDgENAQoBBgEBBwABDQ4PAQ4BBwYAAQ0QDwEHBQABDREPAQIEAAENEQ8BBwQAAQ0FDwEJAwABAQEDAQwFDwEKBAABDQUPAQkFAAEFBQ8BCwQAAQ0FDwEJAwABAQEDAQwFDwEKBAABDREPAQgEAAENEQ8BAgQAAQ0QDwEIBQABDQ4PAQ4BBwYAAQ0KDwEOAQ0BCgEGAQEEAA=="],"э":[22,0,14,22,22,"BAABAwEGAQgBCgELAQoBCQEHAQQBAQoAAQYBDgoPAQkBAggAAQgNDwEHBwABCA4PAQkGAAEIBA8CDgkPAQcFAAEIAQ4BCQEEAQECAAEBAQYBDQYPAQ4BAgQAAQQBAgcAAQEBDQYPAQgOAAEDBg8BDQ8AAQsGDwECBQABAg8PAQMFAAECDw8BBQUAAQIPDwEEBQABAggKAQ0GDwEDDgABDAYPAQENAAEFBg8BDAQAAQYBAwcAAQMBDgYPAQcEAAEIAQ8BCwEGAQMCAgEEAQkHDwEOAQEEAAEIDw8BBQUAAQgODwEGBgABCAwPAQ4BBAcAAQQBCwkPAQwBBgEBCgABAQEDAQYBBwEIAQcBBgEEAQEJAA=="],"ю":[36,0,15,36,20,"AwABDQUPAQkIAAEFAQkBDAENAQ4BDwEOAQ0BCgEGAQEKAAENBQ8BCQYAAQYBDgsPAQkBAQgAAQ0FDwEJBAABAQELDg8BDgEEBwABDQUPAQkEAAELEA8BDgEDBgABDQUPAQkDAAEHEg8BDQYAAQ0FDwEJAgABAQEOBg8BDAEEAQEBAAECAQgHDwEGBQABDQUPAQkCAAEGBg8BDAEBBQABBgYPAQwFAAENBQ8BCQIAAQoGDwEEBwABDQYPAQEEAAENBw8BDgYPAQ4IAAEIBg8BAwQAAQ0ODwENCAABBwYPAQQEAAENDg8BDQgAAQcGDwEEBAABDQUPAQ4CDQYPAQ4IAAEIBg8BAwQAAQ0FDwEJAgABCgYPAQQHAAENBg8BAQQAAQ0FDwEJAgABBgYPAQwGAAEGBg8BDAUAAQ0FDwEJAgABAQEOBg8BDAEEAQEBAAECAQgHDwEGBQABDQUPAQkDAAEHEg8BDQYAAQ0FDwEJBAABCxAPAQ4BAwYAAQ0FDwEJBQABCw4PAQ4BBAcAAQ0FDwEJBgABBgEOCw8BCQEBCAABDQUPAQkIAAEFAQkBDAENAQ4BDwEOAQ0BCgEGAQEHAA=="],"я":[24,0,15,24,20,"BQABAgEHAQsBDQEOCg8BCwcAAQgPDwELBgABBxAPAQsFAAEBAQ4QDwELBQABBBEPAQsFAAEFBg8BBwECAwABDAUPAQsFAAEEBQ8BDQUAAQwFDwELBQABAQYPAQcBAgMAAQwFDwELBgABCRAPAQsGAAEBAQwPDwELBwABAQEMDg8BCwkAAQwNDwELCAABAw4PAQsIAAEMBQ8BCQIAAQwFDwELBwABBwUPAQ4BAQIAAQwFDwELBgABAgEOBQ8BBQMAAQwFDwELBgABCgUPAQoEAAEMBQ8BCwUAAQUFDwEOAQIEAAEMBQ8BCwQAAQEBDQUPAQYFAAEMBQ8BCwQAAQgFDwELBgABDAUPAQsDAA=="],"Ё":[25,0,1,25,34,"BgABBAMPAQ4CAAEDBA8BAQwAAQQDDwEOAgABAwQPAQEMAAEEAw8BDgIAAQMEDwEBDAABBAMPAQ4CAAEDBA8BAVQAAQkSDwEDBQABCRIPAQMFAAEJEg8BAwUAAQkSDwEDBQABCRIPAQMFAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJEQ8BBwYAAQkRDwEHBgABCREPAQcGAAEJEQ8BBwYAAQkRDwEHBgABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCQYPAQURAAEJBg8BBREAAQkGDwEFEQABCRIPAQgFAAEJEg8BCAUAAQkSDwEIBQABCRIPAQgFAAEJEg8BCAIA"],"ё":[25,0,6,25,29,"BwABDQMPAQYCAAELAw8BCA0AAQ0DDwEGAgABCwMPAQgNAAENAw8BBgIAAQsDDwEIDQABDQMPAQYCAAELAw8BCIoAAQEBBgEKAQ0BDgEPAQ4BDQELAQcBAgwAAQEBCQsPAQkBAQkAAQQBDg0PAQ0BAwcAAQMBDg8PAQ4BAgUAAQEBDQYPAQgBAgEAAQEBBgEOBQ8BDAUAAQcGDwEFBQABAgEOBQ8BBQQAAQ0FDwELBwABCQUPAQsDAAECBg8BBgcAAQYGDwEBAgABBBUPAQMCAAEFFQ8BBAIAAQYVDwEFAgABBBUPAQUCAAECBg8BBBIAAQ0FDwEJEgABBwYPAQUKAAEEAQoBBQQAAQEBDQYPAQoBBAEBAQABAQECAQQBBgEKAQ4CDwEFBQABAwEOEQ8BBQYAAQQBDRAPAQUHAAEBAQkBDg4PAQUJAAEBAQYBCQEMAQ0BDgEPAQ4BDQEMAQsBCQEHAQUBAgMA"],"·":[14,0,19,14,16,"AwABAwYPAQQGAAEDBg8BBAYAAQMGDwEEBgABAwYPAQQGAAEDBg8BBAYAAQMGDwEEBgABAwYPAQSBAA=="],"×":[31,0,13,31,22,"BgABAQELAQMNAAEDAQsBAQsAAQEBDAEPAQ4BAwsAAQMBDgEPAQwBAQkAAQEBCwMPAQ4BAwkAAQMBDgMPAQsBAQgAAQEBDQQPAQ4BAwcAAQMBDgQPAQ0BAQkAAQIBDQQPAQ4BAwUAAQMBDgQPAQ0BAgsAAQIBDQQPAQ4BAwMAAQMBDgQPAQ0BAg0AAQIBDQQPAQ4BAgEAAQIBDgQPAQ0BAg8AAQIBDQQPAQ4BBQEOBA8BDQECEQABAgENCQ8BDQECEwABAgENBw8BDQECFQABAgENBQ8BDQECFgABAgENBQ8BDQECFQABAgENBw8BDQECEwABAgENCQ8BDQECEQABAgENBA8BDgEFAQ4EDwENAQIPAAECAQ0EDwEOAQMBAAEDAQ4EDwENAQINAAECAQ0EDwEOAQMDAAEDAQ4EDwENAQILAAECAQ0EDwEOAQMFAAEDAQ4EDwENAQIJAAEBAQ0EDwEOAQMHAAEDAQ4EDwENAQEIAAEBAQsDDwEOAQMJAAEDAQ4DDwELAQEJAAEBAQwBDwEOAQMLAAEDAQ4BDwEMAQELAAEBAQsBAw0AAQMBCwEBBgA="],"—":[37,0,21,37,14,"AgAhDwQAIQ8EACEPBAAhDwQAIQ//AFAA"],"–":[18,0,21,19,14,"AgAODwEIBAAODwEIBAAODwEIBAAODwEIBAAODwEIrQA="],"№":[45,0,8,45,27,"AwABCQcPAQYLAAECAQcBCgEMAQ0BDgEKEgABCQcPAQ4BAQkAAQgGDwELEgABCQgPAQcIAAEEBw8BCxIAAQkIDwEOAQEHAAEKBw8BCxIAAQkJDwEIBwABDgUPAQ0BAxMAAQkJDwEOAQIGAAYPAQkUAAEJCg8BCQYABg8BCBQAAQkLDwECBQAGDwEIBwABAgIEAQIJAAEJBg8BDgQPAQoFAAYPAQgFAAEEAQwEDwEMAQMHAAEJBg8BBwUPAQMEAAYPAQgEAAEEBw8BDgEDBgABCQYPAQEBDgQPAQsEAAYPAQgDAAEBAQ4CDwEOAQgBCQMPAQ0GAAEJBg8BAAEGBQ8BBAMABg8BCAMAAQYDDwEFAgABCAMPAQQFAAEJBg8CAAENBA8BDAMABg8BCAMAAQoCDwEOAwABAgMPAQgFAAEJBg8CAAEFBQ8BBQIABg8BCAMAAQsCDwENBAADDwEKBQABCQYPAwABDAQPAQwCAAYPAQgDAAEMAg8BDAQAAQ4CDwEKBQABCQYPAwABBQUPAQUBAAYPAQgDAAELAg8BDQQAAw8BCQUAAQkGDwQAAQwEDwENAQEGDwEIAwABCAMPAQICAAEEAw8BBwUAAQkGDwQAAQQFDwEHBg8BCAMAAQMDDwEJAgABCwMPAQIFAAEJBg8FAAELBA8BDgYPAQgEAAELAw8BDQEOAw8BCQYAAQkGDwUAAQMLDwEIBAABAQEMBg8BCwEBBgABCQYPBgABCgoPAQgGAAEGAQsCDQEKAQUIAAEKBQ8BDgYAAQIKDwEIEwABAwEOBQ8BDQcAAQkJDwEIEgABCwcPAQoHAAEBAQ4IDwEIAwABBwoJAQYDAAELBw8BBAgAAQgIDwEIAwABDAoPAQsDAAELBg8BCAkAAQEBDgcPAQgDAAEMCg8BCwMAAQsCDgEMAQsBBwECCwABBwcPAQgDAAEMCg8BCwIA"],"…":[37,0,28,37,7,"AgABAQYPAQcFAAELBQ8BCwUAAQcGDwEBBAABAQYPAQcFAAELBQ8BCwUAAQcGDwEBBAABAQYPAQcFAAELBQ8BCwUAAQcGDwEBBAABAQYPAQcFAAELBQ8BCwUAAQcGDwEBBAABAQYPAQcFAAELBQ8BCwUAAQcGDwEBBAABAQYPAQcFAAELBQ8BCwUAAQcGDwEBBAABAQYPAQcFAAELBQ8BCwUAAQcGDwEBAgA="]},"heading":{" ":[19,0,51,19,0,""],"!":[25,0,12,25,39,"BwABBwkPAQEOAAEHCQ8BAQ4AAQcJDwEBDgABBwkPAQEOAAEHCQ8BAQ4AAQcJDwEBDgABBwkPAQEOAAEHCQ8BAQ4AAQcJDwEBDgABBwkPAQEOAAEHCQ8BAQ4AAQcJDwEBDgABBwkPAQEOAAEHCQ8BAQ4AAQcJDwEBDgABBgkPDwABBAgPAQ0PAAECCA8BCxAACA8BChAAAQ0HDwEIEAABDAcPAQYQAAEKBw8BBBAAAQgHDwECEAABBgcPEQABBAYPAQ4RAAECBg8BDHQAAQcJDwEBDgABBwkPAQEOAAEHCQ8BAQ4AAQcJDwEBDgABBwkPAQEOAAEHCQ8BAQ4AAQcJDwEBDgABBwkPAQEOAAEHCQ8BAQcA"],"\"":[28,0,12,28,39,"BQABDQUPAQYEAAEEBg8KAAENBQ8BBgQAAQQGDwoAAQ0FDwEGBAABBAYPCgABDQUPAQYEAAEEBg8KAAENBQ8BBgQAAQQGDwoAAQ0FDwEGBAABBAYPCgABDQUPAQYEAAEEBg8KAAENBQ8BBgQAAQQGDwoAAQ0FDwEGBAABBAYPCgABDQUPAQYEAAEEBg8KAAENBQ8BBgQAAQQGDwoAAQ0FDwEGBAABBAYPCgABDQUPAQYEAAEEBg8KAAENBQ8BBgQAAQQGDwoAAQ0FDwEGBAABBAYP/wD/AKcA"],"#":[45,0,12,45,39,"EgABDgQPAQ0GAAECBQ8BChkAAQQFDwEKBgABBgUPAQcZAAEHBQ8BBgYAAQkFDwEDGQABCwUPAQIGAAENBA8BDhoABQ8BDQYAAQIFDwEKGQABBAUPAQkGAAEGBQ8BBhkAAQgFDwEGBgABCgUPAQMZAAELBQ8BAgYAAQ4EDwEOGQABAQUPAQ0GAAECBQ8BChkAAQQFDwEJBgABBgUPAQYQAAEEIg8BCQkAAQQiDwEJCQABBCIPAQkJAAEEIg8BCQkAAQQiDwEJCQABBCIPAQkRAAEOBA8BDgYAAQIFDwELGQABBAUPAQoGAAEGBQ8BBxkAAQgFDwEGBgABCgUPAQMZAAEMBQ8BAgYAAQ4EDwEOGQABAQUPAQ0GAAEDBQ8BCxkAAQQFDwEJBgABBwUPAQcZAAEIBQ8BBQYAAQsFDwEDEAABBSIPAQgJAAEFIg8BCAkAAQUiDwEICQABBSIPAQgJAAEFIg8BCAkAAQUiDwEIEAABAgUPAQwGAAEEBQ8BCBkAAQUFDwEIBgABCAUPAQUZAAEJBQ8BBAYAAQwFDwEBGQABDQUPAQEFAAEBBQ8BDBkAAQIFDwELBgABBAUPAQgZAAEGBQ8BCAYAAQgFDwEEGQABCQUPAQQGAAEMBQ8BARkAAQ0FDwEBBQABAQUPAQwZAAECBQ8BCwYAAQQFDwEIGQABBgUPAQgGAAEIBQ8BBBEA"],"$":[38,0,10,38,49,"EAABBQQPIQABBQQPIQABBQQPIQABBQQPIQABBQQPIQABBQQPHAABAgEFAQkBCwEMAQ4EDwEOAQ0BDAELAQoBCQEHAQUBBAECEAABBQELFA8BCA0AAQIBCxYPAQgMAAECAQ4XDwEICwABAQENGA8BCAsAAQkZDwEICgABAQkPAQkBBAEGBA8BAQECAQMBBQEHAQoBDQMPAQgKAAEGCA8BBAIAAQUEDwcAAQIBBgEKAQcKAAEJBw8BCwMAAQUEDxUAAQsHDwEJAwABBQQPFQABCwcPAQwDAAEFBA8VAAEKCA8BCAIAAQUEDxUAAQkJDwENAggEDxUAAQUQDwEIAQUBAhIAAQEBDhIPAQ4BCgEGAQEPAAEIFg8BCQECDgABCxcPAQcNAAEBAQoXDwEJDgABBgENFg8BBQ8AAQUBCgEOEw8BDRIAAQMBBwEKAQ0QDwEFFAABBQQPAQwBDgoPAQkUAAEFBA8CAAEEAQ0IDwELFAABBQQPAwABAQEOBw8BDRQAAQUEDwQAAQkHDwENFAABBQQPBAABBwcPAQwIAAEJAQcBAQkAAQUEDwQAAQkHDwELCAABCwIPAQoBBQEBBgABBQQPAwABAgEOBw8BBwgAAQsFDwELAQgBBQEDAQEBAAEFBA8BAAECAQYBDggPAQMIAAELCw8BDg8PAQoJAAELGg8BDgECCQABCxkPAQ4BAwoAAQsYDwELAQILAAEBAQUBCQENEw8BCgEEEQABAQEEAQYBCAEKAQwBDQEOBQ8BDgEMAQoBCAEEAQEbAAEFBA8hAAEFBA8hAAEFBA8hAAEFBA8hAAEFBA8hAAEFBA8hAAEFBA8hAAEFBA8RAA=="],"%":[54,0,11,54,41,"BwABAgEHAQsBDQEOAQ8BDgEMAQkBBRMAAQ0EDwEOAQEQAAEBAQkKDwENAQUQAAEHBQ8BBhAAAQMBDQ0PAQgOAAECAQ4EDwEMEAABAgEODw8BCA0AAQoFDwEDEAABCwYPAQgBAgEBAQQBDAYPAQQLAAEEBQ8BCRAAAQQGDwEHBAABAQEOBQ8BDAsAAQ0EDwEOAQEQAAEKBQ8BDgYAAQcGDwEDCQABBwUPAQYRAAEOBQ8BCgYAAQIGDwEGCAABAgEOBA8BDBEAAQIGDwEHBwABDgUPAQkIAAEKBQ8BAxEAAQMGDwEFBwABDQUPAQsHAAEEBQ8BCRIAAQQGDwEFBwABDAUPAQsHAAENBA8BDgEBEgABAwYPAQUHAAENBQ8BCwYAAQcFDwEGEwABAgYPAQcHAAEOBQ8BCQUAAQIBDgQPAQwVAAEOBQ8BCgYAAQIGDwEGBQABCgUPAQMVAAEKBQ8BDgEBBQABBwYPAQIEAAEEBQ8BCRYAAQQGDwEHBAABAQEOBQ8BCwUAAQ0EDwEOAQEXAAELBg8BCAECAQEBBAEMBg8BBAQAAQcFDwEGGAABAgEODw8BCAQAAQIBDgQPAQwaAAEDAQ0NDwEIBQABCgUPAQMbAAEBAQkKDwENAQUFAAEEBQ8BCR4AAQIBBwELAQ0BDgEPAQ4BDAEJAQUHAAENBA8BDgEBBgABBAEIAQwBDQEPAQ4BDQELAQcBAh4AAQcFDwEGBQABBAEMCg8BCgECGwABAgEOBA8BDAUAAQgNDwEOAQQaAAEKBQ8BAwQAAQcPDwEOAQMYAAEEBQ8BCQQAAQMGDwENAQUCAQEHBg8BDRgAAQ0EDwEOAQEEAAELBQ8BDgECBAABBgYPAQYWAAEHBQ8BBgQAAQIGDwEJBgABDQUPAQwVAAECAQ4EDwEMBQABBgYPAQQGAAEJBg8BARQAAQoFDwEDBQABCQYPAQEGAAEGBg8BAxMAAQQFDwEJBgABCgUPAQ4HAAEEBg8BBRMAAQ0EDwEOAQEGAAELBQ8BDgcAAQQGDwEGEgABBwUPAQYHAAEKBQ8BDgcAAQQGDwEFEQABAgEOBA8BDAgAAQkGDwEBBgABBgYPAQMRAAEKBQ8BAwgAAQYGDwEEBgABCQYPAQEQAAEEBQ8BCQkAAQIGDwEIBgABDQUPAQsRAAENBA8BDgEBCgABCwUPAQ4BAgQAAQYGDwEFEAABBwUPAQYLAAEDBg8BDQEEAgEBBwYPAQwQAAECAQ4EDwEMDQABBw8PAQ4BAhAAAQoFDwEDDgABBw0PAQ4BBBAAAQQFDwEJEAABBAEMCg8BCgECEQABDQQPAQ4BARIAAQQBCAEMAQ4BDwEOAQ0BCwEHAQIHAA=="],"&":[47,0,11,47,41,"DwABAQEGAQkBDAENAQ4BDwEOAQ0BDAEJAQcBAyAAAQIBCg4PAQsBBgEBGwABBwEOEQ8BDBoAAQkTDwEMGQABBhQPAQwYAAEBAQ4UDwEMGAABBgkPAQ0BBgECAgEBAgEFAQkBDQMPAQwYAAEKCA8BDgEBCAABBQELAQ8BDBgAAQwIDwEJCwABBAEJGAABDQgPAQklAAELCA8BDSUAAQgJDwEGJAABAgkPAQ4BAiQAAQkJDwENAQEjAAEBAQ4JDwEMAQEhAAEBAQkLDwELIAABAgENDQ8BCQoAAQMIDwsAAQMBDg8PAQgJAAEFBw8BDQoAAQMBDhEPAQcIAAEGBw8BCwkAAQEBDhMPAQUHAAEJBw8BCQkAAQsJDwEHAQwKDwEEBgABDQcPAQYIAAEECQ8BBQEAAQEBDQkPAQ4BAwQAAQIIDwECCAABDAgPAQkDAAECAQ4JDwEOAQIDAAEIBw8BDggAAQIJDwEBBAABAwEOCQ8BDQECAgABDQcPAQkIAAEGCA8BCgYAAQUKDwEMAQEBBwgPAQQIAAEJCA8BBwcAAQYKDwEMCA8BDQkAAQoIDwEGCAABCBIPAQYJAAELCA8BBwkAAQoQDwENCgABCwgPAQoKAAELDw8BBQoAAQkIDwEOAQEJAAEBAQwNDwEKCwABBwkPAQgKAAECAQ0LDwENAQELAAEDCg8BBQoAAQMLDwEFDQABDQoPAQcIAAECAQsLDwENAQIMAAEGCw8BDQEGAQICAQECAQUBCg4PAQ0BAQwAAQ0hDwEMAQELAAEDAQ4hDwELDAABBCIPAQoMAAEEAQ0UDwEOAQcBCQoPAQgMAAEBAQoSDwEKAQICAAEKCg8BBw0AAQMBCg0PAQ4BCAECBAABAQEMCg8BBg4AAQEBBQEIAQsBDQEOAQ8BDgENAQwBCgEHAQMWAA=="],"'":[17,0,12,17,39,"BQABDQUPAQYKAAENBQ8BBgoAAQ0FDwEGCgABDQUPAQYKAAENBQ8BBgoAAQ0FDwEGCgABDQUPAQYKAAENBQ8BBgoAAQ0FDwEGCgABDQUPAQYKAAENBQ8BBgoAAQ0FDwEGCgABDQUPAQYKAAENBQ8BBgoAAQ0FDwEG/wCeAA=="],"(":[25,0,10,25,48,"DAABCwcPAQIPAAEFBw8BCQ8AAQEBDQcPAQIPAAEIBw8BCQ8AAQEBDgcPAQIPAAEIBw8BCw8AAQEBDgcPAQQPAAEHBw8BDRAAAQ4HDwEIDwABBQgPAQIPAAELBw8BDQ8AAQIIDwEIDwABBwgPAQMPAAELBw8BDg8AAQEIDwELDwABBQgPAQgPAAEICA8BBQ8AAQsIDwECDwABDggPDwABAQgPAQ0PAAECCA8BDA8AAQQIDwEKDwABBAgPAQoPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQoPAAEECA8BCg8AAQMIDwEMDwABAQgPAQ0QAAEOCA8QAAELCA8BAg8AAQgIDwEFDwABBQgPAQcPAAEBCA8BCxAAAQwHDwEOEAABBwgPAQMPAAECCA8BCBAAAQsHDwEMEAABBggPAQIQAAEOBw8BCBAAAQgHDwENEAABAQEOBw8BBBAAAQgHDwEKEAABAQEOBw8BAhAAAQgHDwEJEAABAQENBw8BAhAAAQUHDwEJEQABCwcPAQIEAA=="],")":[25,0,10,25,48,"BAABBgcPAQcRAAENBg8BDgEBEAABBgcPAQkRAAENBw8BAxAAAQcHDwELEAABAQEOBw8BAxAAAQkHDwELEAABAwgPAQMQAAEMBw8BCRAAAQcIDwEBDwABAggPAQYQAAENBw8BDBAAAQgIDwECDwABBAgPAQcPAAEBCA8BCxAAAQwIDxAAAQoIDwEDDwABBwgPAQYPAAEFCA8BCQ8AAQMIDwELDwABAQgPAQ0QAAgPAQ4QAAkPEAABDggPEAABDggPEAAJDxAACA8BDg8AAQEIDwENDwABAwgPAQsPAAEFCA8BCQ8AAQcIDwEGDwABCggPAQMPAAEMCA8PAAEBCA8BCw8AAQQIDwEHDwABCAgPAQIPAAENBw8BDA8AAQIIDwEGDwABBwgPAQEPAAENBw8BCQ8AAQMIDwEDDwABCQcPAQsPAAEBAQ4HDwEDDwABBwcPAQsQAAENBw8BAw8AAQYHDwEJEAABDQYPAQ4BAQ8AAQYHDwEHDAA="],"*":[28,0,11,28,40,"CwABAgQPAQYWAAECBA8BBhYAAQIEDwEGFgABAgQPAQYNAAEDAQsBAwYAAQIEDwEGBgABAgEJAQYEAAELAg8BCgECBAABAgQPAQYEAAEBAQgBDgEPAQ4BAQIAAQMFDwEIAQECAAECBA8BBgMAAQYBDgQPAQcCAAELBg8BDgEGAQABAgQPAQYBAAEEAQwGDwEOAgABAQEJBw8BDQEGBA8BCAELBw8BCwEDBAABAgEJEg8BDAEECAABAwEKDg8BDQEFDAABAwELCg8BDQEGEAABCQgPAQ0BAQ8AAQQBDAoPAQ4BBgwAAQMBCw4PAQ0BBQgAAQIBChIPAQwBBAQAAQEBCQcPAQwBBQQPAQgBCgcPAQsBAwIAAQsGDwEOAQYBAAECBA8BBgEAAQQBDAYPAQ4CAAEEBA8BDgEIAQECAAECBA8BBgMAAQYBDQQPAQcDAAELAg8BCgECBAABAgQPAQYEAAEBAQcBDgEPAQ4BAQMAAQMBCwEDBgABAgQPAQYGAAECAQkBBg0AAQIEDwEGFgABAgQPAQYWAAECBA8BBhYAAQIEDwEG/wCwAA=="],"+":[45,0,17,45,34,"EwABCAUPAQwmAAEIBQ8BDCYAAQgFDwEMJgABCAUPAQwmAAEIBQ8BDCYAAQgFDwEMJgABCAUPAQwmAAEIBQ8BDCYAAQgFDwEMJgABCAUPAQwmAAEIBQ8BDCYAAQgFDwEMJgABCAUPAQwmAAEIBQ8BDBgAAQQhDwEICgABBCEPAQgKAAEEIQ8BCAoAAQQhDwEICgABBCEPAQgKAAEEIQ8BCBgAAQgFDwEMJgABCAUPAQwmAAEIBQ8BDCYAAQgFDwEMJgABCAUPAQwmAAEIBQ8BDCYAAQgFDwEMJgABCAUPAQwmAAEIBQ8BDCYAAQgFDwEMJgABCAUPAQwmAAEIBQ8BDCYAAQgFDwEMJgABCAUPAQwTAA=="],",":[21,0,41,21,18,"BQABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABCQgPAQsLAAENBw8BDgECCgABAggPAQYLAAEGBw8BCwwAAQoGDwEOAQIMAAEOBg8BBwwAAQMGDwEMDQABBwYPAQINAAELBQ8BBw4AAQ4EDwEMDAA="],"-":[22,0,32,22,19,"AgABARAPAQcEAAEBEA8BBwQAAQEQDwEHBAABARAPAQcEAAEBEA8BBwQAAQEQDwEHBAABARAPAQcEAAEBEA8BB/QA"],".":[21,0,41,21,10,"BQABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPBgA="],"/":[20,0,12,20,44,"DQABBAUPAQgNAAEJBQ8BBA0AAQ4EDwEODQABAwUPAQkNAAEIBQ8BBA0AAQ0EDwEODQABAwUPAQoNAAEHBQ8BBQ0AAQwFDwEBDAABAgUPAQsNAAEHBQ8BBg0AAQsFDwEBDAABAQUPAQwNAAEGBQ8BBw0AAQsFDwECDAABAQUPAQwNAAEFBQ8BCA0AAQoFDwEDDQABDgQPAQ0NAAEEBQ8BCA0AAQkFDwEEDQABDgQPAQ4NAAEDBQ8BCQ0AAQgFDwEEDQABDQQPAQ4NAAEDBQ8BCg0AAQcFDwEFDQABDAUPAQEMAAECBQ8BCw0AAQYFDwEGDQABCwUPAQEMAAEBBQ8BDA0AAQYFDwEHDQABCgUPAQIMAAEBAQ4EDwEMDQABBQUPAQgNAAEKBQ8BAw0AAQ4EDwENDQABBAUPAQgNAAEJBQ8BBA0AAQ0EDwEODQABAwUPAQkNAAEIBQ8BBA0AAQ0EDwEODgA="],"0":[38,0,11,38,41,"DQABBAEIAQsBDQEOAg8BDgEMAQoBBgECGAABBwENDA8BCwEDFAABBAENEA8BCgEBEQABBhMPAQ0BAg8AAQcVDwENAQINAAEFFw8BDAEBCwABAQEOGA8BCQsAAQkKDwEIAQMCAQEEAQsKDwEDCQABAgkPAQ4BAwYAAQkJDwEKCQABCQkPAQcIAAENCQ8BAggAAQ4IDwEOCQABBQkPAQgHAAEECQ8BCQkAAQEJDwEMBwABCAkPAQUKAAEMCQ8BAQYAAQwJDwEDCgABCQkPAQUGAAEOCQ8BAQoAAQcJDwEIBQABAgkPAQ4LAAEFCQ8BCgUAAQMJDwENCwABBAkPAQwFAAEFCQ8BDAsAAQMJDwENBQABBgkPAQsLAAEDCQ8BDgUAAQYJDwELCwABAwkPAQ4FAAEGCQ8BCwsAAQIKDwUAAQYJDwELCwABAwkPAQ4FAAEGCQ8BDAsAAQMJDwEOBQABBQkPAQwLAAEDCQ8BDQUAAQMJDwENCwABBAkPAQwFAAECCQ8BDgsAAQYJDwEKBgABDgkPAQEKAAEHCQ8BCAYAAQwJDwEDCgABCQkPAQUGAAEICQ8BBgoAAQwJDwEBBgABBAkPAQkJAAEBCQ8BDQgAAQ4IDwEOCQABBgkPAQgIAAEJCQ8BBwcAAQEBDQkPAQIIAAECCQ8BDgEEBgABCQkPAQoKAAEJCg8BCAEDAgEBBAELCg8BAwoAAQEBDhgPAQkMAAEFFw8BDQEBDQABBxUPAQ4BAg8AAQcTDwENAQIRAAEEAQ0QDwEKAQETAAEBAQcBDQwPAQsBBBgAAQQBCAELAQ0BDgIPAQ4BDAEKAQYBAg0A"],"1":[38,0,12,38,39,"CwABAwEGAQkBDQkPAQ0TAAEBAQUBCAELAQ4NDwENEwABDhEPAQ0TAAEOEQ8BDRMAAQ4RDwENEwABDhEPAQ0TAAEOEQ8BDRMAAQ4EDwEMAQkBBgEDAQsIDwENEwABDAEKAQcBBAEBBAABCwgPAQ0cAAELCA8BDRwAAQsIDwENHAABCwgPAQ0cAAELCA8BDRwAAQsIDwENHAABCwgPAQ0cAAELCA8BDRwAAQsIDwENHAABCwgPAQ0cAAELCA8BDRwAAQsIDwENHAABCwgPAQ0cAAELCA8BDRwAAQsIDwENHAABCwgPAQ0cAAELCA8BDRwAAQsIDwENHAABCwgPAQ0cAAELCA8BDRwAAQsIDwENHAABCwgPAQ0cAAELCA8BDRwAAQsIDwENEwABChoPAQ0KAAEKGg8BDQoAAQoaDwENCgABChoPAQ0KAAEKGg8BDQoAAQoaDwENCgABChoPAQ0EAA=="],"2":[38,0,11,38,40,"CQABAwEFAQgBCgELAQ0CDgEPAQ4CDQELAQgBBQEBEQABAQEEAQgBDBEPAQoBBA8AAQkWDwEKAQINAAEJFw8BDgEDDAABCRgPAQ4BAwsAAQkZDwENCwABCRoPAQcKAAEJBQ8BDgEKAQYBAwEBAQABAQEDAQcBDQsPAQ0KAAEJAw8BDAEGAQEIAAEBAQoLDwEDCQABCQEPAQwBBA0AAQsKDwEGCQABCAEGDwABAgoPAQgbAAEMCQ8BCRsAAQoJDwEIGwABCgkPAQYbAAEMCQ8BAxoAAQIJDwENGwABCQkPAQcaAAEFCQ8BDQEBGQABAwEOCQ8BBBkAAQMBDgkPAQcZAAEFAQ4JDwEIGQABBwoPAQkZAAEJCg8BCBgAAQEBCwoPAQcYAAECAQ0KDwEGGAABAwEOCQ8BDgEEGAABBQoPAQ0BAhgAAQcKDwEMAQEYAAEJCg8BChgAAQEBCwoPAQgYAAECAQ0KDwEFGAABAwEOCQ8BDgEDGQABCxsPAQ0JAAELGw8BDQkAAQsbDwENCQABCxsPAQ0JAAELGw8BDQkAAQsbDwENCQABCxsPAQ0JAAELGw8BDQUA"],"3":[38,0,11,38,41,"CQABAgEFAQgBCgEMAQ0BDgIPAQ4CDQELAQkBBgECEgABAQEFAQoBDhAPAQ0BCAEBDwABCxUPAQ4BCA4AAQsXDwELAQEMAAELGA8BCgwAAQsZDwEFCwABCxkPAQsLAAELAg8BDgELAQcBBQEDAgEBAAEBAQMBBgELDA8BAQoAAgkBBAwAAQQBDgoPAQMaAAEFCg8BBRsAAQ4JDwEFGwABDAkPAQMbAAEOCQ8BARoAAQUJDwEKGgABBAEOCQ8BAxYAAQEBAwEGAQsKDwEHEQABChIPAQYSAAEKEA8BCgECEwABCg4PAQwBAhUAAQoQDwEKAQITAAEKEg8BBxIAAQoTDwEJEQABChQPAQYVAAEBAQIBBAEHAQsLDwEOAQIZAAEDAQwKDwEIGgABAQENCQ8BDRsAAQQKDwEBGwAKDwEDGwABDgkPAQQbAAoPAQQaAAEECg8BAgcAAQUBCQECDwABAQENCg8IAAEGAg8BCgEFAQELAAEDAQwKDwELCAABBgQPAQ4BCwEIAQQBAgEBAgABAQEDAQYBCwwPAQYIAAEGGw8BDQkAAQYbDwEECQABBhoPAQYKAAEGGA8BDgEFCwABBhcPAQoBAg0AAQQBCAENEQ8BDQEIAQISAAEBAQQBBwEJAQsBDQIOAg8CDgEMAQsBCQEGAQIOAA=="],"4":[38,0,12,38,39,"EQABAwsPAQcZAAEMCw8BBxgAAQgMDwEHFwABBA0PAQcWAAEBAQ0NDwEHFgABCg4PAQcVAAEFDw8BBxQAAQIBDg8PAQcUAAELBg8BCwkPAQcTAAEHBg8BDQECCQ8BBxIAAQIHDwEDAQIJDwEHEgABDAYPAQcBAAECCQ8BBxEAAQgGDwEMAgABAgkPAQcQAAEDBg8BDgECAgABAgkPAQcPAAEBAQ0GDwEGAwABAgkPAQcPAAEJBg8BCgQAAQIJDwEHDgABBQYPAQ4BAQQAAQIJDwEHDQABAQEOBg8BBAUAAQIJDwEHDQABCwYPAQkGAAECCQ8BBwwAAQYGDwENAQEGAAECCQ8BBwsAAQIBDgYPAQMHAAECCQ8BBwsAAQwGDwEHCAABAgkPAQcKAAEHBg8BDAkAAQIJDwEHCgABCQUPAQ4BAgkAAQIJDwEHCgABCSAPAQEEAAEJIA8BAQQAAQkgDwEBBAABCSAPAQEEAAEJIA8BAQQAAQkgDwEBBAABCSAPAQEVAAECCQ8BBxsAAQIJDwEHGwABAgkPAQcbAAECCQ8BBxsAAQIJDwEHGwABAgkPAQcbAAECCQ8BBxsAAQIJDwEHCAA="],"5":[38,0,12,38,40,"BQABBBgPAQ4MAAEEGA8BDgwAAQQYDwEODAABBBgPAQ4MAAEEGA8BDgwAAQQYDwEODAABBBgPAQ4MAAEEGA8BDgwAAQQHDwEMHQABBAcPAQwdAAEEBw8BDB0AAQQHDwEMHQABBAcPAQwdAAEEBw8BDQEHAQoBDQEOAQ8BDgENAQwBCgEGAQMSAAEEEw8BDQEHAQEPAAEEFQ8BDgEFDgABBBcPAQkNAAEEGA8BCQwAAQQZDwEHCwABBBkPAQ4BAQoAAQQDDwENAQoBBgEEAQIBAQEAAQEBAgEFAQoMDwEJCgABBAELAQYBAgsAAQIBCwoPAQ4bAAELCg8BBBoAAQIBDgkPAQgbAAEKCQ8BCRsAAQcJDwELGwABBgkPAQwbAAEHCQ8BCxsAAQoJDwEKCAABCgEEEAABAgEOCQ8BCAgAAQwBDwEKAQMOAAELCg8BBAgAAQwDDwELAQUKAAECAQsKDwEOCQABDAUPAQ4BCgEGAQMBAgEAAQEBAgEFAQkMDwEICQABDBoPAQ4BAQkAAQwaDwEECgABDBkPAQYLAAEMFw8BDgEFDAABAgEIAQ4UDwEKAQEQAAEFAQoBDg4PAQ4BCQEDFQABAwEGAQkBCwENAg4BDwEOAQ0BDAEKAQcBBAEBDQA="],"6":[38,0,11,38,41,"DwABAQEFAQkBCwENAQ4CDwEOAQ0BCwEJAQYBAhYAAQUBCw4PAQ0BCAEDEQABAwEMEw8BAQ8AAQcVDwEBDgABCRYPAQENAAEJFw8BAQwAAQcYDwEBCwABAwsPAQ0BBwEEAQIBAQEAAQEBAwEFAQgBDAMPAQELAAEMCQ8BDgEFCwABAQEGAQwBAQoAAQQJDwENAQIaAAELCA8BDgEDGgABAgkPAQgbAAEHCA8BDgEBGwABCwgPAQocAAkPAQYCAAECAQcBCwENAQ4BDwEOAQwBCgEGAQIOAAEDCQ8CAwELCw8BCwEDDAABBQkPAQkPDwEJCwABBxoPAQwBAQkAAQgbDwELCQABCRwPAQgIAAEKHQ8BAgcAAQoMDwEMAQUBAQEAAQEBBAELCg8BCQcAAQkLDwEKBwABCQkPAQ4HAAEJCg8BDgEBCAABDQkPAQQGAAEHCg8BCQkAAQgJDwEHBgABBgoPAQYJAAEECQ8BCAYAAQQKDwEECQABAwkPAQoGAAEBCg8BAwkAAQIJDwEKBwABDQkPAQQJAAEDCQ8BCQcAAQkJDwEGCQABBAkPAQcHAAEECQ8BCQkAAQgJDwEECAABDQgPAQ4BAQgAAQ0JDwEBCAABBwkPAQoHAAEJCQ8BCgkAAQEBDgkPAQwBBQEBAQABAQEEAQsKDwEECgABBhkPAQoMAAEKFw8BDgECDAABAQEMFQ8BDgEDDgABAQELEw8BDQEDEQABCBEPAQoBARMAAQIBCQ0PAQoBAxcAAQEBBQEJAQwCDgEPAQ4BDQEMAQkBBQEBDAA="],"7":[38,0,12,38,39,"AwABBh0PAQQHAAEGHQ8BBAcAAQYdDwEEBwABBh0PAQQHAAEGHQ8BBAcAAQYdDwEEBwABBhwPAQ0IAAEGHA8BBxsAAQoIDwEOAQEaAAECCQ8BCBsAAQkJDwEBGgABAQkPAQkbAAEICQ8BAhoAAQEBDggPAQobAAEHCQ8BAxsAAQ4IDwELGwABBgkPAQQbAAENCA8BDBsAAQUJDwEGGwABDAgPAQ0bAAEECQ8BBxsAAQsIDwEOAQEaAAEDCQ8BCBsAAQoJDwEBGgABAgkPAQkbAAEJCQ8BAhoAAQIJDwEKGwABCQkPAQMaAAEBAQ4IDwEMGwABCAkPAQUaAAEBAQ4IDwENGwABBwkPAQYbAAENCA8BDhsAAQYJDwEHGwABDQgPAQ4BARoAAQUJDwEIGwABDAkPAQIaAAEECQ8BCRsAAQsJDwEDEwA="],"8":[38,0,11,38,41,"CwABAQEFAQgBCgINAQ4CDwEOAQ0BDAEJAQcBBBUAAQUBCw8PAQ4BCQECEAABAwEMFA8BCQ4AAQUBDhYPAQsBAQsAAQMZDwELCwABDBoPAQYJAAEDGw8BDAkAAQgKDwEMAQUBAgEAAQEBAwEHAQ4KDwECCAABCwkPAQoHAAEDAQ4JDwEECAABDAkPAQEIAAEICQ8BBQgAAQwIDwEMCQABBAkPAQUIAAEKCA8BDAkAAQQJDwEDCAABBgkPAQEIAAEICA8BDgkAAQEBDggPAQkHAAEDAQ4IDwEICgABBwkPAQsBBQEBAQABAQEDAQcBDggPAQ4BAQsAAQoXDwEOAQMNAAEHFQ8BDAEDDwABAgEJAQ4QDwENAQYSAAEBAQYBDg4PAQsBAxEAAQEBBwEOEg8BCwEDDgABAwENFg8BCAwAAQMBDhgPAQkKAAEBAQ0JDwEMAQUBAgEAAQEBAwEHAQ4JDwEHCQABCAkPAQgHAAECAQ0IDwEOAQEHAAEBAQ4IDwELCQABAwkPAQcHAAEFCQ8BBAoAAQsIDwEMBwABCAkPAQEKAAEICQ8BAQYAAQkIDwEOCwABBgkPAQIGAAEKCA8BDgsAAQYJDwEDBgABCgkPAQEKAAEICQ8BAgYAAQgJDwEECgABCwkPAQEGAAEHCQ8BCwkAAQMJDwEOBwABAwoPAQgHAAECAQ0JDwEKCAABDQoPAQsBBQECAQABAQEDAQcBDgoPAQYIAAEHGw8BDgEBCQABDRoPAQYKAAEDAQ4YDwEKDAABAwEOFg8BCg4AAQIBChMPAQ4BBhEAAQQBCgEODg8BDQEHAQEUAAEBAQQBBwEKAQwBDQEOAg8BDgENAQwBCQEGAQMMAA=="],"9":[38,0,11,38,41,"DAABAwEHAQsBDAENAQ4BDwEOAQwBCgEHAQMXAAEBAQcBDQwPAQwBBRQAAQUBDhAPAQwBAhEAAQkTDwEOAQQPAAEKFg8BBA0AAQgXDwEOAQILAAEDGQ8BDAsAAQwJDwEOAQcBAwIBAQMBCAoPAQYJAAEDCQ8BDgEDBgABBAkPAQ4JAAEICQ8BBggAAQgJDwEFCAABDAgPAQ4BAQgAAQIJDwELCAAJDwELCgABDgkPAQEGAAECCQ8BCQoAAQwJDwEFBgABAwkPAQkKAAELCQ8BCAYAAQMJDwEJCgABDAkPAQsGAAEBCQ8BCwoAAQ0JDwENBwAJDwEOCQABAgoPAQ4HAAEMCQ8BBggAAQgLDwEBBgABCAkPAQ4BAgYAAQQMDwEBBgABAwoPAQ4BBwECAQABAQEDAQgNDwECBwABCh0PAQIHAAECAQ4cDwEBCAABBRwPCgABBhoPAQ4LAAEEAQ4ODwEMAQsIDwEMDAABAQEHAQ4KDwEOAQcBAAELCA8BCg4AAQEBBAEIAQwBDQEOAQ8BDgEMAQkBBQMAAQ4IDwEHGwABAwkPAQMbAAEICA8BDhsAAQEBDggPAQkbAAEKCQ8BAxoAAQgJDwELCwABCAEJAQMLAAECAQsKDwEECwABCQIPAQ4BCgEGAQQBAgEBAQABAQECAQYBCgsPAQkMAAEJFw8BDQEBDAABCRYPAQ4BAg0AAQkVDwEOAQMOAAEJFA8BDAECDwABCRIPAQ4BBxEAAQEBBgELDg8BDQEIAQEVAAEBAQQBCAEKAQwCDgIPAQ4BDAEKAQcBAxAA"],":":[22,0,21,22,30,"BgAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEI6AAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIBgA="],";":[22,0,21,22,38,"BgAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEI6AAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEIDAAJDwEICwABAQkPAQQLAAEFCA8BCQwAAQkHDwEOAQEMAAENBw8BBQwAAQIHDwEKDQABBgYPAQ4BAQ0AAQoGDwEFDgABDgUPAQoOAAEDBQ8BDgEBDgABBwUPAQUMAA=="],"<":[45,0,19,45,32,"JQABBAEJAQcnAAECAQgBDQIPAQgkAAEBAQYBDAUPAQgiAAEFAQoIDwEIHwABBAEJAQ4KDwEIHAABAgEIAQ0NDwEIGQABAQEGAQwQDwEGFwABBQEKEA8BCwEGAQEVAAEDAQkBDg8PAQwBBgEBFQABAgEHAQ0PDwEMAQcBAhUAAQEBBgELDw8BDQEIAQMWAAEEAQoPDwEOAQgBAxcAAQMBDg4PAQ4BCQEEGgABBAwPAQ4BCgEFHQABBAoPAQsBBQEBHwABBAgPAQsBAiIAAQQJDwEOAQoBBCAAAQQMDwEOAQkBBB0AAQMBDg4PAQ4BCAEDHAABBAEKDw8BDQEIAQMbAAEBAQYBCw8PAQ0BBwECGwABAgEHAQ0PDwEMAQcBAhsAAQMBCQEODw8BCwEGAQEbAAEFAQoQDwELAQYBARoAAQEBBgEMEA8BBhwAAQIBCAENDQ8BCB8AAQQBCQEOCg8BCCIAAQUBCwgPAQgkAAEBAQYBDAUPAQgnAAECAQgBDQIPAQgqAAEEAQkBBzIA"],"=":[45,0,25,45,26,"BQABBCEPAQgKAAEEIQ8BCAoAAQQhDwEICgABBCEPAQgKAAEEIQ8BCAoAAQQhDwEI/wAZAAEEIQ8BCAoAAQQhDwEICgABBCEPAQgKAAEEIQ8BCAoAAQQhDwEICgABBCEPAQj/AG4A"],">":[45,0,19,45,32,"BQABBAELAQUBASkAAQQCDwEOAQkBBCcAAQQFDwENAQgBAiQAAQQIDwEMAQYBASEAAQQLDwEKAQUfAAEEDQ8BDgEJAQMcAAEDAQ4PDwENAQcBAhsAAQQBCgEODw8BDAEGAQEaAAEBAQUBChAPAQoBBRsAAQEBBgELDw8BDgEJAQMbAAEBAQYBDA8PAQ0BBwECGwABAgEHAQwPDwELAQYBARsAAQIBCAENDg8BDgEGHQABAwEIAQ0MDwEIIAABBAEJAQ4JDwEIIwABCAgPAQggAAEDAQgBDQkPAQgdAAECAQgBDQwPAQgaAAECAQcBDA4PAQ4BBhcAAQEBBwEMDw8BCwEGAQEVAAEBAQYBCw8PAQ0BBwECFQABAQEFAQsPDwEOAQkBAxYAAQUBCgEODw8BCgEFFgABBAEJAQ4PDwEMAQYBARYAAQMBDg8PAQ0BCAECGQABBA0PAQ4BCQEEHAABBAsPAQoBBR8AAQQIDwEMAQYBASEAAQQFDwENAQgBAiQAAQQCDwEOAQkBBCcAAQQBCwEFAQFRAA=="],"?":[31,0,12,31,39,"CQABBAEHAQoBDQEOAQ8BDgINAQoBBwEEEAABAwEJAQ4MDwEOAQgBAQsAAQUBDBEPAQ4BBQkAAQQVDwEFCAABBBYPAQMHAAEEFg8BDAcAAQQXDwEDBgABBAUPAQwBBwEDAQEBAAEBAQQBCwoPAQcGAAEEAw8BCgEDCAABCAkPAQoGAAEEAQ8BDAEDCwABDggPAQsGAAEEAQcNAAELCA8BDBUAAQwIDwELFAABAQEOCA8BCBQAAQgJDwEEEwABAwkPAQ0TAAEDAQ4JDwEFEgABBAEOCQ8BChIAAQYKDwEMAQERAAEICg8BDAEBEQABCAoPAQsBAREAAQYKDwEJEgABAQEOCQ8BBxMAAQYJDwEIFAABCggPAQ4BARQAAQwIDwELFQABDAgPAQqRAAEMCA8BChUAAQwIDwEKFQABDAgPAQoVAAEMCA8BChUAAQwIDwEKFQABDAgPAQoVAAEMCA8BChUAAQwIDwEKFQABDAgPAQoMAA=="],"@":[54,0,13,54,47,"FAABAQEEAQcBCgEMAg4BDwEOAQ0BDAEKAQgBBQEBJQABBQEKDw8BDAEGAQEgAAEHAQ0TDwEOAQgBARwAAQUBDRcPAQ4BBxkAAQEBChsPAQwBAhYAAQMBDQgPAQ4BCgEHAQQBAgEBAQACAQEDAQUBCAEMCA8BDgEEFAABBAEOBw8BCgEFDQABAgEIAQ4HDwEFEgABAwEOBg8BCwEDEQABAQEIBw8BBBAAAQIBDgUPAQ4BBRUAAQMBDAUPAQ4BAg8AAQwFDwEMAQIXAAEBAQsFDwELDgABCAUPAQwBARoAAQsFDwEGDAABAwUPAQ0BARsAAQEBDAQPAQ4BAQsAAQsEDwEOAQIIAAEBAQUBCgENAQ4BDwENAQoBBAwAAQIFDwEHCgABAwUPAQYIAAEFAQ0IDwEJAQABBAUPAQQEAAEHBA8BDQoAAQoEDwEMCAABCAsPAQoBBAUPAQQEAAEBAQ4EDwEECAABAQUPAQUHAAEHDQ8BCQUPAQQFAAEJBA8BCAgAAQYEDwENBwABBBQPAQQFAAEEBA8BDAgAAQoEDwEHBwABDAYPAQoBBAIBAQQBCggPAQQFAAEBBA8BDggAAQ4EDwECBgABBAYPAQgGAAEHBw8BBAYAAQ0EDwEBBgABAQQPAQ4HAAEJBQ8BDAgAAQsGDwEEBgABDAQPAQIGAAEEBA8BCwcAAQwFDwEGCAABBAYPAQQGAAEMBA8BAgYAAQUEDwEJBwAGDwECCAABAQYPAQQGAAEMBA8BAgYAAQYEDwEIBgABAQUPAQ4KAAENBQ8BBAYAAQ4EDwEBBgABBgQPAQcGAAECBQ8BDgoAAQwFDwEEBQABAgQPAQ4HAAEGBA8BCAYAAQEGDwoAAQ0FDwEEBQABBgQPAQsHAAEFBA8BCQcABg8BAggAAQEGDwEEBQABDAQPAQcHAAEEBA8BCwcAAQwFDwEGCAABBQYPAQQEAAEFBQ8BAgcAAQIEDwEOBwABCQUPAQwIAAELBg8BBAMAAQMBDgQPAQoJAAEOBA8BAgYAAQQGDwEIBgABBwcPAQQCAAEEAQ4FDwECCQABCwQPAQcHAAEMBg8BCgEEAgEBAwEKCA8CBQELBg8BBgoAAQcEDwEMBwABBBwPAQkLAAECBQ8BBAcAAQgNDwEKDA8BBw0AAQsEDwELCAABCAsPAQsBBAoPAQ0BAw4AAQUFDwEFCAABBQENCA8BCgEAAQQIDwEMAQURAAENBA8BDgECCAABAQEGAQoBDQEOAQ8BDQEKAQQCAAEEAw8BDgEMAQkBBgECEwABBAUPAQwBARMAAgEaAAEKBQ8BCy8AAQEBDQUPAQsBARYAAQIBCwEBFQABAwYPAQ0BAxQAAQUBDgEPAQgWAAEEBw8BCQEBEAABAgEKBA8BAhYAAQUHDwEOAQkBAwwAAQMBCQYPAQsXAAEEAQ4IDwENAQkBBQEDAQECAAEBAQIBBQEIAQwJDwEEFwABAgELGg8BDgEFGgABBgEOFw8BCgEBHAABAQEIAQ4TDwELAQMgAAEBAQYBCw4PAQ0BCAECJQABAQEFAQgBCgEMAg4BDwEOAQ0BDAEJAQYBAhQA"],"A":[42,0,12,42,39,"DgABBQwPAQIcAAELDA8BCBsAAQINDwENGwABBw4PAQQaAAENDg8BChkAAQMPDwEOAQEYAAEJEA8BBhgAAQ4QDwELFwABBRIPAQIWAAELCA8BDQEOCA8BCBUAAQEJDwEHAQoIDwENFQABBwkPAQIBBQkPAQQUAAEMCA8BDAEAAQEBDggPAQkTAAEDCQ8BBwIAAQoIDwEOAQESAAEJCQ8BAgIAAQUJDwEGEgABDggPAQsEAAEOCA8BCxEAAQUJDwEGBAABCQkPAQIQAAELCQ8BAQQAAQQJDwEHDwABAQkPAQsGAAEOCA8BDQ8AAQcJDwEGBgABCQkPAQQOAAEMCQ8BAQYAAQQJDwEJDQABAwkPAQsIAAEOCA8BDgEBDAABCQkPAQUIAAEJCQ8BBQwAAQ4IDwEOAQEIAAEDCQ8BCwsAAQUJDwEKCgABDQkPAQIKAAEKHg8BBwkAAQEfDwENCQABByAPAQMIAAEMIA8BCQcAAQMhDwEOAQEGAAEIIg8BBQYAAQ4iDwELBQABBQkPAQwPAAEBAQ4JDwECBAABCgkPAQYQAAEJCQ8BBwMAAQEKDwEBEAABBAkPAQ0DAAEGCQ8BCxIAAQ4JDwEDAgABDAkPAQUSAAEICQ8BCQEAAQMJDwEOAQESAAEDCQ8BDgEAAQgJDwEKFAABDQkPAQU="],"B":[41,0,12,41,39,"BAABAREPAQ4BDQEMAQoBCAEFAQEQAAEBGA8BCwEGDgABARoPAQ0BAwwAAQEbDwEOAQQLAAEBHA8BDgECCgABAR0PAQsKAAEBHg8BAgkAAQEKDwECBQABAQEDAQgLDwEGCQABAQoPAQIIAAEECg8BCQkAAQEKDwECCQABCgkPAQoJAAEBCg8BAgkAAQcJDwELCQABAQoPAQIJAAEHCQ8BCgkAAQEKDwECCQABCgkPAQcJAAEBCg8BAggAAQMKDwEDCQABAQoPAQIFAAEBAQMBCAEOCQ8BCwoAAQEcDwEOAQIKAAEBGw8BDgEECwABARoPAQkBAQwAAQEZDwEOAQgBAgwAAQEbDwEOAQcLAAEBHQ8BCQoAAQEeDwEHCQABAQoPAQIGAAEBAQQBCQsPAQIIAAEBCg8BAgkAAQMBDgkPAQkIAAEBCg8BAgoAAQUJDwEOCAABAQoPAQILAAEOCQ8BAgcAAQEKDwECCwABDAkPAQQHAAEBCg8BAgsAAQwJDwEFBwABAQoPAQILAAEOCQ8BBAcAAQEKDwECCgABBQoPAQMHAAEBCg8BAgkAAQMBDgoPAQEHAAEBCg8BAgYAAQEBBAEJCw8BDAgAAQEfDwEHCAABAR4PAQ0BAQgAAQEeDwEECQABAR0PAQUKAAEBGw8BDAEDCwABARkPAQsBBQ0AAQESDwEOAQ0BDAEKAQgBBQEBCwA="],"C":[40,0,11,40,41,"EAABAQEEAQcBCgEMAQ0BDgIPAQ4BDQEMAQkBBwEEFwABBQELDw8BDgEKAQUSAAEGAQ0UDwEOAQgBAQ0AAQMBDBgPAQMMAAEGGg8BAwsAAQgbDwEDCgABBxwPAQMJAAEFDQ8BCwEHAQMBAgEAAQEBAgEDAQYBCgEOBQ8BAwgAAQIBDgsPAQsBAwsAAQUBDAMPAQMIAAEKCw8BBw8AAQQBDQEPAQMHAAEDCw8BBhIAAQgBAgcAAQoKDwEKGwABAQoPAQ4BARsAAQUKDwEIHAABCQoPAQIcAAENCQ8BDB0ACg8BCRwAAQIKDwEGHAABAwoPAQUcAAEECg8BBBwAAQUKDwEDHAABBAoPAQQcAAEECg8BBRwAAQIKDwEGHQAKDwEJHQABDQkPAQwdAAEJCg8BAhwAAQUKDwEIHAABAQoPAQ4BARwAAQoKDwEKHAABAwsPAQYSAAEIAQIIAAEKCw8BBw8AAQQBDQEPAQMIAAECAQ4LDwELAQMLAAEFAQsDDwEDCQABBQ0PAQsBBwEDAQIBAAEBAQIBAwEGAQoBDgUPAQMKAAEHHA8BAwsAAQgbDwEDDAABBhoPAQMNAAEDAQwYDwEDDwABBgENFA8BDgEIAQERAAEFAQsPDwEOAQoBBRYAAQEBBAEHAQoBDAENAQ4CDwEOAQ0BDAEJAQcBBAkA"],"D":[45,0,12,45,39,"BAABAQ0PAg4BDQEMAQsBCgEJAQcBBAEBFQABARcPAQ0BCAEDEgABARoPAQwBBRAAAQEcDwELAQIOAAEBHQ8BDgEFDQABAR8PAQcMAAEBIA8BBgsAAQEKDwECAwABAQECAQMBBgEJAQ0NDwEECgABAQoPAQIJAAEFAQ0LDwEOAQEJAAEBCg8BAgsAAQkLDwEJCQABAQoPAQIMAAEHCw8BAggAAQEKDwECDQABCgoPAQkIAAEBCg8BAg0AAQEBDgkPAQ4IAAEBCg8BAg4AAQkKDwEEBwABAQoPAQIOAAEDCg8BBwcAAQEKDwECDwABDgkPAQoHAAEBCg8BAg8AAQsJDwEMBwABAQoPAQIPAAEJCQ8BDgcAAQEKDwECDwABCAkPAQ4HAAEBCg8BAg8AAQcKDwcAAQEKDwECDwABCAkPAQ4HAAEBCg8BAg8AAQkJDwEOBwABAQoPAQIPAAELCQ8BDAcAAQEKDwECDwABDgkPAQoHAAEBCg8BAg4AAQMKDwEHBwABAQoPAQIOAAEJCg8BBAcAAQEKDwECDQABAgoPAQ4IAAEBCg8BAg0AAQsKDwEJCAABAQoPAQIMAAEICw8BAggAAQEKDwECCgABAQEJCw8BCQkAAQEKDwECCQABBgENCw8BDgEBCQABAQoPAQIDAAEBAQIBAwEGAQkBDg0PAQQKAAEBIA8BBgsAAQEfDwEHDAABAR0PAQ4BBQ0AAQEcDwELAQIOAAEBGg8BDAEFEAABARcPAQ0BCAEDEgABAQ0PAg4CDQELAQoBCAEHAQQBAREA"],"E":[37,0,12,37,39,"BAABARsPAQUIAAEBGw8BBQgAAQEbDwEFCAABARsPAQUIAAEBGw8BBQgAAQEbDwEFCAABARsPAQUIAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBGg8BBQkAAQEaDwEFCQABARoPAQUJAAEBGg8BBQkAAQEaDwEFCQABARoPAQUJAAEBGg8BBQkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEbDwEOCAABARsPAQ4IAAEBGw8BDggAAQEbDwEOCAABARsPAQ4IAAEBGw8BDggAAQEbDwEOBAA="],"F":[37,0,12,37,39,"BAABARsPAQUIAAEBGw8BBQgAAQEbDwEFCAABARsPAQUIAAEBGw8BBQgAAQEbDwEFCAABARsPAQUIAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBGg8BBQkAAQEaDwEFCQABARoPAQUJAAEBGg8BBQkAAQEaDwEFCQABARoPAQUJAAEBGg8BBQkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECFQA="],"G":[44,0,11,44,41,"EQABAwEGAQkBCwENAg4BDwIOAQ0BDAEKAQgBBgEDGQABBAEJAQ4QDwEOAQoBBwECEwABBQEMFw8BCwEFDwABAgELGg8BDQ4AAQUBDhsPAQ0NAAEHHQ8BDQwAAQceDwENCwABBA0PAQ0BCQEFAQMBAgEAAQEBAgEDAQUBCQEMBg8BDQoAAQEBDgsPAQ0BBQwAAQEBBgEMAw8BDQoAAQoLDwEJEQABAwEKAQ8BDQkAAQMLDwEIFAABAwEKCQABCgoPAQsfAAEBCg8BDgEBHwABBQoPAQggAAEJCg8BAiAAAQ0JDwENIQAKDwEJIAABAgoPAQYgAAEECg8BBQoAAQcPDwEFBQABBAoPAQQKAAEHDw8BBQUAAQUKDwEDCgABBw8PAQUFAAEECg8BBAoAAQcPDwEFBQABBAoPAQUKAAEHDw8BBQUAAQIKDwEGCgABBw8PAQUGAAoPAQkKAAEHDw8BBQYAAQ0JDwEMEAABBAkPAQUGAAEJCg8BAg8AAQQJDwEFBgABBQoPAQgPAAEECQ8BBQYAAQEKDwEOAQEOAAEECQ8BBQcAAQoKDwEKDgABBAkPAQUHAAEDCw8BBg0AAQQJDwEFCAABCgsPAQcMAAEECQ8BBQgAAQIBDgsPAQsBBAoAAQQJDwEFCQABBQ0PAQwBCAEEAQIBAQEAAQEBAgEEAQcBDAkPAQUKAAEHIA8BBQsAAQgfDwEFDAABBh4PAQUNAAEDAQwbDwEMAQMPAAEGAQ0WDwEOAQkBAxMAAQUBCxEPAQ0BCAEEAQEXAAEBAQQBBwEKAQwBDQEOAg8BDgENAQwBCwEJAQcBBAECCwA="],"H":[45,0,12,45,39,"BAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEjDwEECAABASMPAQQIAAEBIw8BBAgAAQEjDwEECAABASMPAQQIAAEBIw8BBAgAAQEjDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAQA"],"I":[20,0,12,20,39,"BAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECCAABAQoPAQIIAAEBCg8BAggAAQEKDwECBAA="],"J":[20,-4,12,24,50,"CAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQIMAAEBCg8BAgwAAQEKDwECDAABAQoPAQEMAAECCg8NAAEFCQ8BDg0AAQoJDwEMDAABAwoPAQgLAAECAQ0KDwEECAABAQEDAQgBDgoPAQ0HABAPAQYHAA8PAQwIAA4PAQ0BAggADQ8BDQEDCQAMDwEKAQEKAAkPAQ4BCgEDDAADDwIOAQwBCgEIAQQBAQ0A"],"K":[42,0,12,44,39,"BAABAQoPAQIMAAEBAQsKDwENAQIGAAEBCg8BAgsAAQEBCwoPAQ0BAgcAAQEKDwECCgABAQEMCg8BDQECCAABAQoPAQIJAAEBAQwKDwENAQEJAAEBCg8BAggAAQEBDAoPAQwBAQoAAQEKDwECBwABAQEMCg8BDAEBCwABAQoPAQIGAAEBAQ0KDwEMAQEMAAEBCg8BAgUAAQIBDQoPAQwBAQ0AAQEKDwECBAABAgENCg8BCwEBDgABAQoPAQIDAAECAQ0KDwELAQEPAAEBCg8BAgIAAQIBDQoPAQsBARAAAQEKDwECAQABAwEOCg8BCxIAAQEKDwECAQMBDgoPAQoTAAEBCg8BBQEOCg8BChQAAQEVDwEKFQABARQPAQkWAAEBEw8BCRcAAQESDwEJGAABAREPAQwZAAEBEg8BCRgAAQETDwEKFwABARQPAQoWAAEBFQ8BChUAAQEKDwEOCw8BChQAAQEKDwEEAQ0LDwEKEwABAQoPAgIBDQsPAQsSAAEBCg8BAgEAAQIBDQsPAQsRAAEBCg8BAgIAAQIBDQsPAQsBAQ8AAQEKDwECAwABAQENCw8BCwEBDgABAQoPAQIEAAEBAQwLDwELAQENAAEBCg8BAgUAAQEBDAsPAQwBAQwAAQEKDwECBgABAQEMCw8BDAEBCwABAQoPAQIHAAEBAQwLDwEMAQEKAAEBCg8BAggAAQEBDAsPAQwBAQkAAQEKDwECCQABAQELCw8BDAEBCAABAQoPAQIKAAEBAQsLDwEMAQEHAAEBCg8BAgsAAQEBCwsPAQ0BAQYAAQEKDwECDQABCwsPAQ0BAgUAAQEKDwECDgABCwsPAQ0BAg=="],"L":[34,0,12,34,39,"BAABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEbDwEOBQABARsPAQ4FAAEBGw8BDgUAAQEbDwEOBQABARsPAQ4FAAEBGw8BDgUAAQEbDwEOAQA="],"M":[54,0,12,54,39,"BAABAQ0PAQIQAAEFDA8BCwkAAQENDwEIEAABDAwPAQsJAAEBDQ8BDgEBDgABBA0PAQsJAAEBDg8BBg4AAQoNDwELCQABAQ4PAQ0NAAECDg8BCwkAAQEPDwEEDAABCA4PAQsJAAEBDw8BCwsAAQEBDg4PAQsJAAEBEA8BAgoAAQcPDwELCQABARAPAQkKAAENDw8BCwkAAQEQDwEOAQEIAAEFEA8BCwkAAQEJDwENBw8BBwgAAQsHDwEOCA8BCwkAAQEJDwEJAQ0GDwENBwABAwcPAQoBDQgPAQsJAAEBCQ8BCQEHBw8BBQYAAQkHDwEDAQ0IDwELCQABAQkPAQkBAQEOBg8BDAUAAQEHDwELAQABDQgPAQsJAAEBCQ8BCQEAAQkHDwEDBAABCAcPAQUBAAENCA8BCwkAAQEJDwEJAQABAgcPAQoEAAEOBg8BDQIAAQ0IDwELCQABAQkPAQkCAAELBw8BAgIAAQYHDwEHAgABDQgPAQsJAAEBCQ8BCQIAAQQHDwEIAgABDAYPAQ4BAQIAAQ0IDwELCQABAQkPAQkDAAEMBg8BDgEAAQQHDwEIAwABDQgPAQsJAAEBCQ8BCQMAAQYHDwEGAQsHDwECAwABDQgPAQsJAAEBCQ8BCQQAAQ4GDwENBw8BCgQAAQ0IDwELCQABAQkPAQkEAAEIDg8BBAQAAQ0IDwELCQABAQkPAQkEAAEBDQ8BDAUAAQ0IDwELCQABAQkPAQkFAAEKDA8BBgUAAQ0IDwELCQABAQkPAQkFAAEDCw8BDgYAAQ0IDwELCQABAQkPAQkGAAELCg8BBwYAAQ0IDwELCQABAQkPAQkGAAEFCg8BAQYAAQ0IDwELCQABAQkPAQkHAAENCA8BCQcAAQ0IDwELCQABAQkPAQkHAAEHCA8BAwcAAQ0IDwELCQABAQkPAQkHAAEBAQ4GDwELCAABDQgPAQsJAAEBCQ8BCQgAAQgGDwEECAABDQgPAQsJAAEBCQ8BCRgAAQ0IDwELCQABAQkPAQkYAAENCA8BCwkAAQEJDwEJGAABDQgPAQsJAAEBCQ8BCRgAAQ0IDwELCQABAQkPAQkYAAENCA8BCwkAAQEJDwEJGAABDQgPAQsJAAEBCQ8BCRgAAQ0IDwELCQABAQkPAQkYAAENCA8BCwUA"],"N":[45,0,12,45,39,"BAABAQsPAQgNAAEGCQ8BBAgAAQEMDwECDAABBgkPAQQIAAEBDA8BCQwAAQYJDwEECAABAQ0PAQMLAAEGCQ8BBAgAAQENDwELCwABBgkPAQQIAAEBDg8BBAoAAQYJDwEECAABAQ4PAQwKAAEGCQ8BBAgAAQEPDwEFCQABBgkPAQQIAAEBDw8BDAkAAQYJDwEECAABARAPAQYIAAEGCQ8BBAgAAQEQDwENCAABBgkPAQQIAAEBEQ8BBwcAAQYJDwEECAABAQkPAQ0HDwEOAQEGAAEGCQ8BBAgAAQEJDwEJAQsHDwEIBgABBgkPAQQIAAEBCQ8BCQEDBw8BDgEBBQABBgkPAQQIAAEBCQ8BCQEAAQoHDwEJBQABBgkPAQQIAAEBCQ8BCQEAAQIIDwECBAABBgkPAQQIAAEBCQ8BCQIAAQkHDwEKBAABBgkPAQQIAAEBCQ8BCQIAAQIIDwEDAwABBgkPAQQIAAEBCQ8BCQMAAQgHDwELAwABBgkPAQQIAAEBCQ8BCQMAAQEBDgcPAQQCAAEGCQ8BBAgAAQEJDwEJBAABBwcPAQwCAAEGCQ8BBAgAAQEJDwEJBAABAQENBw8BBQEAAQYJDwEECAABAQkPAQkFAAEGBw8BDQEAAQYJDwEECAABAQkPAQkGAAENBw8CBgkPAQQIAAEBCQ8BCQYAAQUHDwEOAQYJDwEECAABAQkPAQkHAAEMBw8BDQkPAQQIAAEBCQ8BCQcAAQQRDwEECAABAQkPAQkIAAELEA8BBAgAAQEJDwEJCAABAxAPAQQIAAEBCQ8BCQkAAQoPDwEECAABAQkPAQkJAAECDw8BBAgAAQEJDwEJCgABCQ4PAQQIAAEBCQ8BCQoAAQEBDg0PAQQIAAEBCQ8BCQsAAQgNDwEECAABAQkPAQkLAAEBAQ4MDwEECAABAQkPAQkMAAEHDA8BBAgAAQEJDwEJDQABDQsPAQQIAAEBCQ8BCQ0AAQULDwEEBAA="],"O":[46,0,11,46,41,"EAABBAEHAQoBDAENAQ4CDwEOAQ0BCwEJAQYBAx0AAQMBCQEODg8BDgEJAQMYAAEDAQsUDwEKAQIVAAEIGA8BBxIAAQEBDBoPAQsBAQ8AAQEBDRwPAQwBAQ0AAQEBDB4PAQsNAAEJCw8BDgEKAQUBAgIBAQIBBQEKDA8BCAsAAQQLDwELAQIIAAEDAQwLDwEDCgABDQoPAQoMAAELCg8BCwkAAQUKDwEMDQABAQENCg8BBAgAAQwKDwEDDgABBAoPAQoHAAECCg8BChAAAQsKDwEBBgABBwoPAQQQAAEGCg8BBQYAAQoJDwEOEQABAQoPAQgGAAENCQ8BCxIAAQwJDwELBQABAQoPAQgSAAEJCQ8BDgUAAQIKDwEFEgABBwoPBQABBAoPAQQSAAEGCg8BAgQAAQQKDwEEEgABBQoPAQIEAAEFCg8BAxIAAQQKDwEDBAABBAoPAQQSAAEFCg8BAgQAAQQKDwEEEgABBgoPAQIEAAECCg8BBRIAAQcKDwUAAQEKDwEIEgABCQkPAQ4GAAENCQ8BChIAAQwJDwELBgABCgkPAQ4RAAEBCg8BCAYAAQcKDwEEEAABBgoPAQUGAAECCg8BChAAAQsKDwEBBwABDAoPAQMOAAEECg8BCggAAQUKDwEMDQABAQENCg8BBAkAAQ0KDwEKDAABCwoPAQsKAAEFCw8BCwECCAABAwEMCw8BAwsAAQkLDwEOAQoBBQECAgEBAgEFAQoMDwEIDAABAQEMHg8BCw4AAQEBDRwPAQwBAQ8AAQEBDBoPAQsBARIAAQgYDwEHFQABAwELFA8BCwECGAABAwEJAQ4ODwEOAQkBAx0AAQQBBwEKAQwBDQEOAg8BDgENAQwBCgEHAQMQAA=="],"P":[40,0,12,40,39,"BAABAREPAQ4CDQELAQgBBQECDwABARgPAQsBBQ0AAQEaDwEMAQMLAAEBHA8BBwoAAQEdDwEGCQABAR4PAQQIAAEBHg8BDAgAAQEKDwECBQABAQEDAQcBDgsPAQUHAAEBCg8BAggAAQEBDAoPAQoHAAEBCg8BAgkAAQEBDgkPAQ4HAAEBCg8BAgoAAQgKDwECBgABAQoPAQIKAAEECg8BAwYAAQEKDwECCgABAgoPAQUGAAEBCg8BAgoAAQIKDwEFBgABAQoPAQIKAAEECg8BAwYAAQEKDwECCgABCAoPAQIGAAEBCg8BAgkAAQEBDgkPAQ4HAAEBCg8BAggAAQEBDAoPAQoHAAEBCg8BAgUAAQEBAwEHAQ4LDwEFBwABAR4PAQwIAAEBHg8BBAgAAQEdDwEGCQABARwPAQcKAAEBGg8BDAEDCwABARgPAQsBBQ0AAQERDwIOAQ0BCwEIAQUBAg8AAQEKDwECHAABAQoPAQIcAAEBCg8BAhwAAQEKDwECHAABAQoPAQIcAAEBCg8BAhwAAQEKDwECHAABAQoPAQIcAAEBCg8BAhwAAQEKDwECHAABAQoPAQIcAAEBCg8BAhwAAQEKDwECGAA="],"Q":[46,0,11,46,48,"EAABBAEHAQoBDAENAQ4CDwEOAQ0BDAEKAQcBAx0AAQMBCQEODg8BDgEJAQMYAAEDAQsUDwELAQMVAAEIGA8BCBIAAQEBDBoPAQsBAQ8AAQEBDRwPAQwBAQ0AAQEBDB4PAQsNAAEJCw8BDgEKAQUBAgIBAQIBBQEKDA8BCAsAAQQLDwELAQIIAAEDAQwLDwEDCgABDQoPAQoMAAELCg8BDAkAAQUKDwEMDQABAQENCg8BBAgAAQwKDwEDDgABBAoPAQoHAAECCg8BChAAAQsKDwEBBgABBgoPAQQQAAEGCg8BBQYAAQoJDwEOEQABAQoPAQgGAAENCQ8BCxIAAQwJDwELBQABAQoPAQgSAAEJCQ8BDgUAAQIKDwEFEgABBwoPBQABBAoPAQQSAAEGCg8BAgQAAQQKDwEEEgABBQoPAQIEAAEFCg8BAxIAAQQKDwEDBAABBAoPAQQSAAEFCg8BAgQAAQQKDwEEEgABBgoPAQEEAAECCg8BBRIAAQcKDwUAAQEKDwEIEgABCQkPAQ0GAAENCQ8BChIAAQwJDwELBgABCgkPAQ0RAAEBCg8BCAYAAQcKDwEDEAABBgoPAQQGAAECCg8BCRAAAQsJDwEOCAABDAoPAQIOAAEECg8BCQgAAQYKDwELDQABAQENCg8BAgkAAQ0KDwEJDAABCwoPAQoKAAEFCw8BCgEBCAABAwEMCg8BDgECCwABCgsPAQ4BCQEEAQICAQECAQUBCgwPAQYMAAEBAQweDwEKDgABAgENHA8BChAAAQEBDBoPAQoTAAEIGA8BBhUAAQMBCxQPAQoBAhgAAQMBCQEOEA8BBx0AAQMBBwEJAQsBDQEOCw8BBCQAAQgIDwEOAQMkAAEJCA8BDgECJAABCggPAQ0BAiQAAQsIDwEMAQEjAAEBAQwIDwEMAQEjAAEBAQ0IDwELJAABAgENCA8BCgYA"],"R":[42,0,12,42,39,"BAABAREPAQ4BDQEMAQoBBwEEAQERAAEBFw8BDgEKAQMPAAEBGg8BCgEBDQABARsPAQwBAQwAAQEcDwELDAABAR0PAQULAAEBHQ8BDAsAAQEKDwECBAABAQEDAQYBDQsPAQEKAAEBCg8BAggAAQsKDwEECgABAQoPAQIIAAECCg8BBgoAAQEKDwECCQABDAkPAQcKAAEBCg8BAgkAAQoJDwEGCgABAQoPAQIJAAEKCQ8BBQoAAQEKDwECCQABDAkPAQIKAAEBCg8BAggAAQIJDwENCwABAQoPAQIIAAELCQ8BBgsAAQEKDwECBAABAQEDAQYBDQkPAQwMAAEBGw8BDgECDAABARoPAQwBAg0AAQEYDwENAQYPAAEBFw8BCQEBEAABARgPAQ0BBQ8AAQEaDwEHDgABARsPAQUNAAEBCg8BAgMAAQIBBgEMCg8BDgECDAABAQoPAQIGAAEJCg8BCwwAAQEKDwECBwABCgoPAQULAAEBCg8BAgcAAQEBDgkPAQ0LAAEBCg8BAggAAQcKDwEFCgABAQoPAQIIAAEBAQ4JDwENCgABAQoPAQIJAAEHCg8BBQkAAQEKDwECCQABAQEOCQ8BDAkAAQEKDwECCgABBwoPAQUIAAEBCg8BAgoAAQEBDgkPAQwIAAEBCg8BAgsAAQgKDwEEBwABAQoPAQILAAEBAQ4JDwEMBwABAQoPAQIMAAEICg8BBAYAAQEKDwECDAABAQEOCQ8BCwYAAQEKDwECDQABCAoPAQQBAA=="],"S":[39,0,11,39,41,"DAABAwEHAQoBDAENAQ4CDwEOAQ0BDAELAQkBBwEFAQIUAAEBAQcBDREPAQwBCAEFAQEOAAEFAQ4WDwEFDQABCRgPAQUMAAEIGQ8BBQsAAQQaDwEFCwABDBoPAQUKAAEECg8BCwEGAQMBAQIAAQEBAgEEAQcBCgEOBQ8BBQoAAQkJDwEEDAABAwEIAQ0CDwEFCgABDQgPAQcQAAEEAQoBBQoACQ8BAhwAAQEJDwECHAABAgkPAQUcAAEBCQ8BDQEBHAABDgkPAQ4BBwECGgABCwwPAQ0BCQEGAQMWAAEHEA8BDgEMAQgBBAEBEQABAQEOFA8BCwEFAQEPAAEHFg8BDgEHAQEOAAELFw8BDQEDDQABAQEKGA8BBA4AAQYBDhYPAQ4BAg4AAQEBBwENFQ8BChEAAQQBCAEMEw8BAxMAAQEBBAEIAQsBDg4PAQcYAAEEAQgBDgsPAQsbAAEHCg8BDBwAAQcJDwENHQAJDwEOHQABDQgPAQwIAAEKAQYTAAEOCA8BCwgAAQwBDwEOAQcBAQ8AAQUJDwEJCAABDAQPAQsBBQEBCwABBAEOCQ8BBQgAAQwHDwEMAQgBBQEDAQIBAQEAAQEBAgEFAQoLDwEBCAABDBwPAQkJAAEMGw8BDgEBCQABDBsPAQUKAAEMGg8BBQsAAQUBCxcPAQ0BAw4AAQEBBQEJAQwRDwEMAQYUAAEBAQQBBgEIAQoBDAENAQ4DDwEOAQ0BCwEJAQUBAgwA"],"T":[37,0,12,37,39,"AQsjDwEIAQsjDwEIAQsjDwEIAQsjDwEIAQsjDwEIAQsjDwEIAQsjDwEIDQABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCA0A"],"U":[44,0,12,44,40,"BAABAQoPAQIMAAEECQ8BDQkAAQEKDwECDAABBAkPAQ0JAAEBCg8BAgwAAQQJDwENCQABAQoPAQIMAAEECQ8BDQkAAQEKDwECDAABBAkPAQ0JAAEBCg8BAgwAAQQJDwENCQABAQoPAQIMAAEECQ8BDQkAAQEKDwECDAABBAkPAQ0JAAEBCg8BAgwAAQQJDwENCQABAQoPAQIMAAEECQ8BDQkAAQEKDwECDAABBAkPAQ0JAAEBCg8BAgwAAQQJDwENCQABAQoPAQIMAAEECQ8BDQkAAQEKDwECDAABBAkPAQ0JAAEBCg8BAgwAAQQJDwENCQABAQoPAQIMAAEECQ8BDQkAAQEKDwECDAABBAkPAQ0JAAEBCg8BAgwAAQQJDwENCQABAQoPAQIMAAEECQ8BDQkAAQEKDwECDAABBAkPAQ0JAAEBCg8BAgwAAQQJDwENCQABAQoPAQIMAAEECQ8BDQkAAQEKDwECDAABBAkPAQ0JAAEBCg8BAgwAAQQJDwENCgAKDwECDAABBAkPAQ0KAAoPAQMMAAEFCQ8BDQoAAQ4JDwEEDAABBgkPAQsKAAEMCQ8BBgwAAQkJDwEKCgABCQkPAQoMAAEMCQ8BBwoAAQYJDwEOCwABAgoPAQQKAAECCg8BBwoAAQoJDwEODAABDAoPAQUIAAEHCg8BCQwAAQULDwELAQUBAgEAAQEBAgEGAQwLDwEDDQABDBwPAQoOAAEDGw8BDgEBDwABBRkPAQ4BAxEAAQUBDhYPAQ4BAxMAAQIBCxQPAQoBARYAAQQBCg8PAQ4BCQEDGgABAQEEAQgBCgEMAg4CDwEOAQ0BDAEKAQcBBA8A"],"V":[42,0,12,42,39,"AQgJDwEKFAABDQkPAQUBAwkPAQ4BARIAAQMJDwEOAgABDAkPAQYSAAEJCQ8BCQIAAQYJDwELEgABDgkPAQMCAAEBCg8BAhAAAQUJDwENBAABCgkPAQcQAAEKCQ8BBwQAAQUJDwEMDwABAQoPAQIFAAEOCQ8BAw4AAQYJDwELBgABCAkPAQgOAAELCQ8BBQYAAQMJDwEODQABAgkPAQ4BAQcAAQwJDwEEDAABBwkPAQkIAAEHCQ8BCgwAAQ0JDwEDCAABAQkPAQ4BAQoAAQMJDwENCgABCgkPAQUKAAEICQ8BBwoAAQUJDwELCgABDgkPAQILAAEOCQ8BAQgAAQQJDwELDAABCQkPAQcIAAEKCQ8BBQwAAQMJDwEMBwABAQEOCA8BDgEBDQABDAkPAQMGAAEGCQ8BCQ4AAQcJDwEIBgABCwkPAQQOAAEBCQ8BDQUAAQIJDwENEAABCwkPAQQEAAEHCQ8BBxAAAQUJDwEJBAABDAkPAQIRAAEOCA8BDgEBAgABAwkPAQsSAAEJCQ8BBQIAAQgJDwEGEgABAwkPAQsCAAENCA8BDgEBEwABDAkPAQEBBAkPAQkUAAEHCQ8BBwEJCQ8BBBQAAQEJDwEMAQ4IDwENFgABCxIPAQgWAAEFEg8BAhcAAQ4QDwELGAABCRAPAQYYAAEDDw8BDgEBGQABDQ4PAQoaAAEHDg8BBBoAAQINDwENHAABCwwPAQgcAAEFDA8BAg4A"],"W":[60,0,12,60,39,"AQABBAkPAQcMAAEDCQ8BDA0AAQ4IDwELAwABAQkPAQsMAAEHCg8BAQsAAQIJDwEIBAABDAgPAQ4MAAELCg8BBAsAAQYJDwEEBAABCAkPAQMLAAEOCg8BCAsAAQkJDwEBBAABBQkPAQYKAAEDCw8BCwsAAQ0IDwEMBQABAQkPAQoKAAEGCw8BDgoAAQIJDwEIBgABDQgPAQ4KAAEKDA8BAwkAAQUJDwEFBgABCQkPAQIJAAENDA8BBwkAAQkJDwEBBgABBQkPAQYIAAECDQ8BCgkAAQwIDwENBwABAgkPAQkIAAEGBg8BDgYPAQ4IAAEBCQ8BCQgAAQ0IDwENCAABCQYPAQcBDgYPAQMHAAEFCQ8BBggAAQoJDwEBBwABDQYPAQQBCwYPAQYHAAEICQ8BAggAAQYJDwEFBgABAQcPAQABBwYPAQoHAAEMCA8BDQkAAQIJDwEJBgABBQYPAQsBAAEEBg8BDQYAAQEJDwEKCgABDggPAQwGAAEIBg8BCAEAAQEHDwECBQABBAkPAQYKAAEKCQ8BAQUAAQwGDwEEAgABDAYPAQUFAAEICQ8BAwoAAQcJDwEEBAABAQcPAQECAAEIBg8BCQUAAQsIDwEOCwABAwkPAQgEAAEEBg8BDAMAAQQGDwENBQABDggPAQsMAAEOCA8BDAQAAQgGDwEIAwABAQcPAQEDAAEDCQ8BBwwAAQsJDwEBAwABCwYPAQUEAAEMBg8BBQMAAQcJDwEDDAABBwkPAQQDAAcPAQEEAAEJBg8BCAMAAQsJDw0AAQMJDwEHAgABAwYPAQ0FAAEFBg8BDAMAAQ4IDwELDgAJDwELAgABBwYPAQkFAAEBBw8BAQEAAQMJDwEIDgABCwgPAQ4CAAELBg8BBgYAAQ0GDwEEAQABBgkPAQQOAAEICQ8BAwEAAQ4GDwECBgABCQYPAQgBAAEKCQ8BAQ4AAQQJDwEHAQMGDwENBwABBQYPAQsBAAENCA8BDA8AAQEJDwEKAQYGDwEKBwABAgYPAQ4BAgkPAQkQAAEMCA8BDgEKBg8BBggAAQ0GDwEJCQ8BBRAAAQgQDwEDCAABChAPAQEQAAEFDw8BDgkAAQYPDwENEQABAQ8PAQsJAAECDw8BCRIAAQ0ODwEHCgABDg4PAQYSAAEJDg8BAwoAAQoODwECEgABBQ0PAQ4LAAEHDQ8BDhMAAQINDwELCwABAw0PAQoUAAENDA8BCAwAAQ4MDwEGFAABCgwPAQQMAAELDA8BAxQAAQYMDwEBDAABBwsPAQ4VAAECCw8BDA0AAQMLDwELCwA="],"X":[42,0,12,42,39,"AQABAgEOCQ8BBw8AAQEBDQkPAQoEAAEGCg8BAw4AAQoJDwEOAQEFAAELCQ8BDQ0AAQUKDwEFBgABAgEOCQ8BCAsAAQEBDgkPAQkIAAEFCg8BBAoAAQsJDwENAQEJAAEKCQ8BDQEBCAABBgoPAQQKAAEBAQ4JDwEJBwABAgEOCQ8BCAwAAQQKDwEFBgABCwkPAQ0OAAEJCQ8BDgEBBAABBwoPAQMOAAEBAQ0JDwEKAwABAgoPAQcQAAEDCg8BBQIAAQwJDwEMEgABCAkPAQ4BAgEHCQ8BDgECEwABDAkPAQwKDwEGFAABAxMPAQsWAAEHEQ8BDgECFwABDBAPAQUYAAECAQ4ODwEKGgABBg0PAQ4BARsAAQsMDwEEHAABCQwPAQMbAAEEDQ8BDBoAAQEBDQ4PAQgZAAEKEA8BBBcAAQURDwENAQEVAAEBAQ4SDwEJFQABCwkPAQ4KDwEEEwABBgoPAQMBCgkPAQ0BAREAAQIBDgkPAQgBAAEBAQ0JDwEKEQABCwkPAQwDAAEECg8BBQ8AAQcKDwEDBAABCQkPAQ4BAQ0AAQMKDwEHBQABAQENCQ8BCw0AAQwJDwEMBwABAwoPAQYLAAEICQ8BDgECCAABCAkPAQ4BAgkAAQMKDwEGCgABDAkPAQsIAAEBAQ0JDwELCwABAgoPAQcHAAEJCQ8BDgECDAABBwoPAQMFAAEECg8BBQ4AAQsJDwEMBAABAQENCQ8BCg8AAQIBDgkPAQgDAAEJCQ8BDgEBEAABBQoPAQMBAA=="],"Y":[39,-1,12,41,39,"AQMKDwENEQABDAoPAQQBAAEICg8BCA8AAQcKDwEJAwABDQoPAQMNAAECCg8BDQEBAwABAwoPAQwNAAELCg8BBAUAAQgKDwEHCwABBgoPAQoHAAENCg8BAgkAAQIBDgkPAQ4BAQcAAQMKDwELCQABCgoPAQUJAAEICg8BBgcAAQUKDwEKCwABDQkPAQ4BAgUAAQEBDgkPAQ4BAQsAAQMKDwEKBQABCgoPAQUNAAEICg8BBQMAAQQKDwEKDgABAQENCQ8BDgEBAQABAQENCQ8BDgEBDwABAwoPAQkBAAEJCg8BBREAAQgKDwEHCg8BChIAAQEBDRMPAQ4BARMAAQQTDwEFFQABCBEPAQoWAAEBAQ0PDwEOAQEXAAEEDw8BBRkAAQkNDwEKGgABAQENCw8BDgEBGwABBAsPAQUdAAEKCQ8BCx4AAQgJDwEJHgABCAkPAQkeAAEICQ8BCR4AAQgJDwEJHgABCAkPAQkeAAEICQ8BCR4AAQgJDwEJHgABCAkPAQkeAAEICQ8BCR4AAQgJDwEJHgABCAkPAQkeAAEICQ8BCR4AAQgJDwEJHgABCAkPAQkeAAEICQ8BCR4AAQgJDwEJDwA="],"Z":[39,0,12,39,39,"AwAhDwECBQAhDwECBQAhDwECBQAhDwECBQAhDwECBQAhDwECBQAgDwEMAQEYAAEBAQwKDwEOAQIZAAEKCw8BBBkAAQgLDwEGGQABBQsPAQkZAAEDAQ4KDwELGQABAQENCg8BDQEBGQABCwoPAQ4BAxkAAQkLDwEFGQABBgsPAQgZAAEECw8BChkAAQIBDgoPAQwBARgAAQEBDAoPAQ4BAhkAAQoLDwEEGQABCAsPAQYZAAEFCw8BCRkAAQMBDgoPAQsZAAEBAQ0KDwENAQEZAAELCg8BDgEDGQABCQsPAQUZAAEGCw8BCBkAAQQLDwEKGQABAgEOCg8BDAEBGAABAQEMCg8BDgECGQABCgsPAQQZAAEICw8BBhkAAQUhDwELBAABCSEPAQsEAAEJIQ8BCwQAAQkhDwELBAABCSEPAQsEAAEJIQ8BCwQAAQkhDwELAgA="],"[":[25,0,10,25,48,"BAABBRAPCAABBRAPCAABBRAPCAABBRAPCAABBRAPCAABBRAPCAABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBQgPAQkPAAEFCA8BCQ8AAQUIDwEJDwABBRAPCAABBRAPCAABBRAPCAABBRAPCAABBRAPCAABBRAPBAA="],"\\":[20,0,12,20,44,"AQ0EDwEODgABCAUPAQQNAAEDBQ8BCQ4AAQ0EDwEODgABCQUPAQQNAAEEBQ8BCA4AAQ4EDwENDgABCgUPAQMNAAEFBQ8BCA0AAQEBDgQPAQwOAAEKBQ8BAg0AAQYFDwEHDQABAQUPAQwOAAELBQ8BAQ0AAQYFDwEGDQABAgUPAQsOAAEMBQ8BAQ0AAQcFDwEFDQABAwUPAQoOAAENBA8BDg4AAQgFDwEEDQABAwUPAQkOAAEOBA8BDg4AAQkFDwEEDQABBAUPAQgOAAEOBA8BDQ4AAQoFDwEDDQABBQUPAQgNAAEBBQ8BDA4AAQsFDwECDQABBgUPAQcNAAEBBQ8BDA4AAQsFDwEBDQABBwUPAQYNAAECBQ8BCw4AAQwFDwEBDQABBwUPAQUNAAEDBQ8BCg4AAQ0EDwEODgABCAUPAQQNAAEDBQ8BCQ4AAQ4EDwEODgABCQUPAQQNAAEEBQ8BCA=="],"]":[25,0,10,25,48,"AwABBRAPAQEHAAEFEA8BAQcAAQUQDwEBBwABBRAPAQEHAAEFEA8BAQcAAQUQDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBDwABDggPAQEPAAEOCA8BAQ8AAQ4IDwEBBwABBRAPAQEHAAEFEA8BAQcAAQUQDwEBBwABBRAPAQEHAAEFEA8BAQcAAQUQDwEBBAA="],"^":[45,0,12,45,39,"EgABAgEOBg8BBSMAAQIBDQgPAQQhAAEBAQ0JDwEOAQMfAAEBAQwLDwEOAQMdAAEBAQsNDwEOAQIcAAELDw8BDQEBGgABChEPAQwBARgAAQkIDwELAQIBCAgPAQwBARYAAQgIDwEHAwABBQEOBw8BCxUAAQcHDwEOAQQFAAECAQwHDwEKEwABBgcPAQsBAQgAAQgHDwEJEQABBQcPAQgLAAEFAQ4GDwEIDwABBAYPAQ4BBA0AAQIBDAYPAQcNAAEDAQ4FDwELAQEQAAEIBg8BBgsAAQIBDgUPAQgTAAEFAQ4FDwEF/wD/AP8A/wBBAA=="],"_":[27,0,51,27,13,"2ACHDw=="],"`":[27,0,8,27,43,"AgABAgENBg8BBRMAAQIBDgUPAQ4BAhMAAQMBDgUPAQwUAAEDAQ4FDwEIFAABAwEOBQ8BBBQAAQMBDgQPAQ4BAhQAAQQBDgQPAQsVAAEEBQ8BCBUAAQQFDwEEFQABBQQPAQ4BAf8A/wD/AIcA"],"a":[36,0,20,36,32,"BQABAQEDAQUBBgEIAQoCDAENAg4CDwIOAQwBCgEIAQQBAQ8AAQETDwEOAQkBAg0AAQEWDwEIDAABARcPAQsLAAEBGA8BCgoAAQEZDwEECQABAQMPAQwBCQEGAQQBAgIBAQABAQECAQQBCAEOCQ8BDAkAAQEBDAEGAQEMAAEBAQoJDwEDGQABAQENCA8BCBoAAQgIDwELGgABBQgPAQ4aAAEFCQ8BAQwAAQIBBgEJAQsBDAIOEA8BAgoAAQYBDBcPAQIIAAEDAQ0ZDwEDBwABBAEOGg8BAwYAAQIBDhsPAQMGAAEKHA8BAwUAAQEKDwEOAQcBAwEBBQABBQkPAQMFAAEFCQ8BDAEBCAABBQkPAQMFAAEICQ8BAgkAAQcJDwEDBQABCQgPAQ4KAAELCQ8BAwUAAQoIDwENCQABAgoPAQMFAAEJCQ8BAQgAAQsKDwEDBQABBgkPAQoHAAEKCw8BAwUAAQIKDwELAQQBAQEAAQIBBgENDA8BAwYAAQwcDwEDBgABBBIPAQkJDwEDBwABBxAPAQYBBQkPAQMIAAEIDg8BBgEAAQUJDwEDCQABBAENCg8BCwEDAgABBQkPAQMLAAEFAQkBDAEOAQ8BDgENAQsBCAEDEgA="],"b":[39,0,10,39,42,"BAABBwkPHQABBwkPHQABBwkPHQABBwkPHQABBwkPHQABBwkPHQABBwkPHQABBwkPHQABBwkPHQABBwkPHQABBwkPBQABBAEJAQwBDgEPAQ4BDQEKAQYBAQ4AAQcJDwMAAQUBDQkPAQ4BBg0AAQcJDwIAAQkNDwELAQELAAEHCQ8BAAEKDw8BDAEBCgABBwkPAQkRDwELCgABBxwPAQYJAAEHHA8BDgEBCAABBwwPAQoBBAEBAQABAgEGAQ4KDwEICAABBwsPAQUGAAEBAQwJDwENCAABBwoPAQgIAAEBAQ4JDwEEBwABBwkPAQ4BAQkAAQcJDwEIBwABBwkPAQkKAAECCQ8BCwcAAQcJDwEFCwABDQgPAQ4HAAEHCQ8BAgsAAQsJDwEBBgABBwkPAQELAAEJCQ8BAgYAAQcJDwwAAQgJDwEDBgABBwkPDAABCAkPAQMGAAEHCQ8BAQsAAQkJDwECBgABBwkPAQILAAELCQ8BAQYAAQcJDwEFCwABDQgPAQ4HAAEHCQ8BCQoAAQIJDwELBwABBwkPAQ4BAQkAAQcJDwEIBwABBwoPAQgIAAEBAQ4JDwEFBwABBwsPAQUGAAEBAQwJDwENCAABBwwPAQoBBAEBAQABAgEGAQ0KDwEICAABBxwPAQ4BAQgAAQccDwEGCQABBwkPAQkRDwELCgABBwkPAQABCg8PAQwBAQoAAQcJDwIAAQkNDwELAQELAAEHCQ8DAAEFAQ0JDwEOAQccAAEEAQkBDAEOAg8BDQEKAQYBAQoA"],"c":[32,0,20,32,32,"DAABAQEFAQgBCwENAQ4CDwEOAQ0BCwEIAQUBARAAAQQBCg4PAQsBBQwAAQIBCxIPAQYKAAEFAQ4TDwEGCQABBhUPAQYIAAEFFg8BBgcAAQIBDhYPAQYHAAEKCw8BDQEHAQMBAQEAAQEBAwEHAQsDDwEGBgABAwsPAQYJAAEDAQsBDwEGBgABCQoPAQUMAAEGAQUGAAEOCQ8BCBQAAQMJDwEOAQEUAAEGCQ8BChUAAQgJDwEGFQABCQkPAQQVAAEKCQ8BAxUAAQoJDwEDFQABCQkPAQQVAAEICQ8BBhUAAQYJDwEKFQABAwkPAQ4BARUAAQ4JDwEIFQABCQoPAQUMAAIFBgABAwsPAQYJAAECAQoBDwEGBwABCgsPAQ0BBwEDAQEBAAEBAQMBBgELAw8BBgcAAQIBDhYPAQYIAAEFFg8BBgkAAQYVDwEGCgABBQEOEw8BBgsAAQIBCxIPAQYNAAEEAQoODwELAQUQAAEBAQUBCAELAQ0BDgIPAQ4BDQELAQgBBQEBBgA="],"d":[39,0,10,39,42,"GAABBgkPAQIcAAEGCQ8BAhwAAQYJDwECHAABBgkPAQIcAAEGCQ8BAhwAAQYJDwECHAABBgkPAQIcAAEGCQ8BAhwAAQYJDwECHAABBgkPAQIOAAECAQcBCwEOAg8BDQELAQcBAgQAAQYJDwECDAABAQEKCg8BCgECAgABBgkPAQILAAEDAQ4MDwEOAQQBAAEGCQ8BAgoAAQQBDg8PAQUBBgkPAQIJAAECAQ4RDwEJCQ8BAgkAAQscDwECCAABBR0PAQIIAAENCg8BCwEFAQEBAAECAQYBDQwPAQIHAAEECg8BCAcAAQoLDwECBwABCgkPAQsJAAENCg8BAgcAAQ4JDwECCQABBQoPAQIGAAECCQ8BDAsAAQ4JDwECBgABBQkPAQgLAAELCQ8BAgYAAQYJDwEGCwABCAkPAQIGAAEHCQ8BBAsAAQcJDwECBgABCAkPAQMLAAEGCQ8BAgYAAQgJDwEDCwABBgkPAQIGAAEHCQ8BBAsAAQcJDwECBgABBgkPAQYLAAEICQ8BAgYAAQUJDwEICwABCwkPAQIGAAECCQ8BDAsAAQ4JDwECBwABDgkPAQIJAAEFCg8BAgcAAQoJDwEKCQABDQoPAQIHAAEECg8BCAcAAQoLDwECCAABDQoPAQsBBQEBAQABAgEGAQwMDwECCAABBh0PAQIJAAELHA8BAgkAAQIBDhEPAQkJDwECCgABBAEODw8BBQEGCQ8BAgsAAQQBDgwPAQ4BBQEAAQYJDwECDAABAQEKCg8BCgECAgABBgkPAQIOAAECAQcBCwEOAg8BDgELAQgBAhMA"],"e":[37,0,20,37,32,"DAABAgEGAQkBDAENAQ4CDwEOAQwBCQEGAQIWAAEFAQwNDwELAQQSAAEDAQwRDwEKAQEPAAEGFA8BDQEDDQABCBYPAQ4BAwsAAQYYDwEOAQEJAAECCg8BCgEFAQEBAAEBAQQBCwkPAQsJAAELCQ8BBQcAAQcJDwEEBwABAwkPAQUJAAEKCA8BCwcAAQkIDwEMCgABAgkPAQIGAAEOCA8BBgsAAQ0IDwEGBQABAwkPAQILAAELCA8BCgUAAQYeDwEMBQABCB4PAQ4FAAEJHw8FAAEKHw8FAAEKHw8FAAEJHw8FAAEICQ8bAAEGCQ8BAhoAAQMJDwEGGwABDggPAQsbAAEKCQ8BAxEAAQUBCAcAAQQJDwENAQEOAAEFAQwBDwEJCAABCwkPAQwBAgoAAQIBBwENAw8BCQgAAQMLDwEKAQUBAgEBAQABAgEDAQUBCQEMBg8BCQkAAQYaDwEJCgABCBkPAQkLAAEGGA8BCQwAAQMBDBQPAQwBBwEBDgABBAELDw8BDAEIAQMTAAEBAQUBCAELAQ0BDgIPAQ4BDQEMAQoBBwEFAQEKAA=="],"f":[24,0,10,24,41,"CwABBQEIAQsBDQEOCA8JAAEHAQ4NDwcAAQEBDA8PBwABCxAPBgABBREPBgABCxEPBgAJDwEOAQYBAQsAAQIJDwEHDQABBAkPAQMNAAEECQ8BAg0AAQQJDwECCQAWDwEEAQAWDwEEAQAWDwEEAQAWDwEEAQAWDwEEAQAWDwEEAQAWDwEEBQABBAkPAQINAAEECQ8BAg0AAQQJDwECDQABBAkPAQINAAEECQ8BAg0AAQQJDwECDQABBAkPAQINAAEECQ8BAg0AAQQJDwECDQABBAkPAQINAAEECQ8BAg0AAQQJDwECDQABBAkPAQINAAEECQ8BAg0AAQQJDwECDQABBAkPAQINAAEECQ8BAg0AAQQJDwECDQABBAkPAQINAAEECQ8BAg0AAQQJDwECDQABBAkPAQINAAEECQ8BAggA"],"g":[39,0,20,39,43,"CgABAgEHAQsBDgIPAQ0BCwEHAQIbAAECAQoKDwEKAQICAAEGCQ8BAgsAAQQBDgwPAQ4BBAEAAQYJDwECCgABBRAPAQUBBgkPAQIJAAEDAQ4RDwEJCQ8BAgkAAQwcDwECCAABBx0PAQIIAAEOCg8BCwEFAQEBAAECAQYBDQwPAQIHAAEFCg8BCAcAAQoLDwECBwABCwkPAQoJAAENCg8BAgcAAQ4JDwECCQABBQoPAQIGAAEDCQ8BCwsAAQ4JDwECBgABBgkPAQgLAAEKCQ8BAgYAAQcJDwEFCwABCAkPAQIGAAEICQ8BBAsAAQcJDwECBgABCAkPAQMLAAEGCQ8BAgYAAQgJDwEECwABBgkPAQIGAAEHCQ8BBQsAAQgJDwECBgABBgkPAQcLAAEKCQ8BAgYAAQMJDwELCwABDgkPAQIHAAEOCQ8BAQkAAQUKDwECBwABCwkPAQkJAAENCg8BAgcAAQUKDwEGBwABCgsPAQIIAAEOCg8BCgEEAQEBAAECAQYBDQwPAQIIAAEHHQ8BAgkAAQwcDwECCQABAgEOEQ8BCQkPAQIKAAEEEA8BBQEGCQ8BAgsAAQQBDgwPAQ4BBAEAAQYJDwECDAABAgEKCg8BCgECAgABBwkPAQEOAAECAQgBCwEOAg8BDgELAQgBAgQAAQkIDwEOHQABDAgPAQwcAAECCQ8BCRwAAQkJDwEFCwABCwEDDgABBQkPAQ4MAAIPAQoBBAsAAQcKDwEIDAAEDwENAQkBBQEDAQEBAAEBAQIBBAEIAQ0KDwENAQEMABkPAQMNABgPAQUOABYPAQ0BBA8AFQ8BCQEBEAABAgEIAQ0PDwENAQcBAhUAAQEBBQEIAQoBDAIOAQ8BDgENAQwBCwEJAQYBAg8A"],"h":[38,0,10,38,41,"BAABBwkPHAABBwkPHAABBwkPHAABBwkPHAABBwkPHAABBwkPHAABBwkPHAABBwkPHAABBwkPHAABBwkPHAABBwkPBQABAwEIAQwBDgEPAQ4BDQELAQcBAg0AAQcJDwMAAQMBCwoPAQgBAQsAAQcJDwIAAQcNDwEMAQEKAAEHCQ8BAAEJDw8BDAoAAQcJDwEJEQ8BBwkAAQcbDwEOCQABBxwPAQUIAAEHDA8BCwEEAQEBAAEDAQkKDwEKCAABBwsPAQcGAAEHCQ8BDQgAAQcKDwEJCAABDQkPAQEHAAEHCQ8BDgEBCAABCQkPAQIHAAEHCQ8BCQkAAQYJDwECBwABBwkPAQUJAAEFCQ8BAwcAAQcJDwECCQABBQkPAQMHAAEHCQ8BAQkAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMDAA=="],"i":[19,0,10,19,41,"BAABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPVQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPBQA="],"j":[19,-2,10,21,53,"BgABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPXwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwgPAQ4LAAEICA8BDQsAAQoIDwEMCwABDQgPAQkKAAEFCQ8BBgcAAQEBAwEICg8BAQUAAQwNDwEKBgABDAwPAQ4BAgYAAQwMDwEGBwABDAsPAQYIAAEMCQ8BDAEECQABDAQPAQ4BDQEMAQgBBAsA"],"k":[36,0,10,37,41,"BAABBwkPGwABBwkPGwABBwkPGwABBwkPGwABBwkPGwABBwkPGwABBwkPGwABBwkPGwABBwkPGwABBwkPGwABBwkPGwABBwkPCgABCgoPAQUFAAEHCQ8JAAEJCQ8BDgEEBgABBwkPCAABCQkPAQ4BBAcAAQcJDwcAAQkJDwEOAQMIAAEHCQ8GAAEJCQ8BDgEDCQABBwkPBQABCQkPAQ0BAgoAAQcJDwQAAQkJDwENAQILAAEHCQ8DAAEICQ8BDQECDAABBwkPAgABCAkPAQwBAQ0AAQcJDwEAAQgJDwEMAQEOAAEHCQ8BCAkPAQsBAQ8AAQcSDwELAQEQAAEHEQ8BChIAAQcQDwELEwABBxAPAQ4BAxIAAQcRDwEOAQIRAAEHEg8BDQECEAABBwkPAQ0JDwENAQIPAAEHCQ8BAwEOCQ8BDQEBDgABBwkPAQABAwEOCQ8BDAEBDQABBwkPAgABBAoPAQwBAQwAAQcJDwMAAQUKDwELAQELAAEHCQ8EAAEGCg8BCwsAAQcJDwUAAQcKDwEKCgABBwkPBgABCQoPAQoJAAEHCQ8HAAEKCg8BCQgAAQcJDwgAAQsKDwEJBwABBwkPCAABAQEMCg8BCAYAAQcJDwkAAQEBDAoPAQcFAAEHCQ8KAAEBAQ0KDwEH"],"l":[19,0,10,19,41,"BAABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPCQABBwkPBQA="],"m":[56,0,20,56,31,"EgABAQEGAQsBDQEPAQ4BDQEKAQYBAQkAAQMBCAEMAQ4BDwEOAQ0BCgEGAQENAAEICQ8DAAEHAQ4IDwEOAQYGAAEDAQsJDwEOAQYMAAEICQ8BAAEBAQsMDwEKBAABBg0PAQkLAAEICQ8BAQEMDg8BCQIAAQcPDwEICgABCAkPAQoQDwIFEQ8BAwkAAQgaDwENAQ4RDwELCQABCC4PAQIIAAEICw8BDgEHAQIBAAEBAQYBDg0PAQgBAgEAAQEBBwoPAQYIAAEICg8BDgEDBQABBgsPAQ4BAwUAAQYJDwEJCAABCAoPAQUHAAEOCg8BBgcAAQ4IDwEMCAABCAkPAQ0IAAEMCQ8BDQgAAQoIDwENCAABCAkPAQgIAAEKCQ8BCQgAAQgIDwEOCAABCAkPAQQIAAEJCQ8BBQgAAQcJDwgAAQgJDwECCAABCAkPAQIIAAEHCQ8IAAEICQ8JAAEICQ8BAQgAAQcJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwgAAQgJDwkAAQgJDwkAAQgJDwQA"],"n":[38,0,20,38,31,"EwABAwEIAQwBDgEPAQ4BDQELAQcBAg0AAQcJDwMAAQMBCwoPAQgBAQsAAQcJDwIAAQcNDwEMAQEKAAEHCQ8BAAEJDw8BDAoAAQcJDwEJEQ8BBwkAAQcbDwEOCQABBxwPAQUIAAEHDA8BCwEEAQEBAAEDAQkKDwEKCAABBwsPAQcGAAEHCQ8BDQgAAQcKDwEJCAABDQkPAQEHAAEHCQ8BDgEBCAABCQkPAQIHAAEHCQ8BCQkAAQYJDwECBwABBwkPAQUJAAEFCQ8BAwcAAQcJDwECCQABBQkPAQMHAAEHCQ8BAQkAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMHAAEHCQ8KAAEECQ8BAwcAAQcJDwoAAQQJDwEDBwABBwkPCgABBAkPAQMDAA=="],"o":[37,0,20,37,32,"DAABAgEGAQoBDAIOAg8BDgEMAQoBBwEDFgABBgEMDQ8BDQEHAQERAAEEAQ0RDwEOAQUPAAEIFQ8BCQ0AAQkXDwELCwABBxkPAQkJAAEDGw8BBQgAAQwKDwEMAQUBAgEAAQEBBQELCg8BDQcAAQQKDwEIBwABBwoPAQUGAAEKCQ8BCwkAAQkJDwELBgABDgkPAQIJAAEBCg8BAQQAAQMJDwEMCwABCgkPAQUEAAEGCQ8BCAsAAQYJDwEIBAABCAkPAQULAAEECQ8BCQQAAQkJDwEDCwABAgkPAQsEAAEKCQ8BAwsAAQEJDwELBAABCgkPAQMLAAEBCQ8BCwQAAQkJDwEDCwABAgkPAQsEAAEICQ8BBQsAAQQJDwEJBAABBgkPAQgLAAEGCQ8BCAQAAQMJDwEMCwABCgkPAQUFAAEOCQ8BAgkAAQEKDwEBBQABCgkPAQsJAAEJCQ8BCwYAAQQKDwEIBwABBwoPAQYHAAEMCg8BDAEFAQIBAAEBAQUBCwoPAQ0IAAEDGw8BBQkAAQcZDwEJCwABCRcPAQsNAAEIFQ8BCg8AAQQBDREPAQ4BBhIAAQYBDA0PAQ0BBwEBFQABAgEHAQoBDAEOAw8BDgEMAQoBBwEDDAA="],"p":[39,0,20,39,42,"EwABBAEJAQwBDgEPAQ4BDQEKAQYBAQ4AAQcJDwMAAQUBDQkPAQ4BBg0AAQcJDwIAAQkNDwELAQELAAEHCQ8BAAEKDw8BDAEBCgABBwkPAQkRDwELCgABBxwPAQYJAAEHHA8BDgEBCAABBwwPAQoBBAEBAQABAgEGAQ4KDwEICAABBwsPAQUGAAEBAQwJDwENCAABBwoPAQgIAAEBAQ4JDwEEBwABBwkPAQ4BAQkAAQcJDwEIBwABBwkPAQkKAAECCQ8BCwcAAQcJDwEFCwABDQgPAQ4HAAEHCQ8BAgsAAQsJDwEBBgABBwkPAQELAAEJCQ8BAgYAAQcJDwwAAQgJDwEDBgABBwkPDAABCAkPAQMGAAEHCQ8BAQsAAQkJDwECBgABBwkPAQILAAELCQ8BAQYAAQcJDwEFCwABDQgPAQ4HAAEHCQ8BCQoAAQIJDwELBwABBwkPAQ4BAQkAAQcJDwEIBwABBwoPAQgIAAEBAQ4JDwEFBwABBwsPAQUGAAEBAQwJDwENCAABBwwPAQoBBAEBAQABAgEGAQ0KDwEICAABBxwPAQ4BAQgAAQccDwEGCQABBwkPAQkRDwELCgABBwkPAQABCg8PAQwBAQoAAQcJDwIAAQkNDwELAQELAAEHCQ8DAAEFAQ0JDwEOAQcNAAEHCQ8FAAEEAQkBDAEOAg8BDQEKAQYBAQ4AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDxkA"],"q":[39,0,20,39,42,"CgABAgEHAQsBDgIPAQ0BCwEHAQIbAAEBAQoKDwEKAQICAAEGCQ8BAgsAAQQBDgwPAQ4BBAEAAQYJDwECCgABBBAPAQUBBgkPAQIJAAECAQ4RDwEJCQ8BAgkAAQscDwECCAABBh0PAQIIAAENCg8BCwEFAQEBAAECAQYBDQwPAQIHAAEECg8BCAcAAQoLDwECBwABCgkPAQsJAAENCg8BAgcAAQ4JDwECCQABBQoPAQIGAAECCQ8BDAsAAQ4JDwECBgABBQkPAQgLAAELCQ8BAgYAAQYJDwEGCwABCAkPAQIGAAEHCQ8BBAsAAQcJDwECBgABCAkPAQMLAAEGCQ8BAgYAAQgJDwEDCwABBgkPAQIGAAEHCQ8BBAsAAQcJDwECBgABBgkPAQYLAAEICQ8BAgYAAQUJDwEICwABCwkPAQIGAAECCQ8BDAsAAQ4JDwECBwABDQkPAQIJAAEFCg8BAgcAAQoJDwEKCQABDQoPAQIHAAEECg8BCAcAAQoLDwECCAABDQoPAQsBBQEBAQABAgEGAQwMDwECCAABBR0PAQIJAAELHA8BAgkAAQIBDhEPAQkJDwECCgABBAEODw8BBQEGCQ8BAgsAAQQBDgwPAQ4BBQEAAQYJDwECDAABAQEKCg8BCgECAgABBgkPAQIOAAECAQcBCwEOAg8BDgELAQgBAgQAAQYJDwECHAABBgkPAQIcAAEGCQ8BAhwAAQYJDwECHAABBgkPAQIcAAEGCQ8BAhwAAQYJDwECHAABBgkPAQIcAAEGCQ8BAhwAAQYJDwECHAABBgkPAQIEAA=="],"r":[27,0,20,27,31,"EwABAwEIAQwBDgEPAQ4BDQEFBAABBwkPAwABAgELBw8BBwQAAQcJDwIAAQQBDggPAQcEAAEHCQ8BAAEECg8BBwQAAQcJDwECAQ4KDwEHBAABBwkPAQsLDwEHBAABBxUPAQcEAAEHDA8BDgEJAQQBAQEAAQIBAwEGAQoBBgQAAQcLDwEMAQINAAEHCg8BDQEBDgABBwoPAQQPAAEHCQ8BDBAAAQcJDwEHEAABBwkPAQQQAAEHCQ8BARAAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDxEAAQcJDw0A"],"s":[32,0,20,32,32,"CQABAwEHAQoBDAENAQ4CDwEOAQ0BCwEJAQcBBAEBDwABBwENDw8BDQEJAQUBAQkAAQMBDRQPAQkIAAEDAQ4VDwEJCAABDRYPAQkHAAEGFw8BCQcAAQsIDwELAQUBAgEBAQABAQECAQQBBwELAQ4EDwEJBwAIDwEKCgABAQEFAQoCDwEJBgABAggPAQMNAAEBAggGAAEDCA8BAxYAAQIIDwEKFgABAQkPAQwBBgECFAABDQwPAQ0BCgEIAQYBAw4AAQkRDwEOAQsBBgEBCgABAhUPAQkBAQkAAQcVDwEOAQMJAAEHFQ8BDgECCQABAwELFA8BCQsAAQIBBwELEg8BAQ4AAQIBBQEHAQkBDAEOCw8BBBQAAQMBCgkPAQcWAAELCA8BCBYAAQcIDwEIBQABCQEGAQEOAAEICA8BBwUAAQsBDwEOAQgBBAsAAQIBDggPAQUFAAELBA8BDgEKAQcBBAECAQECAAEBAQMBCAEOCQ8BAQUAAQsYDwEKBgABCxcPAQ4BAgYAAQsWDwEOAQQHAAELFQ8BDQEDCAABAQEFAQkBDRAPAQ0BBg4AAQEBBAEHAQkBCwENAg4CDwEOAQ0BCwEJAQYBAgkA"],"t":[26,0,13,26,38,"BQABCQgPAQ0QAAEJCA8BDRAAAQkIDwENEAABCQgPAQ0QAAEJCA8BDRAAAQkIDwENEAABCQgPAQ0QAAEJCA8BDQsAAQQXDwEJAQABBBcPAQkBAAEEFw8BCQEAAQQXDwEJAQABBBcPAQkBAAEEFw8BCQEAAQQXDwEJBgABCQgPAQ0QAAEJCA8BDRAAAQkIDwENEAABCQgPAQ0QAAEJCA8BDRAAAQkIDwENEAABCQgPAQ0QAAEJCA8BDRAAAQkIDwENEAABCQgPAQ0QAAEJCA8BDRAAAQkIDwENEAABCQgPAQ0QAAEICA8BDhAAAQcJDwEDDwABBgkPAQ0BBQEBDQABAxEPAQsIAAEOEA8BCwgAAQkQDwELCAABAgEODw8BCwkAAQUPDwELCgABAwEMDQ8BCwwAAQQBCAELAQ0BDggPAQsCAA=="],"u":[38,0,21,38,31,"BAABDAgPAQsKAAEICA8BDggAAQwIDwELCgABCAgPAQ4IAAEMCA8BCwoAAQgIDwEOCAABDAgPAQsKAAEICA8BDggAAQwIDwELCgABCAgPAQ4IAAEMCA8BCwoAAQgIDwEOCAABDAgPAQsKAAEICA8BDggAAQwIDwEKCgABCAgPAQ4IAAEMCA8BCgoAAQgIDwEOCAABDAgPAQoKAAEICA8BDggAAQwIDwEKCgABCAgPAQ4IAAEMCA8BCgoAAQgIDwEOCAABDAgPAQoKAAEICA8BDggAAQwIDwEKCgABCAgPAQ4IAAEMCA8BCgoAAQgIDwEOCAABDAgPAQoKAAEICA8BDggAAQwIDwEKCgABCQgPAQ4IAAEMCA8BCwoAAQsIDwEOCAABDAgPAQsKAAENCA8BDggAAQsIDwENCQABAwkPAQ4IAAEKCQ8JAAEJCQ8BDggAAQkJDwEEBwABAwoPAQ4IAAEGCQ8BDAEBBQABAgENCg8BDggAAQMKDwENAQUCAQECAQcBDgsPAQ4JAAEOGw8BDgkAAQgbDwEOCQABAQEOEA8BDQEKCA8BDgoAAQUPDwENAQIBCAgPAQ4LAAEGDQ8BDAECAQABCAgPAQ4MAAEEAQ0JDwEOAQcDAAEICA8BDg4AAQQBCQEMAQ4BDwEOAQ0BCgEGAQESAA=="],"v":[35,0,21,35,30,"AQEBDggPAQYNAAEECQ8BAwEAAQkIDwEMDQABCQgPAQwCAAEDCQ8BAgwAAQ4IDwEHAwABDQgPAQcLAAEFCQ8BAQMAAQcIDwENCwABCggPAQoEAAEBCQ8BAwkAAQEBDggPAQQFAAEKCA8BCAkAAQUIDwENBgABBAgPAQ4JAAELCA8BBwcAAQ0IDwEEBwABAQkPAQIHAAEICA8BCQcAAQYIDwELCAABAggPAQ4HAAEMCA8BBQkAAQsIDwEFBQABAggPAQ4KAAEFCA8BCgUAAQcIDwEICwABDggPAQEEAAENCA8BAwsAAQkIDwEGAwABAwgPAQwMAAEDCA8BCwMAAQgIDwEGDQABDAgPAQICAAENBw8BDgEBDQABBggPAQcBAAEECA8BCQ4AAQEIDwEMAQABCQgPAQQPAAEKCA8BAwEOBw8BDRAAAQQIDwEMCA8BBxEAAQ0QDwEBEQABBw8PAQoSAAECDw8BBBMAAQsNDwENFAABBQ0PAQgVAAEODA8BAhUAAQgLDwELFgABAgsPAQUXAAEMCQ8BDgEBCwA="],"w":[50,0,21,50,30,"AgABDggPAQMIAAECCA8BAQgAAQQIDwENBAABCwgPAQcIAAEFCA8BBAgAAQgIDwEJBAABBwgPAQoIAAEJCA8BCAgAAQwIDwEFBAABAwgPAQ4IAAEMCA8BCwcAAQEJDwECBQABDggPAQIGAAEBCg8HAAEECA8BDQYAAQoIDwEGBgABBQoPAQQGAAEHCA8BCQYAAQYIDwEKBgABCAoPAQcGAAELCA8BBQYAAQIIDwENBgABDAoPAQsGAAEOCA8BAQcAAQ0IDwECBAABAQsPAQ4FAAEDCA8BDAgAAQoIDwEFBAABBAUPAQ4GDwEDBAABBwgPAQgIAAEGCA8BCQQAAQgFDwEKAQwFDwEHBAABCwgPAQQIAAECCA8BDQQAAQsFDwEGAQgFDwEKBAABDggPAQEJAAENCA8BAQMABg8BAwEFBQ8BDgMAAQMIDwEMCgABCQgPAQUCAAEEBQ8BDgEAAQEGDwEDAgABBwgPAQgKAAEFCA8BCAIAAQcFDwELAgABDAUPAQYCAAEKCA8BBAoAAQEIDwEMAgABCwUPAQcCAAEJBQ8BCgIAAQ4HDwEODAABDAgPAQEBAAEOBQ8BAwIAAQUFDwENAQABAwgPAQsMAAEJCA8BBAEDBQ8BDgMAAQEGDwECAQYIDwEHDAABBQgPAQgBBwUPAQsEAAENBQ8BBgEKCA8BAwwAAQEIDwELAQoFDwEIBAABCQUPAQkBDgcPAQ4OAAEMBw8CDgUPAQQEAAEGBQ8BDggPAQoOAAEIDg8BAQQAAQIODwEHDgABBA0PAQwGAAENDQ8BAw4AAQENDwEIBgABCgwPAQ4QAAELDA8BBQYAAQYMDwEKEAABBwwPAQEGAAEDDA8BBhAAAQQLDwEMCAABDgsPAQIRAAEOCg8BCQgAAQoKDwENEgABCwoPAQUIAAEHCg8BCRIAAQcKDwECCAABAwoPAQUJAA=="],"x":[35,0,21,35,30,"AQABBAkPAQoLAAEMCA8BDgECAwABCQkPAQUJAAEICQ8BBgUAAQwIDwEOAQIHAAEECQ8BCgYAAQIBDggPAQsGAAEBAQ0IDwENAQEHAAEGCQ8BBgUAAQkJDwEDCQABCggPAQ4BAgMAAQQJDwEHCgABAQENCA8BCwIAAQEBDggPAQsMAAEDCQ8BBgEAAQoIDwEOAQENAAEHCA8BDgEHCQ8BBA8AAQsRDwEIEAABAgEODw8BDBIAAQQODwEOAQITAAEJDQ8BBRUAAQwLDwEJFgABAwoPAQ4BARYAAQkLDwEHFQABBQ0PAQMTAAECAQ4NDwENAQESAAEMDw8BChEAAQgRDwEGDwABBAkPAQ0IDwEOAQINAAEBAQ4IDwEKAQEBDQgPAQwNAAELCA8BDgEBAQABBAkPAQkLAAEHCQ8BBQMAAQgJDwEECQABAwkPAQkFAAEMCA8BDgEBBwABAQENCA8BDQEBBQABAwkPAQsHAAEKCQ8BBAcAAQcJDwEHBQABBgkPAQgJAAELCQ8BAwMAAQIBDggPAQwKAAECAQ4IDwENAQECAAEMCQ8BAwsAAQUJDwEKAQA="],"y":[35,0,21,35,42,"AQIJDwEEDQABBgkPAQEBAAELCA8BCg0AAQsIDwEKAgABBAkPAQELAAEBCQ8BBAMAAQ0IDwEHCwABBggPAQ4EAAEHCA8BDQsAAQsIDwEIBAABAQEOCA8BBAkAAQEJDwECBQABCQgPAQkJAAEGCA8BDAYAAQMIDwEOAQEIAAELCA8BBgcAAQwIDwEGBwABAQkPAQEHAAEFCA8BDAcAAQYIDwEKCQABDggPAQMGAAELCA8BBQkAAQgIDwEJBQABAQgPAQ4KAAECCA8BDgUAAQUIDwEICwABCggPAQUEAAEKCA8BAwsAAQQIDwELAwABAQgPAQwNAAEMCA8BAgIAAQUIDwEHDQABBggPAQgCAAEKCA8BAQ0AAQEBDgcPAQ4BAAEBCA8BCg8AAQkIDwIFCA8BBQ8AAQIIDwIKBw8BDhEAAQsQDwEJEQABBRAPAQMSAAENDg8BDBMAAQcODwEHEwABAQ4PAQEUAAEJDA8BCxUAAQMMDwEFFgABDAoPAQ4XAAEGCg8BCRgAAQ4JDwEDGAABCAgPAQ0ZAAEECA8BBxkAAQkIDwECGAABAQEOBw8BCxkAAQgIDwEEFgABAQEEAQoIDwEMEwABCQ4PAQQTAAEJDQ8BChQAAQkMDwENAQEUAAEJCw8BDQECFQABCQoPAQoBARYAAQkFDwEOAQ0BCwEIAQITAA=="],"z":[31,0,21,31,30,"AwABDhgPAQ0FAAEOGA8BDQUAAQ4YDwENBQABDhgPAQ0FAAEOGA8BDQUAAQ4YDwENBQABDhgPAQwTAAEHCQ8BDgECEgABBwkPAQ4BAxIAAQYJDwEOAQMSAAEFCQ8BDgEDEgABBQoPAQQSAAEECg8BBRIAAQQBDgkPAQUSAAEDAQ4JDwEGEgABAwEOCQ8BBxIAAQIBDgkPAQcSAAECAQ0JDwEIEgABAgENCQ8BCRIAAQEBDQkPAQkSAAEBAQwJDwEKEgABAQEMCQ8BCxMAAQsJDwELEwABCBkPAQ0EAAEJGQ8BDQQAAQkZDwENBAABCRkPAQ0EAAEJGQ8BDQQAAQkZDwENBAABCRkPAQ0CAA=="],"{":[38,0,10,38,50,"FAABAwEIAQsBDQEOBg8BChgAAQUBDQsPAQoXAAEIDQ8BChYAAQYODwEKFQABAQEODg8BChUAAQYPDwEKFQABCgkPAQwBBgEDAQEYAAENCA8BDBwACQ8BBRwACQ8BAhsAAQEJDxwAAQEIDwEOHAABAQgPAQ4cAAEBCA8BDhwAAQEIDwEOHAABAQgPAQ4cAAECCA8BDhwAAQQIDwENHAABBwgPAQwcAAENCA8BChsAAQgJDwEHFwABAQEDAQYBDAoPAQIUAAEEDw8BCBUAAQQODwEJFgABBAsPAQ4BCQEDFwABBAwPAQ0BBwEBFgABBA4PAQwBARUAAQQPDwELGAABAQEDAQYBDAoPAQMbAAEJCQ8BCBwAAQ0IDwELHAABBwgPAQwcAAEECA8BDRwAAQIIDwEOHAABAQgPAQ4cAAEBCA8BDhwAAQEIDwEOHAABAQgPAQ4cAAEBCA8BDhwAAQEJDx0ACQ8BAhwAAQ4IDwEFHAABDQgPAQwcAAEKCQ8BDAEGAQMBARgAAQYPDwEKFQABAQEODg8BChYAAQYODwEKFwABCA0PAQoYAAEEAQ0LDwEKGgABAwEIAQsBDQEOBg8BCgYA"],"|":[20,0,10,20,54,"BgABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENDQABAgUPAQ0NAAECBQ8BDQ0AAQIFDwENBwA="],"}":[38,0,10,38,50,"BgABBAYPAQ4BDQEMAQkBBgEBGQABBAsPAQ4BCQEBFwABBA0PAQ0BAhYAAQQODwEMFgABBA8PAQYVAAEEDw8BDRgAAQEBAgEEAQkKDwECGwABBQkPAQUcAAENCA8BBhwAAQoIDwEHHAABCAgPAQgcAAEHCA8BCBwAAQcIDwEIHAABBwgPAQgcAAEHCA8BCBwAAQcIDwEIHAABBwgPAQkcAAEGCA8BChwAAQUIDwEOHAABAwkPAQQbAAEBCQ8BDQECGwABCgkPAQ4BCAEEAQEYAAECAQ4ODwEKFgABBAENDQ8BChcAAQEBBgEMCw8BChcAAQMBCwwPAQoWAAEHDg8BChUAAQQPDwEKFQABCwkPAQ4BCAEEAgEWAAEBCQ8BDQECGgABBAkPAQUbAAEGCA8BDhwAAQcIDwELHAABBwgPAQkcAAEHCA8BCBwAAQcIDwEIHAABBwgPAQgcAAEHCA8BCBwAAQcIDwEIHAABCAgPAQgcAAEKCA8BBxwAAQ0IDwEGGwABBgkPAQUXAAEBAQIBBAEJCg8BAhQAAQQPDwENFQABBA8PAQYVAAEEDg8BDBYAAQQNDwENAQIWAAEECw8BDgEIAQEXAAEEBg8BDgENAQwBCQEGAQETAA=="],"~":[45,0,28,45,23,"JwABAxAAAQMBCAEMAQ0BDwEOAQ0BCgEGAQEQAAEBAQsBCA4AAQUBDAoPAQoBBA0AAQMBDQEPAQgMAAECAQsODwEMAQYBAQgAAQEBCQMPAQgLAAEFAQ4RDwEOAQoBBgECAQEBAAECAQUBCgUPAQgKAAEEIQ8BCAoAAQQhDwEHCgABBAUPAQoBBQECAQEBAAECAQUBCQEOEg8BCAsAAQQDDwEIAQEJAAEEAQoODwENAQQMAAEEAQ8BDAEDDQABAgEIAQ4JDwEOAQcOAAEEAQkSAAEEAQkBDAEOAQ8BDgEMAQkBBP8A/wApAA=="],"А":[42,0,12,42,39,"DgABBQwPAQIcAAELDA8BCBsAAQINDwENGwABBw4PAQQaAAENDg8BChkAAQMPDwEOAQEYAAEJEA8BBhgAAQ4QDwELFwABBRIPAQIWAAELCA8BDQEOCA8BCBUAAQEJDwEHAQoIDwENFQABBwkPAQIBBQkPAQQUAAEMCA8BDAEAAQEBDggPAQkTAAEDCQ8BBwIAAQoIDwEOAQESAAEJCQ8BAgIAAQUJDwEGEgABDggPAQsEAAEOCA8BCxEAAQUJDwEGBAABCQkPAQIQAAELCQ8BAQQAAQQJDwEHDwABAQkPAQsGAAEOCA8BDQ8AAQcJDwEGBgABCQkPAQQOAAEMCQ8BAQYAAQQJDwEJDQABAwkPAQsIAAEOCA8BDgEBDAABCQkPAQUIAAEJCQ8BBQwAAQ4IDwEOAQEIAAEDCQ8BCwsAAQUJDwEKCgABDQkPAQIKAAEKHg8BBwkAAQEfDwENCQABByAPAQMIAAEMIA8BCQcAAQMhDwEOAQEGAAEIIg8BBQYAAQ4iDwELBQABBQkPAQwPAAEBAQ4JDwECBAABCgkPAQYQAAEJCQ8BBwMAAQEKDwEBEAABBAkPAQ0DAAEGCQ8BCxIAAQ4JDwEDAgABDAkPAQUSAAEICQ8BCQEAAQMJDwEOAQESAAEDCQ8BDgEAAQgJDwEKFAABDQkPAQU="],"Б":[41,0,12,41,39,"BAABAR0PAQsKAAEBHQ8BCwoAAQEdDwELCgABAR0PAQsKAAEBHQ8BCwoAAQEdDwELCgABAR0PAQsKAAEBCg8BAh0AAQEKDwECHQABAQoPAQIdAAEBCg8BAh0AAQEKDwECHQABAQoPAQIdAAEBCg8BAh0AAQEKDwECHQABAQoPAQIdAAEBEQ8CDgENAQwBCQEHAQQQAAEBGA8BDgEJAQMNAAEBGw8BCgECCwABARwPAQ4BAwoAAQEdDwEOAQMJAAEBHg8BDAkAAQEfDwEGCAABAQoPAQIGAAEBAQMBBwEOCg8BCwgAAQEKDwECCQABAQEMCg8BAQcAAQEKDwECCgABAwoPAQMHAAEBCg8BAgsAAQ0JDwEEBwABAQoPAQILAAEMCQ8BBQcAAQEKDwECCwABDgkPAQQHAAEBCg8BAgoAAQMKDwEDBwABAQoPAQIJAAEBAQwKDwEBBwABAQoPAQIGAAEBAQMBBwEOCg8BCwgAAQEfDwEGCAABAR4PAQ0JAAEBHg8BAwkAAQEcDwEOAQQKAAEBGw8BCgECCwABARgPAQ4BCQEDDQABARIPAQ4BDQEMAQkBBwEEDAA="],"В":[41,0,12,41,39,"BAABAREPAQ4BDQEMAQoBCAEFAQEQAAEBGA8BCwEGDgABARoPAQ0BAwwAAQEbDwEOAQQLAAEBHA8BDgECCgABAR0PAQsKAAEBHg8BAgkAAQEKDwECBQABAQEDAQgLDwEGCQABAQoPAQIIAAEECg8BCQkAAQEKDwECCQABCgkPAQoJAAEBCg8BAgkAAQcJDwELCQABAQoPAQIJAAEHCQ8BCgkAAQEKDwECCQABCgkPAQcJAAEBCg8BAggAAQMKDwEDCQABAQoPAQIFAAEBAQMBCAEOCQ8BCwoAAQEcDwEOAQIKAAEBGw8BDgEECwABARoPAQkBAQwAAQEZDwEOAQgBAgwAAQEbDwEOAQcLAAEBHQ8BCQoAAQEeDwEHCQABAQoPAQIGAAEBAQQBCQsPAQIIAAEBCg8BAgkAAQMBDgkPAQkIAAEBCg8BAgoAAQUJDwEOCAABAQoPAQILAAEOCQ8BAgcAAQEKDwECCwABDAkPAQQHAAEBCg8BAgsAAQwJDwEFBwABAQoPAQILAAEOCQ8BBAcAAQEKDwECCgABBQoPAQMHAAEBCg8BAgkAAQMBDgoPAQEHAAEBCg8BAgYAAQEBBAEJCw8BDAgAAQEfDwEHCAABAR4PAQ0BAQgAAQEeDwEECQABAR0PAQUKAAEBGw8BDAEDCwABARkPAQsBBQ0AAQESDwEOAQ0BDAEKAQgBBQEBCwA="],"Г":[34,0,12,34,39,"BAABARsPAQ4FAAEBGw8BDgUAAQEbDwEOBQABARsPAQ4FAAEBGw8BDgUAAQEbDwEOBQABARsPAQ4FAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECFgABAQoPAQIWAAEBCg8BAhYAAQEKDwECEgA="],"Д":[48,0,12,48,47,"CgABCBwPAQQSAAEIHA8BBBIAAQgcDwEEEgABCBwPAQQSAAEIHA8BBBIAAQgcDwEEEgABCBwPAQQSAAEICQ8BCQgAAQ0JDwEEEgABCAkPAQkIAAENCQ8BBBIAAQgJDwEJCAABDQkPAQQSAAEICQ8BCQgAAQ0JDwEEEgABCAkPAQkIAAENCQ8BBBIAAQgJDwEJCAABDQkPAQQSAAEJCQ8BCQgAAQ0JDwEEEgABCQkPAQgIAAENCQ8BBBIAAQkJDwEICAABDQkPAQQSAAEJCQ8BBwgAAQ0JDwEEEgABCQkPAQcIAAENCQ8BBBIAAQoJDwEGCAABDQkPAQQSAAEKCQ8BBQgAAQ0JDwEEEgABCwkPAQQIAAENCQ8BBBIAAQsJDwEDCAABDQkPAQQSAAEMCQ8BAggAAQ0JDwEEEgABDQkPAQEIAAENCQ8BBBIAAQ4IDwEOCQABDQkPAQQSAAkPAQwJAAENCQ8BBBEAAQIJDwEKCQABDQkPAQQRAAEFCQ8BBwkAAQ0JDwEEEQABCwkPAQQJAAENCQ8BBBAAAQQKDwEBCQABDQkPAQQPAAECAQ4JDwELCgABDQkPAQQOAAEEAQ4KDwEGCgABDQkPAQQLAAELKA8BDQYAAQsoDwENBgABCygPAQ0GAAELKA8BDQYAAQsoDwENBgABCygPAQ0GAAELKA8BDQYAAQsGDwEOGgABDAYPAQ0GAAELBg8BDhoAAQwGDwENBgABCwYPAQ4aAAEMBg8BDQYAAQsGDwEOGgABDAYPAQ0GAAELBg8BDhoAAQwGDwENBgABCwYPAQ4aAAEMBg8BDQYAAQsGDwEOGgABDAYPAQ0GAAELBg8BDhoAAQwGDwENAwA="],"Е":[37,0,12,37,39,"BAABARsPAQUIAAEBGw8BBQgAAQEbDwEFCAABARsPAQUIAAEBGw8BBQgAAQEbDwEFCAABARsPAQUIAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBGg8BBQkAAQEaDwEFCQABARoPAQUJAAEBGg8BBQkAAQEaDwEFCQABARoPAQUJAAEBGg8BBQkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEbDwEOCAABARsPAQ4IAAEBGw8BDggAAQEbDwEOCAABARsPAQ4IAAEBGw8BDggAAQEbDwEOBAA="],"Ж":[66,0,12,66,39,"AgABAgEOCQ8BCQ4ACg8BAg0AAQgJDwEOAQMFAAEDAQ4JDwEIDQAKDwECDAABBwoPAQQHAAEEAQ4JDwEHDAAKDwECCwABBgoPAQUJAAEECg8BBQsACg8BAgoAAQQKDwEGCwABBQoPAQQKAAoPAQIJAAEEAQ4JDwEHDQABBgkPAQ4BAwkACg8BAggAAQMBDgkPAQgPAAEICQ8BDgECCAAKDwECBwABAgEOCQ8BCREAAQkJDwENAQIHAAoPAQIGAAEBAQ0JDwEKEwABCgkPAQ0BAQYACg8BAgUAAQEBDAkPAQsVAAELCQ8BDAEBBQAKDwECBAABAQEMCQ8BDAEBFQABAQEMCQ8BCwUACg8BAgQAAQsJDwENAQEXAAEBAQwJDwEKBAAKDwECAwABCgkPAQ0BAhkAAQIBDQkPAQgDAAoPAQICAAEJCQ8BDgECGwABAgEOCQ8BBwIACg8BAgEAAQcJDwEOAQMdAAEDAQ4JDwEGAQAKDwECAQYKDwEEHwABBQoPAQUKDwEHCg8BBiAAAQogDwEMHwABBiIPAQcdAAECAQ4jDwEDHAABCyQPAQ0bAAEHJg8BCBkAAQMoDwEEGAABDAoPAQsSDwENCg8BDQEBFgABCAoPAQgBAAELEA8BDQEBAQgKDwEJFQABAwoPAQwCAAEBAQwODwEOAQICAAEMCg8BBRMAAQEBDQoPAQMDAAEBAQ0MDwEOAQMDAAEDCg8BDgEBEgABCQoPAQcFAAECAQ0KDwEOAQMFAAEHCg8BChEAAQQKDwEMBwABAwoPAQUHAAELCg8BBg8AAQEBDQoPAQIIAAoPAQIHAAECAQ4JDwEOAQIOAAEKCg8BBwkACg8BAggAAQYKDwELDQABBQoPAQsKAAoPAQIJAAELCg8BBwsAAQIBDgkPAQ4BAgoACg8BAgkAAQEBDgoPAQMKAAELCg8BBgsACg8BAgoAAQUKDwEMCQABBgoPAQsMAAoPAQILAAEKCg8BCAcAAQIBDgkPAQ4BAgwACg8BAgsAAQEBDQoPAQMGAAEMCg8BBQ0ACg8BAgwAAQQKDwENAQEEAAEHCg8BCg4ACg8BAg0AAQkKDwEJAwABAwoPAQ4BAQ4ACg8BAg0AAQEBDQoPAQQCAAEMCg8BBQ8ACg8BAg4AAQMKDwENAQE="],"З":[38,0,11,38,41,"CAABAQEEAQYBCQELAQwBDgMPAg4BDQELAQkBBwEEAQEQAAEBAQUBCQENEg8BCwEGAQENAAEIFw8BDgEIDAABCBkPAQwBAgoAAQgaDwENAQIJAAEIGw8BCwkAAQgcDwEDCAABCAMPAQwBCQEHAQUBAwECAgEBAAEBAQIBBAEIAQ4LDwEICAABBwEJAQQBAQ0AAQEBCgoPAQsbAAEMCQ8BDRsAAQYJDwEMGwABBAkPAQsbAAEGCQ8BCBsAAQwJDwEDGQABAQEKCQ8BChUAAgEBAwEFAQkBDgkPAQ0BAQ8AAQoTDwEMAQIQAAEKEQ8BDQEGEgABChAPAQcUAAEKEQ8BDQEGEgABChMPAQwBAhAAAQoUDwEOAQMPAAEKFQ8BDgEBFAACAQEDAQUBCQEOCw8BCRkAAQEBBwsPAQEaAAEGCg8BBhsAAQsJDwEJGwABBwkPAQsbAAEGCQ8BDBsAAQcJDwEMGwABCwkPAQoGAAEGAQkBAhEAAQUKDwEIBgABBwIPAQoBBQEBDQABBwsPAQQGAAEHBA8BDgEKAQcBBQEDAgECAAEBAQIBBQEIAQ0LDwENBwABBx0PAQYHAAEHHA8BDAgAAQcbDwENAQEIAAEHGg8BCwEBCQABBxgPAQ0BBgwAAQQBCQENEg8BDgELAQURAAEBAQQBBwEJAQsBDQIOAw8CDgEMAQsBCQEHAQQNAA=="],"И":[45,0,12,45,39,"BAABAQkPAQkNAAEFCw8BBAgAAQEJDwEJDQABDQsPAQQIAAEBCQ8BCQwAAQYMDwEECAABAQkPAQkLAAEBAQ4MDwEECAABAQkPAQkLAAEHDQ8BBAgAAQEJDwEJCgABAQEODQ8BBAgAAQEJDwEJCgABCA4PAQQIAAEBCQ8BCQkAAQIPDwEECAABAQkPAQkJAAEJDw8BBAgAAQEJDwEJCAABAhAPAQQIAAEBCQ8BCQgAAQoQDwEECAABAQkPAQkHAAEDEQ8BBAgAAQEJDwEJBwABCwcPAQ0JDwEECAABAQkPAQkGAAEEBw8BDgEGCQ8BBAgAAQEJDwEJBgABDAcPAgYJDwEECAABAQkPAQkFAAEFBw8BDQEAAQYJDwEECAABAQkPAQkFAAENBw8BBQEAAQYJDwEECAABAQkPAQkEAAEGBw8BDAIAAQYJDwEECAABAQkPAQkEAAENBw8BBAIAAQYJDwEECAABAQkPAQkDAAEHBw8BCwMAAQYJDwEECAABAQkPAQkCAAEBAQ4HDwEDAwABBgkPAQQIAAEBCQ8BCQIAAQgHDwEKBAABBgkPAQQIAAEBCQ8BCQEAAQEBDgcPAQIEAAEGCQ8BBAgAAQEJDwEJAQABCQcPAQkFAAEGCQ8BBAgAAQEJDwEJAQIHDwEOAQEFAAEGCQ8BBAgAAQEJDwIJBw8BCAYAAQYJDwEECAABAQkPAQsHDwEOAQEGAAEGCQ8BBAgAAQERDwEHBwABBgkPAQQIAAEBEA8BDQgAAQYJDwEECAABARAPAQYIAAEGCQ8BBAgAAQEPDwEMCQABBgkPAQQIAAEBDw8BBQkAAQYJDwEECAABAQ4PAQwKAAEGCQ8BBAgAAQEODwEECgABBgkPAQQIAAEBDQ8BCwsAAQYJDwEECAABAQ0PAQMLAAEGCQ8BBAgAAQEMDwEJDAABBgkPAQQIAAEBDA8BAgwAAQYJDwEECAABAQsPAQgNAAEGCQ8BBAQA"],"Й":[45,0,1,45,50,"DAABAQMPAQ0JAAEHAw8BBxsAAQwDDwEJBwABAwEOAw8BBBsAAQcEDwELAQUBAgEAAQEBAwEIAQ4DDwENHAABAQENDg8BBh0AAQMBDgwPAQkfAAEDAQwKDwEHIgABBAEJAQwBDgEPAQ4BDQELAQcBAcoAAQEJDwEJDQABBQsPAQQIAAEBCQ8BCQ0AAQ0LDwEECAABAQkPAQkMAAEGDA8BBAgAAQEJDwEJCwABAQEODA8BBAgAAQEJDwEJCwABBw0PAQQIAAEBCQ8BCQoAAQEBDg0PAQQIAAEBCQ8BCQoAAQgODwEECAABAQkPAQkJAAECDw8BBAgAAQEJDwEJCQABCQ8PAQQIAAEBCQ8BCQgAAQIQDwEECAABAQkPAQkIAAEKEA8BBAgAAQEJDwEJBwABAxEPAQQIAAEBCQ8BCQcAAQsHDwENCQ8BBAgAAQEJDwEJBgABBAcPAQ4BBgkPAQQIAAEBCQ8BCQYAAQwHDwIGCQ8BBAgAAQEJDwEJBQABBQcPAQ0BAAEGCQ8BBAgAAQEJDwEJBQABDQcPAQUBAAEGCQ8BBAgAAQEJDwEJBAABBgcPAQwCAAEGCQ8BBAgAAQEJDwEJBAABDQcPAQQCAAEGCQ8BBAgAAQEJDwEJAwABBwcPAQsDAAEGCQ8BBAgAAQEJDwEJAgABAQEOBw8BAwMAAQYJDwEECAABAQkPAQkCAAEIBw8BCgQAAQYJDwEECAABAQkPAQkBAAEBAQ4HDwECBAABBgkPAQQIAAEBCQ8BCQEAAQkHDwEJBQABBgkPAQQIAAEBCQ8BCQECBw8BDgEBBQABBgkPAQQIAAEBCQ8CCQcPAQgGAAEGCQ8BBAgAAQEJDwELBw8BDgEBBgABBgkPAQQIAAEBEQ8BBwcAAQYJDwEECAABARAPAQ0IAAEGCQ8BBAgAAQEQDwEGCAABBgkPAQQIAAEBDw8BDAkAAQYJDwEECAABAQ8PAQUJAAEGCQ8BBAgAAQEODwEMCgABBgkPAQQIAAEBDg8BBAoAAQYJDwEECAABAQ0PAQsLAAEGCQ8BBAgAAQENDwEDCwABBgkPAQQIAAEBDA8BCQwAAQYJDwEECAABAQwPAQIMAAEGCQ8BBAgAAQELDwEIDQABBgkPAQQEAA=="],"К":[44,0,12,44,39,"BAABAQoPAQIOAAEICg8BDQECBQABAQoPAQINAAEHCg8BDQECBgABAQoPAQIMAAEHCg8BDQECBwABAQoPAQILAAEHCg8BDQECCAABAQoPAQIKAAEHCg8BDQECCQABAQoPAQIJAAEHCg8BDQECCgABAQoPAQIIAAEGCg8BDgECCwABAQoPAQIHAAEGCg8BDgECDAABAQoPAQIGAAEGCg8BDgECDQABAQoPAQIFAAEGCg8BDgECDgABAQoPAQIEAAEGCg8BDgEDDwABAQoPAQIDAAEGCg8BDgEDEAABAQoPAQICAAEFCg8BDgEDEQABAQoPAQIBAAEFCg8BDgEDEgABAQoPAQIBBQoPAQ4BAxMAAQEKDwEGCw8BAxQAAQEWDwEFFAABARYPAQ4BAhMAAQEXDwELEwABARgPAQcSAAEBGQ8BAxEAAQEZDwENAQEQAAEBDg8BDgELCg8BCRAAAQENDwEOAQQBAQENCg8BBQ8AAQENDwEEAgABAwoPAQ4BAg4AAQEMDwEEBAABBwoPAQsOAAEBCw8BBAYAAQsKDwEHDQABAQoPAQUHAAECAQ4KDwEDDAABAQoPAQIIAAEFCg8BDQEBCwABAQoPAQIJAAEJCg8BCQsAAQEKDwECCQABAQENCg8BBAoAAQEKDwECCgABAwoPAQ4BAQkAAQEKDwECCwABBwoPAQsJAAEBCg8BAgwAAQsKDwEGCAABAQoPAQIMAAECAQ4KDwEDBwABAQoPAQINAAEFCg8BDAcAAQEKDwECDgABCQoPAQgGAAEBCg8BAg4AAQEBDQoPAQQFAAEBCg8BAg8AAQMKDwEOAQE="],"Л":[45,0,12,45,39,"CwABAhsPAQ0QAAECGw8BDRAAAQIbDwENEAABAhsPAQ0QAAECGw8BDRAAAQIbDwENEAABAhsPAQ0QAAECCg8HAAEECQ8BDRAAAQIKDwcAAQQJDwENEAABAgoPBwABBAkPAQ0QAAECCg8HAAEECQ8BDRAAAQMKDwcAAQQJDwENEAABAwoPBwABBAkPAQ0QAAEDCQ8BDgcAAQQJDwENEAABBAkPAQ4HAAEECQ8BDRAAAQQJDwENBwABBAkPAQ0QAAEFCQ8BDQcAAQQJDwENEAABBQkPAQwHAAEECQ8BDRAAAQYJDwELBwABBAkPAQ0QAAEHCQ8BCQcAAQQJDwENEAABCAkPAQgHAAEECQ8BDRAAAQkJDwEGBwABBAkPAQ0QAAELCQ8BBQcAAQQJDwENEAABDQkPAQIHAAEECQ8BDRAACg8IAAEECQ8BDQ8AAQIJDwENCAABBAkPAQ0PAAEGCQ8BCggAAQQJDwENDwABCwkPAQYIAAEECQ8BDQ4AAQQKDwECCAABBAkPAQ0NAAEDAQ4JDwENCQABBAkPAQ0LAAEBAQcLDwEICQABBAkPAQ0IAAECAQUBCQEODA8BAgkAAQQJDwENBwABCA8PAQcKAAEECQ8BDQcAAQgODwEKCwABBAkPAQ0HAAEIDQ8BCQwAAQQJDwENBwABCAsPAQ0BBQ0AAQQJDwENBwABCAkPAQwBBg8AAQQJDwENBwABCAYPAQwBBwEDEQABBAkPAQ0HAAEHAQ0BCwEJAQYBAwEBFAABBAkPAQ0FAA=="],"М":[54,0,12,54,39,"BAABAQ0PAQIQAAEFDA8BCwkAAQENDwEIEAABDAwPAQsJAAEBDQ8BDgEBDgABBA0PAQsJAAEBDg8BBg4AAQoNDwELCQABAQ4PAQ0NAAECDg8BCwkAAQEPDwEEDAABCA4PAQsJAAEBDw8BCwsAAQEBDg4PAQsJAAEBEA8BAgoAAQcPDwELCQABARAPAQkKAAENDw8BCwkAAQEQDwEOAQEIAAEFEA8BCwkAAQEJDwENBw8BBwgAAQsHDwEOCA8BCwkAAQEJDwEJAQ0GDwENBwABAwcPAQoBDQgPAQsJAAEBCQ8BCQEHBw8BBQYAAQkHDwEDAQ0IDwELCQABAQkPAQkBAQEOBg8BDAUAAQEHDwELAQABDQgPAQsJAAEBCQ8BCQEAAQkHDwEDBAABCAcPAQUBAAENCA8BCwkAAQEJDwEJAQABAgcPAQoEAAEOBg8BDQIAAQ0IDwELCQABAQkPAQkCAAELBw8BAgIAAQYHDwEHAgABDQgPAQsJAAEBCQ8BCQIAAQQHDwEIAgABDAYPAQ4BAQIAAQ0IDwELCQABAQkPAQkDAAEMBg8BDgEAAQQHDwEIAwABDQgPAQsJAAEBCQ8BCQMAAQYHDwEGAQsHDwECAwABDQgPAQsJAAEBCQ8BCQQAAQ4GDwENBw8BCgQAAQ0IDwELCQABAQkPAQkEAAEIDg8BBAQAAQ0IDwELCQABAQkPAQkEAAEBDQ8BDAUAAQ0IDwELCQABAQkPAQkFAAEKDA8BBgUAAQ0IDwELCQABAQkPAQkFAAEDCw8BDgYAAQ0IDwELCQABAQkPAQkGAAELCg8BBwYAAQ0IDwELCQABAQkPAQkGAAEFCg8BAQYAAQ0IDwELCQABAQkPAQkHAAENCA8BCQcAAQ0IDwELCQABAQkPAQkHAAEHCA8BAwcAAQ0IDwELCQABAQkPAQkHAAEBAQ4GDwELCAABDQgPAQsJAAEBCQ8BCQgAAQgGDwEECAABDQgPAQsJAAEBCQ8BCRgAAQ0IDwELCQABAQkPAQkYAAENCA8BCwkAAQEJDwEJGAABDQgPAQsJAAEBCQ8BCRgAAQ0IDwELCQABAQkPAQkYAAENCA8BCwkAAQEJDwEJGAABDQgPAQsJAAEBCQ8BCRgAAQ0IDwELCQABAQkPAQkYAAENCA8BCwUA"],"Н":[45,0,12,45,39,"BAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEjDwEECAABASMPAQQIAAEBIw8BBAgAAQEjDwEECAABASMPAQQIAAEBIw8BBAgAAQEjDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAQA"],"О":[46,0,11,46,41,"EAABBAEHAQoBDAENAQ4CDwEOAQ0BCwEJAQYBAx0AAQMBCQEODg8BDgEJAQMYAAEDAQsUDwEKAQIVAAEIGA8BBxIAAQEBDBoPAQsBAQ8AAQEBDRwPAQwBAQ0AAQEBDB4PAQsNAAEJCw8BDgEKAQUBAgIBAQIBBQEKDA8BCAsAAQQLDwELAQIIAAEDAQwLDwEDCgABDQoPAQoMAAELCg8BCwkAAQUKDwEMDQABAQENCg8BBAgAAQwKDwEDDgABBAoPAQoHAAECCg8BChAAAQsKDwEBBgABBwoPAQQQAAEGCg8BBQYAAQoJDwEOEQABAQoPAQgGAAENCQ8BCxIAAQwJDwELBQABAQoPAQgSAAEJCQ8BDgUAAQIKDwEFEgABBwoPBQABBAoPAQQSAAEGCg8BAgQAAQQKDwEEEgABBQoPAQIEAAEFCg8BAxIAAQQKDwEDBAABBAoPAQQSAAEFCg8BAgQAAQQKDwEEEgABBgoPAQIEAAECCg8BBRIAAQcKDwUAAQEKDwEIEgABCQkPAQ4GAAENCQ8BChIAAQwJDwELBgABCgkPAQ4RAAEBCg8BCAYAAQcKDwEEEAABBgoPAQUGAAECCg8BChAAAQsKDwEBBwABDAoPAQMOAAEECg8BCggAAQUKDwEMDQABAQENCg8BBAkAAQ0KDwEKDAABCwoPAQsKAAEFCw8BCwECCAABAwEMCw8BAwsAAQkLDwEOAQoBBQECAgEBAgEFAQoMDwEIDAABAQEMHg8BCw4AAQEBDRwPAQwBAQ8AAQEBDBoPAQsBARIAAQgYDwEHFQABAwELFA8BCwECGAABAwEJAQ4ODwEOAQkBAx0AAQQBBwEKAQwBDQEOAg8BDgENAQwBCgEHAQMQAA=="],"П":[45,0,12,45,39,"BAABASMPAQQIAAEBIw8BBAgAAQEjDwEECAABASMPAQQIAAEBIw8BBAgAAQEjDwEECAABASMPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAgAAQEKDwECDgABDgkPAQQIAAEBCg8BAg4AAQ4JDwEECAABAQoPAQIOAAEOCQ8BBAQA"],"Р":[40,0,12,40,39,"BAABAREPAQ4CDQELAQgBBQECDwABARgPAQsBBQ0AAQEaDwEMAQMLAAEBHA8BBwoAAQEdDwEGCQABAR4PAQQIAAEBHg8BDAgAAQEKDwECBQABAQEDAQcBDgsPAQUHAAEBCg8BAggAAQEBDAoPAQoHAAEBCg8BAgkAAQEBDgkPAQ4HAAEBCg8BAgoAAQgKDwECBgABAQoPAQIKAAEECg8BAwYAAQEKDwECCgABAgoPAQUGAAEBCg8BAgoAAQIKDwEFBgABAQoPAQIKAAEECg8BAwYAAQEKDwECCgABCAoPAQIGAAEBCg8BAgkAAQEBDgkPAQ4HAAEBCg8BAggAAQEBDAoPAQoHAAEBCg8BAgUAAQEBAwEHAQ4LDwEFBwABAR4PAQwIAAEBHg8BBAgAAQEdDwEGCQABARwPAQcKAAEBGg8BDAEDCwABARgPAQsBBQ0AAQERDwIOAQ0BCwEIAQUBAg8AAQEKDwECHAABAQoPAQIcAAEBCg8BAhwAAQEKDwECHAABAQoPAQIcAAEBCg8BAhwAAQEKDwECHAABAQoPAQIcAAEBCg8BAhwAAQEKDwECHAABAQoPAQIcAAEBCg8BAhwAAQEKDwECGAA="],"С":[40,0,11,40,41,"EAABAQEEAQcBCgEMAQ0BDgIPAQ4BDQEMAQkBBwEEFwABBQELDw8BDgEKAQUSAAEGAQ0UDwEOAQgBAQ0AAQMBDBgPAQMMAAEGGg8BAwsAAQgbDwEDCgABBxwPAQMJAAEFDQ8BCwEHAQMBAgEAAQEBAgEDAQYBCgEOBQ8BAwgAAQIBDgsPAQsBAwsAAQUBDAMPAQMIAAEKCw8BBw8AAQQBDQEPAQMHAAEDCw8BBhIAAQgBAgcAAQoKDwEKGwABAQoPAQ4BARsAAQUKDwEIHAABCQoPAQIcAAENCQ8BDB0ACg8BCRwAAQIKDwEGHAABAwoPAQUcAAEECg8BBBwAAQUKDwEDHAABBAoPAQQcAAEECg8BBRwAAQIKDwEGHQAKDwEJHQABDQkPAQwdAAEJCg8BAhwAAQUKDwEIHAABAQoPAQ4BARwAAQoKDwEKHAABAwsPAQYSAAEIAQIIAAEKCw8BBw8AAQQBDQEPAQMIAAECAQ4LDwELAQMLAAEFAQsDDwEDCQABBQ0PAQsBBwEDAQIBAAEBAQIBAwEGAQoBDgUPAQMKAAEHHA8BAwsAAQgbDwEDDAABBhoPAQMNAAEDAQwYDwEDDwABBgENFA8BDgEIAQERAAEFAQsPDwEOAQoBBRYAAQEBBAEHAQoBDAENAQ4CDwEOAQ0BDAEJAQcBBAkA"],"Т":[37,0,12,37,39,"AQsjDwEIAQsjDwEIAQsjDwEIAQsjDwEIAQsjDwEIAQsjDwEIAQsjDwEIDQABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCBoAAQoJDwEIGgABCgkPAQgaAAEKCQ8BCA0A"],"У":[42,0,12,42,39,"AQABAwoPAQYQAAENCQ8BDAQAAQsJDwENDwABBQoPAQUEAAEECg8BBg4AAQwJDwENBgABCwkPAQ0NAAEECg8BBQYAAQQKDwEFDAABCwkPAQ0IAAEMCQ8BDAsAAQMKDwEGCAABBQoPAQUKAAELCQ8BDgoAAQwJDwEMCQABAwoPAQcKAAEFCg8BBAgAAQoJDwEOAQELAAENCQ8BDAcAAQIKDwEIDAABBgoPAQQGAAEJCQ8BDgEBDQABDQkPAQsFAAEBCg8BCA4AAQYKDwEEBAABCAoPAQIPAAEOCQ8BCwMAAQEBDgkPAQkQAAEHCg8BAwIAAQcKDwECEAABAQEOCQ8BCwEAAQEBDgkPAQoSAAEHCg8BAwEHCg8BAxIAAQEBDgkPAQsBDQkPAQoUAAEIFA8BAxQAAQEBDhIPAQsWAAEIEg8BBBYAAQERDwEMGAABCRAPAQUYAAECDw8BDRoAAQkODwEFGgABAg0PAQ0cAAEKDA8BBhwAAQMLDwEOHgABCgoPAQceAAEGCQ8BDgEBHQABAQENCQ8BCBsAAQEBAgEGAQ0JDwEOAQEYABAPAQgZAA8PAQ4BARkADw8BBRoADg8BCBsADQ8BBxwACg8BDgEJAQIdAAQPAQ4BDQELAQkBBwEEGAA="],"Ф":[54,0,12,54,39,"FQABBAkPAQ0rAAEECQ8BDSsAAQQJDwENKwABBAkPAQ0lAAECAQUBBwEKAQwBDQsPAQ4BDQELAQkBBgEDHAABBAEJAQ0YDwELAQcBAhUAAQEBCAEOHg8BCwEEEgABBwEOIg8BDAEDDgABAQEMJg8BBgwAAQIBDSgPAQgLAAEMKg8BBQkAAQcMDwENAQkBBQECAQUJDwENAQEBAwEGAQoMDwEOAQEHAAEBAQ4KDwEOAQUEAAEECQ8BDQQAAQIBCQsPAQgHAAEGCg8BDQEBBQABBAkPAQ0GAAEGCg8BDgcAAQsKDwEDBgABBAkPAQ0HAAEKCg8BBAYAAQ4JDwELBwABBAkPAQ0HAAEDCg8BCAUAAQIKDwEHBwABBAkPAQ0IAAEOCQ8BCgUAAQQKDwEEBwABBAkPAQ0IAAELCQ8BDAUAAQQKDwEDBwABBAkPAQ0IAAEKCQ8BDAUAAQQKDwEDBwABBAkPAQ0IAAEKCQ8BDAUAAQQKDwEEBwABBAkPAQ0IAAELCQ8BDAUAAQIKDwEHBwABBAkPAQ0IAAEOCQ8BCgYACg8BCwcAAQQJDwENBwABAwoPAQgGAAELCg8BAwYAAQQJDwENBwABCgoPAQQGAAEHCg8BDQEBBQABBAkPAQ0GAAEGCg8BDgcAAQEBDgoPAQ4BBQQAAQQJDwENBAABAQEJCw8BCAgAAQgMDwENAQkBBQECAQUJDwENAQEBAwEGAQoMDwEOAQEJAAEMKg8BBgoAAQIBDSgPAQgMAAEBAQwmDwEHDwABBwEOIg8BDAEDEQABAQEIAQ4eDwELAQUWAAEEAQkBDRgPAQsBBwECGwABAgEFAQcBCgEMAQ0LDwEOAQ0BCwEJAQYBAwEBJAABBAkPAQ0rAAEECQ8BDSsAAQQJDwENKwABBAkPAQ0rAAEECQ8BDRYA"],"Х":[42,0,12,42,39,"AQABAgEOCQ8BBw8AAQEBDQkPAQoEAAEGCg8BAw4AAQoJDwEOAQEFAAELCQ8BDQ0AAQUKDwEFBgABAgEOCQ8BCAsAAQEBDgkPAQkIAAEFCg8BBAoAAQsJDwENAQEJAAEKCQ8BDQEBCAABBgoPAQQKAAEBAQ4JDwEJBwABAgEOCQ8BCAwAAQQKDwEFBgABCwkPAQ0OAAEJCQ8BDgEBBAABBwoPAQMOAAEBAQ0JDwEKAwABAgoPAQcQAAEDCg8BBQIAAQwJDwEMEgABCAkPAQ4BAgEHCQ8BDgECEwABDAkPAQwKDwEGFAABAxMPAQsWAAEHEQ8BDgECFwABDBAPAQUYAAECAQ4ODwEKGgABBg0PAQ4BARsAAQsMDwEEHAABCQwPAQMbAAEEDQ8BDBoAAQEBDQ4PAQgZAAEKEA8BBBcAAQURDwENAQEVAAEBAQ4SDwEJFQABCwkPAQ4KDwEEEwABBgoPAQMBCgkPAQ0BAREAAQIBDgkPAQgBAAEBAQ0JDwEKEQABCwkPAQwDAAEECg8BBQ8AAQcKDwEDBAABCQkPAQ4BAQ0AAQMKDwEHBQABAQENCQ8BCw0AAQwJDwEMBwABAwoPAQYLAAEICQ8BDgECCAABCAkPAQ4BAgkAAQMKDwEGCgABDAkPAQsIAAEBAQ0JDwELCwABAgoPAQcHAAEJCQ8BDgECDAABBwoPAQMFAAEECg8BBQ4AAQsJDwEMBAABAQENCQ8BCg8AAQIBDgkPAQgDAAEJCQ8BDgEBEAABBQoPAQMBAA=="],"Ц":[50,0,12,50,47,"BAABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBCg8BAg4AAQ4JDwEEDQABAQoPAQIOAAEOCQ8BBA0AAQEKDwECDgABDgkPAQQNAAEBKQ8BDQcAAQEpDwENBwABASkPAQ0HAAEBKQ8BDQcAAQEpDwENBwABASkPAQ0HAAEBKQ8BDSoAAQwGDwENKgABDAYPAQ0qAAEMBg8BDSoAAQwGDwENKgABDAYPAQ0qAAEMBg8BDSoAAQwGDwENKgABDAYPAQ0DAA=="],"Ч":[44,0,12,44,39,"BAABCgkPAQgNAAEHCQ8BCgkAAQoJDwEIDQABBwkPAQoJAAEKCQ8BCA0AAQcJDwEKCQABCgkPAQgNAAEHCQ8BCgkAAQoJDwEIDQABBwkPAQoJAAEKCQ8BCA0AAQcJDwEKCQABCgkPAQgNAAEHCQ8BCgkAAQoJDwEIDQABBwkPAQoJAAEKCQ8BCA0AAQcJDwEKCQABCgkPAQgNAAEHCQ8BCgkAAQoJDwEJDQABBwkPAQoJAAEKCQ8BCg0AAQcJDwEKCQABCQkPAQsNAAEHCQ8BCgkAAQgJDwENDQABBwkPAQoJAAEHCg8BAgwAAQcJDwEKCQABBQoPAQkMAAEHCQ8BCgkAAQILDwEJAQMBAQkAAQcJDwEKCgABDSAPAQoKAAEHIA8BCgoAAQEBDh8PAQoLAAEEHw8BCgwAAQYeDwEKDQABBAEMHA8BCg8AAQQBCQEMAQ4YDwEKIQABBwkPAQohAAEHCQ8BCiEAAQcJDwEKIQABBwkPAQohAAEHCQ8BCiEAAQcJDwEKIQABBwkPAQohAAEHCQ8BCiEAAQcJDwEKIQABBwkPAQohAAEHCQ8BCiEAAQcJDwEKIQABBwkPAQohAAEHCQ8BCiEAAQcJDwEKBQA="],"Ш":[67,0,12,67,39,"BAABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABAQoPAQIMAAELCQ8BBgwAAQYJDwELCQABATgPAQsJAAEBOA8BCwkAAQE4DwELCQABATgPAQsJAAEBOA8BCwkAAQE4DwELCQABATgPAQsFAA=="],"Щ":[72,0,12,72,47,"BAABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAQoPAQIMAAELCQ8BBgwAAQYJDwELDgABAT8PAQUHAAEBPw8BBQcAAQE/DwEFBwABAT8PAQUHAAEBPw8BBQcAAQE/DwEFBwABAT8PAQU/AAEFBw8BBT8AAQUHDwEFPwABBQcPAQU/AAEFBw8BBT8AAQUHDwEFPwABBQcPAQU/AAEFBw8BBT8AAQUHDwEFAwA="],"Ъ":[51,0,11,51,40,"AgABAhYFAQQbAAEFFg8BDBsAAQUWDwEMGwABBRYPAQwbAAEFFg8BDBsAAQUWDwEMGwABBRYPAQwbAAEFFg8BDBsAAQIMBQEICQ8BDCgAAQUJDwEMKAABBQkPAQwoAAEFCQ8BDCgAAQUJDwEMKAABBQkPAQwoAAEFCQ8BDCgAAQUJDwENCAUBBAEDAQEdAAEFFQ8BDgELAQcBAhkAAQUZDwEMAQQXAAEFGw8BCwEBFQABBRwPAQ0BAhQAAQUdDwENAQETAAEFHg8BCBMAAQUfDwEBEgABBQkPAQ0HBQEHAQoBDgsPAQYSAAEFCQ8BDAkAAQEBCgoPAQoSAAEFCQ8BDAsAAQwJDwENEgABBQkPAQwLAAEFCQ8BDhIAAQUJDwEMCwABAgoPEgABBQkPAQwLAAECCg8SAAEFCQ8BDAsAAQQJDwEOEgABBQkPAQwLAAEJCQ8BDBIAAQUJDwEMCgABBAoPAQkSAAEFCQ8BDAcAAQEBAwEJCw8BBBIAAQUKDwcODQ8BDRMAAQUeDwEFEwABBR0PAQkUAAEFHA8BCRUAAQUaDwENAQUWAAEFGA8BDAEGAQEXAAEFEQ8BDgINAQsBCAEGAQILAA=="],"Ы":[56,0,12,56,39,"BAABAQoPAQIYAAECCg8JAAEBCg8BAhgAAQIKDwkAAQEKDwECGAABAgoPCQABAQoPAQIYAAECCg8JAAEBCg8BAhgAAQIKDwkAAQEKDwECGAABAgoPCQABAQoPAQIYAAECCg8JAAEBCg8BAhgAAQIKDwkAAQEKDwECGAABAgoPCQABAQoPAQIYAAECCg8JAAEBCg8BAhgAAQIKDwkAAQEKDwECGAABAgoPCQABAQoPAQIYAAECCg8JAAEBCg8BAhgAAQIKDwkAAQEKDwECGAABAgoPCQABAREPAg4BDQEMAQkBBgEDCwABAgoPCQABARgPAQ0BCAECCAABAgoPCQABARsPAQgBAQYAAQIKDwkAAQEcDwENAQIFAAECCg8JAAEBHQ8BDQECBAABAgoPCQABAR4PAQsEAAECCg8JAAEBHw8BBAMAAQIKDwkAAQEKDwECBgABAQEEAQgBDgoPAQoDAAECCg8JAAEBCg8BAgkAAQIBDgkPAQ4DAAECCg8JAAEBCg8BAgoAAQUKDwECAgABAgoPCQABAQoPAQILAAEOCQ8BAwIAAQIKDwkAAQEKDwECCwABDAkPAQUCAAECCg8JAAEBCg8BAgsAAQwJDwEFAgABAgoPCQABAQoPAQILAAEOCQ8BBAIAAQIKDwkAAQEKDwECCgABBQoPAQICAAECCg8JAAEBCg8BAgkAAQIBDgkPAQ4DAAECCg8JAAEBCg8BAgYAAQEBBAEIAQ4KDwEKAwABAgoPCQABAR8PAQQDAAECCg8JAAEBHg8BCwQAAQIKDwkAAQEdDwENAQIEAAECCg8JAAEBHA8BDQECBQABAgoPCQABARsPAQgBAQYAAQIKDwkAAQEYDwENAQgBAggAAQIKDwkAAQESDwEOAQ0BDAEJAQYBAwsAAQIKDwUA"],"Ь":[41,0,12,41,39,"BAABAQoPAQIdAAEBCg8BAh0AAQEKDwECHQABAQoPAQIdAAEBCg8BAh0AAQEKDwECHQABAQoPAQIdAAEBCg8BAh0AAQEKDwECHQABAQoPAQIdAAEBCg8BAh0AAQEKDwECHQABAQoPAQIdAAEBCg8BAh0AAQEKDwECHQABAREPAg4BDQEMAQkBBgEDEAABARgPAQ0BCAECDQABARsPAQgBAQsAAQEcDwENAQIKAAEBHQ8BDQECCQABAR4PAQsJAAEBHw8BBAgAAQEKDwECBgABAQEEAQgBDgoPAQoIAAEBCg8BAgkAAQIBDgkPAQ4IAAEBCg8BAgoAAQUKDwECBwABAQoPAQILAAEOCQ8BAwcAAQEKDwECCwABDAkPAQUHAAEBCg8BAgsAAQwJDwEFBwABAQoPAQILAAEOCQ8BBAcAAQEKDwECCgABBQoPAQIHAAEBCg8BAgkAAQIBDgkPAQ4IAAEBCg8BAgYAAQEBBAEIAQ4KDwEKCAABAR8PAQQIAAEBHg8BCwkAAQEdDwENAQIJAAEBHA8BDQECCgABARsPAQgBAQsAAQEYDwENAQgBAg0AAQESDwEOAQ0BDAEJAQYBAwwA"],"Э":[40,0,10,40,42,"DwACAR8AAQIBBgEIAQsBDQEOBA8BDgEMAQoBBwEEFgABAQEHAQwPDwEOAQoBBBEAAQIBCRUPAQwBBA8AAQgYDwEKAQENAAEIGQ8BDgEDDAABCBoPAQ4BBAsAAQgbDwEOAQQKAAEIBg8BDAEJAQcBBgIFAQYBCAEMDQ8BDgEBCQABCAMPAQwBBgEBCQABAQEIAQ4LDwELCQABCAEPAQwBBA4AAQIBDQsPAQUIAAEHAQYRAAEBAQ0KDwENHAABAwEOCg8BBRwAAQcKDwEKHQABDQoPAQEcAAEHCg8BBBwAAQMKDwEHCwABBREICg8BCgsAAQobDwEMCwABChsPAQ0LAAEKGw8BDgsAAQobDwEOCwABChsPAQ0LAAEKGw8BDQsAAQobDwELCwABAhEDCg8BCRwAAQQKDwEGHAABCQoPAQMbAAECAQ4JDwEOHAABCgoPAQkHAAEBEwABBgsPAQMHAAEIAQoBAhAAAQQLDwELCAABCAIPAQgBAg0AAQYMDwEDCAABCAQPAQsBBgECBwABAQEGAQwMDwEICQABCAcPAQ0BCwEKAQkBCgELAQ0ODwELCgABCBsPAQwBAQoAAQgaDwEMAQELAAEIGQ8BCgEBDAABCBcPAQ4BBg8AAQUBCxMPAQ4BCAEBEgABAwEHAQwNDwEOAQoBBRgAAQEBBAEGAQkBCgQLAQkBCAEGAQMSAA=="],"Ю":[63,0,11,63,41,"IQABAwEGAQkBCwENAQ4CDwIOAQwBCgEHAQQUAAEBCg8BAg4AAQEBCAENDg8BDgEKAQQRAAEBCg8BAgwAAQEBCBQPAQwBBA8AAQEKDwECCwABAwENFw8BCQEBDQABAQoPAQIKAAEFGg8BDQECDAABAQoPAQIJAAEFHA8BDQECCwABAQoPAQIIAAEDAQ4dDwENAQEKAAEBCg8BAgcAAQEBDQsPAQsBBgEDAgEBAgEEAQkBDgsPAQsKAAEBCg8BAgcAAQkKDwENAQQIAAEBAQoLDwEGCQABAQoPAQIGAAEDCg8BDQEBCwABCQoPAQ4BAQgAAQEKDwECBgABCwkPAQ4BAg0AAQoKDwEHCAABAQoPAQIFAAEDCg8BBg4AAQIBDgkPAQ0IAAEBCg8BAgUAAQkJDwENEAABCAoPAQMHAAEBCg8BAgUAAQ4JDwEHEAABAgoPAQgHAAEBCg8BAgQAAQMKDwECEQABDAkPAQwHAAEBCg8BAgQAAQcJDwEOEgABCQkPAQ4HAAEBCg8BAgQAAQoJDwELEgABBgoPAQIGAAEBCg8BAgQAAQwJDwEJEgABBAoPAQQGAAEBGQ8BCBIAAQMKDwEFBgABARkPAQcSAAECCg8BBgYAAQEZDwEGEgABAQoPAQYGAAEBGQ8BBxIAAQIKDwEGBgABARkPAQgSAAEDCg8BBQYAAQEZDwEJEgABBAoPAQQGAAEBGQ8BCxIAAQYKDwECBgABAQoPAQIEAAEMCQ8BDhIAAQkJDwEOBwABAQoPAQIEAAEJCg8BAhEAAQwJDwEMBwABAQoPAQIEAAEGCg8BBxAAAQIKDwEIBwABAQoPAQIEAAECCg8BDRAAAQgKDwEDBwABAQoPAQIFAAELCg8BBg4AAQIBDgkPAQ0IAAEBCg8BAgUAAQUKDwEOAQINAAEKCg8BBwgAAQEKDwECBgABDAoPAQwBAQsAAQgKDwEOAQEIAAEBCg8BAgYAAQMLDwENAQQIAAEBAQoLDwEGCQABAQoPAQIHAAEIDA8BCwEGAQICAQECAQQBCQEOCw8BCwoAAQEKDwECCAABCx4PAQ0BAQoAAQEKDwECCAABAQEMHA8BDQECCwABAQoPAQIJAAEBAQwaDwENAQIMAAEBCg8BAgoAAQEBCRgPAQkBAQ0AAQEKDwECDAABBAEMFA8BDAEEDwABAQoPAQIOAAEEAQoBDg4PAQ4BCgEELgABBAEHAQoBDAENAQ4CDwIOAQwBCgEHAQQQAA=="],"Я":[42,0,12,42,39,"DQABAwEHAQoBDAENAQ4RDwEJDwABAQEIAQ4XDwEJDgABBgEOGQ8BCQ0AAQgbDwEJDAABBxwPAQkLAAECHQ8BCQsAAQoKDwENAQYBAwEBBQABCAkPAQkKAAEBCg8BCwEBCAABCAkPAQkKAAEFCg8BAgkAAQgJDwEJCgABCAkPAQsKAAEICQ8BCQoAAQkJDwEICgABCAkPAQkKAAEKCQ8BBwoAAQgJDwEJCgABCgkPAQcKAAEICQ8BCQoAAQgJDwEICgABCAkPAQkKAAEECQ8BCwoAAQgJDwEJCwABDQkPAQIJAAEICQ8BCQsAAQUJDwELAQEIAAEICQ8BCQwAAQkJDwENAQYBAwEBBQABCAkPAQkNAAEKGw8BCQ4AAQkaDwEJDwABBxkPAQkQAAEEAQ0XDwEJEQABAQEOFg8BCREAAQUXDwEJEAABAQEOCQ8BCwMAAQgJDwEJEAABCAoPAQIDAAEICQ8BCQ8AAQIKDwEIBAABCAkPAQkPAAELCQ8BDgEBBAABCAkPAQkOAAEFCg8BBgUAAQgJDwEJDQABAQENCQ8BDAYAAQgJDwEJDQABCAoPAQMGAAEICQ8BCQwAAQIKDwEKBwABCAkPAQkMAAEKCQ8BDgECBwABCAkPAQkLAAEECg8BBwgAAQgJDwEJCwABDQkPAQ0JAAEICQ8BCQoAAQcKDwEFCQABCAkPAQkJAAECAQ4JDwELCgABCAkPAQkJAAEKCg8BAgoAAQgJDwEJCAABBAoPAQgLAAEICQ8BCQUA"],"а":[36,0,20,36,32,"BQABAQEDAQUBBgEIAQoCDAENAg4CDwIOAQwBCgEIAQQBAQ8AAQETDwEOAQkBAg0AAQEWDwEIDAABARcPAQsLAAEBGA8BCgoAAQEZDwEECQABAQMPAQwBCQEGAQQBAgIBAQABAQECAQQBCAEOCQ8BDAkAAQEBDAEGAQEMAAEBAQoJDwEDGQABAQENCA8BCBoAAQgIDwELGgABBQgPAQ4aAAEFCQ8BAQwAAQIBBgEJAQsBDAIOEA8BAgoAAQYBDBcPAQIIAAEDAQ0ZDwEDBwABBAEOGg8BAwYAAQIBDhsPAQMGAAEKHA8BAwUAAQEKDwEOAQcBAwEBBQABBQkPAQMFAAEFCQ8BDAEBCAABBQkPAQMFAAEICQ8BAgkAAQcJDwEDBQABCQgPAQ4KAAELCQ8BAwUAAQoIDwENCQABAgoPAQMFAAEJCQ8BAQgAAQsKDwEDBQABBgkPAQoHAAEKCw8BAwUAAQIKDwELAQQBAQEAAQIBBgENDA8BAwYAAQwcDwEDBgABBBIPAQkJDwEDBwABBxAPAQYBBQkPAQMIAAEIDg8BBgEAAQUJDwEDCQABBAENCg8BCwEDAgABBQkPAQMLAAEFAQkBDAEOAQ8BDgENAQsBCAEDEgA="],"б":[38,0,9,38,43,"GwABAgEEAQIYAAEBAQMBBQEGAQgBCQEKAQsBDQEOAw8BCRIAAQEBBAEIAQoBDAEODQ8BDgEBDwABAgEJFA8BBQ4AAQQBDhUPAQsNAAEEGA8BAQsAAQIBDhYPAQ4BCwEDCwABCw4PAQ0BDAEKAQkBCAEGAQQBAwEBDQABBQgPAQ4BCQEGAQQBAgEBFwABDQYPAQ4BBhwAAQUGDwENAQEdAAELBg8BAgIAAQQBCAEKAQ0CDgEPAQ4BDQEMAQkBBgEBDgABAQYPAQsBAgEJAQ4NDwELAQQMAAEEBg8BDQEOEQ8BCwECCgABBhoPAQ4BBQkAAQgcDwEFCAABCR0PAQMHAAEKHQ8BDQEBBgABCg0PAQkBAwIBAQIBBwEOCg8BBwYAAQkLDwEOAQMGAAEBAQwJDwEOAQEFAAEGCw8BBQgAAQEBDgkPAQYFAAEECg8BDAoAAQcJDwEKBQABAwoPAQYKAAEBCQ8BDgUAAQMKDwECCwABDAkPAQIEAAECCQ8BDgwAAQoJDwEEBAABAgkPAQ0MAAEICQ8BBQQAAQEJDwEMDAABBwkPAQYEAAEBCQ8BDAwAAQcJDwEGBQAJDwENDAABCAkPAQUFAAEOCA8BDgwAAQoJDwEEBQABDAkPAQILAAEMCQ8BAgUAAQkJDwEGCgABAQkPAQ4GAAEFCQ8BCwoAAQcJDwEKBgABAQoPAQUIAAEBAQ4JDwEGBwABCgkPAQ4BAwYAAQEBDAkPAQ4BAQcAAQILDwEJAQMBAQEAAQIBBwEOCg8BCAkAAQgaDwENAQEKAAEMGQ8BAwsAAQIBDRcPAQUNAAEBAQwUDwEOAQUQAAEIEg8BCwECEgABAgEJAQ4NDwELAQQXAAEEAQgBCwENAQ4CDwEOAQ0BDAEJAQYBAQwA"],"в":[34,0,21,34,30,"BAABBw4PAg4BDAEKAQgBBQEBDAABBxUPAQkBAgoAAQcWDwEOAQUJAAEHGA8BAwgAAQcYDwEMCAABBxkPAQIHAAEHGQ8BBQcAAQcJDwUAAQIBBwkPAQcHAAEHCQ8HAAEHCA8BBwcAAQcJDwcAAQQIDwEFBwABBwkPBwABBwcPAQ4BAQcAAQcJDwUAAQIBBwgPAQcIAAEHFw8BCQkAAQcVDwENAQUKAAEHFQ8BDgEJAQIJAAEHFw8BDgEFCAABBxkPAQQHAAEHGQ8BDQcAAQcaDwEFBgABBwkPBgABAgEGAQ0IDwEJBgABBwkPCAABAwgPAQsGAAEHCQ8IAAEDCA8BDAYAAQcJDwYAAQIBBgENCA8BCgYAAQcaDwEIBgABBxoPAQQGAAEHGQ8BDAcAAQcYDwEOAQMHAAEHFw8BDgEDCAABBxUPAQ4BCAEBCQABBw8PAg4BDAEKAQgBBAgA"],"г":[28,0,21,28,30,"BAABBxUPAQ4FAAEHFQ8BDgUAAQcVDwEOBQABBxUPAQ4FAAEHFQ8BDgUAAQcVDwEOBQABBxUPAQ4FAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8SAAEHCQ8OAA=="],"д":[44,0,21,44,37,"CgABDRgPAQoSAAENGA8BChIAAQ0YDwEKEgABDRgPAQoSAAENGA8BChIAAQ0YDwEKEgABDRgPAQoSAAENCA8BCQYAAQwIDwEKEgABDQgPAQkGAAEMCA8BChIAAQ4IDwEJBgABDAgPAQoSAAEOCA8BCAYAAQwIDwEKEgAJDwEHBgABDAgPAQoRAAEBCQ8BBwYAAQwIDwEKEQABAgkPAQUGAAEMCA8BChEAAQQJDwEEBgABDAgPAQoRAAEGCQ8BAgYAAQwIDwEKEQABCAkPAQEGAAEMCA8BChEAAQwIDwENBwABDAgPAQoQAAEBCQ8BCgcAAQwIDwEKEAABCAkPAQcHAAEMCA8BCg8AAQIBDgkPAQMHAAEMCA8BCg4AAQIBDQkPAQ4IAAEMCA8BCg0AAQYBDgoPAQkIAAEMCA8BCgsAJQ8BCQYAJQ8BCQYAJQ8BCQYAJQ8BCQYAJQ8BCQYAJQ8BCQYAJQ8BCQYABg8BDBcAAQMGDwEJBgAGDwEMFwABAwYPAQkGAAYPAQwXAAEDBg8BCQYABg8BDBcAAQMGDwEJBgAGDwEMFwABAwYPAQkGAAYPAQwXAAEDBg8BCQYABg8BDBcAAQMGDwEJAwA="],"е":[37,0,20,37,32,"DAABAgEGAQkBDAENAQ4CDwEOAQwBCQEGAQIWAAEFAQwNDwELAQQSAAEDAQwRDwEKAQEPAAEGFA8BDQEDDQABCBYPAQ4BAwsAAQYYDwEOAQEJAAECCg8BCgEFAQEBAAEBAQQBCwkPAQsJAAELCQ8BBQcAAQcJDwEEBwABAwkPAQUJAAEKCA8BCwcAAQkIDwEMCgABAgkPAQIGAAEOCA8BBgsAAQ0IDwEGBQABAwkPAQILAAELCA8BCgUAAQYeDwEMBQABCB4PAQ4FAAEJHw8FAAEKHw8FAAEKHw8FAAEJHw8FAAEICQ8bAAEGCQ8BAhoAAQMJDwEGGwABDggPAQsbAAEKCQ8BAxEAAQUBCAcAAQQJDwENAQEOAAEFAQwBDwEJCAABCwkPAQwBAgoAAQIBBwENAw8BCQgAAQMLDwEKAQUBAgEBAQABAgEDAQUBCQEMBg8BCQkAAQYaDwEJCgABCBkPAQkLAAEGGA8BCQwAAQMBDBQPAQwBBwEBDgABBAELDw8BDAEIAQMTAAEBAQUBCAELAQ0BDgIPAQ4BDQEMAQoBBwEFAQEKAA=="],"ж":[54,0,21,54,30,"AgABCgkPAQoJAAENCA8BCQgAAQEBDAkPAQYFAAEKCQ8BCggAAQ0IDwEJBwABAQEMCQ8BBgcAAQoJDwEKBwABDQgPAQkGAAEBAQ0JDwEGCQABCQkPAQsGAAENCA8BCQUAAQEBDQkPAQYLAAEJCQ8BCwEBBAABDQgPAQkEAAECAQ0JDwEGDQABCQkPAQsBAQMAAQ0IDwEJAwABAgENCQ8BBQ8AAQkJDwEMAQECAAENCA8BCQIAAQIBDQkPAQURAAEJCQ8BDAEBAQABDQgPAQkBAAECAQ0JDwEFEwABCQkPAQwBAQENCA8BCQECAQ0JDwEFFQABCAkPAQwBDQgPAQsBDQkPAQUXAAEIHA8BBRkAAQgaDwEEGgABAhkPAQwbAAEMGg8BCBkAAQkcDwEFFwABBR0PAQ4BAhUAAQIBDh4PAQwVAAEMFg8BDgkPAQkTAAEJCQ8BBQEJCw8BDgEEAQcJDwEFEQABBQkPAQkCAAEJCQ8BDgEDAgABCwgPAQ4BAg8AAQIBDggPAQwEAAENCA8BCQMAAQEBDQgPAQwPAAEMCA8BDgECBAABDQgPAQkEAAEDCQ8BCQ0AAQkJDwEEBQABDQgPAQkFAAEHCQ8BBQsAAQUJDwEIBgABDQgPAQkGAAEKCA8BDgECCQABAgEOCA8BCwcAAQ0IDwEJBgABAQENCA8BDAkAAQwIDwENAQEHAAENCA8BCQcAAQMJDwEJBwABCQkPAQQIAAENCA8BCQgAAQcJDwEFBQABBQkPAQcJAAENCA8BCQkAAQoIDwEOAQIDAAECAQ4IDwEKCgABDQgPAQkJAAEBAQ0IDwEMAwABDAgPAQ0BAQoAAQ0IDwEJCgABAwkPAQkBAA=="],"з":[31,0,20,31,32,"BAABAQEDAQYBCAEKAgwBDQIOAQ8CDgENAQsBCQEGAQINABIPAQ0BBQsAFA8BCwEBCQAVDwEMCQAWDwEHCAAWDwEMCAACDwENAQkBBQEDAgEBAAEBAQIBBQEJCg8BAQcAAQsBBAsAAQMBDggPAQMVAAEICA8BAxUAAQYIDwEBFQABCgcPAQwVAAEFCA8BBREAAQEBAwEFAQoIDwEJDAABBg8PAQ4BBw0AAQYNDwEOAQcBAQ4AAQYODwENAQcBAQ0AAQYQDwENAQQMAAEGEg8BBAsAAQYSDwENAQEKAAEGEw8BBhAAAQEBAgEEAQcBDAkPAQsVAAEGCA8BDRYAAQwHDwEOFgABCwcPAQ0FAAEFAQsBBgECDAABBwgPAQsFAAEFAw8BDQEJAQYBBAECAQEBAAEBAQIBBAEHAQ0JDwEHBQABBRgPAQIFAAEFFw8BBwYAAQUWDwEKBwABBRUPAQgIAAEFEg8BDgEJAQIKAAECAQQBBgEJAQsBDAINAQ4DDwEOAQ0BCwEJAQcBAwoA"],"и":[38,0,21,38,30,"BAABBwkPCQABDAkPAQQIAAEHCQ8IAAEGCg8BBAgAAQcJDwcAAQEBDgoPAQQIAAEHCQ8HAAEJCw8BBAgAAQcJDwYAAQMMDwEECAABBwkPBgABDAwPAQQIAAEHCQ8FAAEGDQ8BBAgAAQcJDwQAAQEBDg0PAQQIAAEHCQ8EAAEJDg8BBAgAAQcJDwMAAQMPDwEECAABBwkPAwABCw8PAQQIAAEHCQ8CAAEFEA8BBAgAAQcJDwEAAQEBDhAPAQQIAAEHCQ8BAAEIEQ8BBAgAAQcJDwEDCA8BCwkPAQQIAAEHCQ8BCwcPAQ4BAwkPAQQIAAEHEQ8BBgECCQ8BBAgAAQcQDwEMAQABAgkPAQQIAAEHEA8BAwEAAQIJDwEECAABBw8PAQkCAAECCQ8BBAgAAQcODwEOAQECAAECCQ8BBAgAAQcODwEGAwABAgkPAQQIAAEHDQ8BDAQAAQIJDwEECAABBw0PAQMEAAECCQ8BBAgAAQcMDwEJBQABAgkPAQQIAAEHCw8BDgEBBQABAgkPAQQIAAEHCw8BBgYAAQIJDwEECAABBwoPAQwHAAECCQ8BBAgAAQcKDwEEBwABAgkPAQQIAAEHCQ8BCggAAQIJDwEEBAA="],"й":[38,0,10,38,41,"CgABDQIPAQ4BAQgAAQEDDwELFAABCwMPAQUIAAEHAw8BCRQAAQgDDwEOAQIGAAEDAQ4DDwEGFAABAwQPAQ4BBwECAgABAwEIAQ4DDwEOAQEVAAEKDg8BCBYAAQEBDAwPAQsYAAEBAQkKDwEIGwABAgEIAQsBDgEPAQ4BDQELAQcBAoQAAQcJDwkAAQwJDwEECAABBwkPCAABBgoPAQQIAAEHCQ8HAAEBAQ4KDwEECAABBwkPBwABCQsPAQQIAAEHCQ8GAAEDDA8BBAgAAQcJDwYAAQwMDwEECAABBwkPBQABBg0PAQQIAAEHCQ8EAAEBAQ4NDwEECAABBwkPBAABCQ4PAQQIAAEHCQ8DAAEDDw8BBAgAAQcJDwMAAQsPDwEECAABBwkPAgABBRAPAQQIAAEHCQ8BAAEBAQ4QDwEECAABBwkPAQABCBEPAQQIAAEHCQ8BAwgPAQsJDwEECAABBwkPAQsHDwEOAQMJDwEECAABBxEPAQYBAgkPAQQIAAEHEA8BDAEAAQIJDwEECAABBxAPAQMBAAECCQ8BBAgAAQcPDwEJAgABAgkPAQQIAAEHDg8BDgEBAgABAgkPAQQIAAEHDg8BBgMAAQIJDwEECAABBw0PAQwEAAECCQ8BBAgAAQcNDwEDBAABAgkPAQQIAAEHDA8BCQUAAQIJDwEECAABBwsPAQ4BAQUAAQIJDwEECAABBwsPAQYGAAECCQ8BBAgAAQcKDwEMBwABAgkPAQQIAAEHCg8BBAcAAQIJDwEECAABBwkPAQoIAAECCQ8BBAQA"],"к":[37,0,21,37,30,"BAABBwkPCQABAgENCQ8BBQYAAQcJDwgAAQIBDgkPAQUHAAEHCQ8HAAEDAQ4IDwEOAQQIAAEHCQ8GAAEDAQ4IDwEOAQQJAAEHCQ8FAAEDAQ4IDwEOAQMKAAEHCQ8EAAEEAQ4IDwEOAQMLAAEHCQ8DAAEEAQ4IDwEOAQMMAAEHCQ8CAAEFCQ8BDgEDDQABBwkPAQABBQkPAQ0BAg4AAQcJDwEFCQ8BDQECDwABBxIPAQ0BAhAAAQcRDwENAQIRAAEHEQ8BCBIAAQcSDwEEEQABBxIPAQ4BARAAAQcTDwELEAABBxQPAQgPAAEHCw8BDQkPAQUOAAEHCg8BCgEAAQoIDwEOAQINAAEHCQ8BCgIAAQEBDQgPAQwNAAEHCQ8EAAEDAQ4IDwEJDAABBwkPBQABBgkPAQULAAEHCQ8GAAEJCA8BDgECCgABBwkPBgABAQEMCA8BDQEBCQABBwkPBwABAgEOCA8BCgkAAQcJDwgAAQUJDwEGCAABBwkPCQABCAkPAQMHAAEHCQ8KAAEMCA8BDQEBBgABBwkPCgABAgEOCA8BCwYAAQcJDwsAAQQJDwEHAQA="],"л":[40,0,21,40,30,"CQABCBkPDgABCBkPDgABCBkPDgABCBkPDgABCBkPDgABCBkPDgABCBkPDgABCAgPAQ4GAAEGCQ8OAAEICA8BDgYAAQYJDw4AAQgIDwEOBgABBgkPDgABCAgPAQ4GAAEGCQ8OAAEJCA8BDQYAAQYJDw4AAQkIDwENBgABBgkPDgABCggPAQwGAAEGCQ8OAAELCA8BCwYAAQYJDw4AAQwIDwEKBgABBgkPDgABDQgPAQkGAAEGCQ8OAAkPAQcGAAEGCQ8NAAEDCQ8BBQYAAQYJDw0AAQkJDwEDBgABBgkPDAABBAoPBwABBgkPCwABBgEOCQ8BCwcAAQYJDwgAAQIBBwEMCw8BBgcAAQYJDwgADQ8BDQgAAQYJDwgADQ8BAwgAAQYJDwgADA8BBgkAAQYJDwgACw8BBgoAAQYJDwgACQ8BDAEDCwABBgkPCAAHDwEMAQUNAAEGCQ8IAAEPAQ4BDQELAQkBBgECDwABBgkPBQA="],"м":[44,0,21,44,30,"BAABBwoPAQkMAAEICg8BCQgAAQcLDwEBCgABAQEOCg8BCQgAAQcLDwEHCgABBgsPAQkIAAEHCw8BDgoAAQ0LDwEJCAABBwwPAQYIAAEEDA8BCQgAAQcMDwEMCAABCwwPAQkIAAEHDQ8BBAYAAQMNDwEJCAABBw0PAQsGAAEJDQ8BCQgAAQcODwECBAABAQ4PAQkIAAEHDg8BCQQAAQgODwEJCAABBw4PAQ4BAQMAAQ4ODwEJCAABBw8PAQcCAAEGDw8BCQgAAQcPDwENAgABDA8PAQkIAAEHCQ8BDAYPAQUBBAYPAQ4BDQgPAQkIAAEHCQ8BBQYPAQwBCwYPAQgBDAgPAQkIAAEHCQ8BAAENDQ8BAQEMCA8BCQgAAQcJDwEAAQcMDwEJAQABDAgPAQkIAAEHCQ8BAAEBAQ4LDwECAQABDAgPAQkIAAEHCQ8CAAEICg8BCgIAAQwIDwEJCAABBwkPAgABAQoPAQMCAAEMCA8BCQgAAQcJDwMAAQkIDwEMAwABDAgPAQkIAAEHCQ8DAAECCA8BBQMAAQwIDwEJCAABBwkPBAABCwYPAQ0EAAEMCA8BCQgAAQcJDwQAAQQGDwEGBAABDAgPAQkIAAEHCQ8QAAEMCA8BCQgAAQcJDxAAAQwIDwEJCAABBwkPEAABDAgPAQkIAAEHCQ8QAAEMCA8BCQgAAQcJDxAAAQwIDwEJCAABBwkPEAABDAgPAQkEAA=="],"н":[37,0,21,37,30,"BAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBxsPAQwIAAEHGw8BDAgAAQcbDwEMCAABBxsPAQwIAAEHGw8BDAgAAQcbDwEMCAABBxsPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMBAA="],"о":[37,0,20,37,32,"DAABAgEGAQoBDAIOAg8BDgEMAQoBBwEDFgABBgEMDQ8BDQEHAQERAAEEAQ0RDwEOAQUPAAEIFQ8BCQ0AAQkXDwELCwABBxkPAQkJAAEDGw8BBQgAAQwKDwEMAQUBAgEAAQEBBQELCg8BDQcAAQQKDwEIBwABBwoPAQUGAAEKCQ8BCwkAAQkJDwELBgABDgkPAQIJAAEBCg8BAQQAAQMJDwEMCwABCgkPAQUEAAEGCQ8BCAsAAQYJDwEIBAABCAkPAQULAAEECQ8BCQQAAQkJDwEDCwABAgkPAQsEAAEKCQ8BAwsAAQEJDwELBAABCgkPAQMLAAEBCQ8BCwQAAQkJDwEDCwABAgkPAQsEAAEICQ8BBQsAAQQJDwEJBAABBgkPAQgLAAEGCQ8BCAQAAQMJDwEMCwABCgkPAQUFAAEOCQ8BAgkAAQEKDwEBBQABCgkPAQsJAAEJCQ8BCwYAAQQKDwEIBwABBwoPAQYHAAEMCg8BDAEFAQIBAAEBAQUBCwoPAQ0IAAEDGw8BBQkAAQcZDwEJCwABCRcPAQsNAAEIFQ8BCg8AAQQBDREPAQ4BBhIAAQYBDA0PAQ0BBwEBFQABAgEHAQoBDAEOAw8BDgEMAQoBBwEDDAA="],"п":[37,0,21,37,30,"BAABBxsPAQwIAAEHGw8BDAgAAQcbDwEMCAABBxsPAQwIAAEHGw8BDAgAAQcbDwEMCAABBxsPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMCAABBwkPCQABCggPAQwIAAEHCQ8JAAEKCA8BDAgAAQcJDwkAAQoIDwEMBAA="],"р":[39,0,20,39,42,"EwABBAEJAQwBDgEPAQ4BDQEKAQYBAQ4AAQcJDwMAAQUBDQkPAQ4BBg0AAQcJDwIAAQkNDwELAQELAAEHCQ8BAAEKDw8BDAEBCgABBwkPAQkRDwELCgABBxwPAQYJAAEHHA8BDgEBCAABBwwPAQoBBAEBAQABAgEGAQ4KDwEICAABBwsPAQUGAAEBAQwJDwENCAABBwoPAQgIAAEBAQ4JDwEEBwABBwkPAQ4BAQkAAQcJDwEIBwABBwkPAQkKAAECCQ8BCwcAAQcJDwEFCwABDQgPAQ4HAAEHCQ8BAgsAAQsJDwEBBgABBwkPAQELAAEJCQ8BAgYAAQcJDwwAAQgJDwEDBgABBwkPDAABCAkPAQMGAAEHCQ8BAQsAAQkJDwECBgABBwkPAQILAAELCQ8BAQYAAQcJDwEFCwABDQgPAQ4HAAEHCQ8BCQoAAQIJDwELBwABBwkPAQ4BAQkAAQcJDwEIBwABBwoPAQgIAAEBAQ4JDwEFBwABBwsPAQUGAAEBAQwJDwENCAABBwwPAQoBBAEBAQABAgEGAQ0KDwEICAABBxwPAQ4BAQgAAQccDwEGCQABBwkPAQkRDwELCgABBwkPAQABCg8PAQwBAQoAAQcJDwIAAQkNDwELAQELAAEHCQ8DAAEFAQ0JDwEOAQcNAAEHCQ8FAAEEAQkBDAEOAg8BDQEKAQYBAQ4AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDx0AAQcJDxkA"],"с":[32,0,20,32,32,"DAABAQEFAQgBCwENAQ4CDwEOAQ0BCwEIAQUBARAAAQQBCg4PAQsBBQwAAQIBCxIPAQYKAAEFAQ4TDwEGCQABBhUPAQYIAAEFFg8BBgcAAQIBDhYPAQYHAAEKCw8BDQEHAQMBAQEAAQEBAwEHAQsDDwEGBgABAwsPAQYJAAEDAQsBDwEGBgABCQoPAQUMAAEGAQUGAAEOCQ8BCBQAAQMJDwEOAQEUAAEGCQ8BChUAAQgJDwEGFQABCQkPAQQVAAEKCQ8BAxUAAQoJDwEDFQABCQkPAQQVAAEICQ8BBhUAAQYJDwEKFQABAwkPAQ4BARUAAQ4JDwEIFQABCQoPAQUMAAIFBgABAwsPAQYJAAECAQoBDwEGBwABCgsPAQ0BBwEDAQEBAAEBAQMBBgELAw8BBgcAAQIBDhYPAQYIAAEFFg8BBgkAAQYVDwEGCgABBQEOEw8BBgsAAQIBCxIPAQYNAAEEAQoODwELAQUQAAEBAQUBCAELAQ0BDgIPAQ4BDQELAQgBBQEBBgA="],"т":[31,0,21,32,30,"AQweDwEBAQweDwEBAQweDwEBAQweDwEBAQweDwEBAQweDwEBAQweDwEBCgABAQkPAQUVAAEBCQ8BBRUAAQEJDwEFFQABAQkPAQUVAAEBCQ8BBRUAAQEJDwEFFQABAQkPAQUVAAEBCQ8BBRUAAQEJDwEFFQABAQkPAQUVAAEBCQ8BBRUAAQEJDwEFFQABAQkPAQUVAAEBCQ8BBRUAAQEJDwEFFQABAQkPAQUVAAEBCQ8BBRUAAQEJDwEFFQABAQkPAQUVAAEBCQ8BBRUAAQEJDwEFFQABAQkPAQUVAAEBCQ8BBQsA"],"у":[35,0,21,35,42,"AQIJDwEEDQABBgkPAQEBAAELCA8BCg0AAQsIDwEKAgABBAkPAQELAAEBCQ8BBAMAAQ0IDwEHCwABBggPAQ4EAAEHCA8BDQsAAQsIDwEIBAABAQEOCA8BBAkAAQEJDwECBQABCQgPAQkJAAEGCA8BDAYAAQMIDwEOAQEIAAELCA8BBgcAAQwIDwEGBwABAQkPAQEHAAEFCA8BDAcAAQYIDwEKCQABDggPAQMGAAELCA8BBQkAAQgIDwEJBQABAQgPAQ4KAAECCA8BDgUAAQUIDwEICwABCggPAQUEAAEKCA8BAwsAAQQIDwELAwABAQgPAQwNAAEMCA8BAgIAAQUIDwEHDQABBggPAQgCAAEKCA8BAQ0AAQEBDgcPAQ4BAAEBCA8BCg8AAQkIDwIFCA8BBQ8AAQIIDwIKBw8BDhEAAQsQDwEJEQABBRAPAQMSAAENDg8BDBMAAQcODwEHEwABAQ4PAQEUAAEJDA8BCxUAAQMMDwEFFgABDAoPAQ4XAAEGCg8BCRgAAQ4JDwEDGAABCAgPAQ0ZAAEECA8BBxkAAQkIDwECGAABAQEOBw8BCxkAAQgIDwEEFgABAQEEAQoIDwEMEwABCQ4PAQQTAAEJDQ8BChQAAQkMDwENAQEUAAEJCw8BDQECFQABCQoPAQoBARYAAQkFDwEOAQ0BCwEIAQITAA=="],"ф":[54,0,10,54,52,"FgABDggPAQgsAAEOCA8BCCwAAQ4IDwEILAABDggPAQgsAAEOCA8BCCwAAQ4IDwEILAABDggPAQgsAAEOCA8BCCwAAQ4IDwEILAABDggPAQghAAEFAQkBDAEOAQ8BDgEMAQkBBQIAAQ4IDwEIAQABAQEHAQsBDQEOAQ8BDgELAQcBAhQAAQQBDQkPAQ0BBQEOCA8CCQoPAQoBAREAAQgjDwEOAQMPAAEKJQ8BDgEEDQABCCcPAQ4BAgsAAQMpDwELCwABDCoPAQUJAAEECg8BDQEFAgEBBQELCw8BDgEIAQMBAQECAQgKDwENCQABCwkPAQ0BAgUAAQcJDwENAQIFAAEGCg8BBAcAAQEKDwEEBwABDggPAQgHAAEKCQ8BCgcAAQUJDwEKCAABDggPAQgHAAECCQ8BDgcAAQgJDwEFCAABDggPAQgIAAELCQ8BAgYAAQsJDwEBCAABDggPAQgIAAEHCQ8BBQYAAQ0IDwEOCQABDggPAQgIAAEFCQ8BBgYAAQ4IDwEMCQABDggPAQgIAAEDCQ8BBwYACQ8BCwkAAQ4IDwEICAABAwkPAQgGAAkPAQsJAAEOCA8BCAgAAQMJDwEIBgABDggPAQwJAAEOCA8BCAgAAQMJDwEHBgABDQgPAQ4JAAEOCA8BCAgAAQUJDwEGBgABCwkPAQEIAAEOCA8BCAgAAQcJDwEFBgABCAkPAQUIAAEOCA8BCAgAAQsJDwECBgABBQkPAQoIAAEOCA8BCAcAAQIJDwEOBwABAQoPAQMHAAEOCA8BCAcAAQoJDwEKCAABCwkPAQ0BAQUAAQcJDwENAQIFAAEGCg8BBAgAAQUKDwENAQQCAQEEAQsLDwEOAQgBAwIBAQgKDwENCgABDCoPAQYKAAEDKQ8BCwwAAQgnDwEOAQINAAEKJQ8BDgEEDwABCSMPAQ4BBBEAAQUBDQkPAQ0BBQEOCA8CCQoPAQoBARQAAQUBCQENAQ4BDwEOAQwBCQEFAgABDggPAQgBAAEBAQcBCwENAQ4BDwEOAQsBCAECIQABDggPAQgsAAEOCA8BCCwAAQ4IDwEILAABDggPAQgsAAEOCA8BCCwAAQ4IDwEILAABDggPAQgsAAEOCA8BCCwAAQ4IDwEILAABDggPAQgWAA=="],"х":[35,0,21,35,30,"AQABBAkPAQoLAAEMCA8BDgECAwABCQkPAQUJAAEICQ8BBgUAAQwIDwEOAQIHAAEECQ8BCgYAAQIBDggPAQsGAAEBAQ0IDwENAQEHAAEGCQ8BBgUAAQkJDwEDCQABCggPAQ4BAgMAAQQJDwEHCgABAQENCA8BCwIAAQEBDggPAQsMAAEDCQ8BBgEAAQoIDwEOAQENAAEHCA8BDgEHCQ8BBA8AAQsRDwEIEAABAgEODw8BDBIAAQQODwEOAQITAAEJDQ8BBRUAAQwLDwEJFgABAwoPAQ4BARYAAQkLDwEHFQABBQ0PAQMTAAECAQ4NDwENAQESAAEMDw8BChEAAQgRDwEGDwABBAkPAQ0IDwEOAQINAAEBAQ4IDwEKAQEBDQgPAQwNAAELCA8BDgEBAQABBAkPAQkLAAEHCQ8BBQMAAQgJDwEECQABAwkPAQkFAAEMCA8BDgEBBwABAQENCA8BDQEBBQABAwkPAQsHAAEKCQ8BBAcAAQcJDwEHBQABBgkPAQgJAAELCQ8BAwMAAQIBDggPAQwKAAECAQ4IDwENAQECAAEMCQ8BAwsAAQUJDwEKAQA="],"ц":[40,0,21,40,37,"BAABBwkPCQABCggPAQwLAAEHCQ8JAAEKCA8BDAsAAQcJDwkAAQoIDwEMCwABBwkPCQABCggPAQwLAAEHCQ8JAAEKCA8BDAsAAQcJDwkAAQoIDwEMCwABBwkPCQABCggPAQwLAAEHCQ8JAAEKCA8BDAsAAQcJDwkAAQoIDwEMCwABBwkPCQABCggPAQwLAAEHCQ8JAAEKCA8BDAsAAQcJDwkAAQoIDwEMCwABBwkPCQABCggPAQwLAAEHCQ8JAAEKCA8BDAsAAQcJDwkAAQoIDwEMCwABBwkPCQABCggPAQwLAAEHCQ8JAAEKCA8BDAsAAQcJDwkAAQoIDwEMCwABBwkPCQABCggPAQwLAAEHCQ8JAAEKCA8BDAsAAQcJDwkAAQoIDwEMCwABBwkPCQABCggPAQwLAAEHCQ8JAAEKCA8BDAsAAQcgDwEKBgABByAPAQoGAAEHIA8BCgYAAQcgDwEKBgABByAPAQoGAAEHIA8BCgYAAQcgDwEKIAABAQYPAQogAAEBBg8BCiAAAQEGDwEKIAABAQYPAQogAAEBBg8BCiAAAQEGDwEKIAABAQYPAQoCAA=="],"ч":[37,0,21,37,30,"AwABCAgPAQ4IAAEHCA8BDgkAAQgIDwEOCAABBwgPAQ4JAAEICA8BDggAAQcIDwEOCQABCAgPAQ4IAAEHCA8BDgkAAQgIDwEOCAABBwgPAQ4JAAEICA8BDggAAQcIDwEOCQABCAgPAQ4IAAEHCA8BDgkAAQgIDwEOCAABBwgPAQ4JAAEICQ8IAAEHCA8BDgkAAQgJDwECBwABBwgPAQ4JAAEHCQ8BBAcAAQcIDwEOCQABBgkPAQkHAAEHCA8BDgkAAQUKDwEHAQIFAAEHCA8BDgkAAQIaDwEOCgABDRkPAQ4KAAEHGQ8BDgoAAQEBDRgPAQ4LAAEEAQ4XDwEODAABBAENFg8BDg4AAQYBCwENEw8BDhsAAQcIDwEOGwABBwgPAQ4bAAEHCA8BDhsAAQcIDwEOGwABBwgPAQ4bAAEHCA8BDhsAAQcIDwEOGwABBwgPAQ4bAAEHCA8BDhsAAQcIDwEOBgA="],"ш":[57,0,21,57,30,"BAABBwkPCQABAwkPAQMJAAkPAQcIAAEHCQ8JAAEDCQ8BAwkACQ8BBwgAAQcJDwkAAQMJDwEDCQAJDwEHCAABBwkPCQABAwkPAQMJAAkPAQcIAAEHCQ8JAAEDCQ8BAwkACQ8BBwgAAQcJDwkAAQMJDwEDCQAJDwEHCAABBwkPCQABAwkPAQMJAAkPAQcIAAEHCQ8JAAEDCQ8BAwkACQ8BBwgAAQcJDwkAAQMJDwEDCQAJDwEHCAABBwkPCQABAwkPAQMJAAkPAQcIAAEHCQ8JAAEDCQ8BAwkACQ8BBwgAAQcJDwkAAQMJDwEDCQAJDwEHCAABBwkPCQABAwkPAQMJAAkPAQcIAAEHCQ8JAAEDCQ8BAwkACQ8BBwgAAQcJDwkAAQMJDwEDCQAJDwEHCAABBwkPCQABAwkPAQMJAAkPAQcIAAEHCQ8JAAEDCQ8BAwkACQ8BBwgAAQcJDwkAAQMJDwEDCQAJDwEHCAABBwkPCQABAwkPAQMJAAkPAQcIAAEHCQ8JAAEDCQ8BAwkACQ8BBwgAAQcJDwkAAQMJDwEDCQAJDwEHCAABBwkPCQABAwkPAQMJAAkPAQcIAAEHCQ8JAAEDCQ8BAwkACQ8BBwgAAQcvDwEHCAABBy8PAQcIAAEHLw8BBwgAAQcvDwEHCAABBy8PAQcIAAEHLw8BBwgAAQcvDwEHBAA="],"щ":[60,0,21,60,37,"BAABBwkPCQABAwkPAQMJAAkPAQcLAAEHCQ8JAAEDCQ8BAwkACQ8BBwsAAQcJDwkAAQMJDwEDCQAJDwEHCwABBwkPCQABAwkPAQMJAAkPAQcLAAEHCQ8JAAEDCQ8BAwkACQ8BBwsAAQcJDwkAAQMJDwEDCQAJDwEHCwABBwkPCQABAwkPAQMJAAkPAQcLAAEHCQ8JAAEDCQ8BAwkACQ8BBwsAAQcJDwkAAQMJDwEDCQAJDwEHCwABBwkPCQABAwkPAQMJAAkPAQcLAAEHCQ8JAAEDCQ8BAwkACQ8BBwsAAQcJDwkAAQMJDwEDCQAJDwEHCwABBwkPCQABAwkPAQMJAAkPAQcLAAEHCQ8JAAEDCQ8BAwkACQ8BBwsAAQcJDwkAAQMJDwEDCQAJDwEHCwABBwkPCQABAwkPAQMJAAkPAQcLAAEHCQ8JAAEDCQ8BAwkACQ8BBwsAAQcJDwkAAQMJDwEDCQAJDwEHCwABBwkPCQABAwkPAQMJAAkPAQcLAAEHCQ8JAAEDCQ8BAwkACQ8BBwsAAQcJDwkAAQMJDwEDCQAJDwEHCwABBwkPCQABAwkPAQMJAAkPAQcLAAEHCQ8JAAEDCQ8BAwkACQ8BBwsAAQc0DwEGBgABBzQPAQYGAAEHNA8BBgYAAQc0DwEGBgABBzQPAQYGAAEHNA8BBgYAAQc0DwEGNAABBgYPAQY0AAEGBg8BBjQAAQYGDwEGNAABBgYPAQY0AAEGBg8BBjQAAQYGDwEGNAABBgYPAQYCAA=="],"ъ":[41,0,21,41,30,"AQABBxIIAQUVAAEOEg8BCRUAAQ4SDwEJFQABDhIPAQkVAAEOEg8BCRUAAQ4SDwEJFQAKBAENCA8BCR8AAQwIDwEJHwABDAgPAQkfAAEMCA8BCR8AAQwIDwEJHwABDAgPAQsFBQIEAQMBARYAAQwSDwEOAQoBBgEBEgABDBUPAQ4BBwEBEAABDBcPAQwBAQ8AAQwYDwEMDwABDBkPAQcOAAEMCA8BDAUIAQkBDAkPAQ0OAAEMCA8BCQcAAQUJDwECDQABDAgPAQkIAAEKCA8BBA0AAQwIDwEJCAABBwgPAQYNAAEMCA8BCQgAAQgIDwEFDQABDAgPAQkIAAENCA8BBA0AAQwIDwEJBgABAwELCQ8BAQ0AAQwJDwUOCw8BDA4AAQwZDwEEDgABDBgPAQkPAAEMFw8BCBAAAQwVDwELAQMRAAEMDw8BDgENAQsBCQEGAQEIAA=="],"ы":[49,0,21,49,30,"BAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBwkPFQAJDwEHCAABBw8PAQ4BDQEMAQoBBwEDCQAJDwEHCAABBxUPAQ0BBgcACQ8BBwgAAQcXDwEMAQEFAAkPAQcIAAEHGA8BDQEBBAAJDwEHCAABBxkPAQoEAAkPAQcIAAEHGg8BAgMACQ8BBwgAAQcaDwEHAwAJDwEHCAABBwkPBgABAgEFAQ0IDwEJAwAJDwEHCAABBwkPCAABAwgPAQsDAAkPAQcIAAEHCQ8IAAEDCA8BCwMACQ8BBwgAAQcJDwYAAQIBBgENCA8BCQMACQ8BBwgAAQcaDwEHAwAJDwEHCAABBxoPAQIDAAkPAQcIAAEHGQ8BCgQACQ8BBwgAAQcYDwEOAQEEAAkPAQcIAAEHFw8BDAECBQAJDwEHCAABBxUPAQ0BBgcACQ8BBwgAAQcPDwIOAQwBCgEHAQMJAAkPAQcEAA=="],"ь":[34,0,21,34,30,"BAABBwkPGAABBwkPGAABBwkPGAABBwkPGAABBwkPGAABBwkPGAABBwkPGAABBwkPGAABBwkPGAABBwkPGAABBwkPGAABBwkPGAABBw8PAQ4BDQEMAQoBBwEDDAABBxUPAQ0BBgoAAQcXDwEMAQEIAAEHGA8BDQEBBwABBxkPAQoHAAEHGg8BAgYAAQcaDwEHBgABBwkPBgABAgEFAQ0IDwEJBgABBwkPCAABAwgPAQsGAAEHCQ8IAAEDCA8BCwYAAQcJDwYAAQIBBgENCA8BCQYAAQcaDwEHBgABBxoPAQIGAAEHGQ8BCgcAAQcYDwEOAQEHAAEHFw8BDAECCAABBxUPAQ0BBgoAAQcPDwIOAQwBCgEHAQMIAA=="],"э":[32,0,20,32,32,"CgABAgEDAQQCAwEBFQABAwEHAQoBDQgPAQwBCQEFDwABBAENDw8BDgEIAQEMAAEGEg8BDgEGCwABBhQPAQoBAQkAAQYVDwELAQEIAAEGFg8BCggAAQYEDwENAQoBCQEIAQkBCgEODA8BBgcAAQYBDwEOAQgBAgcAAQQBDAoPAQ4BAQYAAQYBCQEBCgABAQELCg8BBxQAAQEBDAkPAQwVAAEDCg8BAhUAAQsJDwEFCQAMBwELCQ8BBwkAAQ4VDwEJCQABDhUPAQoJAAEOFQ8BCgkAAQ4VDwEKCQABCwsMAQ0JDwEIFQABCAkPAQYVAAENCQ8BAxQAAQcJDwEOBgABAwEBDAABBAoPAQoGAAEGAQ4BBgoAAQUBDgoPAQMGAAEGAg8BDgEJAQUBAgEBAQABAQEDAQYBDAsPAQsHAAEGFg8BDgECBwABBhYPAQUIAAEGFQ8BBQkAAQYTDwENAQQKAAEGEg8BCAEBCwABAQEGAQsNDwEMAQcBAREAAQMBBgEIAQoECwEJAQcBBQECDQA="],"ю":[52,0,20,53,32,"GwABAgEFAQkBCwENAQ4CDwEOAQ0BCwEIAQQRAAEHCQ8LAAEEAQsNDwEOAQkBAg4AAQcJDwkAAQIBDBIPAQgBAQwAAQcJDwgAAQQBDhQPAQwBAgsAAQcJDwcAAQQXDwENAQIKAAEHCQ8GAAEDAQ4YDwENAQEJAAEHCQ8GAAEMGg8BCQkAAQcJDwUAAQcKDwEOAQcBAgIBAQMBCAsPAQMIAAEHCQ8FAAEOCQ8BDAEBBgABAwEOCQ8BCggAAQcJDwQAAQUJDwEOAQEIAAEECg8BAQcAAQcJDwQAAQoJDwEHCgABCwkPAQYHAAEHCQ8EAAEOCQ8BAgoAAQUJDwEJBwABBwkPAwABAgkPAQwLAAEBCQ8BDAcAAQcWDwEKDAABDggPAQ4HAAEHFg8BCAwAAQwJDwcAAQcWDwEHDAABCwkPAQEGAAEHFg8BBwwAAQsJDwEBBgABBxYPAQgMAAEMCQ8HAAEHFg8BCgwAAQ4IDwEOBwABBwkPAwABAQkPAQwLAAEBCQ8BDAcAAQcJDwQAAQ0JDwEBCgABBQkPAQkHAAEHCQ8EAAEKCQ8BBwoAAQsJDwEGBwABBwkPBAABBQkPAQ4BAQgAAQQKDwEBBwABBwkPBQABDgkPAQwBAQYAAQMBDgkPAQoIAAEHCQ8FAAEGCg8BDgEHAQICAQEDAQgLDwEDCAABBwkPBgABDBoPAQkJAAEHCQ8GAAECAQ4YDwENAQEJAAEHCQ8HAAEEFw8BDgECCgABBwkPCAABBAEOFA8BDQECCwABBwkPCQABAgEMEg8BCQEBDAABBwkPCwABBAELDQ8BDgEJAQIlAAECAQUBCQELAQ0BDgIPAQ4BDQELAQgBBQEBDAA="],"я":[35,0,21,35,30,"CQABAwEHAQoBDAENAQ4PDwEDCwABBgENFQ8BAwkAAQEBCxcPAQMJAAELGA8BAwgAAQUZDwEDCAABCxkPAQMIABoPAQMHAAEBCQ8BDQEFAQIEAAEDCQ8BAwcAAQIJDwECBgABAwkPAQMHAAEBCA8BDgcAAQMJDwEDCAABDggPAQIGAAEDCQ8BAwgAAQkIDwENAQUBAgQAAQMJDwEDCAABAxkPAQMJAAEIGA8BAwoAAQoXDwEDCgABAQELFg8BAwwAAQgVDwEDDQABDBQPAQMMAAEGFQ8BAwsAAQEBDggPAQMCAAEDCQ8BAwsAAQkIDwEIAwABAwkPAQMKAAEDCA8BDgEBAwABAwkPAQMKAAEMCA8BBQQAAQMJDwEDCQABBggPAQsFAAEDCQ8BAwgAAQEBDggPAQMFAAEDCQ8BAwgAAQoIDwEIBgABAwkPAQMHAAEECA8BDgEBBgABAwkPAQMHAAEMCA8BBQcAAQMJDwEDBgABBwgPAQsIAAEDCQ8BAwUAAQEBDggPAQMIAAEDCQ8BAwQA"],"Ё":[37,0,1,37,50,"CQABAwYPBAABDAUPAQYTAAEDBg8EAAEMBQ8BBhMAAQMGDwQAAQwFDwEGEwABAwYPBAABDAUPAQYTAAEDBg8EAAEMBQ8BBhMAAQMGDwQAAQwFDwEGxwABARsPAQUIAAEBGw8BBQgAAQEbDwEFCAABARsPAQUIAAEBGw8BBQgAAQEbDwEFCAABARsPAQUIAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBGg8BBQkAAQEaDwEFCQABARoPAQUJAAEBGg8BBQkAAQEaDwEFCQABARoPAQUJAAEBGg8BBQkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEKDwECGQABAQoPAQIZAAEBCg8BAhkAAQEbDwEOCAABARsPAQ4IAAEBGw8BDggAAQEbDwEOCAABARsPAQ4IAAEBGw8BDggAAQEbDwEOBAA="],"ё":[37,0,9,37,43,"CgABCQUPAQkDAAEDBg8UAAEJBQ8BCQMAAQMGDxQAAQkFDwEJAwABAwYPFAABCQUPAQkDAAEDBg8UAAEJBQ8BCQMAAQMGDxQAAQkFDwEJAwABAwYPzwABAgEGAQkBDAENAQ4CDwEOAQwBCQEGAQIWAAEFAQwNDwELAQQSAAEDAQwRDwEKAQEPAAEGFA8BDQEDDQABCBYPAQ4BAwsAAQYYDwEOAQEJAAECCg8BCgEFAQEBAAEBAQQBCwkPAQsJAAELCQ8BBQcAAQcJDwEEBwABAwkPAQUJAAEKCA8BCwcAAQkIDwEMCgABAgkPAQIGAAEOCA8BBgsAAQ0IDwEGBQABAwkPAQILAAELCA8BCgUAAQYeDwEMBQABCB4PAQ4FAAEJHw8FAAEKHw8FAAEKHw8FAAEJHw8FAAEICQ8bAAEGCQ8BAhoAAQMJDwEGGwABDggPAQsbAAEKCQ8BAxEAAQUBCAcAAQQJDwENAQEOAAEFAQwBDwEJCAABCwkPAQwBAgoAAQIBBwENAw8BCQgAAQMLDwEKAQUBAgEBAQABAgEDAQUBCQEMBg8BCQkAAQYaDwEJCgABCBkPAQkLAAEGGA8BCQwAAQMBDBQPAQwBBwEBDgABBAELDw8BDAEIAQMTAAEBAQUBCAELAQ0BDgIPAQ4BDQEMAQoBBwEFAQEKAA=="],"·":[21,0,27,21,24,"BQABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkPCwABBwkP/wAtAA=="],"×":[45,0,18,45,33,"CgABBQEKFQABBwEIEwABBQIPAQoTAAEGAg8BCBEAAQUEDwEKEQABBgQPAQgPAAEFBg8BCg8AAQYGDwEIDQABAQEOBw8BCg0AAQYIDwEEDQABBAgPAQkLAAEGCA8BBw8AAQQIDwEJCQABBggPAQcRAAEECA8BCQcAAQYIDwEHEwABBAgPAQkFAAEGCA8BCBUAAQQIDwEJAwABBQgPAQgXAAEFCA8BCQEAAQUIDwEIGQABBQgPAQsIDwEIGwABBQ8PAQgdAAEFDQ8BCB8AAQULDwEIIQABBQkPAQkiAAEFCQ8BCCEAAQQLDwEIHwABBA0PAQgdAAEEDw8BBxsAAQQIDwELCA8BBxkAAQQIDwEJAQABBggPAQcXAAEECA8BCQMAAQYIDwEHFQABBAgPAQkFAAEGCA8BBxMAAQQIDwEKBwABBggPAQcRAAEEAQ4HDwEKCQABBggPAQcPAAEEAQ4HDwEKCwABBggPAQcNAAEBAQ4HDwEKDQABBggPAQQNAAEFBg8BCg8AAQYGDwEIDwABBQQPAQoRAAEGBA8BCBEAAQUCDwEKEwABBwIPAQgTAAEFAQoVAAEHAQg3AA=="],"—":[54,0,33,54,18,"AgABATAPAQEEAAEBMA8BAQQAAQEwDwEBBAABATAPAQEEAAEBMA8BAQQAAQEwDwEBBAABATAPAQH/AP8AVgA="],"–":[27,0,33,27,18,"AgABARUPAQEEAAEBFQ8BAQQAAQEVDwEBBAABARUPAQEEAAEBFQ8BAQQAAQEVDwEBBAABARUPAQH/ACwA"],"№":[65,0,11,65,40,"BQALBQECFQABAgEDAQQCBQECGQABAQsPAQsRAAEEAQkBDAYPAQYZAAEBDA8BBA4AAQEBDAkPAQYZAAEBDA8BDA0AAQEBDAoPAQYZAAEBDQ8BBQwAAQcLDwEGGQABAQ0PAQ0MAAENCw8BBhkAAQEODwEGCgABAQoPAQsBCAEDGQABAQ4PAQ0BAQkAAQQJDwEJHAABAQ8PAQcJAAEFCQ8BBRwAAQEPDwEOAQEIAAEGCQ8BBBwAAQEQDwEICAABBgkPAQQcAAEBEA8BDgEBBwABBgkPAQQLAAEBAgIBAQ0AAQERDwEJBwABBgkPAQQIAAEBAQgBDQQPAQwBBwEBCgABAQkPAQsIDwECBgABBgkPAQQHAAEFAQ4IDwENAQMJAAEBCQ8CCQcPAQoGAAEGCQ8BBAYAAQULDwEOAQMIAAEBCQ8BCQECCA8BAwUAAQYJDwEEBQABAQEOBQ8CDQUPAQwIAAEBCQ8BCQEAAQkHDwELBQABBgkPAQQFAAEIBA8BDgEEAgABBwUPAQUHAAEBCQ8BCQEAAQEBDgcPAQMEAAEGCQ8BBAUAAQ4EDwEHBAABCwQPAQsHAAEBCQ8BCQIAAQgHDwELBAABBgkPAQQEAAECBQ8BAQQAAQUFDwcAAQEJDwEJAgABAQEOBw8BBAMAAQYJDwEEBAABBQQPAQ0FAAECBQ8BAwYAAQEJDwEJAwABBwcPAQwDAAEGCQ8BBAQAAQYEDwEMBgAFDwEEBgABAQkPAQkEAAENBw8BBQIAAQYJDwEEBAABBwQPAQsGAAUPAQUGAAEBCQ8BCQQAAQYHDwENAgABBgkPAQQEAAEGBA8BDAYABQ8BBAYAAQEJDwEJBQABDQcPAQYBAAEGCQ8BBAQAAQUEDwEOBQABAgUPAQMGAAEBCQ8BCQUAAQUHDwEOAQEBBgkPAQQEAAECBQ8BAgQAAQUEDwEOBwABAQkPAQkGAAEMBw8BBwEGCQ8BBAUAAQ0EDwEIBAABCwQPAQsHAAEBCQ8BCQYAAQQHDwEOAQcJDwEEBQABBwUPAQUCAAEIBQ8BBQcAAQEJDwEJBwABCwcPAQ0JDwEEBQABAQENBQ8CDgUPAQwIAAEBCQ8BCQcAAQMRDwEEBgABBAsPAQ4BAggAAQEJDwEJCAABChAPAQQHAAEEAQ0IDwEMAQIJAAEBCQ8BCQgAAQIQDwEECAABAQEHAQwDDwEOAQsBBgsAAQEJDwEICQABCQ8PAQQMAAIBDgABAwkPAQcJAAECDw8BBBsAAQEBCgkPAQYKAAEIDg8BBBkAAQIBDQsPAQMKAAEBAQ4NDwEEBAABAhAEAQEDAAEDCw8BDQwAAQcNDwEEBAABBxAPAQUDAAEDCw8BBwwAAQEBDgwPAQQEAAEHEA8BBQMAAQMKDwELDgABBgwPAQQEAAEHEA8BBQMAAQMIDwEOAQgQAAENCw8BBAQAAQcQDwEFAwABAwIPAQ4BDQEMAQoBBwEEEgABBQsPAQQEAAEHEA8BBQIA"],"…":[54,0,41,54,10,"BAABCwgPAQwIAAELCA8BCwgAAQwIDwELCAABCwgPAQwIAAELCA8BCwgAAQwIDwELCAABCwgPAQwIAAELCA8BCwgAAQwIDwELCAABCwgPAQwIAAELCA8BCwgAAQwIDwELCAABCwgPAQwIAAELCA8BCwgAAQwIDwELCAABCwgPAQwIAAELCA8BCwgAAQwIDwELCAABCwgPAQwIAAELCA8BCwgAAQwIDwELCAABCwgPAQwIAAELCA8BCwgAAQwIDwELCAABCwgPAQwIAAELCA8BCwgAAQwIDwELCAABCwgPAQwIAAELCA8BCwgAAQwIDwELBAA="]}};
