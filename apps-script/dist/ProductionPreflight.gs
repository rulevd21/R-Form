'use strict';

const RFORM_PROD_PREFLIGHT_VERSION = '0.4.0-rc2';
const RFORM_PROD_EXACT_MASTER_TITLE = 'RFORM_MASTER_DATA_v1';
const RFORM_PROD_REQUIRED_SHEETS = Object.freeze([
  'ACTIVE_PLANS','DAILY','NUTRITION_RAW','NUTRITION_DAILY',
  'TRAINING_SESSIONS','TRAINING_SETS','TRAINING_PLAN','INBOX_LOG','DICTIONARIES'
]);
const RFORM_PROD_FEATURE_SHEETS = Object.freeze(['FOOD_CATALOG','MEAL_TEMPLATES']);

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('R/Form Mobile — Production RC Preflight');
}

function getProductionPreflightState() {
  const props = PropertiesService.getScriptProperties();
  const masterId = String(props.getProperty('MASTER_SPREADSHEET_ID') || '').trim();
  const timezone = String(props.getProperty('APP_TIMEZONE') || Session.getScriptTimeZone() || 'Europe/Moscow').trim();
  const trainingLegacyUrl = String(props.getProperty('TRAINING_LEGACY_URL') || '').trim();
  if (!masterId) throw new Error('CONFIG_MISSING:MASTER_SPREADSHEET_ID');

  const ss = SpreadsheetApp.openById(masterId);
  const title = ss.getName();
  if (title !== RFORM_PROD_EXACT_MASTER_TITLE) throw new Error(`SAFETY_GUARD:EXPECTED_PRODUCTION_DATASTORE:${title || 'UNKNOWN'}`);

  const sheets = {};
  ss.getSheets().forEach(sheet => { sheets[sheet.getName()] = sheet; });
  const missingRequired = RFORM_PROD_REQUIRED_SHEETS.filter(name => !sheets[name]);
  const featureSchema = RFORM_PROD_FEATURE_SHEETS.reduce((out, name) => { out[name] = Boolean(sheets[name]); return out; }, {});
  const todayKey = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const today = readProductionToday_(sheets.DAILY, todayKey, timezone);
  const nutrition = readProductionNutrition_(sheets.NUTRITION_DAILY, today, todayKey, timezone);
  const training = readProductionTraining_(sheets.TRAINING_SESSIONS, todayKey, timezone, trainingLegacyUrl);

  return {
    app: {appName:'R/Form Mobile',environment:'PRODUCTION_RC_READ_ONLY',appVersion:RFORM_PROD_PREFLIGHT_VERSION,timezone,writeCapability:false,writeScope:[]},
    datastore: {title,exactTitleMatch:title===RFORM_PROD_EXACT_MASTER_TITLE,missingRequiredSheets:missingRequired,featureSchema,schemaReadyForFastPath:RFORM_PROD_FEATURE_SHEETS.every(name=>featureSchema[name])},
    today,nutrition,training,
    gate: {status:missingRequired.length?'BLOCKED_REQUIRED_SCHEMA':'READ_ONLY_PREFLIGHT_READY',productionWritesAuthorized:false,schemaMigrationAuthorized:false,trainingLaunchAuthorized:false}
  };
}

function readProductionToday_(sheet,dateKey,timezone){
  if(!sheet)return{state:'UNAVAILABLE',date:dateKey};
  const headers=prodHeaderMap_(sheet),required=['Day_ID','Date','Day_Type','Morning_Weight','Weight_7D_Average','Sleep_Hours','Sleep_Quality','Readiness','Day_Status'];
  const missing=required.filter(name=>!headers[name]);
  if(missing.length)return{state:'SCHEMA_MISMATCH',date:dateKey,missingHeaders:missing};
  const row=prodFindDateRow_(sheet,headers.Date,dateKey,timezone);
  if(!row)return{state:'NOT_STARTED',date:dateKey};
  const values=sheet.getRange(row,1,1,sheet.getLastColumn()).getValues()[0];
  return{state:String(prodValue_(values,headers,'Day_Status')||'UNKNOWN').trim().toUpperCase(),date:dateKey,dayId:String(prodValue_(values,headers,'Day_ID')||'').trim(),dayType:String(prodValue_(values,headers,'Day_Type')||'').trim(),morningWeight:prodNumberOrBlank_(prodValue_(values,headers,'Morning_Weight')),weight7dAverage:prodNumberOrBlank_(prodValue_(values,headers,'Weight_7D_Average')),sleepHours:prodNumberOrBlank_(prodValue_(values,headers,'Sleep_Hours')),sleepQuality:prodNumberOrBlank_(prodValue_(values,headers,'Sleep_Quality')),readiness:prodNumberOrBlank_(prodValue_(values,headers,'Readiness'))};
}

