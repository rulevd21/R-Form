const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./workspace_harness.cjs');
const texts=x=>x.messages.map(m=>m.payload.text||'').join('\n');
const buttons=x=>x.messages.flatMap(m=>JSON.parse(m.payload.reply_markup||'{"inline_keyboard":[]}').inline_keyboard.flat());
test('empty historical training shows source identity and facts without preview',()=>{
  const x=harness();x.set('Session_ID','S-20260814-C');x.set('Date','20.08.2026');
  x.set('Telegram_Text','');x.set('Text_Status','NOT_READY');x.set('Telegram_Post_Mode','');
  x.set('Main_Training_Fact','Жим с паузой 80×4×4, RIR 4/4/4/4.');
  const before=JSON.stringify(x.queue.rows);
  x.callback('ow:open:'+x.token);
  assert.match(texts(x),/Тренировка C · 14.08.2026/);
  assert.match(texts(x),/Исходные факты:[\s\S]*80×4×4/);
  assert.match(texts(x),/текст ещё не подготовлен/i);
  assert.ok(buttons(x).some(b=>b.text==='Подготовить текст'));
  assert.ok(!buttons(x).some(b=>b.callback_data==='ow:preview:'+x.token));
  x.callback('ow:preview:'+x.token);
  assert.match(texts(x),/Предпросмотр пока недоступен/);
  assert.doesNotMatch(texts(x),/сохранение могло примениться/i);
  assert.equal(JSON.stringify(x.queue.rows),before);assert.equal(x.log.rows.length,1);
});
for(const [field,value,reason] of [
 ['Text_Status','NOT_READY','Текст ещё не готов'],['Public_Data_Allowed','NO','публичные данные'],
 ['Source_Packet_Status','NOT_READY','Исходные данные'],['Blocking_Issue','Нужна проверка','Блокировка'],
 ['Telegram_Post_Mode','PHOTO_CAPTION','Фотографии ещё не добавлены'],['Publication_Status','HOLD','после подготовки'],
 ['AutoPost_Allowed','YES','передан на публикацию']
]) test('stale preview button blocks '+field+' before API write',()=>{
 const x=harness();x.set(field,value);x.callback('ow:preview:'+x.token);
 assert.ok(texts(x).includes(reason));assert.equal(x.log.rows.length,1);
 assert.ok(!buttons(x).some(b=>b.callback_data==='ow:preview:'+x.token));
});
test('ready material still opens final preview through canonical prepare',()=>{
 const x=harness();x.callback('ow:open:'+x.token);
 assert.ok(buttons(x).some(b=>b.callback_data==='ow:preview:'+x.token));
 x.callback('ow:preview:'+x.token);
 assert.equal(x.log.rows.length,3);assert.equal(x.log.rows[1][3],'OWNER_PREPARE');assert.equal(x.log.rows[2][3],'BOT_PREVIEW_SENT');
 assert.equal(x.item().AutoPost_Allowed,'NO');assert.equal(x.item().Publication_Status,'PLANNED');
 assert.doesNotMatch(texts(x),/Не удалось доставить/);
});
test('dirty draft explains exact next step without prepare',()=>{
 const x=harness();x.callback('ow:open:'+x.token);
 const d=x.bot.rformOwnerBotV1WorkspaceDraft_(x.token);d.dirty=true;
 x.bot.rformOwnerBotV1WorkspacePutDraft_(x.token,d);x.callback('ow:preview:'+x.token);
 assert.match(texts(x),/есть несохранённые правки/);assert.equal(x.log.rows.length,1);
});
test('preview transport failure never claims a save may have applied',()=>{
 const x=harness();x.callback('ow:open:'+x.token);
 x.bot.rformOwnerBotV1SendPreview_=()=>{throw Error('private upstream url or token');};
 x.callback('ow:preview:'+x.token);
 assert.match(texts(x),/Не удалось доставить предпросмотр/);
 assert.doesNotMatch(texts(x),/сохранение могло|private upstream/i);
});
