#!/usr/bin/env bash
set -euo pipefail

REPO="rulevd21/R-Form"
CLASP_PACKAGE="@google/clasp@3.4.1"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$ROOT" ]]; then
  echo "ERROR: run inside the R/Form repository."
  exit 1
fi
cd "$ROOT"

remote_url="$(git remote get-url origin 2>/dev/null || true)"
case "$remote_url" in
  *rulevd21/R-Form*) ;;
  *) echo "ERROR: unexpected repository remote."; exit 1 ;;
esac

for command in git node npm npx grep find sha256sum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command"
    exit 1
  }
done

SESSION_ROOT="${RFORM_CLINE_SESSION_ROOT:-$HOME/.rform-cline}"
mkdir -p "$SESSION_ROOT"
chmod 700 "$SESSION_ROOT"
SESSION_DIR="$SESSION_ROOT/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$SESSION_DIR"
chmod 700 "$SESSION_DIR"

clasp_cmd() {
  npx --yes "$CLASP_PACKAGE" "$@"
}

valid_clasp_auth() {
  local out="$SESSION_DIR/authorized-user.json"
  if ! clasp_cmd show-authorized-user --json >"$out" 2>/dev/null; then
    return 1
  fi
  node - "$out" <<'NODE'
const fs = require('fs');
const v = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.exit(v && v.loggedIn === true ? 0 : 1);
NODE
}

echo "[1/5] Google Apps Script authorization"
if ! valid_clasp_auth; then
  echo "USER_ACTION_REQUIRED: GOOGLE_OAUTH"
  echo "Approve the Google authorization URL shown by clasp. Return the one-time response only to this active Cline session."
  clasp_cmd login --no-localhost
  valid_clasp_auth || {
    echo "ERROR: clasp authorization did not complete."
    exit 1
  }
fi
echo "Google authorization: PASS"

echo "[2/5] Discovering Apps Script projects"
scripts_json="$SESSION_DIR/scripts.json"
if ! clasp_cmd list-scripts --json >"$scripts_json" 2>"$SESSION_DIR/list-scripts.err"; then
  echo "USER_ACTION_REQUIRED: ENABLE_APPS_SCRIPT_API"
  echo "Open https://script.google.com/home/usersettings, enable Google Apps Script API, then let Cline rerun this script."
  exit 2
fi
chmod 600 "$scripts_json"

make_candidates() {
  local kind="$1" output="$2"
  node - "$scripts_json" "$kind" "$output" <<'NODE'
const fs = require('fs');
const [file, kind, output] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const scripts = Array.isArray(raw) ? raw : (Array.isArray(raw.scripts) ? raw.scripts : []);
const cleaned = scripts
  .map(x => ({id: String(x.id || x.scriptId || ''), name: String(x.name || x.title || '')}))
  .filter(x => x.id);
const pattern = kind === 'detector'
  ? /(content.*event.*detector|event.*detector|r.?form.*detector)/i
  : /(content.*control.*api|r.?form.*content.*api|content.*api)/i;
let selected = cleaned.filter(x => pattern.test(x.name));
if (!selected.length) selected = cleaned;
fs.writeFileSync(output, selected.map(x => x.id).join('\n') + (selected.length ? '\n' : ''), {mode: 0o600});
NODE
}

pull_one() {
  local kind="$1" anchor="$2" candidates="$3" final_dir="$4" id_file="$5"
  local script_id idx=0 matches=0
  while IFS= read -r script_id; do
    [[ -n "$script_id" ]] || continue
    idx=$((idx + 1))
    local probe="$SESSION_DIR/probe-${kind}-${idx}"
    mkdir -p "$probe/remote"
    SCRIPT_ID="$script_id" PROBE="$probe" node <<'NODE'
const fs = require('fs');
const path = require('path');
fs.writeFileSync(path.join(process.env.PROBE, '.clasp.json'), JSON.stringify({scriptId: process.env.SCRIPT_ID, rootDir: 'remote'}, null, 2) + '\n', {mode: 0o600});
NODE
    if (cd "$probe" && clasp_cmd pull >"$SESSION_DIR/pull-${kind}-${idx}.log" 2>&1); then
      if grep -R -F -q --include='*.gs' --include='*.js' "$anchor" "$probe/remote"; then
        matches=$((matches + 1))
        if [[ "$matches" == "1" ]]; then
          mv "$probe" "$final_dir"
          printf '%s\n' "$script_id" > "$id_file"
          chmod 600 "$id_file"
        else
          rm -rf "$probe"
        fi
      else
        rm -rf "$probe"
      fi
    else
      rm -rf "$probe"
    fi
  done < "$candidates"

  if [[ "$matches" != "1" ]]; then
    echo "ERROR: expected exactly one $kind project by source anchor; found $matches."
    exit 1
  fi
}

