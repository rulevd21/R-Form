# R/Form FREE training v0.1 — FREE-05 promotion readiness

## Gate purpose

FREE-05 is a release-candidate review only. It does not authorize production writes, production schema migration, deployment replacement, or merge to `main`.

Accepted sandbox state:

- FREE-02 runtime acceptance: PASS;
- FREE-03 writer E2E: PASS;
- FREE-03 manual UI acceptance: PASS;
- FREE-03 final acceptance: 16/16 PASS;
- FREE-04 repository reconciliation: PASS;
- current R/Form Training Log UI v2.2 visual layer is frozen for this RC.

## RC source review

The feature branch is based on `release/training-exercise-changes-v0.1-rc1` and remains sandbox-only.

Required RC properties:

- `Code.gs` owns only shell/bootstrap/injection responsibilities;
- configuration and datastore guard remain in `Config.gs`;
- Today/read-model logic remains in `TodayService.gs`;
- `TrainingAdapterLegacyV21.gs` is unchanged;
- FREE writers do not mutate `TRAINING_PLAN`;
- visual theme is isolated in `RFormTrainingThemeV22.html`;
- sandbox datastore title guard remains active;
- static CI rejects accidental re-introduction of duplicated global functions into `Code.gs`.

## Promotion blocker

The sandbox RC must **not** be copied to production as a complete project.

Reasons:

1. `Config.gs` intentionally accepts only datastores whose title starts with `RFORM_MASTER_DATA_SANDBOX_`.
2. The shell identifies itself as `SANDBOX` and uses sandbox-specific configuration/version defaults.
3. The canonical current production Training Mobile source is not versioned on a production branch in this repository.
4. The production UI and writer must be patched from their current live source, not replaced by the sandbox shell.

Therefore production promotion is blocked until a source snapshot of the live production Apps Script project is captured and reviewed.

## Production source capture — mandatory before implementation

Capture the current live production Apps Script project without editing it.

The snapshot must include at minimum:

- `Config.gs`;
- `Code.gs`;
- `Index.html` and any theme/UI fragments used by the live Training app;
- `TodayService.gs` or equivalent current read-model file;
- `TrainingAdapterLegacyV21.gs`;
- `TrainingExerciseService.gs` and its browser-facing controls/gateway;
- `appsscript.json`;
- any helper file that defines functions referenced by the files above.

Record the live deployment version / deployment id separately so rollback can target the exact previous version.

Do not edit production during source capture.

## Production patch strategy

After the live source snapshot is captured, create a separate production RC branch from that snapshot. Do not turn the sandbox feature branch itself into production code.

Port only the accepted FREE delta:

- appended FREE schema contract;
- FREE session lifecycle;
- FREE set create/update/delete;
- atomic exercise reorder;
- browser client gateway;
- Today isolation that explicitly skips `Session_Mode=FREE` for legacy/planned selection;
- FREE UI entry and active-session screen;
- accepted visual integration, adapted to the live production shell rather than replacing it.

The existing production writer remains untouched.

## Production safety guard

The production RC must have its own explicit guard. It must not reuse the sandbox title-prefix guard.

Before any production mutation, verify at least:

- configured spreadsheet id is the live configured production datastore;
- spreadsheet title is exactly `RFORM_MASTER_DATA_v1`;
- required sheets are present;
- legacy column positions match the accepted contract;
- no migration is executed if any preflight check fails.

The existing `ProductionPreflight.gs` is read-only and already uses an exact production-title check. It may be used as a reference/preflight component after the live source snapshot is confirmed.

## Production preflight — read only

Before schema migration, record:

- `TRAINING_SESSIONS` header order and `Duplicate_Flag` position;
- `TRAINING_SETS` header order, `Record_Key` and `Duplicate_Flag` positions;
- current formulas in the last valid set template row;
- current `SET_TYPE`, `SESSION_STATUS`, and `INBOX_EVENT_TYPE` dictionary values;
- current data-validation rule for `INBOX_LOG.Event_Type`;
- current production regression result;
- current deployment version.

No write is authorized by preflight.

## Backup

Before the first production schema write:

1. create a timestamped backup/copy of the production datastore;
2. record the previous Apps Script deployment version;
3. record current row counts for `TRAINING_SESSIONS`, `TRAINING_SETS`, `TRAINING_PLAN`, and `INBOX_LOG`;
4. keep the current production deployment active while migration is validated.

## Production migration

Migration remains append-only:

`TRAINING_SESSIONS` append:

- `Session_Mode`
- `Started_At`
- `Completed_At`
- `Session_Comment`

`TRAINING_SETS` append:

- `Exercise_Instance_ID`
- `Exercise_Catalog_ID`
- `Load_Value`
- `Load_Unit`
- `Exercise_Comment`

Register the six `TRAINING_FREE_*` audit event types and refresh only the relevant `INBOX_LOG.Event_Type` validation.

Run migration twice and require the second run to add nothing.

Immediately re-check legacy column positions and formulas.

## Canary deployment

Do not replace the active production deployment immediately after migration.

Preferred sequence:

1. create a separate canary/test deployment from the production RC source;
2. verify existing planned A/B/C flow on the production datastore without writing a FREE session;
3. verify FREE launcher/read state;
4. create one controlled FREE session only after explicit approval;
5. verify audit, facts, Today isolation and post-close rejection;
6. only then update the normal production deployment to the accepted version.

## Rollback

Application rollback:

- point the active deployment back to the recorded previous production version;
- disable/remove the FREE launcher in the active deployment.

Datastore rollback policy:

- do **not** delete appended columns during emergency rollback;
- do **not** rewrite legacy rows;
- additive FREE columns may remain inert;
- preserve any already-created FREE facts and audit rows for traceability;
- if migration itself fails before FREE writes begin, restore from the timestamped backup only after comparing the failure state.

## Promotion acceptance

Production promotion is ready only when all of the following are true:

- live production source snapshot is captured and reviewed;
- production-specific patch is based on that source;
- exact production datastore guard is present;
- production preflight is green;
- backup and previous deployment version are recorded;
- schema migration is idempotent;
- legacy regression remains green;
- canary smoke test passes;
- rollback procedure has a verified target version;
- explicit approval to promote is given.

Until then:

- PR #10 stays Draft;
- no merge to `main`;
- no production datastore change;
- no production deployment update.
