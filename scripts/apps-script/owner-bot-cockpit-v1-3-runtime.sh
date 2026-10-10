#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-inspect}"
[[ "$MODE" == "inspect" || "$MODE" == "apply" ]] || { echo "ERROR: mode must be inspect or apply"; exit 1; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ERROR: run inside R/Form repository"; exit 1; }
cd "$ROOT"

CLASP_PACKAGE="@google/clasp@3.4.1"
BASELINE_SHA256="7e014d5f09d5048117398afacc6e2ab242c7e0c9365ada84ae89313d52d1f856"
EXPECTED_DEPLOYMENT_VERSION=11
CANDIDATE_CORE="automation/owner_bot_v1.gs"
CANDIDATE_COCKPIT="automation/owner_bot_cockpit_v1_3.gs"
CONFIRM_VALUE="APPLY OWNER BOT COCKPIT 1.3.0"

for cmd in git node npx grep find sha256sum curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing required command: $cmd"; exit 1; }
done

[[ -f "$CANDIDATE_CORE" && -f "$CANDIDATE_COCKPIT" ]] || {
  echo "ERROR: Owner Bot v1.3 candidate files are missing."
  exit 1
}
grep -Fq "version: '1.3.0'" "$CANDIDATE_CORE" || {
  echo "ERROR: core candidate is not materialized as v1.3.0."
  exit 1
}
grep -Fq 'rformOwnerBotV13SendCockpit_' "$CANDIDATE_CORE" || {
  echo "ERROR: core candidate does not route to Cockpit v1.3."
  exit 1
}
grep -Fq 'const RFORM_OWNER_COCKPIT_V13' "$CANDIDATE_COCKPIT" || {
  echo "ERROR: cockpit candidate anchor missing."
  exit 1
}

if [[ "$MODE" == "apply" && "${RFORM_OWNER_BOT_COCKPIT_CONFIRM:-}" != "$CONFIRM_VALUE" ]]; then
  echo "ERROR: apply requires RFORM_OWNER_BOT_COCKPIT_CONFIRM='$CONFIRM_VALUE'"
  exit 2
fi

SESSION_ROOT="${RFORM_CLINE_SESSION_ROOT:-$HOME/.rform-cline}"
mkdir -p "$SESSION_ROOT" && chmod 700 "$SESSION_ROOT"
SESSION="$SESSION_ROOT/owner-bot-cockpit-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$SESSION" && chmod 700 "$SESSION"

clasp_cmd() { npx --yes "$CLASP_PACKAGE" "$@"; }

if ! clasp_cmd show-authorized-user --json >"$SESSION/auth.json" 2>/dev/null; then
  echo "ERROR: clasp authorization unavailable. Reuse the authenticated Cline session."
  exit 3
fi
node - "$SESSION/auth.json" <<'NODE'
const fs=require('fs'); const x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(!x || x.loggedIn!==true) process.exit(1);
NODE

echo "Clasp authorization: PASS"

scripts="$SESSION/scripts.json"
clasp_cmd list-scripts --json >"$scripts"
chmod 600 "$scripts"
node - "$scripts" "$SESSION/candidates" <<'NODE'
const fs=require('fs');
const raw=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const scripts=Array.isArray(raw)?raw:(Array.isArray(raw.scripts)?raw.scripts:[]);
const clean=scripts.map(x=>({id:String(x.id||x.scriptId||''),name:String(x.name||x.title||'')})).filter(x=>x.id);
let selected=clean.filter(x=>/(owner.*bot|r.?form.*owner)/i.test(x.name));
if(!selected.length) selected=clean;
fs.writeFileSync(process.argv[3],selected.map(x=>x.id).join('\n')+(selected.length?'\n':''),{mode:0o600});
NODE

matches=0; idx=0
while IFS= read -r script_id; do
  [[ -n "$script_id" ]] || continue
  idx=$((idx+1)); probe="$SESSION/probe-$idx"; mkdir -p "$probe/remote"
  SCRIPT_ID="$script_id" PROBE="$probe" node <<'NODE'
const fs=require('fs'),path=require('path');
fs.writeFileSync(path.join(process.env.PROBE,'.clasp.json'),JSON.stringify({scriptId:process.env.SCRIPT_ID,rootDir:'remote'},null,2)+'\n',{mode:0o600});
NODE
  if (cd "$probe" && clasp_cmd pull >"$SESSION/pull-$idx.log" 2>&1); then
    target="$(node - "$probe/remote" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto'); const root=process.argv[2];
function walk(d){let o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);o=e.isDirectory()?o.concat(walk(p)):o.concat(p)}return o}
const files=walk(root).filter(f=>/\.(gs|js)$/i.test(f));
const hits=files.filter(f=>{const t=fs.readFileSync(f,'utf8');return t.includes('const RFORM_OWNER_BOT_V1 = Object.freeze') && /version\s*:\s*['\"]1\.2\.4['\"]/.test(t)});
if(hits.length===1) process.stdout.write(hits[0]);
NODE
)"
    if [[ -n "$target" ]]; then
      matches=$((matches+1))
      if [[ "$matches" == "1" ]]; then
        mv "$probe" "$SESSION/runtime"
        printf '%s\n' "$script_id" >"$SESSION/script-id"; chmod 600 "$SESSION/script-id"
        rel="${target#${probe}/remote/}"; printf '%s\n' "$rel" >"$SESSION/core-relative"
      else rm -rf "$probe"; fi
    else rm -rf "$probe"; fi
  else rm -rf "$probe"; fi
done <"$SESSION/candidates"

[[ "$matches" == "1" ]] || { echo "ERROR: expected exactly one live Owner Bot v1.2.4 project; found $matches"; exit 4; }
echo "Owner Bot project discovery: PASS"

core_rel="$(cat "$SESSION/core-relative")"
live_core="$SESSION/runtime/remote/$core_rel"
live_sha="$(sha256sum "$live_core" | awk '{print $1}')"
echo "Live Owner Bot baseline SHA-256: $live_sha"
[[ "$live_sha" == "$BASELINE_SHA256" ]] || {
  echo "ERROR: live Owner Bot source drift; expected verified v1.2.4 baseline."
  exit 5
}

deployments="$SESSION/deployments-before.json"
(cd "$SESSION/runtime" && clasp_cmd list-deployments --json >"$deployments")
node scripts/apps-script/guard.mjs summarize-deployments --file "$deployments"
node scripts/apps-script/guard.mjs select-deployment --file "$deployments" \
  --expected-version "$EXPECTED_DEPLOYMENT_VERSION" --id-file "$SESSION/deployment-id"

echo "Existing Owner Bot deployment: PASS"
core_candidate_sha="$(sha256sum "$CANDIDATE_CORE" | awk '{print $1}')"
cockpit_candidate_sha="$(sha256sum "$CANDIDATE_COCKPIT" | awk '{print $1}')"
echo "Candidate core SHA-256: $core_candidate_sha"
echo "Candidate cockpit SHA-256: $cockpit_candidate_sha"

if [[ "$MODE" == "inspect" ]]; then
  echo "INSPECT_COMPLETE: Owner Bot v1.2.4 runtime matches the accepted baseline and existing deployment version $EXPECTED_DEPLOYMENT_VERSION is unique."
  echo "No source, deployment, trigger, property, queue row or Telegram message was changed."
  exit 0
fi

cp -R "$SESSION/runtime/remote" "$SESSION/backup-remote"
chmod -R go-rwx "$SESSION/backup-remote"

cp "$CANDIDATE_CORE" "$live_core"
companion_target="$SESSION/runtime/remote/owner_bot_cockpit_v1_3.js"
cp "$CANDIDATE_COCKPIT" "$companion_target"

[[ "$(sha256sum "$live_core" | awk '{print $1}')" == "$core_candidate_sha" ]] || { echo "ERROR: staged core mismatch"; exit 6; }
[[ "$(sha256sum "$companion_target" | awk '{print $1}')" == "$cockpit_candidate_sha" ]] || { echo "ERROR: staged cockpit mismatch"; exit 6; }

deployment_updated=0
rollback() {
  code=$?
  if [[ "$code" == "0" ]]; then return; fi
  echo "ROLLBACK: restoring Owner Bot source and deployment baseline."
  rm -rf "$SESSION/runtime/remote"
  cp -R "$SESSION/backup-remote" "$SESSION/runtime/remote"
  (cd "$SESSION/runtime" && clasp_cmd push --force >/dev/null 2>&1) || true
  if [[ "$deployment_updated" == "1" ]]; then
    dep_id="$(cat "$SESSION/deployment-id")"
    (cd "$SESSION/runtime" && clasp_cmd update-deployment "$dep_id" --version-number "$EXPECTED_DEPLOYMENT_VERSION" \
      --description "Rollback Owner Bot v1.2.4" --json >/dev/null 2>&1) || true
  fi
  echo "ROLLBACK_ATTEMPTED: inspect runtime before any retry."
  exit "$code"
}
trap rollback ERR

(cd "$SESSION/runtime" && clasp_cmd push --force >"$SESSION/push.log")

# Fresh readback after source push, before deployment version change.
rm -rf "$SESSION/readback"; mkdir -p "$SESSION/readback/remote"
cp "$SESSION/runtime/.clasp.json" "$SESSION/readback/.clasp.json"
(cd "$SESSION/readback" && clasp_cmd pull >"$SESSION/readback.log")
readback_core="$(node - "$SESSION/readback/remote" <<'NODE'
const fs=require('fs'),path=require('path');const root=process.argv[2];
function walk(d){let o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);o=e.isDirectory()?o.concat(walk(p)):o.concat(p)}return o}
const hits=walk(root).filter(f=>/\.(gs|js)$/i.test(f)).filter(f=>fs.readFileSync(f,'utf8').includes("version: '1.3.0'") && fs.readFileSync(f,'utf8').includes('const RFORM_OWNER_BOT_V1 = Object.freeze'));
if(hits.length!==1) process.exit(1);process.stdout.write(hits[0]);
NODE
)"
readback_cockpit="$(find "$SESSION/readback/remote" -type f \( -name '*.gs' -o -name '*.js' \) -print0 | xargs -0 grep -l 'const RFORM_OWNER_COCKPIT_V13' || true)"
[[ -n "$readback_core" && -n "$readback_cockpit" && "$(printf '%s\n' "$readback_cockpit" | wc -l | tr -d ' ')" == "1" ]] || {
  echo "ERROR: source readback did not uniquely locate both v1.3 files."; false;
}
[[ "$(sha256sum "$readback_core" | awk '{print $1}')" == "$core_candidate_sha" ]] || { echo "ERROR: core source readback mismatch"; false; }
[[ "$(sha256sum "$readback_cockpit" | awk '{print $1}')" == "$cockpit_candidate_sha" ]] || { echo "ERROR: cockpit source readback mismatch"; false; }
echo "Owner Bot source readback: PASS"

