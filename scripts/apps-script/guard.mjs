#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for --${key}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function walk(root) {
  const result = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) result.push(full);
    }
  };
  visit(root);
  return result.sort();
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fileHashes(root) {
  const map = new Map();
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    map.set(rel, sha256File(file));
  }
  return map;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function definesAnchor(text, anchor) {
  const escaped = escapeRegex(anchor);
  return [
    new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b`),
    new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`),
    new RegExp(`\\b${escaped}\\s*=`)
  ].some(pattern => pattern.test(text));
}

function locateAnchor(root, anchor) {
  const candidates = walk(root).filter(file => /\.(?:gs|js)$/i.test(file));
  const matches = [];
  for (const file of candidates) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(anchor)) matches.push({file, text});
  }

  if (matches.length === 1) return matches[0].file;

  if (matches.length > 1) {
    const defining = matches.filter(item => definesAnchor(item.text, anchor));
    if (defining.length === 1) {
      console.log(`Anchor text appears in ${matches.length} files; selected the single defining source file.`);
      return defining[0].file;
    }
    fail(`Anchor ${JSON.stringify(anchor)} appears in ${matches.length} runtime source files and has ${defining.length} defining files; refusing ambiguous target.`);
  }

  fail(`Expected at least one runtime source file containing anchor ${JSON.stringify(anchor)}; found 0`);
}

function appendOutput(outputFile, key, value) {
  if (!outputFile) return;
  if (/[\r\n]/.test(String(value))) fail(`Refusing multiline GitHub output for ${key}`);
  fs.appendFileSync(outputFile, `${key}=${value}\n`, 'utf8');
}

function commandPrepare(args) {
  const root = args.root;
  const anchor = args.anchor;
  const candidate = args.candidate;
  const operation = args.operation;
  const expectedRuntime = args['expected-runtime'] || '';
  const backup = args.backup;
  const output = args.output;

  if (!root || !anchor || !candidate || !operation || !backup) {
    fail('prepare requires --root --anchor --candidate --operation --backup');
  }
  if (!['inspect', 'apply'].includes(operation)) fail('operation must be inspect or apply');
  if (!fs.existsSync(root)) fail(`Runtime root does not exist: ${root}`);
  if (!fs.existsSync(candidate)) fail(`Candidate source does not exist: ${candidate}`);

  const candidateText = fs.readFileSync(candidate, 'utf8');
  if (!candidateText.includes(anchor)) fail(`Candidate source does not contain anchor ${JSON.stringify(anchor)}`);

  const target = locateAnchor(root, anchor);
  const targetRel = path.relative(root, target).split(path.sep).join('/');
  const before = fileHashes(root);
  const runtimeHash = sha256File(target);
  const sourceHash = sha256File(candidate);

  if (expectedRuntime && runtimeHash !== expectedRuntime) {
    fail(`Runtime drift detected. Current target SHA-256 ${runtimeHash} does not match expected ${expectedRuntime}`);
  }

  appendOutput(output, 'runtime_sha256', runtimeHash);
  appendOutput(output, 'source_sha256', sourceHash);
  appendOutput(output, 'target_relative_path', targetRel);

  console.log(`Runtime target located by anchor: ${targetRel}`);
  console.log(`Runtime SHA-256 before: ${runtimeHash}`);
  console.log(`Candidate SHA-256: ${sourceHash}`);

  if (operation === 'inspect') return;

  fs.copyFileSync(target, backup);
  fs.chmodSync(backup, 0o600);

  const targetPathFile = path.join(path.dirname(backup), 'target-relative-path');
  fs.writeFileSync(targetPathFile, `${targetRel}\n`, {mode: 0o600});

  fs.copyFileSync(candidate, target);
  const after = fileHashes(root);

  const changed = [];
  const all = new Set([...before.keys(), ...after.keys()]);
  for (const rel of all) {
    if (before.get(rel) !== after.get(rel)) changed.push(rel);
  }

  if (changed.length !== 1 || changed[0] !== targetRel) {
    fail(`Safety boundary violated: expected only ${targetRel} to change, got ${JSON.stringify(changed)}`);
  }

  const stagedHash = sha256File(target);
  if (stagedHash !== sourceHash) fail('Staged target hash does not equal candidate hash');

  console.log('Guard passed: exactly one pulled runtime source file was replaced; all other pulled files and manifest are unchanged.');
}

