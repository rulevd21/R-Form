# Stage 3 — Weekly state and Detector run evidence

Status: skill contracts implemented; Detector observability is a source candidate, not a verified installed runtime.

## Ownership

- OS 1.1.7: exact analytical Weekly artifact owns operational DATA_PENDING / DRAFT / REVIEWED / CLOSED. Read `references/weekly-state-contract.md` and `references/run-observability-contract.md` in the existing personal OS skill package `skill-6a8ff9d0c7788191890cd6ae0180d6e5`.
- Content Orchestrator 1.1.2 preserves exact report identity/source freshness at the content handoff. CONTENT_QUEUE retains approval/publication state. No second Weekly state table, run table, router or publisher.
- Weekly contracts are implemented in the existing personal skills; this repository note is integration guidance, not a copy of operational report state.

## Candidate change

Baseline: `365215bf6c414fbf538034169cb42d5f6672934d`, `automation/content_event_detector_v0_3.gs`.

Existing public writer handler `rformContentEventDetectorWriteV03(e)` remains unchanged as a callable name. It wraps the original business writer, moved verbatim to `rformContentEventDetectorWriteV03Core_`. Preview, trigger install/remove, filtering and timestamp guards retain their existing semantics. Original return fields/version remain unchanged. Observability extension version is independently `0.1`.

The wrapper uses existing console logging for START/FINISH receipts. Each attempt has UUID, UTC times, duration, component/handler/version identity, safe invocation hint and six counters. inserted + updated + filtered > 0 yields APPLIED; successful evaluation with zero mutations yields NO_OP. No business row is touched merely to record that execution occurred. Receipt counters are not independent business readback.

Errors retain failure semantics and are rethrown. The additional receipt has only a fixed error code and UNKNOWN_OR_PARTIAL business-effects warning; raw exception messages, source facts, content text or credentials are not copied into it. Start logging failure prevents entry to the writer. Terminal logging failure does not report verified success or automatically retry. Timeout/interruption may leave START only; classify that as incomplete/unverified until native execution and business readback are available.

INSTALLABLE_EVENT and trigger_uid are hints. They do not establish a clock run; manual/API callers may pass an event-shaped object. Confirm current project/source, native execution type/time/handler/status, trigger inventory and matching terminal run_id. runtime_source_evidence remains UNVERIFIED in this source candidate by design.

## Verification

Run `node tests/content-event-detector-observability.test.cjs`. Twelve local mock cases cover insertion, entire-row timestamp stability on repeat, changed facts, first/repeated filtering, no-event NO_OP, invocation hints, missing sheet, partial failure, logging failures and counter validation. No Google API or Telegram is invoked. No live acceptance is implied.

## Installation boundary

Do not paste this candidate over an unverified Apps Script HEAD. First read the actual project source and compare with the exact baseline/current candidate, inspect triggers and preserve rollback. If the runtime contains newer business guards, port only the reviewed observability wrapper over that runtime and rerun relevant regressions; never replace it with older Git business code.

The candidate keeps the existing handler; installation needs no second trigger or scheduler. Do not call the trigger installer as part of this change. Preserve v0.1/v0.2 handlers as history; actual active legacy triggers require verified inventory and a separately scoped correction, not deletion based on filenames.

After an explicit production installation gate, verify source/handler readback and collect a real automatic execution plus a controlled repeat/no-op. Correlate native execution and receipts, compare exact typed business baseline and QA, and verify CONTENT_QUEUE/Telegram unaffected. Native log retention/access may be limited; absence of older receipts is EVIDENCE_UNAVAILABLE, not proof of non-execution. No Cloud project, paid service or persistent success-row logger is added here.

Rollback: restore only the verified prior source wrapper/body arrangement in the same project. Triggers and business schema stay unchanged. This PR does not authorize merge, production replacement or deployment.

Official references: [Apps Script logging](https://developers.google.com/apps-script/guides/logging), [event objects](https://developers.google.com/apps-script/guides/triggers/events).
