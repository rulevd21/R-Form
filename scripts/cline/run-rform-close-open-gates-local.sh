#!/usr/bin/env bash
set -euo pipefail

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

for command in git node npm npx; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command"
    exit 1
  }
done

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree must be clean before privileged closure workflow."
  exit 1
fi

git fetch origin main production --prune
git switch main
git pull --ff-only origin main

bash scripts/cline/setup-playwright-mcp.sh

if command -v cline >/dev/null 2>&1; then
  CLINE=(cline)
else
  CLINE=(npx --yes cline)
fi

if [[ "${RFORM_SKIP_CODEX_AUTH:-0}" != "1" ]]; then
  echo "AUTH: selecting OpenAI Codex provider through the user's ChatGPT subscription; no Cline credits are requested."
  "${CLINE[@]}" auth openai-codex
fi

PROMPT=$(cat <<'EOF'
The owner explicitly authorizes completion of R/Form Issues #42, #56, #57, and #55.

First read `.clinerules/workflows/rform-close-open-gates-local.md`, then execute it end to end from the current clean `main` checkout.

Use the configured `playwright-rform` MCP server for browser-only steps and the owner's existing Chrome session. Install missing non-secret local CLI dependencies when safe. Never spend Cline credits, never print credentials/project IDs/tokens/private URLs, never weaken acceptance gates, and never fabricate runtime evidence or Telegram checkpoint data.

Stop only for an unavoidable owner action explicitly allowed by the workflow: Google OAuth consent, enabling Chrome remote debugging, enabling the Apps Script API, or manually running the named Apps Script trigger installer if clasp cannot install it. After that action, resume the same workflow.

Finish with the final readback for issues 42/55/56/57, active rulesets, main/production refs, and any gate intentionally left open.
EOF
)

exec "${CLINE[@]}" --auto-approve true "$PROMPT"
