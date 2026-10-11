#!/usr/bin/env bash
set -euo pipefail

REPO="rulevd21/R-Form"
MAIN_NAME="R/Form main protection"
PRODUCTION_NAME="R/Form production ref protection"

for cmd in gh jq mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing $cmd"; exit 1; }
done

gh auth status --hostname github.com >/dev/null 2>&1 || {
  echo "OWNER_ACTION_REQUIRED: GITHUB_AUTH"
  exit 2
}

is_admin="$(gh api "repos/$REPO" --jq '.permissions.admin // false')"
[[ "$is_admin" == "true" ]] || {
  echo "OWNER_ACTION_REQUIRED: GITHUB_ADMIN_TOKEN"
  exit 3
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cat > "$work/main.json" <<'JSON'
{
  "name": "R/Form main protection",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    {"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}
  ],
  "conditions": {
    "ref_name": {"include": ["refs/heads/main"], "exclude": []}
  },
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["merge", "squash", "rebase"],
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "do_not_enforce_on_create": true,
        "required_status_checks": [
          {"context": "R/Form required PR gate"}
        ],
        "strict_required_status_checks_policy": true
      }
    }
  ]
}
JSON

cat > "$work/production.json" <<'JSON'
{
  "name": "R/Form production ref protection",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    {"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}
  ],
  "conditions": {
    "ref_name": {"include": ["refs/heads/production"], "exclude": []}
  },
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "update", "parameters": {"update_allows_fetch_and_merge": false}}
  ]
}
JSON

upsert_ruleset() {
  local name="$1" payload="$2"
  local id
  id="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id" | head -n 1)"
  if [[ -n "$id" ]]; then
    gh api --method PUT "repos/$REPO/rulesets/$id" --input "$payload" >/dev/null
    echo "UPDATED: $name"
  else
    gh api --method POST "repos/$REPO/rulesets" --input "$payload" >/dev/null
    echo "CREATED: $name"
  fi
}

upsert_ruleset "$MAIN_NAME" "$work/main.json"
upsert_ruleset "$PRODUCTION_NAME" "$work/production.json"

snapshot="$work/rulesets.json"
gh api "repos/$REPO/rulesets" > "$snapshot"

node - "$snapshot" <<'NODE'
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = ['R/Form main protection', 'R/Form production ref protection'];
for (const name of expected) {
  const r = rows.find(x => x.name === name);
  if (!r || r.enforcement !== 'active' || r.target !== 'branch') {
    throw new Error(`ruleset readback failed: ${name}`);
  }
}
console.log('RULESET_READBACK: PASS');
NODE

echo "DONE: main and production rulesets are active."
echo "NOTE: admin role bypass is reserved by VERSION_GOVERNANCE.md for emergency restoration / governed release only."