function readProductionNutrition_(sheet,today,dateKey,timezone){
  if(!sheet)return{status:'UNAVAILABLE',date:dateKey};
  const headers=prodHeaderMap_(sheet),required=['Day_ID','Date','Meal_Count','Calories_Min','Calories_Max','Protein_Min','Protein_Max','Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Status'];
  const missing=required.filter(name=>!headers[name]);
  if(missing.length)return{status:'SCHEMA_MISMATCH',date:dateKey,missingHeaders:missing};
  let row=0;
  if(today&&today.dayId&&headers.Day_ID)row=prodFindExactRow_(sheet,headers.Day_ID,today.dayId);
  if(!row)row=prodFindDateRow_(sheet,headers.Date,dateKey,timezone);
  if(!row)return{status:'MISSING',date:dateKey,mealCount:0};
  const values=sheet.getRange(row,1,1,sheet.getLastColumn()).getValues()[0];
  return{status:String(prodValue_(values,headers,'Status')||'UNKNOWN').trim().toUpperCase(),date:dateKey,mealCount:Number(prodValue_(values,headers,'Meal_Count'))||0,caloriesMin:prodNumberOrBlank_(prodValue_(values,headers,'Calories_Min')),caloriesMax:prodNumberOrBlank_(prodValue_(values,headers,'Calories_Max')),proteinMin:prodNumberOrBlank_(prodValue_(values,headers,'Protein_Min')),proteinMax:prodNumberOrBlank_(prodValue_(values,headers,'Protein_Max')),fatMin:prodNumberOrBlank_(prodValue_(values,headers,'Fat_Min')),fatMax:prodNumberOrBlank_(prodValue_(values,headers,'Fat_Max')),carbsMin:prodNumberOrBlank_(prodValue_(values,headers,'Carbs_Min')),carbsMax:prodNumberOrBlank_(prodValue_(values,headers,'Carbs_Max'))};
}

function readProductionTraining_(sheet,dateKey,timezone,configuredUrl){
  if(!sheet)return{status:'UNAVAILABLE',date:dateKey,launchAuthorized:false};
  const headers=prodHeaderMap_(sheet),dateColumn=headers.Date||headers.Session_Date;
  if(!dateColumn)return{status:'SCHEMA_MISMATCH',date:dateKey,missingHeaders:['Date|Session_Date'],launchAuthorized:false};
  const rows=[],lastRow=sheet.getLastRow();
  if(lastRow>=2){const values=sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();values.forEach((row,index)=>{if(prodNormalizeDate_(row[dateColumn-1],timezone)!==dateKey)return;rows.push({row:index+2,sessionId:headers.Session_ID?String(row[headers.Session_ID-1]||'').trim():'',sessionType:headers.Session_Type?String(row[headers.Session_Type-1]||'').trim():'',sessionStatus:headers.Session_Status?String(row[headers.Session_Status-1]||'').trim():''});});}
  return{status:rows.length?'FOUND':'NONE',date:dateKey,sessions:rows,legacyUrlConfigured:Boolean(configuredUrl),launchAuthorized:false,note:'Training launch remains disabled in production RC until the current Training Mobile URL is independently verified.'};
}

function prodHeaderMap_(sheet){const lastColumn=sheet.getLastColumn();if(lastColumn<1)return{};const values=sheet.getRange(1,1,1,lastColumn).getDisplayValues()[0];return values.reduce((map,value,index)=>{const key=String(value||'').trim();if(key)map[key]=index+1;return map;},{});}
function prodFindDateRow_(sheet,column,dateKey,timezone){const lastRow=sheet.getLastRow();if(!column||lastRow<2)return 0;const values=sheet.getRange(2,column,lastRow-1,1).getValues();for(let i=values.length-1;i>=0;i-=1){if(prodNormalizeDate_(values[i][0],timezone)===dateKey)return i+2;}return 0;}
function prodFindExactRow_(sheet,column,expected){const lastRow=sheet.getLastRow();if(!column||lastRow<2)return 0;const values=sheet.getRange(2,column,lastRow-1,1).getDisplayValues();for(let i=values.length-1;i>=0;i-=1){if(String(values[i][0]||'').trim()===String(expected||'').trim())return i+2;}return 0;}
function prodNormalizeDate_(value,timezone){if(Object.prototype.toString.call(value)==='[object Date]'&&!isNaN(value))return Utilities.formatDate(value,timezone,'yyyy-MM-dd');const text=String(value||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const ru=text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return ru?`${ru[3]}-${ru[2]}-${ru[1]}`:text;}
function prodValue_(row,headers,name){const column=headers[name];return column?row[column-1]:'';}
function prodNumberOrBlank_(value){if(value===''||value===null||value===undefined)return'';const n=Number(value);return Number.isFinite(n)?n:'';}
