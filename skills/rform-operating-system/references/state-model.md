# R/Form State Model

The states below are the Operating System compatibility model. They are not permission to add duplicate literal status columns. Map them onto existing canonical fields.

## DAY

Target compatibility view:

`OPEN → READY_TO_CLOSE → CLOSED → REVISED`

Canonical ownership:

- `DAILY.Day_Status`;
- `DAY_CLOSURE.Close_Request`;
- `DAY_CLOSURE.Close_Readiness`;
- `DAY_CLOSURE.Blocking_Issues`;
- `DAY_CLOSURE.Closed_At`;
- `DAY_CLOSURE.Version`;
- source `Updated_At` and QA state.

Interpretation:

- OPEN — day exists and is not validly closed.
- READY_TO_CLOSE — existing closure checks are ready and no blocker remains; this is a derived router state, not necessarily a literal stored value.
- CLOSED — canonical day/nutrition/training requirements pass and closure is recorded.
- REVISED — previously closed data changed under an authorized correction flow and the revised closure/version is verifiable.

Never mark CLOSED merely because a chat response says the day is closed.

## TRAINING

Compatibility view:

`PLANNED → COMPLETED → ANALYZED`

Canonical ownership:

- `TRAINING_PLAN.Plan_Status`;
- `TRAINING_SESSIONS.Session_Status`;
- session result/conclusion/decision;
- `TRAINING_SETS`;
- related `DECISIONS`.

Interpretation:

- PLANNED — a current plan exists and no completed canonical session supersedes it.
- COMPLETED — the factual session/sets are closed but analysis/decision is not yet complete.
- ANALYZED — the factual session is closed and conclusion/decision are persisted.

Existing production values such as `ACTIVE`, `CLOSED`, `ABOVE_PLAN` remain canonical. Do not overwrite them with compatibility labels.

## WEEKLY

Compatibility view:

`DATA_PENDING → DRAFT → REVIEWED → APPROVED → PUBLISHED`

Current implementation is document/package oriented and does not yet have one authoritative weekly-state field in MASTER_DATA. Therefore:

- derive current state from the exact Weekly artifact/version and related content/publication state;
- never invent a persisted weekly state;
- treat lack of a single state owner as a P1 data-contract gap;
- until a dedicated contract is approved, versioned Weekly artifacts and exact publication records are evidence.

## PUBLICATION

Compatibility view:

`IDEA → DRAFT → READY_FOR_APPROVAL → APPROVED → SCHEDULED → PUBLISHED → SUPERSEDED`

Canonical owner: `CONTENT_QUEUE` exact constituent fields, including text/visual/approval/publication/preview-review state.

Rules:

- IDEA may exist as a DATA_EVENTS candidate or calendar commitment before a production queue object exists.
- DRAFT means the exact queue/package is not yet approval-ready.
- READY_FOR_APPROVAL requires current source/text/visual/preview QA as applicable.
- APPROVED requires exact canonical approval; do not infer it from a positive chat message unless writeback succeeded.
- SCHEDULED requires canonical schedule state and current approval/preview contract.
- PUBLISHED requires publication writeback (for Telegram, message/post identifiers when available).
- SUPERSEDED preserves history and removes the object from active recommendation.

Do not collapse exact production statuses into a conceptual label when reporting a real CONTENT_QUEUE object; show exact canonical fields.

## Transition invariant

Every transition must have:

`PRECONDITION → AUTHORIZED ACTION → WRITE → READBACK → POSTCONDITION`

Invalid or ambiguous transitions fail closed and report the blocker.
