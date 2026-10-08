// R/Form Owner Bot v1.1.0 · P0 Owner Inbox
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
  version: '1.1.0',
  spreadsheetId: '1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY',
  actionLogSheet: 'CONTENT_ACTION_LOG',
  pollMinutes: 5,
  maxPreviewsPerPoll: 3,
  maxPreviewAssets: 10,
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
    'publication.queue_assets', 'publication.owner_workspace'
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
    webhookLastErrorMessage: webhook && webhook.last_error_message
      ? String(webhook.last_error_message)
      : '',
    webhookLastErrorDate: webhook && webhook.last_error_date
      ? new Date(Number(webhook.last_error_date) * 1000).toISOString()
      : '',
    webhookIpAddress: webhook && webhook.ip_address ? String(webhook.ip_address) : '',
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
    drop_pending_updates: true,
    max_connections: 1
  });
  return {ok: !!result, urlConfigured: true};
}

function rformOwnerBotV1DeleteWebhook() {
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  return rformOwnerBotV1Telegram_(token, 'deleteWebhook', {drop_pending_updates: true});
}

function rformOwnerBotV1WebResponse_(text) {
  return HtmlService.createHtmlOutput(String(text || 'OK'));
}

function doGet() {
  return rformOwnerBotV1WebResponse_(
    'R/Form Owner Bot v' + RFORM_OWNER_BOT_V1.version
  );
}

function doPost(e) {
  try {
    return rformOwnerBotV1Webhook_(e);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return rformOwnerBotV1WebResponse_('OK');
  }
}

function rformOwnerBotV1Webhook_(e) {
  const props = PropertiesService.getScriptProperties();
  const expectedHook = props.getProperty(RFORM_OWNER_BOT_V1.props.webhookSecret) || '';
  const actualHook = e && e.parameter ? String(e.parameter.hook || '') : '';
  if (!expectedHook || !rformOwnerBotV1ConstantTimeEqual_(actualHook, expectedHook)) {
    console.warn('Owner Bot webhook rejected: invalid hook secret.');
    return rformOwnerBotV1WebResponse_('OK');
  }

  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!raw) return rformOwnerBotV1WebResponse_('OK');

  let update;
  try {
    update = JSON.parse(raw);
  } catch (error) {
    console.warn('Owner Bot webhook received invalid JSON.');
    return rformOwnerBotV1WebResponse_('OK');
  }

  if (update.callback_query) {
    rformOwnerBotV1HandleCallback_(update.callback_query);
  } else if (update.message) {
    rformOwnerBotV1HandleMessage_(update.message);
  }
  return rformOwnerBotV1WebResponse_('OK');
}

