#!/usr/bin/env node
// CI guard: reject hardcoded numeric Telegram channel IDs in automation sources.
// The R/Form channel chat id must be read from the RFORM_TG_CHAT_ID Script Property.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Telegram channel/supergroup chat ids are negative and begin with -100.
export const HARDCODED_CHANNEL_ID = /-100[0-9]+/;

export function findHardcodedChannelIds(automationDir) {
  const offenders = [];
  for (const name of fs.readdirSync(automationDir).sort()) {
    if (!/\.(gs|js)$/i.test(name)) continue;
    const lines = fs.readFileSync(path.join(automationDir, name), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (HARDCODED_CHANNEL_ID.test(line)) offenders.push(`${name}:${index + 1}`);
    });
  }
  return offenders;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const root = path.resolve(path.dirname(self), '..', '..');
  const offenders = findHardcodedChannelIds(path.join(root, 'automation'));
  if (offenders.length) {
    console.error('Hardcoded numeric Telegram channel IDs found: ' + offenders.join(', '));
    process.exit(1);
  }
  console.log('No hardcoded numeric Telegram channel IDs in automation sources.');
}
