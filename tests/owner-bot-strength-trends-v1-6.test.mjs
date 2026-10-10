import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { applyStrengthTrendsPatch } from '../scripts/release/apply-owner-bot-strength-trends-v1-6.mjs';

const base = fs.readFileSync('automation/owner_bot_cockpit_v1_3.gs', 'utf8');
const code = applyStrengthTrendsPatch(base);
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
vm.createContext(context);
vm.runInContext(code, context);
const call = expr => vm.runInContext(expr, context);

function closure(date){
  return {Date:date,Day_ID:'D-'+date.split('.').reverse().join(''),Close_Request:'REQUESTED',Close_Readiness:'READY',Blocking_Issues:'',Closed_At:date+' 22:00',Duplicate_Count:'0',Open_QA_Count:'0'};
}
function session(id,date,type='A',status='CLOSED'){
  return {Session_ID:id,Date:date,Session_Type:type,Actual_Duration:'70',Plan_Status:'ON_PLAN',Session_Status:status,Duplicate_Flag:''};
}
function set(id,sid,name,category,type,weight,reps,rir,extra={}){
  return {Set_ID:id,Session_ID:sid,Exercise_Name_Original:extra.original||name,Exercise_Name_Normalized:name,Exercise_Catalog_ID:extra.catalog||'',Exercise_Category:category,Set_Type:type,Weight_Kg:String(weight).replace('.',','),Reps:String(reps),RIR:rir===null?'':String(rir).replace('.',','),Duplicate_Flag:extra.duplicate||''};
}
function bundle(){
  const dates=['01.10.2026','02.10.2026','03.10.2026','04.10.2026','05.10.2026','06.10.2026','07.10.2026','08.10.2026'];
  const sessions=[
    session('S1',dates[0],'A'), session('S2',dates[1],'B'), session('S3',dates[2],'C'), session('S4',dates[3],'A'),
    session('S5',dates[4],'B'), session('S6',dates[5],'C'), session('S7',dates[6],'B'), session('S8',dates[7],'C'),
    session('OUT','09.10.2026','A','OPEN')
  ];
  const sets=[
    set('B1','S1','COMPETITION_BENCH_PRESS','BENCH','WORKING',80,6,4,{original:'Соревновательный жим'}),
    set('B2','S4','COMPETITION_BENCH_PRESS','BENCH','WORKING',90,5,3,{original:'Соревновательный жим'}),
    set('B3','S6','COMPETITION_BENCH_PRESS','BENCH','WORKING',95,5,2,{original:'Соревновательный жим'}),
    set('BW','S4','COMPETITION_BENCH_PRESS','BENCH','WARMUP',120,1,10,{original:'Соревновательный жим'}),
    set('BT','S8','COMPETITION_BENCH_PRESS','BENCH','TECHNIQUE',125,1,0,{original:'Соревновательный жим'}),
    set('L1','S2','LARSEN_PRESS','BENCH','WORKING',62.5,8,4,{original:'Жим Ларсена'}),
    set('L2','S5','LARSEN_PRESS','BENCH','WORKING',70,8,3,{original:'Жим Ларсена'}),
    set('SQ1','S3','BARBELL_BACK_SQUAT','SQUAT','WORKING',100,8,4,{original:'Присед со штангой'}),
    set('SQ2','S8','BARBELL_BACK_SQUAT','SQUAT','WORKING',110,8,4,{original:'Присед со штангой'}),
    set('R1','S2','ROMANIAN_DEADLIFT','HINGE','WORKING',70,8,4,{original:'Румынская тяга'}),
    set('R2','S7','ROMANIAN_DEADLIFT','HINGE','WORKING',80,8,3,{original:'Румынская тяга'}),
    set('ACC','S4','DUMBBELL_BENCH_PRESS','BENCH','ACCESSORY',50,15,0,{original:'Жим гантелей'}),
    set('DUP','S4','COMPETITION_BENCH_PRESS','BENCH','WORKING',200,1,0,{original:'Соревновательный жим',duplicate:'DUP'}),
    set('OUT1','OUT','COMPETITION_BENCH_PRESS','BENCH','WORKING',200,1,0,{original:'Соревновательный жим'})
  ];
  return {
    closures:dates.map(closure),
    daily:dates.map((d,i)=>({Day_ID:'D'+i,Date:d,Day_Status:'CLOSED',Morning_Weight:String(75+i*.1).replace('.',','),Sleep_Hours:'7.5',Readiness:'9',Shoulder_Pain:'0',Elbow_Pain:'0',Other_Pain:'0',Duplicate_Flag:''})),
    nutrition:dates.map((d,i)=>({Day_ID:'N'+i,Date:d,Status:'CLOSED',Calories_Min:'3200',Calories_Max:'3400',Protein_Min:'165',Protein_Max:'175',Fat_Min:'75',Fat_Max:'85',Carbs_Min:'450',Carbs_Max:'490',Duplicate_Flag:''})),
    sessions, sets,
    measurements:[{Measurement_ID:'M1',Date:'01.10.2026',Comparable:'YES',Duplicate_Flag:''}]
  };
}

