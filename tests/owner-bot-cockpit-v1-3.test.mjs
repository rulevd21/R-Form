import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { findHardcodedChannelIds } from '../scripts/apps-script/no-hardcoded-telegram-chat-id.mjs';

const code = fs.readFileSync('automation/owner_bot_cockpit_v1_3.gs', 'utf8');
const context = {
  console,
  Date,
  Set,
  Number,
  String,
  JSON,
  Math,
  Object,
  Array,
  RegExp,
  Utilities: {
    formatDate() { return '10.10.2026'; }
  },
  RFORM_OWNER_BOT_V1: {spreadsheetId: 'TEST', props: {apiSecret: 'secret'}},
  rformOwnerBotV1ReadyItems_(queue) { return queue.filter(x => x.__ready); },
  rformOwnerBotV1MaterialSection_(q) { return q.__section || 'work'; },
  rformOwnerBotV1ItemToken_(q) { return 'aaaaaaaaaaaaaaaa'; },
  rformOwnerBotV1MaterialTitle_(q) { return q.__title || q.Content_ID || 'Материал'; },
  rformOwnerBotV1DateSort_() { return 0; },
  rformOwnerBotV1Sha256Hex_(value) {
    return String(value).includes('EVT-GATE') ? 'bbbbbbbbbbbbbbbb' : 'cccccccccccccccc';
  }
};
vm.createContext(context);
vm.runInContext(code, context);
const call = expr => vm.runInContext(expr, context);

test('only explicit DATA_EVENTS owner gates are actionable', () => {
  assert.equal(call(`rformOwnerBotV13EventNeedsOwner_({Event_ID:'EVT-GATE',Status:'OWNER_GATE',Manual_Gate:'YES · OWNER',Owner_Action:'Approve'})`), true);
  assert.equal(call(`rformOwnerBotV13EventNeedsOwner_({Event_ID:'EVT-COVERED',Status:'ALREADY_IN_PIPELINE',Manual_Gate:'NO',Owner_Action:'NONE · covered'})`), false);
  assert.equal(call(`rformOwnerBotV13EventNeedsOwner_({Event_ID:'EVT-WEEKLY',Status:'OWNER_GATE',Manual_Gate:'YES',Owner_Action:'Choose',Owner_Review_Status:'WEEKLY'})`), false);
  assert.equal(call(`rformOwnerBotV13EventNeedsOwner_({Event_ID:'EVT-NONE',Status:'DATA_READY',Manual_Gate:'NO',Owner_Action:'NONE'})`), false);
});

test('closure becomes owner action only when ready, unblocked and not already requested', () => {
  assert.equal(call(`rformOwnerBotV13ClosureNeedsOwner_({close_readiness:'READY',blocking_issues:'',closed_at:'',close_request:''})`), true);
  assert.equal(call(`rformOwnerBotV13ClosureNeedsOwner_({close_readiness:'READY',blocking_issues:'missing data',closed_at:'',close_request:''})`), false);
  assert.equal(call(`rformOwnerBotV13ClosureNeedsOwner_({close_readiness:'READY',blocking_issues:'',closed_at:'10:00',close_request:''})`), false);
  assert.equal(call(`rformOwnerBotV13ClosureNeedsOwner_({close_readiness:'READY',blocking_issues:'',closed_at:'',close_request:'REQUESTED'})`), false);
});

test('closure-ready state appears as an owner decision when capacity is available', () => {
  const model = call(`rformOwnerBotV13CockpitModel_(
    {found:true,date:'10.10.2026',day_id:'D-20261010',close_readiness:'READY',blocking_issues:'',closed_at:'',close_request:''},
    {queue:[],events:[]}
  )`);
  assert.equal(model.owner_decision_total, 1);
  assert.equal(model.owner_decisions[0].kind, 'DAY_CLOSE');
});

test('cockpit caps visible owner decisions at three and prioritizes final preview', () => {
  const model = call(`rformOwnerBotV13CockpitModel_(
    {found:true,date:'10.10.2026',day_id:'D-20261010',close_readiness:'READY',blocking_issues:'',closed_at:'',close_request:''},
    {queue:[{Content_ID:'CNT-1',__ready:true,__title:'Готовый пост'}],events:[
      {Event_ID:'EVT-GATE',Status:'OWNER_GATE',Manual_Gate:'YES',Owner_Action:'Approve',Fact:'Факт',Content_Value_Score:'90'},
      {Event_ID:'EVT-GATE-2',Status:'OWNER_GATE',Manual_Gate:'YES',Owner_Action:'Approve',Fact:'Факт 2',Content_Value_Score:'80'}
    ]}
  )`);
  assert.equal(model.owner_decision_total, 4);
  assert.equal(model.owner_decisions.length, 3);
  assert.equal(model.owner_decisions[0].kind, 'CONTENT_PREVIEW');
  assert.ok(model.owner_decisions.every(x => ['CONTENT_PREVIEW','DAY_CLOSE','EVENT_GATE'].includes(x.kind)));
});

test('rendered cockpit contains state counts but no routine work list', () => {
  const rendered = call(`rformOwnerBotV13RenderCockpit_({
    date:'10.10.2026',closure:{found:true,close_readiness:'OPEN',blocking_issues:'missing meal'},
    event_counts:{total:5,owner_gate:0},queue_counts:{open:4,final_preview:0},
    owner_decision_total:0,owner_decisions:[]
  })`);
  assert.match(rendered.text, /Closure: OPEN · есть блокер/);
  assert.match(rendered.text, /DATA_EVENTS: 5 · решений владельца 0/);
  assert.match(rendered.text, /Ничего\. Система не требует решения владельца\./);
  assert.doesNotMatch(rendered.text, /missing meal/);
  assert.deepEqual(JSON.parse(JSON.stringify(rendered.keyboard)), [
    [{text:'Обновить',callback_data:'oc:r'}],
    [{text:'Материалы',callback_data:'ow:menu'}]
  ]);
});

test('automation sources contain no hardcoded numeric Telegram channel IDs', () => {
  const automationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'automation');
  const offenders = findHardcodedChannelIds(automationDir);
  assert.deepEqual(offenders, [], `Hardcoded numeric Telegram channel IDs found: ${offenders.join(', ')}`);
});
