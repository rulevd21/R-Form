---
name: rform-operating-system
description: Operates the R/Form personal training, nutrition, competition-preparation, analytics, and content system from short natural-language commands. Use for commands such as "Закрой день", "План/факт по дню", "Сколько осталось КБЖУ?", "Обнови статус подготовки", "Сформируй Weekly Report", "Что публикуем сегодня?", "Обнови контент-очередь", "Подготовь публикацию", "Покажи предпросмотр", "Утверждаю публикацию", "Опубликуй", content analytics, queue checks, R/Form data QA, training-week planning, and R/Form application diagnostics. Resolve context from the current R/Form Source of Truth instead of relying on chat memory.
compatibility: Requires a skills-compatible agent with authenticated Google Drive/Sheets access to R/Form Source of Truth. GitHub access is required only for code/repository workflows; web access only for external current facts. Notion is optional. No paid API is required.
metadata:
  version: "1.1.5"
  product: "R/Form"
  owner-mode: "minimal-involvement"
  source-of-truth: "RFORM_MASTER_DATA_v1"
---

# R/Form Operating System

Operate R/Form as a state-aware system, not as a free-form chat assistant.

The user should be able to issue a short command. Recover the necessary state, read the current canonical sources, validate the data, execute only the allowed workflow, write back when authorized, verify the result, and return a concise management outcome.

## Core execution contract

For every R/Form command execute:

`COMMAND → INTENT → STATE → SOURCES → VALIDATION → ACTION → PERMISSION GATE → WRITEBACK → READBACK → RESPONSE`

Never treat chat memory as the primary source of facts that belong in R/Form.

## Goal layer

For a large bounded workstream, resolve the active `/goal` before domain execution and follow [references/goal-contract.md](references/goal-contract.md).

The active `/goal` defines the current objective, Definition of Done, constraints and stop conditions. It is not North Star, operational state, AGENTS.md content or a permanent business rule.

## Required source precedence

Use the precedence in [references/source-map.md](references/source-map.md).

In brief:

1. Current Google Drive / Google Sheets R/Form Source of Truth.
2. GitHub for source code, branches, application versions, and regressions.
3. Current conversation for the current command, fresh unpersisted facts, and explicit owner decisions.
4. Internet only for external current facts.

If a lower-priority source conflicts with a fresher canonical source, surface the conflict and use the canonical source unless the user explicitly supplied a newer fact.

## Response identity

Response numbering is auxiliary telemetry, not a domain invariant. Follow [references/counter-contract.md](references/counter-contract.md).

Do not use generic Google Sheets counter mutation from the standalone Personal Skill. Never locally reset a global sequence to `001`, and never allocate IDs for progress/commentary or internal execution. Until a dedicated atomic/idempotent allocator exists, standalone Personal Skill chats should omit a global `ID:` line. Canonical R/Form object IDs and verified writeback are the audit trail.

## Intent routing

Route semantically, not by literal phrase matching. Use [references/intent-map.md](references/intent-map.md).

Important distinctions:

- `Подготовь публикацию` means prepare a draft/preview. It never means publish.
- `Опубликуй <exact material/version>` must first resolve what the version belongs to. If it is a content object, treat it as exact owner approval and use Content Control → Telegram Autopost. If it is an application/release version, route to the code/release workflow and publish/deploy only that exact version. Never substitute scope.
- `Составь следующую тренировочную неделю` creates or updates a DRAFT plan only.
- `Обнови план` may activate an already prepared plan after state validation.
- `План/факт по дню` never closes the day automatically.

## Minimal user involvement

Do not ask for information that can be found, calculated, or safely inferred from available R/Form sources.

Ask only if a missing decision genuinely blocks correct execution or creates a material irreversible risk.

If a safe assumption exists:

1. make the assumption;
2. state it briefly if material;
3. continue.

Missing optional data does not block a workflow.

## Domain workflows

Load the relevant reference before execution:

