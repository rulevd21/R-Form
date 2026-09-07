# Training & Preparation Workflows

Canonical facts live in `TRAINING_PLAN`, `TRAINING_SESSIONS`, `TRAINING_SETS`, `MEASUREMENTS`, `ACTIVE_PLANS` and `DECISIONS`.

## TRAINING_ADD — Добавь тренировку

1. Resolve date, `Day_ID`, expected `Session_ID` and active plan.
2. Reuse existing session if present.
3. Persist factual session/set data through the approved writer/adapter.
4. Compare fact with the exact plan without mutating the plan to fit the result.
5. Preserve pain, technique, RIR and source uncertainty.
6. Close/analyze only when required factual fields are sufficient.
7. Read back session and sets.

## PREP_STATUS — Обнови статус подготовки

This is an analytical read unless the owner explicitly approves a new plan/decision.

1. Resolve the next competition/checkpoint and active preparation decisions.
2. Read recent training, bodyweight/measurements, recovery and nutrition evidence needed by the checkpoint.
3. Evaluate the nearest applicable checkpoint before the final event target.
4. For each material KPI emit an explicit status such as ON TRACK / WATCH / OFF TRACK / DATA GAP.
5. Separate fact, trend, interpretation and recommendation.
6. Do not create a new decision from one isolated observation when a series exists.

## TRAINING_WEEK_DRAFT — Составь следующую тренировочную неделю

1. Read the latest completed/analyzed sessions and active competition/preparation decision.
2. Build the smallest justified next-week adjustment.
3. Create/update a DRAFT plan only; do not silently activate it.
4. Preserve exercise identifiers, load/reps/RIR, progression rule and constraints.
5. Validate against available equipment, session duration and recovery data already in canonical sources.

## TRAINING_PLAN_UPDATE — Обнови план

1. Resolve the exact draft/current plan and effective dates.
2. Validate that the requested/derived update does not conflict with a newer decision.
3. Prefer version/update over duplicate rows.
4. Activate only the exact prepared plan that the current intent authorizes.
5. Read back exact plan/status/effective window.

## Root-cause rule for app defects

When an application produces a wrong planned exercise/load/bodyweight value, diagnose source contract and mapping first. Do not patch only the displayed label if the canonical write/read contract is wrong.
