'use strict';

const RFORM_PHASE3C4_VERSION = '0.3.6-sandbox';
const RFORM_TEMPLATE_SOURCE = 'RFORM_MOBILE';
const RFORM_TEMPLATE_EVENT_TYPE = 'MEAL_TEMPLATE_SAVE';

function getPhase3C4BootstrapState() {
  const base = getPhase3C3BootstrapState();
  base.app.appVersion = RFORM_PHASE3C4_VERSION;
  base.app.modules.fastPathTemplates = true;
  base.app.writeScope = ['DAY_START', 'MEAL', 'FOOD_FAVORITE', 'MEAL_TEMPLATE_SAVE'];
  base.fastPaths = base.fastPaths || {};
  base.fastPaths.capabilities = Object.assign({}, base.fastPaths.capabilities || {}, {
    repeatRecentMeal: true,
    recentFoodPrefill: false,
    favoriteWrite: true,
    templateWrite: true,
    templateUse: true
  });
  base.fastPaths.readOnly = false;
  return base;
}

function saveMealTemplate(payload) {
  const config = getConfig_();
  const input = validateMealTemplatePayload_(payload);
  const ss = getMasterSpreadsheet_();
  const raw = ss.getSheetByName('NUTRITION_RAW');
  const catalog = ss.getSheetByName('FOOD_CATALOG');
  const templates = ss.getSheetByName('MEAL_TEMPLATES');
  const inbox = ss.getSheetByName('INBOX_LOG');
  const dictionaries = ss.getSheetByName('DICTIONARIES');

  if (!raw) throw new Error('SCHEMA_MISMATCH:NUTRITION_RAW:sheet_missing');
  if (!catalog) throw new Error('SCHEMA_MISMATCH:FOOD_CATALOG:sheet_missing');
  if (!templates) throw new Error('SCHEMA_MISMATCH:MEAL_TEMPLATES:sheet_missing');
  if (!inbox) throw new Error('SCHEMA_MISMATCH:INBOX_LOG:sheet_missing');
  if (!dictionaries) throw new Error('SCHEMA_MISMATCH:DICTIONARIES:sheet_missing');

  const rawHeaders = getHeaderMap_(raw);
  const catalogHeaders = getHeaderMap_(catalog);
  const templateHeaders = getHeaderMap_(templates);
  const inboxHeaders = getHeaderMap_(inbox);

  requireHeaders_(rawHeaders, ['Meal_ID','Meal_Type','Food_Name_Original','Amount','Unit','Source','Status','Duplicate_Flag'], 'NUTRITION_RAW');
  requireHeaders_(catalogHeaders, ['Food_ID','Display_Name','Brand','Basis','Verified_By_User','Status','Duplicate_Flag'], 'FOOD_CATALOG');
  requireHeaders_(templateHeaders, ['Meal_Template_ID','Template_Name','Meal_Type','Component_Order','Food_ID','Default_Amount','Unit','Status','Last_Used_At'], 'MEAL_TEMPLATES');
  requireHeaders_(inboxHeaders, ['Inbox_Event_ID','Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity','Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status','Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Duplicate_Flag','Note'], 'INBOX_LOG');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  const inboxId = `APP-TEMPLATE-${input.eventId}`;
  const dateKey = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  const sheetDateSerial = dateKeyToSheetSerial_(dateKey);
  let templateStartRow = 0;
  let templateRowCount = 0;
  let inboxRow = 0;

  try {
    const existingEventRow = findRowByExactValue_(inbox, inboxHeaders.Inbox_Event_ID, inboxId);
    if (existingEventRow) {
      const existingTemplateId = String(inbox.getRange(existingEventRow, inboxHeaders.Target_Record_ID).getDisplayValue() || '').trim();
      return buildTemplateResult_('ALREADY_APPLIED', input, existingTemplateId, inboxId);
    }

    const sourceMeal = resolveTemplateSourceMeal_(raw, rawHeaders, catalog, catalogHeaders, input.sourceMealId);
    const signature = buildTemplateSignature_(sourceMeal.mealType, sourceMeal.components);
    const existingTemplateId = findActiveTemplateBySignature_(templates, templateHeaders, signature);
    const now = new Date();

    if (existingTemplateId) {
      inboxRow = writeTemplateInbox_(inbox, inboxHeaders, input, inboxId, existingTemplateId, sourceMeal, now, sheetDateSerial, 'SKIPPED', 'Existing ACTIVE template has the same Meal_Type and ordered Food_ID/Amount/Unit signature.');
      verifyTemplateInbox_(inbox, inboxHeaders, inboxRow, inboxId, existingTemplateId, 'SKIPPED', sheetDateSerial, config.timezone);
      return buildTemplateResult_('ALREADY_STATE', input, existingTemplateId, inboxId);
    }

    const templateId = buildMealTemplateId_(dateKey, input.eventId);
    const templateName = input.optionalName || buildDefaultTemplateName_(sourceMeal);
    templateRowCount = sourceMeal.components.length;
    templateStartRow = templates.getLastRow() + 1;
    ensureRows_(templates, templateStartRow + templateRowCount - 1);
    prepareTemplateRows_(templates, dictionaries, templateStartRow, templateRowCount, templateHeaders);

    const rows = sourceMeal.components.map((component, index) => [templateId, templateName, sourceMeal.mealType, index + 1, component.foodId, component.amount, component.unit, 'ACTIVE', now]);
    templates.getRange(templateStartRow, 1, templateRowCount, 9).setValues(rows);
    templates.getRange(templateStartRow, templateHeaders.Last_Used_At, templateRowCount, 1).setNumberFormat('dd.mm.yyyy hh:mm');
    SpreadsheetApp.flush();
    verifyTemplateRows_(templates, templateHeaders, templateStartRow, templateRowCount, templateId, signature);

    inboxRow = writeTemplateInbox_(inbox, inboxHeaders, input, inboxId, templateId, sourceMeal, now, sheetDateSerial, 'APPLIED', `Created ${templateRowCount} component row(s); nutrition values are not stored in MEAL_TEMPLATES.`);
    verifyTemplateInbox_(inbox, inboxHeaders, inboxRow, inboxId, templateId, 'APPLIED', sheetDateSerial, config.timezone);
    return buildTemplateResult_('APPLIED', input, templateId, inboxId);
  } catch (error) {
    if (inboxRow) inbox.getRange(inboxRow, 1, 1, 18).clearContent();
    if (templateStartRow && templateRowCount) templates.getRange(templateStartRow, 1, templateRowCount, 9).clearContent();
    SpreadsheetApp.flush();
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function validateMealTemplatePayload_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const eventId = String(payload.eventId || '').trim();
  const eventType = String(payload.eventType || '').trim();
  const sourceMealId = String(payload.sourceMealId || '').trim();
  const optionalName = String(payload.optionalName || '').trim();
  const source = String(payload.source || '').trim();
  const clientVersion = String(payload.appVersion || '').trim().slice(0, 80);
  if (!/^[0-9a-fA-F-]{32,36}$/.test(eventId)) throw new Error('VALIDATION:EVENT_ID');
  if (eventType !== RFORM_TEMPLATE_EVENT_TYPE) throw new Error('VALIDATION:EVENT_TYPE');
  if (!/^\d{4}-\d{2}-\d{2}_M\d+$/.test(sourceMealId)) throw new Error('VALIDATION:SOURCE_MEAL_ID');
  if (optionalName.length > 80) throw new Error('VALIDATION:TEMPLATE_NAME_TOO_LONG');
  if (source !== RFORM_TEMPLATE_SOURCE) throw new Error('VALIDATION:SOURCE');
  return { eventId, eventType, sourceMealId, optionalName, source, clientVersion };
}

function resolveTemplateSourceMeal_(raw, rawHeaders, catalog, catalogHeaders, sourceMealId) {
  const catalogMap = {};
  const catalogLastRow = catalog.getLastRow();
  if (catalogLastRow >= 2) {
    const rows = catalog.getRange(2, 1, catalogLastRow - 1, catalog.getLastColumn()).getValues();
    rows.forEach(row => {
      const foodId = String(valueByHeader_(row, catalogHeaders, 'Food_ID') || '').trim();
      const status = String(valueByHeader_(row, catalogHeaders, 'Status') || '').trim().toUpperCase();
      const duplicate = String(valueByHeader_(row, catalogHeaders, 'Duplicate_Flag') || '').trim();
      const verified = isTruthy_(valueByHeader_(row, catalogHeaders, 'Verified_By_User'));
      if (!foodId || status !== 'ACTIVE' || duplicate || !verified) return;
      catalogMap[foodId] = { foodId, displayName: String(valueByHeader_(row, catalogHeaders, 'Display_Name') || '').trim() || foodId, brand: String(valueByHeader_(row, catalogHeaders, 'Brand') || '').trim(), basis: String(valueByHeader_(row, catalogHeaders, 'Basis') || '').trim() };
    });
  }

  const matches = [];
  const lastRow = raw.getLastRow();
  if (lastRow >= 2) {
    const rows = raw.getRange(2, 1, lastRow - 1, raw.getLastColumn()).getValues();
    rows.forEach((row, index) => {
      const mealId = String(valueByHeader_(row, rawHeaders, 'Meal_ID') || '').trim();
      if (mealId !== sourceMealId) return;
      const status = String(valueByHeader_(row, rawHeaders, 'Status') || '').trim().toUpperCase();
      const duplicate = String(valueByHeader_(row, rawHeaders, 'Duplicate_Flag') || '').trim();
      const source = String(valueByHeader_(row, rawHeaders, 'Source') || '').trim();
      if (status === 'DELETED' || duplicate || source.indexOf('RFORM_MOBILE') !== 0) return;
      const foodId = extractCatalogFoodId_(source, '');
      if (!foodId || !catalogMap[foodId]) return;
      const amount = Number(valueByHeader_(row, rawHeaders, 'Amount'));
      const unit = String(valueByHeader_(row, rawHeaders, 'Unit') || '').trim();
      if (!Number.isFinite(amount) || amount <= 0 || unit !== catalogMap[foodId].basis) return;
      matches.push({ row: index + 2, foodId, displayName: catalogMap[foodId].displayName, brand: catalogMap[foodId].brand, amount, unit, mealType: String(valueByHeader_(row, rawHeaders, 'Meal_Type') || '').trim() });
    });
  }

  matches.sort((a, b) => a.row - b.row);
  if (matches.length < 2) throw new Error('VALIDATION:TEMPLATE_REQUIRES_MULTI_COMPONENT_MEAL');
  if (matches.length > 20) throw new Error('VALIDATION:TEMPLATE_TOO_MANY_COMPONENTS');
  const mealTypes = Array.from(new Set(matches.map(item => item.mealType)));
  if (mealTypes.length !== 1 || !mealTypes[0]) throw new Error('VALIDATION:SOURCE_MEAL_TYPE');
  const foodIds = matches.map(item => item.foodId);
  if (new Set(foodIds).size !== foodIds.length) throw new Error('VALIDATION:DUPLICATE_FOOD_IN_SOURCE_MEAL');
  return { sourceMealId, mealType: mealTypes[0], components: matches.map(item => ({ foodId: item.foodId, displayName: item.displayName, brand: item.brand, amount: item.amount, unit: item.unit })) };
}

function buildTemplateSignature_(mealType, components) { return [String(mealType || '').trim().toUpperCase()].concat(components.map(component => `${component.foodId}:${normalizeTemplateNumber_(component.amount)}:${component.unit}`)).join('|'); }
function findActiveTemplateBySignature_(sheet, headers, targetSignature) {
  const lastRow = sheet.getLastRow(); if (lastRow < 2) return '';
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues(); const groups = {};
  rows.forEach(row => { const templateId = String(valueByHeader_(row, headers, 'Meal_Template_ID') || '').trim(); const status = String(valueByHeader_(row, headers, 'Status') || '').trim().toUpperCase(); if (!templateId || status !== 'ACTIVE') return; if (!groups[templateId]) groups[templateId] = { mealType: '', components: [] }; groups[templateId].mealType = String(valueByHeader_(row, headers, 'Meal_Type') || '').trim(); groups[templateId].components.push({ order: Number(valueByHeader_(row, headers, 'Component_Order')) || 999, foodId: String(valueByHeader_(row, headers, 'Food_ID') || '').trim(), amount: Number(valueByHeader_(row, headers, 'Default_Amount')), unit: String(valueByHeader_(row, headers, 'Unit') || '').trim() }); });
  for (const templateId in groups) { const group = groups[templateId]; group.components.sort((a, b) => a.order - b.order); if (group.components.some(c => !c.foodId || !Number.isFinite(c.amount) || c.amount <= 0 || !c.unit)) continue; if (buildTemplateSignature_(group.mealType, group.components) === targetSignature) return templateId; }
  return '';
}
function buildMealTemplateId_(dateKey, eventId) { return `MT-${String(dateKey).replace(/-/g, '')}-${String(eventId).replace(/-/g, '').slice(0, 8).toUpperCase()}`; }
function buildDefaultTemplateName_(sourceMeal) { const names = sourceMeal.components.slice(0, 2).map(component => component.displayName || component.foodId); const suffix = sourceMeal.components.length > 2 ? ' +' : ''; return `${sourceMeal.mealType} · ${names.join(' + ')}${suffix}`.slice(0, 80); }
function normalizeTemplateNumber_(value) { const number = Number(value); if (!Number.isFinite(number)) return ''; return number.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); }

