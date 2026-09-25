# R/Form Training Completed_At integrity fix v0.1

## Problem

The legacy planned-training writer closes a session and writes an `APPLIED`
`TRAINING_CLOSE` event, but can leave `TRAINING_SESSIONS.Completed_At`
blank. This was observed with `RFORM_TRAINING_MOBILE 2.1.8`.

The canonical source project of the legacy writer is not currently present in
this repository, so directly changing its production close handler is not safe
until the exact source/deployment is recovered.

## Containment fix

`maintenance/TrainingCompletedAtIntegrity.gs` performs a fail-closed repair.

It writes `Completed_At` only when all conditions are true:

1. `TRAINING_SESSIONS.Session_Status = CLOSED`;
2. `Completed_At` is blank;
3. `INBOX_LOG` contains a matching `TRAINING_CLOSE`;
4. `Processing_Status = APPLIED`;
5. `Validation_Status` is `VALID` or `WARNING`;
6. the close event has a real `Applied_At` timestamp;
7. the audit row is not marked `DUPLICATE`.

No timestamp is inferred from duration, set time, date, or user activity.

## Safety

The script refuses to run against any spreadsheet whose exact title is not
`RFORM_MASTER_DATA_v1`.

Write execution also requires:

`RFORM_COMPLETED_AT_REPAIR_ENABLED=YES`

in Apps Script Script Properties.

Start with:

`inspectTrainingCompletedAtIntegrity()`

Only after reviewing the candidate list should:

`applyTrainingCompletedAtRepair()`

be run.

For a single session:

`repairTrainingCompletedAtForSession('S-YYYYMMDD-X')`

The repair changes only `TRAINING_SESSIONS.Completed_At` and appends a
correction audit row to `INBOX_LOG`.

## Permanent writer fix contract

Once the canonical legacy Training Mobile source is recovered, the planned
session close transaction should use one server timestamp for both the session
and the audit event.

Required invariant:

```text
closeTimestamp = now
Session_Status = CLOSED
Completed_At = closeTimestamp
TRAINING_CLOSE.Processing_Status = APPLIED
TRAINING_CLOSE.Applied_At = closeTimestamp
```

The writer must verify `Session_Status=CLOSED` and nonblank `Completed_At`
before returning success to the client.

A duplicate/retry close request must return the already applied state without
creating a second close event or clearing/changing `Completed_At`.

## Acceptance checks

After the permanent writer patch:

- a normal planned training closes with `Completed_At` populated;
- a `WARNING` close caused by intentionally omitted/replaced sets still has
  `Completed_At`;
- retry returns the existing closed state;
- `Day_Status` is not closed by `TRAINING_CLOSE`;
- nutrition sheets are unchanged;
- no duplicate `TRAINING_CLOSE` row is created;
- `TRAINING_SETS` and `TRAINING_PLAN` are unchanged by timestamp handling.

## Deployment boundary

Do not deploy this branch as a replacement for the current Training Mobile
project. The reconciler is a maintenance containment layer until the exact
legacy source project/deployment is recovered and placed under source control.
