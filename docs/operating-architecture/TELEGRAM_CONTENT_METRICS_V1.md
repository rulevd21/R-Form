# R/Form Telegram Content Metrics v1

Status: VERIFIED_PRODUCTION / accepted 2026-10-11  
Canonical destination: `RFORM_MASTER_DATA_v1 / CONTENT_REGISTRY`  
Source: public Telegram web preview for `@r_form`

## Purpose

Close the `Content → Metrics` observation path without Telegram user authentication, a second analytics datastore, or any publishing capability.

The collector reads only already-published R/Form Telegram posts and writes observed checkpoints into the existing `CONTENT_REGISTRY` fields.

## Source contract

Source identifier: `TELEGRAM_PUBLIC_WEB_PREVIEW`.

The public Telegram post page exposes the current message view counter and may expose reaction/reply counters. The collector records only counters actually present in the source HTML.

- `Views_*`: required for a checkpoint write.
- `Reactions_*`: written only when a reaction counter is visible.
- `Comments_*`: written only when a public reply/comment counter is visible.
- `Shares_*`: public preview does not provide a dependable share/forward counter; leave blank.
- subscriber gain, link clicks, lead-magnet starts/completions and product interest require their own observed sources; this collector does not infer them.

No missing metric is estimated as zero.

## Checkpoint semantics

The collector runs periodically and snapshots cumulative counters only in these windows:

| Checkpoint | Eligible age |
|---|---:|
| 24H | 24–<36 hours |
| 72H | 72–<96 hours |
| 7D | 168–<192 hours |

A missed checkpoint remains missing. A 72-hour observation is never copied into `Views_24H`, and a 7-day observation is never used to reconstruct an earlier checkpoint.

Existing checkpoint values are immutable to the collector. Re-running the same window after a successful write is a no-op.

## Canonical joins

Published source rows come from `CONTENT_QUEUE` using stable `Content_ID`, `Telegram_Message_ID`, `Telegram_Post_URL` and `Posted_At`.

If a published content object has no `CONTENT_REGISTRY` row yet, the collector may seed one from canonical queue metadata before writing the observed checkpoint. The collector does not create a parallel metrics table.

Every successful checkpoint write includes:

- `Metrics_Source=TELEGRAM_PUBLIC_WEB_PREVIEW`;
- `Metrics_Observed_At=<actual observation timestamp>`.

## Historical safety

Date-only historical `Posted_At` values cannot establish an exact 24h/72h/7d checkpoint and are skipped with `CHECKPOINT_TIME_UNKNOWN`.

This intentionally prevents old posts from being mislabeled with retroactively observed counters.

## Experiment gate

The existing Closed Loop rules remain authoritative:

- an editorial experiment may be evaluated only from linked observed metrics;
- unavailable metrics stay unavailable;
- sample requirements must be met before `READY_FOR_REVIEW`;
- H01–H03 remain `REVIEW_REQUIRED / INSUFFICIENT_METRICS` until their stated metrics and samples actually exist.

The public Telegram collector alone cannot satisfy hypotheses whose primary evidence depends on subscriber attribution, saves, production time or another metric that public Telegram does not expose.

## Safety boundaries

The collector:

- has no Telegram token or user session;
- makes no Telegram write or Bot API call;
- never changes `CONTENT_QUEUE` publication state;
- never approves, schedules or publishes content;
- writes metrics only to `CONTENT_REGISTRY`;
- fails closed if the exact post or view counter is not observed.

## Production acceptance

Production is verified only after all of the following:

1. source merged with green CI;
2. reviewed Apps Script wiring deployed through the governed runtime path;
3. exactly one scheduled collector trigger exists;
4. at least one new published `Content_ID` receives a source-backed checkpoint inside its valid time window;
5. registry readback matches the source observation;
6. immediate rerun does not overwrite the completed checkpoint;
7. experiment state changes only when its own metric/sample contract is satisfied.

Until those conditions pass, classify the collector as `CANDIDATE`, not `VERIFIED_PRODUCTION`.

## Accepted runtime evidence, 2026-10-11

Issue #57 is closed. The existing collector trigger is active and source matches PR #61. A natural 72H checkpoint recorded nine observed views, with TELEGRAM_PUBLIC_WEB_PREVIEW and actual observation time read back from CONTENT_REGISTRY. Immediate rerun returned written=0, seeded=0 with an identical row. Unavailable counters remain blank. This acceptance covers metrics ingestion; it does not supply the primary metric/control/sample evidence required by H01–H04.