detector_candidates="$SESSION_DIR/detector-candidates"
api_candidates="$SESSION_DIR/api-candidates"
make_candidates detector "$detector_candidates"
make_candidates content-api "$api_candidates"
pull_one detector "rformContentEventDetectorWriteV03" "$detector_candidates" "$SESSION_DIR/detector" "$SESSION_DIR/detector-id"
pull_one content-api "RFORM_CONTENT_API_V04" "$api_candidates" "$SESSION_DIR/content-api" "$SESSION_DIR/content-api-id"
echo "Project discovery by source anchor: PASS"

echo "[3/5] Building private runtime evidence"
node - "$SESSION_DIR" <<'NODE'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = process.argv[2];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
function locate(project, anchor) {
  const base = path.join(root, project, 'remote');
  const matches = walk(base).filter(f => /\.(gs|js)$/i.test(f) && fs.readFileSync(f, 'utf8').includes(anchor));
  if (matches.length !== 1) throw new Error(`${project}: expected exactly one anchor match, got ${matches.length}`);
  return matches[0];
}
function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const detector = locate('detector', 'rformContentEventDetectorWriteV03');
const api = locate('content-api', 'RFORM_CONTENT_API_V04');
const detectorText = fs.readFileSync(detector, 'utf8');
const apiText = fs.readFileSync(api, 'utf8');
const report = {
  created_at: new Date().toISOString(),
  detector: {
    target_relative_path: path.relative(path.join(root, 'detector', 'remote'), detector),
    sha256: sha(detector),
    tick_v03_present: detectorText.includes('rformContentEventDetectorTickV03'),
    observability_receipt_present: detectorText.includes('RFORM_DETECTOR_RUN') && detectorText.includes("observability_version:'0.1'")
  },
  content_api: {
    target_relative_path: path.relative(path.join(root, 'content-api', 'remote'), api),
    sha256: sha(api),
    declares_070: /version\s*:\s*['\"]0\.7\.0['\"]/.test(apiText),
    training_cards_functions_present: apiText.includes('rformContentApiV04EnableTrainingCards') && apiText.includes('rformContentApiV04TrainingCardsSelfCheck')
  }
};
fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
NODE

echo "Private runtime evidence: PASS"

echo "[4/5] Attempting optional GitHub Environment persistence"
persisted="SKIPPED"
if command -v gh >/dev/null 2>&1 && gh auth status --hostname github.com >/dev/null 2>&1; then
  if gh api --method PUT "repos/$REPO/environments/production-apps-script" >/dev/null 2>&1; then
    if [[ -s "$HOME/.clasprc.json" ]]; then
      gh secret set RFORM_CLASP_RC_JSON --env production-apps-script --repo "$REPO" < "$HOME/.clasprc.json" >/dev/null 2>&1 || true
      gh secret set RFORM_DETECTOR_SCRIPT_ID --env production-apps-script --repo "$REPO" < "$SESSION_DIR/detector-id" >/dev/null 2>&1 || true
      gh secret set RFORM_CONTENT_API_SCRIPT_ID --env production-apps-script --repo "$REPO" < "$SESSION_DIR/content-api-id" >/dev/null 2>&1 || true
      names="$SESSION_DIR/github-secret-names"
      if gh secret list --env production-apps-script --repo "$REPO" > "$names" 2>/dev/null && \
         grep -q '^RFORM_CLASP_RC_JSON[[:space:]]' "$names" && \
         grep -q '^RFORM_DETECTOR_SCRIPT_ID[[:space:]]' "$names" && \
         grep -q '^RFORM_CONTENT_API_SCRIPT_ID[[:space:]]' "$names"; then
        persisted="PASS"
      fi
    fi
  fi
fi
echo "GitHub Environment persistence: $persisted"

echo "[5/5] Finalizing private session"
ln -sfn "$SESSION_DIR" "$SESSION_ROOT/latest"
printf '%s\n' "$SESSION_DIR" > "$SESSION_ROOT/latest-path"
chmod 600 "$SESSION_ROOT/latest-path"

echo "READY: R/Form Cline Cloud runtime session prepared."
echo "Private report: $SESSION_DIR/report.json"
echo "Private session: $SESSION_DIR"
echo "No Apps Script project ID, deployment ID, OAuth credential, or token was printed."
