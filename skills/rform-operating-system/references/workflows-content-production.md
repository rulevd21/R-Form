# Content Production Workflows

This module turns the installed R/Form Skill into the orchestration layer for channel production while preserving the existing R/Form architecture.

## Objective

Reduce routine owner work to one decision whenever possible. The system should discover the relevant source event or calendar commitment, decide whether publication is justified, select one best candidate, prepare the complete publication package, run QA, and present an exact owner preview. External publication remains behind the existing approval/publication gate.

The module does **not** create a second datastore, content queue, scheduler, Telegram sender, or AI-provider pipeline.

## Canonical content sources

Use in this order for content work:

1. `RFORM_MASTER_DATA_v1 / CONTENT_QUEUE` — exact production editorial/publication state.
2. `RFORM_MASTER_DATA_v1 / DATA_EVENTS` — source events, coverage, aggregation, owner action.
3. `RFORM_MASTER_DATA_v1 / DECISIONS` — active training/nutrition/content/process decisions that determine current meaning.
4. `RFORM_MASTER_DATA_v1 / CONTENT_REGISTRY`, `CONTENT_EXPERIMENTS`, action logs and QA where relevant.
5. Current Content Calendar / Content Plan — commitments, slots, conditional/hold rules. It is a management view, not a second master.
6. `RFORM_HANDBOOK_CURRENT`, `RFORM_OPERATING_ADDENDUM_ACTIVE`, `RFORM_SYSTEM_PORTFOLIO_CURRENT` — brand, editorial and operating rules.
7. Recent published posts / publication history — duplication, continuity and first-touch context.
8. Post analytics — only when enough comparable evidence exists.

Do not choose a post from chat memory when these sources are available.

When `DATA_EVENTS` already contains a current event disposition (`AGGREGATE_TO_WEEKLY`, candidate Content_ID, owner action, manual gate, editorial trigger, or score), treat that disposition as canonical event-routing evidence. Do not recompute a raw event score merely to override an existing current status. `Content_Value_Score` may help rank discretionary events, but it does not override explicit `AGGREGATE_TO_WEEKLY`, `HOLD`, owner gates, or mandatory series/Weekly commitments.

## Internal pipeline

For content-production intents use:

`TRIGGER → SNAPSHOT → COVERAGE CHECK → EDITORIAL GATE → PRIORITY → PACKAGE → FACT QA → EDITORIAL QA → VISUAL QA → PREVIEW → OWNER GATE → CURRENT PIPELINE → WRITEBACK → ANALYTICS`

### Snapshot

Build a bounded current snapshot before deciding:

- current date;
- active/overdue Content Calendar commitments;
- active `CONTENT_QUEUE` candidates and exact statuses;
- latest `DATA_EVENTS`;
- published history since the last relevant series/weekly point;
- active decisions that change interpretation;
- current product/lead-magnet CTA;
- current blockers/QA;
- latest analytics only if the current decision actually depends on them.

Do not scan or summarize historical noise unless it changes the current choice.

## Editorial Gate

The gate answers: **is a standalone publication justified now?**

### Hard exclusion

Exclude from active recommendation if any of the following is true:

- already `PUBLISHED`;
- explicitly `SUPERSEDED`, archived, duplicate, or covered by a newer aggregate;
- `Public_Data_Allowed != YES` for a public asset;
- source/proof is missing or materially stale;
- content conflicts with a newer active decision;
- calendar status is `HOLD` and the owner did not override it;
- an owner-gated competition/result asset lacks the required real event/owner fact;
- preview/review state is stale after substantive text/visual changes;
- a routine training/nutrition/AI_CHECK event has no meaningful editorial trigger and is better used as Weekly input;
- current `DATA_EVENTS.Status=AGGREGATE_TO_WEEKLY` (or equivalent) and no newer owner decision/fact reopens it as standalone content.

### Always-valid editorial classes when their data is ready

These do not require an additional event score:

- explicit series commitment;
- `WEEKLY_CONTROL`;
- owner-approved calendar commitment;
- required onboarding/season-close asset after its prerequisites are satisfied.

### Meaningful standalone triggers

For discretionary event-driven posts, use existing trigger/status semantics when available. Typical valid signals include:

- material decision changed;
- control point materially changes interpretation;
- counterintuitive result with reader value;
- series milestone;
- audience-learning or product-bridge moment;
- actual error/QA case that teaches a transferable rule;
- competition/taper decision after required owner gate.

