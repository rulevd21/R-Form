# Owner Bot Period Report v1.4

## Purpose

Replace the implicit weekly-only entry point with one deterministic read-model for any closed reporting period.

The feature is part of the existing private Owner Bot cockpit. It does not create a new datastore, publisher, API, trigger, or weekly fact store.

## UX

`/today` now exposes `Отчёт за период` as a peer of `Обновить` and `Материалы`.

Available choices:

- `Текущая неделя` — Sunday through today;
- `Текущий месяц` — first day of the current month through today;
- `Последние 30 дней`;
- `Выбрать даты` — owner selects start and end dates through the inline Telegram calendar.

The arbitrary range is not coupled to week or month boundaries, so the same path supports monthly reports and any historical comparison period.

## Canonical sources

The read-model reads only existing canonical Master Data tables:

- `DAY_CLOSURE`;
- `DAILY`;
- `NUTRITION_DAILY`;
- `TRAINING_SESSIONS`;
- `MEASUREMENTS`.

No source table is modified.

## Readiness contract

Every selected range is validated before reading:

1. dates must be valid calendar dates;
2. start must be on or before end;
3. end cannot be in the future;
4. range length must be 1–366 calendar days.

Each calendar day in the selected range is checked against the same accepted Closure contract used by Capture → Closure → Events:

- `Close_Request` accepted;
- `Close_Readiness` READY/CLOSED;
- no blocking issue;
- `Closed_At` present;
- duplicate count zero/blank;
- open QA count zero/blank.

Result state:

- `READY_FOR_REPORT_BUILD` only when every calendar day in the range has accepted canonical closure evidence;
- otherwise `DRAFT_ONLY`, with the missing/open dates surfaced explicitly.

The report also shows closed training sessions, duration, nutrition coverage, average nutrition estimate when available, morning-weight trend, comparable measurement count, and secondary DAILY/Nutrition gaps.

## Safety boundary

The period report is read-only.

It must not:

- write or close days;
- change training/nutrition facts;
- create `DATA_EVENTS`;
- create/update `CONTENT_QUEUE`;
- approve or publish content;
- change Script Properties or triggers;
- create another Owner Bot deployment URL.

## Runtime rollout

Guarded rollout script:

`scripts/apps-script/owner-bot-period-report-v1-4-runtime.sh`

The script:

1. requires the accepted Owner Bot source at baseline commit `8d05a47d095919e8aede308c47a5d7efeea01f77`;
2. discovers exactly one Owner Bot Apps Script project;
3. verifies core/cockpit source hashes before mutation;
4. replaces only the cockpit source;
5. performs exact source readback;
6. creates a new immutable Apps Script version;
7. updates the existing web-app deployment in place;
8. verifies deployment-ID inventory is unchanged;
9. stops at owner acceptance.

Expected terminal gate:

`RUNTIME_DEPLOYED_AWAITING_OWNER_ACCEPTANCE`

Owner acceptance:

1. open `/today`;
2. tap `Отчёт за период`;
3. open `Текущая неделя` and confirm the exact period/coverage/status;
4. open `Выбрать даты` and confirm separate start/end calendars are available.

No publication or canonical mutation is part of acceptance.
