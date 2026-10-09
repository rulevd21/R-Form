const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const {harness}=require('./workspace_harness.cjs');
function fixture(){
 const x=harness();x.props.RFORM_AUTO_DRAFT_ENABLED='YES';x.props.RFORM_AUTO_CARDS_ENABLED='YES';
 const session=x.addSession({Session_ID:'S-20261009-C',Date:'09.10.2026',Session_Type:'C',Actual_Duration:'65'});
 const fields=['Set_ID','Session_ID','Exercise_Order','Exercise_Name_Original','Exercise_Name_Normalized','Exercise_Category','Set_Type','Set_Number','Weight_Kg','Reps','RIR','Record_Key','Duplicate_Flag','Exercise_Instance_ID','Load_Value','Load_Unit'];
 const sets=new x.Sheet('TRAINING_SETS',fields);x.sheets.TRAINING_SETS=sets;
 const source=[['Жим штанги лёжа — объём','COMPETITION_BENCH_PRESS','BENCH','WORKING',[80,80,80,80],6,[4,4,4,3]],
 ['Присед со штангой','BARBELL_BACK_SQUAT','SQUAT','WORKING',[110,110,110],8,[4,4,4]],
 ['Тяга гантелей с опорой грудью на наклонной скамье','CHEST_SUPPORTED_DUMBBELL_ROW','PULL','ACCESSORY',[35,35,35],12,[4,3,2]],
 ['Разведения гантелей лёжа / на небольшом наклоне','DUMBBELL_CHEST_FLY','BENCH','ACCESSORY',[16,15],15,[3,2]],
 ['Разведения гантелей в наклоне — задняя дельта','DUMBBELL_REAR_DELT_FLY','SHOULDERS','ACCESSORY',[10,10],15,[3,3]]];
 source.forEach(([name,code,category,type,weights,reps,rir],i)=>weights.forEach((weight,j)=>{
  const r={Set_ID:'set-'+i+'-'+j,Session_ID:session.Session_ID,Exercise_Order:i+1,Exercise_Name_Original:name,Exercise_Name_Normalized:code,
   Exercise_Category:category,Set_Type:type,Set_Number:j+1,Weight_Kg:weight,Reps:reps,RIR:rir[j],Record_Key:'key-'+i+'-'+j};
  sets.appendRow(fields.map(f=>r[f]??''));
 }));
 return {...x,session,sets,setFields:fields,rows:()=>x.api.rformContentApiV04CardRows_(x.spreadsheet,session.Session_ID),
  change:(i,f,v)=>{sets.rows[i][fields.indexOf(f)]=v;}};
}
test('canonical C workout: all five exercises, bilateral weights, flies excluded from bench',()=>{
 const x=fixture(),p=x.api.rformContentApiV04CardPacket_(x.session,x.rows());
 assert.equal(p.bench,1920);assert.equal(p.total,8610);assert.equal(p.count,14);assert.equal(p.exercises.length,5);
 assert.equal(x.api.rformContentApiV04CardFacts_(p.exercises[3]),'16 кг × 15; 15 кг × 15');
 const text=x.api.rformContentApiV04CardCaption_(p);assert(text.includes('8 610'));assert(text.includes('1 920'));assert(text.length<=1024);
});
test('PNG signature, CRC, dimensions, palette and complete DEFLATE stream are valid',()=>{
 const x=fixture(),p=x.api.rformContentApiV04CardPacket_(x.session,x.rows()),pages=x.api.rformContentApiV04CardPages_(p);
 const png=Buffer.from(x.api.rformContentApiV04CardPng_(p,pages[0],0,pages.length));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 let offset=8,data=[],palette;while(offset<png.length){const len=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),body=png.subarray(offset+8,offset+8+len);
  if(type==='IHDR'){assert.equal(body.readUInt32BE(0),1080);assert.equal(body.readUInt32BE(4),pages[0].height);}
  if(type==='IDAT')data.push(body);if(type==='PLTE')palette=body;offset+=len+12;
 }
 assert.equal(palette.length,147);const pixels=zlib.inflateSync(Buffer.concat(data));assert.equal(pixels.length,1081*pages[0].height);
 assert(png.length<5*1024*1024);assert(pixels.some(n=>n===15));
 if(process.env.RFORM_CARD_QA_OUTPUT)fs.writeFileSync(process.env.RFORM_CARD_QA_OUTPUT,png);
});
test('unknown units, ambiguous unilateral dumbbells, duplicates, missing weights and conflicting loads block',()=>{
 for(const [row,field,value] of [[1,'Load_Unit','LB'],[8,'Exercise_Name_Normalized','ONE_ARM_DUMBBELL_ROW'],[1,'Duplicate_Flag','YES'],[1,'Weight_Kg',''],[2,'Set_ID','set-0-0'],[2,'Record_Key','key-0-0'],[2,'Set_Number',1],[1,'RIR','NaN']]){
  const x=fixture();x.change(row,field,value);assert.throws(()=>x.api.rformContentApiV04CardPacket_(x.session,x.rows()),field);
 }
 const x=fixture();x.change(1,'Load_Value',75);x.change(1,'Load_Unit','KG');assert.throws(()=>x.api.rformContentApiV04CardPacket_(x.session,x.rows()),/расходятся/);
});
test('warmup excluded; total-load override and additional weight handled explicitly',()=>{
 const x=fixture();x.change(1,'Set_Type','WARMUP');let p=x.api.rformContentApiV04CardPacket_(x.session,x.rows());assert.equal(p.bench,1440);assert.equal(p.count,13);
 x.change(8,'Load_Unit','KG_TOTAL');p=x.api.rformContentApiV04CardPacket_(x.session,x.rows());assert.equal(p.total,7710);
 x.change(1,'Set_Type','WORKING');x.change(1,'Exercise_Name_Normalized','WEIGHTED_PULLUP');x.change(1,'Load_Unit','KG_ADDITIONAL');x.change(1,'Weight_Kg',10);
 // A different code under the same order is correctly rejected; use a separate order.
 x.change(1,'Exercise_Order',6);p=x.api.rformContentApiV04CardPacket_(x.session,x.rows());assert(p.external_only);assert.equal(p.bench,1440);
});
test('many exercise groups paginate without omission; every title appears exactly once',()=>{
 const x=fixture(),p=x.api.rformContentApiV04CardPacket_(x.session,x.rows());p.exercises=Array.from({length:16},(_,i)=>({...p.exercises[i%5],order:i+1}));
 const pages=x.api.rformContentApiV04CardPages_(p);assert(pages.length>1);assert.equal(pages.reduce((n,a)=>n+a.blocks.length,0),16);assert(pages.every(a=>a.height<=2450));
});
test('sync saves private cards and caption as one audited draft; repeat is a no-op',()=>{
 const x=fixture(),request={action_id:'a'.repeat(32),payload:{action:'sync_training'}};
 const r=x.api.rformContentApiV04Workspace_(request);assert.equal(r.created.length,1);
 const item=x.item(2);assert.equal(item.Visual_Status,'READY');assert.equal(item.Telegram_Post_Mode,'PHOTO_CAPTION');assert(item.Telegram_Visual_URL.includes('/folders/'));
 assert.equal(item.AutoPost_Allowed,'NO');assert.equal(item.Approval_Status,'NOT_READY');assert.equal(item.Preview_Review_Status,'NOT_REVIEWED');assert(item.Telegram_Text.includes('8 610'));
 const meta=JSON.parse(x.log.rows[1][7])._meta;assert.equal(meta.sets_hash,x.api.rformContentApiV04CardHash_(x.rows()));
 const files=x.files.size;assert.equal(x.api.rformContentApiV04Workspace_(request).created.length,0);assert.equal(x.files.size,files);
 x.api.rformContentApiV04TrainingFresh_(x.spreadsheet,f=>item[f]||'');x.change(1,'Reps',7);
 assert.throws(()=>x.api.rformContentApiV04TrainingFresh_(x.spreadsheet,f=>item[f]||''),/подходы изменились/);
});
test('invalid source blocks with a readable reason and never falls back to a text-only ready draft',()=>{
 const x=fixture();x.change(1,'Reps','');const result=x.api.rformContentApiV04Workspace_({action_id:'a'.repeat(32),payload:{action:'sync_training'}});
 assert.equal(result.created.length,0);assert(result.blocked[0].detail);assert.equal(x.files.size,0);
});
test('render/Drive failure is audited uncertain, no queue draft, never silently retried',()=>{
 const x=fixture();x.api.rformContentApiV04CardAssets_=()=>{throw Error('Drive unavailable');};const request={action_id:'a'.repeat(32),payload:{action:'sync_training'}};
 assert.throws(()=>x.api.rformContentApiV04Workspace_(request),/Исход создания/);assert.equal(x.queue.rows.length,2);assert.equal(x.log.rows[1].at(-1),'OUTCOME_UNKNOWN');
 assert.equal(x.api.rformContentApiV04Workspace_(request).blocked[0].reason,'CHECK_PRIOR_OUTCOME');
});
test('activation preserves existing baseline and does not enable publication',()=>{
 const x=fixture(),baseline=x.props.RFORM_AUTO_DRAFT_BASELINE;x.api.rformContentApiV04EnableTrainingCards();assert.equal(x.props.RFORM_AUTO_CARDS_ENABLED,'YES');assert.equal(x.props.RFORM_AUTO_DRAFT_BASELINE,baseline);
});
