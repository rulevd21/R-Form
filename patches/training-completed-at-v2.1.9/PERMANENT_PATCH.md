# Permanent patch: planned training close must persist Completed_At

Target core version: 2.1.9 (bugfix candidate)
Observed production core: 2.1.8
Scope: planned-session writer only
UI change: none required

## Confirmed root cause

Recovered `RFormSessionService.finish(payload)` closes planned sessions by writing
`Session_Status: 'CLOSED'`, but its `values` object does not include
`Completed_At`.

The recovered `normalize_(row)` also does not expose `Completed_At`, so the
post-write readback cannot verify the close timestamp.

The idempotent replay path accepts an existing `FINISH_SESSION` APPLIED event
as success when the session row exists, without checking that the persisted
session has `Completed_At`.

The historical schema contract recovered from the same source generation also
does not permit `Completed_At` in `CREATE_SESSION` or
`UPDATE_DRAFT_SESSION`.

Production has since been migrated to the extended session schema:
`Session_Mode, Started_At, Completed_At, Session_Comment`. Therefore the
current production schema module must be patched in place; do not restore the
older 19-column schema snapshot.

## SessionService patch

Apply these changes to the CURRENT production `RFormSessionService`.

### 1. Read Completed_At

In `normalize_(row)` add:

```js
completedAt: row.Completed_At || '',
```

Do not synthesize a value here.

### 2. Fail closed on an inconsistent idempotent replay

Replace the current replay block:

```js
if (applied) {
  var replayed = getById(applied.targetRecordId);
  if (!replayed) throw new Error('Журнал содержит APPLIED, но сессия не найдена.');
  return { sessionId: replayed.sessionId, idempotentReplay: true };
}
```

with:

```js
if (applied) {
  var replayed = getById(applied.targetRecordId);
  if (!replayed) {
    throw new Error('Журнал содержит APPLIED, но сессия не найдена.');
  }
  if (replayed.sessionStatus !== 'CLOSED' || !replayed.completedAt) {
    throw new Error(
      'Журнал содержит APPLIED, но TRAINING_SESSIONS не подтверждает ' +
      'CLOSED + Completed_At. Требуется reconciliation.'
    );
  }
  return {
    sessionId: replayed.sessionId,
    idempotentReplay: true
  };
}
```

This prevents a retry from reporting success for a partially persisted close.

### 3. Persist the close timestamp with the close state

Immediately before building the session `values` object:

```js
var completedAt = new Date();
```

Then add to the same write payload:

```js
Session_Status: 'CLOSED',
Completed_At: completedAt
```

The status and timestamp must be persisted by the same repository write.

Do not populate `Started_At` here. Planned-session start time has a separate
contract and must not be inferred from duration or first set.

### 4. Verify the persisted invariant before writing TRAINING_CLOSE audit

After the existing readback:

```js
var saved = normalize_(RFormSheetRepository.readRow(
  RFormConfig.SHEETS.TRAINING_SESSIONS,
  targetRow
));
```

the validation must include:

```js
if (saved.sessionId !== first.sessionId ||
    saved.duplicateFlag === 'DUPLICATE' ||
    saved.sessionStatus !== 'CLOSED' ||
    !saved.completedAt) {
  throw new Error(
    'Не удалось подтвердить закрытие сессии: требуется CLOSED + Completed_At.'
  );
}
```

Only after this verification may `safeWriteApplied({ operation: 'FINISH_SESSION', ... })`
create the APPLIED `TRAINING_CLOSE` audit event.

## Schema contract patch

Apply this to the CURRENT production `RFormSchemaService` without changing or
removing the extended/free-mode headers and operations already deployed.

For `TRAINING_SESSIONS`:

- the header contract must include `Completed_At` in its existing physical
  position;
- `Completed_At` must be non-formula;
- add `Completed_At` to the writable whitelist for `CREATE_SESSION`;
- add `Completed_At` to the writable whitelist for `UPDATE_DRAFT_SESSION`.

Minimum semantic delta:

```diff
 CREATE_SESSION: [
   ...
-  'Session_Status'
+  'Session_Status',
+  'Completed_At'
 ]

 UPDATE_DRAFT_SESSION: [
   ...
-  'Session_Status'
+  'Session_Status',
+  'Completed_At'
 ]
```

Do not replace the current schema module with the recovered legacy snapshot:
that snapshot predates the production extension
`Session_Mode / Started_At / Completed_At / Session_Comment`.

## Acceptance

A planned training close passes only when all are true:

1. `TRAINING_SESSIONS.Session_Status = CLOSED`;
2. `TRAINING_SESSIONS.Completed_At` is nonblank;
3. exactly one APPLIED `TRAINING_CLOSE` exists for the request;
4. a retry returns `idempotentReplay=true` and does not create a second close;
5. a retry refuses to report success if the audit says APPLIED but
   `Completed_At` is blank;
6. `TRAINING_PLAN` is unchanged;
7. `TRAINING_SETS` is unchanged by close timestamp handling;
8. `DAILY.Day_Status` is unchanged;
9. nutrition data is unchanged;
10. WARNING close (intentional missing/replaced sets) still writes
    `Completed_At` when the close is APPLIED.

## Deployment gate

Do not merge/deploy this permanent patch until the CURRENT Apps Script project
serving Training Mobile has been opened and its current
`SessionService.gs` / `SchemaService.gs` compared against this patch.

Reason: production currently writes successfully against the 23-column
post-migration schema, while the recovered historical SchemaService snapshot
contains only 19 session headers. That proves the deployed schema code has
already diverged and must be preserved.
