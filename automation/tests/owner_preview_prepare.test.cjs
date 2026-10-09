const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content_control_api_v0_4.gs'), 'utf8');

function setup(changes = {}, dateFormattedTimestamp = false) {
  let releases = 0;
  class Sheet {
    constructor(name, rows) { this.name = name; this.rows = rows; this.fail = null; }
    getName() { return this.name; }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return this.rows[0].length; }
    appendRow(row) { this.rows.push([...row]); }
    getRange(r, c, nr = 1, nc = 1) {
      const self = this;
      return {
        getDisplayValues() { return Array.from({length:nr}, (_,i) => Array.from({length:nc}, (_,j) => String(self.rows[r+i-1]?.[c+j-1] ?? ''))); },
        getDisplayValue() { return this.getDisplayValues()[0][0]; },
        setValue(v) { if (self.fail && self.fail(r,c,v)) throw Error('Injected write failure'); const literal = String(v).startsWith("'");
          let stored = literal ? String(v).slice(1) : v;
          // Production Updated_At is DATE_TIME dd.mm.yyyy hh:mm.
          if (dateFormattedTimestamp && !literal && self.rows[0][c-1] === 'Updated_At' &&
              /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/.test(String(stored)))
            stored = String(stored).slice(0,16);
          self.rows[r-1][c-1] = stored; }
      };
    }
  }
  const ctx = vm.createContext({console, Date, Utilities: {
    DigestAlgorithm: {SHA_256:'sha256'}, Charset:{UTF_8:'utf8'},
    computeDigest: (alg,s) => [...crypto.createHash('sha256').update(s).digest()],
    formatDate: () => '07.10.2026 13:36:15',
  }, LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>releases++})}});
  vm.runInContext(source, ctx);
  const fields = Array.from(vm.runInContext('RFORM_OWNER_PREVIEW_FIELDS',ctx));
  const item = Object.fromEntries(fields.map(f => [f,'']));
  Object.assign(item, {Content_ID:'CNT-TEST-06',Current_Stage:'CHANNEL_CONTROL_REVIEW',
    Pipeline_Status:'READY · CHANNEL CONTROL',Source_Packet_Status:'READY',Public_Data_Allowed:'YES',
    Text_Status:'READY',Visual_Status:'NOT_REQUIRED',Approval_Status:'NOT_READY',Publication_Status:'PLANNED',
    AutoPost_Allowed:'NO',Telegram_Text:'ПЛАН → ФАКТ → РЕШЕНИЕ\nЛичный дневник.',
    Telegram_Post_Mode:'TEXT_ONLY',Preview_Review_Status:'NOT_REVIEWED'}, changes);
  const logFields = Array.from(vm.runInContext('RFORM_CONTENT_API_V04.actionLogHeaders',ctx));
  const queue = new Sheet('CONTENT_QUEUE',[fields,fields.map(f=>item[f])]);
  const log = new Sheet('CONTENT_ACTION_LOG',[logFields]);
  ctx.SpreadsheetApp = {openById:()=>({getSheetByName:name=>({'CONTENT_QUEUE':queue,'CONTENT_ACTION_LOG':log})[name]}),flush:()=>{}};
  const hash = () => ctx.rformContentApiV04OwnerPreviewHash_(f=>String(queue.rows[1][fields.indexOf(f)]||'').trim());
  const req = {action_id:'a'.repeat(32),content_id:item.Content_ID,source_hash:hash(),nonce:'b'.repeat(32)};
  return {ctx,fields,item,queue,log,req,hash,call:()=>ctx.rformContentApiV04PrepareOwnerPreview_(req),releases:()=>releases};
}

