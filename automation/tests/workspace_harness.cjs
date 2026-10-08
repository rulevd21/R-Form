const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const apiSource=fs.readFileSync(path.join(__dirname,'../content_control_api_v0_4.gs'),'utf8');
const botSource=fs.readFileSync(path.join(__dirname,'../owner_bot_v1.gs'),'utf8');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function harness(){
  let seq=0;const props={},cache=new Map(),files=new Map(),folders=new Map(),messages=[];
  const literal=v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v;
  class Sheet{
    constructor(name,headers,rows=[]){this.name=name;this.rows=[headers,...rows];this.fail=null;}
    getName(){return this.name;} getLastRow(){return this.rows.length;}getLastColumn(){return this.rows[0].length;}
    appendRow(r){this.rows.push(r.map(literal));}
    getDataRange(){return this.getRange(1,1,this.rows.length,this.getLastColumn());}
    getRange(r,c,nr=1,nc=1){const self=this;return {
      getDisplayValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>String(self.rows[r+i-1]?.[c+j-1]??''))),
      getDisplayValue(){return this.getDisplayValues()[0][0];},
      getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>self.rows[r+i-1]?.[c+j-1]??'')),
      getValue:()=>self.rows[r-1][c-1],
      setValue(v){
        if(self.name==='CONTENT_QUEUE' && self.rows[0][c-1]==='Publication_Status' &&
           !['NOT_READY','WAITING_TRAINING','WAITING_NUTRITION','READY_FOR_SOURCE_DATA','IN_TEXT','IN_VISUAL','REVIEW','APPROVED',
             'PUBLISHED','SUPERSEDED','SCHEDULED','PUBLISHING','ERROR','PLANNED','HOLD','CANCELLED','READY','NOT_REQUIRED',''].includes(literal(v)))
          throw Error('Live dictionary validation rejects publication status');
        if(self.fail&&self.fail(r,c,v))throw Error('fixture write failure');self.rows[r-1][c-1]=literal(v);
      }
    };}
  }
  const iterator=arr=>{let i=0;return{hasNext:()=>i<arr.length,next:()=>arr[i++]};};
  const blob=(bytes,mime,name)=>({getBytes:()=>bytes,getContentType:()=>mime,getName:()=>name});
  function folder(id){
    const list=[];
    const f={getId:()=>id,getUrl:()=> 'https://drive.google.com/drive/folders/'+id,
      getFiles:()=>iterator(list),createFolder:()=>folder('folder'+String(++seq).padStart(20,'0')),
      createFile(b){
        const id='file'+String(++seq).padStart(20,'0'),data=b.getBytes(),mime=b.getContentType();let name=b.getName();
        const file={getId:()=>id,getName:()=>name,getMimeType:()=>mime,getSize:()=>data.length,
          getBlob:()=>blob(data,mime,name),makeCopy:(n,target)=>target.createFile(blob(data,mime,n))};
        list.push(file);files.set(id,file);return file;
      }};
    folders.set(id,f);return f;
  }
  const utilities={
    DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash('sha256').update(typeof s==='string'?s:Buffer.from(s.map(x=>(x+256)%256))).digest()],
    computeHmacSha256Signature:(s,key)=>[...crypto.createHmac('sha256',key).update(s).digest()],
    base64Encode:s=>Buffer.from(s).toString('base64'),base64EncodeWebSafe:s=>Buffer.from(s).toString('base64url'),
    base64Decode:s=>[...Buffer.from(s,'base64')],newBlob:blob,getUuid:()=>crypto.randomUUID(),
    formatDate:(date,tz,fmt)=>{
      const d=new Date(date.getTime()+3*3600000),pad=n=>String(n).padStart(2,'0');
      const v=pad(d.getUTCDate())+'.'+pad(d.getUTCMonth()+1)+'.'+d.getUTCFullYear()+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes());
      return fmt.endsWith(':ss')?v+':'+pad(d.getUTCSeconds()):v;
    }
  };
  const p={getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}};
  const c={get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)};
  const environment={console:{warn:()=>{},error:()=>{},log:()=>{}},Utilities:utilities,Date,
    PropertiesService:{getScriptProperties:()=>p},CacheService:{getScriptCache:()=>c},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}}),getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    UrlFetchApp:{fetch:()=>{throw Error('UNEXPECTED NETWORK');}},
    DriveApp:{getFolderById:id=>{if(!folders.has(id))throw Error('folder missing');return folders.get(id);},
      getFileById:id=>{if(!files.has(id))throw Error('file missing');return files.get(id);}},
    Session:{getScriptTimeZone:()=> 'Europe/Moscow'}
  };
  const api=vm.createContext({...environment});vm.runInContext(apiSource,api);
  const cfg=vm.runInContext('RFORM_CONTENT_API_V04',api);
  const fields=[...new Set([...cfg.queueFields,...cfg.proposalFields,...vm.runInContext('RFORM_WORKSPACE_FIELDS',api)])];
  const original={Content_ID:'CNT-FIXTURE',Session_ID:'',Proof_Source:'',Publication_Status:'PLANNED',Pipeline_Status:'READY · CHANNEL CONTROL',
    Current_Stage:'OWNER_FINAL_PREVIEW',Public_Data_Allowed:'YES',Source_Packet_Status:'READY',Text_Status:'READY',Visual_Status:'NOT_REQUIRED',
    Approval_Status:'NOT_READY',AutoPost_Allowed:'NO',Telegram_Text:'Исходный текст.',Telegram_Post_Mode:'TEXT_ONLY',
    Preview_Review_Status:'NOT_REVIEWED',Date:'08.10.2026',Rubric:'METHODOLOGY',Telegram_Chat_ID:'@r_form',Updated_At:'08.10.2026 09:00:00'};
  const queue=new Sheet('CONTENT_QUEUE',fields,[fields.map(f=>original[f]||'')]);
  const log=new Sheet('CONTENT_ACTION_LOG',[...cfg.actionLogHeaders]);
  const trainingFields=[...cfg.trainingSessionFields,'Completed_At','Duplicate_Flag'];
  const sessions=new Sheet('TRAINING_SESSIONS',trainingFields);
  const events=new Sheet('DATA_EVENTS',[...cfg.eventFields]);
  const sheets={CONTENT_QUEUE:queue,CONTENT_ACTION_LOG:log,TRAINING_SESSIONS:sessions,DATA_EVENTS:events};
  const spreadsheet={getSheetByName:n=>sheets[n]};
  const sheetApp={openById:()=>spreadsheet,flush:()=>{}};
  api.SpreadsheetApp=sheetApp;folder(cfg.assetsRootFolderId);
  props.RFORM_CONTENT_API_SECRET='fixture-secret';
  const bot=vm.createContext({...environment,SpreadsheetApp:sheetApp});vm.runInContext(botSource,bot);
  Object.assign(props,{RFORM_OWNER_BOT_TOKEN:'fixture',RFORM_CONTENT_API_SECRET:'fixture-secret',
    RFORM_OWNER_TELEGRAM_USER_ID:'42',RFORM_OWNER_TELEGRAM_CHAT_ID:'42',RFORM_OWNER_BOT_ACTIONS_ENABLED:'YES'});
  bot.rformOwnerBotV1Telegram_=(token,method,payload)=>{messages.push({method,payload});return {message_id:++seq};};
  bot.rformOwnerBotV1ApiPost_=req=>{
    api.rformContentApiV04Authorize_(req);
    if(req.operation==='read') return api.rformContentApiV04Payload_();
    if(req.operation==='owner_workspace') return api.rformContentApiV04Workspace_(req);
    if(req.operation==='queue_publication_assets') return api.rformContentApiV04QueuePublicationAssets_(req);
    if(req.operation==='queue_publication_approval') return api.rformContentApiV04ApplyQueuePublicationApproval_(req);
    throw Error('Unexpected operation');
  };
  const item=(index=1)=>Object.fromEntries(fields.map((f,i)=>[f,String(queue.rows[index][i]||'')]));
  const set=(f,v)=>{queue.rows[1][fields.indexOf(f)]=v;};
  const request=(payload,id=crypto.randomBytes(16).toString('hex'))=>({action_id:id,content_id:'CNT-FIXTURE',
    source_hash:api.rformContentApiV04WorkspaceHash_(f=>item()[f]?.trim()||''),nonce:'n',payload});
  const call=p=>api.rformContentApiV04Workspace_(request(p));
  const addSession=(changes={})=>{
    const s={Session_ID:'S-20261008-B',Date:'08.10.2026',Session_Type:'B',Session_Status:'CLOSED',
      Main_Result:'Жим 80×4×4, RIR 3/3/2/2.',Actual_Duration:'60',Session_Decision:'Следовать текущему плану.',
      Completed_At:'08.10.2026 10:00:00',...changes};
    sessions.appendRow(trainingFields.map(f=>s[f]||''));return s;
  };
  const callback=data=>bot.rformOwnerBotV1WorkspaceCallback_({id:'c'+(++seq),from:{id:42},message:{chat:{id:42,type:'private'},message_id:1},data});
  const token=bot.rformOwnerBotV1ItemToken_(item());
  return{api,bot,queue,log,sessions,fields,trainingFields,item,set,request,call,props,cache,messages,files,folders,
    addSession,callback,token,root:folders.get(cfg.assetsRootFolderId),blob};
}


module.exports={harness};
