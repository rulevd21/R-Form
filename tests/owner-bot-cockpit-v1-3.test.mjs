import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { findHardcodedChannelIds } from '../scripts/apps-script/no-hardcoded-telegram-chat-id.mjs';

const code = fs.readFileSync('automation/owner_bot_cockpit_v1_3.gs', 'utf8');
const sent = [];
let sheetData = {
  DECISION_REVIEWS: [['Review_ID']],
  CONTENT_EXPERIMENTS: [['Hypothesis_ID']],
  CONTENT_QUEUE: [
    ['Content_ID','Date','Publication_Status','Current_Stage','Public_Data_Allowed','Duplicate_Flag','Publish_Error','Blocking_Issue','Telegram_Post_Mode','Telegram_Text','Telegram_Visual_URL','Updated_At'],
    ['CNT-Q1','10.10.2026','PLANNED','OWNER_FINAL_PREVIEW','YES','','','','TEXT_ONLY','Тест','','10.10.2026 10:00']
  ],
  DATA_EVENTS: [
    ['Event_ID','Date','Fact','Content_Value_Score','Manual_Gate','Status','Owner_Action','Owner_Review_Status'],
    ['EVT-Q1','10.10.2026','Факт','80','NO','DATA_READY','NONE','']
  ],
  DAY_CLOSURE: [
    ['Day_ID','Date','Close_Request','Close_Readiness','Blocking_Issues','Closed_At','Duplicate_Count','Open_QA_Count'],
    ['D-20261010','10.10.2026','','OPEN','','','','']
  ],
  DAILY: [
    ['Day_ID','Date','Morning_Weight','Day_Status','Duplicate_Flag'],
    ['D-20261010','10.10.2026','75,3','OPEN','']
  ],
  NUTRITION_DAILY: [
    ['Day_ID','Date','Status','Calories_Min','Calories_Max','Protein_Min','Protein_Max','Fat_Min','Fat_Max','Carbs_Min','Carbs_Max','Duplicate_Flag']
  ],
  TRAINING_SESSIONS: [
    ['Session_ID','Day_ID','Date','Session_Type','Actual_Duration','Plan_Status','Session_Status','Duplicate_Flag']
  ],
  MEASUREMENTS: [
    ['Measurement_ID','Date','Metric','Value','Comparable','Duplicate_Flag']
  ]
};

function spreadsheetService() {
  return {
    openById() {
      return {
        getSheetByName(name) {
          const values = sheetData[name];
          if (!values) return null;
          return {
            getLastRow() { return values.length; },
            getDataRange() { return {getDisplayValues() { return values; }}; }
          };
        }
      };
    }
  };
}

const context = {
  console,
  Date,
  Set,
  Number,
  String,
  JSON,
  Math,
  Object,
  Array,
  RegExp,
  SpreadsheetApp: spreadsheetService(),
  Utilities: {
    formatDate(_date, _tz, format) {
      if (format === 'yyyyMMdd') return '20261010';
      if (format === 'yyyy-MM-dd') return '2026-10-10';
      return '10.10.2026';
    }
  },
  RFORM_OWNER_BOT_V1: {spreadsheetId: 'TEST', props: {apiSecret: 'secret', token:'token'}},
  rformOwnerBotV1ReadyItems_(queue) { return queue.filter(x => x.__ready); },
  rformOwnerBotV1MaterialSection_(q) { return q.__section || 'work'; },
  rformOwnerBotV1ItemToken_() { return 'aaaaaaaaaaaaaaaa'; },
  rformOwnerBotV1MaterialTitle_(q) { return q.__title || q.Content_ID || 'Материал'; },
  rformOwnerBotV1DateSort_() { return 0; },
  rformOwnerBotV1Sha256Hex_(value) {
    return String(value).includes('EVT-GATE') ? 'bbbbbbbbbbbbbbbb' : 'cccccccccccccccc';
  },
  rformOwnerBotV1SendOwnerText_(text, extra) {
    sent.push({text: String(text), extra: extra || null});
    return {ok: true};
  },
  rformOwnerBotV1WorkspaceTrusted_() { return true; },
  rformOwnerBotV1RequireProperty_() { return 'TEST'; },
  rformOwnerBotV1Telegram_() { return {ok:true}; },
  rformOwnerBotV1ActionsEnabled_() { return true; },
  rformOwnerBotV1ApiPost_() { return {ok:true}; },
  rformOwnerBotV1RandomHex_() { return 'abcdabcdabcdabcd'; },
  rformOwnerBotV1HmacBase64Url_() { return 'sig'; },
  PropertiesService: {getScriptProperties() { return {getProperty(){return 'TEST';}}; }}
};
vm.createContext(context);
vm.runInContext(code, context);
const call = expr => vm.runInContext(expr, context);

