// R/Form Owner Bot v1.0.0 · P0 Owner Inbox
// Standalone Google Apps Script project.
// Purpose: private Telegram owner interface for OWNER_FINAL_PREVIEW materials.
// Read/write contract:
//   - reads CONTENT_QUEUE only through signed Content Control API;
//   - fetches prepared images only through Content Control API;
//   - approves/schedules or holds only through Content Control API;
//   - writes bot-only audit events to CONTENT_ACTION_LOG;
//   - never publishes directly to @r_form and never stores the channel autopost token.
//
// Required Script Properties:
//   RFORM_OWNER_BOT_TOKEN
//   RFORM_CONTENT_API_URL
//   RFORM_CONTENT_API_SECRET
//   RFORM_OWNER_BOT_WEBAPP_URL   (after deploying this project as a Web App)
//
// Created by rformOwnerBotV1Install():
//   RFORM_OWNER_BOT_WEBHOOK_SECRET
//   RFORM_OWNER_BOT_ENABLED
//   RFORM_OWNER_BOT_ACTIONS_ENABLED
//
// Created by pairing:
//   RFORM_OWNER_TELEGRAM_USER_ID
//   RFORM_OWNER_TELEGRAM_CHAT_ID

const RFORM_OWNER_BOT_V1 = Object.freeze({
  version: '1.0.0',
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  actionLogSheet: 'CONTENT_ACTION_LOG',
  pollMinutes: 5,
  maxPreviewsPerPoll: 3,
  maxPreviewAssets: 3,
  maxTelegramTextChars: 4096,
  pairCodeTtlSeconds: 15 * 60,
  readyStage: 'OWNER_FINAL_PREVIEW',
  allowedPostModes: Object.freeze(['TEXT_ONLY', 'PHOTO_CAPTION', 'ALBUM_CAPTION']),
  actionLogHeaders: Object.freeze([
    'Action_ID', 'Timestamp', 'Content_ID', 'Action', 'Comment',
    'Changed_Fields', 'Previous_Values', 'New_Values', 'Actor',
    'Request_Nonce', 'Result'
  ]),
  props: Object.freeze({
    token: 'RFORM_OWNER_BOT_TOKEN',
    apiUrl: 'RFORM_CONTENT_API_URL',
    apiSecret: 'RFORM_CONTENT_API_SECRET',
    webAppUrl: 'RFORM_OWNER_BOT_WEBAPP_URL',
    webhookSecret: 'RFORM_OWNER_BOT_WEBHOOK_SECRET',
    enabled: 'RFORM_OWNER_BOT_ENABLED',
    actionsEnabled: 'RFORM_OWNER_BOT_ACTIONS_ENABLED',
    ownerUserId: 'RFORM_OWNER_TELEGRAM_USER_ID',
    ownerChatId: 'RFORM_OWNER_TELEGRAM_CHAT_ID',
    pairCodeHash: 'RFORM_OWNER_PAIR_CODE_HASH',
    pairCodeExpiresAt: 'RFORM_OWNER_PAIR_CODE_EXPIRES_AT',
    sentState: 'RFORM_OWNER_BOT_SENT_STATE'
  })
});

