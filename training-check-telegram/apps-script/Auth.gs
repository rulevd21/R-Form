'use strict';

function tcHex_(bytes){return bytes.map(function(b){const v=b<0?b+256:b;return('0'+v.toString(16)).slice(-2);}).join('');}
function tcConstantTimeEqual_(a,b){a=String(a||'');b=String(b||'');let diff=a.length^b.length;const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)diff|=(a.charCodeAt(i%Math.max(1,a.length))||0)^(b.charCodeAt(i%Math.max(1,b.length))||0);return diff===0;}
function tcParseQuery_(raw){const out={};String(raw||'').split('&').forEach(function(part){if(!part)return;const i=part.indexOf('=');const k=decodeURIComponent(i<0?part:part.slice(0,i));const v=decodeURIComponent((i<0?'':part.slice(i+1)).replace(/\+/g,'%20'));out[k]=v;});return out;}
function tcValidateTelegramInitData_(initData){
  const raw=String(initData||'');if(!raw)throw new Error('TELEGRAM_INIT_DATA_REQUIRED');
  const credential=tcBotCredential_();if(!credential)throw new Error('BOT_CREDENTIAL_MISSING');
  const fields=tcParseQuery_(raw),expected=String(fields.hash||'');if(!expected)throw new Error('TELEGRAM_HASH_MISSING');
  const dataCheckString=Object.keys(fields).filter(function(k){return k!=='hash';}).sort().map(function(k){return k+'='+fields[k];}).join('\n');
  const secretKey=Utilities.computeHmacSha256Signature(credential,'WebAppData');
  const actual=tcHex_(Utilities.computeHmacSha256Signature(dataCheckString,secretKey));
  if(!tcConstantTimeEqual_(actual,expected))throw new Error('TELEGRAM_SIGNATURE_INVALID');
  const authDate=Number(fields.auth_date||0),now=Math.floor(Date.now()/1000);if(!authDate||authDate>now+60||now-authDate>RFORM_TCV1.AUTH_MAX_AGE_SECONDS)throw new Error('TELEGRAM_INIT_DATA_STALE');
  let user={};try{user=JSON.parse(fields.user||'{}');}catch(_){throw new Error('TELEGRAM_USER_INVALID');}if(!user||!user.id)throw new Error('TELEGRAM_USER_MISSING');
  return{id:String(user.id),language_code:String(user.language_code||''),auth_date:authDate};
}