function acceptedClosure(date) {
  const key = date.split('.').reverse().join('');
  return {Day_ID:'D-'+key,Date:date,Close_Request:'REQUESTED',Close_Readiness:'READY',Blocking_Issues:'',Closed_At:date+' 22:00',Duplicate_Count:'0',Open_QA_Count:'0'};
}

function reportBundle(openLast = true) {
  const dates = ['04.10.2026','05.10.2026','06.10.2026','07.10.2026','08.10.2026','09.10.2026','10.10.2026'];
  const closures = dates.map(acceptedClosure);
  if (openLast) closures[6] = {Day_ID:'D-20261010',Date:'10.10.2026',Close_Request:'',Close_Readiness:'OPEN',Blocking_Issues:'',Closed_At:'',Duplicate_Count:'0',Open_QA_Count:'0'};
  const acceptedDates = openLast ? dates.slice(0,6) : dates;
  const daily = acceptedDates.map((date,i)=>({Day_ID:'D-X'+i,Date:date,Morning_Weight:String(75.5-i*0.08).replace('.',','),Day_Status:'CLOSED',Duplicate_Flag:''}));
  const nutrition = acceptedDates.map((date,i)=>({Day_ID:'D-X'+i,Date:date,Status:'CLOSED',Calories_Min:'3200',Calories_Max:'3400',Protein_Min:'165',Protein_Max:'175',Fat_Min:'75',Fat_Max:'85',Carbs_Min:'450',Carbs_Max:'490',Duplicate_Flag:''}));
  const sessions = [
    {Session_ID:'S-A',Day_ID:'D-X1',Date:'05.10.2026',Session_Type:'A',Actual_Duration:'75',Plan_Status:'ABOVE_PLAN',Session_Status:'CLOSED',Duplicate_Flag:''},
    {Session_ID:'S-B',Day_ID:'D-X3',Date:'07.10.2026',Session_Type:'B',Actual_Duration:'70',Plan_Status:'ABOVE_PLAN',Session_Status:'CLOSED',Duplicate_Flag:''},
    {Session_ID:'S-C',Day_ID:'D-X5',Date:'09.10.2026',Session_Type:'C',Actual_Duration:'65',Plan_Status:'ABOVE_PLAN',Session_Status:'CLOSED',Duplicate_Flag:''}
  ];
  const measurements = [{Measurement_ID:'M1',Date:'04.10.2026',Metric:'WAIST_NAVEL',Value:'87',Comparable:'YES',Duplicate_Flag:''}];
  return {closures,daily,nutrition,sessions,measurements};
}

test('only explicit DATA_EVENTS owner gates are actionable', () => {
  assert.equal(call(`rformOwnerBotV13EventNeedsOwner_({Event_ID:'EVT-GATE',Status:'OWNER_GATE',Manual_Gate:'YES · OWNER',Owner_Action:'Approve'})`), true);
  assert.equal(call(`rformOwnerBotV13EventNeedsOwner_({Event_ID:'EVT-COVERED',Status:'ALREADY_IN_PIPELINE',Manual_Gate:'NO',Owner_Action:'NONE · covered'})`), false);
  assert.equal(call(`rformOwnerBotV13EventNeedsOwner_({Event_ID:'EVT-WEEKLY',Status:'OWNER_GATE',Manual_Gate:'YES',Owner_Action:'Choose',Owner_Review_Status:'WEEKLY'})`), false);
  assert.equal(call(`rformOwnerBotV13EventNeedsOwner_({Event_ID:'EVT-NONE',Status:'DATA_READY',Manual_Gate:'NO',Owner_Action:'NONE'})`), false);
});

