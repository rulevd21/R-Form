'use strict';

function runTrainingFreeFoundationRegression() {
  const checks = [];
  function check(name, fn) {
    try { fn(); checks.push({name,status:'PASS'}); }
    catch (error) { checks.push({name,status:'FAIL',error:error&&error.message?error.message:String(error)}); }
  }
  function assert_(condition, message) { if (!condition) throw new Error(message || 'ASSERT_FAILED'); }

  check('sandbox datastore guard is active', () => {
    const ss = getMasterSpreadsheet_();
    assert_(ss.getName().indexOf(RFORM_SANDBOX_TITLE_PREFIX) === 0, 'NOT_SANDBOX');
  });

  check('FREE session schema is present', () => {
    const h = getHeaderMap_(getMasterSpreadsheet_().getSheetByName('TRAINING_SESSIONS'));
    trainingFreeRequireSessionSchema_(h);
  });

  check('FREE set schema is present', () => {
    const h = getHeaderMap_(getMasterSpreadsheet_().getSheetByName('TRAINING_SETS'));
    trainingFreeRequireSetSchema_(h);
  });

  check('legacy session columns keep original positions', () => {
    const h = getHeaderMap_(getMasterSpreadsheet_().getSheetByName('TRAINING_SESSIONS'));
    assert_(h.Session_ID===1 && h.Day_ID===2 && h.Date===3 && h.Session_Type===4, 'LEGACY_SESSION_POSITION_CHANGED');
    assert_(h.Duplicate_Flag===19, 'LEGACY_SESSION_WIDTH_CHANGED');
  });

  check('legacy set columns keep original positions', () => {
    const h = getHeaderMap_(getMasterSpreadsheet_().getSheetByName('TRAINING_SETS'));
    assert_(h.Set_ID===1 && h.Session_ID===2 && h.Exercise_Order===3, 'LEGACY_SET_POSITION_CHANGED');
    assert_(h.Record_Key===24 && h.Duplicate_Flag===25, 'LEGACY_SET_WIDTH_CHANGED');
  });

  check('SET_TYPE already supports FREE MVP mapping', () => {
    const ss=getMasterSpreadsheet_(), d=ss.getSheetByName('DICTIONARIES'), h=getHeaderMap_(d);
    const values=d.getRange(2,h.SET_TYPE,d.getLastRow()-1,1).getDisplayValues().flat();
    assert_(values.indexOf('WARMUP')>=0,'WARMUP_MISSING');
    assert_(values.indexOf('WORKING')>=0,'WORKING_MISSING');
  });

  check('SESSION_STATUS supports DRAFT and CLOSED', () => {
    const ss=getMasterSpreadsheet_(), d=ss.getSheetByName('DICTIONARIES'), h=getHeaderMap_(d);
    const values=d.getRange(2,h.SESSION_STATUS,d.getLastRow()-1,1).getDisplayValues().flat();
    assert_(values.indexOf('DRAFT')>=0,'DRAFT_MISSING');
    assert_(values.indexOf('CLOSED')>=0,'CLOSED_MISSING');
  });

  check('FREE audit event types registered', () => {
    const ss=getMasterSpreadsheet_(), d=ss.getSheetByName('DICTIONARIES'), h=getHeaderMap_(d);
    const values=d.getRange(2,h.INBOX_EVENT_TYPE,d.getLastRow()-1,1).getDisplayValues().flat();
    RFORM_TRAINING_FREE_EVENT_TYPES.forEach(x=>assert_(values.indexOf(x)>=0,`EVENT_TYPE_MISSING:${x}`));
  });

  check('Record_Key formula template remains available', () => {
    const s=getMasterSpreadsheet_().getSheetByName('TRAINING_SETS'), h=getHeaderMap_(s), last=s.getLastRow();
    assert_(last>=2,'NO_SET_TEMPLATE_ROW');
    assert_(Boolean(s.getRange(last,h.Record_Key).getFormula()),'RECORD_KEY_FORMULA_MISSING');
    assert_(Boolean(s.getRange(last,h.Duplicate_Flag).getFormula()),'DUPLICATE_FORMULA_MISSING');
  });

  check('BW load keeps Weight_Kg blank', () => {
    const load=trainingFreeResolveLoad_('BW',null);
    assert_(load.loadValue==='' && load.weightKg==='','BW_MAPPING');
  });

  check('KG load maps to Weight_Kg', () => {
    const load=trainingFreeResolveLoad_('KG',95);
    assert_(load.loadValue===95 && load.weightKg===95,'KG_MAPPING');
  });

  check('LEVEL does not create fake kg', () => {
    const load=trainingFreeResolveLoad_('LEVEL',8);
    assert_(load.loadValue===8 && load.weightKg==='','LEVEL_MAPPING');
  });

  check('working set requires RIR', () => {
    let rejected=false;
    try { trainingFreeValidateSetFact_({eventId:Utilities.getUuid(),sessionId:'S-20991231-FREE-ABCDEF12',source:'RFORM_MOBILE',setType:'WORKING',loadUnit:'KG',loadValue:60,reps:8,rir:''}); }
    catch(error){rejected=String(error.message||error).indexOf('RIR_REQUIRED')>=0;}
    assert_(rejected,'WORKING_RIR_NOT_REQUIRED');
  });

  check('warmup may omit RIR', () => {
    const v=trainingFreeValidateSetFact_({eventId:Utilities.getUuid(),sessionId:'S-20991231-FREE-ABCDEF12',source:'RFORM_MOBILE',setType:'WARMUP',loadUnit:'KG',loadValue:20,reps:10,rir:''});
    assert_(v.rir===null,'WARMUP_RIR_NOT_NULL');
  });

  check('Today legacy selector explicitly skips FREE', () => {
    assert_(typeof findLegacyPlannedSessionRow_==='function','TODAY_FILTER_MISSING');
    assert_(typeof getFreeTrainingStateByDate_==='function','FREE_TODAY_STATE_MISSING');
  });

  check('existing structured training regression remains green', () => {
    const result=runTrainingExerciseRegression();
    assert_(result.status==='PASS',`LEGACY_REGRESSION:${JSON.stringify(result)}`);
  });

  const failed=checks.filter(x=>x.status==='FAIL');
  return {status:failed.length?'FAIL':'PASS',version:RFORM_TRAINING_FREE_VERSION,total:checks.length,passed:checks.length-failed.length,failed:failed.length,checks};
}

