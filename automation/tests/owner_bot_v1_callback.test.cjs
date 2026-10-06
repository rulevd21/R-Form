const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../owner_bot_v1.gs'),'utf8');
const previewId = 'a'.repeat(32);
function setup({failRead=false, failApprove=false, failHold=false, failNotify=false, failAudit=false, stale=false, enabled=true}={}) {
  const calls=[];
  const props = {RFORM_OWNER_BOT_TOKEN:'fixture',RFORM_OWNER_TELEGRAM_USER_ID:'42'};
  const ctx = {console:{error:()=>{},warn:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})}};
  vm.createContext(ctx); vm.runInContext(source,ctx);
  ctx.rformOwnerBotV1Telegram_=(token,method,payload)=>{calls.push(['telegram',method]); return {};};
  ctx.rformOwnerBotV1ActionsEnabled_=()=>enabled;
  ctx.rformOwnerBotV1ApiRead_=()=>{calls.push(['read']);if(failRead)throw Error('secret raw error');return {queue:[{}]};};
  ctx.rformOwnerBotV1BuildReadyPreviews_=()=>stale?[]:[{previewId,item:{Content_ID:'fixture-content'}}];
  ctx.rformOwnerBotV1ApiApprove_=()=>{calls.push(['approve']);if(failApprove)throw Error('secret');return {ok:true};};
  ctx.rformOwnerBotV1ApiHold_=()=>{calls.push(['hold']);if(failHold)throw Error('secret');return {ok:true};};
  ctx.rformOwnerBotV1Audit_=(...args)=>{calls.push(['audit',...args]);if(failAudit)throw Error('audit');};
  ctx.rformOwnerBotV1SendOwnerText_=text=>{calls.push(['notify',text]);if(failNotify)throw Error('notify');};
  ctx.rformOwnerBotV1RemoveKeyboard_=()=>calls.push(['keyboard']);
  return {ctx,calls,run:(action='a',user='42',data)=>ctx.rformOwnerBotV1HandleCallback_({id:'fixture-callback',from:{id:user},data:data??`ob:${action}:${previewId}`})};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('successful approval runs exactly once',()=>{const s=setup();s.run();assert.equal(s.calls.filter(c=>c[0]==='approve').length,1);assert(!s.calls.some(c=>c[2]==='BOT_CALLBACK_ERROR'));});
test('successful hold runs exactly once',()=>{const s=setup();s.run('h');assert.equal(s.calls.filter(c=>c[0]==='hold').length,1);});
test('read failure prevents handoff and emits safe audit/notice',()=>{const s=setup({failRead:true});s.run();assert(!s.calls.some(c=>['approve','hold'].includes(c[0])));assert(s.calls.some(c=>c[2]==='BOT_CALLBACK_ERROR'&&c[5]==='OUTCOME_UNKNOWN'));assert(s.calls.some(c=>c[0]==='notify'));assert(!JSON.stringify(s.calls).includes('secret'));});
test('approval timeout is never retried',()=>{const s=setup({failApprove:true});s.run();assert.equal(s.calls.filter(c=>c[0]==='approve').length,1);assert(!s.calls.some(c=>c[0]==='keyboard'));assert(s.calls.some(c=>c[0]==='notify'&&c[1].includes('могла уже примениться')));});
test('hold timeout is never retried',()=>{const s=setup({failHold:true});s.run('h');assert.equal(s.calls.filter(c=>c[0]==='hold').length,1);});
test('post-commit notification failure preserves single handoff',()=>{const s=setup({failNotify:true});s.run();assert.equal(s.calls.filter(c=>c[0]==='approve').length,1);assert(s.calls.some(c=>c[2]==='BOT_CALLBACK_ERROR'));});
test('audit failure cannot cause repeat action',()=>{const s=setup({failAudit:true});s.run();assert.equal(s.calls.filter(c=>c[0]==='approve').length,1);assert(s.calls.some(c=>c[0]==='notify'));});
test('unauthorized user cannot read or act',()=>{const s=setup();s.run('a','99');assert(!s.calls.some(c=>['read','approve','hold','audit','notify'].includes(c[0])));});
test('malformed action cannot read or act',()=>{const s=setup();s.run('a','42','bad');assert(!s.calls.some(c=>['read','approve','hold','audit','notify'].includes(c[0])));});
test('stale preview cannot handoff',()=>{const s=setup({stale:true});s.run();assert(!s.calls.some(c=>['approve','hold'].includes(c[0])));assert(s.calls.some(c=>c[2]==='BOT_STALE_CALLBACK'));});
test('disabled actions cannot read or handoff',()=>{const s=setup({enabled:false});s.run();assert(!s.calls.some(c=>['read','approve','hold'].includes(c[0])));});
console.log(`${count} offline regression tests passed; no network or production writes.`);
