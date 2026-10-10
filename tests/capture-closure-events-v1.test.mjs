import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('automation/content_event_detector_v0_3.gs','utf8');
class Sheet {
  constructor(rows){ this.rows=rows; }
  getLastRow(){ return this.rows.length; }
  getLastColumn(){ return this.rows[0]?.length || 0; }
  getDataRange(){ return {getDisplayValues:()=>this.rows.map(r=>r.slice())}; }
}
const sheets = {};
const ss = { getSheetByName(name){ return sheets[name] || null; } };
const context = {
  console, Date, Math, Number, String, JSON, Object, Array, RegExp,
  SpreadsheetApp:{openById(){ return ss; }},
  Utilities:{getUuid(){return 'uuid';}}
};
vm.createContext(context);
vm.runInContext(code, context);
const call = expr => vm.runInContext(expr, context);

function setSheet(name, rows){ sheets[name]=new Sheet(rows); }
function baseSheets(){
  setSheet('DAY_CLOSURE', [['Closure_ID','Day_ID','Date','Close_Request','Close_Readiness','Blocking_Issues','Closed_At','Duplicate_Count','Open_QA_Count']]);
  setSheet('DAILY', [['Day_ID','Date','Day_Type','Morning_Weight','Weight_7D_Average','Sleep_Hours','Sleep_Quality','Readiness','Shoulder_Pain','Elbow_Pain','Other_Pain','Calories_Plan_Min','Calories_Plan_Max','Protein_Plan_Min','Protein_Plan_Max','Fat_Plan_Min','Fat_Plan_Max','Carbs_Plan_Min','Carbs_Plan_Max','Calories_Fact_Min','Calories_Fact_Max','Protein_Fact_Min','Protein_Fact_Max','Fat_Fact_Min','Fat_Fact_Max','Carbs_Fact_Min','Carbs_Fact_Max','Day_Status','Daily_Conclusion','Duplicate_Flag']]);
  setSheet('NUTRITION_DAILY', [['Day_ID','Date','Meal_Count','Calories_Min','Calories_Max','Protein_Min','Protein_Max','Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Plan_Status','Main_Deviation','Nutrition_Decision','Status','Closed_At','Duplicate_Flag']]);
  setSheet('TRAINING_SESSIONS', [['Session_ID','Day_ID','Date','Session_Type','Main_Result','Plan_Status','Technique_Status','Pain_After','Session_Conclusion','Session_Decision','Session_Status','Duplicate_Flag']]);
  setSheet('MEASUREMENTS', [['Measurement_ID','Date','Metric','Value','Unit','Measurement_Condition','Comparable','Comment','Record_Key','Duplicate_Flag']]);
  setSheet('DECISIONS', [['Decision_ID','Decision_Date','Area','Signal','Previous_Rule','New_Rule','Status','Effective_From','Effective_To']]);
  setSheet('CONTENT_QUEUE', [['Content_ID','Session_ID','Proof_Source','Main_Training_Fact','Decision','Work_Packet_URL','Publication_Status','Pipeline_Status']]);
}

test('closure gate requires request, READY, no blockers and Closed_At', () => {
  baseSheets();
  setSheet('DAY_CLOSURE', [
    sheets.DAY_CLOSURE.rows[0],
    ['C1','D-1','10.10.2026','REQUESTED','READY','','10.10.2026 22:00','0','0'],
    ['C2','D-2','11.10.2026','REQUESTED','READY','missing','','0','0'],
    ['C3','D-3','12.10.2026','','READY','','12.10.2026 22:00','0','0']
  ]);
  const idx = call('rformContentV04BuildClosureIndex_(SpreadsheetApp.openById("x"))'); context.idx = idx;
  assert.equal(call('rformContentV04ClosureAccepted_(idx,"D-1","10.10.2026")'), true);
  assert.equal(call('rformContentV04ClosureAccepted_(idx,"D-2","11.10.2026")'), false);
  assert.equal(call('rformContentV04ClosureAccepted_(idx,"D-3","12.10.2026")'), false);
});