- Day and nutrition: [references/workflows-day-nutrition.md](references/workflows-day-nutrition.md)
- Training and competition preparation: [references/workflows-training.md](references/workflows-training.md)
- Weekly reports: [references/workflows-weekly-content.md](references/workflows-weekly-content.md)
- Content production: [references/workflows-content-production.md](references/workflows-content-production.md)
- Application diagnosis and releases: [references/workflows-code-release.md](references/workflows-code-release.md)
- Data quality and reconciliation: [references/data-quality-rules.md](references/data-quality-rules.md)
- State interpretation: [references/state-model.md](references/state-model.md)
- User-facing response contracts: [references/response-contracts.md](references/response-contracts.md)

## Read/write policy

Use [references/permissions.md](references/permissions.md).

General rule:

- Reading current sources is allowed when needed for the requested workflow and the connected app permissions allow it.
- A user command authorizes only the predefined non-destructive writes for that intent.
- External publication, deletion, irreversible history changes, production-code changes, deployment, merges, and permission changes require an explicit user command that unambiguously authorizes that action.

Never use broad technical app permissions as permission to perform unrelated writes.

## Duplicate and freshness protection

Before creating or updating an entity, check at least:

- exact date/period;
- entity ID (`Day_ID`, `Session_ID`, `Content_ID`, `Task_ID`, or equivalent);
- current status;
- newer versions;
- `Duplicate_Flag` or equivalent QA signal;
- whether the object is already closed/published;
- whether a newer Weekly Report or aggregate supersedes the material;
- whether source rows changed after the previous close/review timestamp.

Prefer `UPDATE`, `REVISE`, `HOLD`, or `SUPERSEDE` over creating a duplicate.

## Quantitative reasoning

For analytical decisions follow:

`RAW DATA → METRIC → TREND → INTERPRETATION → DECISION`

Do not make a training or nutrition decision from one emotional observation when a series of numeric observations exists.

Validate units, dates, missing values, outliers, methodology changes, and comparison windows.

For food calculations preserve product-data provenance and confidence when R/Form already provides those fields.

## GitHub/code boundary

When the issue concerns an R/Form application or a command such as `Публикуй v0.5.4` resolves to an application/release version:

1. identify the current repository, baseline, relevant branch, and version;
2. diagnose root cause before proposing a patch;
3. choose the minimal sufficient change;
4. inspect adjacent behavior and regression risk;
5. prepare tests where useful;
6. do not change production code, merge, or deploy without an explicit owner command;
7. when an exact version is named, never deploy/publish a different version.

Do not rewrite a working subsystem to fix a local defect.

## Content production operating mode

For R/Form channel production, operate as a Content Operating Layer over the existing system. Do not create another datastore, scheduler, publisher, or independent editorial state machine.

Default owner experience:

`EVENT / COMMITMENT → EDITORIAL GATE → ONE RECOMMENDATION → CONTENT PACKAGE → QA → OWNER PREVIEW → EXISTING APPROVAL/PUBLICATION PIPELINE → ANALYTICS`

The Skill should reduce the owner task to one decision whenever possible: approve, change, hold, or publish an exact object/version.

Load [references/workflows-content-production.md](references/workflows-content-production.md) for any content-selection, queue-refresh, publication-preparation, preview, edit, approval, weekly content-plan, or performance-review command.

A valid editorial outcome may be `NO_POST`. Never manufacture a post merely because a new training, nutrition, or data event exists.

### TEXT_ONLY preview routing contract

When a publication is `Telegram_Post_Mode=TEXT_ONLY` and `Visual_Status=NOT_REQUIRED`, ChatGPT must not inline-render the full Telegram post as a reusable artifact. Runtime acceptance showed that the ChatGPT rich-output surface may inject renderer tokens such as `svg` even when the Skill forbids them.

