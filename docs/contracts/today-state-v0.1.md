# Today State Contract v0.1

Status: Phase 1 / sandbox / read-only.

## Public server functions

### `getAppBootstrap()`

Returns application metadata only. It must not expose spreadsheet IDs or credentials.

```json
{
  "appName": "R/Form Mobile",
  "environment": "SANDBOX",
  "appVersion": "0.1.0-sandbox",
  "dataSchemaVersion": "RFORM_MASTER_DATA_v1",
  "timezone": "Europe/Moscow",
  "today": "YYYY-MM-DD",
  "readOnly": true,
  "modules": {
    "today": true,
    "nutrition": false,
    "trainingLegacy": true,
    "measurements": false,
    "dayClose": false
  }
}
```

### `getTodayState()`

Returns a minimal projection of the current day from the sandbox data store.

Top-level states:
- `NOT_STARTED`
- `OPEN`
- `CLOSED`

Shape:

```json
{
  "date": "YYYY-MM-DD",
  "state": "OPEN",
  "day": {
    "dayId": "D-YYYYMMDD",
    "dayType": "TRAINING_A | TRAINING_B | TRAINING_C | RECOVERY | ...",
    "morningWeight": 0,
    "weight7dAverage": 0,
    "sleepHours": 0,
    "sleepQuality": 0,
    "readiness": 0,
    "steps": 0,
    "pain": { "shoulder": 0, "elbow": 0, "other": 0 },
    "nutritionPlan": {
      "calories": { "min": 0, "max": 0 },
      "protein": { "min": 0, "max": 0 },
      "fat": { "min": 0, "max": 0 },
      "carbs": { "min": 0, "max": 0 }
    },
    "status": "OPEN"
  },
  "nutrition": {
    "mealCount": 0,
    "fact": {
      "calories": { "min": 0, "max": 0 },
      "protein": { "min": 0, "max": 0 },
      "fat": { "min": 0, "max": 0 },
      "carbs": { "min": 0, "max": 0 }
    },
    "planStatus": "",
    "status": "ACTIVE | CLOSED | MISSING"
  },
  "training": {
    "required": true,
    "sessionId": "S-YYYYMMDD-X",
    "trainingCode": "A | B | C",
    "planStatus": "PLANNED | WITHIN_PLAN | BELOW_PLAN | ...",
    "status": "NOT_STARTED | OPEN | CLOSED | NOT_REQUIRED",
    "launchAvailable": true
  },
  "server": {
    "appVersion": "0.1.0-sandbox",
    "dataSchemaVersion": "RFORM_MASTER_DATA_v1",
    "readOnly": true,
    "timezone": "Europe/Moscow"
  }
}
```

## `getTrainingLaunchState()`

Returns the compatibility-layer launch state for the existing Training Mobile v2.1. The adapter does not write training facts and does not alter the legacy writer.

## Data minimization

The client receives only fields needed to render the current-day shell. It does not receive full historical rows, audit payloads, Google IDs, formula source, or unrelated project data.

## Error contract

Configuration error:
`CONFIG_MISSING:<KEY>`

Schema error:
`SCHEMA_MISMATCH:<SHEET>:<missing headers>`

All errors are read failures only in Phase 1; no rollback is required because no write operation exists.
