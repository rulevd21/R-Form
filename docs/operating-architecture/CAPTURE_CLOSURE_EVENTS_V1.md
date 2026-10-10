# Capture → Closure → Events v1

Status: production candidate, effective from 10.10.2026.

## Goal

Use one deterministic lifecycle for daily operational facts without introducing a second datastore:

`CAPTURE → CLOSURE → DATA_EVENTS`

Canonical capture tables remain unchanged. The lifecycle layer is a read-normalizer plus an idempotent `DATA_EVENTS` writer.

## Capture sources

| Domain | Canonical capture | Stable entity |
| --- | --- | --- |
| Day / recovery / bodyweight | `DAILY` | `Day_ID` |
| Nutrition | `NUTRITION_RAW` → `NUTRITION_DAILY` | `Day_ID` |
| Training | `TRAINING_SESSIONS` + `TRAINING_SETS` | `Session_ID` + `Day_ID` |
| Measurements | `MEASUREMENTS` | date-group of comparable non-duplicate records |
| Decisions | `DECISIONS` | `Decision_ID` |

Capture never writes `DATA_EVENTS` directly.

## Closure gates

### Day-scoped facts

A day fact is accepted only when all of the following are true:

- the canonical source record itself is closed where applicable;
- `DAY_CLOSURE.Close_Request` is explicit;
- `DAY_CLOSURE.Close_Readiness` is `READY`/closed;
- `Blocking_Issues` is empty;
- `Closed_At` is present;
- duplicate count and open QA count are zero when supplied.

Nutrition and measurements inherit the accepted day closure. Training sessions dated on or after the lifecycle start require both `Session_Status=CLOSED` and the accepted day closure.

### Decisions

`DECISIONS` keeps its existing closure semantics: the decision must be `ACTIVE` and inside its effective window. This preserves the existing decision-event contract while diary facts move to the common day closure.

## Event contract

New lifecycle event families:

- `DAY_CLOSED`, `RECOVERY_DEVIATION`, `RECOVERY_CONTROL_POINT`, `BODYWEIGHT_DEVIATION`;
- `NUTRITION_CLOSED`, `NUTRITION_DEVIATION`;
- `TRAINING_COMPLETED` plus the existing significant training event types;
- `MEASUREMENTS_ACCEPTED`, `MEASUREMENT_CHANGE`;
- existing `DECISION_RECORDED` / `DECISION_CHANGED`.

Event IDs are deterministic from date + domain + canonical entity. Re-running the writer updates the same row or produces `unchanged`; it never creates a second event for the same fact.

Routine closed facts use `AGGREGATE_ONLY`; meaningful but non-owner-gated deviations use `AGGREGATE_TO_WEEKLY`. Health/competition-sensitive signals retain owner gates. Existing `CONTENT_QUEUE` reconciliation remains in place so an already-covered fact does not create a second editorial gate.

## Backfill boundary

The new day/nutrition/routine-training/measurement lifecycle starts at `10.10.2026`. Earlier rows are not backfilled into new event families. Existing legacy training/decision events remain supported and keep their established Event IDs.

## Mutation boundary

The scheduled detector writer may mutate only `DATA_EVENTS`.

It must not mutate:

- `DAILY`, `NUTRITION_*`, `TRAINING_*`, `MEASUREMENTS`, `DECISIONS`;
- `DAY_CLOSURE`;
- `CONTENT_QUEUE`;
- Telegram or publisher state;
- trigger inventory during normal execution.

The existing scheduled handler name `rformContentEventDetectorWriteV03` is intentionally retained so the verified 6-hour production trigger does not need replacement. The implementation reports detector `0.4`, lifecycle `1.0`, observability `0.1`.

## Acceptance

1. An OPEN day produces no day/nutrition/routine-training/measurement lifecycle event.
2. The same fact becomes eligible after accepted closure.
3. Stable Event IDs make a second run a no-duplicate update/no-op.
4. Significant training Event IDs remain compatible with the previous detector.
5. The production trigger handler and cadence remain unchanged.
6. Runtime source readback must match the reviewed candidate before promotion.
7. A scheduled production run must show a valid `RFORM_DETECTOR_RUN` START/FINISH receipt and valid counters before `VERIFIED_PRODUCTION`.
