# R/Form Mobile — Apps Script sandbox

Status: Phase 2 / DAY_START sandbox write.

The production `RFORM_MASTER_DATA_v1` and the production Training Mobile v2.1 writer are outside the Phase 2 write scope.

## Current sandbox bootstrap

The existing Phase 1 test project stays in place. To load Phase 2 manually, keep the proven Phase 1 `Code.gs` and add/update only:

1. `dist/Phase2.gs` → create an Apps Script script file named `Phase2` and paste this content.
2. `Index.html` → replace the existing HTML file with the current version.

No new deployment is required for `/dev`: the test deployment runs the latest saved project source.

The modular `.gs` files remain canonical development source. Files under `dist/` exist only to minimize manual transfer while no Apps Script connector is available.

## Script Properties

Keep the existing sandbox properties:

- `MASTER_SPREADSHEET_ID` — sandbox copy only;
- `APP_VERSION` — may remain `0.1.0-sandbox`; Phase 2 exposes its build as `0.2.0-sandbox` from code;
- `DATA_SCHEMA_VERSION` — `RFORM_MASTER_DATA_v1`;
- `APP_TIMEZONE` — `Europe/Moscow`;
- `TRAINING_LEGACY_URL` — leave blank until the exact current Training Mobile v2.1 production URL is verified.

Never commit property values, Google identifiers, deployment IDs or personal user data to the public repository.

## Canonical development files

- `Code.gs` — HTML entry point/bootstrap from Phase 1;
- `Config.gs` — server config and schema helpers;
- `TodayService.gs` — current-state projection;
- `TrainingAdapterLegacyV21.gs` — read/launch compatibility adapter;
- `DayStartService.gs` — Phase 2 DAY_START writer;
- `Index.html` — mobile client;
- `appsscript.json` — V8 manifest;
- `dist/Code.gs` — bundled Phase 1 server source;
- `dist/Phase2.gs` — additive Phase 2 deployment source.

## Phase 2 allowed behavior

- all Phase 1 read behavior;
- submit one validated `DAY_START` event for the current date;
- optionally update exactly the previous day's `DAILY.Steps`;
- create one current-day `DAILY` OPEN row;
- create one `INBOX_LOG` audit row;
- retry the same client event with the same UUID without creating a duplicate.

## Still forbidden

- MEAL / MEASUREMENT / DAY_CLOSE writes;
- changes to production `RFORM_MASTER_DATA_v1`;
- changes to Training Mobile v2.1 deployment, URL or writer contract;
- changes to GitHub `main` for sandbox testing;
- client-supplied calculated/formula fields.

## Safety

The existing server guard permits access only when the configured spreadsheet title starts with `RFORM_MASTER_DATA_SANDBOX_`. Phase 2 adds exact header validation, ScriptLock, event/date idempotency and rollback of partial new writes.

## Regression order

1. Load `Phase2.gs` + updated `Index.html` into the sandbox Apps Script project.
2. Open the existing `/dev` URL and verify the Phase 2 form renders before submitting anything.
3. Run one happy-path DAY_START in sandbox.
4. Re-read `DAILY` and `INBOX_LOG` and verify formulas/idempotency.
5. Test retry/double-submit behavior.
6. Production promotion remains a separate future gate.
