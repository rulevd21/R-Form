const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const {harness}=require('./workspace_harness.cjs');
function training({existing=false,warning=false,strip=false,replay=false}={}){
 const cfgSource=fs.readFileSync(path.join(__dirname,'../../training-mobile/Config.gs'),'utf8');
 const rows={TRAINING_SESSIONS:[],INBOX_LOG:[]},writes=[];
 const utils={toNumberOrBlank:v=>v===''||v==null?'':Number(v),dateKeyFromAny:()=> '2026-10-08',
 revision:(kind,v)=>JSON.stringify(v),assertNumber:(v,opts)=>{if(v===''||v==null){if(opts.required)throw Error('required');return '';}v=Number(v);if(!Number.isFinite(v)||v<opts.min||v>opts.max)throw Error('invalid');return v;},
 sanitizeText:v=>String(v),techniqueScoreToStatus:()=> 'GOOD',formatLoad:(w,r,n)=>`${w}×${r}×${n}`,
 formatNumber:v=>String(v),parseDateKey:s=>new Date(s+'T00:00:00+03:00'),safeJson:JSON.stringify,
 sha256:s=>crypto.createHash('sha256').update(s).digest('hex')};
 const plan=[{sessionId:'S-20261008-A',dayId:'D-20261008',dateKey:'2026-10-08',sessionType:'A',exerciseOrder:1,exerciseName:'Жим',exerciseCategory:'BENCH',recordKey:'SET1',planWeight:80,planReps:4,planRir:2}];
 if(warning)plan.push({...plan[0],recordKey:'SET2',planSetId:'P2'});
 const sets=[{...plan[0],weightKg:80,reps:4,rir:2}];
 if(existing||replay)rows.TRAINING_SESSIONS.push({_rowNumber:2,Session_ID:plan[0].sessionId,Day_ID:plan[0].dayId,Session_Type:'A',Date:'08.10.2026',Session_Status:replay?'CLOSED':'DRAFT'});
 const repo={findRowsByExactValue:(sheet,f,v)=>(rows[sheet]||[]).filter(r=>r[f]===v).map(r=>r._rowNumber),
 readRow:(sheet,row)=>rows[sheet].find(r=>r._rowNumber===row),
 writeFields:(sheet,row,values,op)=>{const fields=ctx.RFormSchemaService.getWritableFields(sheet,op);for(const f of Object.keys(values))assert(fields.includes(f),'schema rejects '+f);writes.push({sheet,values:{...values},op});Object.assign(repo.readRow(sheet,row),values);if(strip&&sheet==='TRAINING_SESSIONS')delete repo.readRow(sheet,row).Completed_At;},
 appendFromTemplate:(sheet,v,op)=>{const row=rows[sheet].length+2;rows[sheet].push({_rowNumber:row});repo.writeFields(sheet,row,v,op);return row;},
 getHeaderMap:()=>({Version:15}),getSheet:()=>({getRange:()=>({setNumberFormat:()=>{},setValue:()=>{}})})};
 const ctx=vm.createContext({Date,Number,console,RFormUtils:utils,RFormSheetRepository:repo,
 RFormSecurityService:{validatePayload:()=>{},assertRequestId:x=>x,assertWriteContext:()=>{},assertMutableStatus:(v,closed)=>{if(closed.includes(v))throw Error('closed');},assertExpectedRevision:x=>x},
 LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},SpreadsheetApp:{flush:()=>{}},
 RFormQualityService:{record:()=>{},duplicateAndThrow:()=>{throw Error('duplicate');}},
 RFormAppCache:{get:()=>null,remove:()=>{},put:()=>{}},RFormPlanService:{getSessionPlan:()=>plan},RFormSetService:{listBySession:()=>sets},
 RFormDailyService:{upsertWithinLock:()=>({daily:{sleepHours:8,readiness:10,shoulderPain:0,elbowPain:0,otherPain:0}}),appendTrainingConclusionWithinLock:()=>{}},RFormAnalyticsService:{invalidate:()=>{}}});
 vm.runInContext(cfgSource,ctx);for(const f of ['SchemaService','LoggingService','SessionService'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../../training-mobile/'+f+'.gs'),'utf8'),ctx);
 const payload={requestId:'a'.repeat(32),sessionId:plan[0].sessionId,durationMinutes:60,recovery:{postPain:0,technique:9,readiness:10}};
 payload.expectedRevision=ctx.RFormSessionService.revision(ctx.RFormSessionService.getById(payload.sessionId),payload.sessionId);
 if(replay)rows.INBOX_LOG.push({_rowNumber:2,Inbox_Event_ID:ctx.RFormLoggingService.eventId('FINISH_SESSION',payload.requestId),Target_Record_ID:payload.sessionId,Processing_Status:'APPLIED'});
 return {ctx,rows,writes,payload,plan,sets,finish:()=>ctx.RFormSessionService.finish(payload)};
}
for(const existing of [false,true])for(const warning of [false,true])test(`planned close ${existing?'update':'create'} ${warning?'WARNING':'VALID'} persists exact timestamp and one audit, preserves plan/sets`,()=>{
 const x=training({existing,warning}),before=JSON.stringify([x.plan,x.sets]),r=x.finish(),s=x.rows.TRAINING_SESSIONS[0],a=x.rows.INBOX_LOG[0];
 assert.equal(r.idempotentReplay,false);assert.equal(s.Session_Status,'CLOSED');assert(s.Completed_At instanceof Date);
 assert.equal(a.Applied_At.getTime(),s.Completed_At.getTime());assert.equal(a.Validation_Status,warning?'WARNING':'VALID');
 assert.equal(a.Processing_Status,'APPLIED');assert.equal(JSON.stringify([x.plan,x.sets]),before);
 const stamp=s.Completed_At.getTime(),writes=x.writes.length;assert.equal(x.finish().idempotentReplay,true);assert.equal(x.rows.INBOX_LOG.length,1);assert.equal(x.writes.length,writes);assert.equal(s.Completed_At.getTime(),stamp);
 const schema=x.ctx.RFormSchemaService.getSchema('TRAINING_SESSIONS');assert.equal(schema.headers.length,23);assert(schema.writable.CREATE_FREE_SESSION.includes('Started_At'));
});
test('APPLIED replay with missing timestamp or non-CLOSED state refuses success without writes',()=>{
 const x=training({replay:true});assert.throws(()=>x.finish(),/Completed_At/);assert.equal(x.writes.length,0);
 x.rows.TRAINING_SESSIONS[0].Completed_At=new Date();x.rows.TRAINING_SESSIONS[0].Session_Status='DRAFT';assert.throws(()=>x.finish(),/Completed_At/);assert.equal(x.writes.length,0);
});
test('lost timestamp during canonical write blocks APPLIED audit',()=>{
 const x=training({strip:true});assert.throws(()=>x.finish(),/Не удалось подтвердить/);assert.equal(x.rows.INBOX_LOG.length,0);
});
test('closed session read is RPC-safe and preserves exact canonical timestamp',()=>{
 const x=training();x.finish();const raw=x.rows.TRAINING_SESSIONS[0],stamp=raw.Completed_At.getTime(),writes=x.writes.length;
 const session=x.ctx.RFormSessionService.getById(x.payload.sessionId);
 assert.equal(session.completedAt,raw.Completed_At.toISOString());
 assert.equal(new Date(session.completedAt).getTime(),stamp);
 const assertRpcSafe=value=>{if(value instanceof Date)throw Error('Date cannot cross google.script.run');if(value&&typeof value==='object')Object.values(value).forEach(assertRpcSafe);};
 assertRpcSafe(session);assertRpcSafe({session});
 assert.equal(x.writes.length,writes);assert.equal(raw.Completed_At.getTime(),stamp);
 raw.Completed_At='2026-10-09T05:11:00.123Z';assert.equal(x.ctx.RFormSessionService.getById(x.payload.sessionId).completedAt,raw.Completed_At);
 raw.Completed_At='';assert.equal(x.ctx.RFormSessionService.getById(x.payload.sessionId).completedAt,'');
});
test('recovered writer close integrates with content sync and preview without publication',()=>{
 const writer=training(),r=writer.finish(),source=writer.rows.TRAINING_SESSIONS[0],x=harness();
 x.props.RFORM_AUTO_DRAFT_ENABLED='YES';x.addSession({...source,Completed_At:source.Completed_At.toISOString()});
 const result=x.api.rformContentApiV04Workspace_({action_id:'b'.repeat(32),payload:{action:'sync_training'}});
 assert.equal(result.created.length,1);const q=x.item(2);assert.equal(q.Session_ID,r.sessionId);assert(q.Telegram_Text.includes('80×4×1'));
 assert.equal(q.AutoPost_Allowed,'NO');assert.equal(q.Publish_At,'');assert.equal(q.Approval_Status,'NOT_READY');
});
