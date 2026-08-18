# R/Form Content Event Detector v0.1

Status: **STAGING / NOT DEPLOYED**.

Task: `RFORM-CONTENT-OPS-AUDIT-20260818-001`.

## Purpose

Insert an editorial gate between closed R/Form data and content production:

`SOURCE DATA -> EVENT DETECTOR -> DATA_EVENTS -> EDITORIAL DECISION -> CONTENT_QUEUE`

The detector never publishes and v0.1 never creates `CONTENT_QUEUE` rows. It only reads canonical production data and writes/upserts `DATA_EVENTS` after an explicit write call.

## Source of truth

- Spreadsheet: `RFORM_MASTER_DATA_v1`.
- Training: `TRAINING_SESSIONS`.
- Decisions: `DECISIONS`.
- Output: `DATA_EVENTS`.
- Publication backlog remains `CONTENT_QUEUE`.

## Content Value Score

Each event is scored 0–10 on seven dimensions and converted to 0–100:

- relevance — 20%
- novelty — 15%
- educational value — 15%
- emotional value — 10%
- proof value — 15%
- narrative value — 15%
- audience value — 10%

Editorial thresholds:

- 0–49: aggregate only / Weekly input
- 50–64: backlog
- 65–79: content candidate
- 80–89: priority candidate; consider vertical repurpose
- 90–100: flagship candidate

A manual gate overrides the score.

## Manual gates

Never auto-approve or auto-publish content involving:

- official positioning changes;
- health/medical statements;
- competition forecast, attempt selection or result;
- contentious nutrition conclusions or competition-weight strategy;
- sensitive personal/emotional conclusions;
- commercial promises.

## Safe test sequence

1. Verify `DATA_EVENTS` headers in production.
2. Add `content_event_detector_v0_1.gs` to a standalone/staging Apps Script project or controlled test copy.
3. Run `rformContentEventDetectorPreview()` only.
4. Compare detected events with source rows manually.
5. Only after preview passes, run `rformContentEventDetectorWrite()`.
6. Confirm that only `DATA_EVENTS` changed.
7. Do **not** connect detector directly to Telegram autopost.

## Production boundary

Existing Channel Control and `telegram_autopost_v0_3` remain the publication path. The detector is upstream only. Future candidate creation into `CONTENT_QUEUE` should be a separate version after a regression test and must default to a non-publishable state such as `DATA_READY` / `AutoPost_Allowed=NO`.