test('preparation changes exactly Current_Stage and records verified audit', () => {
  const x=setup(), before=[...x.queue.rows[1]];
  assert.equal(x.call().status,'APPLIED');
  assert.deepEqual(x.queue.rows[1].map((v,i)=>v===before[i]?null:x.fields[i]).filter(Boolean),['Current_Stage']);
  assert.equal(x.queue.rows[1][x.fields.indexOf('Current_Stage')],'OWNER_FINAL_PREVIEW');
  assert.equal(x.log.rows.length,2); assert.equal(x.log.rows[1].at(-1),'APPLIED');
  assert.equal(x.releases(),1);
});
test('same identity is idempotent; another object/hash cannot reuse it', () => {
  const x=setup(); x.call(); assert.equal(x.call().status,'ALREADY_APPLIED'); assert.equal(x.log.rows.length,2);
  x.req.content_id='CNT-OTHER'; assert.throws(x.call,/Action_ID/);
  x.req.content_id=x.item.Content_ID; x.req.source_hash='f'.repeat(64); assert.throws(x.call,/Action_ID/);
});
test('stale payload is rejected without writes', () => {
  const x=setup(); x.queue.rows[1][x.fields.indexOf('Telegram_Text')]='Changed';
  const before=JSON.stringify(x.queue.rows); assert.throws(x.call,/изменился/);
  assert.equal(JSON.stringify(x.queue.rows),before); assert.equal(x.log.rows.length,1);
});
test('historical success cannot claim readiness after a later edit or revision',()=> {
  const x=setup();x.call();x.queue.rows[1][x.fields.indexOf('Telegram_Text')]='edited';
  assert.throws(x.call,/уже выполнялась/);assert.equal(x.log.rows.length,2);
  const y=setup();y.call();y.queue.rows[1][y.fields.indexOf('Current_Stage')]='CHANNEL_CONTROL_REVIEW';
  assert.throws(y.call,/уже выполнялась/);
});
for (const [field,value] of Object.entries({
  Current_Stage:'OWNER_FINAL_PREVIEW',Publication_Status:'HOLD',AutoPost_Allowed:'YES',Publish_At:'scheduled',
  Approval_Status:'APPROVED',Source_Packet_Status:'NOT_READY',Public_Data_Allowed:'NO',Text_Status:'SUPERSEDED',
  Visual_Status:'READY',Telegram_Post_Mode:'ALBUM_CAPTION',Telegram_Visual_URL:'media',Telegram_Text:'',
  Duplicate_Flag:'YES',Blocking_Issue:'blocked',Publish_Error:'error',Telegram_Message_ID:'1',
  Telegram_Post_URL:'posted',Posted_At:'posted',Pipeline_Status:'HOLD',Preview_Review_Status:'REVIEWED',
  Preview_Review_Hash:'old',Preview_Reviewed_At:'old',Preview_Reviewed_By:'owner'
})) test('rejects unsafe '+field,()=> {
  const x=setup({[field]:value}); const before=JSON.stringify(x.queue.rows);
  assert.throws(x.call); assert.equal(JSON.stringify(x.queue.rows),before); assert.equal(x.log.rows.length,1);
});
test('overlong text, missing schema and duplicate Content_ID fail closed',()=> {
  assert.throws(setup({Telegram_Text:'x'.repeat(4097)}).call);
  const x=setup(); x.queue.rows[0][0]='MISSING'; assert.throws(x.call,/missing field/);
  const y=setup(); y.queue.rows.push([...y.queue.rows[1]]); assert.throws(y.call,/повторяющийся/);
});
test('audit write failure rolls back only the stage, no replay',()=> {
  const x=setup(), before=JSON.stringify(x.queue.rows);
  x.log.fail=(r,c,v)=>v==='APPLIED'; assert.throws(x.call,/Injected/);
  assert.equal(JSON.stringify(x.queue.rows),before); assert.equal(x.log.rows[1].at(-1),'FAILED_ROLLED_BACK');
  assert.throws(x.call,/не подтверждён/); assert.equal(x.log.rows.length,2);
});
test('failed rollback is OUTCOME_UNKNOWN and cannot replay',()=> {
  const x=setup(); x.log.fail=(r,c,v)=>v==='APPLIED';
  x.queue.fail=(r,c,v)=>v==='CHANNEL_CONTROL_REVIEW'; assert.throws(x.call,/неизвестен/);
  assert.equal(x.log.rows[1].at(-1),'OUTCOME_UNKNOWN'); assert.throws(x.call,/не подтверждён/);
});
test('signature binds operation, action identity, object and snapshot',()=> {
  const x=setup(); Object.assign(x.req,{timestamp:123,operation:'queue_owner_preview_prepare'});
  const m=x.ctx.rformContentApiV04SignedMessage_(x.req);
  for (const field of ['action_id','content_id','source_hash','operation']) {
    const altered={...x.req,[field]:field==='operation'?'queue_publication_assets':'changed'};
    assert.notEqual(x.ctx.rformContentApiV04SignedMessage_(altered),m);
  }
});

