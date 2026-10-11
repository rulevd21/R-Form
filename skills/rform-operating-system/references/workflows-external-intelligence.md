# External Intelligence Workflows

External intelligence is a read-only evidence layer for R/Form. It does not create a second datastore, content queue, scheduler, publisher, or command router.

The R/Form Operating System remains the sole user-facing router. Agent Reach or another external-research capability may be used only as a subordinate collection layer.

## Source boundary

External sources are evidence, not R/Form canonical business state.

Use external intelligence for:

- current training discussions and emerging topics;
- research/news context;
- audience questions and pain points;
- content scouting;
- product/market discovery;
- technical research relevant to R/Form.

Never use an external source to overwrite a canonical R/Form fact, decision, training record, nutrition record, publication state, owner approval, or permission boundary.

## Agent-Reach boundary

When Agent Reach is available, use it as the preferred multi-platform acquisition layer for this workflow. It is not a competing Skill/router.

Preferred pilot channels:

1. Web / semantic search;
2. YouTube;
3. Reddit;
4. Twitter/X;
5. RSS where stable sources are known.

GitHub may be added for training-tech / AI / data topics. Instagram/Facebook/other login-backed platforms are optional later-stage sources and are not required for v1 acceptance.

For login-backed sources, follow Agent-Reach health/auth rules. Do not bypass login, anti-bot, credential, or owner-permission gates. A failed channel reduces source coverage; it does not authorize a different privileged path.

If Agent Reach is unavailable, the R/Form OS may use another approved current web-research capability, but must report the coverage limitation. Do not pretend multi-platform coverage occurred.

## Strength Trend Scout v1

### User intents

Examples:

- `Что сейчас в тренде по силовым тренировкам?`
- `Собери R/Form Radar`
- `Найди трендовые темы для канала`
- `Что обсуждают про RIR / жим / гипертрофию?`

Route these to `STRENGTH_TREND_SCAN`.

A request to turn one selected trend into a publication routes to the existing content-production workflow after the scan; the scout itself never writes publication approval or sends Telegram content.

### Pilot cadence

For the first four-week pilot:

- target two scans per week;
- return no more than ten normalized topic clusters per scan;
- surface no more than three editorial candidates;
- target at most one `R/Form Radar` publication per week unless the owner explicitly requests more.

Cadence is an operating target, not a new scheduler. Do not create an additional recurring infrastructure component merely to satisfy this contract.

### Topic universe

Maintain coverage of these seed clusters while allowing discovery outside the list:

- RIR / RPE / autoregulation;
- training to failure;
- training volume;
- frequency;
- strength vs hypertrophy;
- bench press;
- periodization;
- fatigue / recovery / deload;
- exercise technique;
- long-muscle-length / partials / ROM;
- exercise selection;
- AI / data / technology in strength training.

Do not force every result into a seed cluster. Emerging topics may create a new normalized `cluster_key`.

## Scan pipeline

Use:

`QUERY PLAN → CHANNEL HEALTH → MULTI-PLATFORM COLLECTION → NORMALIZE → DEDUPLICATE → CLUSTER → DETERMINISTIC SCORE → TREND CLASS → EDITORIAL GATE → OWNER OUTPUT`

### 1. Query plan

For a broad scan, combine:

- generic discovery queries (`strength training`, `powerlifting`, `hypertrophy`, `bench press`, `autoregulation`);
- seed-cluster queries;
- time-bounded recency terms where supported;
- source-specific search only when it adds independent signal.

Prefer a recent 7-day discovery window, with up to 30 days of context when needed to determine whether a topic is accelerating or merely recurring.

### 2. Channel health

Before claiming channel coverage, verify that the required Agent-Reach backend/source is actually available.

Record per scan:

- requested platforms;
- available platforms;
- unavailable platforms;
- material limitations (login unavailable, no transcript, search unavailable, etc.).

A platform name in configuration is not evidence that usable results were retrieved.

### 3. Normalized signal contract

