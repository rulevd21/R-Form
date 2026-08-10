'use strict';

const RFORM_PHASE3C3_VERSION = '0.3.5-sandbox';
const RFORM_FAVORITE_SOURCE = 'RFORM_MOBILE';

/**
 * Phase 3C.3 bootstrap.
 * Adds Favorite metadata write while preserving the accepted MEAL writer.
 */
function getPhase3C3BootstrapState() {
  const base = getPhase3C2BootstrapState();
  base.app.appVersion = RFORM_PHASE3C3_VERSION;
  base.app.modules.fastPathFavorite = true;
  base.app.writeScope = ['DAY_START', 'MEAL', 'FOOD_FAVORITE'];
  base.fastPaths = base.fastPaths || {};
  base.fastPaths.capabilities = Object.assign({}, base.fastPaths.capabilities || {}, {
    repeatRecentMeal: true,
    recentFoodPrefill: false,
    favoriteWrite: true,
    templateWrite: false
  });
  base.fastPaths.readOnly = false;
  return base;
}

/**
 * Toggle FOOD_CATALOG.Favorite only.
 * Audit uses existing INBOX_LOG Event_Type=CORRECTION and
 * Parsed_Entity=FOOD_FAVORITE to avoid expanding the dictionary/schema.
 */
function setFoodFavorite(payload) {
  const config = getConfig_();
  const input = validateFoodFavoritePayload_(payload);
  const ss = getMasterSpreadsheet_();
  const catalog = ss.getSheetByName('FOOD_CATALOG');
  const inbox = ss.getSheetByName('INBOX_LOG');

  if (!catalog) throw new Error('SCHEMA_MISMATCH:FOOD_CATALOG:sheet_missing');
  if (!inbox) throw new Error('SCHEMA_MISMATCH:INBOX_LOG:sheet_missing');

  const catalogHeaders = getHeaderMap_(catalog);
  const inboxHeaders = getHeaderMap_(inbox);
  requireHeaders_(catalogHeaders, [
    'Food_ID','Verified_By_User','Favorite','Status','Duplicate_Flag'
  ], 'FOOD_CATALOG');
  requireHeaders_(inboxHeaders, [
    'Inbox_Event_ID','Received_At','Event_Date','Event_Type','Raw_Message','Parsed_Entity',
    'Target_Sheet','Target_Record_ID','Validation_Status','Missing_Fields','Processing_Status',
    'Applied_At','Applied_By','Source_Chat','Version','Correction_Of','Duplicate_Flag','Note'
  ], 'INBOX_LOG');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  const inboxId = `APP-FAVORITE-${input.eventId}`;
  const dateKey = Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
  const sheetDateSerial = dateKeyToSheetSerial_(dateKey);
  let catalogRow = 0;
  let inboxRow = 0;
  let previousFavoriteValue = '';
  let catalogChanged = false;
  let resultStatus = '';

  try {
    const existingEventRow = findRowByExactValue_(inbox, inboxHeaders.Inbox_Event_ID, inboxId);
    if (existingEventRow) {
      resultStatus = 'ALREADY_APPLIED';
    } else {
      catalogRow = findRowByExactValue_(catalog, catalogHeaders.Food_ID, input.foodId);
      if (!catalogRow) throw new Error(`VALIDATION:FOOD_NOT_FOUND:${input.foodId}`);

      const row = catalog.getRange(catalogRow, 1, 1, catalog.getLastColumn()).getValues()[0];
      const status = String(valueByHeader_(row, catalogHeaders, 'Status') || '').trim().toUpperCase();
      const verified = isTruthy_(valueByHeader_(row, catalogHeaders, 'Verified_By_User'));
      const duplicate = String(valueByHeader_(row, catalogHeaders, 'Duplicate_Flag') || '').trim();
      if (status !== 'ACTIVE') throw new Error(`VALIDATION:FOOD_NOT_ACTIVE:${input.foodId}`);
      if (!verified) throw new Error(`VALIDATION:FOOD_NOT_VERIFIED:${input.foodId}`);
      if (duplicate) throw new Error(`VALIDATION:FOOD_DUPLICATE:${input.foodId}`);

      const favoriteCell = catalog.getRange(catalogRow, catalogHeaders.Favorite);
      previousFavoriteValue = favoriteCell.getValue();
      const previousFavorite = isTruthy_(previousFavoriteValue);
      if (previousFavorite === input.favorite) {
        resultStatus = 'ALREADY_STATE';
      } else {
        favoriteCell.setValue(input.favorite ? 'YES' : 'NO');
        catalogChanged = true;
        SpreadsheetApp.flush();

        const storedFavorite = String(favoriteCell.getDisplayValue() || '').trim().toUpperCase();
        if (storedFavorite !== (input.favorite ? 'YES' : 'NO')) {
          throw new Error('VERIFY_FAILED:FOOD_CATALOG:Favorite');
        }
        if (catalog.getRange(catalogRow, catalogHeaders.Duplicate_Flag).getDisplayValue()) {
          throw new Error('VERIFY_FAILED:FOOD_CATALOG:DUPLICATE');
        }

        const now = new Date();
        inboxRow = inbox.getLastRow() + 1;
        ensureRows_(inbox, inboxRow);
        prepareNewRowsLikePrevious_(inbox, inboxRow, 1);
        inbox.getRange(inboxRow, 1, 1, 18).setValues([
          buildFoodFavoriteInboxRow_(
            inboxRow,
            inboxId,
            input,
            previousFavorite,
            now,
            sheetDateSerial
          )
        ]);
        inbox.getRange(inboxRow, inboxHeaders.Received_At).setNumberFormat('dd.mm.yyyy hh:mm');
        inbox.getRange(inboxRow, inboxHeaders.Event_Date).setNumberFormat('dd.mm.yyyy');
        inbox.getRange(inboxRow, inboxHeaders.Applied_At).setNumberFormat('dd.mm.yyyy hh:mm');
        SpreadsheetApp.flush();

        if (inbox.getRange(inboxRow, inboxHeaders.Inbox_Event_ID).getDisplayValue() !== inboxId) {
          throw new Error('VERIFY_FAILED:INBOX_LOG:Inbox_Event_ID');
        }
        if (String(inbox.getRange(inboxRow, inboxHeaders.Event_Type).getDisplayValue()).trim() !== 'CORRECTION') {
          throw new Error('VERIFY_FAILED:INBOX_LOG:Event_Type');
        }
        if (String(inbox.getRange(inboxRow, inboxHeaders.Parsed_Entity).getDisplayValue()).trim() !== 'FOOD_FAVORITE') {
          throw new Error('VERIFY_FAILED:INBOX_LOG:Parsed_Entity');
        }
        verifyCalendarDateCellPhase3_(
          inbox.getRange(inboxRow, inboxHeaders.Event_Date),
          sheetDateSerial,
          config.timezone,
          'INBOX_LOG:Event_Date'
        );
        if (inbox.getRange(inboxRow, inboxHeaders.Duplicate_Flag).getDisplayValue()) {
          throw new Error('VERIFY_FAILED:INBOX_LOG:DUPLICATE');
        }

        resultStatus = 'APPLIED';
      }
    }
  } catch (error) {
    if (inboxRow) inbox.getRange(inboxRow, 1, 1, 18).clearContent();
    if (catalogChanged && catalogRow) {
      catalog.getRange(catalogRow, catalogHeaders.Favorite).setValue(previousFavoriteValue);
    }
    SpreadsheetApp.flush();
    throw error;
  } finally {
    lock.releaseLock();
  }

  const fresh = getPhase3C3BootstrapState();
  const food = (fresh.nutritionInput && fresh.nutritionInput.foods || []).find(item => item.foodId === input.foodId);
  return {
    status: resultStatus,
    eventId: input.eventId,
    inboxEventId: resultStatus === 'APPLIED' || resultStatus === 'ALREADY_APPLIED' ? inboxId : '',
    foodId: input.foodId,
    favorite: food ? Boolean(food.favorite) : input.favorite,
    fastPaths: fresh.fastPaths,
    appVersion: RFORM_PHASE3C3_VERSION
  };
}

