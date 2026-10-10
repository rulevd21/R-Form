#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-inspect}"
[[ "$MODE" == "inspect" || "$MODE" == "apply" ]] || { echo "ERROR: mode must be inspect or apply"; exit 1; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ERROR: run inside R/Form repository"; exit 1; }
cd "$ROOT"

CLASP_PACKAGE="@google/clasp@3.4.1"
BASELINE_REF="1b0474f4fa2616af5c6353650246476b67981774"
CANDIDATE="automation/content_event_detector_v0_3.gs"
CONFIRM_VALUE="APPLY CAPTURE CLOSURE EVENTS V1"
SESSION_ROOT="${RFORM_CLINE_SESSION_ROOT:-$HOME/.rform-cline}"

for cmd in git node npx grep find sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing required command: $cmd"; exit 1; }
done
[[ -f "$CANDIDATE" ]] || { echo "ERROR: detector candidate missing"; exit 1; }
node --check < "$CANDIDATE"
grep -Fq 'function rformContentEventDetectorWriteV03(e)' "$CANDIDATE" || { echo "ERROR: production trigger handler missing"; exit 1; }
grep -Fq "component_version:'0.4'" "$CANDIDATE" || { echo "ERROR: detector v0.4 marker missing"; exit 1; }
grep -Fq "lifecycle_version:'1.0'" "$CANDIDATE" || { echo "ERROR: lifecycle v1.0 marker missing"; exit 1; }
grep -Fq "observability_version:'0.1'" "$CANDIDATE" || { echo "ERROR: observability v0.1 marker missing"; exit 1; }
grep -Fq "lifecycleStart: '10.10.2026'" "$CANDIDATE" || { echo "ERROR: lifecycle start boundary missing"; exit 1; }

if [[ "$MODE" == "apply" && "${RFORM_CAPTURE_CLOSURE_EVENTS_CONFIRM:-}" != "$CONFIRM_VALUE" ]]; then
  echo "ERROR: apply requires RFORM_CAPTURE_CLOSURE_EVENTS_CONFIRM='$CONFIRM_VALUE'"
  exit 2
fi

git cat-file -e "$BASELINE_REF^{commit}" 2>/dev/null || { echo "ERROR: accepted detector baseline unavailable"; exit 3; }
mkdir -p "$SESSION_ROOT" && chmod 700 "$SESSION_ROOT"
SESSION="$SESSION_ROOT/capture-closure-events-v1-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$SESSION" && chmod 700 "$SESSION"
git show "$BASELINE_REF:automation/content_event_detector_v0_3.gs" >"$SESSION/baseline.gs"
BASELINE_SHA="$(sha256sum "$SESSION/baseline.gs" | awk '{print $1}')"
CANDIDATE_SHA="$(sha256sum "$CANDIDATE" | awk '{print $1}')"

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
let selected=ids.filter(x=>/(content.*event|detector|r.?form.*event)/i.test(x.name));if(!selected.length)selected=ids;
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
    core="$(find "$probe/remote" -type f \( -name '*.gs' -o -name '*.js' \) -print0 | xargs -0 grep -l 'function rformContentEventDetectorWriteV03' || true)"
    if [[ -n "$core" && "$(printf '%s\n' "$core" | wc -l | tr -d ' ')" == "1" ]]; then
      matches=$((matches+1))
      if [[ "$matches" == "1" ]]; then
        mv "$probe" "$SESSION/runtime"
        printf '%s\n' "$script_id" >"$SESSION/script-id"
        printf '%s\n' "${core#${probe}/remote/}" >"$SESSION/core-relative"
      else rm -rf "$probe"; fi
    else rm -rf "$probe"; fi
  else rm -rf "$probe"; fi
done <"$SESSION/candidates"
[[ "$matches" == "1" ]] || { echo "ERROR: expected exactly one detector project; found $matches"; exit 5; }
echo "Detector project discovery: PASS"

live_core="$SESSION/runtime/remote/$(cat "$SESSION/core-relative")"
LIVE_SHA="$(sha256sum "$live_core" | awk '{print $1}')"
[[ "$LIVE_SHA" == "$BASELINE_SHA" ]] || { echo "ERROR: live detector baseline drift"; exit 6; }
echo "Live detector accepted baseline: PASS"
echo "Existing trigger handler preserved: rformContentEventDetectorWriteV03"

if [[ "$MODE" == "inspect" ]]; then
  echo "INSPECT_COMPLETE: detector source matches accepted v0.3 + observability 0.1 baseline; no runtime write performed."
  exit 0
fi

cp -R "$SESSION/runtime/remote" "$SESSION/backup-remote"; chmod -R go-rwx "$SESSION/backup-remote"
cp "$CANDIDATE" "$live_core"
[[ "$(sha256sum "$live_core" | awk '{print $1}')" == "$CANDIDATE_SHA" ]] || { echo "ERROR: staged candidate mismatch"; exit 7; }

rollback() {
  code=$?; [[ "$code" == "0" ]] && return
  trap - ERR
  echo "ROLLBACK: restoring accepted detector source baseline."
  rm -rf "$SESSION/runtime/remote"; cp -R "$SESSION/backup-remote" "$SESSION/runtime/remote"
  (cd "$SESSION/runtime" && clasp_cmd push --force >/dev/null 2>&1) || true
  echo "ROLLBACK_ATTEMPTED: inspect runtime before any retry."
  exit "$code"
}
trap rollback ERR

(cd "$SESSION/runtime" && clasp_cmd push --force >"$SESSION/push.log")
rm -rf "$SESSION/readback"; mkdir -p "$SESSION/readback/remote"; cp "$SESSION/runtime/.clasp.json" "$SESSION/readback/.clasp.json"
(cd "$SESSION/readback" && clasp_cmd pull >"$SESSION/readback.log")
rb_core="$(find "$SESSION/readback/remote" -type f \( -name '*.gs' -o -name '*.js' \) -print0 | xargs -0 grep -l 'function rformContentEventDetectorWriteV03' || true)"
[[ -n "$rb_core" && "$(printf '%s\n' "$rb_core" | wc -l | tr -d ' ')" == "1" ]] || { echo "ERROR: detector source readback not unique"; false; }
[[ "$(sha256sum "$rb_core" | awk '{print $1}')" == "$CANDIDATE_SHA" ]] || { echo "ERROR: detector source readback mismatch"; false; }
grep -Fq "component_version:'0.4'" "$rb_core"
grep -Fq "lifecycle_version:'1.0'" "$rb_core"
grep -Fq "observability_version:'0.1'" "$rb_core"
echo "Capture Closure Events source readback: PASS"

# clasp push changes project source only. It does not create/delete installable triggers.
# The existing trigger continues to call the unchanged handler name.
trap - ERR
ln -sfn "$SESSION" "$SESSION_ROOT/capture-closure-events-v1-latest"
echo "RUNTIME_DEPLOYED_AWAITING_SCHEDULED_ACCEPTANCE"
echo "NEXT_GATE: require a natural scheduled RFORM_DETECTOR_RUN START/FINISH receipt and DATA_EVENTS readback before VERIFIED_PRODUCTION."
