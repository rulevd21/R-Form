# Production Promotion — Training exercise changes v0.1 RC1

Status: READY FOR MANUAL APPS SCRIPT DEPLOYMENT
Date: 2026-08-18

## Scope

Promote the tested **replace planned exercise / add extra exercise** workflow to a new production R/Form Mobile web-app deployment that works alongside legacy Training Mobile 2.1.8.

Legacy Training Mobile 2.1.8 remains the writer for ordinary planned set entry. RC1 adds structured fact-only handling for exercise replacements and extra exercises. The legacy deployment URL and source are not modified.

## Completed gates

- Sandbox partial replacement: PASSED.
- Sandbox full exercise replacement: PASSED.
- Sandbox extra exercise: PASSED.
- Audit events: PASSED.
- Duplicate flags: zero.
- Plan immutability: PASSED.
- Runtime rollback after audit schema failure: PASSED.
- Closed-session backend guard: present.
- Idempotent replay guard: present.
- Already-recorded plan-set conflict guard: present.
- Production `INBOX_EVENT_TYPE` schema migrated to include `TRAINING_EXERCISE_REPLACEMENT` and `TRAINING_EXERCISE_ADD` and validation extended to `DICTIONARIES!AB2:AB12`.

## Production architecture

Do not replace or edit the legacy Training Mobile 2.1.8 Apps Script project.

Create a **new Apps Script project**:

`RFORM_MOBILE_PROD_RC1`

The production shell reads `RFORM_MASTER_DATA_v1`, launches legacy Training Mobile for normal set entry, and exposes **Изменить упражнения** for the structured change workflow.

Rollback is therefore URL-level: stop using the RC1 web-app URL and continue using the existing production tools. No legacy deployment rollback is required.

## Files to add

From branch:

`release/training-exercise-changes-v0.1-rc1`

Add these files to the new Apps Script project:

1. `apps-script/Index.html` → HTML file `Index`
2. `apps-script/TrainingExerciseControls.html` → HTML file `TrainingExerciseControls`
3. `apps-script/TrainingExerciseService.gs` → script file `TrainingExerciseService`
4. `apps-script/TrainingExerciseRegression.gs` → script file `TrainingExerciseRegression`
5. `apps-script/dist/Code.production.gs` → script file `Code`

Do not add the sandbox `apps-script/dist/Code.gs` to the production project.

`TrainingExerciseSchemaMigration.gs` is not required in the production project because the production schema migration was already applied directly to `RFORM_MASTER_DATA_v1` before deployment.

## Required Script Properties

Set exactly:

- `MASTER_SPREADSHEET_ID` = production `RFORM_MASTER_DATA_v1` spreadsheet ID
- `APP_VERSION` = `0.1.0-rc1`
- `DATA_SCHEMA_VERSION` = `RFORM_MASTER_DATA_v1`
- `TRAINING_LEGACY_URL` = current Training Mobile 2.1.8 production URL
- `APP_TIMEZONE` = `Europe/Moscow`
- `APP_ENVIRONMENT` = `PRODUCTION`
- `PRODUCTION_WRITE_ACK` = `RFORM_TRAINING_CHANGES_V0_1`

RC1 fails closed if `APP_ENVIRONMENT` or `PRODUCTION_WRITE_ACK` is missing/wrong, or if the spreadsheet title is not exactly `RFORM_MASTER_DATA_v1`.

## Pre-deploy inspection

Before creating the web-app deployment:

1. Run `getAppBootstrap()` in the Apps Script editor.
2. Required:
   - `environment = PRODUCTION`
   - `appVersion = 0.1.0-rc1`
   - no safety-guard error.
3. Run `getTodayState()`.
4. Confirm it reads the production current day and does not create any rows.
5. Do not run `submitTrainingExerciseChange()` manually against a real session during preflight.

## Web-app deployment

Create a new deployment:

- Type: Web app
- Description: `R/Form Mobile Training Changes v0.1 RC1`
- Execute as: owner
- Access: same user/access policy used for the current private R/Form tooling

Record the new URL before testing.

## Production smoke test — read-only

Open RC1 URL.

Required:

- header/environment identifies production RC1;
- current production day is visible;
- Training card resolves the real planned/current session;
- legacy Training Mobile button opens the unchanged 2.1.8 URL;
- **Изменить упражнения** appears when a planned/current training session exists;
- no row is created merely by opening the form.

## First live-write policy

The first production write should be performed only during a real training session and only if an actual replacement or extra exercise occurs. Do not manufacture a fake production training deviation for testing.

After the first real production change, verify immediately:

### TRAINING_SETS

- correct `Session_ID`;
- correct actual exercise identity;
- correct load/reps/RIR;
- replacement retains original plan snapshot;
- extra exercise has blank plan snapshot;
- `Record_Key` populated;
- `Duplicate_Flag` blank.

### INBOX_LOG

- event type is `TRAINING_EXERCISE_REPLACEMENT` or `TRAINING_EXERCISE_ADD`;
- `Validation_Status = VALID`;
- `Processing_Status = APPLIED`;
- target record IDs match the new fact rows;
- duplicate flag blank.

### TRAINING_PLAN

No row changes.

## Promotion decision

RC1 may become the normal R/Form Mobile entry point after one successful real production write and post-write data verification.

Legacy Training Mobile 2.1.8 remains available as a fallback until the broader unified-training migration is separately approved.

## Rollback

If RC1 produces an unexpected error before any write: stop using the RC1 URL. No data rollback required.

If a write fails: the service should clear rows created by the failed transaction. Verify `TRAINING_SETS` and `INBOX_LOG` before further use.

If a successful write is semantically wrong: do not edit `TRAINING_PLAN`; correct the fact/audit record through the owner data-quality workflow and suspend RC1 until the defect is resolved.
