# R/Form · local privileged gate closure via Cline + Playwright MCP

Use this wrapper when the owner explicitly authorizes completion of the remaining privileged R/Form gates from a local machine using an already-authenticated Chrome session.

This wrapper changes only the execution transport/provider assumptions of `.clinerules/workflows/rform-close-open-gates.md`. All acceptance criteria, fail-closed rules, repository boundaries, issue-close rules, runtime evidence requirements, and production governance in that workflow remain authoritative.

## Zero-Cline-credit execution boundary

- Use OpenAI Codex authentication through the owner's ChatGPT subscription, or another provider that is explicitly zero-cost to the owner for this run.
- Do not use or purchase Cline credits.
- If Cline reports that the selected provider would consume Cline credits, stop before execution and switch provider.

## Browser boundary

- Use the MCP server named `playwright-rform` configured by `scripts/cline/setup-playwright-mcp.sh`.
- It must connect to the owner's existing local Chrome session using Playwright MCP `--cdp-endpoint=chrome`.
- Reuse existing GitHub/Google authenticated browser state; never request passwords, cookies, session tokens, OAuth secrets, Apps Script IDs, deployment IDs, or GitHub tokens in chat or terminal output.
- If Playwright cannot attach because Chrome remote debugging is disabled, the only owner action to request is: open `chrome://inspect/#remote-debugging`, enable **Allow remote debugging for this browser instance**, then resume the same failed step.
- Browser automation is permitted only for the sites/actions required by the authoritative closure workflow. Do not broaden navigation or access unrelated accounts/data.

## Local prerequisite policy

Cline may install missing non-secret CLI prerequisites needed by the existing repository scripts (for example GitHub CLI or jq) using the normal platform package manager. Do not disable OS security controls or require the owner to expose secrets. If privilege escalation is required, request only the operating-system approval itself.

## Execution

1. Run `bash scripts/cline/setup-playwright-mcp.sh` and require `READY: Playwright MCP is configured for R/Form.`
2. Confirm the `playwright-rform` MCP server is available in Cline. Perform only a read-only smoke check against the R/Form GitHub repository. If attach fails solely because Chrome remote debugging is disabled, request the single owner action described above, then retry.
3. Read `.clinerules/workflows/rform-close-open-gates.md` in full.
4. Execute its Steps 0–5 exactly, preserving every hard boundary and acceptance criterion. `scripts/cline/rform-cloud-onboard.sh` is still the canonical authenticated Apps Script runtime bootstrap despite its historical filename.
5. For Issue #57, use only a natural in-window checkpoint observed during execution. Exact publication timing already reconciled in canonical R/Form data may be used to determine eligibility, but no metric value may be inferred, reconstructed, or backfilled from a later cumulative counter.
6. Finish with the original workflow's final readback. Leave any gate open unless its explicit acceptance contract is satisfied.

## Owner-interruption budget

The expected owner interaction is limited to unavoidable authorization/security actions: ChatGPT/OpenAI Codex OAuth if not already authorized, Chrome remote-debugging enablement if not already enabled, Google OAuth/App Script API enablement if requested by clasp, or the one named Apps Script trigger-installer function if clasp cannot install the trigger. Everything else should be executed and verified by Cline without asking the owner to copy commands, IDs, tokens, or intermediate outputs.