function commandVerify(args) {
  const root = args.root;
  const anchor = args.anchor;
  const expected = args['expected-source'];
  const output = args.output;
  if (!root || !anchor || !expected) fail('verify requires --root --anchor --expected-source');

  const target = locateAnchor(root, anchor);
  const hash = sha256File(target);
  if (hash !== expected) fail(`Source readback mismatch. Got ${hash}, expected ${expected}`);

  appendOutput(output, 'readback_sha256', hash);
  console.log(`Exact source readback passed: ${hash}`);
}

function readDeployments(file) {
  if (!file || !fs.existsSync(file)) fail(`Deployment inventory not found: ${file || '(missing)'}`);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(value)) fail('Expected clasp deployment inventory JSON array');
  return value;
}

function commandSummarizeDeployments(args) {
  const deployments = readDeployments(args.file);
  const versions = deployments
    .map(item => item?.versionNumber)
    .filter(value => Number.isInteger(value))
    .sort((a, b) => a - b);

  console.log(`Deployment inventory read successfully: ${deployments.length} deployment record(s).`);
  console.log(`Versioned deployments: ${versions.length ? versions.join(', ') : '(none)'}.`);
  console.log('Deployment IDs are intentionally not printed.');
}

function commandSelectDeployment(args) {
  const deployments = readDeployments(args.file);
  const expected = Number(args['expected-version']);
  const idFile = args['id-file'];
  if (!Number.isInteger(expected) || expected <= 0 || !idFile) {
    fail('select-deployment requires positive --expected-version and --id-file');
  }

  const matches = deployments.filter(item =>
    item?.versionNumber === expected && typeof item?.deploymentId === 'string' && item.deploymentId
  );
  if (matches.length !== 1) {
    fail(`Expected exactly one existing deployment at version ${expected}; found ${matches.length}`);
  }

  fs.writeFileSync(idFile, matches[0].deploymentId, {mode: 0o600});
  console.log(`Existing production deployment selected uniquely by expected version ${expected}; ID withheld.`);
}

function commandVerifyDeployment(args) {
  const deployments = readDeployments(args.file);
  const idFile = args['id-file'];
  const previous = Number(args['previous-version']);
  if (!idFile || !fs.existsSync(idFile) || !Number.isInteger(previous) || previous <= 0) {
    fail('verify-deployment requires --id-file and positive --previous-version');
  }

  const id = fs.readFileSync(idFile, 'utf8').trim();
  const matches = deployments.filter(item => item?.deploymentId === id);
  if (matches.length !== 1) fail(`Expected redeployed ID exactly once; found ${matches.length}`);

  const current = matches[0]?.versionNumber;
  if (!Number.isInteger(current) || current <= previous) {
    fail(`Deployment version did not advance. Previous ${previous}; current ${String(current)}`);
  }

  console.log(`Deployment readback passed: existing deployment advanced from version ${previous} to ${current}; ID withheld.`);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

switch (command) {
  case 'prepare':
    commandPrepare(args);
    break;
  case 'verify':
    commandVerify(args);
    break;
  case 'summarize-deployments':
    commandSummarizeDeployments(args);
    break;
  case 'select-deployment':
    commandSelectDeployment(args);
    break;
  case 'verify-deployment':
    commandVerifyDeployment(args);
    break;
  default:
    fail('Usage: guard.mjs <prepare|verify|summarize-deployments|select-deployment|verify-deployment> [options]');
}
