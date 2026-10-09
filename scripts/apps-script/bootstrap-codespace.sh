#!/usr/bin/env bash
set -euo pipefail

REPO="rulevd21/R-Form"
ENVIRONMENT="production-apps-script"
WORKFLOW="apps-script-production.yml"
CLASP_PACKAGE="@google/clasp@3.4.1"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "ERROR: run this command inside the R-Form repository."
  exit 1
fi
cd "$ROOT"

remote_url="$(git remote get-url origin 2>/dev/null || true)"
case "$remote_url" in
  *rulevd21/R-Form*) ;;
  *)
    echo "ERROR: this is not the expected R/Form repository."
    exit 1
    ;;
esac

for command in git node npm npx gh grep sha256sum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command"
    exit 1
  }
done

tmp="$(mktemp -d)"
chmod 700 "$tmp"
created_clasp_auth=0

cleanup() {
  rm -rf "$tmp"
  if [[ "$created_clasp_auth" == "1" ]]; then
    rm -f "$HOME/.clasprc.json"
  fi
}
trap cleanup EXIT

clasp_cmd() {
  npx --yes "$CLASP_PACKAGE" "$@"
}

valid_clasp_auth() {
  local out="$tmp/authorized-user.json"
  if ! clasp_cmd show-authorized-user --json >"$out" 2>/dev/null; then
    return 1
  fi
  node - "$out" <<'NODE'
const fs = require('fs');
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.exit(value && value.loggedIn === true ? 0 : 1);
NODE
}

echo "[1/6] Google Apps Script authorization"
if ! valid_clasp_auth; then
  echo "A one-time Google approval is required."
  echo "Open the URL printed by clasp, approve the R/Form production Google account, then return the authorization code to this terminal."
  clasp_cmd login --no-localhost
  created_clasp_auth=1
  valid_clasp_auth || {
    echo "ERROR: clasp authorization did not complete."
    exit 1
  }
fi
echo "Google authorization: PASS"

echo "[2/6] Discovering production Apps Script projects"
scripts_json="$tmp/scripts.json"
if ! clasp_cmd list-scripts --json >"$scripts_json" 2>"$tmp/list-scripts.err"; then
  echo "ERROR: clasp could not list Apps Script projects."
  echo "If the Apps Script API is disabled, enable it once at: https://script.google.com/home/usersettings"
  exit 1
fi

make_candidates() {
  local kind="$1"
  local output="$2"
  node - "$scripts_json" "$kind" "$output" <<'NODE'
const fs = require('fs');
const [file, kind, output] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const scripts = Array.isArray(raw) ? raw : (Array.isArray(raw.scripts) ? raw.scripts : []);
const cleaned = scripts
  .map(x => ({id: String(x.id || x.scriptId || ''), name: String(x.name || x.title || '')}))
  .filter(x => x.id);
let pattern;
if (kind === 'detector') {
  pattern = /(content.*event.*detector|event.*detector|r.?form.*detector)/i;
} else {
  pattern = /(content.*control.*api|r.?form.*content.*api|content.*api)/i;
}
let selected = cleaned.filter(x => pattern.test(x.name));
if (!selected.length) selected = cleaned;
fs.writeFileSync(output, selected.map(x => x.id).join('\n') + (selected.length ? '\n' : ''), {mode: 0o600});
NODE
}

verify_projects() {
  local candidates="$1"
  local anchor="$2"
  local output="$3"
  : > "$output"
  chmod 600 "$output"

  local script_id index=0 project_dir
  while IFS= read -r script_id; do
    [[ -n "$script_id" ]] || continue
    index=$((index + 1))
    project_dir="$tmp/project-$index"
    mkdir -p "$project_dir/remote"

    SCRIPT_ID="$script_id" PROJECT_DIR="$project_dir" node <<'NODE'
const fs = require('fs');
const path = require('path');
fs.writeFileSync(
  path.join(process.env.PROJECT_DIR, '.clasp.json'),
  JSON.stringify({scriptId: process.env.SCRIPT_ID, rootDir: 'remote'}, null, 2) + '\n',
  {mode: 0o600}
);
NODE

    if (cd "$project_dir" && clasp_cmd pull >"$tmp/pull-$index.log" 2>&1); then
      if grep -R -F -q --include='*.gs' --include='*.js' "$anchor" "$project_dir/remote"; then
        printf '%s\n' "$script_id" >> "$output"
      fi
    fi
    rm -rf "$project_dir"
  done < "$candidates"

  local count
  count="$(grep -cve '^$' "$output" || true)"
  if [[ "$count" != "1" ]]; then
    echo "ERROR: expected exactly one Apps Script project matching runtime anchor; found $count."
    echo "No project ID was printed or stored in the repository."
    exit 1
  fi
}

detector_candidates="$tmp/detector-candidates"
api_candidates="$tmp/api-candidates"
detector_verified="$tmp/detector-id"
api_verified="$tmp/api-id"

make_candidates detector "$detector_candidates"
make_candidates content-api "$api_candidates"
verify_projects "$detector_candidates" "rformContentEventDetectorWriteV03" "$detector_verified"
verify_projects "$api_candidates" "RFORM_CONTENT_API_V04" "$api_verified"
echo "Apps Script project discovery by source anchors: PASS"

