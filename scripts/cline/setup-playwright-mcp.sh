#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "ERROR: run inside the R/Form repository."
  exit 1
fi
cd "$ROOT"

for command in node npm npx git; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command"
    exit 1
  }
done

CLINE_SETTINGS="${CLINE_MCP_SETTINGS:-$HOME/.cline/data/settings/cline_mcp_settings.json}"
mkdir -p "$(dirname "$CLINE_SETTINGS")"

if [[ -f "$CLINE_SETTINGS" ]]; then
  cp "$CLINE_SETTINGS" "$CLINE_SETTINGS.rform-backup-$(date -u +%Y%m%dT%H%M%SZ)"
fi

SETTINGS_PATH="$CLINE_SETTINGS" node <<'NODE'
const fs = require('fs');
const path = process.env.SETTINGS_PATH;
let data = {};
if (fs.existsSync(path)) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (text) {
    try { data = JSON.parse(text); }
    catch (err) {
      console.error('ERROR: existing Cline MCP settings are not valid JSON.');
      process.exit(1);
    }
  }
}
if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
if (!data.mcpServers || typeof data.mcpServers !== 'object' || Array.isArray(data.mcpServers)) {
  data.mcpServers = {};
}

data.mcpServers['playwright-rform'] = {
  command: 'npx',
  args: ['--yes', '@playwright/mcp@latest', '--cdp-endpoint=chrome'],
  disabled: false,
  autoApprove: []
};

fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
NODE

chmod 600 "$CLINE_SETTINGS" 2>/dev/null || true

echo "Cline MCP configuration: PASS"
echo "Playwright MCP mode: existing Chrome via local CDP channel"
echo "Secrets written to repository: NO"
echo "Cline paid-credit configuration changed: NO"
echo "MCP settings path: $CLINE_SETTINGS"
echo "READY: Playwright MCP is configured for R/Form."
echo "If Cline reports that Chrome remote debugging is disabled, open chrome://inspect/#remote-debugging in Chrome, enable 'Allow remote debugging for this browser instance', and rerun the failed browser step."
