# R/Form FOOD_FAVORITE contract v0.1

Status: SANDBOX / Phase 3C.3
Runtime: 0.3.5-sandbox

## Purpose

Allow the owner to mark an ACTIVE, user-verified `FOOD_CATALOG` item as favorite without modifying nutrition history or nutrition facts.

## Client event

```text
{
  eventId: UUID,
  eventType: FOOD_FAVORITE,
  foodId: FOOD-...,
  favorite: boolean,
  source: RFORM_MOBILE,
  appVersion: client runtime marker
}
```

The client persists one unresolved favorite event locally. Retry MUST reuse the same `eventId` and payload.

## Server operation

`setFoodFavorite(payload)`

Controls:
- sandbox datastore guard inherited from the common datastore layer;
- `ScriptLock`;
- exact schema/header validation;
- Food_ID must exist, be `ACTIVE`, `Verified_By_User`, and non-duplicate;
- only `FOOD_CATALOG.Favorite` may change;
- stored value is `YES` or `NO`;
- post-write verification before audit acceptance;
- rollback of Favorite and audit row if verification fails;
- replay of an accepted `eventId` returns `ALREADY_APPLIED` without another write.

If the requested boolean already equals the current Favorite state, the server returns `ALREADY_STATE` and performs no write/audit.

## Audit mapping

No new `INBOX_LOG.Event_Type` dictionary value is introduced in the pilot.

```text
Inbox_Event_ID = APP-FAVORITE-<eventId>
Event_Type = CORRECTION
Parsed_Entity = FOOD_FAVORITE
Target_Sheet = FOOD_CATALOG
Target_Record_ID = <Food_ID>
Validation_Status = VALID
Processing_Status = APPLIED
Applied_By = OWNER
Source_Chat = RFORM_MOBILE
Version = 0.3.5-sandbox
```

`INBOX_LOG.Version` is the server-side Favorite writer version. It is intentionally separate from historical MEAL writer version markers.

## Invariants

A Favorite operation MUST NOT modify:
- `NUTRITION_RAW`;
- `NUTRITION_DAILY`;
- FOOD_CATALOG calories/protein/fat/carbs/basis/source fields;
- Training Mobile v2.1 data or deployment.

After a successful write, the next fast-path bootstrap must move the item into or out of `favorites[]` while preserving it in `recentFoods[]` when applicable.

## Acceptance fixture

Initial sandbox state:
- `FOOD-000001 Favorite = NO`;
- `FOOD-000002 Favorite = NO`;
- `favorites[] = 0`.

Minimal acceptance:
1. Mark `FOOD-000001` favorite in UI.
2. Expect exactly `FOOD_CATALOG.Favorite = YES` for that row.
3. Expect exactly one new `APP-FAVORITE-*` audit row with `CORRECTION / FOOD_FAVORITE`.
4. Expect `favorites[]` to contain `FOOD-000001`.
5. Confirm `NUTRITION_RAW` and `NUTRITION_DAILY` unchanged.
6. Retry the same stored eventId only when testing recovery/idempotency; no synthetic second toggle is required for normal UX acceptance.