function saveDraft(x, text='Новая редакционная версия.') {
  x.req.telegram_text=text;
  return ()=>x.ctx.rformContentApiV04SaveQueueTextDraft_(x.req);
}

test('draft save changes text and invalidates review without approval, stage or schedule',()=> {
  const x=setup({Preview_Review_Status:'REVIEWED',Preview_Review_Hash:'old-hash',
    Preview_Reviewed_At:'old-time',Preview_Reviewed_By:'owner'}), before=[...x.queue.rows[1]];
  const call=saveDraft(x);
  assert.equal(call().status,'APPLIED');
  const changed=x.queue.rows[1].map((v,i)=>v===before[i]?null:x.fields[i]).filter(Boolean);
  assert.deepEqual(changed.sort(),['Telegram_Text','Updated_At','Preview_Review_Status',
    'Preview_Review_Hash','Preview_Reviewed_At','Preview_Reviewed_By'].sort());
  const value=f=>x.queue.rows[1][x.fields.indexOf(f)];
  for (const f of ['Current_Stage','Approval_Status','Publication_Status','AutoPost_Allowed','Publish_At'])
    assert.equal(value(f),before[x.fields.indexOf(f)],f);
  assert.equal(value('Preview_Review_Status'),'RECHECK_REQUIRED');
  assert.equal(x.log.rows[1][3],'SAVE_TEXT_DRAFT');
  assert.equal(x.log.rows[1].at(-1),'APPLIED');
  assert.equal(call().status,'ALREADY_APPLIED');
  assert.equal(x.log.rows.length,2);
});
test('draft can be passed to the existing preview operation only after fresh snapshot',()=> {
  const x=setup();saveDraft(x)();
  x.req.action_id='c'.repeat(32);x.req.source_hash=x.hash();
  assert.equal(x.call().status,'APPLIED');
  assert.equal(x.queue.rows[1][x.fields.indexOf('Current_Stage')],'OWNER_FINAL_PREVIEW');
});
test('draft identity binds target text and refuses changed current state',()=> {
  const x=setup(),call=saveDraft(x);call();
  x.req.telegram_text='Другой текст';assert.throws(call,/Action_ID/);
  x.req.telegram_text='Новая редакционная версия.';
  x.queue.rows[1][x.fields.indexOf('Publication_Status')]='HOLD';
  assert.throws(call,/уже выполнялась/);
});
test('draft signature binds the exact trimmed text',()=> {
  const x=setup();Object.assign(x.req,{timestamp:123,operation:'queue_text_draft_save',telegram_text:'Текст'});
  const original=x.ctx.rformContentApiV04SignedMessage_(x.req);
  for (const field of ['telegram_text','action_id','content_id','source_hash','operation'])
    assert.notEqual(x.ctx.rformContentApiV04SignedMessage_({...x.req,[field]:field==='operation'?'queue_owner_preview_prepare':'changed'}),original);
});
for (const [field,value] of Object.entries({Current_Stage:'OWNER_FINAL_PREVIEW',Publication_Status:'HOLD',
  AutoPost_Allowed:'YES',Approval_Status:'APPROVED',Publish_At:'future',Duplicate_Flag:'YES',
  Pipeline_Status:'HOLD',Blocking_Issue:'blocked',Public_Data_Allowed:'NO',Source_Packet_Status:'NOT_READY',
  Text_Status:'SUPERSEDED',Visual_Status:'READY',Telegram_Post_Mode:'ALBUM_CAPTION',Telegram_Visual_URL:'media',
  Telegram_Message_ID:'posted',Publish_Error:'error',Preview_Review_Status:'UNKNOWN'}))
  test('draft refuses unsafe '+field,()=> {
    const x=setup({[field]:value}),before=JSON.stringify(x.queue.rows);
    assert.throws(saveDraft(x));assert.equal(JSON.stringify(x.queue.rows),before);assert.equal(x.log.rows.length,1);
  });
