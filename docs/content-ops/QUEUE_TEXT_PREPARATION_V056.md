# Content Control v0.5.6: queue text preparation

Status: candidate; not installed. Production baseline: v0.5.5, commit e4c528b3cfe07178440fa1f069340a28ea1a8546.

## Behavior

The ready-material view previously included HOLD rows, selected only the first row, and saved edited text only in session state. This change excludes held/archived/rework rows, offers an explicit material selector, and saves eligible TEXT_ONLY edits into the existing CONTENT_QUEUE through a signed gateway operation.

SAVE_TEXT_DRAFT requires CHANNEL_CONTROL_REVIEW, PLANNED, an unapproved and unscheduled row, AutoPost NO, ready source/text, and no media. It verifies the source snapshot under a lock, writes Telegram_Text and Updated_At, and resets the four preview review fields. It does not approve, publish, schedule, or move the stage. Action identity binds the row, previous snapshot and replacement text. Audit/readback and rollback protect against partial writes; an uncertain outcome requires inspection before manual retry.

The read-retry button only repeats a read. Intermittent HTTP 302 and read timeouts are not fixed by this release. Writes have no automatic retry.

## Validation

81 Python tests and 58 Apps Script tests pass locally, including interface selection, HOLD exclusion, HMAC interoperability, stale snapshots, idempotency, review invalidation, partial writes, rollback and unknown outcomes. Existing preparation behavior remains covered. CI must pass on the exact PR commit before installation.

## Installation after separate owner authorization

1. Verify production baseline and PR commit, passing CI, and capture existing configuration without exposing secrets.
2. Replace code in existing Apps Script project 1ov4yqO3IO9yFKJ0yeeQyPlv1Lz2k3v51EznWU7m1NuM3BeJFZbhf4QP9. Update the existing Web App deployment from version 11 to a new version, preserving its URL and permissions.
3. Verify gateway version 0.5.6 and publication.queue_text_draft_save capability. The old client remains compatible while this step is completed.
4. Merge the reviewed PR into agent/content-control-streamlit-readonly and verify the existing Streamlit app reports 0.5.6.
5. Confirm Series 6 remains HOLD and is absent from the ready selector. Select CNT-20260825-SERIES-07-WEEKLY-REVIEW. Save the prepared v02 from the existing work packet, which removes the stale promise about tomorrow.
6. Read back text, Updated_At and four review fields; verify SAVE_TEXT_DRAFT APPLIED, unchanged approval/stage/AutoPost/schedule, and preserved Series 6 text. Prepare a fresh owner preview through the existing operation and verify its exact identity and delivery. Do not approve or publish as part of this smoke check.

No schema, secret, permission, Owner Bot or publisher changes are included.

## Rollback

Restore the previous Apps Script source and point the same Web App deployment to version 11. Revert the PR on the Streamlit deployment branch and verify v0.5.5. A code rollback does not undo text drafts already saved; any content restoration requires its own reviewed action. There is no automatic data migration or rollback replay.
