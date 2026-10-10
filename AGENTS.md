# R/Form Agent Rules

These rules apply to AI coding/automation agents working in `rulevd21/R-Form`.

## Architecture boundaries

- Business/operational Source of Truth is Google Drive / `RFORM_MASTER_DATA_v1` plus the current approved Handbook/Addendum. Do not copy live operational state into repository files.
- GitHub owns source code, technical contracts, tests, release notes and deployment instructions.
- `CONTENT_QUEUE` owns editorial/approval/publication state. Do not create a second publication state machine.
- The existing `rform-operating-system` Skill is the command router. Do not add a competing top-level router.
- Existing working applications and Apps Script projects are reused before new components are proposed.

## Coding/change policy

- Diagnose root cause before patching.
- Make the minimum sufficient diff.
- Preserve backward-compatible user commands and current production interfaces.
- Do not change production datastore schema, production Apps Script, deployment URLs, secrets, permissions or Telegram transport without an explicit named production gate/owner command.
- Never commit secrets, bot tokens, API keys or private credentials.
- Do not add paid APIs/SaaS dependencies without explicit owner approval.
- Do not add email-dependent workflows.

## Branch and release policy

- Treat development/sandbox branches as non-production until deployment is verified.
- Do not infer production state from branch names.
- Do not merge or deploy merely to test.
- Exact release commands must act on the exact named version.
- Preserve rollback paths and version history.

## Data safety

- Use canonical IDs, record keys, duplicate flags and existing QA/audit mechanisms.
- Never delete history to clean an active view; use existing hold/supersede/archive semantics.
- Do not fabricate production acceptance data.
- Read back any authorized write before reporting success.

## Testing

- Run component regression tests for changed behavior.
- For the Operating System Skill, all local markdown references in `SKILL.md` must resolve.
- State transitions must have explicit precondition, authorized action and verifiable postcondition.
- Deployment documentation must match the current application/API version or be clearly marked historical.

## AGENTS.md scope

Keep this file technical. Do not put current user data, content queue items, temporary goals, competition status or a specific `/goal` here.
