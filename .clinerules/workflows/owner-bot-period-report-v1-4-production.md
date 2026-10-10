# Owner Bot Period Report v1.4 — Production Workflow

Use this workflow only after the candidate is merged to `main` and all GitHub CI checks are green.

## Cost/context rule

Use the currently selected FREE Cline model. Do not perform broad repository scans. Read only this workflow, the rollout script, the cockpit candidate, and the exact files the script itself needs.

## Goal

Deploy `automation/owner_bot_cockpit_v1_3.gs` v1.4.0 to the existing R/Form Owner Bot Apps Script project and update the existing web-app deployment in place.

Do not create a new deployment, URL, trigger, Script Property, datastore, publisher, or canonical data write.

## Steps

1. Confirm repository is on current `main` and clean.
2. Run deterministic tests only:
   - `node --check < automation/owner_bot_cockpit_v1_3.gs`
   - `node --test tests/owner-bot-cockpit-v1-3.test.mjs`
   - `bash -n scripts/apps-script/owner-bot-period-report-v1-4-runtime.sh`
3. Run read-only production inspection:
   - `bash scripts/apps-script/owner-bot-period-report-v1-4-runtime.sh inspect`
4. Stop immediately if inspection reports source drift, ambiguous project/deployment discovery, missing clasp authorization, or any other error. Do not repair production ad hoc.
5. If and only if inspect passes, run guarded apply with the exact confirmation environment value required by the script:
   - `RFORM_OWNER_BOT_PERIOD_REPORT_CONFIRM='APPLY OWNER BOT PERIOD REPORT V1.4' bash scripts/apps-script/owner-bot-period-report-v1-4-runtime.sh apply`
6. Do not retry an outcome-unknown apply automatically.
7. Report only the non-secret terminal receipts. Never print project IDs, deployment IDs, tokens, Script Properties, OAuth material, or private URLs.
8. Stop at:
   - `RUNTIME_DEPLOYED_AWAITING_OWNER_ACCEPTANCE`

## Required production postconditions

- live Owner Bot core remains byte-identical to accepted baseline;
- live cockpit is byte-identical to v1.4.0 candidate;
- existing deployment ID set is unchanged;
- existing web-app deployment points to the new immutable version;
- no trigger or Script Property operation was performed;
- no canonical table or Telegram publication mutation was performed.

## Owner acceptance

Owner opens the existing private Owner Bot and performs:

1. `/today`;
2. `Отчёт за период`;
3. `Текущая неделя` — exact range and readiness/coverage must render;
4. `Выбрать другой период` → `Выбрать даты` — separate start and end calendars must render and an arbitrary valid range must produce a report.

No publication action is part of acceptance.
