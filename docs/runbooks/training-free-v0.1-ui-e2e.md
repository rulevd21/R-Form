# R/Form FREE Training v0.1 — FREE-03 UI + E2E acceptance

## Boundary

Sandbox only. Target the existing `RFORM_INPUT_AUTOMATION_SANDBOX_v0_1` Apps Script project connected through Script Properties to a datastore whose title begins with `RFORM_MASTER_DATA_SANDBOX_`.

Do not change production `RFORM_MASTER_DATA_v1`, production `R/Form Training Mobile — v2.1`, or GitHub `main`.

## Install delta from accepted FREE-02 sandbox

Add these new files to Apps Script:

- `TrainingFreeClientService.gs`
- `TrainingFreeOrderService.gs`
- `TrainingFreeE2E.gs`
- `TrainingFreeSession.html`

Keep all previously installed FREE-02 files.

Replace sandbox `Code.gs` with the FREE-03 monolithic bundle that:

- preserves `RFORM_SANDBOX_TITLE_PREFIX` guard;
- preserves accepted FREE-aware Today read model;
- injects both `TrainingExerciseControls` and `TrainingFreeSession` into `doGet()`;
- exposes `modules.trainingFree = true`.

No deployment is required for writer E2E. UI acceptance requires updating/creating a sandbox web-app deployment only after writer E2E passes.

## Gate FREE-03A — static

Required GitHub Actions checks:

- Apps Script JavaScript syntax PASS;
- FREE UI browser JavaScript syntax PASS;
- contract invariants PASS;
- `TrainingAdapterLegacyV21.gs` unchanged.

## Gate FREE-03B — writer E2E

Before running, make sure there is no real ACTIVE/DRAFT FREE session in sandbox.

Run exactly:

`runTrainingFreeWriterE2EAcceptance()`

Expected:

- `status = PASS`;
- `gate = FREE-03-WRITER-E2E`;
- session START PASS;
- WARMUP CREATE PASS;
- WORKING CREATE PASS;
- SET UPDATE PASS;
- EXERCISE metadata UPDATE PASS;
- SET DELETE + renumber PASS;
- SESSION COMPLETE PASS;
- final fact preserved PASS.

The runner uses synthetic date `2099-12-31`, closes the session, and retains the closed sandbox rows as E2E evidence.

## Gate FREE-03C — web-app UI

After writer E2E PASS, update the sandbox web-app deployment to the current Apps Script code.

Open the sandbox web app. On the Training card verify a second action appears:

`Свободная тренировка`

Do not use the production Training Mobile v2.1 deployment for this test.

### Manual UI scenario

1. Tap `Свободная тренировка`.
2. Confirm a new FREE session opens and timer starts.
3. Add an existing/recent exercise or create a custom exercise.
4. Save a WARMUP set with no RIR.
5. Save a WORKING set with weight/reps/RIR.
6. Add a second exercise and save a working set.
7. Reorder the two exercises with ↑/↓.
8. Add an exercise-level trainer comment.
9. Tap a saved set and edit load/reps/RIR.
10. Delete one set and confirm remaining set numbers are contiguous.
11. Close/reload the web app and confirm the DRAFT FREE session resumes with all saved facts.
12. Tap `Завершить тренировку`, review summary, add optional session comment, and complete.
13. Reopen the page and confirm the launcher returns to `Свободная тренировка`, not `Продолжить…`.
14. Confirm the planned A/B/C card and legacy Training Mobile v2.1 launch behavior remain unchanged.

## Data acceptance

For the manually created session verify:

- `TRAINING_SESSIONS.Session_Mode = FREE`;
- session transitions `DRAFT -> CLOSED`;
- `TRAINING_PLAN` has no new/changed rows;
- each saved set has `Exercise_Instance_ID`;
- WARMUP and WORKING are represented through existing `Set_Type` values;
- `Plan_Weight`, `Plan_Reps`, `Plan_RIR` are blank for FREE facts;
- FREE audit events exist in `INBOX_LOG`;
- no duplicate flags are raised.

## Stop condition

Do not merge PR #10 and do not touch production if writer E2E or any manual UI acceptance item fails.