test('open capture creates no day or nutrition event', () => {
  baseSheets();
  setSheet('DAILY', [sheets.DAILY.rows[0], ['D-20261010','10.10.2026','REST','75.3','75.2','8.5','9','9','0','0','0','3300','3300','170','170','85','85','465','465','','','','','','','','','OPEN','open','']]);
  setSheet('NUTRITION_DAILY', [sheets.NUTRITION_DAILY.rows[0], ['D-20261010','10.10.2026','1','500','600','20','25','10','15','90','100','','','','OPEN','','']]);
  context.since = new Date(2026,9,1); context.start = new Date(2026,9,10);
  const closure = call('rformContentV04BuildClosureIndex_(SpreadsheetApp.openById("x"))'); context.closure=closure;
  const daily = call('rformContentV04BuildDailyIndex_(SpreadsheetApp.openById("x"))'); context.daily=daily;
  assert.equal(call('rformContentV04DetectClosedDays_(SpreadsheetApp.openById("x"),since,start,closure)').length,0);
  assert.equal(call('rformContentV04DetectClosedNutrition_(SpreadsheetApp.openById("x"),since,start,closure,daily)').length,0);
});

test('accepted closed day deterministically emits DAY and NUTRITION events', () => {
  baseSheets();
  setSheet('DAY_CLOSURE', [sheets.DAY_CLOSURE.rows[0], ['C','D-20261010','10.10.2026','REQUESTED','READY','','10.10.2026 22:00','0','0']]);
  setSheet('DAILY', [sheets.DAILY.rows[0], ['D-20261010','10.10.2026','REST','75.3','75.2','8.5','9','9','0','0','0','3300','3300','170','170','85','85','465','465','3200','3250','165','172','75','82','450','460','CLOSED','Закрытый день без проблем','']]);
  setSheet('NUTRITION_DAILY', [sheets.NUTRITION_DAILY.rows[0], ['D-20261010','10.10.2026','5','3200','3250','165','172','75','82','450','460','','В пределах рабочего коридора','Без коррекции','CLOSED','10.10.2026 22:00','']]);
  context.since = new Date(2026,9,1); context.start = new Date(2026,9,10);
  const closure = call('rformContentV04BuildClosureIndex_(SpreadsheetApp.openById("x"))'); context.closure=closure;
  const daily = call('rformContentV04BuildDailyIndex_(SpreadsheetApp.openById("x"))'); context.daily=daily;
  const days = call('rformContentV04DetectClosedDays_(SpreadsheetApp.openById("x"),since,start,closure)');
  const nutrition = call('rformContentV04DetectClosedNutrition_(SpreadsheetApp.openById("x"),since,start,closure,daily)');
  assert.equal(days.length,1); assert.equal(days[0].eventId,'EVT-10102026-DAY-D-20261010'); assert.equal(days[0].status,'AGGREGATE_ONLY');
  assert.equal(nutrition.length,1); assert.equal(nutrition[0].eventId,'EVT-10102026-NUTRITION-D-20261010'); assert.equal(nutrition[0].status,'AGGREGATE_ONLY');
});

test('session after lifecycle start is held until day closure, then emits one stable event', () => {
  baseSheets();
  setSheet('TRAINING_SESSIONS', [sheets.TRAINING_SESSIONS.rows[0], ['S-20261010-A','D-20261010','10.10.2026','A','80×5×4 RIR 4/4/4/3','WITHIN_PLAN','GOOD','0','Выполнено','Сохранить курс','CLOSED','']]);
  context.since=new Date(2026,9,1);context.start=new Date(2026,9,10);context.sig={};
  let closure=call('rformContentV04BuildClosureIndex_(SpreadsheetApp.openById("x"))');context.closure=closure;
  assert.equal(call('rformContentV04DetectRoutineSessions_(SpreadsheetApp.openById("x"),since,start,closure,sig)').length,0);
  setSheet('DAY_CLOSURE', [sheets.DAY_CLOSURE.rows[0], ['C','D-20261010','10.10.2026','REQUESTED','READY','','10.10.2026 22:00','0','0']]);
  closure=call('rformContentV04BuildClosureIndex_(SpreadsheetApp.openById("x"))');context.closure=closure;
  const rows=call('rformContentV04DetectRoutineSessions_(SpreadsheetApp.openById("x"),since,start,closure,sig)');
  assert.equal(rows.length,1); assert.equal(rows[0].eventId,'EVT-10102026-SESSION-S-20261010-A'); assert.equal(rows[0].eventType,'TRAINING_COMPLETED');
});

