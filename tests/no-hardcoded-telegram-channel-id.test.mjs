import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findHardcodedChannelIds } from '../scripts/apps-script/no-hardcoded-telegram-chat-id.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('automation sources contain no hardcoded numeric Telegram channel IDs', () => {
  const offenders = findHardcodedChannelIds(path.join(root, 'automation'));
  assert.deepEqual(offenders, [], `Hardcoded numeric Telegram channel IDs found: ${offenders.join(', ')}`);
});
