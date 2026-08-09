# R/Form Nutrition Fast Path contract v0.1

Status: Phase 3C.1 sandbox only. Read-only fast-path layer. Production promotion is not authorized.

## Purpose

Reduce repeated nutrition input without changing the accepted Phase 3A `MEAL` writer or canonical component-level storage model.

## Bootstrap

`getPhase3CBootstrapState()` extends the accepted Phase 3 bootstrap and returns `fastPaths`:

```json
{
  "recentMeals": [],
  "recentFoods": [],
  "favorites": [],
  "templates": [],
  "limits": { "recentMeals": 3, "recentFoods": 6 },
  "readOnly": true
}
```

Runtime version: `0.3.2-sandbox`.

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

Phase 3C.1 renders these records only. No repeat action is enabled yet.

## recentFoods

Up to 6 catalog-backed foods ordered by latest R/Form Mobile use. The latest actual `Amount` and `Unit` are returned as `lastAmount` and `lastUnit`.

When two foods were used in the same transaction and therefore have the same `Created_At`, their relative order is not semantically significant in Phase 3C.1.

When Phase 3C.2/3C.3 is later enabled, this value can be used as the default amount. Phase 3C.1 does not write anything.

## favorites

Reads only `FOOD_CATALOG` rows that are active, verified, non-duplicate and `Favorite=YES`.

Phase 3C.1 does not expose `setFoodFavorite()` or any other catalog mutation.

## templates

Reads only `MEAL_TEMPLATES.Status=ACTIVE` components whose `Food_ID` still resolves to an eligible catalog item and whose unit matches the catalog basis.

Components are grouped by `Meal_Template_ID` and ordered by `Component_Order`. K/P/F/C are not stored or returned as template-owned values.

Phase 3C.1 does not expose template create/update/delete operations.

## Safety

- existing sandbox datastore guard remains authoritative;
- Phase 3A `submitMeal()` is unchanged;
- Phase 3C.1 adds no new write endpoint;
- `writeScope` remains `DAY_START` + `MEAL` only;
- production `RFORM_MASTER_DATA_v1`, GitHub `main` and Training Mobile v2.1 are outside scope.

## Acceptance test

On the current sandbox fixture after Phase 3A regressions, expected read model is:

- recentMeals: 3 (`M3`, `M2`, `M1`, newest first);
- recentFoods: 2 (`FOOD-000001` and `FOOD-000002`; either relative order is acceptable because both were last used in M3 at the same timestamp);
- favorites: 0;
- templates: 0;
- no datastore changes after bootstrap/render.

The UI must show the four fast-path blocks as read-only and preserve the existing working `Добавить еду` Phase 3A path.