function validateFoodFavoritePayload_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('VALIDATION:PAYLOAD_REQUIRED');
  const eventId = String(payload.eventId || '').trim();
  const eventType = String(payload.eventType || '').trim();
  const foodId = String(payload.foodId || '').trim();
  const source = String(payload.source || '').trim();

  if (!/^[0-9a-fA-F-]{32,36}$/.test(eventId)) throw new Error('VALIDATION:EVENT_ID');
  if (eventType !== 'FOOD_FAVORITE') throw new Error('VALIDATION:EVENT_TYPE');
  if (!/^FOOD-[A-Za-z0-9_-]+$/.test(foodId)) throw new Error('VALIDATION:FOOD_ID');
  if (typeof payload.favorite !== 'boolean') throw new Error('VALIDATION:FAVORITE_BOOLEAN');
  if (source !== RFORM_FAVORITE_SOURCE) throw new Error('VALIDATION:SOURCE');

  return { eventId, eventType, foodId, favorite: payload.favorite, source };
}

function buildFoodFavoriteInboxRow_(row, inboxId, input, previousFavorite, now, sheetDateSerial) {
  const values = new Array(18).fill('');
  values[0] = inboxId;
  values[1] = now;
  values[2] = sheetDateSerial;
  values[3] = 'CORRECTION';
  values[4] = `FOOD_FAVORITE ${input.foodId}: ${previousFavorite ? 'YES' : 'NO'} -> ${input.favorite ? 'YES' : 'NO'}`;
  values[5] = 'FOOD_FAVORITE';
  values[6] = 'FOOD_CATALOG';
  values[7] = input.foodId;
  values[8] = 'VALID';
  values[9] = '';
  values[10] = 'APPLIED';
  values[11] = now;
  values[12] = 'OWNER';
  values[13] = RFORM_FAVORITE_SOURCE;
  values[14] = RFORM_PHASE3C3_VERSION;
  values[15] = '';
  values[16] = `=IF(A${row}="";"";IF(COUNTIF($A$2:$A$5000;A${row})>1;"DUPLICATE";""))`;
  values[17] = 'Phase 3C.3 Favorite metadata change only. FOOD_CATALOG.Favorite changed; NUTRITION_RAW and nutrition facts are not modified.';
  return values;
}