Each retained source item should normalize to:

```json
{
  "signal_id": "stable scan-local id",
  "cluster_key": "normalized-topic-key",
  "platform": "youtube|reddit|x|web|rss|github|other",
  "url": "source URL",
  "title": "source title or concise source description",
  "author": "author/channel/account if available",
  "published_at": "ISO-8601 or null",
  "discovered_at": "ISO-8601",
  "authority": 0.0,
  "engagement_signal": 0.0,
  "primary_evidence": false
}
```

`authority` and `engagement_signal` are bounded 0..1 analytical inputs. They must be evidence-based and may be left conservative/zero when unavailable. Do not invent platform engagement counts.

`primary_evidence=true` is reserved for a directly relevant research paper, official position/consensus, primary dataset, or comparably strong first-party evidence. Commentary about a study is not the study itself.

### 4. Deduplication

Do not count syndication/reposts/quote-posts of the same underlying material as independent cross-platform evidence.

Collapse to one underlying source when items share the same:

- paper/article/video;
- author statement copied across channels;
- press release;
- identical discussion thread repost.

Cross-platform score requires independent sources, not duplicated distribution.

### 5. Cluster-level editorial inputs

For each cluster, derive explicitly:

```json
{
  "audience_fit": 0.0,
  "rform_fit": 0.0,
  "reader_value": 0.0,
  "rform_position_available": false
}
```

Definitions:

- `audience_fit`: relevance to the current R/Form audience;
- `rform_fit`: fit with R/Form themes, data, training system or product journey;
- `reader_value`: ability to teach a transferable rule, resolve a real question, or improve a decision;
- `rform_position_available`: R/Form can add an evidence-backed interpretation/case/decision rather than simply reposting others.

These fields are editorial inputs, not measures of internet popularity.

## Deterministic scorer contract

The packaged implementation is:

`scripts/strength_trend_scout_v1.py`

After collection/normalization, execute this script with normalized cluster JSON. Its result is authoritative for:

- `trend_score`;
- score breakdown;
- `trend_class`;
- `editorial_disposition` at the trend gate;
- independent-source/platform counts;
- `top_editorial_candidates`.

Do not manually recreate or override those outputs when the script is executable.

### Fail-closed behavior

If deterministic script execution is unavailable or fails:

1. report `SCORER_UNAVAILABLE` and the exact execution blocker;
2. do not present a numeric `TREND_SCORE` as deterministic;
3. do not emit `CONTENT_CANDIDATE`;
4. manual qualitative review may return only provisional `WATCH` or `NO_POST`;
5. preserve source coverage/provenance and continue non-blocked research work.

This prevents free-form reasoning from silently changing scoring or editorial gates.

## TREND_SCORE v1

Score 0..100 using:

- Freshness: 20;
- Cross-platform: 25;
- Velocity: 20;
- Authority: 15;
- Audience fit: 10;
- R/Form fit: 10.

### Score components

**Freshness (0..20)**

Average source recency factor:

- 0–7 days: 1.00;
- 8–14 days: 0.70;
- 15–30 days: 0.40;
- >30 days or unknown: 0.10 maximum contextual credit.

**Cross-platform (0..25)**

Independent platform coverage, capped at four platforms:

`25 * min(unique_platforms / 4, 1)`

**Velocity (0..20)**

Number of independent sources published/discovered within the last seven days, capped at six:

`20 * min(recent_source_count / 6, 1)`

**Authority (0..15)**

Use the mean of the three strongest source authority values (or all sources when fewer than three exist).

**Audience fit (0..10)** and **R/Form fit (0..10)**

Use bounded cluster-level values supplied during editorial normalization.

### Trend classes

Deterministic minimum gates:

- `BREAKOUT`: score >= 80, at least 3 independent platforms, at least 5 recent independent sources;
- `TREND`: score >= 60, at least 2 independent platforms, at least 3 recent independent sources;
- `WATCH`: score >= 45, or strong primary evidence with clear R/Form relevance but insufficient diffusion;
- `NOISE`: everything else.

