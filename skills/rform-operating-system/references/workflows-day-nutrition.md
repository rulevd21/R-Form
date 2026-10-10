# Day & Nutrition Workflows

Use `RFORM_MASTER_DATA_v1` and the existing ingest/closure contracts. Do not create a second daily log.

## DAY_OPEN — Открой день

1. Resolve date and existing `Day_ID`.
2. If the day already exists, reuse it; do not duplicate.
3. Resolve day type/current active plan.
4. Create only through the existing safe day-start/input path when available.
5. Preserve plan values and source provenance.
6. Read back the day and return its exact status.

An open/captured day is not event-eligible yet. Do not create a parallel `DATA_EVENTS` write from chat.

## MEAL_ADD — Добавь приём пищи

1. Resolve current day and meal type/time.
2. Normalize each supplied food using existing catalog/provenance rules.
3. Prefer exact-label/catalog values when verified; otherwise preserve estimation quality/range.
4. Write atomic food records to `NUTRITION_RAW` through the approved writer.
5. Recalculate/update the existing `NUTRITION_DAILY` aggregate using the canonical formula/writer path.
6. Check record key/duplicate protection.
7. Read back and report the updated day total.

Do not manufacture exact macros from uncertain food data. Meal capture does not directly emit an event; the closed daily nutrition aggregate becomes event-eligible only after the accepted day closure.

## NUTRITION_REMAINING — Сколько осталось КБЖУ?

1. Resolve the current active plan for the day type.
2. Read current `NUTRITION_DAILY` fact.
3. Preserve min/max uncertainty when present.
4. Return plan, fact and remaining range. Do not change state.

## DAY_PLAN_FACT — План/факт

Read DAY, NUTRITION_DAILY and training state when relevant. Return the concise management delta. Never close the day automatically.

## DAY_CLOSE — Закрой день

Use the existing `DAY_CLOSURE` gateway.

Required checks include, as applicable:

- morning/day record consistency;
- nutrition row and meal count;
- nutrition values;
- whether training is required for this day type;
- required session and set state;
- duplicate count;
- open QA count;
- blocking issues.

If checks pass, perform the predefined closure write, update the existing canonical statuses and closure record, then read back.

If source data changed after a previous closure, route to revision rather than creating a second day.

A successful closure makes the closed day/nutrition facts eligible for the backend `Capture → Closure → DATA_EVENTS` detector. The chat workflow itself does not write `DATA_EVENTS`, create a standalone content item or publish. Event routing and editorial routing remain separate downstream steps.
