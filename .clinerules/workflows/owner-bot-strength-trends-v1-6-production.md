# Owner Bot Strength Trends v1.6 — one-shot production workflow

Use a FREE model only. Keep context narrow and deterministic.

## Scope

Materialize, review, merge and deploy Owner Bot Strength Trends v1.6. Do not modify canonical business data, Script Properties, triggers, Telegram publication state, Content Queue, or create another deployment URL.

## Phase A — materialize reviewed candidate

1. Work on branch `feature/owner-bot-strength-trends-v1-6` and fetch latest origin.
2. Run:
   - `node scripts/release/apply-owner-bot-strength-trends-v1-6.mjs --check`
   - `node scripts/release/apply-owner-bot-strength-trends-v1-6.mjs --apply`
3. Confirm `automation/owner_bot_cockpit_v1_3.gs` contains `version: '1.6.0'`, `setsSheet: 'TRAINING_SETS'`, `rformOwnerBotV16StrengthTrends_`, and `СИЛОВЫЕ ТРЕНДЫ`.
4. Run:
   - `node --check < automation/owner_bot_cockpit_v1_3.gs`
   - `node --test tests/owner-bot-cockpit-v1-3.test.mjs`
   - `node --test tests/owner-bot-strength-trends-v1-6.test.mjs`
   - `node scripts/release/apply-owner-bot-strength-trends-v1-6.mjs --check`
   - `node scripts/release/apply-owner-bot-strength-trends-v1-6.mjs --apply`
   - `bash -n scripts/apps-script/owner-bot-strength-trends-v1-6-runtime.sh`
5. Commit only the materialized cockpit change with message `Materialize Owner Bot Strength Trends v1.6` and push the branch.

## Phase B — CI and merge

1. Use existing PR for this branch.
2. Require Apps Script Deployment CI and any other applicable checks to be green.
3. Re-check the PR diff for secrets/private URLs/hardcoded Telegram chat IDs.
4. Merge only when green. Then checkout/pull current `main`.

## Phase C — read-only runtime inspect

Run:

`bash scripts/apps-script/owner-bot-strength-trends-v1-6-runtime.sh inspect`

Require all PASS receipts and exact accepted v1.5 live baseline. On any drift/error, stop fail-closed.

## Phase D — guarded in-place rollout

Only after Phase C PASS run:

`RFORM_OWNER_BOT_STRENGTH_TRENDS_CONFIRM='APPLY OWNER BOT STRENGTH TRENDS V1.6' bash scripts/apps-script/owner-bot-strength-trends-v1-6-runtime.sh apply`

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

Owner rebuilds the exact 10.09.2026–09.10.2026 analytical report and verifies a distinct `СИЛОВЫЕ ТРЕНДЫ` section. It should show exercise-level details from canonical TRAINING_SETS, including repeated primary strength exercises, first/latest top sets, RIR-aware e1RM estimate, peak load, period tonnage and average RIR where available.

Do not mark VERIFIED_PRODUCTION until owner acceptance is recorded separately.