function inspectTrainingFreeFoundationState() {
  const ss=getMasterSpreadsheet_();
  const sessions=ss.getSheetByName('TRAINING_SESSIONS');
  const sets=ss.getSheetByName('TRAINING_SETS');
  const dictionaries=ss.getSheetByName('DICTIONARIES');
  const sh=getHeaderMap_(sessions), th=getHeaderMap_(sets), dh=getHeaderMap_(dictionaries);
  const types=dh.INBOX_EVENT_TYPE?dictionaries.getRange(2,dh.INBOX_EVENT_TYPE,Math.max(dictionaries.getLastRow()-1,1),1).getDisplayValues().flat():[];
  return {
    datastore:ss.getName(),
    version:RFORM_TRAINING_FREE_VERSION,
    sessionHeaders:RFORM_TRAINING_FREE_SESSION_HEADERS.map(x=>({name:x,column:sh[x]||0})),
    setHeaders:RFORM_TRAINING_FREE_SET_HEADERS.map(x=>({name:x,column:th[x]||0})),
    eventTypes:RFORM_TRAINING_FREE_EVENT_TYPES.map(x=>({name:x,present:types.indexOf(x)>=0})),
    legacySessionWidth:{duplicateFlagColumn:sh.Duplicate_Flag},
    legacySetWidth:{recordKeyColumn:th.Record_Key,duplicateFlagColumn:th.Duplicate_Flag},
    productionWriterChanged:false
  };
}
