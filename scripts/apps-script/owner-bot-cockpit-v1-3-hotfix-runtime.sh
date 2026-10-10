#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-inspect}"
[[ "$MODE" == "inspect" || "$MODE" == "apply" ]] || { echo "ERROR: mode must be inspect or apply"; exit 1; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ERROR: run inside R/Form repository"; exit 1; }
cd "$ROOT"

CLASP_PACKAGE="@google/clasp@3.4.1"
BASELINE_REF="78005e953cb7656e00f6dc85179048c4ab4db368"
EXPECTED_DEPLOYMENT_VERSION=14
CANDIDATE_COCKPIT="automation/owner_bot_cockpit_v1_3.gs"
CONFIRM_VALUE="APPLY OWNER BOT COCKPIT TODAY HOTFIX"
SESSION_ROOT="${RFORM_CLINE_SESSION_ROOT:-$HOME/.rform-cline}"

for cmd in git node npx grep find sha256sum curl sleep; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing required command: $cmd"; exit 1; }
done
[[ -f "$CANDIDATE_COCKPIT" ]] || { echo "ERROR: cockpit candidate missing"; exit 1; }
grep -Fq 'OWNER_COCKPIT_FAILED' "$CANDIDATE_COCKPIT" || { echo "ERROR: /today diagnostic boundary missing"; exit 1; }
grep -Fq 'rformOwnerBotV13ReadEvents_' "$CANDIDATE_COCKPIT" || { echo "ERROR: direct DATA_EVENTS read missing"; exit 1; }

if [[ "$MODE" == "apply" && "${RFORM_OWNER_BOT_TODAY_HOTFIX_CONFIRM:-}" != "$CONFIRM_VALUE" ]]; then
  echo "ERROR: apply requires RFORM_OWNER_BOT_TODAY_HOTFIX_CONFIRM='$CONFIRM_VALUE'"
  exit 2
fi

git cat-file -e "$BASELINE_REF^{commit}" 2>/dev/null || { echo "ERROR: baseline commit unavailable"; exit 3; }
mkdir -p "$SESSION_ROOT" && chmod 700 "$SESSION_ROOT"
SESSION="$SESSION_ROOT/owner-bot-today-hotfix-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$SESSION" && chmod 700 "$SESSION"
git show "$BASELINE_REF:automation/owner_bot_v1.gs" >"$SESSION/baseline-core.gs"
git show "$BASELINE_REF:automation/owner_bot_cockpit_v1_3.gs" >"$SESSION/baseline-cockpit.gs"
BASELINE_CORE_SHA="$(sha256sum "$SESSION/baseline-core.gs" | awk '{print $1}')"
BASELINE_COCKPIT_SHA="$(sha256sum "$SESSION/baseline-cockpit.gs" | awk '{print $1}')"
CANDIDATE_COCKPIT_SHA="$(sha256sum "$CANDIDATE_COCKPIT" | awk '{print $1}')"

clasp_cmd() { npx --yes "$CLASP_PACKAGE" "$@"; }
if ! clasp_cmd show-authorized-user --json >"$SESSION/auth.json" 2>/dev/null; then
  echo "ERROR: clasp authorization unavailable"
  exit 4
fi
node - "$SESSION/auth.json" <<'NODE'
const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(!x||x.loggedIn!==true)process.exit(1);
NODE
echo "Clasp authorization: PASS"

clasp_cmd list-scripts --json >"$SESSION/scripts.json"
node - "$SESSION/scripts.json" "$SESSION/candidates" <<'NODE'
const fs=require('fs');const raw=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const rows=Array.isArray(raw)?raw:(Array.isArray(raw.scripts)?raw.scripts:[]);
const ids=rows.map(x=>({id:String(x.id||x.scriptId||''),name:String(x.name||x.title||'')})).filter(x=>x.id);
let selected=ids.filter(x=>/(owner.*bot|r.?form.*owner)/i.test(x.name));if(!selected.length)selected=ids;
fs.writeFileSync(process.argv[3],selected.map(x=>x.id).join('\n')+(selected.length?'\n':''),{mode:0o600});
NODE

matches=0; idx=0
while IFS= read -r script_id; do
  [[ -n "$script_id" ]] || continue
  idx=$((idx+1)); probe="$SESSION/probe-$idx"; mkdir -p "$probe/remote"
  SCRIPT_ID="$script_id" PROBE="$probe" node <<'NODE'
const fs=require('fs'),path=require('path');fs.writeFileSync(path.join(process.env.PROBE,'.clasp.json'),JSON.stringify({scriptId:process.env.SCRIPT_ID,rootDir:'remote'},null,2)+'\n',{mode:0o600});
NODE
  if (cd "$probe" && clasp_cmd pull >"$SESSION/pull-$idx.log" 2>&1); then
    core="$(find "$probe/remote" -type f \( -name '*.gs' -o -name '*.js' \) -print0 | xargs -0 grep -l "const RFORM_OWNER_BOT_V1 = Object.freeze" || true)"
    cockpit="$(find "$probe/remote" -type f \( -name '*.gs' -o -name '*.js' \) -print0 | xargs -0 grep -l 'const RFORM_OWNER_COCKPIT_V13' || true)"
    if [[ -n "$core" && -n "$cockpit" && "$(printf '%s\n' "$core" | wc -l | tr -d ' ')" == "1" && "$(printf '%s\n' "$cockpit" | wc -l | tr -d ' ')" == "1" ]]; then
      matches=$((matches+1))
      if [[ "$matches" == "1" ]]; then
        mv "$probe" "$SESSION/runtime"
        printf '%s\n' "$script_id" >"$SESSION/script-id"
        printf '%s\n' "${core#${probe}/remote/}" >"$SESSION/core-relative"
        printf '%s\n' "${cockpit#${probe}/remote/}" >"$SESSION/cockpit-relative"
      else rm -rf "$probe"; fi
    else rm -rf "$probe"; fi
  else rm -rf "$probe"; fi
done <"$SESSION/candidates"
[[ "$matches" == "1" ]] || { echo "ERROR: expected exactly one Owner Bot project; found $matches"; exit 5; }
echo "Owner Bot project discovery: PASS"

live_core="$SESSION/runtime/remote/$(cat "$SESSION/core-relative")"
live_cockpit="$SESSION/runtime/remote/$(cat "$SESSION/cockpit-relative")"
[[ "$(sha256sum "$live_core" | awk '{print $1}')" == "$BASELINE_CORE_SHA" ]] || { echo "ERROR: live core drift"; exit 6; }
[[ "$(sha256sum "$live_cockpit" | awk '{print $1}')" == "$BASELINE_COCKPIT_SHA" ]] || { echo "ERROR: live cockpit drift"; exit 6; }
echo "Live Owner Bot v1.3 baseline source: PASS"

(cd "$SESSION/runtime" && clasp_cmd list-deployments --json >"$SESSION/deployments-before.json")
node scripts/apps-script/guard.mjs select-deployment --file "$SESSION/deployments-before.json" --expected-version "$EXPECTED_DEPLOYMENT_VERSION" --id-file "$SESSION/deployment-id"
echo "Existing Owner Bot deployment v14: PASS"

if [[ "$MODE" == "inspect" ]]; then
  echo "INSPECT_COMPLETE: live v1.3 source and existing deployment v14 match the accepted Phase D baseline."
  exit 0
fi

cp -R "$SESSION/runtime/remote" "$SESSION/backup-remote"; chmod -R go-rwx "$SESSION/backup-remote"
cp "$CANDIDATE_COCKPIT" "$live_cockpit"
[[ "$(sha256sum "$live_cockpit" | awk '{print $1}')" == "$CANDIDATE_COCKPIT_SHA" ]] || { echo "ERROR: staged cockpit mismatch"; exit 7; }

deployment_updated=0
rollback() {
  code=$?; [[ "$code" == "0" ]] && return
  trap - ERR
  echo "ROLLBACK: restoring Owner Bot v1.3 source and deployment v14."
  rm -rf "$SESSION/runtime/remote"; cp -R "$SESSION/backup-remote" "$SESSION/runtime/remote"
  (cd "$SESSION/runtime" && clasp_cmd push --force >/dev/null 2>&1) || true
  if [[ "$deployment_updated" == "1" ]]; then
    dep_id="$(cat "$SESSION/deployment-id")"
    (cd "$SESSION/runtime" && clasp_cmd update-deployment "$dep_id" --versionNumber "$EXPECTED_DEPLOYMENT_VERSION" --description "Rollback Owner Bot Cockpit v1.3.0" --json >/dev/null 2>&1) || true
  fi
  echo "ROLLBACK_ATTEMPTED: inspect runtime before any retry."
  exit "$code"
}
trap rollback ERR

(cd "$SESSION/runtime" && clasp_cmd push --force >"$SESSION/push.log")
rm -rf "$SESSION/readback"; mkdir -p "$SESSION/readback/remote"; cp "$SESSION/runtime/.clasp.json" "$SESSION/readback/.clasp.json"
(cd "$SESSION/readback" && clasp_cmd pull >"$SESSION/readback.log")
rb_core="$(find "$SESSION/readback/remote" -type f \( -name '*.gs' -o -name '*.js' \) -print0 | xargs -0 grep -l "const RFORM_OWNER_BOT_V1 = Object.freeze" || true)"
rb_cockpit="$(find "$SESSION/readback/remote" -type f \( -name '*.gs' -o -name '*.js' \) -print0 | xargs -0 grep -l 'const RFORM_OWNER_COCKPIT_V13' || true)"
[[ "$(printf '%s\n' "$rb_core" | wc -l | tr -d ' ')" == "1" && "$(printf '%s\n' "$rb_cockpit" | wc -l | tr -d ' ')" == "1" ]] || { echo "ERROR: source readback not unique"; false; }
[[ "$(sha256sum "$rb_core" | awk '{print $1}')" == "$BASELINE_CORE_SHA" ]] || { echo "ERROR: core changed during hotfix"; false; }
[[ "$(sha256sum "$rb_cockpit" | awk '{print $1}')" == "$CANDIDATE_COCKPIT_SHA" ]] || { echo "ERROR: cockpit source readback mismatch"; false; }
echo "Owner Bot /today hotfix source readback: PASS"

(cd "$SESSION/runtime" && clasp_cmd create-version "Owner Bot Cockpit v1.3.0 /today hotfix" --json >"$SESSION/new-version.json")
new_version="$(node - "$SESSION/new-version.json" <<'NODE'
const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const v=Number(x.versionNumber??x.version??0);if(!Number.isInteger(v)||v<=14)process.exit(1);process.stdout.write(String(v));
NODE
)"
dep_id="$(cat "$SESSION/deployment-id")"
(cd "$SESSION/runtime" && clasp_cmd update-deployment "$dep_id" --versionNumber "$new_version" --description "R/Form Owner Bot Cockpit v1.3.0 /today hotfix" --json >"$SESSION/deploy-update.json")
node - "$SESSION/deploy-update.json" "$SESSION/deployment-id" "$new_version" <<'NODE'
const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const id=fs.readFileSync(process.argv[3],'utf8').trim();const v=Number(process.argv[4]);if(String(x.deploymentId||'')!==id||Number(x.versionNumber)!==v)process.exit(1);
NODE
deployment_updated=1
echo "Owner Bot deployment update response: PASS"