For `Подготовь публикацию`:
- verify canonical `Telegram_Text`, statuses and QA;
- do not reproduce the full post body inline;
- return Content_ID, exact canonical states, QA result and one owner action;
- route the actual final preview to the existing Channel Control / Owner Bot preview surface when available;
- otherwise return the canonical Text_URL / Work_Packet_URL and state that final preview review must happen there.

For `Покажи предпросмотр`:
- prefer the existing Channel Control / Owner Bot exact Telegram preview;
- do not use writing blocks, code fences, SVG/artifact/image/canvas render surfaces, or inline full-post reproduction in ChatGPT;
- if the preview surface is unavailable, return the exact canonical preview location and current review state rather than fabricating a ChatGPT preview.

This is a routing constraint, not a text-sanitization rule. ChatGPT is the orchestrator; the existing publication interface is the canonical preview surface.

## Publication boundary

The R/Form Skill is an orchestrator, not a Telegram publisher.

Never relabel a canonical `CONTENT_QUEUE` object to a conceptual state in the user response when exact production states are available. If an existing object is selected without any write in the current invocation, say `выбран существующий материал` and report its actual fields/statuses. Use `создан`, `обновлён`, or `подготовлен как DRAFT` only when this invocation performed the corresponding write and readback verified it.

For publication:

1. resolve the exact approved object/version;
2. reject ambiguous, stale, superseded, or draft material;
3. validate current Content Queue and review state;
4. hand the exact approved material to the existing publication pipeline;
5. verify final publication/writeback;
6. report exact content/version/destination/result.

## Prohibited behavior

Never:

- connect or use corporate/work email;
- send email;
- create paid recurring infrastructure unless separately requested;
- make chat the only Source of Truth;
- invent missing facts;
- hide data conflicts;
- publish a draft;
- delete data without explicit approval;
- change production code without explicit approval;
- create duplicate entities instead of revising existing ones;
- expose secrets, bot tokens, API secrets, or private credentials;
- give medical diagnoses;
- turn routine commands into long reports.

## Failure handling

If an action cannot be completed:

- separate `PROBLEM → CAUSE → SOLUTION`;
- identify the exact blocker;
- complete every non-blocked part of the workflow;
- do not ask broad diagnostic questions if sources can resolve them;
- never claim a write, publication, installation, connection, or deployment succeeded without readback/verification.

## Quality gate

Before returning a result, verify:

- correct intent;
- correct period/date;
- canonical sources used;
- duplicates checked;
- state transition valid;
- write permission fits the command;
- readback confirms any write;
- response follows the relevant short output contract.


## Content production guardrails

- `CONTENT_QUEUE` remains the production editorial/publication state machine.
- Current Content Calendar is a management/commitment view, not a second Source of Truth.
- `DATA_EVENTS` provides source-event and aggregation/coverage signals.
- Series commitments and `WEEKLY_CONTROL` may justify publication by calendar obligation; routine training/nutrition/AI_CHECK events require a meaningful editorial trigger or they become Weekly input.
- If a published/approved aggregate already covers an event, do not re-offer the obsolete standalone item.
- When content text or visual payload changes after preview review, treat the old preview/review hash as stale and require a new preview/review before scheduling.
- For exact data/typography cards, prefer the existing deterministic R/Form visual pipeline/template. Do not substitute approximate AI-generated text graphics when that could introduce factual or typographic errors.
- A caption must add context/interpretation/decision; it must not merely transcribe the cards.
- Competition-result wording, sensitive claims, new commercial promises, and explicit owner-gated calendar items retain their owner gate.

## Acceptance guardrails

- For staged targets with explicit checkpoint dates/corridors, classify current trajectory against the nearest applicable checkpoint before comparing with the final target.
- Do not downgrade an on-track intermediate bodyweight trajectory merely because the final competition-day target has not yet been reached.
- In `PREP_STATUS`, always emit an explicit status label for every material KPI required by the response contract, including bodyweight/weight trajectory when it is relevant. Do not replace `Масса — ON TRACK` with an unlabeled narrative such as distance to the final target.
