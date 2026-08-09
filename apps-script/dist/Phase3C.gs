'use strict';

const RFORM_PHASE3C_VERSION = '0.3.2-sandbox';
const RFORM_FASTPATH_RECENT_MEALS = 3;
const RFORM_FASTPATH_RECENT_FOODS = 6;

function getPhase3CBootstrapState() {
  const base = getPhase3BootstrapState();
  const config = getConfig_();
  base.app.appVersion = RFORM_PHASE3C_VERSION;
  base.app.modules.fastPathNutrition = true;
  base.app.writeScope = ['DAY_START', 'MEAL'];
  base.fastPaths = getNutritionFastPathState_(config);
  return base;
}

function getNutritionFastPathState_(config) {
  const ss = getMasterSpreadsheet_();
  const raw = ss.getSheetByName('NUTRITION_RAW');
  const catalog = ss.getSheetByName('FOOD_CATALOG');
  const templates = ss.getSheetByName('MEAL_TEMPLATES');
  if (!raw) throw new Error('SCHEMA_MISMATCH:NUTRITION_RAW:sheet_missing');
  if (!catalog) throw new Error('SCHEMA_MISMATCH:FOOD_CATALOG:sheet_missing');
  if (!templates) throw new Error('SCHEMA_MISMATCH:MEAL_TEMPLATES:sheet_missing');

  const rawHeaders = getHeaderMap_(raw);
  const catalogHeaders = getHeaderMap_(catalog);
  const templateHeaders = getHeaderMap_(templates);
  requireHeaders_(rawHeaders, ['Day_ID','Date','Meal_ID','Meal_Time','Meal_Type','Food_Name_Original','Amount','Unit','Calories_Min','Protein_Min','Fat_Min','Carbs_Min','Source','Created_At','Status','Record_Key','Duplicate_Flag'], 'NUTRITION_RAW');
  requireHeaders_(catalogHeaders, ['Food_ID','Display_Name','Brand','Basis','Basis_Amount','Calories','Protein','Fat','Carbs','Verified_By_User','Favorite','Status','Duplicate_Flag'], 'FOOD_CATALOG');
  requireHeaders_(templateHeaders, ['Meal_Template_ID','Template_Name','Meal_Type','Component_Order','Food_ID','Default_Amount','Unit','Status','Last_Used_At'], 'MEAL_TEMPLATES');

  const catalogMap = buildFastPathCatalogMap_(catalog, catalogHeaders, config);
  const rawState = buildFastPathRawState_(raw, rawHeaders, catalogMap, config);
  const favoriteFoods = Object.keys(catalogMap).map(id => catalogMap[id]).filter(food => food.favorite).sort((a, b) => (b.lastUsedSort || 0) - (a.lastUsedSort || 0) || a.displayName.localeCompare(b.displayName, 'ru')).map(publicFastPathFood_);

  return {
    status: 'READY',
    recentMeals: rawState.recentMeals.slice(0, RFORM_FASTPATH_RECENT_MEALS),
    recentFoods: rawState.recentFoods.slice(0, RFORM_FASTPATH_RECENT_FOODS),
    favorites: favoriteFoods,
    templates: buildFastPathTemplates_(templates, templateHeaders, catalogMap, config),
    limits: {recentMeals: RFORM_FASTPATH_RECENT_MEALS, recentFoods: RFORM_FASTPATH_RECENT_FOODS},
    readOnly: true
  };
}

function buildFastPathCatalogMap_(sheet, headers, config) {
  const result = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return result;
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  rows.forEach(row => {
    const foodId = String(valueByHeader_(row, headers, 'Food_ID') || '').trim();
    const status = String(valueByHeader_(row, headers, 'Status') || '').trim().toUpperCase();
    const duplicate = String(valueByHeader_(row, headers, 'Duplicate_Flag') || '').trim();
    const verified = isTruthy_(valueByHeader_(row, headers, 'Verified_By_User'));
    if (!foodId || status !== 'ACTIVE' || duplicate || !verified) return;
    const lastUsed = valueByHeader_(row, headers, 'Last_Used_At');
    result[foodId] = {
      foodId,
      displayName: String(valueByHeader_(row, headers, 'Display_Name') || '').trim(),
      brand: String(valueByHeader_(row, headers, 'Brand') || '').trim(),
      basis: String(valueByHeader_(row, headers, 'Basis') || '').trim(),
      basisAmount: Number(valueByHeader_(row, headers, 'Basis_Amount')) || 0,
      calories: Number(valueByHeader_(row, headers, 'Calories')) || 0,
      protein: Number(valueByHeader_(row, headers, 'Protein')) || 0,
      fat: Number(valueByHeader_(row, headers, 'Fat')) || 0,
      carbs: Number(valueByHeader_(row, headers, 'Carbs')) || 0,
      favorite: isTruthy_(valueByHeader_(row, headers, 'Favorite')),
      lastUsedAt: serializeDateTime_(lastUsed, config.timezone),
      lastUsedSort: dateSortValue_(lastUsed)
    };
  });
  return result;
}

