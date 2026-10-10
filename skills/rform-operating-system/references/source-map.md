# R/Form Source Map

This file defines source authority for the R/Form Operating System. It does not create a datastore.

## Level 1 — canonical business state

### RFORM_MASTER_DATA_v1
Google Sheets ID: `1Le-481dsy0TZ-kdaobhFZWCLQ9nPQPe3V4WynbDUHzY`.

Use it for operational facts and state. Current production objects include:

- day: `DAILY`, `DAY_CLOSURE`, `INBOX_LOG`;
- nutrition: `NUTRITION_RAW`, `NUTRITION_DAILY`, `FOOD_CATALOG`, `MEAL_TEMPLATES`;
- training: `TRAINING_SESSIONS`, `TRAINING_SETS`, `TRAINING_PLAN`;
- body metrics: `MEASUREMENTS`;
- plans/decisions: `ACTIVE_PLANS`, `DECISIONS`;
- quality/audit: `QA_LOG`, action logs, duplicate flags and record keys;
- content: `DATA_EVENTS`, `CONTENT_QUEUE`, `CONTENT_REGISTRY`, `CONTENT_EXPERIMENTS`.

`CONTENT_QUEUE` is the canonical editorial / approval / publication state machine.
`DATA_EVENTS` is source-event routing evidence, not a second publication queue.
Backup, sandbox, migration and perf copies of MASTER_DATA are restore/test history only unless an explicit owner decision promotes one.

### Operating rules
Use the newest approved versions of:

- `RFORM_HANDBOOK_CURRENT__2026-08-14`;
- `RFORM_OPERATING_ADDENDUM_ACTIVE__2026-08-14`;
- `RFORM_SYSTEM_PORTFOLIO_CURRENT`.

The handbook already contains R/Form mission, product concept, audience, principles, values and long-term direction. Treat these sections as the canonical North Star source; do not create a competing North Star document.

### Management views and outputs
`RFORM_CONTENT_CALENDAR_CURRENT__2026-08-14` is a management/commitment view. It does not override `CONTENT_QUEUE` publication state.
Weekly Reports, Day Reports, work packets and production packets are versioned outputs. They do not override underlying canonical facts.

## Level 2 — source code and technical state

Repository: `rulevd21/R-Form`.

Use GitHub for source code, branch/version state, tests, deployment instructions, technical contracts and application regressions.

Important current development tracks discovered during the 2026-08-30 audit:

- `agent/rform-skill-content-v1.1.3` — R/Form Operating System source;
- `agent/content-control-streamlit-readonly` — Content Control / Channel Control implementation;
- `agent/telegram-owner-inbox-v1` — owner bot/content-control extension;
- `agent/training-check-telegram-v1` — public Training Check staging;
- `feature/training-exercise-overrides-v0.1` — input automation / training exercise development.

A branch name is not proof of production status. Resolve current deployment/version before acting.

## Level 3 — current conversation

Use the current conversation for:

- the current command;
- explicit owner decisions;
- fresh facts not yet persisted;
- approval for an otherwise gated action.

Persist durable operational facts to the canonical store when the intent authorizes it. Do not let chat memory become the only copy.

## Level 4 — external sources

Use web/external sources only when the task depends on current external facts. Keep external evidence separate from R/Form internal state.

## Conflict rule

1. Identify the conflicting fact and both sources.
2. Prefer the newest canonical source within its ownership domain.
3. Do not overwrite silently.
4. If a fresh owner fact has not yet been persisted, use it for the current workflow and write it back only when authorized.
5. Record unresolved material conflicts through existing QA/decision mechanisms rather than inventing another log.
