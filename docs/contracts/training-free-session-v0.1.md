# R/Form Training — FREE session v0.1

Status: SANDBOX FOUNDATION

## Scope

FREE is an unplanned, in-gym fact-entry flow. It does not create or mutate `TRAINING_PLAN` and does not change the production Training Mobile v2.1 writer.

The write path is isolated:

`R/Form Mobile sandbox -> TrainingFreeSessionService / TrainingFreeSetService -> TRAINING_SESSIONS + TRAINING_SETS + INBOX_LOG`

Legacy/planned training continues through `TrainingAdapterLegacyV21` and Training Mobile v2.1.

## Live-schema decisions

The sandbox datastore already defines:

- `SESSION_STATUS`: includes `DRAFT`, `CLOSED`, `CORRECTED`;
- `SET_TYPE`: includes `WARMUP`, `TOP_SET`, `WORKING`, `BACKOFF`, `TECHNIQUE`.

Therefore v0.1 does **not** add an `ACTIVE` session status, `FREE` set type, or `Set_Phase` column.

FREE lifecycle:

`no session -> DRAFT -> CLOSED`

FREE set mapping used by the MVP UI:

- warm-up set -> `Set_Type = WARMUP`;
- ordinary working set -> `Set_Type = WORKING`.

The session is identified as FREE by `TRAINING_SESSIONS.Session_Mode = FREE`.

## Schema additions

`TRAINING_SESSIONS` appends:

- `Session_Mode`
- `Started_At`
- `Completed_At`
- `Session_Comment`

`TRAINING_SETS` appends:

- `Exercise_Instance_ID`
- `Exercise_Catalog_ID`
- `Load_Value`
- `Load_Unit`
- `Exercise_Comment`

Existing columns remain in place so positional legacy writers remain compatible.

## Session contract

FREE session id:

`S-YYYYMMDD-FREE-XXXXXXXX`

A newly started FREE session writes:

- `Session_Type = blank`
- `Plan_Status = blank`
- `Session_Status = DRAFT`
- `Session_Mode = FREE`
- `Started_At = server timestamp`
- `Completed_At = blank`

At completion:

- at least one FREE fact set must exist;
- `Session_Status = CLOSED`;
- `Completed_At = server timestamp`;
- `Actual_Duration` is derived from `Started_At` in minutes when possible.

Only one non-closed FREE session may exist at a time. Starting while one exists returns `RESUME_EXISTING`.

## Today compatibility

Legacy/planned projection must ignore rows where `Session_Mode = FREE`.

The Today read model keeps the existing fields (`required`, `sessionId`, `trainingCode`, `planStatus`, `status`, `launchAvailable`) for planned training and adds a nested `training.free` state.

Blank `Session_Mode` remains legacy/planned for backward compatibility.

## Set contract

FREE set id:

`SET-YYYYMMDD-FREE-XXXXXXXXXXXX`

Exercise instance id:

`EXI-YYYYMMDD-XXXXXXXX`

`Exercise_Instance_ID` groups all sets displayed in one exercise card. `Exercise_Order` is ordering metadata, not identity.

Every FREE set has blank `Plan_Weight`, `Plan_Reps`, and `Plan_RIR`, and `Deviation = Свободная тренировка.`

### Load units

Allowed `Load_Unit` values:

- `KG`
- `BW`
- `BW_PLUS_KG`
- `LEVEL`

Mapping:

- `KG`: `Load_Value` required, copied to `Weight_Kg`;
- `BW`: `Load_Value` blank, `Weight_Kg` blank;
- `BW_PLUS_KG`: added external load is stored in both `Load_Value` and `Weight_Kg`;
- `LEVEL`: `Load_Value` required, `Weight_Kg` blank.

For `WORKING`, RIR is required and integer 0–10. For `WARMUP`, RIR may be blank.

## Operations

Write API:

- `startTrainingFreeSession(payload)`
- `createTrainingFreeSet(payload)`
- `updateTrainingFreeSet(payload)`
- `deleteTrainingFreeSet(payload)`
- `updateTrainingFreeExercise(payload)`
- `completeTrainingFreeSession(payload)`

Read API:

- `getTrainingFreeSessionState(sessionId)`

UI is intentionally out of scope for FREE-02.

## Audit / idempotency

Event types:

- `TRAINING_FREE_SESSION_START`
- `TRAINING_FREE_SET_CREATE`
- `TRAINING_FREE_SET_UPDATE`
- `TRAINING_FREE_SET_DELETE`
- `TRAINING_FREE_EXERCISE_UPDATE`
- `TRAINING_FREE_SESSION_COMPLETE`

Audit id:

`APP-TRAINING-FREE-<EVENT_ID_WITHOUT_HYPHENS>`

Mutating calls use `LockService`. Replayed event ids return `ALREADY_APPLIED` when the original mutation was audited.

## Delete policy

FREE delete physically clears the fact row so legacy analytics cannot count a deleted set. Before clearing, the full row snapshot is serialized into the audit event. Remaining sets in that `Exercise_Instance_ID` are renumbered.

Post-close mutation is rejected.

## Promotion boundary

FREE v0.1 remains sandbox-only until:

1. schema migration passes;
2. foundation regression passes;
3. end-to-end sandbox acceptance passes;
4. UI acceptance passes;
5. an explicit production promotion gate is approved.

No test in this branch changes GitHub `main` or the production Training Mobile v2.1 writer.
