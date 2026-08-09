# R/Form Mobile — Apps Script sandbox

Status: Phase 1 / read-only shell.

This source package is intentionally unable to write to `RFORM_MASTER_DATA_v1`.

## Script Properties required for sandbox runtime

Set these in the sandbox Apps Script project only:

- `MASTER_SPREADSHEET_ID` — ID of the sandbox copy, never the production spreadsheet during Phase 1.
- `APP_VERSION` — recommended `0.1.0-sandbox`.
- `DATA_SCHEMA_VERSION` — recommended `RFORM_MASTER_DATA_v1`.
- `APP_TIMEZONE` — `Europe/Moscow` for compatibility with the current data store.
- `TRAINING_LEGACY_URL` — current production Training Mobile v2.1 URL. This is used only as a launch link; the new shell does not proxy or replace its writer.

Do not commit property values, Google identifiers, deployment IDs, or user data to GitHub.

## Files

- `Code.gs` — HTML web-app entry point and bootstrap.
- `Config.gs` — server-side config and schema helpers.
- `TodayService.gs` — read-only state projection from existing sheets.
- `TrainingAdapterLegacyV21.gs` — read-only launch compatibility adapter.
- `Index.html` — mobile-first read-only shell.
- `appsscript.json` — V8 manifest.

## Phase 1 allowed behavior

- read the current day state;
- show current plan/fact nutrition values when present;
- show training state;
- launch the existing Training Mobile v2.1 by link when configured.

## Phase 1 forbidden behavior

- no `appendRow`, `setValue`, `setValues`, `clear`, `delete`, or sheet-structure changes;
- no DAY_START / MEAL / MEASUREMENT / DAY_CLOSE writes;
- no change to Training Mobile v2.1 deployment or writer contract;
- no production spreadsheet ID in sandbox configuration.

## Deployment gate

Runtime testing starts only after a separate sandbox Apps Script project is created and these source files are loaded into it. Production deployment is not part of Phase 1.
