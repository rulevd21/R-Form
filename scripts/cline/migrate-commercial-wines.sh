#!/usr/bin/env bash
set -euo pipefail

SOURCE_REPO="rulevd21/R-Form"
DEST_REPO="rulevd21/commercial-wines"
PREFIX="commercial-wines"
PAGE_URL="https://rulevd21.github.io/commercial-wines/"

for cmd in git gh curl sha256sum mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing $cmd"; exit 1; }
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ERROR: run inside R/Form repository"; exit 1; }
cd "$ROOT"

gh auth status --hostname github.com >/dev/null 2>&1 || {
  echo "OWNER_ACTION_REQUIRED: GITHUB_AUTH"
  exit 2
}

[[ "$(gh api "repos/$SOURCE_REPO" --jq '.permissions.admin // false')" == "true" ]] || {
  echo "OWNER_ACTION_REQUIRED: GITHUB_ADMIN_TOKEN"
  exit 3
}

git fetch origin main --prune >/dev/null

git cat-file -e "origin/main:$PREFIX/index.html" || {
  if gh api "repos/$DEST_REPO/contents/index.html?ref=main" >/dev/null 2>&1; then
    echo "ALREADY_MIGRATED: source subtree absent and destination exists."
    exit 0
  fi
  echo "ERROR: source subtree missing before verified destination exists."
  exit 4
}

source_tmp="$(mktemp)"
dest_tmp="$(mktemp)"
cleanup_dir=""
trap 'rm -f "$source_tmp" "$dest_tmp"; [[ -z "$cleanup_dir" ]] || git worktree remove --force "$cleanup_dir" >/dev/null 2>&1 || true' EXIT

git show "origin/main:$PREFIX/index.html" > "$source_tmp"
source_hash="$(sha256sum "$source_tmp" | awk '{print $1}')"

if gh api "repos/$DEST_REPO" >/dev/null 2>&1; then
  echo "Destination repository already exists; verifying before reuse."
else
  gh repo create "$DEST_REPO" --public \
    --description "Commercial Wines interactive dashboard, separated from R/Form core" \
    --disable-wiki >/dev/null
  echo "Destination repository created."
fi

if gh api "repos/$DEST_REPO/contents/index.html?ref=main" >/dev/null 2>&1; then
  download_url="$(gh api "repos/$DEST_REPO/contents/index.html?ref=main" --jq .download_url)"
  curl -fsSL "$download_url" > "$dest_tmp"
  [[ "$(sha256sum "$dest_tmp" | awk '{print $1}')" == "$source_hash" ]] || {
    echo "ERROR: existing destination index.html does not match R/Form source."
    exit 5
  }
  echo "Destination content already matches source."
else
  split_sha="$(git subtree split --prefix="$PREFIX" origin/main)"
  [[ -n "$split_sha" ]] || { echo "ERROR: subtree split failed"; exit 6; }
  git push "https://github.com/$DEST_REPO.git" "$split_sha:refs/heads/main" >/dev/null
  echo "Subtree history pushed to destination main."
fi

# Exact content readback after push/reuse.
download_url="$(gh api "repos/$DEST_REPO/contents/index.html?ref=main" --jq .download_url)"
curl -fsSL "$download_url" > "$dest_tmp"
dest_hash="$(sha256sum "$dest_tmp" | awk '{print $1}')"
[[ "$dest_hash" == "$source_hash" ]] || { echo "ERROR: destination hash mismatch"; exit 7; }
echo "DESTINATION_READBACK: PASS"

# Configure public Pages from main/root. Existing site is updated idempotently.
if gh api "repos/$DEST_REPO/pages" >/dev/null 2>&1; then
  gh api --method PUT "repos/$DEST_REPO/pages" \
    -f build_type=legacy \
    -f 'source[branch]=main' \
    -f 'source[path]=/' >/dev/null
else
  gh api --method POST "repos/$DEST_REPO/pages" \
    -f build_type=legacy \
    -f 'source[branch]=main' \
    -f 'source[path]=/' >/dev/null
fi

echo "Pages configuration applied."

# Pages is asynchronous. Check the canonical URL, but never delete source on a failed verification.
page_ok=false
for _ in $(seq 1 24); do
  status="$(curl -L -sS -o "$dest_tmp" -w '%{http_code}' "$PAGE_URL" || true)"
  if [[ "$status" == "200" ]] && [[ "$(sha256sum "$dest_tmp" | awk '{print $1}')" == "$source_hash" ]]; then
    page_ok=true
    break
  fi
  sleep 5
done
[[ "$page_ok" == "true" ]] || {
  echo "OWNER_ACTION_REQUIRED: VERIFY_COMMERCIAL_WINES_PAGES"
  echo "Destination repository is verified, but public Pages did not yet return the exact artifact. Source subtree was preserved."
  exit 8
}
echo "PAGES_READBACK: PASS"

# Only now remove active subtree through a normal PR.
cleanup_dir="$(mktemp -d)"
rm -rf "$cleanup_dir"
git worktree add -b cleanup/remove-commercial-wines "$cleanup_dir" origin/main >/dev/null
(
  cd "$cleanup_dir"
  git rm -r "$PREFIX" >/dev/null
  git commit -m "Remove Commercial Wines from R/Form core" >/dev/null
  git push -u origin cleanup/remove-commercial-wines >/dev/null
)

pr_url="$(gh pr list --repo "$SOURCE_REPO" --head cleanup/remove-commercial-wines --state open --json url --jq '.[0].url // empty')"
if [[ -z "$pr_url" ]]; then
  pr_url="$(gh pr create --repo "$SOURCE_REPO" \
    --base main --head cleanup/remove-commercial-wines \
    --title "Remove migrated Commercial Wines subtree" \
    --body "Closes #55 after destination and GitHub Pages readback. The Commercial Wines subtree history was split into rulevd21/commercial-wines before removal from active R/Form main. Historical R/Form commits remain unchanged." )"
fi

echo "Cleanup PR: $pr_url"
gh pr checks "$pr_url" --watch --fail-fast

gh pr merge "$pr_url" --merge --delete-branch

git fetch origin main --prune >/dev/null
if git cat-file -e "origin/main:$PREFIX/index.html" 2>/dev/null; then
  echo "ERROR: source subtree still exists after merge."
  exit 9
fi
curl -fsSL "$PAGE_URL" > "$dest_tmp"
[[ "$(sha256sum "$dest_tmp" | awk '{print $1}')" == "$source_hash" ]] || {
  echo "ERROR: destination changed after source cleanup."
  exit 10
}

gh issue close 55 --repo "$SOURCE_REPO" --reason completed \
  --comment "Migration completed: subtree history and exact index artifact verified in rulevd21/commercial-wines; public Pages verified before removal; cleanup PR merged; R/Form history retained." >/dev/null

echo "DONE: Commercial Wines migrated and Issue #55 closed."
