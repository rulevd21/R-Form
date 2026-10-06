const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../automation/content_event_detector_v0_3.gs'), 'utf8');
const headers = ['Event_ID','Date','Entity','Event_Type','Source','Fact','Relevance_0_10','Novelty_0_10','Education_0_10','Emotion_0_10','Proof_0_10','Narrative_0_10','Audience_0_10','Content_Value_Score','Editorial_Trigger','Manual_Gate','Candidate_Content_ID','Status','Recommended_Angle_1','Recommended_Angle_2','Recommended_Angle_3','Owner_Action','Created_At','Updated_At'];
const h = Object.fromEntries(headers.map((k,i) => [k,i]));
const event = {eventId:'EVT-20261001-SESSION-S-TEST',date:'01.10.2026',entity:'S-TEST',eventType:'CONTROL_POINT',source:'TEST_FIXTURE',fact:'synthetic fact',relevance:10,novelty:9,education:8,emotion:7,proof:9,narrative:8,audience:7,contentValueScore:83,trigger:'CONTROL_POINT',manualGate:'NO',candidateContentId:'',status:'AGGREGATE_TO_WEEKLY',angle1:'synthetic angle',angle2:'',angle3:'',ownerAction:'NONE'};
function setup(options = {}) {
  const rows = [headers.slice()]; const writes = []; const logs = []; let uid = 0;
  const sheet = {
    getLastRow:() => rows.length, getLastColumn:() => headers.length,
    getRange:(r,c,nr=1,nc=1) => ({
      getDisplayValues:() => Array.from({length:nr},(_,ri) => Array.from({length:nc},(_,ci) => String(rows[r+ri-1]?.[c+ci-1] ?? ''))),
      setValue:value => {
        if(options.failWriteAt === writes.length + 1) throw new Error('synthetic secret must not enter receipts');
        while(rows.length < r) rows.push(Array(headers.length).fill(''));
        rows[r-1][c-1] = value; writes.push({r,c,value});
      }
    })
  };
  const context = vm.createContext({Date,Number,Object,String,Array,Math,Error,
    Utilities:{getUuid:() => 'attempt-' + (++uid)},
    SpreadsheetApp:{openById:() => ({getSheetByName:name => name === 'DATA_EVENTS' && !options.missingSheet ? sheet : null})},
    console:{log:text => {const log=JSON.parse(text);if(options.failLogPhase === log.phase) throw new Error('logging unavailable');logs.push(log);},error:text => {if(options.failErrorLog) throw new Error('logging unavailable');logs.push(JSON.parse(text));}}
  });
  vm.runInContext(source,context);
  let events = [structuredClone(event)];
  context.rformContentEventDetectorPreviewV03 = () => ({ok:true,version:'0.3',events});
  return {context,rows,writes,logs,setEvents:x => {events=x;},run:e => context.rformContentEventDetectorWriteV03(e)};
}
let tests = 0;
function test(name, fn) {fn();tests++;process.stdout.write('PASS ' + name + '\n');}
test('insert receipt, exact return and no extra business fields',() => {
  const t=setup();const result=t.run();assert.equal(result.inserted,1);assert.equal(result.version,'0.3');assert.equal(result.mode,'DATA_EVENTS_ONLY');
  assert.equal(t.logs.length,2);assert.equal(t.logs[1].outcome,'APPLIED');assert.equal(t.logs[1].mutation_count,1);assert.equal(t.logs[0].run_id,t.logs[1].run_id);
  assert.equal(t.logs[1].business_readback,'NOT_PERFORMED_BY_RECEIPT');assert(t.rows[1][h.Created_At] instanceof Date);assert(t.rows[1][h.Updated_At] instanceof Date);
});
test('identical repeated run is NO_OP with stable entire row and timestamps',() => {
  const t=setup();t.run();const before=JSON.stringify(t.rows);t.writes.length=0;t.logs.length=0;
  const result=t.run();assert.equal(result.unchanged,1);assert.equal(t.writes.length,0);assert.equal(JSON.stringify(t.rows),before);assert.equal(t.logs[1].outcome,'NO_OP');
  assert.equal(t.logs[1].run_id,'attempt-2');
});
test('fact change writes only Fact and Updated_At, Created_At stable',() => {
  const t=setup();t.run();const created=t.rows[1][h.Created_At];t.writes.length=0;t.logs.length=0;t.setEvents([{...event,fact:'changed synthetic fact'}]);
  assert.equal(t.run().updated,1);assert.deepEqual(t.writes.map(x=>headers[x.c-1]).sort(),['Fact','Updated_At']);assert.equal(t.rows[1][h.Created_At],created);assert.equal(t.logs[1].outcome,'APPLIED');
});
test('first filtering changes only unequal fields then repeated filtering is NO_OP',() => {
  const t=setup();t.run();const created=t.rows[1][h.Created_At];t.setEvents([]);t.writes.length=0;t.logs.length=0;
  assert.equal(t.run().filtered,1);assert.deepEqual(t.writes.map(x=>headers[x.c-1]).sort(),['Owner_Action','Status','Updated_At']);assert.equal(t.rows[1][h.Created_At],created);
  const before=JSON.stringify(t.rows);t.writes.length=0;t.logs.length=0;assert.equal(t.run().filteredUnchanged,1);assert.equal(t.writes.length,0);assert.equal(JSON.stringify(t.rows),before);assert.equal(t.logs[1].outcome,'NO_OP');
});
test('installable UID is only invocation hint; no automatic verification claimed',() => {
  const t=setup();t.run({triggerUid:'12345678901234567890'});assert.equal(t.logs[1].trigger_uid,'12345678901234567890');assert.equal(t.logs[1].invocation_kind,'INSTALLABLE_EVENT');assert.equal(t.logs[1].runtime_source_evidence,'UNVERIFIED');
  assert(!JSON.stringify(t.logs).includes(event.fact));
});
test('empty evaluated source window is completed NO_OP',() => {const t=setup();t.setEvents([]);t.run();assert.equal(t.logs[1].outcome,'NO_OP');assert.equal(t.logs[1].counters.totalDetected,0);assert.equal(t.writes.length,0);});
test('missing DATA_EVENTS rethrows and logs ERROR without success',() => {const t=setup({missingSheet:true});assert.throws(()=>t.run(),/Missing sheet/);assert.equal(t.logs[1].outcome,'ERROR');assert.equal(t.writes.length,0);});
test('partial writer failure is ERROR and does not expose exception text',() => {const t=setup({failWriteAt:4});assert.throws(()=>t.run(),/synthetic secret/);assert.equal(t.writes.length,3);assert.equal(t.logs[1].business_effects,'UNKNOWN_OR_PARTIAL');assert(!JSON.stringify(t.logs).includes('synthetic secret'));});
test('start logging failure prevents business writes',() => {const t=setup({failLogPhase:'START'});assert.throws(()=>t.run(),/logging unavailable/);assert.equal(t.writes.length,0);});
test('terminal logging failure is not verified success and is not retried',() => {const t=setup({failLogPhase:'FINISH'});assert.throws(()=>t.run(),/logging unavailable/);assert.equal(t.rows.length,2);assert.equal(t.logs.at(-1).outcome,'ERROR');});
test('failure of error logging preserves original processing error',() => {const t=setup({missingSheet:true,failErrorLog:true});assert.throws(()=>t.run(),/Missing sheet/);assert.equal(t.logs.length,1);});
test('invalid terminal counters fail closed',() => {const t=setup();t.context.rformContentEventDetectorWriteV03Core_=()=>({ok:true,mode:'DATA_EVENTS_ONLY',inserted:1,updated:0,unchanged:0,filtered:0,filteredUnchanged:0,totalDetected:0});assert.throws(()=>t.run(),/DETECTOR_COUNTERS_INVALID/);assert.equal(t.logs[1].outcome,'ERROR');});
process.stdout.write(tests + ' tests passed; mocks only, no Google/Telegram calls\n');