A completed workout by itself is not a sufficient trigger.

### `NO_POST` is a correct outcome

If no eligible candidate creates enough independent reader value, return `Сегодня отдельная публикация не нужна` and state where the event goes instead (for example Weekly input). Do not generate filler.

## Priority ordering

After exclusions, rank eligible material deterministically. Do not return a brainstorm list when one clear recommendation exists.

Priority order:

1. overdue/current **series commitment** or mandatory `WEEKLY_CONTROL`;
2. explicit owner/calendar commitment due now;
3. fresh decision/control event whose value decays quickly;
4. product bridge needed to complete the current reader journey;
5. other discretionary proof/help assets.

Tie-breakers, in order:

1. stronger current proof;
2. clearer `Audience_Problem → Reader_Value / Reader Capability`;
3. less duplication with recent posts;
4. stronger continuity with the current series/season;
5. CTA readiness;
6. lower production cost when reader value is otherwise equivalent.

Do not use novelty alone as a priority signal.

## `CONTENT_TODAY_RECOMMEND` — Что публикуем сегодня?

1. Build the current snapshot.
2. Reconcile `CONTENT_QUEUE`, `DATA_EVENTS`, current calendar and publication history.
3. Apply Editorial Gate.
4. Rank eligible candidates.
5. Return exactly one recommended candidate, or `NO_POST`.
6. Explain briefly:
   - why now;
   - why the nearest alternatives are not selected;
   - exact owner action.
7. Do not change publication state merely by recommending.

Default response should fit on one screen.

## `CONTENT_QUEUE_REFRESH` — Обнови контент-очередь

1. Reconcile current queue with:
   - published history;
   - source events;
   - Weekly coverage;
   - newer active decisions;
   - current calendar commitments.
2. Classify current items into:
   - `RECOMMENDED_NOW`;
   - `READY_LATER`;
   - `WAITING_INPUT`;
   - `HOLD`;
   - `SUPERSEDED/COVERED`;
   - `PUBLISHED`.
3. Preserve exact `CONTENT_QUEUE` fields in storage/user response. The categories above are management labels only.
4. Non-destructively hold/supersede an item only when the reason is deterministic and current intent authorizes queue refresh; preserve history.
5. Never auto-approve, schedule or publish.
6. Return one current recommendation plus only material blockers/owner decisions.

## `PUBLICATION_PREPARE` — Подготовь публикацию

Upgrade the standard publication-preparation workflow into a full production package.

1. If the command does not name an exact object, run `CONTENT_TODAY_RECOMMEND` internally and select the top eligible candidate.
2. Resolve exact `Content_ID` and current production states.
3. Build a **Source Snapshot** with exact fact IDs/period/decision IDs and publication-history checks.
4. Build/update the **Editorial Brief**:
   - Audience Problem;
   - reader capability/value;
   - content function/funnel role;
   - one core thesis;
   - `PLAN → FACT → DECISION` where applicable;
   - human tension only when factually supported;
   - one CTA;
   - explicit statement of what the post must not claim.
5. Produce/update **Telegram Text** in current R/Form Tone of Voice.
   - If the final text differs materially from canonical `Telegram_Text`, `Подготовь публикацию` must either (a) write the exact new text into the canonical content object under the predefined non-destructive preparation workflow, invalidate stale preview/review semantics, and verify by readback, or (b) label it explicitly `ПРЕДЛОЖЕНИЕ / НЕ ЗАПИСАНО` and do not describe the canonical object as updated/prepared with that text.
   - Never show a rewritten local text and then report canonical `READY FOR REVIEW` as if that rewrite had been persisted.
6. Determine **Visual Requirement**:
   - `NOT_REQUIRED`; or
   - existing approved visual; or
   - deterministic visual payload/brief.
7. Run all QA gates below.
8. Build exact Telegram preview structure from `Telegram_Post_Mode` and current text/visual payload.
9. If this invocation changes text or visual content, invalidate stale preview/review semantics according to the current Content Control contract and require a fresh preview review.
10. Read back any write.
11. Never schedule or publish.

### Publication package output

A complete package contains, when applicable:

- `Content_ID`;
- canonical statuses;
- source/proof snapshot;
- why-now rationale;
- final Telegram text;
- visual status and visual payload/card structure;
- exact Telegram preview;
- QA result;
- one owner action.