function rformOwnerBotV1SelfTest() {
  const sample = [
    {
      Content_ID: 'CNT-TEST-READY',
      Date: '24.08.2026',
      Rubric: 'WEEKLY_CONTROL',
      Public_Data_Allowed: 'YES',
      Publication_Status: 'PLANNED',
      Current_Stage: 'OWNER_FINAL_PREVIEW',
      Duplicate_Flag: '',
      Publish_Error: '',
      Telegram_Post_Mode: 'ALBUM_CAPTION',
      Telegram_Text: 'Тестовый текст',
      Telegram_Visual_URL: 'https://drive.google.com/drive/folders/TEST_FOLDER',
      Updated_At: '24.08.2026 12:00'
    },
    {
      Content_ID: 'CNT-TEST-HOLD',
      Date: '24.08.2026',
      Rubric: 'TRAINING_LOG',
      Public_Data_Allowed: 'YES',
      Publication_Status: 'HOLD',
      Current_Stage: 'OWNER_FINAL_PREVIEW',
      Duplicate_Flag: '',
      Publish_Error: '',
      Telegram_Post_Mode: 'TEXT_ONLY',
      Telegram_Text: 'Не должен попасть в inbox',
      Telegram_Visual_URL: '',
      Updated_At: '24.08.2026 12:01'
    }
  ];
  const ready = rformOwnerBotV1ReadyItems_(sample);
  if (ready.length !== 1 || ready[0].Content_ID !== 'CNT-TEST-READY') {
    throw new Error('SELF_TEST failed: ready-item filter.');
  }
  const previewId = rformOwnerBotV1PreviewId_(ready[0], {
    version: 3,
    assets: [
      {filename: 'card-01_v03.png', size: 100, version: 3, order: 1},
      {filename: 'card-02_v03.png', size: 100, version: 3, order: 2},
      {filename: 'card-03_v03.png', size: 100, version: 3, order: 3}
    ]
  });
  if (!/^[a-f0-9]{32}$/.test(previewId)) {
    throw new Error('SELF_TEST failed: preview id.');
  }
  if (rformOwnerBotV1ConstantTimeEqual_('abc', 'abd')) {
    throw new Error('SELF_TEST failed: constant-time compare.');
  }
  const report = {
    ok: true,
    version: RFORM_OWNER_BOT_V1.version,
    readyFilter: 'PASS',
    previewFingerprint: 'PASS',
    constantTimeCompare: 'PASS'
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function rformOwnerBotV1Preflight() {
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  const apiUrl = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiUrl);
  rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiSecret);

  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(apiUrl)) {
    throw new Error('RFORM_CONTENT_API_URL должен быть URL действующего Apps Script Web App /exec.');
  }

  const me = rformOwnerBotV1Telegram_(token, 'getMe', {});
  const bundle = rformOwnerBotV1ApiRead_();
  const capabilities = Array.isArray(bundle.capabilities) ? bundle.capabilities : [];
  const requiredCapabilities = [
    'content.read',
    'content.action',
    'publication.queue_approve_schedule',
    'publication.queue_assets'
  ];
  const missingCapabilities = requiredCapabilities.filter(function (name) {
    return capabilities.indexOf(name) === -1;
  });
  if (missingCapabilities.length) {
    throw new Error('Content Control API missing capabilities: ' + missingCapabilities.join(', '));
  }

  const ss = SpreadsheetApp.openById(RFORM_OWNER_BOT_V1.spreadsheetId);
  const audit = ss.getSheetByName(RFORM_OWNER_BOT_V1.actionLogSheet);
  if (!audit) throw new Error('Sheet not found: ' + RFORM_OWNER_BOT_V1.actionLogSheet);
  const auditHeaders = rformOwnerBotV1Headers_(audit);
  const missingAuditHeaders = RFORM_OWNER_BOT_V1.actionLogHeaders.filter(function (name) {
    return auditHeaders.indexOf(name) === -1;
  });
  if (missingAuditHeaders.length) {
    throw new Error('CONTENT_ACTION_LOG missing headers: ' + missingAuditHeaders.join(', '));
  }

  const ownerUserId = props.getProperty(RFORM_OWNER_BOT_V1.props.ownerUserId) || '';
  const ownerChatId = props.getProperty(RFORM_OWNER_BOT_V1.props.ownerChatId) || '';
  const triggerCount = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === 'rformOwnerBotV1Poll';
  }).length;
  const ready = rformOwnerBotV1ReadyItems_(bundle.queue || []);

  let webhook = null;
  try {
    webhook = rformOwnerBotV1Telegram_(token, 'getWebhookInfo', {});
  } catch (error) {
    webhook = {error: error.message};
  }

  const report = {
    ok: true,
    version: RFORM_OWNER_BOT_V1.version,
    mode: 'OWNER_BOT_P0_PREFLIGHT',
    botUsername: '@' + me.username,
    contentApiVersion: bundle.version || '',
    queueRows: Array.isArray(bundle.queue) ? bundle.queue.length : 0,
    ownerFinalPreviewRows: ready.length,
    ownerPaired: !!ownerUserId && !!ownerChatId,
    pollTriggerCount: triggerCount,
    botEnabled: props.getProperty(RFORM_OWNER_BOT_V1.props.enabled) || 'NOT_SET',
    actionsEnabled: props.getProperty(RFORM_OWNER_BOT_V1.props.actionsEnabled) || 'NOT_SET',
    webhookConfigured: !!(webhook && webhook.url),
    webhookPendingUpdates: webhook && webhook.pending_update_count !== undefined
      ? webhook.pending_update_count
      : null,
    channelPublishingCallsPresent: false,
    note: 'Owner Bot only approves/holds prepared materials. Telegram channel publishing remains in telegram_autopost.'
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function rformOwnerBotV1Install() {
  const report = rformOwnerBotV1Preflight();
  const props = PropertiesService.getScriptProperties();

  ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return trigger.getHandlerFunction() === 'rformOwnerBotV1Poll';
    })
    .forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });

  ScriptApp.newTrigger('rformOwnerBotV1Poll')
    .timeBased()
    .everyMinutes(RFORM_OWNER_BOT_V1.pollMinutes)
    .create();

  if (!props.getProperty(RFORM_OWNER_BOT_V1.props.webhookSecret)) {
    props.setProperty(
      RFORM_OWNER_BOT_V1.props.webhookSecret,
      rformOwnerBotV1RandomHex_(24)
    );
  }
  props.setProperty(RFORM_OWNER_BOT_V1.props.enabled, 'NO');
  props.setProperty(RFORM_OWNER_BOT_V1.props.actionsEnabled, 'NO');

  const webhook = rformOwnerBotV1SetWebhook_();
  const out = {
    ok: true,
    installed: true,
    version: RFORM_OWNER_BOT_V1.version,
    trigger: 'rformOwnerBotV1Poll every ' + RFORM_OWNER_BOT_V1.pollMinutes + ' minutes',
    botEnabled: 'NO',
    actionsEnabled: 'NO',
    webhook: webhook,
    next: report.ownerPaired
      ? 'Run rformOwnerBotV1SmokePreview(), then rformOwnerBotV1Enable().'
      : 'Run rformOwnerBotV1CreatePairCode(), then send /pair <code> to the bot.'
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function rformOwnerBotV1CreatePairCode() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(RFORM_OWNER_BOT_V1.props.ownerUserId)) {
    throw new Error('Owner already paired. Use rformOwnerBotV1ResetPairing() only if re-pairing is intentional.');
  }
  const code = String(Math.floor(10000000 + Math.random() * 90000000));
  const expiresAt = Math.floor(Date.now() / 1000) + RFORM_OWNER_BOT_V1.pairCodeTtlSeconds;
  props.setProperty(
    RFORM_OWNER_BOT_V1.props.pairCodeHash,
    rformOwnerBotV1Sha256Hex_(code)
  );
  props.setProperty(
    RFORM_OWNER_BOT_V1.props.pairCodeExpiresAt,
    String(expiresAt)
  );
  const out = {
    ok: true,
    pairCode: code,
    expiresInMinutes: Math.floor(RFORM_OWNER_BOT_V1.pairCodeTtlSeconds / 60),
    instruction: 'Send this in a private chat with the bot: /pair ' + code
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function rformOwnerBotV1ResetPairing() {
  const props = PropertiesService.getScriptProperties();
  [
    RFORM_OWNER_BOT_V1.props.ownerUserId,
    RFORM_OWNER_BOT_V1.props.ownerChatId,
    RFORM_OWNER_BOT_V1.props.pairCodeHash,
    RFORM_OWNER_BOT_V1.props.pairCodeExpiresAt
  ].forEach(function (name) {
    props.deleteProperty(name);
  });
  props.setProperty(RFORM_OWNER_BOT_V1.props.enabled, 'NO');
  props.setProperty(RFORM_OWNER_BOT_V1.props.actionsEnabled, 'NO');
  return 'Owner pairing cleared. Bot and actions disabled.';
}

function rformOwnerBotV1SmokePreview() {
  const props = PropertiesService.getScriptProperties();
  rformOwnerBotV1RequireOwnerPair_(props);
  const bundle = rformOwnerBotV1ApiRead_();
  const previews = rformOwnerBotV1BuildReadyPreviews_(bundle, 1);
  if (!previews.length) {
    rformOwnerBotV1SendOwnerText_('Сейчас нет материалов на финальном предпросмотре.');
    return {ok: true, sent: false, reason: 'NO_OWNER_FINAL_PREVIEW'};
  }
  rformOwnerBotV1SendPreview_(previews[0], {
    actionsEnabled: false,
    markSent: false,
    testMode: true
  });
  return {
    ok: true,
    sent: true,
    contentId: previews[0].item.Content_ID,
    previewId: previews[0].previewId,
    actionsEnabled: false
  };
}

function rformOwnerBotV1Enable() {
  const props = PropertiesService.getScriptProperties();
  rformOwnerBotV1RequireOwnerPair_(props);
  const report = rformOwnerBotV1Preflight();
  if (report.pollTriggerCount !== 1) {
    throw new Error('Owner Bot trigger is not installed exactly once. Run rformOwnerBotV1Install().');
  }
  props.setProperty(RFORM_OWNER_BOT_V1.props.enabled, 'YES');
  props.setProperty(RFORM_OWNER_BOT_V1.props.actionsEnabled, 'YES');
  props.deleteProperty(RFORM_OWNER_BOT_V1.props.sentState);
  rformOwnerBotV1SendOwnerText_(
    'R/Form Owner Bot включён. Готовые материалы будут приходить сюда автоматически.'
  );
  rformOwnerBotV1Poll();
  return 'R/Form Owner Bot ENABLED.';
}

function rformOwnerBotV1Disable() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(RFORM_OWNER_BOT_V1.props.enabled, 'NO');
  props.setProperty(RFORM_OWNER_BOT_V1.props.actionsEnabled, 'NO');
  return 'R/Form Owner Bot DISABLED. Webhook remains available for pairing/diagnostics.';
}

