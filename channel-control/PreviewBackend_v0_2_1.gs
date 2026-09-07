// R/Form Channel Control preview backend v0.2.1
// Hotfix: return JSON-safe display values to HtmlService preview.

function rformCcGetPreviewV021(payload) {
  rformCcRequirePayload_(payload, ['contentId']);

  const ss = SpreadsheetApp.openById(RFORM_CC.masterSpreadsheetId);
  const sheet = ss.getSheetByName(RFORM_CC.queueSheet);
  if (!sheet) throw new Error('Sheet not found: ' + RFORM_CC.queueSheet);

  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) throw new Error('CONTENT_QUEUE is empty.');

  const headers = values[0].map(String);
  const headerMap = rformCcHeaderMap_(headers);
  const idCol = headerMap.Content_ID;
  if (idCol === undefined) throw new Error('CONTENT_QUEUE missing Content_ID header.');

  let raw = null;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(payload.contentId)) {
      raw = rformCcRowToObject_(headers, values[i]);
      break;
    }
  }
  if (!raw) throw new Error('Content_ID not found: ' + payload.contentId);

  const item = rformCcNormalizeQueueItem_(raw);
  const mode = String(item.Telegram_Post_Mode || 'TEXT_ONLY').toUpperCase();
  const text = String(item.Telegram_Text || '');
  const warnings = [];
  let visualResult = {visuals: [], sourceType: 'NONE', warning: ''};

  if (mode !== 'TEXT_ONLY') {
    const visualUrl = String(item.Telegram_Visual_URL || '').trim();
    if (!visualUrl) {
      warnings.push('Для ' + mode + ' не задан Telegram_Visual_URL.');
    } else {
      visualResult = rformCcResolveVisuals_(visualUrl);
      if (visualResult.warning) warnings.push(visualResult.warning);
      if (!visualResult.visuals.length) warnings.push('Визуал не удалось отобразить в предпросмотре. Проверьте ссылку на исходник.');
    }
    if (String(item.Visual_Status || '').toUpperCase() !== 'APPROVED') {
      warnings.push('Visual_Status ещё не APPROVED.');
    }
    if (text.length > 1024) {
      warnings.push('Текст длиннее media-caption текущего контура; autopost может отправить его отдельным текстовым сообщением.');
    }
  }

  if (!text.trim()) warnings.push('Telegram_Text пуст.');

  return {
    ok: true,
    item: item,
    visuals: visualResult.visuals || [],
    visualSourceType: visualResult.sourceType || 'NONE',
    warnings: warnings,
    textLength: text.length,
    previewGeneratedAt: Utilities.formatDate(new Date(), RFORM_CC.timeZone, 'dd.MM.yyyy HH:mm:ss')
  };
}