test('closure becomes owner action only when ready, unblocked and not already requested', () => {
  assert.equal(call(`rformOwnerBotV13ClosureNeedsOwner_({close_readiness:'READY',blocking_issues:'',closed_at:'',close_request:''})`), true);
  assert.equal(call(`rformOwnerBotV13ClosureNeedsOwner_({close_readiness:'READY',blocking_issues:'missing data',closed_at:'',close_request:''})`), false);
  assert.equal(call(`rformOwnerBotV13ClosureNeedsOwner_({close_readiness:'READY',blocking_issues:'',closed_at:'10:00',close_request:''})`), false);
  assert.equal(call(`rformOwnerBotV13ClosureNeedsOwner_({close_readiness:'READY',blocking_issues:'',closed_at:'',close_request:'REQUESTED'})`), false);
});

test('closure-ready state appears as an owner decision when capacity is available', () => {
  const model = call(`rformOwnerBotV13CockpitModel_(
    {found:true,date:'10.10.2026',day_id:'D-20261010',close_readiness:'READY',blocking_issues:'',closed_at:'',close_request:''},
    {queue:[],events:[]}
  )`);
  assert.equal(model.owner_decision_total, 1);
  assert.equal(model.owner_decisions[0].kind, 'DAY_CLOSE');
});

test('cockpit caps visible owner decisions at three and prioritizes final preview', () => {
  const model = call(`rformOwnerBotV13CockpitModel_(
    {found:true,date:'10.10.2026',day_id:'D-20261010',close_readiness:'READY',blocking_issues:'',closed_at:'',close_request:''},
    {queue:[{Content_ID:'CNT-1',__ready:true,__title:'Готовый пост'}],events:[
      {Event_ID:'EVT-GATE',Status:'OWNER_GATE',Manual_Gate:'YES',Owner_Action:'Approve',Fact:'Факт',Content_Value_Score:'90'},
      {Event_ID:'EVT-GATE-2',Status:'OWNER_GATE',Manual_Gate:'YES',Owner_Action:'Approve',Fact:'Факт 2',Content_Value_Score:'80'}
    ]}
  )`);
  assert.equal(model.owner_decision_total, 4);
  assert.equal(model.owner_decisions.length, 3);
  assert.equal(model.owner_decisions[0].kind, 'CONTENT_PREVIEW');
  assert.ok(model.owner_decisions.every(x => ['CONTENT_PREVIEW','DAY_CLOSE','EVENT_GATE'].includes(x.kind)));
});

test('rendered cockpit exposes period report separately from Materials', () => {
  const rendered = call(`rformOwnerBotV13RenderCockpit_({
    date:'10.10.2026',closure:{found:true,close_readiness:'OPEN',blocking_issues:'missing meal'},
    event_counts:{total:5,owner_gate:0},queue_counts:{open:4,final_preview:0},
    owner_decision_total:0,owner_decisions:[]
  })`);
  assert.match(rendered.text, /Closure: OPEN · есть блокер/);
  assert.match(rendered.text, /DATA_EVENTS: 5 · решений владельца 0/);
  assert.match(rendered.text, /Ничего\. Система не требует решения владельца\./);
  assert.doesNotMatch(rendered.text, /missing meal/);
  assert.deepEqual(JSON.parse(JSON.stringify(rendered.keyboard)), [
    [{text:'Отчёт за период',callback_data:'oc:rp:m'}],
    [{text:'Обновить',callback_data:'oc:r'}],
    [{text:'Материалы',callback_data:'ow:menu'}]
  ]);
});

test('preset ranges resolve deterministic current week, month and trailing 30 days', () => {
  const week = call(`rformOwnerBotV13PresetRange_('week','10.10.2026')`);
  assert.equal(week.start, '04.10.2026');
  assert.equal(week.end, '10.10.2026');
  assert.equal(week.days, 7);
  const month = call(`rformOwnerBotV13PresetRange_('month','10.10.2026')`);
  assert.equal(month.start, '01.10.2026');
  assert.equal(month.end, '10.10.2026');
  const trailing = call(`rformOwnerBotV13PresetRange_('30','10.10.2026')`);
  assert.equal(trailing.start, '11.09.2026');
  assert.equal(trailing.days, 30);
});

