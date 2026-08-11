# R/Form Mobile — Apps Script development track

Current status: **Phase 3C Fast Path sandbox acceptance complete; Production Promotion P0 readiness in progress**.

The production `RFORM_MASTER_DATA_v1`, GitHub `main` and production Training Mobile v2.1 writer remain outside automatic sandbox changes.

## Accepted sandbox capabilities

- Phase 1: read-only Today / Training compatibility shell.
- Phase 2: `DAY_START` writer, including date verifier hotfix `0.2.2-sandbox`.
- Phase 3A: component-level `MEAL` writer with catalog-derived K/P/F/C, idempotency, rollback, native validation/format propagation and formula-owned `NUTRITION_DAILY` aggregation.
- Phase 3C: recent MEAL repeat, Favorite metadata, explicit meal templates and recent-food prefill.
- Final sandbox fast-path runtime marker: `0.3.7-sandbox`.

## Canonical development source

- `Code.gs` — HTML entry point / base bootstrap.
- `Config.gs` — sandbox configuration and datastore guard.
- `TodayService.gs` — Today state projection.
- `TrainingAdapterLegacyV21.gs` — read/launch compatibility adapter.
- `DayStartService.gs` — accepted DAY_START writer.
- `MealService.gs` — accepted component-level MEAL writer.
- `FastPathService.gs` — recent meal / recent food / favorites / templates read model.
- `FavoriteService.gs` — audited Favorite metadata writer.
- `TemplateService.gs` — audited explicit template writer.

`dist/` contains manual-transfer bundles used because no direct Apps Script source connector is available in this workflow.

## Production Promotion P0

Production must **not** be enabled by replacing `MASTER_SPREADSHEET_ID` in the sandbox project. The accepted sandbox source is intentionally fail-closed to spreadsheet titles beginning with `RFORM_MASTER_DATA_SANDBOX_`.

The first production step is a separate read-only RC project. Standalone package:

1. `dist/ProductionPreflight.gs` → create one Apps Script script file (for example `ProductionPreflight`).
2. `dist/IndexProductionPreflight.html` → create Apps Script HTML file `Index` with this content.
3. Script Properties:
   - `MASTER_SPREADSHEET_ID` = production `RFORM_MASTER_DATA_v1` ID;
   - `APP_TIMEZONE` = `Europe/Moscow`;
   - `TRAINING_LEGACY_URL` optional and not launch-authorized in preflight.

Runtime marker: `0.4.0-rc1`.

The P0 package is read-only by construction: it has no write endpoint and no schema-migration endpoint. It only verifies exact production datastore identity, required legacy sheets, current Today/Nutrition state, Training continuity status, and presence/absence of the two feature sheets.

See `docs/contracts/production-promotion-v0.1.md` for the gate sequence.

## Production schema gap

Production currently lacks the sandbox-only feature sheets:

- `FOOD_CATALOG`;
- `MEAL_TEMPLATES`.

Creating them is a separate named production gate. The sandbox acceptance template is test data and must not be copied to production.

## Still forbidden without named production gates

- production Sheet schema changes;
- production DAY_START / MEAL / Favorite / Template writes from the new app;
- repurposing the sandbox Apps Script project as production;
- changes to Training Mobile v2.1 deployment, URL, writer contract or data path;
- changes to GitHub `main` for testing;
- synthetic production acceptance data;
- mandatory AI/Gemini dependency in the critical input path.
