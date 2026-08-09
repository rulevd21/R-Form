# R/Form Mobile — Apps Script sandbox

Status: Phase 3A / Nutrition MEAL source package ready; runtime load pending.

The production `RFORM_MASTER_DATA_v1` and the production Training Mobile v2.1 writer are outside the Phase 3 write scope.

## Current sandbox bootstrap

Keep the already verified Phase 1 + Phase 2 files in the existing Apps Script test project. To load Phase 3A manually, add/update only:

1. `dist/Phase3.gs` → create an Apps Script script file named `Phase3` and paste this content.
2. `Index.html` → replace the existing HTML file with the current version.

Do not replace `Code.gs` or `Phase2.gs`. Do not change Script Properties. No new deployment is required for `/dev`: the test deployment runs the latest saved project source.

The modular `.gs` files remain canonical development source. Files under `dist/` exist only to minimize manual transfer while no Apps Script connector is available.

## Script Properties

Keep the existing sandbox properties:

- `MASTER_SPREADSHEET_ID` — sandbox copy only;
- `APP_VERSION` — may remain the existing value; Phase 3A exposes `0.3.0-sandbox` from code;
- `DATA_SCHEMA_VERSION` — `RFORM_MASTER_DATA_v1`;
- `APP_TIMEZONE` — `Europe/Moscow`;
- `TRAINING_LEGACY_URL` — keep the existing value.

Never commit property values, Google identifiers, deployment IDs or personal user data to the public repository.

## Canonical development files

- `Code.gs` — HTML entry point/bootstrap from Phase 1;
- `Config.gs` — server config and schema helpers;
- `TodayService.gs` — current-state projection;
- `TrainingAdapterLegacyV21.gs` — read/launch compatibility adapter;
- `DayStartService.gs` — Phase 2 DAY_START writer;
- `MealService.gs` — Phase 3A component-level MEAL writer;
- `Index.html` — mobile client;
- `appsscript.json` — V8 manifest;
- `dist/Code.gs` — bundled Phase 1 server source;
- `dist/Phase2.gs` — additive Phase 2 deployment source;
- `dist/Phase3.gs` — additive Phase 3A deployment source.

## Phase 3A allowed behavior

All previously verified DAY_START behavior remains available. In addition, when a current day is OPEN and `FOOD_CATALOG` contains active user-verified products, the sandbox may:

- submit one `MEAL` event with one or more catalog components;
- generate one Meal_ID shared by all components;
- write one `NUTRITION_RAW` row per component;
- calculate exact point K/P/F/C values server-side from catalog Basis/Basis_Amount;
- create the current `NUTRITION_DAILY` formula row if it does not exist;
- append one `INBOX_LOG` MEAL audit event;
- retry the same event UUID without creating duplicates.

The current Phase 3A UI intentionally disables `Добавить еду` when the verified catalog is empty. This is the expected pre-seed state.

## Still forbidden

- production writes or production promotion;
- changes to Training Mobile v2.1 deployment, URL or writer contract;
- changes to GitHub `main` for sandbox testing;
- client-supplied K/P/F/C or formula fields;
- automatic AI/photo nutrition estimation;
- MEASUREMENT / DAY_CLOSE writes;
- template/recent/favorite/barcode write workflows before their later phases.

## Safety

The existing server guard permits access only when the configured spreadsheet title starts with `RFORM_MASTER_DATA_SANDBOX_`. Phase 3A adds current OPEN-day validation, exact schema validation, ScriptLock, event idempotency, verified-catalog eligibility, explicit calendar-date storage, native format/validation propagation, formula-owned aggregate creation and rollback of partial new writes.

## Phase 3A pre-write regression order

1. Keep existing `Code.gs` and `Phase2.gs` unchanged.
2. Add `Phase3.gs` from `dist/Phase3.gs`.
3. Replace `Index.html` with the current source.
4. Save and open the existing `/dev` URL.
5. Before any catalog seed or MEAL submit, visually verify:
   - badge `SANDBOX · MEAL · 0.3.0-sandbox`;
   - current day remains OPEN with unchanged DAY_START facts;
   - nutrition block displays `Приёмов пищи пока нет` instead of technical `MISSING`;
   - `Добавить еду` is disabled while `FOOD_CATALOG` is empty;
   - no runtime/schema error is shown.
6. After this pre-write check, prepare a small verified sandbox FOOD_CATALOG seed and run a separate MEAL happy-path/idempotency regression.
7. Production promotion remains a separate future gate.