test('range validation fails closed for invalid, future, reversed and overlong ranges', () => {
  assert.throws(() => call(`rformOwnerBotV13ValidateRange_('31.02.2026','10.10.2026','10.10.2026')`), /некорректную дату/);
  assert.throws(() => call(`rformOwnerBotV13ValidateRange_('10.10.2026','09.10.2026','10.10.2026')`), /начала позже/);
  assert.throws(() => call(`rformOwnerBotV13ValidateRange_('10.10.2026','11.10.2026','10.10.2026')`), /будущем/);
  assert.throws(() => call(`rformOwnerBotV13ValidateRange_('01.01.2025','10.10.2026','10.10.2026')`), /от 1 до 366/);
});

test('incomplete canonical closure keeps weekly report DRAFT_ONLY', () => {
  context.bundle = reportBundle(true);
  const model = call(`rformOwnerBotV13ReportModel_('04.10.2026','10.10.2026',bundle,'10.10.2026')`);
  assert.equal(model.status, 'DRAFT_ONLY');
  assert.equal(model.closure.closed, 6);
  assert.equal(model.closure.total, 7);
  assert.deepEqual(Array.from(model.closure.missing), ['10.10.2026']);
  assert.equal(model.training.sessions, 3);
  assert.equal(model.training.durationMinutes, 210);
  assert.equal(model.nutrition.closed, 6);
});

test('complete canonical closure makes selected period READY_FOR_REPORT_BUILD', () => {
  context.bundle = reportBundle(false);
  const model = call(`rformOwnerBotV13ReportModel_('04.10.2026','10.10.2026',bundle,'10.10.2026')`);
  assert.equal(model.status, 'READY_FOR_REPORT_BUILD');
  assert.equal(model.closure.closed, 7);
  assert.equal(model.closure.missing.length, 0);
  assert.equal(model.nutrition.closed, 7);
  assert.equal(model.weight.first.date, '04.10.2026');
  assert.equal(model.weight.last.date, '10.10.2026');
});

test('arbitrary date range is accepted and not coupled to week/month boundaries', () => {
  const range = call(`rformOwnerBotV13ValidateRange_('03.09.2026','21.09.2026','10.10.2026')`);
  assert.equal(range.days, 19);
  assert.equal(range.startKey, '20260903');
  assert.equal(range.endKey, '20260921');
});

test('calendar callbacks remain within Telegram callback_data limit and carry start/end context', () => {
  const model = call(`rformOwnerBotV13CalendarModel_('e','202610','20261004','10.10.2026')`);
  const keyboard = call(`rformOwnerBotV13CalendarKeyboard_(rformOwnerBotV13CalendarModel_('e','202610','20261004','10.10.2026'))`);
  const flat = JSON.parse(JSON.stringify(keyboard)).flat();
  assert.ok(flat.every(x => x.callback_data.length <= 64));
  assert.ok(flat.some(x => x.callback_data === 'oc:rp:day:e:20261010:20261004'));
  assert.ok(!flat.some(x => x.callback_data === 'oc:rp:day:e:20261003:20261004'));
  assert.equal(model.startKey, '20261004');
});

test('rendered period report shows exact range, readiness and gaps without mutations', () => {
  context.bundle = reportBundle(true);
  const rendered = call(`rformOwnerBotV13RenderReport_(rformOwnerBotV13ReportModel_('04.10.2026','10.10.2026',bundle,'10.10.2026'))`);
  assert.match(rendered.text, /04\.10\.2026 – 10\.10\.2026 · 7 дн\./);
  assert.match(rendered.text, /Статус: DRAFT_ONLY/);
  assert.match(rendered.text, /Closure: 6\/7/);
  assert.match(rendered.text, /Closure: 10\.10\.2026/);
  assert.match(rendered.text, /Тренировки: 3 закрыто · 210 мин/);
});

