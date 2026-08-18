# R/Form Training — structured exercise changes v0.1

Status: SANDBOX IMPLEMENTATION

## Problem

Legacy Training Mobile saves planned sets through `TRAINING_SET(sessionId, planSetId, actualKg, actualReps, actualRir, comment)`. If the user replaces a planned exercise or adds an exercise and records the change only in a session comment, the actual sets are missing from `TRAINING_SETS`. This undercounts volume and makes subsequent exercise/RIR analysis incorrect.

## Required UX

During an open training session the user has two explicit actions:

1. **Заменить плановое** — choose one planned exercise and one or more not-yet-recorded planned sets, then specify the actual exercise and actual load/reps/RIR.
2. **Добавить новое** — specify a new/known exercise, category, set count and actual load/reps/RIR.

The original `TRAINING_PLAN` is immutable in both flows.

## Replacement contract

Input:

- `eventId`
- `action = REPLACE`
- `sessionId`
- `planSetIds[]`
- `exerciseName`
- `exerciseCategory`
- `weightPattern`
- `repsPattern`
- `rirPattern`
- optional `comment`
- `source = RFORM_MOBILE`

Rules:

- all selected `Plan_Set_ID` values must belong to one `Exercise_Order` in the same session;
- only plan sets without an existing plan-derived `Set_ID` may be replaced;
- each selected `Plan_Set_ID` maps deterministically from `TPS-*` to `SET-*`;
- actual exercise identity is stored in `Exercise_Name_Original` / `Exercise_Name_Normalized`;
- `Plan_Weight`, `Plan_Reps`, `Plan_RIR` remain the snapshot of the original plan set;
- `Deviation` states that the planned exercise/variation was replaced;
- `Comment` retains the source `Plan_Set_ID`;
- `Record_Key` and `Duplicate_Flag` remain formula-generated server-side fields;
- no row in `TRAINING_PLAN` is edited.

This also supports a partial variation change inside an exercise (for example, only two remaining bench sets performed as board press).

## Add contract

Input:

- `eventId`
- `action = ADD`
- `sessionId`
- `setCount`
- `exerciseName`
- `exerciseCategory`
- `weightPattern`
- `repsPattern`
- `rirPattern`
- optional `comment`
- `source = RFORM_MOBILE`

Rules:

- a new `Exercise_Order` is assigned after the maximum plan/fact order in the session;
- each fact set receives an event-scoped unique `Set_ID`;
- `Plan_Weight`, `Plan_Reps`, `Plan_RIR` are blank;
- `Deviation = Добавлено сверх плана.`;
- no synthetic plan rows are created.

## Patterns

A scalar repeats across all sets: `60` with 3 sets → `60/60/60`.

A slash-separated pattern maps one-to-one: `3/3/2` with 3 sets → RIR `3, 3, 2`.

A non-scalar pattern must have exactly the same number of values as target sets.

## Audit and idempotency

Every change writes one `INBOX_LOG` event with id `APP-TRAINING-CHANGE-<eventId>` and event type:

- `TRAINING_EXERCISE_REPLACEMENT`, or
- `TRAINING_EXERCISE_ADD`.

Replaying the same `eventId` returns `ALREADY_APPLIED` and does not create additional `TRAINING_SETS` rows.

Writes use `LockService`; if fact or audit verification fails, newly-created rows are cleared before returning the error.

## Closed-session policy

Structured exercise changes are accepted only while the training session is not `CLOSED`. Post-close corrections remain an owner/data-quality workflow and are not silently treated as normal in-session entry.

## Acceptance cases

- Planned incline dumbbell press 3 sets → replacement incline barbell medium-grip press 60×8×3 RIR 3/3/3: 3 fact rows, 3 original plan snapshots, zero plan mutations.
- Two remaining competition-bench plan sets → board press 90×4 RIR5 and 90×5 RIR3: two `BOARD_PRESS` fact rows linked to the two original `Plan_Set_ID`s.
- Add hammer curls 16×10×3 RIR 3/3/2: 3 extra fact rows, blank plan snapshot, next `Exercise_Order`.
- Replay same event: zero extra rows.
- Attempt to replace an already recorded plan set: rejected with conflict.
- Attempt after session `CLOSED`: rejected.
- `Duplicate_Flag`: empty after successful writes.

## Promotion gate

This implementation belongs to sandbox only. It must not replace the current production Training Mobile 2.1.8 writer until Apps Script sandbox deployment has run the regression checks and a production regression gate is explicitly approved.
