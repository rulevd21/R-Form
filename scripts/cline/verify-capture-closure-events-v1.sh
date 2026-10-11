#!/usr/bin/env bash
set -euo pipefail

REPO="rulevd21/R-Form"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ERROR: run inside R/Form repository"; exit 1; }
cd "$ROOT"

for cmd in node npx gh; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing $cmd"; exit 1; }
done

SESSION_ROOT="${RFORM_CLINE_SESSION_ROOT:-$HOME/.rform-cline}"
LATEST_PATH="$SESSION_ROOT/latest-path"
[[ -s "$LATEST_PATH" ]] || {
  echo "OWNER_ACTION_REQUIRED: RUN_RFORM_CLOUD_ONBOARD"
  exit 2
}
SESSION_DIR="$(cat "$LATEST_PATH")"
[[ -d "$SESSION_DIR/detector" ]] || {
  echo "OWNER_ACTION_REQUIRED: RUN_RFORM_CLOUD_ONBOARD"
  exit 2
}

CLASP_PACKAGE="@google/clasp@3.4.1"
clasp_cmd() { npx --yes "$CLASP_PACKAGE" "$@"; }
logs="$SESSION_DIR/detector-stage3-logs.json"
summary="$SESSION_DIR/detector-stage3-summary.md"
counts="$SESSION_DIR/detector-stage3-counts.json"

set +e
(
  cd "$SESSION_DIR/detector"
  clasp_cmd tail-logs --json > "$logs" 2>/dev/null
)
rc=$?
if [[ "$rc" -ne 0 ]]; then
  (
    cd "$SESSION_DIR/detector"
    clasp_cmd logs --json > "$logs" 2>/dev/null
  )
  rc=$?
fi
set -e
[[ "$rc" -eq 0 ]] || {
  rm -f "$logs" "$summary" "$counts"
  echo "BLOCKED: detector Cloud Logging readback unavailable through authenticated clasp."
  exit 3
}

node scripts/apps-script/parse-detector-receipts.mjs "$logs" "$summary" > "$counts"
rm -f "$logs"

node - "$counts" <<'NODE'
const fs=require('fs');
const v=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (!(v.scheduled_run_count >= 1)) throw new Error('no complete natural scheduled v0.4 receipt');
if (!(v.scheduled_noop_count >= 1)) throw new Error('no zero-mutation scheduled NO_OP receipt');
console.log('STAGE3_RECEIPT_GATE: PASS');
NODE

# Post only the parser-generated safe summary. Raw logs stay private and are removed.
gh issue comment 42 --repo "$REPO" --body-file "$summary" >/dev/null
rm -f "$summary" "$counts"

echo "DONE: Stage 3 native scheduled receipt + NO_OP gate passed and safe evidence was posted to Issue #42."
echo "NEXT: promote only the content_event_detector component in RFORM_RUNTIME_MANIFEST.json through a reviewed PR, then close #42."
