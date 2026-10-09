# Content Event Detector runtime reconciliation — 2026-10-09

Status: **LIVE BEHAVIOR RECONCILED / EXACT RUNTIME SOURCE + TRIGGER PROVENANCE STILL REQUIRED**

## Scope

P0 reconciliation for `Content Event Detector` before installing the execution-receipt wrapper from PR #13.

## Repository candidates

- business baseline: `automation/content_event_detector_v0_3.gs` at `365215bf6c414fbf538034169cb42d5f6672934d`;
- no-op timestamp fix: PR #12 / merged source;
- observability candidate: PR #13 head `1b0474f4fa2616af5c6353650246476b67981774`.

PR #13 preserves handler `rformContentEventDetectorWriteV03`, wraps the existing business writer with START/FINISH console receipts and intentionally declares runtime source evidence `UNVERIFIED` until the actual Apps Script project is read.

## Live canonical-data evidence

Read-only inspection of `RFORM_MASTER_DATA_v1 / DATA_EVENTS` on 2026-10-09 shows behavior consistent with the v0.3 business contract:

1. Historical auto-generated events outside current gates are persisted as `FILTERED_OUT_V03` with owner action `NONE · filtered by v0.3 active-window/source gates`.
2. Current session `S-20261009-C` is reconciled to `CNT-20261009-S-20261009-C` and marked `ALREADY_IN_PIPELINE`, matching the v0.3 `CONTENT_QUEUE` reconciliation behavior.
3. Older unchanged events retain earlier `Updated_At` values rather than being rewritten on every later detector pass, consistent with the PR #12 no-op timestamp fix.
4. No evidence indicates that Detector directly publishes to Telegram or owns publication state.

This is strong behavioral evidence that the running business logic is v0.3-compatible, but **behavioral equivalence is not source provenance**.

## Remaining production gate

Before PR #13 can be installed and declared verified production, the authenticated Apps Script runtime must be inspected directly:

1. identify the current Detector Apps Script project;
2. read current source and compare it to the v0.3 baseline / PR #12 source;
3. inventory installable triggers and confirm the active handler/cadence;
4. preserve any runtime-only guards if source differs;
5. port only the PR #13 observability wrapper onto the verified current business writer;
6. do not create a second trigger;
7. read source back after save/deployment;
8. observe one real automatic run with matching START/FINISH receipt;
9. run one controlled repeat/no-op and confirm business rows, especially `Updated_At`, remain stable when facts do not change;
10. verify `CONTENT_QUEUE` and Telegram remain unaffected.

## Access blocker in this execution

The connected Google Drive/Sheets tools expose canonical Sheets data but not Apps Script project source, deployments, triggers or execution logs. No authenticated browser/computer connector is currently connected. Therefore the exact runtime-source/trigger gate cannot be truthfully marked complete from the available interfaces.

No production source, trigger or `production` ref was changed as part of this reconciliation. This fail-closed result is intentional.