Do not promote a one-source or one-platform viral item to `TREND` only because the score/engagement is large.

A new high-quality paper can be `WATCH` even before broad discussion. `WATCH` means observe/research; it is not a publication candidate state.

## Editorial Gate after trend detection

Trend detection is not publication approval.

For scorer-confirmed `TREND` / `BREAKOUT`, ask:

1. Is there a real audience problem/question?
2. Is there transferable reader value?
3. Can R/Form add an evidence-backed position, internal case, practical rule, or decision framework?
4. Is the topic materially distinct from recent R/Form publications?
5. Is source confidence sufficient for the strength of the claim?

Scorer-level outcome:

- `CONTENT_CANDIDATE` — permitted only when `trend_class` is `TREND` or `BREAKOUT`, reader value and R/Form fit meet the scorer threshold, and R/Form has a distinct position;
- `WATCH` — insufficient diffusion/maturity or useful but not yet eligible;
- `NO_POST` — low-value, duplicative, weakly evidenced, or off-brand.

**Invariant:** `trend_class=WATCH` must never have `editorial_disposition=CONTENT_CANDIDATE`, regardless of numeric score. The 1.1.7 regression fixture reproduces the observed `64.54`, one-platform case and requires `WATCH → WATCH`.

`CONTENT_CANDIDATE` is still not a `CONTENT_QUEUE` write. Only the existing content workflow may materialize/update a canonical content object under its normal permission and owner-gate rules.

## R/Form Radar editorial structure

Preferred structure for a selected item:

1. **Signal:** what is gaining attention;
2. **Claim:** what people are saying;
3. **Evidence:** what primary/credible evidence actually supports;
4. **Disagreement:** what remains uncertain or contested;
5. **Application:** what a strength trainee should do differently, if anything;
6. **R/Form position:** system/case/decision interpretation;
7. **CTA:** only when consistent with the current content/product journey.

Avoid generic news aggregation. The rubric exists to convert external attention into a useful R/Form interpretation.

## Optional internal-case bridge

When useful, enrich a selected external trend with canonical R/Form evidence:

`EXTERNAL TREND + CANONICAL INTERNAL CASE → R/Form interpretation`

Examples include RIR progression, bench frequency, technique, recovery, volume or deload decisions.

Internal facts must be loaded from canonical R/Form sources and remain separate from external evidence provenance. Never search external sources and then infer internal facts from memory.

## Owner output contract

Default scan response:

- coverage line: platforms used / unavailable;
- top three clusters maximum;
- each cluster: `Trend Class`, deterministic `TREND_SCORE` when scorer ran, one-sentence reason, source mix, editorial disposition;
- one recommended R/Form Radar candidate maximum;
- one owner action: `разобрать`, `наблюдать`, or `пропустить`.

If scorer did not run, clearly replace numeric score/candidate output with `SCORER_UNAVAILABLE` and provisional qualitative observation only.

Do not dump all raw URLs unless requested. Preserve enough source provenance to retrieve them when preparing the actual article/post.

## Publication handoff

When the owner chooses a scorer-confirmed candidate:

1. route to `workflows-content-production.md`;
2. re-read relevant current R/Form state and recent publication history;
3. create/update the existing canonical content object only if the content intent authorizes it;
4. preserve source/proof URLs and uncertainty;
5. run Fact/Editorial/Duplication QA;
6. retain the existing Owner Bot preview/approval/publication gate.

The scout may never approve, schedule, publish, or bypass `CONTENT_QUEUE` / Owner Bot / Telegram Autopost.

## Pilot evaluation

After four weeks, evaluate:

- scans completed;
- source coverage reliability;
- clusters surfaced;
- `CONTENT_CANDIDATE` conversion rate;
- Radar posts actually published;
- observed content metrics available in `CONTENT_REGISTRY`;
- owner time/decisions required;
- repeated false-positive/noise patterns.

Do not declare the pilot successful from output volume alone.
