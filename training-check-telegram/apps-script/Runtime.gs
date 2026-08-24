'use strict';

const TC_PROP_KEYS=Object.freeze({BOT_CREDENTIAL:'TC_TELEGRAM_BOT_TOKEN',WEBHOOK_PATH:'TC_WEBHOOK_PATH_SECRET',MINI_APP_URL:'TC_MINI_APP_URL',ALLOWED_ORIGIN:'TC_ALLOWED_ORIGIN',BOT_ENABLED:'TC_BOT_ENABLED',WRITES_ENABLED:'TC_WRITES_ENABLED',REMINDERS_ENABLED:'TC_REMINDERS_ENABLED',SMOKE_MODE:'TC_SMOKE_MODE'});
function tcProps_(){return PropertiesService.getScriptProperties();}
function tcProp_(name,fallback){const v=tcProps_().getProperty(name);return v===null||v===''?fallback:v;}
function tcBoolProp_(name,fallback){return String(tcProp_(name,fallback?'YES':'NO')).toUpperCase()==='YES';}
function tcBotCredential_(){return String(tcProp_(TC_PROP_KEYS.BOT_CREDENTIAL,'')||'');}
function tcWebhookSecret_(){return String(tcProp_(TC_PROP_KEYS.WEBHOOK_PATH,'')||'');}
function tcMiniAppUrl_(){return String(tcProp_(TC_PROP_KEYS.MINI_APP_URL,RFORM_TCV1.MINI_APP_URL_DEFAULT));}
function tcAllowedOrigin_(){return String(tcProp_(TC_PROP_KEYS.ALLOWED_ORIGIN,RFORM_TCV1.ALLOWED_ORIGIN_DEFAULT));}
function tcBotEnabled_(){return tcBoolProp_(TC_PROP_KEYS.BOT_ENABLED,false);}
function tcWritesEnabled_(){return tcBoolProp_(TC_PROP_KEYS.WRITES_ENABLED,false);}
function tcRemindersEnabled_(){return tcBoolProp_(TC_PROP_KEYS.REMINDERS_ENABLED,false);}
function tcSmokeMode_(){return tcBoolProp_(TC_PROP_KEYS.SMOKE_MODE,true);}
function rformTrainingCheckV1InitializeSafeMode(){const p=tcProps_();if(!p.getProperty(TC_PROP_KEYS.WEBHOOK_PATH))p.setProperty(TC_PROP_KEYS.WEBHOOK_PATH,Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));if(!p.getProperty(TC_PROP_KEYS.MINI_APP_URL))p.setProperty(TC_PROP_KEYS.MINI_APP_URL,RFORM_TCV1.MINI_APP_URL_DEFAULT);if(!p.getProperty(TC_PROP_KEYS.ALLOWED_ORIGIN))p.setProperty(TC_PROP_KEYS.ALLOWED_ORIGIN,RFORM_TCV1.ALLOWED_ORIGIN_DEFAULT);if(!p.getProperty(TC_PROP_KEYS.BOT_ENABLED))p.setProperty(TC_PROP_KEYS.BOT_ENABLED,'NO');if(!p.getProperty(TC_PROP_KEYS.WRITES_ENABLED))p.setProperty(TC_PROP_KEYS.WRITES_ENABLED,'NO');if(!p.getProperty(TC_PROP_KEYS.REMINDERS_ENABLED))p.setProperty(TC_PROP_KEYS.REMINDERS_ENABLED,'NO');if(!p.getProperty(TC_PROP_KEYS.SMOKE_MODE))p.setProperty(TC_PROP_KEYS.SMOKE_MODE,'YES');return{ok:true,version:RFORM_TCV1.VERSION,bot_enabled:tcBotEnabled_(),writes_enabled:tcWritesEnabled_(),reminders_enabled:tcRemindersEnabled_(),smoke_mode:tcSmokeMode_()};}