function prepareTemplateRows_(sheet, dictionaries, startRow, rowCount, headers) {
  if (startRow > 2) { const sourceRow = startRow - 1; sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn()).copyTo(sheet.getRange(startRow, 1, rowCount, sheet.getLastColumn()), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); }
  const mealTypeRule = SpreadsheetApp.newDataValidation().requireValueInRange(dictionaries.getRange('H2:H8'), true).setAllowInvalid(false).build();
  const unitRule = SpreadsheetApp.newDataValidation().requireValueInRange(dictionaries.getRange('P2:P10'), true).setAllowInvalid(false).build();
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInRange(dictionaries.getRange('N2:N7'), true).setAllowInvalid(false).build();
  sheet.getRange(startRow, headers.Meal_Type, rowCount, 1).setDataValidation(mealTypeRule); sheet.getRange(startRow, headers.Unit, rowCount, 1).setDataValidation(unitRule); sheet.getRange(startRow, headers.Status, rowCount, 1).setDataValidation(statusRule);
}
function verifyTemplateRows_(sheet, headers, startRow, rowCount, templateId, expectedSignature) {
  const rows = sheet.getRange(startRow, 1, rowCount, sheet.getLastColumn()).getValues(); const components = []; let mealType = '';
  rows.forEach((row, index) => { if (String(valueByHeader_(row, headers, 'Meal_Template_ID') || '').trim() !== templateId) throw new Error('VERIFY_FAILED:MEAL_TEMPLATES:Template_ID'); if (String(valueByHeader_(row, headers, 'Status') || '').trim().toUpperCase() !== 'ACTIVE') throw new Error('VERIFY_FAILED:MEAL_TEMPLATES:Status'); const order = Number(valueByHeader_(row, headers, 'Component_Order')); if (order !== index + 1) throw new Error('VERIFY_FAILED:MEAL_TEMPLATES:Component_Order'); mealType = String(valueByHeader_(row, headers, 'Meal_Type') || '').trim(); components.push({ foodId: String(valueByHeader_(row, headers, 'Food_ID') || '').trim(), amount: Number(valueByHeader_(row, headers, 'Default_Amount')), unit: String(valueByHeader_(row, headers, 'Unit') || '').trim() }); });
  if (buildTemplateSignature_(mealType, components) !== expectedSignature) throw new Error('VERIFY_FAILED:MEAL_TEMPLATES:SIGNATURE');
}
function writeTemplateInbox_(inbox, headers, input, inboxId, templateId, sourceMeal, now, sheetDateSerial, processingStatus, detail) {
  const row = inbox.getLastRow() + 1; ensureRows_(inbox, row); prepareNewRowsLikePrevious_(inbox, row, 1); const values = new Array(18).fill('');
  values[0]=inboxId; values[1]=now; values[2]=sheetDateSerial; values[3]='CORRECTION'; values[4]=`MEAL_TEMPLATE ${sourceMeal.sourceMealId} -> ${templateId}`; values[5]='MEAL_TEMPLATE'; values[6]='MEAL_TEMPLATES'; values[7]=templateId; values[8]='VALID'; values[10]=processingStatus; values[11]=now; values[12]='OWNER'; values[13]=RFORM_TEMPLATE_SOURCE; values[14]=RFORM_PHASE3C4_VERSION; values[16]=`=IF(A${row}="";"";IF(COUNTIF($A$2:$A$5000;A${row})>1;"DUPLICATE";""))`; values[17]=`Phase 3C.4 MEAL_TEMPLATE; sourceMeal=${sourceMeal.sourceMealId}; components=${sourceMeal.components.length}; client=${input.clientVersion || 'unknown'}; ${detail}`;
  inbox.getRange(row,1,1,18).setValues([values]); inbox.getRange(row,headers.Received_At).setNumberFormat('dd.mm.yyyy hh:mm'); inbox.getRange(row,headers.Event_Date).setNumberFormat('dd.mm.yyyy'); inbox.getRange(row,headers.Applied_At).setNumberFormat('dd.mm.yyyy hh:mm'); SpreadsheetApp.flush(); return row;
}
function verifyTemplateInbox_(inbox, headers, row, inboxId, templateId, processingStatus, sheetDateSerial, timezone) {
  if (inbox.getRange(row,headers.Inbox_Event_ID).getDisplayValue()!==inboxId) throw new Error('VERIFY_FAILED:INBOX_LOG:Inbox_Event_ID'); if (String(inbox.getRange(row,headers.Event_Type).getDisplayValue()).trim()!=='CORRECTION') throw new Error('VERIFY_FAILED:INBOX_LOG:Event_Type'); if (String(inbox.getRange(row,headers.Parsed_Entity).getDisplayValue()).trim()!=='MEAL_TEMPLATE') throw new Error('VERIFY_FAILED:INBOX_LOG:Parsed_Entity'); if (String(inbox.getRange(row,headers.Target_Record_ID).getDisplayValue()).trim()!==templateId) throw new Error('VERIFY_FAILED:INBOX_LOG:Target_Record_ID'); if (String(inbox.getRange(row,headers.Processing_Status).getDisplayValue()).trim()!==processingStatus) throw new Error('VERIFY_FAILED:INBOX_LOG:Processing_Status'); verifyCalendarDateCellPhase3_(inbox.getRange(row,headers.Event_Date),sheetDateSerial,timezone,'INBOX_LOG:Event_Date'); if (inbox.getRange(row,headers.Duplicate_Flag).getDisplayValue()) throw new Error('VERIFY_FAILED:INBOX_LOG:DUPLICATE');
}
function buildTemplateResult_(status, input, templateId, inboxId) { const fresh=getPhase3C4BootstrapState(); const template=(fresh.fastPaths&&fresh.fastPaths.templates||[]).find(item=>item.templateId===templateId)||null; return {status,eventId:input.eventId,inboxEventId:inboxId,templateId,template,fastPaths:fresh.fastPaths,appVersion:RFORM_PHASE3C4_VERSION}; }
