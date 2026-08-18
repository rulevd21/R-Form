# Sandbox deploy — Training exercise changes v0.1

Purpose: deploy PR #2 to the existing R/Form Mobile **sandbox Apps Script project only**. Do not touch the production Training Mobile 2.1.8 deployment.

## Source branch

`feature/training-exercise-overrides-v0.1`

## Files to transfer

Add to the sandbox Apps Script project:

1. `apps-script/TrainingExerciseService.gs`
2. `apps-script/TrainingExerciseRegression.gs`
3. `apps-script/TrainingExerciseControls.html`

Replace with the branch versions:

4. `apps-script/Code.gs`
5. `apps-script/TrainingAdapterLegacyV21.gs`

Do not modify Script Properties. The sandbox datastore guard in `Config.gs` remains mandatory.

## Regression before web-app test

Run in Apps Script editor:

`runTrainingExerciseRegression()`

Required result:

- `status = PASS`
- `failed = 0`

Then, for a session that exists in the sandbox plan, run:

`inspectTrainingExerciseRegressionState('S-YYYYMMDD-X')`

Confirm:

- `plannedSets > 0`
- `categories` is populated
- `canEdit = true` for an open/not-created session

## UI smoke test

Open the sandbox R/Form Mobile web app on a planned training day.

Training card must contain **Изменить упражнения** below the legacy Training Mobile launch.

### Replacement case

1. Open **Изменить упражнения**.
2. Keep mode **Заменить плановое**.
3. Choose one planned exercise.
4. Choose one or more not-yet-recorded sets.
5. Choose/enter the actual exercise and category.
6. Enter weight, reps, RIR patterns.
7. Save.

Verify in sandbox `TRAINING_SETS`:

- one fact row per selected `Plan_Set_ID`;
- `Set_ID` is mapped `TPS-* → SET-*`;
- actual exercise is stored in `Exercise_Name_Original` / `Exercise_Name_Normalized`;
- original `Plan_Weight`, `Plan_Reps`, `Plan_RIR` are retained;
- `Record_Key` exists;
- `Duplicate_Flag` is blank;
- `TRAINING_PLAN` rows did not change.

Verify in `INBOX_LOG`:

- event type `TRAINING_EXERCISE_REPLACEMENT`;
- status `APPLIED`;
- target record IDs match the created sets.

### Add case

1. Switch to **Добавить новое**.
2. Enter exercise/category/set count/load/reps/RIR.
3. Save.

Verify in sandbox `TRAINING_SETS`:

- new exercise has the next `Exercise_Order`;
- `Plan_Weight`, `Plan_Reps`, `Plan_RIR` are blank;
- `Deviation = Добавлено сверх плана.`;
- one `TRAINING_EXERCISE_ADD` audit event exists.

## Negative cases

- replay same `eventId` → `ALREADY_APPLIED`, no duplicate sets;
- replace a plan set already recorded → conflict, no new row;
- submit after `Session_Status = CLOSED` → rejected;
- pattern count mismatch → rejected.

## Promotion rule

Passing sandbox tests is not permission to modify production. Production Training Mobile 2.1.8 has an unverified source/deployment path and remains unchanged until a separate production regression/promotion gate is approved.
