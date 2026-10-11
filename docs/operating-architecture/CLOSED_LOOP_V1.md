# R/Form Closed Loop v1

Status: v1.1 installed; data-worker acceptance passed; signed owner connection and natural positive-path acceptance blocked (#69)
Version: 1.1
Owner interface: Owner Bot
Canonical business state: `RFORM_MASTER_DATA_v1`

## 1. Goal

Close the operating loop without introducing a second datastore, publisher, router or owner workspace:

`CAPTURE → CLOSURE → EVENTS → DECISION/EDITORIAL GATE → CONTENT PACKET → OWNER PREVIEW → PUBLISH → METRICS → RESULT → NEXT DECISION`

The system must reduce owner attention, not create new surfaces.

## 2. Canonical ownership

| Concern | Canonical owner |
|---|---|
| Daily/nutrition/training/measurement facts | Existing domain tables in `RFORM_MASTER_DATA_v1` |
| Accepted day gate | `DAY_CLOSURE` |
| Derived routing evidence | `DATA_EVENTS` |
| Content workflow state | `CONTENT_QUEUE` |
| Content Packet | Deterministic projection materialized into existing `CONTENT_QUEUE`; no new packet table |
| Owner review/action | Owner Bot only |
| Publication transport | Telegram Autopost only |
| Post-publication metrics | `CONTENT_REGISTRY` |
| Decisions | `DECISIONS` |
| Decision outcomes/reviews | `DECISION_REVIEWS` |
| Editorial experiments | `CONTENT_EXPERIMENTS` |

## 3. Capture → Closure → Events

Content Event Detector v0.4 / lifecycle 1.0 is VERIFIED_PRODUCTION.

Rules:

1. Open/incomplete day facts do not create lifecycle events.
2. Accepted `DAY_CLOSURE` is the shared day-level gate.
3. Training events require `Session_Status=CLOSED`.
4. Stable Event IDs and idempotent upsert are mandatory.
5. Detector writes only `DATA_EVENTS`.
6. Detector never writes `CONTENT_QUEUE` or publishes.

Production evidence on 2026-10-11 already shows `D-20261010` accepted Closure followed by `DAY_CLOSED` and `NUTRITION_DEVIATION` lifecycle events.

Issue #42 is closed: native scheduled START/FINISH on 2026-10-11 and repeated zero-mutation NO_OP passed; the manifest already records v0.4/lifecycle 1.0.

## 4. Content Packet v1

Content Packet is not a datastore. It is a deterministic projection from accepted canonical facts/events into the existing `CONTENT_QUEUE` row.

### Required packet inputs

- stable `Content_ID` and source entity ID;
- accepted Closure / CLOSED session as applicable;
- complete factual payload;
- proof source;
- editorial trigger;
- target segment and audience problem;
- reader value;
- content function/type/funnel stage;
- CTA and success metric;
- publication mode;
- explicit owner gate.

### Required publication safety

Every newly materialized packet ends as:

- `Current_Stage=OWNER_FINAL_PREVIEW`;
- `Approval_Status=NOT_READY`;
- `Publication_Status=PLANNED`;
- `AutoPost_Allowed=NO`;
- `Preview_Review_Status=NOT_REVIEWED`.

Packet generation may prepare text/visual assets. It may not approve, schedule or publish.

### Training packet completeness

For a routine training packet selected for publication, the owner preview must contain the complete exercise list, accepted work-set count, duration, bench tonnage when relevant, total working tonnage, technique and pain/recovery facts when available.

The 2026-10-11 manually materialized reference packet is `CNT-20261009-S-20261009-C`:

- 5 exercises;
- 14 work sets;
- 65 minutes;
- bench tonnage 1,920 kg;
- total working tonnage 8,610 kg;
- bench technique 10/10;
- pain after 0/10;
- owner gate preserved;
- no scheduling/publication performed.

Canonical packet hash for that accepted projection:

`93bbbac0ba1fc0a29bdc77028f1d7f035927e2d17fe748ff25212a6f37280c9e`

## 5. Owner Bot cockpit

Owner Bot remains the single daily cockpit. Closed-loop automation must not introduce a second dashboard.

The cockpit surfaces only true owner actions, prioritised as:

1. content at `OWNER_FINAL_PREVIEW`;
2. decision review requiring a new owner decision;
3. experiment with sufficient observed metrics and `READY_FOR_REVIEW`.

Routine system housekeeping, missing-data diagnostics and expired experiments without sufficient evidence are not owner actions unless intervention is required.

At most three actions should be displayed at once.

## 6. Decision → Result

`DECISIONS` remains immutable historical decision evidence. Results must not overwrite the original decision.

`DECISION_REVIEWS` stores the evaluation layer:

- `Review_ID`;
- `Decision_ID`;
- decision/review dates;
- evidence period;
- expected result;
- metric and target;
- actual result;
- `Outcome` (`CONFIRMED`, `PARTIAL`, `REJECTED`, `INSUFFICIENT_DATA`);
- next action;
- whether a new decision is required;
- status and evidence source.

First canonical review created 2026-10-11:

`DEC-20260924-TRAINING-C-VOLUME-BENCH → REV-20261011-DEC-20260924-TRAINING-C-VOLUME-BENCH`

The result is `CONFIRMED` from CLOSED session `S-20261009-C`: the intended C structure remained intact, final bench RIR was 3, technique 10/10, pain 0/10 and all 14 work sets were completed.

No new strategic decision is required; the existing progression gate remains active.

## 7. Content → Metrics

Do not create `CONTENT_METRICS`. `CONTENT_REGISTRY` already owns the required metric fields, including 24h/72h/7d views/reactions/comments/shares, subscriber gain, link clicks, lead-magnet starts/completions, product interest, `Hypothesis_ID` and analysis confidence.

Rules:

1. Only observed metrics with an explicit source are eligible for evaluation.
2. Missing observations stay missing; never estimate reach/engagement merely to close a hypothesis.
3. `Content_ID` and `Hypothesis_ID` provide the join path.
4. Experiments become `READY_FOR_REVIEW` only when the required observed sample exists.
5. An experiment whose End Date passed without sufficient evidence becomes `REVIEW_REQUIRED / INSUFFICIENT_METRICS`, not PASS/FAIL.

On 2026-10-11 H01–H03 were moved from stale `ACTIVE` to `REVIEW_REQUIRED / INSUFFICIENT_METRICS`. H04 remains deployment-configured because its measurement period depends on Training Check launch.

## 8. Runtime boundaries

`automation/closed_loop_v1.gs` is the installed deterministic contract. It contains no Telegram credentials and no publishing call.

It provides pure functions for:

- building a complete owner-gated training Content Packet;
- building Decision Review outcomes;
- evaluating experiments only from linked observed metrics;
- producing at most three true owner signals for the existing Owner Bot cockpit.

Production rollout of any Apps Script wiring must still follow:

`code → tests → merge → deploy → source readback → acceptance → manifest`.

## 9. Acceptance gates

### Closed fact → preview

PASS only when:

- source is accepted/CLOSED;
- full fact is present;
- no duplicate/partial exercise list;
- expected tonnage is present;
- `AutoPost_Allowed=NO`;
- owner preview is visible through the existing Owner Bot path.

### Decision → Result

PASS only when:

- result references a stable `Decision_ID`;
- expected/actual evidence is explicit;
- original decision row is not rewritten;
- outcome is deterministic;
- a new owner decision is surfaced only when required.

### Content → Metrics

PASS only when:

- metrics are observed and source-backed;
- sample requirement is met before conclusion;
- experiment status cannot remain silently `ACTIVE` after its review horizon;
- Owner Bot receives only a ready-for-review signal, not raw analytics housekeeping.

## 10. Current rollout state

- Production Manifest and GitHub rulesets reconciled; branch-protection Issue #56 closed.
- Owner Bot Cockpit 1.7.0 installed in the existing deployment (version 20), exact source readback and self-test passed. Signed Content API connection is BLOCKED by existing paired authentication mismatch, tracked in Issue #69.
- Capture → Closure → Events: VERIFIED_PRODUCTION; detector Issue #42 closed after native scheduled/no-op acceptance.
- Content API 0.8.0 / closed loop 1.1.0 installed in the existing deployment (version 21), exact source readback and preflight passed. Existing poll/queue/publisher reused.
- Native data-worker run 2026-10-11 16:27:23–16:31:01 Europe/Moscow passed: 2 natural NO_POST audits, 39 INSUFFICIENT_DATA reviews, 3 hypothesis-specific insufficient-metrics checks, no new queue row. All 44 audits APPLIED with no PENDING; retained manual CONFIRMED review untouched.
- Telegram public metrics collector 1.0.0: VERIFIED_PRODUCTION; Issue #57 closed after natural 72H source observation and zero-write repeat. This source cannot provide saves, subscriber attribution, retention, production time or product activation.
- Positive Stage 4 acceptance remains pending: a new natural selected fact must yield a complete QA-passed packet and private BOT_PREVIEW_SENT receipt without manual assembly, followed by an unchanged repeat. The reference packet from 9 October is not this acceptance.
- Owner-only credential reconciliation is required before signed poll/private cockpit acceptance. No credential, permission, publisher or trigger changes were performed. Last stored successful poll predates this rollout.

## v1.1 runtime connection and acceptance

The existing signed Owner Bot `sync_training` request invokes the closed-loop adapter in Content API when `RFORM_CLOSED_LOOP_ENABLED=YES`. The existing Owner Bot polling trigger is reused. No additional scheduler, Telegram transport, approval path or datastore is introduced.

Selection uses the unique canonical DATA_EVENTS row. Aggregate/filter dispositions produce an idempotent AUTO_EDITORIAL_NO_POST receipt in CONTENT_ACTION_LOG. Pending events wait; manual gates wait for the owner. A selected CLOSED training session is rebuilt from all canonical TRAINING_SETS, projected into a complete Content Packet, QA checked and appended once to CONTENT_QUEUE. Existing rows, including HOLD/approved/published rows and baseline history, are not rebuilt. Canonical packet JSON and source/set hashes live in the existing action audit; queue metadata references its packet hash.

Decision reviews preserve DECISIONS and accepted manual reviews. Missing observations, targets or structured evaluation contracts produce INSUFFICIENT_DATA / OPEN / Next_Decision_Required=NO. The existing C Volume Bench contract evaluates complete structure, last-set RIR, technique and pain. Other free-text rules are not guessed into numerical criteria.

Experiment contracts are hypothesis-specific: H01 six matched pairs with subscriber gain/views and retention; H02 at least four matched publication units per group with saves/views; H03 four independent week units per group with reach/subscriber base, retention and production time; H04 at least thirty observed starts per matched group with completions and return after three trainings. Readiness requests an owner review; it never confirms a hypothesis automatically.

The existing CONTENT_REGISTRY Notes may contain one standalone `EXPERIMENT_EVIDENCE_V1:` JSON line with `group` (TREATMENT/CONTROL), explicit `comparison_key` and `metrics`. Each metric requires `value`, `observed:true`, `source` and ISO `observed_at`. Controls must be explicitly matched; generic Metrics_Source or Views_24H/Views_72H alone cannot satisfy a primary-metric contract. Historical/out-of-period observations do not count. This is provenance within the existing registry, not an additional evidence store.

Owner Bot reads DECISION_REVIEWS and CONTENT_EXPERIMENTS from canonical Master Data. Insufficient-data housekeeping is omitted from owner actions. The existing global three-action cap applies across previews, closure/event gates and result/experiment reviews.

Acceptance remains pending until runtime readback and a new naturally selected fact produce the full private Owner Bot preview without manual packet assembly, followed by a zero-mutation repeat. A NO_POST natural fact verifies that branch only. A pre-existing manually assembled packet cannot stand in for the positive-path acceptance.

For H03, each observation also requires an ISO `period_id` matching its publication week; repeated observations in one group/week do not count as independent weeks. Previous-period controls require explicit `control_start_date_iso` and `control_end_date_iso` in an `EXPERIMENT_CONTRACT_V1:` JSON line in the existing CONTENT_EXPERIMENTS Notes. Controls outside that declared window do not count.

Owner `TO_PUBLICATION` for a training event uses the same complete packet worker under the existing lock, including an explicitly selected baseline session; it does not create an empty BRIEF needing manual assembly. Automatic card captions retain available technique/pain facts and the final owner gate; full exercises remain on the existing cards. Text-only packets recheck canonical session/set hashes before appending.

## Rollback and acceptance evidence

Reviewed source: PR #68 head `e55d2c9e1b2c33cbf5f7b7c3fa799be0cc82bcb6`; required CI 60 passed / 0 failed. Content API SHA-256 `87482c45f4c08582e181abfe675d34e76f0208fe5851e335e57321e666a277f3`; cockpit SHA-256 `5918d2500acf75d70693b8b74cf4d1a7730125578b45e482da756657bd3797b9`. Existing API rollback is deployment version 19 at source `5550d3c423294fd89c980d08ce019808b735c434`; cockpit rollback is version 19 / 1.6.0. The cross-component production ref remains unchanged. Keep installed components DEPLOYED_NOT_VERIFIED until signed connection/private cockpit and natural positive preview gates pass. Update manifest/docs after each observed acceptance, preserving partial outcomes rather than marking the whole loop verified.

Repeat check: the existing runtime repeat was invoked at 16:31:36 Europe/Moscow. Later canonical queue/reviews/experiments/audit readback is unchanged with no duplicates or PENDING. The browser environment disconnected before the native completion receipt could be read; canonical stability is not proof of native mutation_count=0. Retain that observability caveat.
