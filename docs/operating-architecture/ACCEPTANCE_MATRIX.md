# R/Form Operating Architecture Acceptance Matrix

Status date: 2026-09-02.

This matrix distinguishes static architecture validation from runtime E2E validation. Do not mark runtime PASS until the actual installed R/Form Operating System routes the command and canonical readback verifies the result.

| Test | Command | Expected route | Expected canonical data/state | State change | Current result |
|---|---|---|---|---|---|
| 00 | Runtime discoverability | installed Skill → runtime catalog | `rform-operating-system` readable/callable | none | **RUNTIME PASS — fresh runtime exposed, loaded and invoked `rform-operating-system` (2026-08-31)** |
| 01 | Открой день | OS → DAY_OPEN → day/nutrition | DAILY + active plan + ingest path | create/reuse OPEN day | **RUNTIME PASS — reused `D-20260831` in `OPEN`; no duplicate (2026-08-31)** |
| 02 | Добавь еду | OS → MEAL_ADD → nutrition | NUTRITION_RAW → NUTRITION_DAILY | meal write + aggregate | **RUNTIME PASS — actual meal `F-20260831-000457` written and aggregates read back (2026-08-31)** |
| 03 | Сколько осталось КБЖУ? | OS → NUTRITION_REMAINING | ACTIVE_PLANS + NUTRITION_DAILY | none | **RUNTIME PASS — read current `TRAINING_A` plan and `D-20260831` aggregate; returned remaining macros (2026-08-31)** |
| 04 | Закрой день | OS → DAY_CLOSE | DAY_CLOSURE + DAILY/NUTRITION/training checks | valid closure | **RUNTIME BLOCKED — safe preflight: `D-20260831` is OPEN; `TRAINING_A` session and `DAY_CLOSURE` record are missing (2026-08-31)** |
| 05 | Добавь тренировку | OS → TRAINING_ADD | TRAINING_PLAN/SESSIONS/SETS | factual session/set write | **RUNTIME PASS — closed factual session S-20260831-A with 13 unique sets read back; rerun reused it without a duplicate (2026-09-01)** |
| 06 | Обнови статус подготовки | OS → PREP_STATUS | training + metrics + plans + decisions | none by default | **RUNTIME PASS — current taper, training, recovery, bodyweight and nutrition decision read; deterministic B-session fallback reported without write (2026-09-01)** |
| 07 | Сформируй Weekly Report | OS → WEEKLY_BUILD | closed period facts + exact Weekly artifact | DRAFT/update | **RUNTIME PASS — verified and reused current W35 Weekly artifact; source coverage and non-blocking caveat read back, no duplicate version created (2026-09-01)** |
| 08 | Подготовь публикацию | OS → PUBLICATION_PREPARE | CONTENT_QUEUE + DATA_EVENTS + decisions | package/draft only | **RUNTIME PASS — selected and verified existing Series 06 TEXT_ONLY package; owner-preview handoff preserved, no duplicate or publication (2026-09-01)** |
| 09 | Опубликуй | OS → resolve exact object → publication pipeline | exact approved current preview + CONTENT_QUEUE | external publish + writeback | **RUNTIME BLOCKED — `CNT-20260821-SERIES-06-DIARIES` is not approved and its canonical preview is not reviewed; no Telegram handoff (2026-09-02)** |
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

## Gate 04 runtime preflight — 2026-08-31

The installed Skill routed the close-day request to the canonical closure checks and did not mutate business state. The preconditions for `D-20260831` are not complete:

- `DAILY.Day_Status=OPEN` and `NUTRITION_DAILY.Status=ACTIVE`;
- nutrition has three recorded meals and complete numeric totals;
- the required `TRAINING_A` session is missing from `TRAINING_SESSIONS`;
- no `DAY_CLOSURE` gateway record exists;
- no open QA or duplicate record was found for the day.

Result: Gate 04 is correctly blocked, not passed. Re-run it after the real training is recorded, the day is ready for closure and the gateway completes WRITE → READBACK.

## Gate 05 runtime PASS — 2026-09-01

The installed Skill routed the factual Training A record through the training domain and resolved the canonical session before any write. Duplicate-safe reuse was required because the factual record had already been persisted.

- `TRAINING_SESSIONS.S-20260831-A` is `CLOSED`, duration 60 min, technique 10/10 and pain after 0/10;
- exactly 13 `TRAINING_SETS` rows reference that session, including 7 warm-up sets, 107.5×1 at RIR 0, 92.5×2×2, row 70×8×2 and rope extension 40×10;
- session and set duplicate flags are empty;
- `QA_LOG` retains an `OPEN` warning for the earlier warm-up attempt with missing RIR, while the record itself documents successful server validation and idempotent write. It is an audit trace, not a blocker for the already closed and fully read-back session;
- no new session or set was created during the rerun; `main` was not changed.

Interpretation: Gate 05 satisfies the runtime route, canonical record, and readback checks by safely reusing the persisted factual training session rather than creating a duplicate.
## Gate 06 runtime PASS — 2026-09-01

The installed Skill routed `Обнови статус подготовки` to `PREP_STATUS` and read the canonical training, bodyweight, nutrition-plan and decision sources. The command is analytical; it did not create or alter a training plan, decision, nutrition target or production state.