test('patch upgrades v1.5 to v1.6, is syntactically valid and idempotent',()=>{
  assert.match(code,/version: '1\.6\.0'/);
  assert.match(code,/setsSheet: 'TRAINING_SETS'/);
  assert.match(code,/rformOwnerBotV16StrengthTrends_/);
  assert.doesNotThrow(()=>new Function(code));
  assert.equal(applyStrengthTrendsPatch(code),code);
});

test('partial v1.6 materialization fails closed',()=>{
  const partial=base.replace("version: '1.5.0'","version: '1.6.0'");
  assert.throws(()=>applyStrengthTrendsPatch(partial),/partial v1\.6 materialization/);
});

test('report model keeps only set rows belonging to CLOSED accepted sessions and rejects duplicate rows',()=>{
  context.bundle=bundle();
  const model=call(`rformOwnerBotV13ReportModel_('01.10.2026','08.10.2026',bundle,'10.10.2026')`);
  assert.equal(model.training.sessions,8);
  assert.equal(model.training.sets.some(x=>x.Set_ID==='OUT1'),false);
  assert.equal(model.training.sets.some(x=>x.Set_ID==='DUP'),false);
  assert.equal(model.training.sets.some(x=>x.Set_ID==='B3'),true);
});

test('strength trend engine separates variants and selects the four repeated primary strength exercises',()=>{
  context.bundle=bundle();
  const trends=call(`rformOwnerBotV16StrengthTrends_(rformOwnerBotV13ReportModel_('01.10.2026','08.10.2026',bundle,'10.10.2026'))`);
  const labels=Array.from(trends,x=>x.label);
  assert.deepEqual(labels,['Соревновательный жим','Жим Ларсена','Присед со штангой','Румынская тяга']);
  assert.equal(trends[0].exposures.length,3);
  assert.equal(trends[0].setCount,3);
  assert.equal(trends[0].peakWeight,95);
  assert.ok(trends[0].deltaPct>9 && trends[0].deltaPct<11);
  assert.equal(trends[0].trend,'UP');
});

test('warm-up, technique and accessory sets do not distort strength trend metrics',()=>{
  context.bundle=bundle();
  const bench=call(`rformOwnerBotV16StrengthTrends_(rformOwnerBotV13ReportModel_('01.10.2026','08.10.2026',bundle,'10.10.2026'))[0]`);
  assert.equal(bench.peakWeight,95);
  assert.equal(bench.totalVolume,80*6+90*5+95*5);
  assert.ok(bench.averageRir>2 && bench.averageRir<4.1);
});

test('analytical report includes exercise-level strength trends with observed sets, e1RM estimate and tonnage',()=>{
  context.bundle=bundle();
  const text=call(`rformOwnerBotV15RenderAnalyticalReport_(rformOwnerBotV15AnalysisModel_(rformOwnerBotV13ReportModel_('01.10.2026','08.10.2026',bundle,'10.10.2026'))).text`);
  assert.match(text,/СИЛОВЫЕ ТРЕНДЫ/);
  assert.match(text,/Соревновательный жим · 3 сесс\./);
  assert.match(text,/Жим Ларсена · 2 сесс\./);
  assert.match(text,/Присед со штангой · 2 сесс\./);
  assert.match(text,/Румынская тяга · 2 сесс\./);
  assert.match(text,/e1RM≈/);
  assert.match(text,/тоннаж/);
  assert.doesNotMatch(text,/Жим гантелей ·/);
});

test('single exposure is allowed but explicitly has insufficient trend points',()=>{
  const single={training:{rows:[session('ONE','01.10.2026','A')],sets:[set('ONE1','ONE','OVERHEAD_PRESS','PRESS','WORKING',50,5,2,{original:'Жим стоя'})]}};
  context.single=single;
  const trends=call(`rformOwnerBotV16StrengthTrends_(single)`);
  assert.equal(trends.length,1);
  assert.equal(trends[0].trend,'INSUFFICIENT');
  const lines=call(`rformOwnerBotV16RenderStrengthTrends_(rformOwnerBotV16StrengthTrends_(single))`);
  assert.match(Array.from(lines).join('\n'),/недостаточно точек/);
});
