import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const guard = path.resolve(here, '../scripts/apps-script/guard.mjs');

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function run(args, cwd) {
  return spawnSync(process.execPath, [guard, ...args], {
    cwd,
    encoding: 'utf8'
  });
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rform-apps-script-'));
  const remote = path.join(dir, 'remote');
  fs.mkdirSync(remote);
  fs.writeFileSync(path.join(remote, 'Code.js'), 'function rformContentEventDetectorWriteV03(){ return "old"; }\n');
  fs.writeFileSync(path.join(remote, 'Extra.js'), 'function unrelated(){ return true; }\n');
  fs.writeFileSync(path.join(remote, 'appsscript.json'), '{"timeZone":"Europe/Moscow"}\n');
  fs.writeFileSync(path.join(dir, 'candidate.gs'), 'function rformContentEventDetectorWriteV03(){ return "new"; }\n');
  return {dir, remote};
}

test('inspect is read-only and reports runtime/candidate hashes', () => {
  const {dir, remote} = fixture();
  const runtime = path.join(remote, 'Code.js');
  const before = fs.readFileSync(runtime, 'utf8');
  const out = path.join(dir, 'out');

  const result = run([
    'prepare', '--root', remote,
    '--anchor', 'rformContentEventDetectorWriteV03',
    '--candidate', path.join(dir, 'candidate.gs'),
    '--operation', 'inspect',
    '--expected-runtime', '',
    '--backup', path.join(dir, 'rollback-target'),
    '--output', out
  ], dir);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(runtime, 'utf8'), before);
  const outputs = fs.readFileSync(out, 'utf8');
  assert.match(outputs, /runtime_sha256=[0-9a-f]{64}/);
  assert.match(outputs, /source_sha256=[0-9a-f]{64}/);
});

test('apply changes exactly the anchored file and preserves rollback source', () => {
  const {dir, remote} = fixture();
  const runtime = path.join(remote, 'Code.js');
  const extra = path.join(remote, 'Extra.js');
  const manifest = path.join(remote, 'appsscript.json');
  const runtimeBefore = sha(runtime);
  const extraBefore = sha(extra);
  const manifestBefore = sha(manifest);

  const result = run([
    'prepare', '--root', remote,
    '--anchor', 'rformContentEventDetectorWriteV03',
    '--candidate', path.join(dir, 'candidate.gs'),
    '--operation', 'apply',
    '--expected-runtime', runtimeBefore,
    '--backup', path.join(dir, 'rollback-target'),
    '--output', path.join(dir, 'out')
  ], dir);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(sha(runtime), sha(path.join(dir, 'candidate.gs')));
  assert.equal(sha(extra), extraBefore);
  assert.equal(sha(manifest), manifestBefore);
  assert.equal(sha(path.join(dir, 'rollback-target')), runtimeBefore);
  assert.equal(fs.readFileSync(path.join(dir, 'target-relative-path'), 'utf8').trim(), 'Code.js');
});

test('runtime drift blocks apply before replacement', () => {
  const {dir, remote} = fixture();
  const runtime = path.join(remote, 'Code.js');
  const before = fs.readFileSync(runtime, 'utf8');

  const result = run([
    'prepare', '--root', remote,
    '--anchor', 'rformContentEventDetectorWriteV03',
    '--candidate', path.join(dir, 'candidate.gs'),
    '--operation', 'apply',
    '--expected-runtime', '0'.repeat(64),
    '--backup', path.join(dir, 'rollback-target'),
    '--output', path.join(dir, 'out')
  ], dir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Runtime drift detected/);
  assert.equal(fs.readFileSync(runtime, 'utf8'), before);
});

test('multiple anchor references select the single defining source file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rform-anchor-definition-'));
  const remote = path.join(dir, 'remote');
  fs.mkdirSync(remote);
  fs.writeFileSync(path.join(remote, 'Canonical.js'), "const RFORM_CONTENT_API_V04 = Object.freeze({version:'0.7.0'});\n");
  fs.writeFileSync(path.join(remote, 'ReferenceA.js'), "function a(){ return RFORM_CONTENT_API_V04.version; }\n");
  fs.writeFileSync(path.join(remote, 'ReferenceB.js'), "function b(){ return !!RFORM_CONTENT_API_V04; }\n");
  fs.writeFileSync(path.join(dir, 'candidate.gs'), "const RFORM_CONTENT_API_V04 = Object.freeze({version:'0.7.1'});\n");
  const out = path.join(dir, 'out');

  const result = run([
    'prepare', '--root', remote,
    '--anchor', 'RFORM_CONTENT_API_V04',
    '--candidate', path.join(dir, 'candidate.gs'),
    '--operation', 'inspect',
    '--expected-runtime', '',
    '--backup', path.join(dir, 'rollback-target'),
    '--output', out
  ], dir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /selected the single defining source file/);
  assert.match(fs.readFileSync(out, 'utf8'), /target_relative_path=Canonical\.js/);
});

test('multiple anchor definitions fail closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rform-anchor-ambiguous-'));
  const remote = path.join(dir, 'remote');
  fs.mkdirSync(remote);
  fs.writeFileSync(path.join(remote, 'One.js'), "const RFORM_CONTENT_API_V04 = Object.freeze({version:'one'});\n");
  fs.writeFileSync(path.join(remote, 'Two.js'), "let RFORM_CONTENT_API_V04 = {version:'two'};\n");
  fs.writeFileSync(path.join(dir, 'candidate.gs'), "const RFORM_CONTENT_API_V04 = Object.freeze({version:'candidate'});\n");

  const result = run([
    'prepare', '--root', remote,
    '--anchor', 'RFORM_CONTENT_API_V04',
    '--candidate', path.join(dir, 'candidate.gs'),
    '--operation', 'inspect',
    '--expected-runtime', '',
    '--backup', path.join(dir, 'rollback-target')
  ], dir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing ambiguous target/);
});

test('deployment selector withholds deployment ID from stdout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rform-deployments-'));
  const file = path.join(dir, 'deployments.json');
  const idFile = path.join(dir, 'deployment-id');
  const secretId = 'private-deployment-id-123';
  fs.writeFileSync(file, JSON.stringify([
    {deploymentId: 'head', description: 'Head deployment'},
    {deploymentId: secretId, versionNumber: 18, description: 'production'}
  ]));

  const select = run([
    'select-deployment', '--file', file,
    '--expected-version', '18',
    '--id-file', idFile
  ], dir);

  assert.equal(select.status, 0, select.stderr);
  assert.equal(fs.readFileSync(idFile, 'utf8'), secretId);
  assert.equal(select.stdout.includes(secretId), false);

  fs.writeFileSync(file, JSON.stringify([
    {deploymentId: 'head', description: 'Head deployment'},
    {deploymentId: secretId, versionNumber: 19, description: 'production'}
  ]));

  const verify = run([
    'verify-deployment', '--file', file,
    '--id-file', idFile,
    '--previous-version', '18'
  ], dir);

  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(verify.stdout.includes(secretId), false);
});
