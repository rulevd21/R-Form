# R/Form Input Automation — Phase 0 Sandbox

Status: ACTIVE
Date: 2026-08-09
Architecture: B → D

## Production continuity

R/Form Training Mobile v2.1 remains the active production training tool during development. Phase 0 must not change its production deployment, URL, writer contract, source/data path, or user flow. Any migration of training writes requires a separate regression gate and explicit owner approval.

## Sandbox boundaries

- Production `RFORM_MASTER_DATA_v1` is not a test target.
- A separate Google Sheets sandbox copy is used for all experimental writes.
- Google identifiers and personal data are not committed to this public repository.
- `main` remains production-approved source only.
- `develop` is the integration branch.
- `feature/input-automation-v0.1` is the working feature branch.

## Phase 0 fixtures

Repository fixtures are synthetic/sanitized. They reproduce the structural invariants of one closed recovery day and one closed training day without publishing the owner's real health, nutrition, training, or Google account data.

## Approved gates

1. Apps Script HTML Service + `google.script.run` for the pilot runtime.
2. `FOOD_CATALOG` and `MEAL_TEMPLATES` allowed in sandbox only until a production gate.
3. No mandatory AI/photo nutrition estimation in v0.1.
4. Training integration through `TrainingAdapterLegacyV21`; no rewrite of Training Mobile v2.1 writer logic.
5. Open Food Facts only as optional barcode enrichment with user confirmation and local caching.

## Phase 0 completion criteria

- isolated sandbox data store exists;
- approved sandbox-only nutrition entities exist;
- GitHub integration branches exist;
- sanitized recovery-day and training-day fixtures exist;
- no production writer or deployment has been changed;
- separate Apps Script sandbox project/deployment is created before Phase 1 runtime testing.
