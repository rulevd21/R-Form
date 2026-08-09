# R/Form MEAL contract v0.1

Status: Phase 3A sandbox only. Production promotion is not authorized.

## Scope

`MEAL` is the second write event in R/Form Mobile. It may write only to the configured `RFORM_MASTER_DATA_SANDBOX_*` datastore. It must not change the production master or the Training Mobile v2.1 writer.

## Canonical storage model

One food/component = one `NUTRITION_RAW` row.

All components in one submitted meal share the same server-generated `Meal_ID`. `NUTRITION_DAILY.Meal_Count` therefore increases by one even when a meal contains multiple components.

`Unit=meal` is reserved for exception workflows where a dish cannot be reliably decomposed. Phase 3A catalog fast paths do not use aggregate `meal` rows.

## Client payload

```json
{
  "eventId": "uuid",
  "eventType": "MEAL",
  "eventDate": "YYYY-MM-DD",
  "mealTime": "HH:mm",
  "mealType": "BREAKFAST|POST_WORKOUT|LUNCH|SNACK|DINNER|LATE_SNACK|OTHER",
  "components": [
    { "foodId": "FOOD-...", "amount": 200, "unit": "g" }
  ],
  "templateId": "optional",
  "source": "RFORM_MOBILE",
  "appVersion": "0.3.0-sandbox"
}
```

The server accepts only the current server date in the configured timezone and only while the matching `DAILY` row is `OPEN`.

## Server-owned fields

The client must not supply:

- `Food_Record_ID`;
- `Day_ID`;
- `Meal_ID`;
- Calories / Protein / Fat / Carbs;
- `Estimation_Quality`;
- `Record_Key`;
- `Duplicate_Flag`;
- `NUTRITION_DAILY` values;
- audit timestamps or processing metadata.

For catalog fast paths, nutrition values are calculated server-side from verified active `FOOD_CATALOG` entries using `amount / Basis_Amount`.

## FOOD_CATALOG eligibility

A catalog row is eligible only when:

- `Food_ID` is present;
- `Status = ACTIVE`;
- `Verified_By_User` is truthy;
- `Duplicate_Flag` is blank;
- `Basis` and `Basis_Amount` are valid;
- all macro values are finite and non-negative.

Phase 3A requires the submitted component unit to match catalog `Basis` exactly. Unit conversion is deferred.

## Write targets

### NUTRITION_RAW

Each component creates one row containing the current Day_ID, server-generated Meal_ID, calendar date serial, meal time, meal type, catalog-derived values, source trace, ACTIVE status, Record_Key and Duplicate_Flag formula.

`Date` is stored as an integer Google Sheets calendar serial. `Meal_Time` is stored as a day fraction. `Created_At` is a true timestamp.

### NUTRITION_DAILY

If no current-day aggregate exists, the server creates one formula-owned row with:

- formula Day_ID;
- integer Date serial;
- formula Meal_Count;
- formula K/P/F/C aggregates;
- `Status = ACTIVE`;
- Duplicate_Flag formula.

`Plan_Status`, `Main_Deviation`, `Nutrition_Decision` and `Closed_At` remain untouched during normal meal entry.

### INBOX_LOG

A successful new event creates one audit row:

- `Inbox_Event_ID = APP-MEAL-<eventId>`;
- `Event_Type = MEAL`;
- `Parsed_Entity = NUTRITION_MEAL`;
- `Target_Sheet = NUTRITION_RAW`;
- `Target_Record_ID = <Day_ID>|<Meal_ID>`;
- `Validation_Status = VALID`;
- `Processing_Status = APPLIED`;
- `Applied_By = OWNER`;
- `Source_Chat = RFORM_MOBILE`;
- `Version = 0.3.0-sandbox`.

## Idempotency and concurrency

The writer acquires `LockService.getScriptLock()` before checking and writing.

Event idempotency key: `APP-MEAL-<eventId>`.

Retry with the same event ID returns `ALREADY_APPLIED` and creates no new component, aggregate or audit row.

Within one event, duplicate `foodId + unit` components are rejected so the client must combine them before submit.

## Native structure preservation

Before writing newly appended rows, the server copies native formatting and data validation from the preceding populated row, then writes only the current operation's values/formulas. New Duplicate_Flag formulas are written explicitly.

## Failure handling

For a new event, partial new rows are rolled back if verification fails:

- new INBOX row is cleared;
- newly created NUTRITION_DAILY row is cleared;
- all new NUTRITION_RAW component rows are cleared.

Existing historical rows are not modified by rollback.

## Safety guards

- datastore title must start with `RFORM_MASTER_DATA_SANDBOX_`;
- exact headers are validated before writing;
- current day must exist and be OPEN;
- catalog entries must be active and verified;
- no production spreadsheet ID is embedded in client code;
- no Training Mobile v2.1 write method is called;
- GitHub `main` is not used for Phase 3 development;
- Gemini or any paid AI API is not required.

## UX requirement

Before the first meal, the UI displays `Приёмов пищи пока нет`, not the internal `MISSING` state.

Phase 3A UI supports component entry from verified `FOOD_CATALOG`. Recent/favorite/template acceleration is Phase 3C.

## Acceptance tests

1. One known product → one NUTRITION_RAW row, one Meal_ID, Meal_Count = 1.
2. Multi-component meal → N rows with one Meal_ID, Meal_Count increases by 1.
3. Server calculated K/P/F/C equals catalog basis scaling.
4. First meal creates exactly one formula-owned NUTRITION_DAILY row.
5. Second meal reuses the same NUTRITION_DAILY row.
6. Retry with same UUID → ALREADY_APPLIED and no new rows.
7. Duplicate flags remain blank.
8. NUTRITION_RAW Date and NUTRITION_DAILY Date are integer serials.
9. Native formats and validations remain present on new rows.
10. Closed or missing day rejects MEAL.
11. Unverified/inactive/duplicate catalog food rejects MEAL.
12. Production datastore configuration remains blocked by sandbox title guard.
13. Training Mobile v2.1 remains unchanged and independently operational.