test('draft refuses stale or oversized text before writes',()=> {
  const x=setup();x.queue.rows[1][x.fields.indexOf('Updated_At')]='changed';
  assert.throws(saveDraft(x),/изменился/);assert.equal(x.log.rows.length,1);
  assert.throws(saveDraft(setup(),'x'.repeat(4097)));
  assert.throws(saveDraft(setup(),''));
});
test('draft protects leading formula syntax as literal text',()=> {
  const x=setup();saveDraft(x,'=SUM(A1:A2)')();
  assert.equal(x.queue.rows[1][x.fields.indexOf('Telegram_Text')],'=SUM(A1:A2)');
});
test('partial draft write and audit failure restore the previous fields',()=> {
  for(const failure of ['field','audit']) {
    const x=setup({Preview_Review_Status:'REVIEWED',Preview_Review_Hash:'old'}),before=JSON.stringify(x.queue.rows);
    if(failure==='field') x.queue.fail=(r,c,v)=>c===x.fields.indexOf('Updated_At')+1&&v==="'07.10.2026 13:36:15";
    else x.log.fail=(r,c,v)=>v==='APPLIED';
    const call=saveDraft(x);assert.throws(call,/Injected/);
    assert.equal(JSON.stringify(x.queue.rows),before);
    assert.equal(x.log.rows[1].at(-1),'FAILED_ROLLED_BACK');
    assert.throws(call,/не подтверждён/);
  }
});
test('draft rollback failure is unknown and cannot replay',()=> {
  const x=setup(),original=x.item.Telegram_Text;
  x.log.fail=(r,c,v)=>v==='APPLIED';x.queue.fail=(r,c,v)=>v===original;
  const call=saveDraft(x);assert.throws(call,/неизвестен/);
  assert.equal(x.log.rows[1].at(-1),'OUTCOME_UNKNOWN');assert.throws(call,/не подтверждён/);
});

test('draft rollback preserves original surrounding whitespace',()=> {
  const x=setup({Telegram_Text:'  Исходный текст.  ',Updated_At:' old timestamp '}),before=JSON.stringify(x.queue.rows);
  x.log.fail=(r,c,v)=>v==='APPLIED';assert.throws(saveDraft(x));
  assert.equal(JSON.stringify(x.queue.rows),before);
});

test('signed draft POST reaches preparation only; tampered text cannot write',()=> {
  for(const tamper of [false,true]) {
    const x=setup();const cache=new Set();
    x.ctx.PropertiesService={getScriptProperties:()=>({getProperty:()=> 'test-secret'})};
    x.ctx.CacheService={getScriptCache:()=>({get:key=>cache.has(key)?'1':null,put:key=>cache.add(key)})};
    x.ctx.Utilities.computeHmacSha256Signature=(message,secret)=>[...crypto.createHmac('sha256',secret).update(message).digest()];
    x.ctx.Utilities.base64EncodeWebSafe=bytes=>Buffer.from(bytes).toString('base64url');
    x.ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})};
    Object.assign(x.req,{operation:'queue_text_draft_save',timestamp:Math.floor(Date.now()/1000),telegram_text:'Новая редакция.'});
    x.req.signature=crypto.createHmac('sha256','test-secret').update(x.ctx.rformContentApiV04SignedMessage_(x.req)).digest('base64url');
    if(tamper) x.req.telegram_text='Подмена';
    const before=JSON.stringify(x.queue.rows);
    const result=x.ctx.doPost({postData:{contents:JSON.stringify(x.req)}});
    assert.equal(result.ok,!tamper);
    if(tamper) { assert.equal(JSON.stringify(x.queue.rows),before);assert.equal(x.log.rows.length,1); }
    else { assert.equal(result.status,'APPLIED');assert.equal(x.log.rows[1][3],'SAVE_TEXT_DRAFT'); }
  }
});


test('draft timestamp survives production minute-only date formatting',()=> {
  const x=setup({Updated_At:'21.08.2026 21:30'},true), before=[...x.queue.rows[1]];
  const call=saveDraft(x);
  assert.equal(call().status,'APPLIED');
  assert.equal(x.queue.rows[1][x.fields.indexOf('Updated_At')],'07.10.2026 13:36:15');
  assert.equal(call().status,'ALREADY_APPLIED');
  for (const f of ['Current_Stage','Approval_Status','Publication_Status','AutoPost_Allowed','Publish_At'])
    assert.equal(x.queue.rows[1][x.fields.indexOf(f)],before[x.fields.indexOf(f)]);
});