function rformOwnerBotV1SetWebhook_() {
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  const webAppUrl = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.webAppUrl);
  const hookSecret = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.webhookSecret);

  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(webAppUrl)) {
    throw new Error('RFORM_OWNER_BOT_WEBAPP_URL должен быть URL этого Apps Script Web App /exec.');
  }

  const separator = webAppUrl.indexOf('?') === -1 ? '?' : '&';
  const webhookUrl = webAppUrl + separator + 'hook=' + encodeURIComponent(hookSecret);
  const result = rformOwnerBotV1Telegram_(token, 'setWebhook', {
    url: webhookUrl,
    allowed_updates: JSON.stringify(['message', 'callback_query']),
    drop_pending_updates: true
  });
  return {ok: !!result, urlConfigured: true};
}

function rformOwnerBotV1DeleteWebhook() {
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  return rformOwnerBotV1Telegram_(token, 'deleteWebhook', {drop_pending_updates: true});
}

function doGet() {
  return ContentService
    .createTextOutput('R/Form Owner Bot v' + RFORM_OWNER_BOT_V1.version)
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    return rformOwnerBotV1Webhook_(e);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return ContentService
      .createTextOutput('OK')
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function rformOwnerBotV1Webhook_(e) {
  const props = PropertiesService.getScriptProperties();
  const expectedHook = props.getProperty(RFORM_OWNER_BOT_V1.props.webhookSecret) || '';
  const actualHook = e && e.parameter ? String(e.parameter.hook || '') : '';
  if (!expectedHook || !rformOwnerBotV1ConstantTimeEqual_(actualHook, expectedHook)) {
    console.warn('Owner Bot webhook rejected: invalid hook secret.');
    return ContentService.createTextOutput('OK');
  }

  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!raw) return ContentService.createTextOutput('OK');

  let update;
  try {
    update = JSON.parse(raw);
  } catch (error) {
    console.warn('Owner Bot webhook received invalid JSON.');
    return ContentService.createTextOutput('OK');
  }

  if (update.callback_query) {
    rformOwnerBotV1HandleCallback_(update.callback_query);
  } else if (update.message) {
    rformOwnerBotV1HandleMessage_(update.message);
  }
  return ContentService.createTextOutput('OK');
}

