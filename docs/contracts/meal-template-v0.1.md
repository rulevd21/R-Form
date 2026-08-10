# R/Form MEAL_TEMPLATE contract v0.1

Status: Phase 3C.4 sandbox only. Production promotion is not authorized.

## Purpose

MEAL_TEMPLATE stores a reusable component preset for a known multi-component meal. It is metadata for future input acceleration, not nutrition history.

## Canonical schema

`MEAL_TEMPLATES` columns:

- `Meal_Template_ID`
- `Template_Name`
- `Meal_Type`
- `Component_Order`
- `Food_ID`
- `Default_Amount`
- `Unit`
- `Status`
- `Last_Used_At`

One template occupies N rows with the same `Meal_Template_ID`, one row per component. Component order is explicit and 1-based.

Nutrition values are never copied into `MEAL_TEMPLATES`. On template use, the ordinary MEAL form and accepted `submitMeal()` resolve current nutrition facts from verified `FOOD_CATALOG`.

## Save event

Client event:

```json
{
  "eventId": "uuid",
  "eventType": "MEAL_TEMPLATE_SAVE",
  "sourceMealId": "YYYY-MM-DD_Mn",
  "optionalName": "optional, <=80 chars",
  "source": "RFORM_MOBILE",
  "appVersion": "0.3.6-sandbox"
}
```

The source meal must:

- exist in catalog-backed `NUTRITION_RAW`;
- have at least two eligible components;
- have one consistent `Meal_Type`;
- contain ACTIVE/non-DELETED rows without duplicate flags;
- resolve every Food_ID to ACTIVE + Verified_By_User `FOOD_CATALOG`;
- have Amount > 0 and Unit equal to the catalog basis;
- not contain the same Food_ID twice.

## Template identity

New template ID:

`MT-YYYYMMDD-<8 chars from event UUID>`

Content identity used to prevent template pollution:

`Meal_Type + ordered Food_ID + normalized Amount + Unit` for every component.

If an ACTIVE template already has the exact same signature, no new template rows are created. The client result is `ALREADY_STATE` and the audit event is `SKIPPED` with the existing `Meal_Template_ID`.

Same foods with different amounts, order or Meal_Type are distinct templates.

## Naming

If `optionalName` is blank, the server generates:

`<Meal_Type> · <first component> + <second component>`

and truncates to 80 characters. More than two components may use a trailing `+` marker.

The client may supply an edited optional name, but the composition and amounts still come only from the source MEAL.

## Audit mapping

No new `INBOX_LOG.Event_Type` dictionary value is added in the pilot.

Accepted mapping:

- `Inbox_Event_ID = APP-TEMPLATE-<eventId>`
- `Event_Type = CORRECTION`
- `Parsed_Entity = MEAL_TEMPLATE`
- `Target_Sheet = MEAL_TEMPLATES`
- `Target_Record_ID = Meal_Template_ID`
- `Validation_Status = VALID`
- `Processing_Status = APPLIED` for new template
- `Processing_Status = SKIPPED` for existing identical ACTIVE template
- `Applied_By = OWNER`
- `Source_Chat = RFORM_MOBILE`
- `Version = 0.3.6-sandbox`

`Note` stores the source Meal_ID, component count and client runtime version.

## Concurrency, idempotency and rollback

- writer uses `ScriptLock`;
- same `eventId` returns `ALREADY_APPLIED` and creates nothing;
- identical template content with a new eventId returns `ALREADY_STATE` and creates only a SKIPPED audit event;
- if verification or audit write fails after new template rows are created, those new template row contents are cleared;
- existing historical template rows are never modified by rollback.

## Native structure

New template rows receive strict native data validation for:

- Meal_Type from `DICTIONARIES!H2:H8`;
- Unit from `DICTIONARIES!P2:P10`;
- Status from `DICTIONARIES!N2:N7`.

`Last_Used_At` is stored as a true date-time. In v0.1 it records template creation/last explicit save. Updating it after every template use is intentionally deferred because template use itself is a read/prefill action and must not write before a MEAL is saved.

## Template use

Using a template is client-side prefill only:

1. set current server-provided default meal time;
2. set template Meal_Type;
3. copy template Food_ID / Default_Amount into the ordinary editable MEAL form;
4. user may edit any amount/component;
5. only `Сохранить приём пищи` calls the already accepted `submitMeal()` with a new eventId/new Meal_ID.

Opening or closing a template-prefilled form creates no datastore write.

## Acceptance tests

1. Save `2026-08-10_M1` → exactly two `MEAL_TEMPLATES` rows with one Template_ID.
2. Stored rows contain Food_ID / Amount / Unit only; no K/P/F/C columns exist in the template schema.
3. One `APP-TEMPLATE-*` audit event → `CORRECTION / MEAL_TEMPLATE / VALID / APPLIED`.
4. Repeat save of identical content with new eventId → no new template rows and `SKIPPED / ALREADY_STATE`.
5. Replay same eventId → `ALREADY_APPLIED`, no new rows.
6. Template card appears in read model and `Использовать` opens an editable MEAL form with current time, saved Meal_Type and saved components.
7. Opening template form writes nothing.
8. Production master, GitHub main and Training Mobile v2.1 remain unchanged.