function buildFastPathRawState_(sheet, headers, catalogMap, config) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {recentMeals: [], recentFoods: []};
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const meals = {};
  const foodUses = {};

  rows.forEach((row, index) => {
    const status = String(valueByHeader_(row, headers, 'Status') || '').trim().toUpperCase();
    const duplicate = String(valueByHeader_(row, headers, 'Duplicate_Flag') || '').trim();
    const mealId = String(valueByHeader_(row, headers, 'Meal_ID') || '').trim();
    const source = String(valueByHeader_(row, headers, 'Source') || '').trim();
    const recordKey = String(valueByHeader_(row, headers, 'Record_Key') || '').trim();
    const foodId = extractCatalogFoodId_(source, recordKey);
    if (!mealId || status === 'DELETED' || duplicate || !foodId || !catalogMap[foodId]) return;
    if (source.indexOf('RFORM_MOBILE') !== 0) return;

    const createdAt = valueByHeader_(row, headers, 'Created_At');
    const sortValue = dateSortValue_(createdAt) || (index + 2);
    const amount = Number(valueByHeader_(row, headers, 'Amount'));
    const unit = String(valueByHeader_(row, headers, 'Unit') || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || unit !== catalogMap[foodId].basis) return;

    const component = {foodId, displayName: catalogMap[foodId].displayName, brand: catalogMap[foodId].brand, amount, unit};
    if (!meals[mealId]) {
      meals[mealId] = {
        mealId,
        dayId: String(valueByHeader_(row, headers, 'Day_ID') || '').trim(),
        date: serializeCalendarDate_(valueByHeader_(row, headers, 'Date'), config.timezone),
        mealTime: serializeMealTime_(valueByHeader_(row, headers, 'Meal_Time'), config.timezone),
        mealType: String(valueByHeader_(row, headers, 'Meal_Type') || '').trim(),
        components: [], calories: 0, protein: 0, fat: 0, carbs: 0, sortValue,
        createdAt: serializeDateTime_(createdAt, config.timezone)
      };
    }
    const meal = meals[mealId];
    meal.components.push(component);
    meal.calories += Number(valueByHeader_(row, headers, 'Calories_Min')) || 0;
    meal.protein += Number(valueByHeader_(row, headers, 'Protein_Min')) || 0;
    meal.fat += Number(valueByHeader_(row, headers, 'Fat_Min')) || 0;
    meal.carbs += Number(valueByHeader_(row, headers, 'Carbs_Min')) || 0;
    meal.sortValue = Math.max(meal.sortValue, sortValue);

    if (!foodUses[foodId] || sortValue > foodUses[foodId].sortValue) {
      foodUses[foodId] = {foodId, amount, unit, sortValue, usedAt: serializeDateTime_(createdAt, config.timezone)};
    }
  });

  const recentMeals = Object.keys(meals).map(id => meals[id]).filter(meal => meal.components.length > 0).sort((a, b) => b.sortValue - a.sortValue).map(meal => ({
    mealId: meal.mealId,
    date: meal.date,
    mealTime: meal.mealTime,
    mealType: meal.mealType,
    components: meal.components,
    summary: meal.components.map(c => `${c.displayName} ${formatFastPathNumber_(c.amount)} ${c.unit}`).join('; '),
    nutrition: {calories: roundFastPath_(meal.calories), protein: roundFastPath_(meal.protein), fat: roundFastPath_(meal.fat), carbs: roundFastPath_(meal.carbs)},
    createdAt: meal.createdAt
  }));

  const recentFoods = Object.keys(foodUses).map(foodId => {
    const use = foodUses[foodId];
    const food = catalogMap[foodId];
    return Object.assign(publicFastPathFood_(food), {lastAmount: use.amount, lastUnit: use.unit, usedAt: use.usedAt, sortValue: use.sortValue});
  }).sort((a, b) => b.sortValue - a.sortValue).map(item => {const clone = Object.assign({}, item); delete clone.sortValue; return clone;});

  return {recentMeals, recentFoods};
}