- Preparation block: `PEAK_2026-08-16_2026-09-11`; the active decision `DEC-20260830-TRAINING-WEEK-31-06` sets the 31.08–04.09 taper.
- Training — `WATCH`: `S-20260831-A` is closed with 107.5×1 at RIR 0, although the taper rule caps the single at RPE 8.5. The already recorded conditional plan therefore selects 82.5×3×3, rather than 85×3×3, for B on 02.09; no extra work or load increase.
- Recovery/technique — `ON TRACK`: before A, sleep 8.5 h, readiness 10/10 and pain 0/10; the closed session records bench technique 10/10 and pain after 0/10.
- Bodyweight — `WATCH`: the latest seven-day average is 73.12 kg on 31.08, below the next staged corridor of 73.8–74.1 kg for 06.09 in `DEC-20260816-NUTRITION-74_5`. The next checkpoint, rather than the final target, was used; no change is justified before that checkpoint.
- Nutrition — `ON TRACK`: the active peak plan remains in force (REST 3350 kcal on 01.09; B 3450 kcal on 02.09). The open day is incomplete, so it was not treated as a closed-day compliance verdict.
- Data QA: the existing open warning for the first warm-up set's missing RIR is disclosed; it does not invalidate the closed 13-set session.
- `main` was not changed.

Interpretation: Gate 06 completed a current, evidence-based preparation-status read without inventing a plan revision or decision.
## Gate 07 runtime PASS — 2026-09-01

The installed Skill routed `Сформируй Weekly Report` to `WEEKLY_BUILD` and resolved the exact reporting period as 23–29.08.2026. It found a newer, approved/published artifact and correctly reused it rather than creating a stale duplicate draft.

- exact artifact: `2026-W35_TG_WEEKLY-CONTROL_20260823-20260829_v03_OWNER-APPROVED`; canonical `Content_ID=AUTO-WEEKLY-20260830`, `Task_ID=RFORM-WEEKLY-20260830-001`;
- `CONTENT_QUEUE` readback: training and nutrition `CLOSED`; text, visual and owner approval `APPROVED`; publication `PUBLISHED` as Telegram post 68;
- all seven period days have `DAY_CLOSURE.Close_Readiness=READY`; closed training sessions are `S-20260824-A` (12 sets), `S-20260826-B` (14) and `S-20260828-C` (11), with zero duplicate and zero open-QA counts in their closure records;
- the one relevant QA item (`QA-20260830-112402-D29-WEIGHT`) is an `IN_REVIEW` source mismatch for 29.08 average weight. The existing Weekly transparently uses 73.35 kg across six available morning measurements, not a claimed complete 7-day average; publication is explicitly non-blocked;
- no Weekly DRAFT, content version, decision or publication was created or changed during this rerun; `main` was not changed.

Interpretation: Gate 07 passed the reporting-period, source-coverage, existing-artifact, QA and duplicate-protection checks. The appropriate end-to-end result for an already published weekly object is verified reuse, not a second report.
## Gate 08 runtime PASS — 2026-09-01

The installed Skill routed `Подготовь публикацию` to `PUBLICATION_PREPARE`, reconciled the current queue, calendar, events, published history and QA, and selected one canonical eligible object.

- selected existing material: `CNT-20260821-SERIES-06-DIARIES` (`RFORM-SERIES-20260821-006`), an unmet series commitment for the `BUSY_MAN` product bridge;
- canonical package readback: `Text_Status=READY`, `Visual_Status=NOT_REQUIRED`, `Approval_Status=NOT_READY`, `Publication_Status=PLANNED`, `Current_Stage=CHANNEL_CONTROL_REVIEW`, `Preview_Review_Status=NOT_REVIEWED`, `AutoPost_Allowed=NO` and no blocking issue;
- Fact, editorial and duplication QA pass. No `CONTENT_REGISTRY` row exists for this Content_ID, so it has not been published; no content-specific QA issue was found;
- the new 31.08 training event is explicitly `AGGREGATE_TO_WEEKLY`, so it was excluded from standalone publication. W35 Weekly is already published, and the 01.09 START HERE calendar item is `HOLD`;
- because the candidate is `TEXT_ONLY` with visual `NOT_REQUIRED`, the final preview is correctly routed to existing Channel Control / Owner Bot; no full Telegram text was rendered in ChatGPT and no approval, schedule or publication was simulated;
- the already-prepared canonical package was reused without changing text, visual, preview state or production fields; `main` was not changed.

Interpretation: Gate 08 passed current candidate selection, source/coverage validation, package QA and canonical preview routing. The exact next owner action remains review/approval of this existing Content_ID in Channel Control.
## Gate 09 runtime publication gate — 2026-09-02

The installed Skill routed the acceptance example `Опубликуй CNT-20260821-SERIES-06-DIARIES` to the exact content-publication workflow and re-read the canonical production state before any transport action.

- exact selected existing object: `CNT-20260821-SERIES-06-DIARIES` (`RFORM-SERIES-20260821-006`), public data allowed, `TEXT_ONLY`, visual `NOT_REQUIRED`;
- canonical queue readback: `Text_Status=READY`, `Approval_Status=NOT_READY`, `Publication_Status=PLANNED`, `Current_Stage=CHANNEL_CONTROL_REVIEW`, `Preview_Review_Status=NOT_REVIEWED` and `AutoPost_Allowed=NO`;
- `CONTENT_REGISTRY` contains no row for this Content_ID, and `QA_LOG` contains no content-specific issue; it is neither published nor resolved by a new blocker;
- publication requires the exact current preview to be reviewed and approved. Those conditions are not met, so the Skill correctly did not hand the object to Telegram Autopost, alter `CONTENT_QUEUE`, or report a publication;
- no canonical business data, Telegram transport, deployment or `main` change occurred.

Interpretation: Gate 09 validates the runtime publication permission gate by safely blocking an explicit publication command for an unreviewed, unapproved object. Re-run only after the exact current Channel Control preview has been reviewed and approved through the existing owner flow.

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
