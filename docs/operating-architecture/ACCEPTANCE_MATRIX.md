# R/Form Operating Architecture Acceptance Matrix

Status date: 2026-08-31.

This matrix distinguishes static architecture validation from runtime E2E validation. Do not mark runtime PASS until the actual installed R/Form Operating System routes the command and canonical readback verifies the result.

| Test | Command | Expected route | Expected canonical data/state | State change | Current result |
|---|---|---|---|---|---|
| 00 | Runtime discoverability | installed Skill → runtime catalog | `rform-operating-system` readable/callable | none | BLOCKED — FRESH CHAT STILL NOT DISCOVERABLE (2026-08-31) |
| 01 | Открой день | OS → DAY_OPEN → day/nutrition | DAILY + active plan + ingest path | create/reuse OPEN day | STATIC PASS / RUNTIME BLOCKED BY 00 |
| 02 | Добавь еду | OS → MEAL_ADD → nutrition | NUTRITION_RAW → NUTRITION_DAILY | meal write + aggregate | STATIC PASS / RUNTIME BLOCKED BY 00 |
| 03 | Сколько осталось КБЖУ? | OS → NUTRITION_REMAINING | ACTIVE_PLANS + NUTRITION_DAILY | none | STATIC PASS / RUNTIME BLOCKED BY 00 |
| 04 | Закрой день | OS → DAY_CLOSE | DAY_CLOSURE + DAILY/NUTRITION/training checks | valid closure | STATIC PASS / RUNTIME BLOCKED BY 00 |
| 05 | Добавь тренировку | OS → TRAINING_ADD | TRAINING_PLAN/SESSIONS/SETS | factual session/set write | STATIC PASS / RUNTIME BLOCKED BY 00 |
| 06 | Обнови статус подготовки | OS → PREP_STATUS | training + metrics + plans + decisions | none by default | STATIC PASS / RUNTIME BLOCKED BY 00 |
| 07 | Сформируй Weekly Report | OS → WEEKLY_BUILD | closed period facts + exact Weekly artifact | DRAFT/update | STATIC PASS / RUNTIME BLOCKED BY 00 |
| 08 | Подготовь публикацию | OS → PUBLICATION_PREPARE | CONTENT_QUEUE + DATA_EVENTS + decisions | package/draft only | STATIC PASS / RUNTIME BLOCKED BY 00 |
| 09 | Опубликуй | OS → resolve exact object → publication pipeline | exact approved current preview + CONTENT_QUEUE | external publish + writeback | STATIC PASS / RUNTIME BLOCKED BY 00 |
| 10 | Что требует моего решения? | OS → OWNER_DECISIONS | domain blockers/gates | none | STATIC PASS / RUNTIME BLOCKED BY 00 |

## Runtime activation attempt — 2026-08-31

Owner confirmed that `rform-operating-system v1.1.5` was uploaded in ChatGPT.

Verification in the conversation that was already open before/while the upload completed produced the following result:

- installed-skill listing did not expose `rform-operating-system`;
- direct reads of likely Skill URIs did not resolve;
- plugin dependency lookup did not resolve it as a public plugin (expected for a personal Skill);
- therefore no acceptance command was allowed to mutate canonical R/Form data from this conversation.

Interpretation: the package upload is confirmed by the owner, but this already-open conversation has not refreshed to a runtime in which the personal Skill is discoverable. This is a runtime refresh gate, not a reason to create a second router or execute the source contract manually.

### Required next runtime action

Start a fresh ChatGPT conversation on the same surface/account where the Skill was uploaded and invoke an R/Form command. The first gate is to verify that the installed Skill is actually selected/used in that fresh runtime.

Once test 00 passes, execute tests 01–10 through the installed Skill. At least one state-changing test must complete canonical WRITE → READBACK before any merge to `main`.

## Fresh-chat Gate 00 recheck — 2026-08-31

The owner started a fresh conversation and explicitly requested continuation of runtime acceptance from Gate 00.

Observed runtime result:

- the current installed-skill catalog still does not expose `rform-operating-system`;
- a direct read of `skills://plugins/rform-operating-system/rform-operating-system/skill.md` failed internally;
- a direct read of `skills://plugins/rform-operating-system/skill.md` was rejected as an invalid Skill URI;
- GitHub confirms the canonical v1.1.5 source remains present on `agent/rform-skill-content-v1.1.3`;
- branch head before this documentation update was `880e38df74e7f96dfde11720e8170c84fcf18084`, with CI success;
- no acceptance command 01–10 was executed and no canonical R/Form business data was mutated.

Interpretation: Gate 00 remains a ChatGPT runtime installation/discovery blocker even after a fresh-chat refresh. Do not bypass the gate by manually executing the GitHub Skill contract, and do not create a second router.

### Gate 00 next action

Resolve why the uploaded personal Skill is not exposed as a readable/callable installed Skill in the target ChatGPT runtime. After it becomes discoverable, rerun Gate 00 first; only then proceed to tests 01–10.

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
