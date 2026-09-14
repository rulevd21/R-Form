# R/Form FREE Training v0.1 — sandbox acceptance runbook

## Boundary

Target only the Apps Script project configured with a spreadsheet whose title starts with `RFORM_MASTER_DATA_SANDBOX_`.

Do not change:

- production `RFORM_MASTER_DATA_v1`;
- production Training Mobile v2.1 writer;
- GitHub `main`.

## Source branch

`feature/training-free-session-v0.1`

Base:

`release/training-exercise-changes-v0.1-rc1`

## Files to add to the sandbox Apps Script project

- `TrainingFreeSchemaMigration.gs`
- `TrainingFreeSessionService.gs`
- `TrainingFreeSetService.gs`
- `TrainingFreeRegression.gs`

## File to replace in the sandbox Apps Script project

- `TodayService.gs`

Do not replace `TrainingAdapterLegacyV21.gs` or `TrainingExerciseService.gs`.

## Gate FREE-02A — preflight

1. Confirm `getMasterSpreadsheet_()` resolves a title beginning with `RFORM_MASTER_DATA_SANDBOX_`.
2. Confirm existing `runTrainingExerciseRegression()` returns `PASS` before FREE migration.
3. Record current headers of `TRAINING_SESSIONS` and `TRAINING_SETS`.

Expected legacy positions before and after migration:

- `TRAINING_SESSIONS.Duplicate_Flag = column 19`;
- `TRAINING_SETS.Record_Key = column 24`;
- `TRAINING_SETS.Duplicate_Flag = column 25`.

## Gate FREE-02B — migration

Run:

`migrateTrainingFreeSchema()`

Expected:

- status `APPLIED`;
- new session headers appended, not inserted;
- new set headers appended, not inserted;
- six `TRAINING_FREE_*` event types present in `DICTIONARIES.INBOX_EVENT_TYPE`;
- `INBOX_LOG.Event_Type` validation refreshed;
- no existing fact or plan row changed.

Run `migrateTrainingFreeSchema()` a second time.

Expected:

- no duplicate headers;
- no duplicate dictionary values;
- no legacy column movement.

## Gate FREE-02C — regression

Run:

`runTrainingFreeFoundationRegression()`

Required result:

`status = PASS`

Also run:

`inspectTrainingFreeFoundationState()`

Verify:

- all four session headers have non-zero columns;
- all five set headers have non-zero columns;
- all six audit event types are present;
- legacy column positions remain 19 / 24 / 25;
- `productionWriterChanged = false`.

## Gate FREE-02D — Today compatibility

Reload the sandbox R/Form Mobile Today view for a date with an existing A/B/C planned session.

Expected:

- existing planned training card remains unchanged;
- legacy Training Mobile v2.1 launch remains available under the same rules as before;
- no FREE session is required to render the planned state.

## Stop condition

Do not start FREE UI implementation if any FREE foundation check fails or if legacy Training Exercise regression changes from PASS.

When all FREE-02 gates pass, proceed to FREE-03: active-session UI + sandbox E2E writer acceptance.
