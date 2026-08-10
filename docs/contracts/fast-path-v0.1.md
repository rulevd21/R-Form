# R/Form Nutrition Fast Path contract v0.1

Status: Phase 3C.2 sandbox only. Repeat recent meal enabled; Favorite / recent-food prefill / templates remain read-only. Production promotion is not authorized.

## Purpose

Reduce repeated nutrition input without changing the accepted Phase 3A `MEAL` writer or canonical component-level storage model.

## Bootstrap

`getPhase3CBootstrapState()` remains the read-model source introduced in Phase 3C.1.

`getPhase3C2BootstrapState()` wraps it for runtime `0.3.4-sandbox` and enables only the client-side capability `repeatRecentMeal`.

Returned `fastPaths` includes:

```json
{
  "recentMeals": [],
  "recentFoods": [],
  "favorites": [],
  "templates": [],
  "limits": { "recentMeals": 3, "recentFoods": 6 },
  "capabilities": {
    "repeatRecentMeal": true,
    "recentFoodPrefill": false,
    "favoriteWrite": false,
    "templateWrite": false
  }
}
```

No new write endpoint is added. `writeScope` remains `DAY_START` + `MEAL`.

## recentMeals

Up to 3 most recent successful R/Form Mobile catalog-backed meals.

Eligibility:

- `NUTRITION_RAW.Status != DELETED`;
- `Duplicate_Flag` blank;
- component source begins with `RFORM_MOBILE`;
- component resolves to an active, verified, non-duplicate `FOOD_CATALOG` item;
- component unit equals current catalog basis;
- all components sharing one `Meal_ID` are grouped into one returned meal.

Returned meal includes `mealId`, date, meal time/type, components, display summary and summed K/P/F/C.

## Phase 3C.2 repeat semantics

The `Повторить` button is enabled only when the current `DAILY` state is `OPEN` and there is no unresolved pending MEAL event.

Pressing `Повторить` does **not** write anything. It opens the ordinary MEAL form with:

- the previous meal type preselected when still allowed;
- the previous Food_ID list;
- the previous Amount values;
- the current server-provided meal time instead of the historical time.

The user may edit meal type, components or amounts before saving.

Only the subsequent ordinary Save calls the existing accepted `submitMeal()` writer. Because no pending event exists at prefill time, Save creates a new eventId. The server therefore creates a new Meal_ID and treats it as a legitimate new meal, not an idempotency replay.

If a pending MEAL exists, repeat controls are disabled so a new payload cannot overwrite the pending retry state.

## Amount input invariant

Catalog-backed amount input must not reject a valid positive decimal solely because of an HTML `step` lattice.

The client uses `type=number`, `min=0.01`, `max=10000` and `step=any`. Server-side validation remains authoritative: the submitted amount must be finite and greater than zero, and the existing MEAL writer applies its normal validation.

This permits both whole-gram values such as `150` and exact decimal values such as `149.91` without browser `stepMismatch` errors. Runtime `0.3.4-sandbox` replaces the earlier `min=0.01` + `step=0.1` combination, whose valid-value lattice incorrectly made `150` invalid (`149.91` and `150.01` were the nearest browser-accepted values).

## recentFoods

Up to 6 catalog-backed foods ordered by latest R/Form Mobile use. The latest actual `Amount` and `Unit` are returned as `lastAmount` and `lastUnit`.

When two foods were used in the same transaction and therefore have the same `Created_At`, their relative order is not semantically significant.

Phase 3C.2 still renders recent foods read-only. Direct recent-food prefill is deferred to Phase 3C.3.

## favorites

Reads only `FOOD_CATALOG` rows that are active, verified, non-duplicate and `Favorite=YES`.

Phase 3C.2 does not expose `setFoodFavorite()` or any catalog mutation.

## templates

Reads only `MEAL_TEMPLATES.Status=ACTIVE` components whose `Food_ID` still resolves to an eligible catalog item and whose unit matches catalog basis.

Components are grouped by `Meal_Template_ID` and ordered by `Component_Order`. K/P/F/C are not stored or returned as template-owned values.

Phase 3C.2 does not expose template create/update/delete or repeat actions.

## Safety

- existing sandbox datastore guard remains authoritative;
- accepted Phase 3A `submitMeal()` is unchanged;
- Phase 3C.2 adds no write endpoint;
- a repeat prefill itself performs zero datastore writes;
- `writeScope` remains `DAY_START` + `MEAL` only;
- production `RFORM_MASTER_DATA_v1`, GitHub `main` and Training Mobile v2.1 are outside scope.

## Acceptance tests

### 3C.1 read-only baseline

On the current sandbox fixture after Phase 3A regressions:

- recentMeals: 3 (`M3`, `M2`, `M1`, newest first);
- recentFoods: 2 (`FOOD-000001` and `FOOD-000002`; relative order is not significant when both share the same latest timestamp);
- favorites: 0;
- templates: 0;
- bootstrap/render creates no datastore changes.

### 3C.2 repeat prefill

1. When current day is not OPEN, repeat buttons are disabled and no data changes occur.
2. When current day is OPEN, pressing repeat opens the ordinary MEAL form with prior components and amounts.
3. Meal time is current, not historical.
4. Whole and decimal amounts from a recent meal pass browser validation without step mismatch.
5. No write occurs before Save.
6. Save uses existing `submitMeal()` and must create one new MEAL event and one new Meal_ID.
7. Retry of that new eventId remains `ALREADY_APPLIED` without duplicates.
8. Favorite, recent-food direct prefill and templates remain non-mutating in this phase.
