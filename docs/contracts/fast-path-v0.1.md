# R/Form Nutrition Fast Path contract v0.1

Status: Phase 3C PASSED / SANDBOX ACCEPTANCE COMPLETE. Production promotion is not authorized.

## Purpose

Reduce repeated nutrition input without changing the accepted Phase 3A `MEAL` writer or canonical component-level storage model.

## Bootstrap chain

- `getPhase3CBootstrapState()` — read model: recent meals, recent foods, favorites, templates.
- `getPhase3C2BootstrapState()` — repeat recent MEAL.
- `getPhase3C3BootstrapState()` — Favorite metadata operation.
- `getPhase3C4BootstrapState()` — template save/use.
- `getPhase3C5BootstrapState()` — recent-food direct prefill, runtime `0.3.7-sandbox`.

The final sandbox capability layer exposes the accepted functions while preserving the existing `DAY_START` and `MEAL` writers.

## Recent meals

Up to 3 most recent successful R/Form Mobile catalog-backed meals are grouped by `Meal_ID`. `Повторить` is available only for an OPEN day with no unresolved pending MEAL.

Pressing `Повторить` is client-only prefill: historical Food_ID/Amount and Meal_Type are copied into the ordinary MEAL form, while Meal_Time becomes current. No datastore write occurs before ordinary Save. Save uses the accepted `submitMeal()` and creates a new eventId/new Meal_ID.

## Recent foods

Up to 6 active, verified, non-duplicate catalog-backed foods are returned with `lastAmount`/`lastUnit` from the latest R/Form Mobile use. When two foods share the same latest transaction timestamp, their relative order is not semantically significant.

Runtime `0.3.7-sandbox` enables `recentFoodPrefill`:

- `Добавить` is available only for an OPEN day with no unresolved pending MEAL;
- the ordinary MEAL form opens with exactly one component using the selected `Food_ID`;
- default amount is `lastAmount` when present, otherwise current catalog `Basis_Amount`;
- Meal_Time is current;
- Meal_Type uses the normal current suggestion, not a historical type from an unrelated meal;
- the user may edit all fields before Save;
- selecting the food itself performs zero datastore writes;
- Save still uses the unchanged accepted `submitMeal()` writer.

## Favorites

`FOOD_CATALOG.Favorite` is explicit YES/NO metadata. `setFoodFavorite()` is sandbox-only and audited as:

- `Inbox_Event_ID = APP-FAVORITE-<eventId>`;
- `Event_Type = CORRECTION`;
- `Parsed_Entity = FOOD_FAVORITE`;
- `Target_Sheet = FOOD_CATALOG`;
- `Target_Record_ID = Food_ID`.

Favorite changes do not modify `NUTRITION_RAW`, nutrition facts, `Last_Used_At` or `Record_Key`.

## Templates

A template is created only by an explicit action on a successful catalog-backed multi-component MEAL. One template contains N `MEAL_TEMPLATES` component rows with a shared `Meal_Template_ID` and ordered Food_ID/Default_Amount/Unit. K/P/F/C are never stored as template-owned values.

`saveMealTemplate()` is sandbox-only and audited as `CORRECTION / MEAL_TEMPLATE`. An identical ACTIVE template by Meal_Type + ordered Food_ID/Amount/Unit returns `ALREADY_STATE` without duplicate component rows.

`Использовать` is client-only prefill: it opens the ordinary MEAL form with current time and template components. No write occurs before Save.

## Amount input invariant

Catalog-backed amount input uses `type=number`, `min=0.01`, `max=10000`, `step=any`. Server-side validation remains authoritative. Whole values such as `150` and decimal values such as `149.91` must both pass browser validation.

## Safety invariants

- sandbox title guard remains authoritative;
- `submitMeal()` is unchanged;
- Repeat, template use and recent-food selection are client-only prefill operations;
- Favorite and template-save writers are separate audited metadata operations;
- unresolved pending MEAL blocks all new MEAL-prefill shortcuts;
- no fast-path requires manual K/P/F/C input;
- production `RFORM_MASTER_DATA_v1`, GitHub `main` and Training Mobile v2.1 are outside scope.

## Acceptance status

### 3C.1 Read model
PASSED: recentMeals/recentFoods/favorites/templates load without datastore writes.

### 3C.2 Repeat recent MEAL
PASSED: prefill and subsequent ordinary MEAL Save verified; browser Amount lattice defect corrected; new Meal_ID created without duplicates.

### 3C.3 Favorite
PASSED: FOOD-000001 NO→YES verified with one audit event and zero nutrition changes.

### 3C.4 Templates
PASSED: one two-component ACTIVE template created and audited; template-use form visually verified with current time, SNACK, FOOD-000001 150 g and FOOD-000002 425 g. Source confirms template-use click itself contains no writer call.

### 3C.5 Recent-food prefill
PASSED: owner screenshot on 11.08.2026 verified FOOD-000002 direct prefill with one component at 425 g, current time `12:08`, and normal suggested Meal_Type `LUNCH`. Independent sandbox re-read confirmed zero `NUTRITION_RAW`, `NUTRITION_DAILY`, or MEAL audit writes before Save; only the separate DAY_START event for 11.08 was present.

## Final Phase 3C status

Phase 3C Fast Path = PASSED / SANDBOX ACCEPTANCE COMPLETE.

Accepted scope: read model, Repeat Recent Meal, Favorite, Save/Use Template, Recent Food Prefill. Production promotion remains a separate future gate.