# R/Form Closed Loop v1

Status: v1.1 implementation candidate / runtime acceptance pending  
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

`automation/closed_loop_v1.gs` is a deterministic contract candidate. It contains no Telegram credentials and no publishing call.

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

- Runtime/version governance cleanup: core issue closed; admin branch-protection gate tracked separately.
- Owner Bot single cockpit: production v1.6 verified; no replacement introduced.
- Capture → Closure → Events: business behavior observed in production; native receipt/no-op acceptance remains open.
- Content Packet v1: first canonical packet materialized in `CONTENT_QUEUE`; owner gate preserved.
- Decision → Result: `DECISION_REVIEWS` created and first review closed as `CONFIRMED`.
- Content → Metrics: canonical metric owner established as `CONTENT_REGISTRY`; stale experiments gated; automatic external metric ingestion remains dependent on an authenticated metrics source and must not be simulated.

## v1.1 runtime connection and acceptance

The existing signed Owner Bot `sync_training` request invokes the closed-loop adapter in Content API when `RFORM_CLOSED_LOOP_ENABLED=YES`. The existing Owner Bot polling trigger is reused. No additional scheduler, Telegram transport, approval path or datastore is introduced.

Selection uses the unique canonical DATA_EVENTS row. Aggregate/filter dispositions produce an idempotent AUTO_EDITORIAL_NO_POST receipt in CONTENT_ACTION_LOG. Pending events wait; manual gates wait for the owner. A selected CLOSED training session is rebuilt from all canonical TRAINING_SETS, projected into a complete Content Packet, QA checked and appended once to CONTENT_QUEUE. Existing rows, including HOLD/approved/published rows and baseline history, are not rebuilt. Canonical packet JSON and source/set hashes live in the existing action audit; queue metadata references its packet hash.

Decision reviews preserve DECISIONS and accepted manual reviews. Missing observations, targets or structured evaluation contracts produce INSUFFICIENT_DATA / OPEN / Next_Decision_Required=NO. The existing C Volume Bench contract evaluates complete structure, last-set RIR, technique and pain. Other free-text rules are not guessed into numerical criteria.

Experiment contracts are hypothesis-specific: H01 six matched pairs with subscriber gain/views and retention; H02 at least four matched publication units per group with saves/views; H03 four independent week units per group with reach/subscriber base, retention and production time; H04 at least thirty observed starts per matched group with completions and return after three trainings. Readiness requests an owner review; it never confirms a hypothesis automatically.

The existing CONTENT_REGISTRY Notes may contain one standalone `EXPERIMENT_EVIDENCE_V1:` JSON line with `group` (TREATMENT/CONTROL), explicit `comparison_key` and `metrics`. Each metric requires `value`, `observed:true`, `source` and ISO `observed_at`. Controls must be explicitly matched; generic Metrics_Source or Views_24H/Views_72H alone cannot satisfy a primary-metric contract. Historical/out-of-period observations do not count. This is provenance within the existing registry, not an additional evidence store.

Owner Bot reads DECISION_REVIEWS and CONTENT_EXPERIMENTS from canonical Master Data. Insufficient-data housekeeping is omitted from owner actions. The existing global three-action cap applies across previews, closure/event gates and result/experiment reviews.

Acceptance remains pending until runtime readback and a new naturally selected fact produce the full private Owner Bot preview without manual packet assembly, followed by a zero-mutation repeat. A NO_POST natural fact verifies that branch only. A pre-existing manually assembled packet cannot stand in for the positive-path acceptance.

For H03, each observation also requires an ISO `period_id` matching its publication week; repeated observations in one group/week do not count as independent weeks. Previous-period controls require explicit `control_start_date_iso` and `control_end_date_iso` in an `EXPERIMENT_CONTRACT_V1:` JSON line in the existing CONTENT_EXPERIMENTS Notes. Controls outside that declared window do not count.
