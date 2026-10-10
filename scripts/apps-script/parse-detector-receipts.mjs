import fs from 'node:fs';
import process from 'node:process';

function extractJsonObjects(text) {
  const out = [];
  let start = -1, depth = 0, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (start === -1) {
      if (ch === '{') { start = i; depth = 1; inString = false; escaped = false; }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

function collectReceipts(value, receipts, seenStrings = new Set()) {
  if (value == null) return;
  if (typeof value === 'string') {
    if (!value.includes('RFORM_DETECTOR_RUN') || seenStrings.has(value)) return;
    seenStrings.add(value);
    const direct = value.trim();
    try { collectReceipts(JSON.parse(direct), receipts, seenStrings); } catch (_) {}
    for (const objectText of extractJsonObjects(value)) {
      try { collectReceipts(JSON.parse(objectText), receipts, seenStrings); } catch (_) {}
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(v => collectReceipts(v, receipts, seenStrings));
    return;
  }
  if (typeof value === 'object') {
    if (value.message === 'RFORM_DETECTOR_RUN') receipts.push(value);
    Object.values(value).forEach(v => collectReceipts(v, receipts, seenStrings));
  }
}

export function parseDetectorReceipts(raw) {
  const receipts = [];
  const seenStrings = new Set();
  for (const objectText of extractJsonObjects(String(raw || ''))) {
    try { collectReceipts(JSON.parse(objectText), receipts, seenStrings); } catch (_) {}
  }
  if (String(raw || '').includes('RFORM_DETECTOR_RUN')) collectReceipts(String(raw || ''), receipts, seenStrings);

  const unique = [];
  const seen = new Set();
  for (const r of receipts) {
    const key = [r.run_id, r.phase, r.started_at, r.completed_at, r.outcome].join('|');
    if (!seen.has(key)) { seen.add(key); unique.push(r); }
  }

  const groups = new Map();
  for (const r of unique) {
    if (!r.run_id) continue;
    if (!groups.has(r.run_id)) groups.set(r.run_id, {});
    groups.get(r.run_id)[String(r.phase || '').toUpperCase()] = r;
  }

  const complete = [];
  for (const pair of groups.values()) {
    const start = pair.START, finish = pair.FINISH;
    if (!start || !finish) continue;
    const componentVersion = String(finish.component_version || start.component_version || '');
    const lifecycleVersion = String(finish.lifecycle_version || start.lifecycle_version || '');
    const invocationKind = String(finish.invocation_kind || start.invocation_kind || '');
    const counters = finish.counters && typeof finish.counters === 'object' ? finish.counters : {};
    complete.push({
      startedAt: String(start.started_at || finish.started_at || ''),
      completedAt: String(finish.completed_at || ''),
      componentVersion,
      lifecycleVersion,
      observabilityVersion: String(finish.observability_version || start.observability_version || ''),
      invocationKind,
      outcome: String(finish.outcome || ''),
      mutationCount: Number.isInteger(finish.mutation_count) ? finish.mutation_count : null,
      counters: {
        inserted: Number.isInteger(counters.inserted) ? counters.inserted : null,
        updated: Number.isInteger(counters.updated) ? counters.updated : null,
        unchanged: Number.isInteger(counters.unchanged) ? counters.unchanged : null,
        filtered: Number.isInteger(counters.filtered) ? counters.filtered : null,
        filteredUnchanged: Number.isInteger(counters.filteredUnchanged) ? counters.filteredUnchanged : null,
        totalDetected: Number.isInteger(counters.totalDetected) ? counters.totalDetected : null
      }
    });
  }
  complete.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const scheduled = complete.filter(r =>
    r.componentVersion === '0.4' && r.lifecycleVersion === '1.0' &&
    r.observabilityVersion === '0.1' && r.invocationKind === 'INSTALLABLE_EVENT' &&
    r.outcome !== 'ERROR'
  );
  return { complete, scheduled };
}

function formatRun(run) {
  const c = run.counters || {};
  return `- ${run.startedAt || 'time-unavailable'} → ${run.outcome || 'UNKNOWN'}; mutations=${run.mutationCount ?? 'n/a'}; counters inserted=${c.inserted ?? 'n/a'}, updated=${c.updated ?? 'n/a'}, unchanged=${c.unchanged ?? 'n/a'}, filtered=${c.filtered ?? 'n/a'}, filteredUnchanged=${c.filteredUnchanged ?? 'n/a'}, totalDetected=${c.totalDetected ?? 'n/a'}`;
}

function main() {
  const args = process.argv.slice(2);
  const input = args[0];
  if (!input) throw new Error('usage: parse-detector-receipts.mjs <log-file> [summary-file]');
  const summaryFile = args[1] || '';
  const parsed = parseDetectorReceipts(fs.readFileSync(input, 'utf8'));
  const latest = parsed.scheduled.slice(-3);
  const noOps = parsed.scheduled.filter(r => r.outcome === 'NO_OP' && r.mutationCount === 0);
  const result = {
    scheduled_run_count: parsed.scheduled.length,
    scheduled_noop_count: noOps.length,
    latest_outcome: latest.length ? latest[latest.length - 1].outcome : null,
    latest_started_at: latest.length ? latest[latest.length - 1].startedAt : null,
    latest_mutation_count: latest.length ? latest[latest.length - 1].mutationCount : null
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  if (summaryFile) {
    const lines = [
      '<!-- capture-closure-events-log-evidence -->',
      '### Capture → Closure → Events · scheduled receipt readback',
      '',
      `- Complete natural v0.4/lifecycle 1.0 scheduled runs visible in Cloud Logging: **${parsed.scheduled.length}**`,
      `- Zero-mutation NO_OP scheduled runs visible: **${noOps.length}**`,
      ''
    ];
    if (latest.length) {
      lines.push('Latest safe receipts:');
      latest.forEach(r => lines.push(formatRun(r)));
    } else {
      lines.push('No complete `INSTALLABLE_EVENT` START/FINISH receipt pair for detector v0.4 is visible in the current log window.');
    }
    lines.push('', 'No project IDs, trigger IDs, OAuth material or private URLs are included in this readback.');
    fs.writeFileSync(summaryFile, lines.join('\n') + '\n', {mode: 0o600});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
