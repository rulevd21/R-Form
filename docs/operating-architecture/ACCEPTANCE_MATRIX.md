# R/Form Operating Architecture Acceptance Matrix

Status date: 2026-08-30.

This matrix distinguishes static architecture validation from runtime E2E validation. Do not mark runtime PASS until the actual installed R/Form Operating System routes the command and canonical readback verifies the result.

| Test | Command | Expected route | Expected canonical data/state | State change | Current result |
|---|---|---|---|---|---|
| 01 | Открой день | OS → DAY_OPEN → day/nutrition | DAILY + active plan + ingest path | create/reuse OPEN day | STATIC PASS / RUNTIME BLOCKED |
| 02 | Добавь еду | OS → MEAL_ADD → nutrition | NUTRITION_RAW → NUTRITION_DAILY | meal write + aggregate | STATIC PASS / RUNTIME BLOCKED |
| 03 | Сколько осталось КБЖУ? | OS → NUTRITION_REMAINING | ACTIVE_PLANS + NUTRITION_DAILY | none | STATIC PASS / RUNTIME BLOCKED |
| 04 | Закрой день | OS → DAY_CLOSE | DAY_CLOSURE + DAILY/NUTRITION/training checks | valid closure | STATIC PASS / RUNTIME BLOCKED |
| 05 | Добавь тренировку | OS → TRAINING_ADD | TRAINING_PLAN/SESSIONS/SETS | factual session/set write | STATIC PASS / RUNTIME BLOCKED |
| 06 | Обнови статус подготовки | OS → PREP_STATUS | training + metrics + plans + decisions | none by default | STATIC PASS / RUNTIME BLOCKED |
| 07 | Сформируй Weekly Report | OS → WEEKLY_BUILD | closed period facts + exact Weekly artifact | DRAFT/update | STATIC PASS / RUNTIME BLOCKED |
| 08 | Подготовь публикацию | OS → PUBLICATION_PREPARE | CONTENT_QUEUE + DATA_EVENTS + decisions | package/draft only | STATIC PASS / RUNTIME BLOCKED |
| 09 | Опубликуй | OS → resolve exact object → publication pipeline | exact approved current preview + CONTENT_QUEUE | external publish + writeback | STATIC PASS / RUNTIME BLOCKED |
| 10 | Что требует моего решения? | OS → OWNER_DECISIONS | domain blockers/gates | none | STATIC PASS / RUNTIME BLOCKED |

## Why runtime is blocked

The canonical Skill source exists at `skills/rform-operating-system/SKILL.md` in GitHub, but the current ChatGPT runtime's installed-skill catalog did not expose `rform-operating-system` during discovery.

This is a deployment/installation gate, not a reason to create a second router.

## Runtime PASS criteria

A test becomes PASS only when:

1. the installed router is callable;
2. the command resolves to the expected intent/domain;
3. the expected canonical source is read;
4. any state transition follows the contract;
5. any write is read back;
6. the user response reports the actual result;
7. no parallel datastore/router/publisher is introduced.

At least one state-changing test must pass end-to-end before the architecture migration can be declared complete.
