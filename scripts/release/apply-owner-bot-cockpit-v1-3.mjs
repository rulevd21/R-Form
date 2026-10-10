#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const path = 'automation/owner_bot_v1.gs';
const apply = process.argv.includes('--apply');
const source = fs.readFileSync(path, 'utf8');
const sha = crypto.createHash('sha256').update(source).digest('hex');
const acceptedBaseline = '7e014d5f09d5048117398afacc6e2ab242c7e0c9365ada84ae89313d52d1f856';

if (!source.includes("version: '1.2.4'")) {
  if (source.includes("version: '1.3.0'") && source.includes('rformOwnerBotV13SendCockpit_')) {
    console.log('Owner Bot Cockpit patch: ALREADY_APPLIED');
    process.exit(0);
  }
  throw new Error('Owner Bot baseline version is not 1.2.4; fail closed.');
}
if (sha !== acceptedBaseline) {
  throw new Error(`Owner Bot baseline SHA-256 mismatch: ${sha}`);
}

let out = source;
function once(from, to, label) {
  const count = out.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  out = out.replace(from, to);
}

once('// R/Form Owner Bot v1.2.4 · P0 Owner Inbox',
  '// R/Form Owner Bot v1.3.0 · Daily Cockpit + Owner Inbox', 'header');
once("  version: '1.2.4',", "  version: '1.3.0',", 'version');

once(
"function rformOwnerBotV1HandleCallback_(callback) {\n  if (/^ow:/.test(String(callback && callback.data || ''))) return rformOwnerBotV1WorkspaceCallback_(callback);",
"function rformOwnerBotV1HandleCallback_(callback) {\n  if (/^oc:/.test(String(callback && callback.data || ''))) return rformOwnerBotV13CockpitCallback_(callback);\n  if (/^ow:/.test(String(callback && callback.data || ''))) return rformOwnerBotV1WorkspaceCallback_(callback);",
'cockpit callback route');

once(
"  if(/^\\/(start|help|queue)(?:@\\w+)?$/i.test(text)) {rformOwnerBotV1WorkspaceMenu_();return true;}",
"  if(/^\\/(start|today)(?:@\\w+)?$/i.test(text)) {rformOwnerBotV13SendCockpit_();return true;}\n  if(/^\\/(help|queue)(?:@\\w+)?$/i.test(text)) {rformOwnerBotV1WorkspaceMenu_();return true;}",
'cockpit message route');

if (!out.includes('rformOwnerBotV13SendCockpit_')) throw new Error('Cockpit route missing after patch.');
if (!out.includes("version: '1.3.0'")) throw new Error('Version patch missing.');
if (out.includes("version: '1.2.4'")) throw new Error('Old version remains.');

const candidateSha = crypto.createHash('sha256').update(out).digest('hex');
console.log(`Owner Bot baseline SHA-256: ${sha}`);
console.log(`Owner Bot v1.3 candidate SHA-256: ${candidateSha}`);
console.log('Owner Bot Cockpit patch validation: PASS');
if (apply) {
  fs.writeFileSync(path, out);
  console.log('Owner Bot Cockpit patch: APPLIED');
} else {
  console.log('Owner Bot Cockpit patch: DRY_RUN');
}
