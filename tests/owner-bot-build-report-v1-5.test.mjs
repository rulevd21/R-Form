import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { applyBuildReportPatch } from '../scripts/release/apply-owner-bot-build-report-v1-5.mjs';

const base = fs.readFileSync('automation/owner_bot_cockpit_v1_3.gs', 'utf8');
const code = applyBuildReportPatch(base);
const context = {
  console, Date, Set, Number, String, JSON, Math, Object, Array, RegExp,
  SpreadsheetApp: {openById(){throw new Error('not used');}},
  Utilities: {formatDate(){return '10.10.2026';}},
  RFORM_OWNER_BOT_V1: {spreadsheetId:'TEST',props:{token:'token',apiSecret:'secret'}},
  rformOwnerBotV1ReadyItems_(){return[];}, rformOwnerBotV1MaterialSection_(){return'work';},
  rformOwnerBotV1DateSort_(){return 0;}, rformOwnerBotV1Sha256Hex_(){return 'a'.repeat(64);},
  rformOwnerBotV1SendOwnerText_(){return {ok:true};}, rformOwnerBotV1WorkspaceTrusted_(){return true;},
  rformOwnerBotV1RequireProperty_(){return 'TEST';}, rformOwnerBotV1Telegram_(){return {ok:true};},
  rformOwnerBotV1ActionsEnabled_(){return true;}, rformOwnerBotV1ApiPost_(){return {ok:true};},
  rformOwnerBotV1RandomHex_(){return 'abcd';}, rformOwnerBotV1HmacBase64Url_(){return 'sig';},
  PropertiesService:{getScriptProperties(){return {getProperty(){return 'TEST';}};}}
};
vm.createContext(context); vm.runInContext(code, context);
const call = expr => vm.runInContext(expr, context);

function closure(date){return {Date:date,Day_ID:'D-'+date.split('.').reverse().join(''),Close_Request:'REQUESTED',Close_Readiness:'READY',Blocking_Issues:'',Closed_At:date+' 22:00',Duplicate_Count:'0',Open_QA_Count:'0'};}
function bundle(openLast=false){
  const dates=['04.10.2026','05.10.2026','06.10.2026','07.10.2026','08.10.2026','09.10.2026','10.10.2026'];
  const closures=dates.map(closure); if(openLast) closures[6]={...closures[6],Close_Request:'',Close_Readiness:'OPEN',Closed_At:''};
  const used=openLast?dates.slice(0,6):dates;
  return {closures,
    daily:used.map((d,i)=>({Day_ID:'D'+i,Date:d,Day_Status:'CLOSED',Morning_Weight:String(75+i*.1).replace('.',','),Sleep_Hours:'7.5',Readiness:'9',Shoulder_Pain:'0',Elbow_Pain:'0',Other_Pain:'0',Duplicate_Flag:''})),
    nutrition:used.map((d,i)=>({Day_ID:'N'+i,Date:d,Status:'CLOSED',Calories_Min:'3200',Calories_Max:'3400',Protein_Min:'165',Protein_Max:'175',Fat_Min:'75',Fat_Max:'85',Carbs_Min:'450',Carbs_Max:'490',Duplicate_Flag:''})),
    sessions:[{Session_ID:'A',Date:'05.10.2026',Session_Type:'A',Actual_Duration:'75',Plan_Status:'ABOVE_PLAN',Session_Status:'CLOSED',Duplicate_Flag:''},{Session_ID:'B',Date:'07.10.2026',Session_Type:'B',Actual_Duration:'70',Plan_Status:'BELOW_PLAN',Session_Status:'CLOSED',Duplicate_Flag:''}],
    measurements:[{Measurement_ID:'M1',Date:'04.10.2026',Comparable:'YES',Duplicate_Flag:''}]
  };
}

test('patch upgrades candidate to v1.5 and remains syntactically valid',()=>{
  assert.match(code,/version: '1\.5\.0'/); assert.doesNotThrow(()=>new Function(code));
});

test('ready summary offers Build Report for exact range',()=>{
  context.bundle=bundle(false);
  const r=call(`rformOwnerBotV13RenderReport_(rformOwnerBotV13ReportModel_('04.10.2026','10.10.2026',bundle,'10.10.2026'))`);
  assert.equal(r.keyboard[0][0].text,'Сформировать отчёт');
  assert.equal(r.keyboard[0][0].callback_data,'oc:rp:b:20261004:20261010');
});

test('incomplete period offers draft build and preserves incomplete status',()=>{
  context.bundle=bundle(true);
  const m=call(`rformOwnerBotV13ReportModel_('04.10.2026','10.10.2026',bundle,'10.10.2026')`);
  const r=call(`rformOwnerBotV13RenderReport_(rformOwnerBotV13ReportModel_('04.10.2026','10.10.2026',bundle,'10.10.2026'))`);
  assert.equal(m.status,'DRAFT_ONLY'); assert.equal(r.keyboard[0][0].text,'Сформировать черновик');
});

test('analytical report separates facts, trends, gaps and next checks',()=>{
  context.bundle=bundle(false);
  const text=call(`rformOwnerBotV15RenderAnalyticalReport_(rformOwnerBotV15AnalysisModel_(rformOwnerBotV13ReportModel_('04.10.2026','10.10.2026',bundle,'10.10.2026'))).text`);
  assert.match(text,/ФАКТЫ/); assert.match(text,/ТРЕНДЫ/); assert.match(text,/ПРОБЕЛЫ/); assert.match(text,/СЛЕДУЮЩИЕ ПРОВЕРКИ/);
  assert.match(text,/ABOVE 1 · ON 0 · BELOW 1/); assert.match(text,/Closure: 7\/7/);
});

test('draft analytical report explicitly marks incomplete coverage',()=>{
  context.bundle=bundle(true);
  const text=call(`rformOwnerBotV15RenderAnalyticalReport_(rformOwnerBotV15AnalysisModel_(rformOwnerBotV13ReportModel_('04.10.2026','10.10.2026',bundle,'10.10.2026'))).text`);
  assert.match(text,/Режим: черновик · неполное покрытие/); assert.match(text,/Закрыть или сверить 1 дней/);
});

test('build/report callbacks remain below Telegram 64-byte callback_data limit',()=>{
  const callbacks=['oc:rp:b:20260910:20261009','oc:rp:v:20260910:20261009'];
  callbacks.forEach(x=>assert.ok(Buffer.byteLength(x,'utf8')<=64));
});
