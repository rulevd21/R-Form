# Owner Bot Build Report v1.5 — one-shot production workflow

Use a FREE model only. Keep context narrow and deterministic.

## Scope

Materialize, review, merge and deploy Owner Bot Build Report v1.5. Do not modify canonical business data, Script Properties, triggers, Telegram publication state, Content Queue, or create another deployment URL.

## Phase A — materialize reviewed candidate

1. Work on branch `feature/owner-bot-build-report-v1-5` and fetch latest origin.
2. Run:
   - `node scripts/release/apply-owner-bot-build-report-v1-5.mjs --check`
   - `node scripts/release/apply-owner-bot-build-report-v1-5.mjs --apply`
3. Confirm `automation/owner_bot_cockpit_v1_3.gs` now contains `version: '1.5.0'`, `rformOwnerBotV15ShowAnalyticalReport_`, and `oc:rp:b:`.
4. Run:
   - `node --check < automation/owner_bot_cockpit_v1_3.gs`
   - `node --test tests/owner-bot-cockpit-v1-3.test.mjs`
   - `node --test tests/owner-bot-build-report-v1-5.test.mjs`
   - `bash -n scripts/apps-script/owner-bot-build-report-v1-5-runtime.sh`
5. Commit only the materialized cockpit change with message `Materialize Owner Bot Build Report v1.5` and push the branch.

## Phase B — CI and merge

1. Use existing PR for this branch.
2. Require Apps Script Deployment CI, R/Form Skill Integrity and Runtime Manifest Governance to be green where applicable.
3. Re-check the PR diff for secrets/private URLs/hardcoded Telegram chat IDs.
4. Merge only when green. Then checkout/pull current `main`.

## Phase C — read-only runtime inspect

Run:

`bash scripts/apps-script/owner-bot-build-report-v1-5-runtime.sh inspect`

Require all PASS receipts and exact accepted v1.4 live baseline. On any drift/error, stop fail-closed.

## Phase D — guarded in-place rollout

Only after Phase C PASS run:

`RFORM_OWNER_BOT_BUILD_REPORT_CONFIRM='APPLY OWNER BOT BUILD REPORT V1.5' bash scripts/apps-script/owner-bot-build-report-v1-5-runtime.sh apply`

Rules:
- update the existing Owner Bot deployment in place;
- never create a parallel deployment/URL;
- do not change Script Properties or triggers;
- do not write canonical rows or publication state;
- on any error, allow scripted rollback and stop.

Stop only at:

`RUNTIME_DEPLOYED_AWAITING_OWNER_ACCEPTANCE`

Return only non-secret receipts.

## Phase E — owner acceptance

Owner selects any exact period in private Owner Bot, confirms summary offers `Сформировать отчёт` (or `Сформировать черновик` when incomplete), taps it, and returns the analytical report screenshot/text.

Do not mark VERIFIED_PRODUCTION until owner acceptance is recorded separately.
