import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyBuildReportPatch } from '../scripts/release/apply-owner-bot-build-report-v1-5.mjs';

const base = fs.readFileSync('automation/owner_bot_cockpit_v1_3.gs', 'utf8');

test('Build Report patch is idempotent after materialization', () => {
  const once = applyBuildReportPatch(base);
  const twice = applyBuildReportPatch(once);
  assert.equal(twice, once);
});

test('partial v1.5 materialization fails closed', () => {
  const partial = base.replace("version: '1.4.0'", "version: '1.5.0'");
  assert.throws(() => applyBuildReportPatch(partial), /partial v1\.5 materialization/);
});