Do not make the owner inspect internal work packets unless a blocker requires it.

Preview/output sanitation: do not leak renderer labels, MIME hints, code-fence language tags, or orphan tokens such as `svg`, `png`, `html`, or `json` into the user-facing publication preview unless they are intentionally part of the post.

### TEXT_ONLY preview routing guard

When `Telegram_Post_Mode=TEXT_ONLY` and `Visual_Status=NOT_REQUIRED`:

1. Do not invoke image, visual, renderer, SVG, HTML, canvas, diagram, artifact, file-preview, media-generation, or writing-block output surfaces for the full post body in ChatGPT.
2. Treat canonical `Telegram_Text` as stored publication payload. Verify it against `CONTENT_QUEUE` / production packet but do not reproduce the whole payload inline.
3. `Подготовь публикацию` returns only:
   - exact `Content_ID`;
   - exact canonical statuses;
   - text/visual QA result;
   - exact preview/review state;
   - canonical Text_URL / Work_Packet_URL when available;
   - one owner action.
4. The canonical final preview must be reviewed in the existing Channel Control / Owner Bot interface, which owns Telegram structure, review hash and approval flow.
5. If that preview surface is callable, hand off the exact Content_ID/version there. If it is not callable, return the canonical preview location and current review state.
6. Do not fabricate a second ChatGPT preview. Do not print the full Telegram post body merely to simulate Channel Control.
7. `Покажи предпросмотр` means locate/open/hand off the canonical preview surface, not re-render the post inside ChatGPT.
8. Any ChatGPT response containing a standalone renderer token such as `svg` is evidence that the routing guard was bypassed and is a test failure.

This guard overrides generic artifact/writing behavior because the publication artifact already exists canonically outside ChatGPT; the task is orchestration, not drafting.

## Visual production contract

### Default

Use the current R/Form visual system and existing deterministic assets/templates. Data cards must be exact and readable; do not use approximate generated typography for numeric report cards.

### Preferred structures

- Simple methodology/author/decision post: `NOT_REQUIRED` or 1 card only when the card adds value.
- Training/control proof: 1–2 cards.
- Complex `WEEKLY_CONTROL`: default 3-card package when supported by the current visual pipeline:
  1. management conclusion / human tension + headline;
  2. plan → fact / key data;
  3. decision / next checkpoint / what is deliberately unchanged.

A different card count is allowed when the existing approved template requires it.

### Caption rule

The Telegram text must add context, interpretation, reader meaning, and decision. It must not simply repeat card text.

### Visual timing

Lock factual data and editorial thesis first. Create/render the visual only after the content facts are stable.

## QA gates

### FACT QA

PASS only if:

- dates/IDs/weights/RIR/KБЖУ/decision wording match Source of Truth;
- no superseded decision is presented as active;
- no unpublished outcome is assumed;
- public-data policy is satisfied;
- source confidence/uncertainty is not overstated.

### EDITORIAL QA

PASS only if:

- there is a reader problem/situation, not only an author event;
- the post contains transferable reader value/capability;
- facts support the interpretation;
- the decision is explicit;
- R/Form role is clear without requiring full season history;
- no guru/hero positioning, pseudo-science, or performance promise;
- emotional layer supports rather than replaces facts;
- CTA is specific and consistent with current product/series.

### DUPLICATION QA

PASS only if:

- the material is not already published;
- not covered by a newer Weekly/aggregate;
- not a duplicate of recent methodology/series post;
- caption and visual are complementary rather than repetitive.

### VISUAL QA

If visual is required:

- current brand/template used;
- exact card count/active assets match the intended Telegram mode;
- readable at Telegram size;
- numeric text is deterministic and verified;
- no obsolete/superseded image remains active;
- visual version is the same version being previewed.

### PREVIEW QA

Simulate the current Telegram transport rules. If the production pipeline has an exact preview/hash contract, use it. A changed text/visual payload invalidates the prior review.

## `PUBLICATION_PREVIEW` — Покажи предпросмотр

1. Resolve the exact current candidate/version.
2. Re-read canonical text/visual fields.
3. Verify preview hash/review freshness if those fields exist.
4. Use the existing Channel Control / Owner Bot exact Telegram preview as the canonical preview surface.
5. If that surface is callable, hand off/open the exact candidate there.
6. If it is not callable, return the canonical preview location (Text_URL / Work_Packet_URL / current owner-preview state) and do not inline-render the full post in ChatGPT.
7. Do not approve/schedule/publish.

