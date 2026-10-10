#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-inspect}"
[[ "$MODE" == "inspect" || "$MODE" == "apply" ]] || { echo "ERROR: mode must be inspect or apply"; exit 1; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ERROR: run inside R/Form repository"; exit 1; }
cd "$ROOT"

CLASP_PACKAGE="@google/clasp@3.4.1"
BASELINE_REF="8a8d2cdf32db83e088e8d88dbde801a740c4c1e8"
CANDIDATE_COCKPIT="automation/owner_bot_cockpit_v1_3.gs"
CONFIRM_VALUE="APPLY OWNER BOT COCKPIT DIRECT READ"
SESSION_ROOT="${RFORM_CLINE_SESSION_ROOT:-$HOME/.rform-cline}"

for cmd in git node npx grep find sha256sum sleep; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing required command: $cmd"; exit 1; }
done
[[ -f "$CANDIDATE_COCKPIT" ]] || { echo "ERROR: cockpit candidate missing"; exit 1; }
grep -Fq "queueSheet: 'CONTENT_QUEUE'" "$CANDIDATE_COCKPIT" || { echo "ERROR: direct queue read contract missing"; exit 1; }
grep -Fq "let stage = 'CONTENT_QUEUE_READ'" "$CANDIDATE_COCKPIT" || { echo "ERROR: queue read diagnostic stage missing"; exit 1; }
if grep -Fq 'rformOwnerBotV1ApiRead_()' "$CANDIDATE_COCKPIT"; then
  echo "ERROR: cockpit candidate still depends on Content API read transport"
  exit 1
fi

if [[ "$MODE" == "apply" && "${RFORM_OWNER_BOT_DIRECT_READ_CONFIRM:-}" != "$CONFIRM_VALUE" ]]; then
  echo "ERROR: apply requires RFORM_OWNER_BOT_DIRECT_READ_CONFIRM='$CONFIRM_VALUE'"
  exit 2
fi

git cat-file -e "$BASELINE_REF^{commit}" 2>/dev/null || { echo "ERROR: baseline commit unavailable"; exit 3; }
mkdir -p "$SESSION_ROOT" && chmod 700 "$SESSION_ROOT"
SESSION="$SESSION_ROOT/owner-bot-direct-read-$(date -u +%Y%m%dT%H%M%SZ)-$$"
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
[[ "$(sha256sum "$live_cockpit" | awk '{print $1}')" == "$BASELINE_COCKPIT_SHA" ]] || { echo "ERROR: live cockpit drift from first /today hotfix"; exit 6; }
echo "Live Owner Bot first-hotfix source: PASS"

(cd "$SESSION/runtime" && clasp_cmd list-deployments --json >"$SESSION/deployments-before.json")
node - "$SESSION/deployments-before.json" "$SESSION/deployment-id" "$SESSION/deployment-version" <<'NODE'
const fs=require('fs');const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const hits=rows.filter(x=>String(x.description||'')==='R/Form Owner Bot Cockpit v1.3.0 /today hotfix' && Number(x.versionNumber)>14);
if(hits.length!==1) process.exit(1);
fs.writeFileSync(process.argv[3],String(hits[0].deploymentId||'')+'\n',{mode:0o600});
fs.writeFileSync(process.argv[4],String(hits[0].versionNumber)+'\n',{mode:0o600});
NODE
baseline_version="$(cat "$SESSION/deployment-version")"
echo "Existing Owner Bot hotfix deployment: PASS"

if [[ "$MODE" == "inspect" ]]; then
  echo "INSPECT_COMPLETE: current /today hotfix source and existing in-place deployment are the expected baseline."
  exit 0
fi

cp -R "$SESSION/runtime/remote" "$SESSION/backup-remote"; chmod -R go-rwx "$SESSION/backup-remote"
cp "$CANDIDATE_COCKPIT" "$live_cockpit"
[[ "$(sha256sum "$live_cockpit" | awk '{print $1}')" == "$CANDIDATE_COCKPIT_SHA" ]] || { echo "ERROR: staged cockpit mismatch"; exit 7; }

deployment_updated=0
rollback() {
  code=$?; [[ "$code" == "0" ]] && return
  trap - ERR
  echo "ROLLBACK: restoring previous Owner Bot cockpit source and deployment."
  rm -rf "$SESSION/runtime/remote"; cp -R "$SESSION/backup-remote" "$SESSION/runtime/remote"
  (cd "$SESSION/runtime" && clasp_cmd push --force >/dev/null 2>&1) || true
  if [[ "$deployment_updated" == "1" ]]; then
    dep_id="$(cat "$SESSION/deployment-id")"
    (cd "$SESSION/runtime" && clasp_cmd update-deployment "$dep_id" --versionNumber "$baseline_version" --description "R/Form Owner Bot Cockpit v1.3.0 /today hotfix" --json >/dev/null 2>&1) || true
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
[[ "$(sha256sum "$rb_core" | awk '{print $1}')" == "$BASELINE_CORE_SHA" ]] || { echo "ERROR: core changed during direct-read hotfix"; false; }
[[ "$(sha256sum "$rb_cockpit" | awk '{print $1}')" == "$CANDIDATE_COCKPIT_SHA" ]] || { echo "ERROR: cockpit source readback mismatch"; false; }
echo "Owner Bot direct-read source readback: PASS"

(cd "$SESSION/runtime" && clasp_cmd create-version "Owner Bot Cockpit v1.3.0 direct read-model" --json >"$SESSION/new-version.json")
new_version="$(node - "$SESSION/new-version.json" "$baseline_version" <<'NODE'
const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const baseline=Number(process.argv[3]);const v=Number(x.versionNumber??x.version??0);if(!Number.isInteger(v)||v<=baseline)process.exit(1);process.stdout.write(String(v));
NODE
)"
dep_id="$(cat "$SESSION/deployment-id")"
(cd "$SESSION/runtime" && clasp_cmd update-deployment "$dep_id" --versionNumber "$new_version" --description "R/Form Owner Bot Cockpit v1.3.0 direct read-model" --json >"$SESSION/deploy-update.json")
node - "$SESSION/deploy-update.json" "$SESSION/deployment-id" "$new_version" <<'NODE'
const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const id=fs.readFileSync(process.argv[3],'utf8').trim();const v=Number(process.argv[4]);if(String(x.deploymentId||'')!==id||Number(x.versionNumber)!==v)process.exit(1);
NODE
deployment_updated=1
echo "Owner Bot deployment update response: PASS"

converged=0
for attempt in 1 2 3 4 5; do
  (cd "$SESSION/runtime" && clasp_cmd list-deployments --json >"$SESSION/deployments-after.json")
  node - "$SESSION/deployments-before.json" "$SESSION/deployments-after.json" <<'NODE'
const fs=require('fs');const ids=p=>JSON.parse(fs.readFileSync(p,'utf8')).map(x=>String(x.deploymentId||'')).filter(Boolean).sort();if(JSON.stringify(ids(process.argv[2]))!==JSON.stringify(ids(process.argv[3])))process.exit(1);
NODE
  if node - "$SESSION/deployments-after.json" "$SESSION/deployment-id" "$new_version" <<'NODE'
const fs=require('fs');const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const id=fs.readFileSync(process.argv[3],'utf8').trim();const v=Number(process.argv[4]);const r=rows.find(x=>String(x.deploymentId||'')===id);if(!r||Number(r.versionNumber)!==v)process.exit(1);
NODE
  then converged=1; break; fi
  [[ "$attempt" == "5" ]] || sleep 3
done
[[ "$converged" == "1" ]] || { echo "ERROR: deployment metadata did not converge to new version"; false; }
echo "Owner Bot deployment ID set unchanged: PASS"
echo "Owner Bot deployment metadata readback: CONVERGED"

trap - ERR
printf '%s\n' "$new_version" >"$SESSION/new-deployment-version"; chmod 600 "$SESSION/new-deployment-version"
ln -sfn "$SESSION" "$SESSION_ROOT/owner-bot-direct-read-latest"
echo "RUNTIME_DEPLOYED_AWAITING_OWNER_ACCEPTANCE"
echo "OWNER_ACTION_REQUIRED: send /today once in the existing private R/Form Owner Bot chat."