sleep 5
(cd "$SESSION/runtime" && clasp_cmd list-deployments --json >"$SESSION/deployments-after.json")
node - "$SESSION/deployments-before.json" "$SESSION/deployments-after.json" <<'NODE'
const fs=require('fs');const ids=p=>JSON.parse(fs.readFileSync(p,'utf8')).map(x=>String(x.deploymentId||'')).filter(Boolean).sort();if(JSON.stringify(ids(process.argv[2]))!==JSON.stringify(ids(process.argv[3])))process.exit(1);
NODE
metadata="$(node - "$SESSION/deployments-after.json" "$SESSION/deployment-id" "$new_version" <<'NODE'
const fs=require('fs');const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const id=fs.readFileSync(process.argv[3],'utf8').trim();const v=Number(process.argv[4]);const r=rows.find(x=>String(x.deploymentId||'')===id);process.stdout.write(r&&Number(r.versionNumber)===v?'CONVERGED':'STALE');
NODE
)"
echo "Owner Bot deployment ID set unchanged: PASS"
echo "Owner Bot deployment metadata readback: $metadata"

# Banner remains v1.3.0 by design; this proves the same existing web-app URL remains alive.
if curl --silent --show-error --fail --location "https://script.google.com/macros/s/${dep_id}/exec" >"$SESSION/webapp-get.txt"; then
  grep -Eq 'R[\\/]?/Form Owner Bot v1\.3\.0|R\\/Form Owner Bot v1\.3\.0' "$SESSION/webapp-get.txt" || { echo "ERROR: web-app baseline banner missing"; false; }
  echo "Owner Bot existing web-app smoke: PASS"
else
  echo "ERROR: existing Owner Bot web-app GET failed"; false
fi

trap - ERR
printf '%s\n' "$new_version" >"$SESSION/new-deployment-version"; chmod 600 "$SESSION/new-deployment-version"
ln -sfn "$SESSION" "$SESSION_ROOT/owner-bot-today-hotfix-latest"
echo "RUNTIME_DEPLOYED_AWAITING_OWNER_ACCEPTANCE"
echo "OWNER_ACTION_REQUIRED: send /today once in the existing private R/Form Owner Bot chat."