function rformOwnerBotV1HandleMessage_(message) {
  const props = PropertiesService.getScriptProperties();
  const from = message && message.from ? message.from : {};
  const chat = message && message.chat ? message.chat : {};
  const text = String(message && message.text ? message.text : '').trim();
  const userId = String(from.id || '');
  const chatId = String(chat.id || '');
  const chatType = String(chat.type || '');

  if (!userId || !chatId || !text) return;

  if (/^\/pair(?:@\w+)?(?:\s+|$)/i.test(text)) {
    rformOwnerBotV1HandlePair_(props, userId, chatId, chatType, text);
    return;
  }

  const ownerUserId = props.getProperty(RFORM_OWNER_BOT_V1.props.ownerUserId) || '';
  if (!ownerUserId || userId !== ownerUserId) return;

  if (/^\/today(?:@\w+)?$/i.test(text)) {
    const bundle = rformOwnerBotV1ApiRead_();
    const previews = rformOwnerBotV1BuildReadyPreviews_(bundle, 1);
    if (!previews.length) {
      rformOwnerBotV1SendOwnerText_('Сейчас нет материалов на финальном предпросмотре.');
      return;
    }
    rformOwnerBotV1SendPreview_(previews[0], {
      actionsEnabled: rformOwnerBotV1ActionsEnabled_(),
      markSent: true,
      testMode: false
    });
    return;
  }

  if (/^\/help(?:@\w+)?$/i.test(text) || /^\/start(?:@\w+)?$/i.test(text)) {
    rformOwnerBotV1SendOwnerText_(
      'R/Form Owner Bot\n\n' +
      'Готовый материал приходит автоматически. На первом этапе доступны два решения:\n' +
      '— Согласовать — передать точный предпросмотр в существующий Autopost.\n' +
      '— Отложить — снять материал с текущей очереди владельца.\n\n' +
      '/today — повторно показать текущий готовый материал.'
    );
  }
}

function rformOwnerBotV1HandlePair_(props, userId, chatId, chatType, text) {
  if (chatType !== 'private') return;

  const currentOwner = props.getProperty(RFORM_OWNER_BOT_V1.props.ownerUserId) || '';
  if (currentOwner) {
    if (userId === currentOwner) {
      rformOwnerBotV1Telegram_(
        rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token),
        'sendMessage',
        {chat_id: chatId, text: 'Этот Telegram-аккаунт уже связан с R/Form Owner Bot.'}
      );
    }
    return;
  }

  const match = text.match(/^\/pair(?:@\w+)?\s+(\d{8})$/i);
  if (!match) return;

  const code = match[1];
  const expectedHash = props.getProperty(RFORM_OWNER_BOT_V1.props.pairCodeHash) || '';
  const expiresAt = Number(props.getProperty(RFORM_OWNER_BOT_V1.props.pairCodeExpiresAt) || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!expectedHash || !Number.isFinite(expiresAt) || expiresAt < now) return;
  if (!rformOwnerBotV1ConstantTimeEqual_(rformOwnerBotV1Sha256Hex_(code), expectedHash)) return;

  props.setProperty(RFORM_OWNER_BOT_V1.props.ownerUserId, userId);
  props.setProperty(RFORM_OWNER_BOT_V1.props.ownerChatId, chatId);
  props.deleteProperty(RFORM_OWNER_BOT_V1.props.pairCodeHash);
  props.deleteProperty(RFORM_OWNER_BOT_V1.props.pairCodeExpiresAt);

  rformOwnerBotV1Telegram_(
    rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token),
    'sendMessage',
    {
      chat_id: chatId,
      text:
        'Связка подтверждена.\n\n' +
        'Бот пока в безопасном режиме: публикационные действия отключены. ' +
        'После smoke-test их можно включить функцией rformOwnerBotV1Enable().'
    }
  );
  console.log('R/Form Owner Bot paired to Telegram user ' + userId + '.');
}

