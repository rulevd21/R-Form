# R/Form Mobile — Apps Script sandbox

Status: Phase 1 / read-only shell.

This source package is intentionally unable to write to `RFORM_MASTER_DATA_v1`.

## Fast manual bootstrap

To minimize owner effort, use only two source files for the first sandbox deployment:

1. `dist/Code.gs` — bundled server-side Phase 1 code.
2. `Index.html` — mobile-first client shell.

The modular `.gs` files remain the canonical development source. `dist/Code.gs` is only a bootstrap bundle for manual loading into Apps Script while no Apps Script connector is available.

## Script Properties required for sandbox runtime

Set these in the sandbox Apps Script project only:

- `MASTER_SPREADSHEET_ID` — ID of the sandbox copy, never the production spreadsheet during Phase 1.
- `APP_VERSION` — recommended `0.1.0-sandbox`.
- `DATA_SCHEMA_VERSION` — recommended `RFORM_MASTER_DATA_v1`.
- `APP_TIMEZONE` — `Europe/Moscow` for compatibility with the current data store.
- `TRAINING_LEGACY_URL` — current verified production Training Mobile v2.1 URL. Leave blank until the exact current URL is verified; the shell will remain functional and the Training launch button will stay disabled.

Do not commit property values, Google identifiers, deployment IDs, or user data to GitHub.

## Canonical development files

- `Code.gs` — HTML web-app entry point and bootstrap.
- `Config.gs` — server-side config and schema helpers.
- `TodayService.gs` — read-only state projection from existing sheets.
- `TrainingAdapterLegacyV21.gs` — read-only launch compatibility adapter.
- `Index.html` — mobile-first read-only shell.
- `appsscript.json` — V8 manifest.
- `dist/Code.gs` — bundled manual-bootstrap server file.

## Phase 1 allowed behavior

- read the current day state;
- show current plan/fact nutrition values when present;
- show training state;
- launch the existing Training Mobile v2.1 by link only after its current URL is verified and configured.

## Phase 1 forbidden behavior

- no `appendRow`, `setValue`, `setValues`, `clear`, `delete`, or sheet-structure changes;
- no DAY_START / MEAL / MEASUREMENT / DAY_CLOSE writes;
- no change to Training Mobile v2.1 deployment or writer contract;
- no production spreadsheet ID in sandbox configuration.

## Deployment gate

Runtime testing starts only after a separate sandbox Apps Script project is created and the bundled `dist/Code.gs` plus `Index.html` are loaded into it. Production deployment is not part of Phase 1.
