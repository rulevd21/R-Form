# R/Form Operating Architecture Acceptance Matrix

Status date: 2026-08-31.

This matrix distinguishes static architecture validation from runtime E2E validation. Do not mark runtime PASS until the actual installed R/Form Operating System routes the command and canonical readback verifies the result.

| Test | Command | Expected route | Expected canonical data/state | State change | Current result |
|---|---|---|---|---|---|
| 00 | Runtime discoverability | installed Skill → runtime catalog | `rform-operating-system` readable/callable | none | **RUNTIME PASS — fresh runtime exposed, loaded and invoked `rform-operating-system` (2026-08-31)** |
| 01 | Открой день | OS → DAY_OPEN → day/nutrition | DAILY + active plan + ingest path | create/reuse OPEN day | **RUNTIME PASS — reused `D-20260831` in `OPEN`; no duplicate (2026-08-31)** |
| 02 | Добавь еду | OS → MEAL_ADD → nutrition | NUTRITION_RAW → NUTRITION_DAILY | meal write + aggregate | **RUNTIME PASS — actual meal `F-20260831-000457` written and aggregates read back (2026-08-31)** |
| 03 | Сколько осталось КБЖУ? | OS → NUTRITION_REMAINING | ACTIVE_PLANS + NUTRITION_DAILY | none | **RUNTIME PASS — read current `TRAINING_A` plan and `D-20260831` aggregate; returned remaining macros (2026-08-31)** |
| 04 | Закрой день | OS → DAY_CLOSE | DAY_CLOSURE + DAILY/NUTRITION/training checks | valid closure | STATIC PASS / RUNTIME PENDING |
| 05 | Добавь тренировку | OS → TRAINING_ADD | TRAINING_PLAN/SESSIONS/SETS | factual session/set write | STATIC PASS / RUNTIME PENDING |
| 06 | Обнови статус подготовки | OS → PREP_STATUS | training + metrics + plans + decisions | none by default | STATIC PASS / RUNTIME PENDING |
| 07 | Сформируй Weekly Report | OS → WEEKLY_BUILD | closed period facts + exact Weekly artifact | DRAFT/update | STATIC PASS / RUNTIME PENDING |
| 08 | Подготовь публикацию | OS → PUBLICATION_PREPARE | CONTENT_QUEUE + DATA_EVENTS + decisions | package/draft only | STATIC PASS / RUNTIME PENDING |
| 09 | Опубликуй | OS → resolve exact object → publication pipeline | exact approved current preview + CONTENT_QUEUE | external publish + writeback | STATIC PASS / RUNTIME PENDING |
| 10 | Что требует моего решения? | OS → OWNER_DECISIONS | domain blockers/gates | none | STATIC PASS / RUNTIME PENDING |

## Runtime activation attempt — 2026-08-31

Owner confirmed that `rform-operating-system v1.1.5` was uploaded in ChatGPT.

Verification in the conversation that was already open before/while the upload completed produced the following result:

- installed-skill listing did not expose `rform-operating-system`;
- direct reads of likely Skill URIs did not resolve;
- plugin dependency lookup did not resolve it as a public plugin (expected for a personal Skill);
- therefore no acceptance command was allowed to mutate canonical R/Form data from this conversation.

Interpretation: the package upload is confirmed by the owner, but this already-open conversation had not refreshed to a runtime in which the personal Skill was discoverable. This was a runtime refresh gate, not a reason to create a second router or execute the source contract manually.

## Fresh-chat Gate 00 recheck — 2026-08-31

The owner started a fresh conversation and explicitly requested continuation of runtime acceptance from Gate 00.

Historical observation before the successful rerun:

- the then-current installed-skill catalog did not expose `rform-operating-system`;
- direct reads of likely personal-Skill URIs did not resolve;
- GitHub confirmed the canonical v1.1.5 source remained present on `agent/rform-skill-content-v1.1.3`;
- no acceptance command 01–10 was executed and no canonical R/Form business data was mutated.

## Gates 00, 01, 02 and 03 runtime PASS — 2026-08-31

Fresh runtime evidence:

- `rform-operating-system` is present in the installed-Skills catalog;
- the runtime loaded its `SKILL.md` (version `1.1.5`);
- the Skill was invoked for this acceptance workflow and followed its code-release and source-of-truth contracts;
- Gate 01 command `Открой день` resolved the canonical `DAILY` record `D-20260831` with `Day_Status=OPEN` and no duplicate;
- Gate 02 received the owner's actual lunch and wrote `F-20260831-000457` for `2026-08-31_M3` to `NUTRITION_RAW`; `NUTRITION_DAILY` and `DAILY` were recalculated and read back. The existing-breakfast duplicate guard had previously prevented a duplicate record;
- Gate 03 read `NUTRITION_DAILY` for `D-20260831` and the `TRAINING_A` plan. After M1, remaining target is 3025.636–3058.032 kcal, protein 145.13316–145.52992 g, fat 78.48692–78.60704 g and carbohydrates 424.58816–432.88992 g;
- no canonical business data, production deployment, Telegram transport, secrets, or permissions changed;
- `main` was not changed.

Interpretation: the discoverability blocker is cleared, read-only routing works, and the required canonical WRITE → READBACK evidence is complete. Gates 04–10 must use valid current objects and their respective permission gates.

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