version_json="$SESSION/new-version.json"
(cd "$SESSION/runtime" && clasp_cmd create-version "Owner Bot Cockpit v1.3.0" --json >"$version_json")
new_version="$(node - "$version_json" <<'NODE'
const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const v=Number(x.versionNumber ?? x.version ?? 0);if(!Number.isInteger(v)||v<=0)process.exit(1);process.stdout.write(String(v));
NODE
)"
[[ "$new_version" -gt "$EXPECTED_DEPLOYMENT_VERSION" ]] || { echo "ERROR: new version did not advance"; false; }

dep_id="$(cat "$SESSION/deployment-id")"
(cd "$SESSION/runtime" && clasp_cmd update-deployment "$dep_id" --version-number "$new_version" \
  --description "R/Form Owner Bot Cockpit v1.3.0" --json >"$SESSION/deploy-update.json")
deployment_updated=1
(cd "$SESSION/runtime" && clasp_cmd list-deployments --json >"$SESSION/deployments-after.json")
node scripts/apps-script/guard.mjs verify-deployment --file "$SESSION/deployments-after.json" \
  --id-file "$SESSION/deployment-id" --previous-version "$EXPECTED_DEPLOYMENT_VERSION"

echo "Owner Bot deployment in-place update: PASS"

# Read-only web-app smoke. The deployment ID is never printed.
status_body="$SESSION/webapp-get.txt"
if curl --silent --show-error --fail --location "https://script.google.com/macros/s/${dep_id}/exec" >"$status_body"; then
  grep -Fq 'R/Form Owner Bot v1.3.0' "$status_body" || { echo "ERROR: web-app version smoke mismatch"; false; }
  echo "Owner Bot web-app version smoke: PASS"
else
  echo "ERROR: Owner Bot web-app GET smoke failed"; false
fi

trap - ERR
printf '%s\n' "$new_version" >"$SESSION/new-deployment-version"; chmod 600 "$SESSION/new-deployment-version"
ln -sfn "$SESSION" "$SESSION_ROOT/owner-bot-cockpit-latest"

echo "RUNTIME_DEPLOYED_AWAITING_OWNER_ACCEPTANCE"
echo "Next acceptance: owner sends /today in the existing private Owner Bot chat."
echo "Do not click event/content action buttons during smoke acceptance."
echo "No Script ID, deployment ID, OAuth credential, token, property value or private URL was printed."
