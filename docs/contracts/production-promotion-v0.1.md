# R/Form Input Automation — Production Promotion contract v0.1

Status: **READINESS / PRODUCTION CHANGES NOT AUTHORIZED**.

## Purpose

Promote the accepted R/Form Mobile sandbox capabilities into the owner's production data path without using production as a test environment and without changing Training Mobile v2.1.

## Non-negotiable boundaries

- `RFORM_MASTER_DATA_v1` remains the production source of truth.
- GitHub `main` is not used as a test branch.
- The sandbox Apps Script project is not converted into production.
- Training Mobile v2.1 deployment, URL, writer contract and data path are not changed by this phase.
- No synthetic DAY_START or MEAL may be inserted into production for acceptance testing.

## Current production schema delta

The production master has the accepted legacy/core sheets but does not yet have:

- `FOOD_CATALOG`;
- `MEAL_TEMPLATES`.

These two additive sheets are required before the accepted Nutrition Fast Path can run against production.

Initial production seed policy:

- seed only verified exact-label foods already supported by production history;
- first candidate seed: `FOOD-000001` (Мягкий творог · Светаево) and `FOOD-000002` (Shock Milk Protein Milkshake банан · Shock Milk);
- create `MEAL_TEMPLATES` empty;
- do not copy sandbox acceptance template `MT-20260810-3C36B8EC` into production.

## P0 — read-only production preflight

The feature branch contains a standalone two-file preflight package:

1. `apps-script/dist/ProductionPreflight.gs`;
2. `apps-script/dist/IndexProductionPreflight.html` (load as Apps Script `Index.html`).

The preflight package:

- opens only a spreadsheet whose exact title is `RFORM_MASTER_DATA_v1`;
- reads required-sheet presence, current day, current nutrition aggregate and current training-session state;
- reports `FOOD_CATALOG` / `MEAL_TEMPLATES` presence;
- exposes `writeCapability=false` and empty `writeScope`;
- contains no write endpoint and no schema-migration endpoint;
- keeps Training launch disabled even if a legacy URL is configured.

Runtime marker: `0.4.0-rc1`.

## Deployment topology

Create a separate standalone Apps Script project for production RC. Recommended name:

`RFORM_INPUT_AUTOMATION_PRODUCTION_RC_v0_1`

Do not reuse:

- the sandbox Apps Script project;
- the Training Mobile Apps Script project/deployment;
- an unverified legacy deployment URL.

For the preflight project configure only:

- `MASTER_SPREADSHEET_ID` = production master ID;
- `APP_TIMEZONE` = `Europe/Moscow`;
- `TRAINING_LEGACY_URL` may be omitted until the current Training Mobile URL is verified.

## Gate sequence

### PROD-RC-GATE-01
Authorizes creating the separate production RC Apps Script project and read-only connection to `RFORM_MASTER_DATA_v1` using the standalone preflight package. It authorizes **no Sheet writes**.

Acceptance:

- exact datastore title accepted;
- required legacy sheets present;
- current production Today/Nutrition values match independent reads;
- `FOOD_CATALOG` and `MEAL_TEMPLATES` are reported missing before migration;
- Training launch remains disabled;
- independent datastore re-read confirms zero writes.

### PROD-SCHEMA-GATE-01
Authorizes additive creation of `FOOD_CATALOG` and `MEAL_TEMPLATES` plus the minimal verified catalog seed. This is a separate production write gate.

### PROD-WRITER-GATE-01
Authorizes the first real R/Form Mobile production write after production-safe environment/write-scope enforcement is implemented and a post-schema read-only regression passes.

The first write must be a real user event, not synthetic test data.

## Rollback

1. Kill switch: production writer candidate must support an empty server-side write allow-list.
2. Deployment rollback: stop using the new R/Form Mobile deployment; Training Mobile remains independent.
3. First-event rollback: remove only rows attributable to the exact new `APP-*` event, preserving formulas, validation and formatting; verify formula-owned aggregate recalculation.
4. Catalog/template metadata can remain inert while writers are disabled; any later deactivation/removal is a separate controlled operation.

## Current authorization

Only P0 source/readiness preparation is authorized. Production schema migration, production writer connection and changes to Training Mobile are not authorized by this contract until their named gates are explicitly approved.
