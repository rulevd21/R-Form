#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ERROR: run inside R/Form repository"; exit 1; }
cd "$ROOT"

for cmd in git node npx sha256sum grep; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing $cmd"; exit 1; }
done

SESSION_ROOT="${RFORM_CLINE_SESSION_ROOT:-$HOME/.rform-cline}"
LATEST_PATH="$SESSION_ROOT/latest-path"
[[ -s "$LATEST_PATH" ]] || {
  echo "OWNER_ACTION_REQUIRED: RUN_RFORM_CLOUD_ONBOARD"
  exit 2
}
SESSION_DIR="$(cat "$LATEST_PATH")"
[[ -d "$SESSION_DIR/content-api/remote" ]] || {
  echo "OWNER_ACTION_REQUIRED: RUN_RFORM_CLOUD_ONBOARD"
  exit 2
}

CLASP_PACKAGE="@google/clasp@3.4.1"
clasp_cmd() { npx --yes "$CLASP_PACKAGE" "$@"; }

candidate="$ROOT/automation/telegram_content_metrics_v1.gs"
[[ -s "$candidate" ]] || { echo "ERROR: candidate source missing"; exit 3; }

git merge-base --is-ancestor "$(git rev-parse HEAD)" origin/main 2>/dev/null || true

project="$SESSION_DIR/content-api"
remote="$project/remote"
target="$remote/telegram_content_metrics_v1.gs"
rollback="$SESSION_DIR/content-api-metrics-rollback-version"

# Require the canonical Content API project to be the one discovered by bootstrap.
grep -R -F -q --include='*.gs' --include='*.js' 'RFORM_CONTENT_API_V04' "$remote" || {
  echo "ERROR: content-api anchor missing from private runtime pull"
  exit 4
}

candidate_hash="$(sha256sum "$candidate" | awk '{print $1}')"

if [[ -f "$target" ]]; then
  live_hash="$(sha256sum "$target" | awk '{print $1}')"
  if [[ "$live_hash" == "$candidate_hash" ]]; then
    echo "SOURCE_ALREADY_DEPLOYED: $candidate_hash"
  else
    echo "ERROR: an existing Telegram metrics runtime file differs from the reviewed candidate. Reconcile manually; no overwrite performed."
    exit 5
  fi
else
  (
    cd "$project"
    clasp_cmd create-version "R/Form rollback before Telegram metrics v1" --json > "$SESSION_DIR/metrics-rollback.json"
  )
  node - "$SESSION_DIR/metrics-rollback.json" "$rollback" <<'NODE'
const fs=require('fs');
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const n=String(input.versionNumber || '');
if(!/^[1-9][0-9]*$/.test(n)) throw new Error('rollback version missing');
fs.writeFileSync(process.argv[3], n+'\n', {mode:0o600});
NODE
  rm -f "$SESSION_DIR/metrics-rollback.json"
  cp "$candidate" "$target"
  (
    cd "$project"
    clasp_cmd push --force
    rm -rf remote
    mkdir -p remote
    clasp_cmd pull
  )
  [[ -f "$target" ]] || { echo "ERROR: metrics file missing after pull readback"; exit 6; }
  readback_hash="$(sha256sum "$target" | awk '{print $1}')"
  [[ "$readback_hash" == "$candidate_hash" ]] || {
    echo "ERROR: metrics source hash mismatch after push"
    exit 7
  }
  echo "SOURCE_READBACK: PASS"
fi

# Try API-executable invocation. If the project has no execution deployment,
# fail closed and request only the one unavoidable Apps Script UI action.
set +e
(
  cd "$project"
  clasp_cmd run rformTelegramMetricsInstallTriggerV1 --json > "$SESSION_DIR/metrics-trigger-install.json" 2> "$SESSION_DIR/metrics-trigger-install.err"
)
run_rc=$?
set -e

if [[ "$run_rc" -ne 0 ]]; then
  rm -f "$SESSION_DIR/metrics-trigger-install.json" "$SESSION_DIR/metrics-trigger-install.err"
  echo "OWNER_ACTION_REQUIRED: RUN_APPS_SCRIPT_FUNCTION_rformTelegramMetricsInstallTriggerV1"
  echo "Reviewed source is deployed and hash-verified; trigger installation was not executed because this Apps Script project does not expose a safe clasp-run path."
  exit 8
fi

node - "$SESSION_DIR/metrics-trigger-install.json" <<'NODE'
const fs=require('fs');
const raw=fs.readFileSync(process.argv[2],'utf8').trim();
if(!raw) throw new Error('empty trigger result');
let v;
try { v=JSON.parse(raw); } catch (_) { throw new Error('trigger result is not JSON'); }
const text=JSON.stringify(v);
if(!/INSTALLED|ALREADY_INSTALLED/.test(text)) throw new Error('trigger installation not confirmed');
console.log('TRIGGER_INSTALL: PASS');
NODE
rm -f "$SESSION_DIR/metrics-trigger-install.json" "$SESSION_DIR/metrics-trigger-install.err"

echo "DONE: Telegram metrics source deployed and trigger confirmed."
echo "NOTE: Issue #57 remains open until a real in-window checkpoint writes source-backed metrics and an immediate rerun is a no-op."