## `PUBLICATION_EDIT` — Измени публикацию: ...

1. Resolve exact active candidate.
2. Apply only the requested editorial change.
3. Preserve source facts and existing Content_ID.
4. Re-run Fact/Editorial/Duplication QA.
5. If Telegram text/visual payload changed, invalidate stale preview/review lock according to the current Content Control contract.
6. Read back.
7. Return updated preview and one next action.
8. Never publish.

## `PUBLICATION_APPROVE` — Утверждаю публикацию

This is approval of the exact current preview, **not** generic permission to change other material.

1. Resolve exactly one current candidate and exact preview/version/hash.
2. Reject if ambiguous, stale, changed since preview, superseded, or blocked.
3. Use the existing R/Form owner/Content Control approval path when it is callable. Do not bypass a stronger canonical approval API with an ad-hoc sheet write.
4. Approval alone does not imply an invented schedule.
5. If the current owner flow requires Telegram Owner Bot for final preview/approval, prepare/hand off the exact candidate there and report that state rather than simulating a completed approval.
6. Never claim approval succeeded without readback from canonical state.

## `PUBLICATION_APPROVE_SCHEDULE` — Утверждаю на <date/time>

1. Resolve exact material + exact current preview.
2. Treat the named date/time as owner authorization for approval + schedule of that exact material.
3. Use current Channel Control/owner pipeline.
4. Require fresh preview verification/hash when current pipeline requires it.
5. Read back `Approval_Status`, `Publication_Status`, `Publish_At`, `AutoPost_Allowed` and review state.
6. Do not publish immediately unless the user explicitly requested immediate publication.

## `CONTENT_OWNER_DECISIONS` — Что требует моего решения?

For content context, return at most three owner decisions, ordered by impact/time sensitivity.

Do not show routine system actions that the Skill can do itself. Typical owner decisions:

- approve/change/hold exact current preview;
- explicit competition/result wording gate;
- new series/commercial promise/strategy change;
- blocker that cannot be resolved from sources.

If nothing material needs the owner, say so.

Do not surface deterministic queue housekeeping as an owner decision when the Skill can resolve it under the normal queue-refresh contract. Examples: an obsolete HOLD asset whose function is clearly covered by newer published material, stale covered source events, or routine archival/supersede classification that preserves history. If a transition is not yet authorized in the current intent, report it as `системная очистка очереди`, not as a decision the owner must make.

When an owner decision really is required, name the exact canonical object and exact proposed state transition. Do not use vague combined labels such as `SUPERSEDED / ARCHIVE` unless those are the actual canonical field values to be written. Resolve the valid transition first.

## `CONTENT_WEEK_PLAN` — Сформируй контент-план недели

1. Resolve the target week.
2. Read current calendar commitments, training/competition checkpoints, product moments, recent publications and active series.
3. Preserve mandatory Weekly/series obligations.
4. Treat discretionary training/nutrition events as conditional slots, not guaranteed posts.
5. Produce a DRAFT plan with:
   - date/window;
   - candidate/slot;
   - trigger/prerequisite;
   - audience problem;
   - reader capability/value;
   - format;
   - CTA;
   - owner gate if any.
6. Do not create a second state machine. If writing to current Content Calendar, preserve its role as a management view and keep `CONTENT_QUEUE` canonical for publication state.
7. Do not schedule/publish.

## `CONTENT_PERFORMANCE_REVIEW` — Как отработал контент?

1. Reconcile published Content_IDs with current `POST_ANALYTICS`.
2. Use only available metrics; never fabricate Telegram metrics that bots cannot access.
3. Compare only comparable checkpoints/asset classes when possible.
4. Respect current analytics rule: do not promote a weak baseline into a strategic change without enough comparable observations.
5. Separate:
   - observed fact;
   - interpretation;
   - confidence;
   - recommended experiment/decision.
6. Analytics recommendations go to backlog/review, not directly into future calendar slots unless the user explicitly approves that strategy change.

## Publication transport boundary

The Skill never becomes a second Telegram sender.

External publication continues through the current R/Form owner/Content Control → Telegram Autopost pipeline. Exactly-once transport, Telegram IDs/URLs, publish errors and post-publication writeback remain responsibilities of that current pipeline.
