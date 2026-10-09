# Content Control v0.5.5 — preparation-only Owner Bot handoff

Status: CANDIDATE / NOT DEPLOYED. Production queue has not been changed by this patch.

An existing ready text-only series material remains at CHANNEL_CONTROL_REVIEW,
while Owner Bot v1.0.5 only reads OWNER_FINAL_PREVIEW. Existing approval/send
operations schedule the post, so they cannot be used to prepare a private preview.

## Change

Add the signed `queue_owner_preview_prepare` operation and capability
`publication.owner_preview_prepare` to the existing Content Control API.
The matching Streamlit button is `Передать на предпросмотр в Owner Bot`.
Old gateways do not expose this button. Local unsaved text edits disable it.

The server changes exactly `Current_Stage`, from CHANNEL_CONTROL_REVIEW to
OWNER_FINAL_PREVIEW, on the same existing Content_ID. It preserves text, visual,
approval, review hash/status, publication state, Publish_At and AutoPost_Allowed.
There are no Telegram calls, new Apps Script projects, secrets or schema changes.
Existing Owner Bot polling and /today own private preview delivery.

Initial scope is TEXT_ONLY + NOT_REQUIRED. Media materials are rejected, not
silently downgraded. A later media-capable preparation path needs separate work.

## Guards and audit

- Existing source/text readiness, public-data YES, pending owner approval,
  PLANNED publication, AutoPost NO and empty schedule are required.
- Reject wrong stages, hold/archive/rework, blockers, duplicates, publish errors,
  existing Telegram IDs, media, overlong/empty text and stale review metadata.
- HMAC binds operation, action ID, Content_ID and SHA-256 of 25 current fields.
  Python and the actual Apps Script hash/signature construction are cross-tested.
- Re-read and validate under the existing script lock. No guessed Sheet write.
- Existing CONTENT_ACTION_LOG records PENDING → APPLIED with verified readback.
  Same action ID/object/hash is idempotent; cross-object reuse is rejected.
  A historical success cannot claim readiness after a later payload/stage change.
- A failed write/audit rolls back only Current_Stage and records
  FAILED_ROLLED_BACK. Failed rollback/audit produces OUTCOME_UNKNOWN where the
  audit backend remains writable. There is no automatic POST retry.
- Repeated manual attempt keeps the action ID for the same snapshot and uses a
  fresh short-lived transport nonce. Pending/unknown actions require inspection.

## Validation

31 Node behavioral tests: actual Apps Script handler with isolated Sheets,
lock and Utilities fakes; guards, exact changed field, idempotency, stale inputs,
identity collision, rollback, outcome unknown and signature binding.

72 Python tests: existing Content Control suite plus request/HMAC interoperability,
single-POST timeout behavior, missing schema, stable action identity and Streamlit
button routing, old-gateway gating and local-edit disabling. No live external calls.

The August plan smoke tests now use an explicit August fixture clock; production
calendar behavior is unchanged. Runtime preview delivery is PENDING installation.

## Installation gate and order

Requires exact owner authorization for existing production Apps Script replacement,
existing WebApp update and merge into the Streamlit-connected branch. Draft PR
creation does not authorize these actions.

1. Re-read live baseline, branch head and configuration; retain the v0.5.4
   source and current WebApp deployment version 10. Reject unexpected drift.
2. Install reviewed v0.5.5 into the same Content Control API project and update
   the same WebApp, preserving URL, access, execute-as and existing secret.
3. Run read-only preflight and verify version/capability/queue fields. Then merge
   the reviewed PR into agent/content-control-streamlit-readonly for the existing
   Streamlit deployment; verify displayed v0.5.5 and the preparation button.
4. Re-read exact CNT-20260821-SERIES-06-DIARIES and work packet QA. Submit one
   preparation request, inspect its outcome and read back every guarded field.
   Only Current_Stage may change. Ambiguous response requires readback before retry.
5. Observe existing Owner Bot poll / BOT_PREVIEW_SENT audit and owner's actual
   received preview, or ask the owner for /today if needed. Do not click approve,
   hold or schedule as part of preview acceptance.

## Rollback

Restore the retained v0.5.4 HEAD and previous version 10 of the same WebApp;
revert only this change from the Streamlit-connected branch. Rollback needs
owner authorization. Do not rotate credentials or re-install Owner Bot.
Code rollback does not automatically reverse a successfully prepared queue row.
Inspect that exact object and its audit before any compensating state transition.