function buildFastPathTemplates_(sheet, headers, catalogMap, config) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const groups = {};
  rows.forEach(row => {
    const templateId = String(valueByHeader_(row, headers, 'Meal_Template_ID') || '').trim();
    const status = String(valueByHeader_(row, headers, 'Status') || '').trim().toUpperCase();
    const foodId = String(valueByHeader_(row, headers, 'Food_ID') || '').trim();
    if (!templateId || status !== 'ACTIVE' || !catalogMap[foodId]) return;
    const amount = Number(valueByHeader_(row, headers, 'Default_Amount'));
    const unit = String(valueByHeader_(row, headers, 'Unit') || '').trim();
    const order = Number(valueByHeader_(row, headers, 'Component_Order')) || 999;
    if (!Number.isFinite(amount) || amount <= 0 || unit !== catalogMap[foodId].basis) return;
    const lastUsed = valueByHeader_(row, headers, 'Last_Used_At');
    if (!groups[templateId]) {
      groups[templateId] = {templateId, templateName: String(valueByHeader_(row, headers, 'Template_Name') || '').trim() || templateId, mealType: String(valueByHeader_(row, headers, 'Meal_Type') || '').trim(), components: [], lastUsedAt: serializeDateTime_(lastUsed, config.timezone), sortValue: dateSortValue_(lastUsed)};
    }
    groups[templateId].components.push({order, foodId, displayName: catalogMap[foodId].displayName, brand: catalogMap[foodId].brand, amount, unit});
    groups[templateId].sortValue = Math.max(groups[templateId].sortValue || 0, dateSortValue_(lastUsed));
  });

  return Object.keys(groups).map(id => groups[id]).filter(group => group.components.length > 0).map(group => {
    group.components.sort((a, b) => a.order - b.order);
    return {
      templateId: group.templateId,
      templateName: group.templateName,
      mealType: group.mealType,
      components: group.components.map(component => ({foodId: component.foodId, displayName: component.displayName, brand: component.brand, amount: component.amount, unit: component.unit})),
      lastUsedAt: group.lastUsedAt,
      summary: group.components.map(c => `${c.displayName} ${formatFastPathNumber_(c.amount)} ${c.unit}`).join('; ')
    };
  }).sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')) || a.templateName.localeCompare(b.templateName, 'ru'));
}

function publicFastPathFood_(food) {
  return {foodId: food.foodId, displayName: food.displayName, brand: food.brand, basis: food.basis, basisAmount: food.basisAmount, calories: food.calories, protein: food.protein, fat: food.fat, carbs: food.carbs, favorite: Boolean(food.favorite), lastUsedAt: food.lastUsedAt || ''};
}

function extractCatalogFoodId_(source, recordKey) {
  const match = String(source || '').match(/FOOD_CATALOG:([^ |]+)/);
  if (match) return match[1];
  const parts = String(recordKey || '').split('|');
  return parts.length >= 3 && /^FOOD-/.test(parts[2]) ? parts[2] : '';
}

function serializeCalendarDate_(value, timezone) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  const number = Number(value);
  if (Number.isFinite(number)) {
    const epoch = new Date(Date.UTC(1899, 11, 30) + Math.floor(number) * 86400000);
    return Utilities.formatDate(epoch, 'UTC', 'yyyy-MM-dd');
  }
  return String(value || '');
}

function serializeMealTime_(value, timezone) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return Utilities.formatDate(value, timezone, 'HH:mm');
  const number = Number(value);
  if (Number.isFinite(number)) {
    const seconds = Math.round((number - Math.floor(number)) * 86400) % 86400;
    const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return String(value || '');
}

function dateSortValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return value.getTime();
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundFastPath_(value) {return Math.round((Number(value) || 0) * 100) / 100;}
function formatFastPathNumber_(value) {const number = Number(value); if (!Number.isFinite(number)) return String(value || ''); return String(Math.round(number * 100) / 100).replace('.', ',');}
