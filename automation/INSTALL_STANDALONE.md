# R/Form Telegram Autopost — standalone installation

## Important
Do NOT modify the Apps Script project currently used by the R/Form training web app.
Create a separate standalone Apps Script project named `RFORM_TELEGRAM_AUTOPUBLISH`.

## Source code
Copy the full contents of `automation/telegram_autopost.gs` into the standalone project.

## Script Properties
Add:
- `RFORM_TG_BOT_TOKEN` = token from @BotFather
- `RFORM_TG_CHAT_ID` = `@r_form`
- `RFORM_TG_AUTOPUBLISH_ENABLED` = `NO`

## Phase 1 — preflight only
Run `rformTgPreflight` from the Apps Script editor.
This phase must not create triggers, write to CONTENT_QUEUE, or publish Telegram messages.
If execution completes without an exception, preflight has passed.

## Phase 2 — install
Only after preflight passes, run `rformTgInstall`.
The function creates/replaces only the trigger `rformTgProcessQueue` and leaves autopublishing disabled (`NO`).

## Phase 3 — verify
Run `rformTgVerifyInstallation`.
Do not enable autopublishing until the R/Form control process confirms a successful verification.

## Safety boundary
The standalone project opens `RFORM_MASTER_DATA_v1` by spreadsheet ID. It does not modify the source code, triggers, deployments, manifest, or Script Properties of the training application.
