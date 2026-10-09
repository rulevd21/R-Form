const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../owner_bot_v1.gs','utf8');
const echo='https://script.googleusercontent.com/macros/echo?opaque=fixture';
function setup(responses){
 const calls=[];
 const ctx={PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'https://script.google.com/macros/s/fixture/exec'})},UrlFetchApp:{fetch:(url,opt)=>{calls.push({url,opt});const r=responses.shift();if(!r)throw Error('Unexpected replay');if(r.error)throw Error(r.error);return{getResponseCode:()=>r.status,getAllHeaders:()=>r.headers||{},getContentText:()=>r.raw??JSON.stringify(r.body)};}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return{calls,run:request=>ctx.rformOwnerBotV1ApiPost_(request)};
}
let count=0;function test(n,f){f();count++;console.log('PASS '+n);}
test('direct JSON success uses exactly one POST',()=>{const s=setup([{status:200,body:{ok:true}}]);assert(s.run({operation:'read'}).ok);assert.equal(s.calls.length,1);assert.equal(s.calls[0].opt.followRedirects,false);});
test('approval follows only ContentService GET and never resends payload',()=>{const s=setup([{status:302,headers:{Location:echo}},{status:200,body:{ok:true}}]);assert(s.run({operation:'queue_publication_approval',action_id:'fixture'}).ok);assert.equal(s.calls.length,2);assert.equal(s.calls[0].opt.method,'post');assert.equal(s.calls[1].opt.method,'get');assert.equal(s.calls[1].opt.payload,undefined);assert.equal(s.calls[1].opt.followRedirects,false);});
test('hold accepts case-insensitive Location and no replay',()=>{const s=setup([{status:302,headers:{location:echo}},{status:200,body:{ok:true}}]);assert(s.run({operation:'content_action',action:'HOLD'}).ok);assert.equal(s.calls.filter(c=>c.opt.method==='post').length,1);});
test('foreign or lookalike redirect cannot receive credentials',()=>{for(const loc of ['https://evil.invalid/macros/echo?x=1','https://script.googleusercontent.com.evil.invalid/macros/echo?x=1','https://script.google.com/macros/s/fixture/exec']){const s=setup([{status:302,headers:{Location:loc}}]);assert.throws(()=>s.run({operation:'queue_publication_approval'}),/unsupported/);assert.equal(s.calls.length,1);}});
test('missing Location fails without replay',()=>{const s=setup([{status:302,headers:{}}]);assert.throws(()=>s.run({operation:'read'}),/unsupported/);assert.equal(s.calls.length,1);});
test('GET network failure after approval never repeats POST',()=>{const s=setup([{status:302,headers:{Location:echo}},{error:'fixture network timeout'}]);assert.throws(()=>s.run({operation:'queue_publication_approval'}),/timeout/);assert.equal(s.calls.length,2);});
test('second redirect fails closed without following or replay',()=>{const s=setup([{status:302,headers:{Location:echo}},{status:302,headers:{Location:echo},raw:'redirect'}]);assert.throws(()=>s.run({operation:'content_action',action:'HOLD'}));assert.equal(s.calls.length,2);});
test('JSON rejection remains rejection',()=>{const s=setup([{status:302,headers:{Location:echo}},{status:200,body:{ok:false,message:'fixture rejection'}}]);assert.throws(()=>s.run({operation:'read'}),/fixture rejection/);assert.equal(s.calls.length,2);});
console.log(count+' transport tests passed; no network or production writes.');