function rformOwnerBotV1Poll() {
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(RFORM_OWNER_BOT_V1.props.enabled)).toUpperCase() !== 'YES') return;
  rformOwnerBotV1RequireOwnerPair_(props);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const bundle = rformOwnerBotV1ApiRead_();
    const previews = rformOwnerBotV1BuildReadyPreviews_(
      bundle,
      RFORM_OWNER_BOT_V1.maxPreviewsPerPoll
    );
    const sentState = rformOwnerBotV1SentState_();

    previews.forEach(function (preview) {
      const contentId = String(preview.item.Content_ID || '');
      if (!contentId) return;
      if (sentState[contentId] === preview.previewId) return;

      rformOwnerBotV1SendPreview_(preview, {
        actionsEnabled: true,
        markSent: true,
        testMode: false
      });
      sentState[contentId] = preview.previewId;
      rformOwnerBotV1SaveSentState_(sentState);
    });
  } catch (error) {
    console.error('Owner Bot poll failed: ' + (error && error.stack ? error.stack : error));
  } finally {
    lock.releaseLock();
  }
}

function rformOwnerBotV1BuildReadyPreviews_(bundle, limit) {
  const readyItems = rformOwnerBotV1ReadyItems_(bundle.queue || []);
  const result = [];
  for (let i = 0; i < readyItems.length && result.length < limit; i++) {
    const item = readyItems[i];
    const mode = String(item.Telegram_Post_Mode || 'TEXT_ONLY').trim().toUpperCase() || 'TEXT_ONLY';
    let assetPacket = {version: 0, assets: []};
    if (mode !== 'TEXT_ONLY') {
      assetPacket = rformOwnerBotV1ApiQueueAssets_(String(item.Content_ID || ''));
      if (!assetPacket || !Array.isArray(assetPacket.assets) || !assetPacket.assets.length) {
        throw new Error('В финальном предпросмотре отсутствуют изображения: ' + item.Content_ID);
      }
      if (assetPacket.assets.length > RFORM_OWNER_BOT_V1.maxPreviewAssets) {
        assetPacket.assets = assetPacket.assets.slice(0, RFORM_OWNER_BOT_V1.maxPreviewAssets);
      }
    }

    const previewId = rformOwnerBotV1PreviewId_(item, assetPacket);
    result.push({
      item: item,
      mode: mode,
      assetPacket: assetPacket,
      previewId: previewId,
      title: rformOwnerBotV1PreviewTitle_(item)
    });
  }
  return result;
}

function rformOwnerBotV1ReadyItems_(queue) {
  if (!Array.isArray(queue)) return [];
  return queue.filter(function (item) {
    const stage = String(item.Current_Stage || '').trim().toUpperCase();
    const publicAllowed = String(item.Public_Data_Allowed || '').trim().toUpperCase();
    const publication = String(item.Publication_Status || '').trim().toUpperCase();
    const duplicate = String(item.Duplicate_Flag || '').trim().toUpperCase();
    const mode = String(item.Telegram_Post_Mode || 'TEXT_ONLY').trim().toUpperCase() || 'TEXT_ONLY';
    const text = String(item.Telegram_Text || '').trim();

    if (stage !== RFORM_OWNER_BOT_V1.readyStage) return false;
    if (['YES', 'ДА', 'TRUE', '1'].indexOf(publicAllowed) === -1) return false;
    if (['SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'HOLD', 'CANCELLED'].indexOf(publication) !== -1) return false;
    if (['YES', 'ДА', 'TRUE', '1', 'DUPLICATE'].indexOf(duplicate) !== -1) return false;
    if (String(item.Publish_Error || '').trim()) return false;
    if (!text || text.length > RFORM_OWNER_BOT_V1.maxTelegramTextChars) return false;
    if (RFORM_OWNER_BOT_V1.allowedPostModes.indexOf(mode) === -1) return false;
    if (mode !== 'TEXT_ONLY' && !String(item.Telegram_Visual_URL || '').trim()) return false;
    return true;
  }).sort(function (left, right) {
    return rformOwnerBotV1DateSort_(left) - rformOwnerBotV1DateSort_(right);
  });
}

function rformOwnerBotV1DateSort_(item) {
  const source = String(item.Date || item.Updated_At || '').trim();
  const ru = source.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ru) return new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1])).getTime();
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function rformOwnerBotV1PreviewId_(item, assetPacket) {
  const assets = assetPacket && Array.isArray(assetPacket.assets)
    ? assetPacket.assets.map(function (asset) {
        return [
          String(asset.filename || ''),
          String(asset.size || ''),
          String(asset.version || ''),
          String(asset.order || '')
        ].join(':');
      }).join('|')
    : '';
  const source = [
    String(item.Content_ID || '').trim(),
    String(item.Updated_At || '').trim(),
    String(item.Publication_Status || '').trim(),
    String(item.Current_Stage || '').trim(),
    String(item.Telegram_Post_Mode || '').trim(),
    String(item.Telegram_Text || '').trim(),
    String(item.Telegram_Visual_URL || '').trim(),
    String(assetPacket && assetPacket.version !== undefined ? assetPacket.version : ''),
    assets
  ].join('\n');
  return rformOwnerBotV1Sha256Hex_(source).slice(0, 32);
}

