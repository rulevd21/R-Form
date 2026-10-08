// R/Form Content Control API v0.6.1
// Standalone Apps Script web app for Channel Control.
// Reads CONTENT_QUEUE + DATA_EVENTS, applies allowlisted content actions,
// saves owner-facing event edits, stores private photo/video assets in Drive,
// and can promote an approved event to a PLANNED CONTENT_QUEUE row.
// It never calls Telegram. One explicit owner approval may set SCHEDULED;
// the separate Telegram Autopost project remains the only publishing transport.

const RFORM_CONTENT_API_V04 = Object.freeze({
  version: '0.6.2',
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
      if(!ai || JSON.parse(ai.New_Values)._meta.source_hash !== request.source_hash) throw new Error('Запрос ИИ устарел или отсутствует.');
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
  const parts=[s.Date+' · Тренировка '+s.Session_Type,'Итоги: '+result];
  if(s.Actual_Duration) parts.push('Продолжительность: '+s.Actual_Duration+' мин.');
  if(s.Session_Decision) parts.push('Решение: '+s.Session_Decision);
  parts.push('#RForm_Training');
  const text=parts.join('\n\n');
  if(text.length>1200) throw new Error('Факты требуют редакторского сокращения; автоматический короткий текст не создан.');
  return text;
}

function rformContentApiV04TrainingDrafts_(c,request) {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('RFORM_AUTO_DRAFT_ENABLED')!=='YES') return {ok:true,status:'DISABLED',created:[]};
  const baseline=JSON.parse(props.getProperty('RFORM_AUTO_DRAFT_BASELINE') || '[]');
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
    let text;try {text=rformContentApiV04TrainingText_(s);} catch(_) {blocked.push({session_id:s.Session_ID,reason:'FACT_PACKET_NOT_READY'});return;}
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
    Object.keys(item).forEach(function(f) {if(!c.map[f]) throw new Error('Missing training draft field: '+f);});
    c.records=null; c.log.appendRow([actionId,new Date(),id,'AUTO_TRAINING_DRAFT',s.Session_ID,Object.keys(item).join(','),
      '{}',JSON.stringify(Object.assign({},item,{_meta:{training_hash:rformContentApiV04TrainingHash_(s)}})),'TRAINING_DRAFT_WORKER',request.nonce || '','PENDING']);
    const lr=c.log.getLastRow();
    try {
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
  const expected=JSON.parse(record.New_Values)._meta.training_hash;
  const sessions=rformContentApiV04ReadRows_(rformContentApiV04RequireSheet_(ss,RFORM_CONTENT_API_V04.trainingSessionsSheet),
    RFORM_CONTENT_API_V04.trainingSessionFields.concat(['Completed_At','Duplicate_Flag']),'Session_ID').filter(function(s) {return s.Session_ID===value('Session_ID');});
  if(sessions.length!==1 || sessions[0].Session_Status!=='CLOSED' ||
    expected!==rformContentApiV04TrainingHash_(sessions[0])) throw new Error('Исходная тренировка изменилась; требуется сверка фактов.');
}

// Channel observations use the existing action log, never another queue or publisher.
const RFORM_CHANNEL = Object.freeze({id:'-1004309818003', username:'r_form'});

function rformContentApiV04Archived_(value) {
  return ['ARCHIVED','CANCELLED','SUPERSEDED'].indexOf(value('Publication_Status'))!==-1 ||
    /ARCHIV|SUPERSEDED|CANCELLED|ЗАКРЫТО|ЗАМЕНЕНО/i.test(value('Pipeline_Status')+' '+value('Current_Stage')+' '+value('Text_Status')) ||
    value('Current_Stage')==='EDITORIAL_GATE_CLOSED' || /^TEST-/.test(value('Content_ID'));
}

function rformContentApiV04ChannelPosts_(c) {
  const posts={};
  rformContentApiV04WorkspaceRecords_(c).forEach(function(r) {
    if(r.Action!=='CHANNEL_POST' || r.Result!=='APPLIED') return;
    let p;try {p=JSON.parse(r.New_Values)._meta;} catch(_) {return;}
    if(!p || p.channel_id!==RFORM_CHANNEL.id) return;
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
  if(String(p.channel_id)!==RFORM_CHANNEL.id || !Number.isSafeInteger(p.message_id) || p.message_id<1 ||
    !Number.isSafeInteger(p.date) || p.date<1 || p.date>Date.now()/1000+300 ||
    !Number.isSafeInteger(p.revision) || p.revision<p.date || p.revision>Date.now()/1000+300 ||
    typeof p.text!=='string' || p.text.length>4096 || !Array.isArray(p.media) || p.media.length>10 ||
    p.media.some(function(m){return !m || ['photo','video','document'].indexOf(m.type)===-1 || typeof m.file_id!=='string' || m.file_id.length>200;}))
    throw new Error('Некорректное наблюдение канала.');
  const event={channel_id:RFORM_CHANNEL.id,message_id:p.message_id,date:p.date,revision:p.revision,
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
