# R/Form DAY_START contract v0.1

Status: Phase 2 sandbox only. Production promotion is not authorized.

## Scope

`DAY_START` is the first write event in R/Form Mobile. It may write only to the configured `RFORM_MASTER_DATA_SANDBOX_*` datastore. It must not change the production master or the Training Mobile v2.1 writer.

## Client payload

```json
{
  "eventId": "uuid",
  "eventType": "DAY_START",
  "eventDate": "YYYY-MM-DD",
  "dayType": "REST|RECOVERY|TRAINING_A|TRAINING_B|TRAINING_C",
  "morningWeight": 72.0,
  "sleepHours": 8,
  "sleepQuality": 10,
  "readiness": 10,
  "shoulderPain": 0,
  "elbowPain": 0,
  "otherPain": 0,
  "previousDaySteps": 7500,
  "comment": "optional",
  "source": "RFORM_MOBILE",
  "appVersion": "0.2.1-sandbox"
}
```

The server accepts only the current server date in the configured timezone. `previousDaySteps` and `comment` are optional.

## Date storage invariant

`DAILY.Date` and `INBOX_LOG.Event_Date` are calendar dates, not timestamps. The writer must store them as an integer Google Sheets date serial with no fractional time component. For example, `2026-08-09` is stored as serial `46243`, not `46243.5`.

This invariant is required because nutrition-plan validity and the 7-day weight window compare date cells numerically. A fractional date can incorrectly exclude same-day `Effective_To` rows or shift the 7-day boundary.

Timestamp fields such as `Updated_At`, `Received_At` and `Applied_At` remain true date-time values.

## Server-owned data

The client must not supply:

- `Day_ID`;
- `Weight_7D_Average`;
- nutrition plan or nutrition fact fields;
- `Day_Status`;
- `Duplicate_Flag`;
- timestamps or audit metadata.

The server creates formulas for `Day_ID`, 7-day weight average, nutrition plan/fact projections and duplicate checks. `RECOVERY` maps to `REST` only for nutrition-plan lookup.

## Write targets

### DAILY

A new date creates one `OPEN` row. Source facts are written from the validated event. Formula/calculated fields remain server-owned. `Updated_By = RFORM_MOBILE`.

### Previous-day Steps

When `previousDaySteps` is provided, only the `Steps` cell for exactly `eventDate - 1 day` may change. If the previous date is missing, the event fails before a new current-day row is retained.

### INBOX_LOG

A successful new event creates one audit row:

- `Inbox_Event_ID = APP-DAYSTART-<eventId>`;
- `Event_Type = DAY_START`;
- `Parsed_Entity = DAILY_DAY_START`;
- `Target_Sheet = DAILY`;
- `Validation_Status = VALID`;
- `Processing_Status = APPLIED`;
- `Applied_By = OWNER`;
- `Source_Chat = RFORM_MOBILE`;
- `Version = 0.2.1-sandbox`.

## Idempotency and concurrency

The writer acquires `LockService.getScriptLock()` before checking and writing. Idempotency is enforced twice:

1. event key: `APP-DAYSTART-<eventId>` in `INBOX_LOG`;
2. business key: one `DAILY` row per date.

Repeated submission of the same event returns `ALREADY_APPLIED`. A different event for an already existing date returns `ALREADY_EXISTS`. Neither path creates a duplicate row.

## Failure handling

For a new event, the write path keeps rollback snapshots. If verification fails after a partial write, the newly created `DAILY`/`INBOX_LOG` contents are cleared and the previous-day Steps value is restored.

## Safety guards

- datastore title must start with `RFORM_MASTER_DATA_SANDBOX_`;
- exact headers are validated before writing;
- no production spreadsheet ID is embedded in client code;
- no Training Mobile v2.1 write method is called;
- GitHub `main` is not used for Phase 2 development.

## Client retry

A pending event is stored in browser `localStorage` until server acknowledgement. A retry reuses the same `eventId`.

## Acceptance tests

1. Happy path: one new date → one OPEN DAILY row + one APPLIED INBOX row.
2. Double submit: one DAILY row, one event audit row.
3. Retry with same UUID: `ALREADY_APPLIED`, no duplicate.
4. Existing date with new UUID: `ALREADY_EXISTS`, no duplicate.
5. Previous-day steps: only the previous date Steps changes.
6. Formula integrity: Day_ID, 7-day average, nutrition plan/fact projections and duplicate formulas are present.
7. Date integrity: `DAILY.Date` and `INBOX_LOG.Event_Date` have integer date serials with no time fraction.
8. Duplicate flags remain blank after a valid write.
9. A production datastore configuration is rejected by the existing sandbox title guard.
10. Training Mobile v2.1 remains unchanged and continues to run independently.