function rformOwnerBotV1PreviewTitle_(item) {
  const rubric = String(item.Rubric || item.Content_Type || 'MATERIAL').trim().replace(/_/g, ' ');
  const date = String(item.Date || '').trim();
  return date ? rubric + ' · ' + date : rubric;
}

function rformOwnerBotV1SendPreview_(preview, options) {
  const opts = options || {};
  const item = preview.item;
  const contentId = String(item.Content_ID || '').trim();
  const actionsEnabled = !!opts.actionsEnabled;
  const testMode = !!opts.testMode;

  const header = [
    'R/Form Owner Inbox',
    preview.title,
    testMode ? 'ТЕСТ · действия отключены' : 'Готово к решению'
  ].join('\n');
  rformOwnerBotV1SendOwnerText_(header, {disable_notification: true});

  if (preview.mode !== 'TEXT_ONLY') {
    const blobs = preview.assetPacket.assets.map(function (asset) {
      const bytes = Utilities.base64Decode(String(asset.data_base64 || ''));
      return Utilities.newBlob(
        bytes,
        String(asset.mime_type || 'image/png'),
        String(asset.filename || 'preview.png')
      );
    });
    rformOwnerBotV1SendOwnerAlbum_(blobs);
  }

  const keyboard = actionsEnabled
    ? {inline_keyboard: [[
        {text: 'Согласовать', callback_data: 'ob:a:' + preview.previewId},
        {text: 'Отложить', callback_data: 'ob:h:' + preview.previewId}
      ]]}
    : null;

  rformOwnerBotV1SendOwnerText_(String(item.Telegram_Text || '').trim(), {
    reply_markup: keyboard ? JSON.stringify(keyboard) : undefined
  });

  if (opts.markSent) {
    const state = rformOwnerBotV1SentState_();
    state[contentId] = preview.previewId;
    rformOwnerBotV1SaveSentState_(state);
  }

  rformOwnerBotV1Audit_(
    contentId,
    'BOT_PREVIEW_SENT',
    testMode ? 'Smoke preview sent; actions disabled.' : 'Owner preview sent.',
    preview.previewId,
    'APPLIED'
  );
}

function rformOwnerBotV1HandleCallback_(callback) {
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  const fromId = String(callback && callback.from ? callback.from.id || '' : '');
  const ownerUserId = props.getProperty(RFORM_OWNER_BOT_V1.props.ownerUserId) || '';
  const callbackId = String(callback && callback.id ? callback.id : '');
  const data = String(callback && callback.data ? callback.data : '');

  if (!ownerUserId || fromId !== ownerUserId) {
    if (callbackId) {
      rformOwnerBotV1Telegram_(token, 'answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'Доступ запрещён.',
        show_alert: true
      });
    }
    return;
  }

  const match = data.match(/^ob:([ah]):([a-f0-9]{32})$/);
  if (!match) {
    if (callbackId) {
      rformOwnerBotV1Telegram_(token, 'answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'Неизвестное действие.',
        show_alert: true
      });
    }
    return;
  }

  if (!rformOwnerBotV1ActionsEnabled_()) {
    rformOwnerBotV1Telegram_(token, 'answerCallbackQuery', {
      callback_query_id: callbackId,
      text: 'Действия отключены: это тестовый режим.',
      show_alert: true
    });
    return;
  }

  rformOwnerBotV1Telegram_(token, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text: 'Проверяю актуальность предпросмотра…'
  });

  const action = match[1];
  const previewId = match[2];
  const bundle = rformOwnerBotV1ApiRead_();
  const previews = rformOwnerBotV1BuildReadyPreviews_(
    bundle,
    Math.max((bundle.queue || []).length, 1)
  );
  const preview = previews.find(function (candidate) {
    return candidate.previewId === previewId;
  });

  if (!preview) {
    rformOwnerBotV1Audit_(
      '',
      'BOT_STALE_CALLBACK',
      'Callback rejected because preview is no longer current.',
      previewId,
      'REJECTED_STALE'
    );
    rformOwnerBotV1SendOwnerText_(
      'Этот предпросмотр уже неактуален. Материал изменился или его статус уже обновлён.\n' +
      'Команда /today покажет текущую версию.'
    );
    return;
  }

  const contentId = String(preview.item.Content_ID || '').trim();

  if (action === 'a') {
    const result = rformOwnerBotV1ApiApprove_(preview);
    rformOwnerBotV1Audit_(
      contentId,
      'BOT_APPROVE_CLICK',
      'Owner approved current preview; Content Control API accepted the schedule handoff.',
      previewId,
      result && result.ok ? 'APPLIED' : 'FAILED'
    );
    rformOwnerBotV1RemoveKeyboard_(callback);
    rformOwnerBotV1SendOwnerText_(
      'Согласовано.\nМатериал передан в существующую очередь Telegram Autopost.'
    );
    return;
  }

  if (action === 'h') {
    const result = rformOwnerBotV1ApiHold_(preview);
    rformOwnerBotV1Audit_(
      contentId,
      'BOT_HOLD_CLICK',
      'Owner placed current preview on HOLD.',
      previewId,
      result && result.ok ? 'APPLIED' : 'FAILED'
    );
    rformOwnerBotV1RemoveKeyboard_(callback);
    rformOwnerBotV1SendOwnerText_(
      'Отложено.\nМатериал снят с текущего Owner Inbox и не передан в публикацию.'
    );
  }
}