echo "[3/6] GitHub production environment authorization"
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo "A one-time GitHub approval is required."
  gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow
fi

if ! gh api --method PUT "repos/$REPO/environments/$ENVIRONMENT" >/dev/null 2>&1; then
  echo "The current GitHub token cannot administer environment secrets."
  echo "A one-time GitHub owner approval is required."
  unset GH_TOKEN GITHUB_TOKEN
  gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow
  gh api --method PUT "repos/$REPO/environments/$ENVIRONMENT" >/dev/null
fi
echo "GitHub environment: PASS"

echo "[4/6] Installing protected GitHub Environment secrets"
test -s "$HOME/.clasprc.json" || {
  echo "ERROR: clasp credential file is missing after authorization."
  exit 1
}

gh secret set RFORM_CLASP_RC_JSON \
  --env "$ENVIRONMENT" --repo "$REPO" < "$HOME/.clasprc.json" >/dev/null
gh secret set RFORM_DETECTOR_SCRIPT_ID \
  --env "$ENVIRONMENT" --repo "$REPO" < "$detector_verified" >/dev/null
gh secret set RFORM_CONTENT_API_SCRIPT_ID \
  --env "$ENVIRONMENT" --repo "$REPO" < "$api_verified" >/dev/null

secret_names="$tmp/secret-names"
gh secret list --env "$ENVIRONMENT" --repo "$REPO" | awk '{print $1}' > "$secret_names"
for expected in RFORM_CLASP_RC_JSON RFORM_DETECTOR_SCRIPT_ID RFORM_CONTENT_API_SCRIPT_ID; do
  grep -Fxq "$expected" "$secret_names" || {
    echo "ERROR: protected secret $expected was not confirmed."
    exit 1
  }
done
echo "Protected secrets: PASS"

echo "[5/6] Resolving exact production source refs"
manifest="RFORM_RUNTIME_MANIFEST.json"
test -f "$manifest" || {
  echo "ERROR: $manifest is missing."
  exit 1
}

DETECTOR_SOURCE_FILE="$tmp/detector-source"
API_SOURCE_FILE="$tmp/api-source"
DETECTOR_SOURCE_FILE="$DETECTOR_SOURCE_FILE" API_SOURCE_FILE="$API_SOURCE_FILE" node <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('RFORM_RUNTIME_MANIFEST.json', 'utf8'));
const components = new Map((manifest.components || []).map(x => [x.component, x]));
const detector = String(components.get('content_event_detector')?.source_ref || '');
const api = String(components.get('content_control_api')?.source_ref || '');
const full = /^[0-9a-f]{40}$/;
if (!full.test(detector) || !full.test(api)) {
  throw new Error('production component source_ref must be exact 40-character Git SHAs');
}
fs.writeFileSync(process.env.DETECTOR_SOURCE_FILE, detector + '\n', {mode: 0o600});
fs.writeFileSync(process.env.API_SOURCE_FILE, api + '\n', {mode: 0o600});
NODE

detector_source="$(tr -d '\r\n' < "$DETECTOR_SOURCE_FILE")"
api_source="$(tr -d '\r\n' < "$API_SOURCE_FILE")"
echo "Manifest source refs: PASS"

dispatch_and_wait() {
  local component="$1"
  local source_sha="$2"
  local before run_id="" conclusion

  before="$(gh run list --repo "$REPO" --workflow "$WORKFLOW" --event workflow_dispatch \
    --limit 1 --json databaseId --jq '.[0].databaseId // 0' 2>/dev/null || echo 0)"

  gh workflow run "$WORKFLOW" --repo "$REPO" --ref main \
    -f "component=$component" \
    -f "operation=inspect" \
    -f "source_sha=$source_sha" >/dev/null

  for _ in $(seq 1 30); do
    run_id="$(gh run list --repo "$REPO" --workflow "$WORKFLOW" --event workflow_dispatch \
      --limit 1 --json databaseId --jq '.[0].databaseId // 0')"
    if [[ "$run_id" != "0" && "$run_id" != "$before" ]]; then
      break
    fi
    sleep 2
  done

  if [[ -z "$run_id" || "$run_id" == "0" || "$run_id" == "$before" ]]; then
    echo "ERROR: could not identify the read-only inspect run."
    exit 1
  fi

  gh run watch "$run_id" --repo "$REPO" --exit-status >/dev/null
  conclusion="$(gh run view "$run_id" --repo "$REPO" --json conclusion --jq '.conclusion')"
  [[ "$conclusion" == "success" ]] || {
    echo "ERROR: $component inspect did not succeed."
    exit 1
  }

  printf '%s' "$run_id"
}

echo "[6/6] Running read-only production inspect gates"
detector_run="$(dispatch_and_wait detector "$detector_source")"
echo "Detector inspect: PASS (run $detector_run)"
api_run="$(dispatch_and_wait content-api "$api_source")"
echo "Content API inspect: PASS (run $api_run)"

echo
echo "READY: R/Form GitHub -> Apps Script production deployment is bootstrapped."
echo "No Apps Script project ID, OAuth credential, deployment ID, or token was printed."
