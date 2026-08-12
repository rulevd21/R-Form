# R/Form Input Automation — Production MEAL writer contract v0.1

Status: **SOURCE READY / PROD-WRITER-GATE-01 APPROVED / FIRST REAL WRITE NOT YET EXECUTED**.

Runtime candidate: `0.4.1-rc1`.

## Scope

This contract authorizes only the first production writer path for `MEAL` in the separate R/Form Input Automation Production RC Apps Script project.

The first production write must be a real owner nutrition event on the current `OPEN` day. Synthetic DAY_START/MEAL fixtures are prohibited.

## Production environment guard

Required Script Properties:

- `MASTER_SPREADSHEET_ID` = the production `RFORM_MASTER_DATA_v1` spreadsheet ID;
- `APP_TIMEZONE` = `Europe/Moscow`;
- `RFORM_ENVIRONMENT` = `PRODUCTION`;
- `RFORM_WRITE_SCOPE` = `MEAL` for the authorized writer state.

The server accepts only the exact spreadsheet title `RFORM_MASTER_DATA_v1`.

Unknown or missing `RFORM_ENVIRONMENT` fails closed. `RFORM_WRITE_SCOPE` accepts only `MEAL`; any other value fails configuration validation.

## Kill switch

Set `RFORM_WRITE_SCOPE` to an empty value.

Expected result:

- bootstrap continues in read mode;
- UI reports `READ_ONLY_KILL_SWITCH`;
- Save is disabled;
- a direct call to `submitProductionMeal()` fails server-side with `WRITE_SCOPE_DENIED:MEAL` before any Sheet write.

## Only authorized write endpoint

`submitProductionMeal(payload)`

No production endpoint is included for:

- DAY_START;
- FOOD_FAVORITE;
- MEAL_TEMPLATE_SAVE;
- DAY_CLOSE;
- TRAINING_PRE / TRAINING_SET / TRAINING_CLOSE;
- schema migration.

Training Mobile remains an independent production writer and is not changed by this RC.

## MEAL transaction

Input contract:

- event id: UUID-like 32–36 hex/hyphen string;
- event type: `MEAL`;
- event date: server-current date only in `Europe/Moscow`;
- Meal_Time: `HH:mm`;
- Meal_Type: one accepted nutrition meal type;
- one to twenty components;
- each component references an ACTIVE, user-verified, non-duplicate `FOOD_CATALOG` item;
- Amount must be finite, `>0` and `<=10000`;
- Unit must exactly match catalog Basis;
- source must be `RFORM_MOBILE`.

Server-owned behavior:

1. acquire `ScriptLock`;
2. check `APP-MEAL-<eventId>` idempotency in `INBOX_LOG`;
3. require current `DAILY` row and `Day_Status=OPEN`;
4. resolve and validate catalog components;
5. calculate component KБЖУ server-side from `FOOD_CATALOG`;
6. create component-level `NUTRITION_RAW` rows sharing one new Meal_ID;
7. create a formula-owned `NUTRITION_DAILY` row only if the current Day_ID does not already have one;
8. create exactly one `INBOX_LOG` MEAL audit event;
9. verify calendar-date invariants, Meal_ID and duplicate flags;
10. rollback only rows created by the transaction on any exception.

Idempotency is event-based. Replaying the same `eventId` returns `ALREADY_APPLIED`. Identical food content with a new eventId is a legitimate new MEAL.

## Production data boundaries

The MEAL transaction may write only:

- `NUTRITION_RAW` new component rows;
- `NUTRITION_DAILY` one new formula-owned daily aggregate row when missing;
- `INBOX_LOG` one new audit row.

It must not edit:

- existing `DAILY` facts or current OPEN-day fields;
- `TRAINING_SESSIONS`;
- `TRAINING_SETS`;
- `TRAINING_PLAN`;
- `ACTIVE_PLANS`;
- `FOOD_CATALOG` metadata;
- `MEAL_TEMPLATES`;
- Training Mobile deployment, URL or writer path.

## Client retry

The production RC client stores the unresolved MEAL payload in browser localStorage before calling the server. On an error, the retry action uses the same `eventId`. A new event cannot be started until the pending event is resolved.

Amount input uses `step=any`, `min=0.01`, `max=10000`.

## Read-only fast paths in this RC

Read/prefill is allowed for:

- Repeat Recent Meal;
- Recent Food Prefill;
- Use Template when an ACTIVE production template exists.

These actions only open a prefilled ordinary MEAL form. They do not write until explicit Save.

Favorite write and Template save remain disabled.

## Acceptance sequence

1. Load `ProductionMealRC.gs` as the production RC `Code.gs` and `IndexProductionMealRC.html` as `Index.html`.
2. Configure `RFORM_ENVIRONMENT=PRODUCTION`, `RFORM_WRITE_SCOPE=MEAL`, keep the existing production master/timezone properties.
3. Reload the existing test `/dev` deployment.
4. Before Save, verify visually: exact production datastore, `MEAL_WRITE_READY`, `writeScope=MEAL`, current day `OPEN`, catalog count and no unexpected writer controls.
5. Independently re-read production datastore to prove no pre-Save write.
6. The first Save must represent a real consumed meal using only currently verified catalog items.
7. Immediately re-read `NUTRITION_RAW`, `NUTRITION_DAILY`, `INBOX_LOG`, current `DAILY` and Training tables.
8. Require correct component rows, one audit event, formula aggregate, blank duplicate flags, preservation of current day/training facts and `Version=0.4.1-rc1`.
9. On any anomaly, empty `RFORM_WRITE_SCOPE` immediately and rollback only the exact new `APP-MEAL-*` event rows.

## Source package

- `apps-script/dist/ProductionMealRC.gs`
- `apps-script/dist/IndexProductionMealRC.html`

GitHub `main` is not part of this acceptance. Merge/release remains a later gate after the personal pilot is stable.