test('significant training event keeps legacy ID and wins over routine event', () => {
  baseSheets();
  setSheet('DAY_CLOSURE', [sheets.DAY_CLOSURE.rows[0], ['C','D-20261010','10.10.2026','REQUESTED','READY','','10.10.2026 22:00','0','0']]);
  setSheet('TRAINING_SESSIONS', [sheets.TRAINING_SESSIONS.rows[0], ['S-20261010-A','D-20261010','10.10.2026','A','90×5 RIR0','ABOVE_PLAN','GOOD','0','Выполнено','Решение','CLOSED','']]);
  context.since=new Date(2026,9,1);context.start=new Date(2026,9,10);
  const closure=call('rformContentV04BuildClosureIndex_(SpreadsheetApp.openById("x"))');context.closure=closure;
  const sig=call('rformContentV04DetectSessions_(SpreadsheetApp.openById("x"),since)');
  assert.equal(sig.length,1); assert.equal(sig[0].eventId,'EVT-10102026-SESSION-S-20261010-A');
  context.sigMap={[sig[0].eventId]:true};
  const routine=call('rformContentV04DetectRoutineSessions_(SpreadsheetApp.openById("x"),since,start,closure,sigMap)');
  assert.equal(routine.length,0);
});

test('measurements require comparable rows and accepted day closure', () => {
  baseSheets();
  setSheet('DAY_CLOSURE', [sheets.DAY_CLOSURE.rows[0], ['C','D-20261010','10.10.2026','REQUESTED','READY','','10.10.2026 22:00','0','0']]);
  setSheet('MEASUREMENTS', [sheets.MEASUREMENTS.rows[0],
    ['M1','03.10.2026','WAIST_NAVEL','87','cm','STANDARD','YES','','k1',''],
    ['M2','10.10.2026','WAIST_NAVEL','85','cm','STANDARD','YES','','k2',''],
    ['M3','10.10.2026','CHEST','103','cm','STANDARD','YES','','k3','']
  ]);
  context.since=new Date(2026,9,1);context.start=new Date(2026,9,10);
  const closure=call('rformContentV04BuildClosureIndex_(SpreadsheetApp.openById("x"))');context.closure=closure;
  const rows=call('rformContentV04DetectMeasurements_(SpreadsheetApp.openById("x"),since,start,closure)');
  assert.equal(rows.length,1); assert.equal(rows[0].eventType,'MEASUREMENT_CHANGE'); assert.equal(rows[0].status,'AGGREGATE_TO_WEEKLY');
});

test('event deduplication is deterministic by Event_ID', () => {
  context.es=[{eventId:'E1',fact:'first'},{eventId:'E1',fact:'second'},{eventId:'E2',fact:'x'}];
  const out=call('rformContentV04UniqueEvents_(es)');
  assert.equal(out.length,2);assert.equal(out[0].fact,'first');
});

test('legacy trigger handler and observability contract remain present', () => {
  assert.match(code, /function rformContentEventDetectorWriteV03\(e\)/);
  assert.match(code, /message:'RFORM_DETECTOR_RUN'/);
  assert.match(code, /observability_version:'0\.1'/);
  assert.match(code, /lifecycle_version:'1\.0'/);
  assert.match(code, /lifecycleStart: '10\.10\.2026'/);
});