test('cockpit reads Content Queue directly from canonical Master Data', () => {
  const rows = call(`rformOwnerBotV13ReadQueue_()`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Content_ID, 'CNT-Q1');
  assert.equal(rows[0].Current_Stage, 'OWNER_FINAL_PREVIEW');
  assert.doesNotMatch(code, /rformOwnerBotV1ApiRead_\(\)/);
});

test('/today queue read failure is owner-visible and does not leak upstream error text', () => {
  sent.length = 0;
  const original = context.SpreadsheetApp;
  context.SpreadsheetApp = {openById() { throw new Error('secret https://private.example/token'); }};
  assert.doesNotThrow(() => call(`rformOwnerBotV13SendCockpit_()`));
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Код: CONTENT_QUEUE_READ/);
  assert.match(sent[0].text, /Данные не изменены/);
  assert.doesNotMatch(sent[0].text, /private\.example|secret|token/i);
  context.SpreadsheetApp = original;
});

test('automation sources contain no hardcoded numeric Telegram channel IDs', () => {
  const automationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'automation');
  const offenders = findHardcodedChannelIds(automationDir);
  assert.deepEqual(offenders, [], `Hardcoded numeric Telegram channel IDs found: ${offenders.join(', ')}`);
});

test('cockpit includes only sufficiently observed experiment/decision actions and caps across types',()=>{
  const bundle={queue:[],events:[],decision_reviews:[
    {Review_ID:'R-MISSING',Outcome:'INSUFFICIENT_DATA',Next_Decision_Required:'YES',Status:'OPEN'},
    {Review_ID:'R-FAILED',Decision_ID:'D',Outcome:'REJECTED',Next_Decision_Required:'YES',Status:'CLOSED'}],
    experiments:[
      {Hypothesis_ID:'H01',Status:'REVIEW_REQUIRED',Decision:'DO_NOT_CONCLUDE'},
      {Hypothesis_ID:'H02',Status:'READY_FOR_REVIEW',Result:'OBSERVED_METRICS_READY: {}',Decision:'OWNER_REVIEW_REQUIRED'},
      {Hypothesis_ID:'H03',Status:'READY_FOR_REVIEW',Result:'OBSERVED_METRICS_READY: {}',Decision:'OWNER_REVIEW_REQUIRED'},
      {Hypothesis_ID:'H04',Status:'READY_FOR_REVIEW',Result:'OBSERVED_METRICS_READY: {}',Decision:'OWNER_REVIEW_REQUIRED'}]};
  const model=context.rformOwnerBotV13CockpitModel_({found:false},bundle);
  assert.equal(model.owner_decision_total,4);assert.equal(model.owner_decisions.length,3);
  assert.equal(model.owner_decisions[0].kind,'DECISION_REVIEW');
  assert.ok(model.owner_decisions.every(x=>x.id!=='R-MISSING' && x.id!=='H01'));
});

test('actionable reviews for one decision occupy one cockpit slot using the latest failure',()=>{
  const bundle={queue:[],events:[],experiments:[],decision_reviews:[
    {Review_ID:'REV-OLD',Decision_ID:'DEC-SAME',Evidence_Period:'16.10.2026',Outcome:'PARTIAL',Status:'CLOSED',Next_Decision_Required:'YES'},
    {Review_ID:'REV-NEW',Decision_ID:'DEC-SAME',Evidence_Period:'23.10.2026',Outcome:'REJECTED',Status:'CLOSED',Next_Decision_Required:'YES'},
    {Review_ID:'REV-OTHER',Decision_ID:'DEC-OTHER',Evidence_Period:'16.10.2026',Outcome:'PARTIAL',Status:'CLOSED',Next_Decision_Required:'YES'}
  ]};
  const model=context.rformOwnerBotV13CockpitModel_({found:false},bundle);
  assert.equal(model.owner_decision_total,2);
  const same=model.owner_decisions.filter(x=>x.decision_id==='DEC-SAME');
  assert.equal(same.length,1);assert.equal(same[0].id,'REV-NEW');
});