function rformOwnerBotV1RemoveKeyboard_(callback) {
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  const message = callback && callback.message ? callback.message : null;
  if (!message || !message.chat || !message.message_id) return;
  try {
    rformOwnerBotV1Telegram_(token, 'editMessageReplyMarkup', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: JSON.stringify({inline_keyboard: []})
    });
  } catch (error) {
    console.warn('Could not remove Owner Bot keyboard: ' + error.message);
  }
}

function rformOwnerBotV1ApiRead_() {
  const props = PropertiesService.getScriptProperties();
  const secret = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiSecret);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = rformOwnerBotV1RandomHex_(16);
  const message = String(timestamp) + '.' + nonce;
  const request = {
    timestamp: timestamp,
    nonce: nonce,
    signature: rformOwnerBotV1HmacBase64Url_(message, secret),
    operation: 'read'
  };
  return rformOwnerBotV1ApiPost_(request);
}

function rformOwnerBotV1ApiQueueAssets_(contentId) {
  const props = PropertiesService.getScriptProperties();
  const secret = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiSecret);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = rformOwnerBotV1RandomHex_(16);
  const lines = [
    String(timestamp),
    nonce,
    'queue_publication_assets',
    String(contentId || '').trim()
  ];
  const request = {
    timestamp: timestamp,
    nonce: nonce,
    signature: rformOwnerBotV1HmacBase64Url_(lines.join('\n'), secret),
    operation: 'queue_publication_assets',
    content_id: String(contentId || '').trim()
  };
  return rformOwnerBotV1ApiPost_(request);
}

function rformOwnerBotV1ApiApprove_(preview) {
  const props = PropertiesService.getScriptProperties();
  const secret = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiSecret);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = rformOwnerBotV1RandomHex_(16);
  const actionId = rformOwnerBotV1RandomHex_(16);
  const item = preview.item;
  const contentId = String(item.Content_ID || '').trim();
  const text = String(item.Telegram_Text || '').trim();
  const visualUrl = String(item.Telegram_Visual_URL || '').trim();
  const mode = String(item.Telegram_Post_Mode || 'TEXT_ONLY').trim().toUpperCase() || 'TEXT_ONLY';

  const lines = [
    String(timestamp),
    nonce,
    'queue_publication_approval',
    actionId,
    contentId,
    rformOwnerBotV1Sha256Hex_(text),
    rformOwnerBotV1Sha256Hex_(visualUrl),
    mode
  ];
  const request = {
    timestamp: timestamp,
    nonce: nonce,
    signature: rformOwnerBotV1HmacBase64Url_(lines.join('\n'), secret),
    operation: 'queue_publication_approval',
    action_id: actionId,
    content_id: contentId,
    telegram_text: text,
    telegram_visual_url: visualUrl,
    telegram_post_mode: mode
  };
  return rformOwnerBotV1ApiPost_(request);
}

function rformOwnerBotV1ApiHold_(preview) {
  const props = PropertiesService.getScriptProperties();
  const secret = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiSecret);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = rformOwnerBotV1RandomHex_(16);
  const actionId = rformOwnerBotV1RandomHex_(16);
  const contentId = String(preview.item.Content_ID || '').trim();
  const comment = 'OWNER_BOT · отложено владельцем';
  const action = 'HOLD';

  const lines = [
    String(timestamp),
    nonce,
    'content_action',
    actionId,
    contentId,
    action,
    rformOwnerBotV1Sha256Hex_(comment)
  ];
  const request = {
    timestamp: timestamp,
    nonce: nonce,
    signature: rformOwnerBotV1HmacBase64Url_(lines.join('\n'), secret),
    operation: 'content_action',
    action_id: actionId,
    content_id: contentId,
    action: action,
    comment: comment
  };
  return rformOwnerBotV1ApiPost_(request);
}

function rformOwnerBotV1ApiPost_(request) {
  const props = PropertiesService.getScriptProperties();
  const url = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiUrl);
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(request),
    muteHttpExceptions: true,
    followRedirects: true
  });
  const status = response.getResponseCode();
  const body = response.getContentText();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error('Content Control API returned non-JSON (HTTP ' + status + '): ' + body.slice(0, 500));
  }
  if (status < 200 || status >= 300 || !parsed.ok) {
    throw new Error(
      'Content Control API rejected request: ' +
      (parsed && parsed.message ? parsed.message : body.slice(0, 500))
    );
  }
  return parsed;
}

function rformOwnerBotV1SendOwnerText_(text, extra) {
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  const chatId = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.ownerChatId);
  const payload = {chat_id: chatId, text: String(text || '')};
  Object.keys(extra || {}).forEach(function (key) {
    if (extra[key] !== undefined && extra[key] !== null) payload[key] = extra[key];
  });
  return rformOwnerBotV1Telegram_(token, 'sendMessage', payload);
}

