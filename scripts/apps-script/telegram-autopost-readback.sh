#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
CLASP_PACKAGE="@google/clasp@3.4.1"
ACCEPTED_REF="9fea95e11aab60dc7fe28277fa3aaedbb11c2c10"
ACCEPTED_PATH="automation/telegram_autopost_v0_3.gs"
SESSION="$(mktemp -d)"
trap 'rm -rf "$SESSION"' EXIT

clasp_cmd() {
  npx --yes "$CLASP_PACKAGE" "$@"
}

for cmd in git node npx grep sha256sum cmp diff; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing $cmd"; exit 1; }
done

# Auth must already be supplied by the protected runtime/session.
auth_json="$SESSION/auth.json"
clasp_cmd show-authorized-user --json >"$auth_json" 2>/dev/null || {
  echo "ERROR: clasp credential is unavailable or invalid."
  exit 2
}
node - "$auth_json" <<'NODE'
const fs = require('fs');
const x = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!x || x.loggedIn !== true) process.exit(1);
NODE

echo "Clasp authorization: PASS"

scripts_json="$SESSION/scripts.json"
clasp_cmd list-scripts --json >"$scripts_json"
chmod 600 "$scripts_json"

node - "$scripts_json" "$SESSION/candidates" <<'NODE'
const fs = require('fs');
const [file, out] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const scripts = Array.isArray(raw) ? raw : (Array.isArray(raw.scripts) ? raw.scripts : []);
const cleaned = scripts.map(x => ({
  id: String(x.id || x.scriptId || ''),
  name: String(x.name || x.title || '')
})).filter(x => x.id);
let selected = cleaned.filter(x => /(telegram.*autopost|autopost|r.?form.*telegram)/i.test(x.name));
if (!selected.length) selected = cleaned;
fs.writeFileSync(out, selected.map(x => x.id).join('\n') + (selected.length ? '\n' : ''), {mode: 0o600});
NODE

matches=0
idx=0
while IFS= read -r script_id; do
  [[ -n "$script_id" ]] || continue
  idx=$((idx + 1))
  probe="$SESSION/probe-$idx"
  mkdir -p "$probe/remote"
  SCRIPT_ID="$script_id" PROBE="$probe" node <<'NODE'
const fs = require('fs');
const path = require('path');
fs.writeFileSync(path.join(process.env.PROBE, '.clasp.json'), JSON.stringify({
  scriptId: process.env.SCRIPT_ID,
  rootDir: 'remote'
}, null, 2) + '\n', {mode: 0o600});
NODE

  if (cd "$probe" && clasp_cmd pull >"$SESSION/pull-$idx.log" 2>&1); then
    target="$(node - "$probe/remote" <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
function walk(d) {
  const out=[];
  for (const e of fs.readdirSync(d,{withFileTypes:true})) {
    const p=path.join(d,e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
const matches = walk(root).filter(f => /\.(?:gs|js)$/i.test(f)).filter(f => {
  const t=fs.readFileSync(f,'utf8');
  return t.includes('function rformTgProcessQueue') &&
         /version\s*:\s*['\"]0\.3\.2['\"]/.test(t) &&
         t.includes("reviewHashContract: 'V1_TEXT_VISUAL_URL'");
});
if (matches.length === 1) process.stdout.write(matches[0]);
NODE
)"
    if [[ -n "$target" ]]; then
      matches=$((matches + 1))
      if [[ "$matches" == "1" ]]; then
        mv "$probe" "$SESSION/autopost"
        printf '%s\n' "$script_id" >"$SESSION/autopost-id"
        chmod 600 "$SESSION/autopost-id"
        rel="${target#${probe}/remote/}"
        printf '%s\n' "$rel" >"$SESSION/target-relative-path"
      else
        rm -rf "$probe"
      fi
    else
      rm -rf "$probe"
    fi
  else
    rm -rf "$probe"
  fi
done <"$SESSION/candidates"

if [[ "$matches" != "1" ]]; then
  echo "ERROR: expected exactly one accessible Telegram Autopost v0.3.2 project; found $matches."
  exit 3
fi

echo "Autopost project discovery by source contract: PASS"

# Materialize the exact source that produced the accepted v0.3.2 release.
git cat-file -e "${ACCEPTED_REF}^{commit}" 2>/dev/null || git fetch --quiet --depth=1 origin "$ACCEPTED_REF"
git show "${ACCEPTED_REF}:${ACCEPTED_PATH}" >"$SESSION/accepted.gs"

target_rel="$(cat "$SESSION/target-relative-path")"
live="$SESSION/autopost/remote/$target_rel"
accepted="$SESSION/accepted.gs"
live_sha="$(sha256sum "$live" | awk '{print $1}')"
accepted_sha="$(sha256sum "$accepted" | awk '{print $1}')"

echo "Live source SHA-256: $live_sha"
echo "Accepted source SHA-256: $accepted_sha"

continuity="exact"
if cmp -s "$live" "$accepted"; then
  echo "Exact accepted-source continuity: PASS"
  echo "Semantic accepted-source continuity: PASS"
else
  diff_file="$SESSION/source.diff"
  diff -u "$accepted" "$live" >"$diff_file" || true
  if node - "$diff_file" <<'NODE'
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const changed = lines
  .filter(line => (/^[+-]/.test(line)) && !line.startsWith('+++') && !line.startsWith('---'))
  .map(line => line.slice(1).trim());
function commentOnly(s) {
  return s === '' || s.startsWith('//') || s.startsWith('/*') || s.startsWith('*') || s.startsWith('*/');
}
if (!changed.length || !changed.every(commentOnly)) process.exit(1);
NODE
  then
    continuity="comment-only"
    echo "Exact accepted-source continuity: FAILED — comment-only drift"
    echo "Semantic accepted-source continuity: PASS — executable logic unchanged"
  else
    echo "Exact accepted-source continuity: FAILED — executable source drift detected"
    echo "Semantic accepted-source continuity: FAILED"
    exit 4
  fi
fi

# Optional read-only runtime preflight. This may be unavailable when the script has
# no API-executable deployment; that does not mutate the project and is not treated
# as a source-readback failure.
preflight="$SESSION/preflight.json"
if (cd "$SESSION/autopost" && clasp_cmd run-function rformTgPreflight --json >"$preflight" 2>"$SESSION/preflight.err"); then
  node - "$preflight" <<'NODE'
const fs=require('fs');
let x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (x && x.result !== undefined) x=x.result;
if (typeof x === 'string') { try { x=JSON.parse(x); } catch {} }
if (!x || x.ok !== true || x.version !== '0.3.2') process.exit(1);
console.log('Read-only preflight: PASS');
console.log(`Trigger present: ${x.triggerExists === true ? 'YES' : 'NO'}`);
console.log(`Autopublish enabled: ${String(x.autopublishEnabled || 'UNKNOWN').toUpperCase()}`);
console.log(`Review hash contract: ${String(x.reviewHashContract || 'UNKNOWN')}`);
console.log(`Missing autopost headers: ${Array.isArray(x.missingAutopostHeaders) ? x.missingAutopostHeaders.length : 'UNKNOWN'}`);
NODE
else
  echo "Read-only preflight: UNAVAILABLE (no API-executable path or equivalent); no endpoint was created."
fi

if [[ "$continuity" == "exact" ]]; then
  echo "READBACK_COMPLETE: Telegram Autopost v0.3.2 exact source continuity proven."
else
  echo "READBACK_COMPLETE: Telegram Autopost v0.3.2 semantic source continuity proven; byte drift is comment-only."
fi
echo "No Script ID, deployment ID, OAuth credential, bot token, chat ID, or Telegram payload was printed."