function rformOwnerBotV1HandleMessage_(message) {
  if (rformOwnerBotV1WorkspaceMessage_(message)) return;
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
  if(chatType !== 'private' || chatId !== props.getProperty(RFORM_OWNER_BOT_V1.props.ownerChatId)) return;

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
    if (props.getProperty('RFORM_OWNER_AUTO_DRAFTS_ENABLED') === 'YES') rformOwnerBotV1WorkspaceApi_('', '', {action:'sync_training'});
    const bundle = rformOwnerBotV1ApiRead_();
    const previews = rformOwnerBotV1BuildReadyPreviews_(
      bundle,
      RFORM_OWNER_BOT_V1.maxPreviewsPerPoll,
      true
    );
    rformOwnerBotV1WorkspaceReminders_(bundle);
    rformOwnerBotV1WorkspaceProposals_(bundle);
    const sentState = rformOwnerBotV1SentState_();

    previews.forEach(function (preview) {
      const contentId = String(preview.item.Content_ID || '');
      if (!contentId) return;
      if (sentState[contentId] === preview.previewId) return;

      rformOwnerBotV1SendPreview_(preview, {
        actionsEnabled: rformOwnerBotV1ActionsEnabled_(),
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

function rformOwnerBotV1BuildReadyPreviews_(bundle, limit, skipSent) {
  const readyItems = rformOwnerBotV1ReadyItems_(bundle.queue || []);
  const sent=skipSent?rformOwnerBotV1SentState_():{};
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
    if(skipSent && sent[item.Content_ID]===previewId) continue;
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
    if (['SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'HOLD', 'CANCELLED', 'SUPERSEDED', 'ARCHIVED'].indexOf(publication) !== -1) return false;
    if (['YES', 'ДА', 'TRUE', '1', 'DUPLICATE'].indexOf(duplicate) !== -1) return false;
    if (String(item.Publish_Error || '').trim()) return false;
    if (String(item.Blocking_Issue || '').trim()) return false;
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
          String(asset.order || ''),
          String(asset.file_id || ''),
          String(asset.sha256 || '')
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
    const text=String(item.Telegram_Text || '').trim();
    rformOwnerBotV1SendOwnerAlbum_(blobs,text.length<=1024?text:'');
  }

  const keyboard = actionsEnabled
    ? {inline_keyboard: [[
        {text: 'Согласовать', callback_data: 'ob:a:' + preview.previewId},
        {text: 'Отложить', callback_data: 'ob:h:' + preview.previewId}
      ], [{text: 'Правки и фото', callback_data: 'ow:open:' + rformOwnerBotV1ItemToken_(item)}, {text: 'Очередь', callback_data: 'ow:list:work:0'}]]}
    : null;

  const displayedText=preview.mode!=='TEXT_ONLY' && String(item.Telegram_Text || '').trim().length<=1024
    ? 'Решение по этому предпросмотру' : String(item.Telegram_Text || '').trim();
  rformOwnerBotV1SendOwnerText_(displayedText, {
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

// Candidate v1.0.3: errors are observable without retrying publication actions.
function rformOwnerBotV1HandleCallback_(callback) {
  if (/^ow:/.test(String(callback && callback.data || ''))) return rformOwnerBotV1WorkspaceCallback_(callback);
  try {
    return rformOwnerBotV1HandleCallbackCore_(callback);
  } catch (error) {
    // Do not expose upstream response bodies, URLs, tokens or raw exception text.
    console.error('Owner Bot callback failed; operation outcome must be checked.');
    const props = PropertiesService.getScriptProperties();
    const ownerUserId = props.getProperty(RFORM_OWNER_BOT_V1.props.ownerUserId) || '';
    const fromId = String(callback && callback.from ? callback.from.id || '' : '');
    const data = String(callback && callback.data ? callback.data : '');
    const match = data.match(/^ob:([ah]):([a-f0-9]{32})$/);
    // Never notify the owner or write owner-action audit for an untrusted callback.
    if (!ownerUserId || fromId !== ownerUserId || !match ||
        !rformOwnerBotV1WorkspaceTrusted_(callback.message,callback.from)) return;
    try {
      rformOwnerBotV1Audit_(
        '', 'BOT_CALLBACK_ERROR',
        'Callback processing failed; action=' + match[1] + '; outcome requires verification.',
        match[2], 'OUTCOME_UNKNOWN'
      );
    } catch (auditError) {
      console.error('Owner Bot callback error audit unavailable.');
    }
    try {
      rformOwnerBotV1SendOwnerText_(
        'Не удалось завершить обработку решения.\n' +
        'Операция могла уже примениться. Проверьте текущий статус через /today ' +
        'или Content Control перед повторным действием. Автоматический повтор не выполняется.'
      );
    } catch (notifyError) {
      console.error('Owner Bot callback error notification unavailable.');
    }
  }
}

function rformOwnerBotV1HandleCallbackCore_(callback) {
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  const fromId = String(callback && callback.from ? callback.from.id || '' : '');
  const ownerUserId = props.getProperty(RFORM_OWNER_BOT_V1.props.ownerUserId) || '';
  const callbackId = String(callback && callback.id ? callback.id : '');
  const data = String(callback && callback.data ? callback.data : '');

  if (!ownerUserId || fromId !== ownerUserId ||
      !rformOwnerBotV1WorkspaceTrusted_(callback.message,callback.from)) {
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

  const pending = CacheService.getScriptCache().get('ow_draft_'+rformOwnerBotV1ItemToken_(preview.item));
  if(pending && JSON.parse(pending).dirty) {
    rformOwnerBotV1SendOwnerText_('Есть несохранённые правки. Сначала сохраните либо отмените их и проверьте новый предпросмотр.');
    return;
  }
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
  const workspaceHash = rformOwnerBotV1WorkspaceHash_(item);
  lines.push(workspaceHash);
  const assetHash=rformOwnerBotV1Sha256Hex_(JSON.stringify((preview.assetPacket && preview.assetPacket.assets || [])
    .map(function(a) {return [a.file_id,a.sha256];})));
  lines.push(assetHash);
  const request = {
    timestamp: timestamp,
    nonce: nonce,
    signature: rformOwnerBotV1HmacBase64Url_(lines.join('\n'), secret),
    operation: 'queue_publication_approval',
    action_id: actionId,
    content_id: contentId,
    telegram_text: text,
    telegram_visual_url: visualUrl,
    telegram_post_mode: mode,
    expected_workspace_hash: workspaceHash,
    expected_asset_hash: assetHash
  };
  return rformOwnerBotV1ApiPost_(request);
}

function rformOwnerBotV1ApiHold_(preview) {
  return rformOwnerBotV1WorkspaceApi_(preview.item.Content_ID,
    rformOwnerBotV1WorkspaceHash_(preview.item),{action:'hold'});
}

function rformOwnerBotV1ApiPost_(request) {
  const props = PropertiesService.getScriptProperties();
  const url = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.apiUrl);
  const trace = request.operation === 'read' ? {event: 'OWNER_BOT_API_READ_TRANSPORT', version: RFORM_OWNER_BOT_V1.version, stage: 'POST', outcome: 'ERROR', postAttempts: 1, getAttempts: 0} : null;
  const startedAt = Date.now();
  function responseMeta_(reply) {
    try {
    const headers = reply.getAllHeaders();
    const key = Object.keys(headers).find(function (name) { return name.toLowerCase() === 'location'; });
    const raw = key ? headers[key] : null;
    const count = raw === null ? 0 : (Array.isArray(raw) ? raw.length : 1);
    const location = count === 1 ? String(Array.isArray(raw) ? raw[0] : raw) : '';
    const route = /^https:\/\/script\.googleusercontent\.com\/macros\/echo\?/.test(location) ? 'CONTENT_SERVICE' : (/^https:\/\/accounts\.google\.com\//.test(location) ? 'GOOGLE_SIGN_IN' : (location ? 'OTHER' : 'NONE'));
    return {httpStatus: reply.getResponseCode(), locationValueCount: count, locationChars: location.length, redirectRoute: route};
    } catch (_) { return {metadataUnavailable: true}; }
  }
  try {
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(request),
    muteHttpExceptions: true,
    followRedirects: false
  });
  if (trace) trace.postResponse = responseMeta_(response);
  // Retrieve the ContentService result, never replay the signed action POST.
  let resultResponse = response;
  if (response.getResponseCode() === 302) {
    const headers = response.getAllHeaders();
    const locationKey = Object.keys(headers).find(function (name) {
      return name.toLowerCase() === 'location';
    });
    const location = locationKey ? String(headers[locationKey]) : '';
    if (!/^https:\/\/script\.googleusercontent\.com\/macros\/echo\?/.test(location)) {
      if (trace) trace.stage = 'FIRST_REDIRECT_REJECTED';
      throw new Error('Content Control API returned an unsupported response redirect.');
    }
    if (trace) { trace.stage = 'GET'; trace.getAttempts = 1; }
    resultResponse = UrlFetchApp.fetch(location, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: false
    });
  }
  if (trace) { trace.stage = 'PARSE'; trace.resultResponse = responseMeta_(resultResponse); }
  const status = resultResponse.getResponseCode();
  const body = resultResponse.getContentText();
  if (trace) trace.bodyChars = body.length;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    if (trace) { trace.stage = 'NON_JSON'; trace.json = false; }
    throw new Error('Content Control API returned non-JSON (HTTP ' + status + ')' + (trace ? '.' : ': ' + body.slice(0, 500)));
  }
  if (trace) { trace.json = true; trace.ok = !!(parsed && parsed.ok); }
  if (status < 200 || status >= 300 || !parsed.ok) {
    if (trace) trace.stage = 'API_REJECTED';
    throw new Error(
      'Content Control API rejected request: ' +
      (parsed && parsed.message ? parsed.message : body.slice(0, 500))
    );
  }
  if (trace) { trace.stage = 'DONE'; trace.outcome = 'OK'; }
  return parsed;
  } finally {
    if (trace) {
      trace.elapsedMs = Date.now() - startedAt;
      // Telemetry must never change the transport outcome.
      try { console.log(JSON.stringify(trace)); } catch (_) {}
    }
  }
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

function rformOwnerBotV1SendOwnerAlbum_(blobs,caption) {
  if (!Array.isArray(blobs) || !blobs.length) return [];
  const props = PropertiesService.getScriptProperties();
  const token = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.token);
  const chatId = rformOwnerBotV1RequireProperty_(props, RFORM_OWNER_BOT_V1.props.ownerChatId);

  if (blobs.length === 1) {
    const payload={chat_id:chatId,photo:blobs[0]};
    if(caption) payload.caption=caption;
    return [rformOwnerBotV1Telegram_(token, 'sendPhoto', payload)];
  }

  const payload = {chat_id: chatId};
  const media = [];
  blobs.slice(0, RFORM_OWNER_BOT_V1.maxPreviewAssets).forEach(function (blob, index) {
    const key = 'file' + index;
    payload[key] = blob;
    const item={type:'photo',media:'attach://'+key};
    if(index===0 && caption) item.caption=caption;
    media.push(item);
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


// v1.1 owner workspace. Cache holds unsaved drafts only, never production state.
const RFORM_OWNER_WORKSPACE_FIELDS = Object.freeze([
  'Content_ID','Current_Stage','Pipeline_Status','Source_Packet_Status','Public_Data_Allowed',
  'Text_Status','Visual_Status','Approval_Status','Publication_Status','AutoPost_Allowed',
  'Publish_At','Duplicate_Flag','Blocking_Issue','Publish_Error','Telegram_Text',
  'Telegram_Post_Mode','Telegram_Visual_URL','Telegram_Message_ID','Telegram_Post_URL','Posted_At',
  'Preview_Review_Status','Preview_Review_Hash','Preview_Reviewed_At','Preview_Reviewed_By','Updated_At',
  'Session_ID','Proof_Source'
]);

function rformOwnerBotV1WorkspaceHash_(item) {
  return rformOwnerBotV1Sha256Hex_(JSON.stringify(RFORM_OWNER_WORKSPACE_FIELDS.map(function(f) {
    return String(item[f] || '').trim();
  })));
}

function rformOwnerBotV1ItemToken_(item) {
  return rformOwnerBotV1Sha256Hex_(String(item.Content_ID || '')).slice(0,16);
}

function rformOwnerBotV1WorkspaceTrusted_(message,from) {
  const p=PropertiesService.getScriptProperties();
  return String(from && from.id || '')===p.getProperty(RFORM_OWNER_BOT_V1.props.ownerUserId) &&
    String(message && message.chat && message.chat.id || '')===p.getProperty(RFORM_OWNER_BOT_V1.props.ownerChatId) &&
    String(message && message.chat && message.chat.type || '')==='private';
}

function rformOwnerBotV1WorkspaceApi_(id,hash,payload,actionId) {
  const props=PropertiesService.getScriptProperties();
  const req={timestamp:Math.floor(Date.now()/1000),nonce:rformOwnerBotV1RandomHex_(16),
    operation:'owner_workspace',action_id:actionId || rformOwnerBotV1RandomHex_(16),
    content_id:id || '',source_hash:hash || '',payload:payload};
  const message=[String(req.timestamp),req.nonce,req.operation,req.action_id,req.content_id,
    req.source_hash,rformOwnerBotV1Sha256Hex_(JSON.stringify(payload))].join('\n');
  req.signature=rformOwnerBotV1HmacBase64Url_(message,rformOwnerBotV1RequireProperty_(props,RFORM_OWNER_BOT_V1.props.apiSecret));
  return rformOwnerBotV1ApiPost_(req);
}

function rformOwnerBotV1WorkspaceItem_(bundle,token) {
  const items=(bundle.queue || []).filter(function(q) {return rformOwnerBotV1ItemToken_(q)===token;});
  if(items.length!==1) throw new Error('Материал не найден однозначно.');
  return items[0];
}

function rformOwnerBotV1WorkspaceRows_(queue,section,query) {
  const s=String(query || '').toLocaleLowerCase('ru');
  return (queue || []).filter(function(q) {
    const pub=String(q.Publication_Status || '');
    const match=section==='published'?pub==='PUBLISHED':section==='held'?pub==='HOLD':
      ['PLANNED','NOT_READY','SCHEDULED','PUBLISHING'].indexOf(pub)!==-1 &&
      !/SUPERSEDED|ARCHIV|CANCELLED/.test(q.Pipeline_Status || '');
    if(!match) return false;
    return !s || [q.Content_ID,q.Date,q.Session_ID,q.Rubric,String(q.Telegram_Text || '').split('\n')[0]]
      .join(' ').toLocaleLowerCase('ru').indexOf(s)!==-1;
  }).sort(function(a,b) {return rformOwnerBotV1DateSort_(b)-rformOwnerBotV1DateSort_(a);});
}

function rformOwnerBotV1WorkspaceMenu_() {
  rformOwnerBotV1SendOwnerText_('R/Form · Материалы\n\nВыберите раздел. Для поиска: /search слово или дата.',{
    reply_markup:JSON.stringify({inline_keyboard:[
      [{text:'В работе',callback_data:'ow:list:work:0'}],
      [{text:'Отложено',callback_data:'ow:list:held:0'}],
      [{text:'Опубликовано',callback_data:'ow:list:published:0'}]
    ]})
  });
}

function rformOwnerBotV1WorkspaceList_(bundle,section,page,query) {
  const rows=rformOwnerBotV1WorkspaceRows_(bundle.queue,section,query);
  const offset=Math.max(0,Math.min(Number(page)||0,Math.max(0,Math.ceil(rows.length/5)-1)));
  const names={work:'В работе',held:'Отложено',published:'Опубликовано'};
  const buttons=rows.slice(offset*5,offset*5+5).map(function(q) {
    const title=String(q.Telegram_Text || q.Content_ID).split('\n')[0];
    return [{text:(q.Date+' · '+title).slice(0,60),callback_data:'ow:open:'+rformOwnerBotV1ItemToken_(q)}];
  });
  if(query) CacheService.getScriptCache().put('ow_search',String(query),21600);
  const route=query?'search':section;
  const nav=[];
  if(offset>0) nav.push({text:'Назад',callback_data:'ow:list:'+route+':'+(offset-1)});
  if((offset+1)*5<rows.length) nav.push({text:'Далее',callback_data:'ow:list:'+route+':'+(offset+1)});
  if(nav.length) buttons.push(nav);
  buttons.push([{text:'Разделы',callback_data:'ow:menu'}]);
  rformOwnerBotV1SendOwnerText_((query?'Поиск: '+query:names[section])+' · '+rows.length+
    (rows.length?'\nСтраница '+(offset+1)+'/'+Math.ceil(rows.length/5):'\nМатериалов нет.'),{
    reply_markup:JSON.stringify({inline_keyboard:buttons})
  });
}

function rformOwnerBotV1WorkspaceDraft_(token) {
  const raw=CacheService.getScriptCache().get('ow_draft_'+token);
  if(!raw) throw new Error('Черновик правок истёк. Откройте материал заново.');
  return JSON.parse(raw);
}

function rformOwnerBotV1WorkspacePutDraft_(token,d) {
  d.revision=rformOwnerBotV1RandomHex_(8);
  CacheService.getScriptCache().put('ow_draft_'+token,JSON.stringify(d),21600);
  return d;
}

function rformOwnerBotV1WorkspaceOpen_(bundle,token) {
  const item=rformOwnerBotV1WorkspaceItem_(bundle,token);
  const meta=(bundle.workspace_meta || {})[item.Content_ID] || {};
  const title=String(item.Telegram_Text || item.Content_ID).split('\n')[0];
  const info=[title,item.Date+' · '+item.Rubric,'Статус: '+item.Publication_Status,
    'Последнее изменение: '+(item.Updated_At || '—'),
    'Сохранённых правок: '+(meta.versions || []).length];
  if(meta.reminder && meta.reminder.review_at) info.push('Рассмотреть: '+meta.reminder.review_at+' · напоминание '+(meta.reminder.notify?'включено':'выключено'));
  if(item.Publication_Status==='PUBLISHED') {
    if(item.Telegram_Post_URL) info.push(item.Telegram_Post_URL);
    rformOwnerBotV1SendOwnerText_(info.join('\n'),{reply_markup:JSON.stringify({inline_keyboard:[[{text:'Разделы',callback_data:'ow:menu'}]]})});return;
  }
  if(['SCHEDULED','PUBLISHING'].indexOf(item.Publication_Status)!==-1) {
    rformOwnerBotV1SendOwnerText_(info.join('\n')+'\nМатериал уже передан в Autopost.');return;
  }
  const hash=rformOwnerBotV1WorkspaceHash_(item);
  let d;
  try {d=rformOwnerBotV1WorkspaceDraft_(token);} catch(_) {}
  if(!d || d.source_hash!==hash) {
    let packet={assets:[]};
    if(item.Telegram_Post_Mode!=='TEXT_ONLY' && item.Telegram_Visual_URL) packet=rformOwnerBotV1ApiQueueAssets_(item.Content_ID);
    d=rformOwnerBotV1WorkspacePutDraft_(token,{content_id:item.Content_ID,source_hash:hash,
      original_text:item.Telegram_Text,text:item.Telegram_Text,
      original_asset_ids:packet.assets.map(function(a) {return a.file_id;}),
      asset_ids:packet.assets.map(function(a) {return a.file_id;}),dirty:false});
  }
  CacheService.getScriptCache().put('ow_active',JSON.stringify({token:token,await:'photo'}),21600);
  const keys=[
    [{text:'Изменить текст',callback_data:'ow:edit:'+token},{text:'Поручение ИИ',callback_data:'ow:ai:'+token}],
    [{text:'Фото и порядок',callback_data:'ow:photos:'+token},{text:'Просмотр правок',callback_data:'ow:review:'+token}],
    [{text:'История версий',callback_data:'ow:history:'+token}]
  ];
  if(item.Publication_Status==='HOLD') {
    keys.push([{text:'Вернуть в работу',callback_data:'ow:return:'+token},{text:'Дата рассмотрения',callback_data:'ow:date:'+token}]);
  } else {
    keys.push([{text:'Финальный предпросмотр',callback_data:'ow:preview:'+token},{text:'Отложить',callback_data:'ow:hold:'+token}]);
  }
  if(meta.ai && meta.ai.status==='PROPOSED') keys.push([{text:'Посмотреть предложение ИИ',callback_data:'ow:proposal:'+token}]);
  keys.push([{text:'Разделы',callback_data:'ow:menu'}]);
  rformOwnerBotV1SendOwnerText_(info.join('\n')+'\n\nФото можно отправить сюда. Правки сохраняются после просмотра изменений.'+
    (d.dirty?'\nЕсть несохранённые изменения.':''),{reply_markup:JSON.stringify({inline_keyboard:keys})});
}

function rformOwnerBotV1WorkspaceChunk_(text) {
  const value=String(text);
  for(let i=0;i<value.length;i+=3900) rformOwnerBotV1SendOwnerText_(value.slice(i,i+3900));
}

function rformOwnerBotV1WorkspaceReview_(token,d) {
  rformOwnerBotV1WorkspaceChunk_('Сейчас сохранено:\n\n'+d.original_text);
  rformOwnerBotV1WorkspaceChunk_('Предложенные правки · ещё не сохранены:\n\n'+d.text);
  rformOwnerBotV1SendOwnerText_('Фото: '+d.original_asset_ids.length+' → '+d.asset_ids.length+
    '\nПорядок фото: '+(d.asset_ids.map(function(_,i){return i+1;}).join(', ') || 'без фото')+
    '\nСохранение сбросит прежнее согласование. В публикацию материал не передаётся.',{
    reply_markup:JSON.stringify({inline_keyboard:[
      [{text:'Сохранить эту версию',callback_data:'ow:save:'+token+':'+d.revision}],
      [{text:'Продолжить правки',callback_data:'ow:open:'+token},{text:'Отменить правки',callback_data:'ow:cancel:'+token}]
    ]})
  });
  if(d.asset_ids.length) {
    const packet=rformOwnerBotV1WorkspaceApi_(d.content_id,d.source_hash,{action:'draft_assets',asset_ids:d.asset_ids});
    rformOwnerBotV1SendOwnerAlbum_(packet.assets.map(function(a) {
      return Utilities.newBlob(Utilities.base64Decode(a.data_base64),a.mime_type,a.filename);
    }));
  }
  CacheService.getScriptCache().put('ow_reviewed_'+token,d.revision,21600);
}

function rformOwnerBotV1WorkspacePhotos_(token,d) {
  const keys=d.asset_ids.map(function(_,i) {return [
    {text:'Удалить '+(i+1),callback_data:'ow:delete:'+token+':'+i+':'+d.revision},
    {text:'Раньше',callback_data:'ow:up:'+token+':'+i+':'+d.revision},
    {text:'Позже',callback_data:'ow:down:'+token+':'+i+':'+d.revision},
    {text:'Заменить',callback_data:'ow:replace:'+token+':'+i+':'+d.revision}
  ];});
  keys.push([{text:'Просмотр правок',callback_data:'ow:review:'+token}]);
  CacheService.getScriptCache().put('ow_active',JSON.stringify({token:token,await:'photo'}),21600);
  rformOwnerBotV1SendOwnerText_('Фотографий: '+d.asset_ids.length+'/10.\nОтправьте новые фото или выберите действие. Общий размер комплекта — до 15 МБ.',{
    reply_markup:JSON.stringify({inline_keyboard:keys})
  });
}

function rformOwnerBotV1WorkspaceDate_(text) {
  const m=String(text).match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})(?:\s+(без напоминания))?$/i);
  if(!m) throw new Error('Дата должна быть в формате ДД.ММ.ГГГГ ЧЧ:ММ.');
  const iso=m[3]+'-'+m[2]+'-'+m[1]+'T'+m[4]+':'+m[5]+':00+03:00';
  const date=new Date(iso);
  if(!Number.isFinite(date.getTime()) || date.getTime()<=Date.now() ||
    Utilities.formatDate(date,'Europe/Moscow','dd.MM.yyyy HH:mm')!==m[1]+'.'+m[2]+'.'+m[3]+' '+m[4]+':'+m[5])
    throw new Error('Укажите корректную будущую дату по Москве.');
  return {review_at:iso,notify:!m[6]};
}

function rformOwnerBotV1WorkspaceMessage_(message) {
  if(!rformOwnerBotV1WorkspaceTrusted_(message,message && message.from)) return false;
  const text=String(message.text || '').trim();
  if(/^\/(start|help|queue)(?:@\w+)?$/i.test(text)) {rformOwnerBotV1WorkspaceMenu_();return true;}
  if(/^\/search(?:@\w+)?(?:\s+|$)/i.test(text)) {
    const query=text.replace(/^\/search(?:@\w+)?\s*/i,'').slice(0,100);
    if(!query) {rformOwnerBotV1SendOwnerText_('Введите /search и название, дату или код тренировки.');return true;}
    rformOwnerBotV1WorkspaceSearch_(rformOwnerBotV1ApiRead_(),0,query);return true;
  }
  if(text==='/cancel') {CacheService.getScriptCache().remove('ow_active');rformOwnerBotV1SendOwnerText_('Ввод отменён. Сохранённый материал не изменён.');return true;}
  let active;try {active=JSON.parse(CacheService.getScriptCache().get('ow_active') || 'null');} catch(_) {}
  if(!active || text.startsWith('/')) return false;
  if(!rformOwnerBotV1ActionsEnabled_()) {rformOwnerBotV1SendOwnerText_('Правки отключены в тестовом режиме.');return true;}
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000)) {rformOwnerBotV1SendOwnerText_('Обработка занята. Попробуйте позже.');return true;}
  try {
    const dedup='ow_message_'+message.message_id;
    if(CacheService.getScriptCache().get(dedup)) return true;
    const d=rformOwnerBotV1WorkspaceDraft_(active.token);
    const item=rformOwnerBotV1WorkspaceItem_(rformOwnerBotV1ApiRead_(),active.token);
    if(rformOwnerBotV1WorkspaceHash_(item)!==d.source_hash) throw new Error('Материал изменился; откройте карточку заново.');
    if(message.photo && message.photo.length) {
      if(['photo','replace'].indexOf(active.await)===-1) throw new Error('Сначала выберите «Фото и порядок».');
      if(d.asset_ids.length>=10 && active.await!=='replace') throw new Error('В комплекте уже 10 фотографий.');
      const token=rformOwnerBotV1RequireProperty_(PropertiesService.getScriptProperties(),RFORM_OWNER_BOT_V1.props.token);
      const photo=message.photo[message.photo.length-1];
      if(photo.file_size>5*1024*1024) throw new Error('Фото превышает 5 МБ.');
      const f=rformOwnerBotV1Telegram_(token,'getFile',{file_id:photo.file_id});
      const path=String(f.file_path || '');
      if(!/^[a-zA-Z0-9_/-]+\.jpg$/.test(path) || path.indexOf('..')!==-1) throw new Error('Некорректный путь фотографии.');
      const response=UrlFetchApp.fetch('https://api.telegram.org/file/bot'+token+'/'+path,{muteHttpExceptions:true});
      if(response.getResponseCode()!==200) throw new Error('Не удалось получить фотографию.');
      const bytes=response.getBlob().getBytes();
      if(bytes.length>5*1024*1024) throw new Error('Фото превышает 5 МБ.');
      // Mark before the write: outcome-unknown uploads are never automatically replayed.
      CacheService.getScriptCache().put(dedup,'PROCESSING',21600);
      const result=rformOwnerBotV1WorkspaceApi_(d.content_id,d.source_hash,{action:'stage_photo',
        mime_type:'image/jpeg',data_base64:Utilities.base64Encode(bytes)},
        rformOwnerBotV1Sha256Hex_('PHOTO\n'+message.chat.id+'\n'+message.message_id).slice(0,32));
      const id=result.metadata.file_id;
      if(active.await==='replace') {
        if(active.revision!==d.revision || active.index>=d.asset_ids.length) throw new Error('Список фото изменился.');
        d.asset_ids[active.index]=id;
      } else d.asset_ids.push(id);
      d.dirty=true;rformOwnerBotV1WorkspacePutDraft_(active.token,d);
      // Replacement consumes one message only, so a Telegram album cannot overwrite one slot repeatedly.
      CacheService.getScriptCache().put('ow_active',JSON.stringify({token:active.token,await:'photo'}),21600);
      rformOwnerBotV1SendOwnerText_('Фото добавлено в правки. Всего: '+d.asset_ids.length+'. Нажмите «Просмотр правок» перед сохранением.');
      return true;
    }
    if(active.await==='text' && text) {
      if(text.length>4096) throw new Error('Текст превышает 4096 символов.');
      d.text=text;d.dirty=true;rformOwnerBotV1WorkspacePutDraft_(active.token,d);
      CacheService.getScriptCache().put(dedup,'DONE',21600);
      CacheService.getScriptCache().put('ow_active',JSON.stringify({token:active.token,await:'photo'}),21600);
      rformOwnerBotV1WorkspaceReview_(active.token,d);return true;
    }
    if(active.await==='ai' && text) {
      CacheService.getScriptCache().put(dedup,'PROCESSING',21600);
      rformOwnerBotV1WorkspaceApi_(d.content_id,d.source_hash,{action:'ai_request',instruction:text},
        rformOwnerBotV1Sha256Hex_('AI\n'+message.chat.id+'\n'+message.message_id).slice(0,32));
      CacheService.getScriptCache().remove('ow_active');
      rformOwnerBotV1SendOwnerText_('Поручение сохранено для R/Form Content Orchestrator. Исходный текст не изменён. Предложение появится после обработки исполнителем; автоматический ИИ-исполнитель пока не подключён.');return true;
    }
    if(active.await==='date' && text) {
      const date=rformOwnerBotV1WorkspaceDate_(text);
      CacheService.getScriptCache().put(dedup,'PROCESSING',21600);
      rformOwnerBotV1WorkspaceApi_(d.content_id,d.source_hash,Object.assign({action:'reminder'},date),
        rformOwnerBotV1Sha256Hex_('DATE\n'+message.chat.id+'\n'+message.message_id).slice(0,32));
      CacheService.getScriptCache().remove('ow_active');
      rformOwnerBotV1SendOwnerText_('Дата рассмотрения сохранена. Материал остаётся отложенным; публикация не запланирована.');return true;
    }
    rformOwnerBotV1SendOwnerText_('Выберите «Изменить текст» или отправьте фото для открытого материала.');
    return true;
  } catch(error) {
    // Do not surface raw upstream URLs, responses, tokens or model instructions.
    console.warn('Owner workspace message failed.');
    rformOwnerBotV1SendOwnerText_('Не удалось обработать ввод. Проверьте карточку через /queue. Сохранение могло примениться; автоматический повтор не выполняется.');
    return true;
  } finally {lock.releaseLock();}
}

function rformOwnerBotV1WorkspaceCallback_(callback) {
  if(!rformOwnerBotV1WorkspaceTrusted_(callback.message,callback.from)) return;
  const token=rformOwnerBotV1RequireProperty_(PropertiesService.getScriptProperties(),RFORM_OWNER_BOT_V1.props.token);
  rformOwnerBotV1Telegram_(token,'answerCallbackQuery',{callback_query_id:callback.id,text:'Проверяю…'});
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000)) return;
  try {
    const parts=String(callback.data || '').split(':');
    const action=parts[1];
    if(action==='menu') {rformOwnerBotV1WorkspaceMenu_();return;}
    const bundle=rformOwnerBotV1ApiRead_();
    if(action==='list') {
      const section=parts[2];
      if(['work','held','published','search'].indexOf(section)===-1) return;
      const query=section==='search'?CacheService.getScriptCache().get('ow_search'):null;
      if(section==='search'&&!query) throw new Error('Поиск истёк.');
      if(query) {
        // Search across all three sections, retaining the same canonical rows.
        bundle.queue=(bundle.queue || []).filter(function(q) {return ['PLANNED','NOT_READY','SCHEDULED','PUBLISHING','HOLD','PUBLISHED'].indexOf(q.Publication_Status)!==-1;});
        rformOwnerBotV1WorkspaceSearch_(bundle,Number(parts[3]),query);
      } else rformOwnerBotV1WorkspaceList_(bundle,section,Number(parts[3]));
      return;
    }
    const itemToken=parts[2];
    if(!/^[a-f0-9]{16}$/.test(itemToken)) return;
    const item=rformOwnerBotV1WorkspaceItem_(bundle,itemToken);
    if(action==='open') {rformOwnerBotV1WorkspaceOpen_(bundle,itemToken);return;}
    if(action==='history') {
      const versions=((bundle.workspace_meta || {})[item.Content_ID] || {}).versions || [];
      rformOwnerBotV1SendOwnerText_('История сохранений:\n'+(versions.map(function(v) {return v.at+' · '+v.action_id.slice(0,8);}).join('\n') || 'Сохранений через бот пока нет.'),{
        reply_markup:JSON.stringify({inline_keyboard:versions.map(function(v) {
          return [{text:'Проверить версию '+v.at,callback_data:'ow:version:'+itemToken+':'+v.action_id}];
        })})
      });return;
    }
    if(!rformOwnerBotV1ActionsEnabled_()) throw new Error('Действия отключены.');
    const d=rformOwnerBotV1WorkspaceDraft_(itemToken);
    if(d.source_hash!==rformOwnerBotV1WorkspaceHash_(item)) throw new Error('Версия изменилась.');
    if(action==='edit' || action==='ai' || action==='date') {
      if(action==='date' && item.Publication_Status!=='HOLD') throw new Error('Сначала отложите материал.');
      CacheService.getScriptCache().put('ow_active',JSON.stringify({token:itemToken,await:action==='edit'?'text':action}),21600);
      rformOwnerBotV1SendOwnerText_(action==='edit'?'Отправьте полный новый текст. Перед сохранением покажу изменения.':
        action==='ai'?'Отправьте поручение ИИ. Оно будет передано исполнителю R/Form; исходный текст сохранится.':
        'Введите будущую дату: ДД.ММ.ГГГГ ЧЧ:ММ (Москва). Добавьте «без напоминания», если нужно только сохранить дату. Дата не запускает публикацию.');return;
    }
    if(action==='photos') {rformOwnerBotV1WorkspacePhotos_(itemToken,d);return;}
    if(['delete','up','down','replace'].indexOf(action)!==-1) {
      const index=Number(parts[3]);
      if(parts[4]!==d.revision || !Number.isInteger(index) || index<0 || index>=d.asset_ids.length) throw new Error('Список фотографий изменился.');
      if(action==='replace') {
        CacheService.getScriptCache().put('ow_active',JSON.stringify({token:itemToken,await:'replace',index:index,revision:d.revision}),21600);
        rformOwnerBotV1SendOwnerText_('Отправьте одно фото для замены позиции '+(index+1)+'.');return;
      }
      if(action==='delete') d.asset_ids.splice(index,1);
      else {
        const other=index+(action==='up'?-1:1);
        if(other<0 || other>=d.asset_ids.length) return;
        const id=d.asset_ids[index];d.asset_ids[index]=d.asset_ids[other];d.asset_ids[other]=id;
      }
      d.dirty=true;rformOwnerBotV1WorkspacePutDraft_(itemToken,d);
      rformOwnerBotV1WorkspacePhotos_(itemToken,d);return;
    }
    if(action==='proposal') {
      const ai=((bundle.workspace_meta || {})[item.Content_ID] || {}).ai;
      if(!ai || ai.status!=='PROPOSED' || ai.source_hash!==d.source_hash) throw new Error('Предложение ИИ отсутствует или устарело.');
      d.text=ai.text;d.dirty=true;rformOwnerBotV1WorkspacePutDraft_(itemToken,d);
      rformOwnerBotV1WorkspaceReview_(itemToken,d);return;
    }
    if(action==='version') {
      if(!/^[a-f0-9]{32}$/.test(parts[3])) return;
      const version=rformOwnerBotV1WorkspaceApi_(d.content_id,d.source_hash,{action:'version_read',version_id:parts[3]});
      d.text=version.text;d.asset_ids=version.asset_ids;d.dirty=true;
      rformOwnerBotV1WorkspacePutDraft_(itemToken,d);
      rformOwnerBotV1WorkspaceReview_(itemToken,d);return;
    }
    if(action==='review') {rformOwnerBotV1WorkspaceReview_(itemToken,d);return;}
    if(action==='cancel') {
      CacheService.getScriptCache().remove('ow_draft_'+itemToken);
      CacheService.getScriptCache().remove('ow_active');
      rformOwnerBotV1WorkspaceOpen_(bundle,itemToken);return;
    }
    if(action==='save') {
      if(parts[3]!==d.revision || !d.dirty) throw new Error('Правки изменились или отсутствуют.');
      const reviewed=CacheService.getScriptCache().get('ow_reviewed_'+itemToken);
      if(reviewed!==d.revision) throw new Error('Сначала просмотрите эту версию правок.');
      const payload={action:'save',text:d.text};
      if(JSON.stringify(d.asset_ids)!==JSON.stringify(d.original_asset_ids)) payload.asset_ids=d.asset_ids;
      const actionId=rformOwnerBotV1Sha256Hex_('SAVE\n'+d.content_id+'\n'+d.source_hash+'\n'+d.revision).slice(0,32);
      const result=rformOwnerBotV1WorkspaceApi_(d.content_id,d.source_hash,payload,actionId);
      if(!result.ok) throw new Error('Сохранение не подтверждено.');
      CacheService.getScriptCache().remove('ow_draft_'+itemToken);
      rformOwnerBotV1RemoveKeyboard_(callback);
      rformOwnerBotV1SendOwnerText_('Новая версия сохранена. Прежнее согласование сброшено. Публикация не запланирована.');
      rformOwnerBotV1WorkspaceOpen_(rformOwnerBotV1ApiRead_(),itemToken);return;
    }
    if(action==='hold' || action==='return' || action==='preview') {
      if(d.dirty) throw new Error('Сначала сохраните или отмените правки.');
      if(action==='preview') {
        rformOwnerBotV1WorkspaceApi_(d.content_id,d.source_hash,{action:'prepare'});
        const fresh=rformOwnerBotV1ApiRead_();
        const previews=rformOwnerBotV1BuildReadyPreviews_({queue:fresh.queue.filter(function(q){return q.Content_ID===d.content_id;})},1);
        if(!previews.length) throw new Error('Предпросмотр не готов.');
        rformOwnerBotV1SendPreview_(previews[0],{actionsEnabled:true,markSent:true});return;
      }
      rformOwnerBotV1WorkspaceApi_(d.content_id,d.source_hash,{action:action});
      CacheService.getScriptCache().remove('ow_draft_'+itemToken);
      rformOwnerBotV1SendOwnerText_(action==='hold'?'Материал отложен. Дату рассмотрения можно указать в карточке.':'Материал возвращён в работу. Публикация не запланирована.');
      rformOwnerBotV1WorkspaceOpen_(rformOwnerBotV1ApiRead_(),itemToken);return;
    }
  } catch(error) {
    console.warn('Owner workspace callback failed.');
    rformOwnerBotV1SendOwnerText_('Действие не завершено. Проверьте актуальную карточку через /queue; сохранение могло примениться. Если есть правки, сначала просмотрите и сохраните либо отмените их. Повтор автоматически не выполняется.');
  } finally {lock.releaseLock();}
}

function rformOwnerBotV1WorkspaceSearch_(bundle,page,query) {
  // Reuse pagination over the union, without relabelling production states.
  const matched=(bundle.queue || []).filter(function(q) {
    if(['PLANNED','NOT_READY','SCHEDULED','PUBLISHING','HOLD','PUBLISHED'].indexOf(q.Publication_Status)===-1) return false;
    if(/SUPERSEDED|ARCHIV|CANCELLED/.test(q.Pipeline_Status || '')) return false;
    return [q.Content_ID,q.Date,q.Session_ID,q.Rubric,String(q.Telegram_Text || '').split('\n')[0]]
      .join(' ').toLocaleLowerCase('ru').indexOf(query.toLocaleLowerCase('ru'))!==-1;
  });
  const synthetic=matched.map(function(q) {return Object.assign({},q,{Publication_Status:'PLANNED'});});
  rformOwnerBotV1WorkspaceList_({queue:synthetic},'work',page,query);
}

function rformOwnerBotV1WorkspaceReminders_(bundle) {
  const meta=bundle.workspace_meta || {};
  (bundle.queue || []).forEach(function(item) {
    const m=meta[item.Content_ID] || {}, reminder=m.reminder;
    if(item.Publication_Status!=='HOLD' || !reminder || !reminder.notify ||
      !reminder.review_at || Date.parse(reminder.review_at)>Date.now()) return;
    const key='ow_reminded_'+rformOwnerBotV1Sha256Hex_(item.Content_ID+'\n'+reminder.review_at).slice(0,16);
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty(key)) return;
    // At-most-once notification; UNKNOWN requires operator check, never moves HOLD.
    props.setProperty(key,'SENDING');
    rformOwnerBotV1SendOwnerText_('Пора рассмотреть отложенный материал:\n'+
      String(item.Telegram_Text || item.Content_ID).split('\n')[0]+'\nМатериал остаётся отложенным.',{
      reply_markup:JSON.stringify({inline_keyboard:[[{text:'Открыть',callback_data:'ow:open:'+rformOwnerBotV1ItemToken_(item)}]]})
    });
    props.setProperty(key,'SENT');
  });
}

function rformOwnerBotV1EnableTrainingDrafts() {
  PropertiesService.getScriptProperties().setProperty('RFORM_OWNER_AUTO_DRAFTS_ENABLED','YES');
  return {ok:true,note:'Enable Content API baseline first. Existing poll handles drafts; no new trigger.'};
}

function rformOwnerBotV1WorkspaceProposals_(bundle) {
  const meta=bundle.workspace_meta || {};
  const props=PropertiesService.getScriptProperties();
  (bundle.queue || []).forEach(function(item) {
    const ai=(meta[item.Content_ID] || {}).ai;
    if(!ai || ai.status!=='PROPOSED' || ai.source_hash!==rformOwnerBotV1WorkspaceHash_(item)) return;
    const key='ow_ai_sent_'+ai.proposal_id;
    if(props.getProperty(key)) return;
    props.setProperty(key,'SENDING');
    rformOwnerBotV1SendOwnerText_('Предложение ИИ готово к проверке. Исходный материал не изменён.',{
      reply_markup:JSON.stringify({inline_keyboard:[[{text:'Открыть материал',callback_data:'ow:open:'+rformOwnerBotV1ItemToken_(item)}]]})
    });
    props.setProperty(key,'SENT');
  });
}