function rformOwnerBotV1SendOwnerAlbum_(blobs) {
  if (!Array.isArray(blobs) || !blobs.length) return [];
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  const chatId = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.ownerChatId);

  if (blobs.length === 1) {
    return [rformOwnerBotV1Telegram_(token, 'sendPhoto', {chat_id: chatId, photo: blobs[0]})];
  }

  const payload = {chat_id: chatId};
  const media = [];
  blobs.slice(0, RFORM_OWNER_BOT_V1.maxPreviewAssets).forEach(function (blob, index) {
    const key = 'file' + index;
    payload[key] = blob;
    media.push({type: 'photo', media: 'attach://' + key});
  });
  payload.media = JSON.stringify(media);
  return rformOwnerBotV1Telegram_(token, 'sendMediaGroup', payload);
}

function rformOwnerBotV1Telegram_(token, method, payload) {
  if (!token) throw new Error('Telegram bot token is missing.');
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    muteHttpExceptions: true,
    payload: payload || {}
  });
  const body = response.getContentText();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error('Telegram returned non-JSON: ' + body.slice(0, 500));
  }
  if (!parsed.ok) {
    throw new Error('Telegram ' + method + ' failed: ' + (parsed.description || body.slice(0, 500)));
  }
  return parsed.result;
}

function rformOwnerBotV1Audit_(contentId, action, comment, previewId, result) {
  try {
    const ss = SpreadsheetApp.openById(RFORM_OWNER_BOT_V1.spreadsheetId);
    const sheet = ss.getSheetByName(RFORM_OWNER_BOT_V1.actionLogSheet);
    if (!sheet) throw new Error('Sheet not found: ' + RFORM_OWNER_BOT_V1.actionLogSheet);
    const headers = rformOwnerBotV1Headers_(sheet);
    const map = rformOwnerBotV1HeaderMap_(headers);
    const missing = RFORM_OWNER_BOT_V1.actionLogHeaders.filter(function (name) {
      return !map[name];
    });
    if (missing.length) throw new Error('Audit log schema mismatch: ' + missing.join(', '));

    const row = new Array(headers.length).fill('');
    const set = function (name, value) {
      if (map[name]) row[map[name] - 1] = value;
    };
    set('Action_ID', rformOwnerBotV1RandomHex_(16));
    set('Timestamp', new Date());
    set('Content_ID', String(contentId || ''));
    set('Action', String(action || 'BOT_EVENT'));
    set('Comment', String(comment || '').slice(0, 500));
    set('Changed_Fields', '');
    set('Previous_Values', '');
    set('New_Values', JSON.stringify({preview_id: String(previewId || '')}));
    set('Actor', 'OWNER_BOT');
    set('Request_Nonce', '');
    set('Result', String(result || 'APPLIED'));

    const lock = LockService.getUserLock();
    if (!lock.tryLock(5000)) throw new Error('Audit log lock timeout.');
    try {
      sheet.appendRow(row);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error('Owner Bot audit write failed: ' + error.message);
  }
}

function rformOwnerBotV1SentState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(RFORM_OWNER_BOT_V1.props.sentState);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function rformOwnerBotV1SaveSentState_(state) {
  const keys = Object.keys(state || {});
  if (keys.length > 100) {
    keys.slice(0, keys.length - 100).forEach(function (key) { delete state[key]; });
  }
  PropertiesService.getScriptProperties().setProperty(
    RFORM_OWNER_BOT_V1.props.sentState,
    JSON.stringify(state || {})
  );
}

function rformOwnerBotV1ActionsEnabled_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(RFORM_OWNER_BOT_V1.props.actionsEnabled) || ''
  ).toUpperCase() === 'YES';
}

function rformOwnerBotV1RequireOwnerPair_(props) {
  const userId = props.getProperty(RFORM_OWNER_BOT_V1.props.ownerUserId) || '';
  const chatId = props.getProperty(RFORM_OWNER_BOT_V1.props.ownerChatId) || '';
  if (!userId || !chatId) {
    throw new Error('Owner is not paired. Run rformOwnerBotV1CreatePairCode() and /pair first.');
  }
  return {userId: userId, chatId: chatId};
}

function rformOwnerBotV1RequireProperty_(props, name) {
  const value = props.getProperty(name);
  if (!value) throw new Error('Missing Script Property: ' + name);
  return value;
}

function rformOwnerBotV1Headers_(sheet) {
  if (!sheet || sheet.getLastColumn() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value || '').trim(); });
}

function rformOwnerBotV1HeaderMap_(headers) {
  const map = {};
  (headers || []).forEach(function (name, index) {
    if (name) map[name] = index + 1;
  });
  return map;
}

function rformOwnerBotV1RandomHex_(bytes) {
  const seed = [
    Utilities.getUuid(),
    Utilities.getUuid(),
    String(Date.now()),
    String(Math.random())
  ].join('|');
  return rformOwnerBotV1Sha256Hex_(seed).slice(0, Math.max(2, bytes * 2));
}

function rformOwnerBotV1Sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function rformOwnerBotV1HmacBase64Url_(message, secret) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(
      String(message || ''),
      String(secret || ''),
      Utilities.Charset.UTF_8
    )
  ).replace(/=+$/, '');
}

function rformOwnerBotV1ConstantTimeEqual_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
