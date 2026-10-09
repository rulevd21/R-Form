# Channel reconciliation candidate — Owner Bot 1.2.0 / Content API 0.6.1 / Content Control 0.5.8

Status: prepared and locally verified; not merged, installed or enabled in production.

## Goal

Keep actual channel publications and the existing content workspace consistent. Remove already-closed editorial inputs from active navigation, preserve genuinely deferred work, and account for manual publications without publishing content during this workstream.

Definition of done: current queue reconciled, archive/manual publication controls installed, channel observations accepted through existing webhook and Poll, private acceptance verified, no content approval/scheduling/publication performed. The production gate and live acceptance remain pending.

## Baseline

- Repository: rulevd21/R-Form; production content branch `agent/content-control-streamlit-readonly`.
- Base commit: b87e8164889b6d79124bea7aaac4a458aae7c809; tree: 256737ae1b9cd2727fa2425e23dd76d16de0b112.
- Last verified installed versions: Content API 0.6.0 (existing Web App version 14), Owner Bot 1.1.0 (existing Web App version 6), 08.10.2026.
- Existing CONTENT_QUEUE and CONTENT_ACTION_LOG remain the only canonical editorial state/audit store. No schema, Training, Detector, Autopost, secrets, channel posting privileges, deployment URL or pairing changes.

## Behavior

- Bot workspace: Work / Held / Published / Archive / Reconciliation; search includes archived objects; technical tests and closed editorial gates are excluded from active work/previews.
- Archive reasons: cancelled by owner, obsolete, replaced by observed channel post. Draft text, private assets and audit history remain. Restore opens a fresh revision gate; no approval or schedule is restored.
- Live validation checked: Publication_Status and Approval_Status use strict `DICTIONARIES!L2:L19`. Archive writes existing CANCELLED or SUPERSEDED, never a new ARCHIVED publication enum. The ARCHIVED pipeline/stage and derived UI grouping require no dictionary/schema modification.
- Manual publication: owner selects a registered channel URL or forwards an original channel message, reviews draft vs observed text, and chooses actual published edition or replaced draft. No text-similarity write is performed automatically. Published edition and original draft remain separately inspectable.
- Existing webhook captures `channel_post` and `edited_channel_post` only for channel -1004309818003 / @r_form. A bounded durable transport spool holds at most 20 observations, each at most 12,000 UTF-8 bytes, in Script Properties. It is not an editorial queue. Existing five-minute Poll drains at most three observations and invokes Content API reconciliation.
- Canonical observations are signed, verified, idempotent audit entries. Old revisions cannot replace newer ones; same-revision text conflicts stop processing. Media are references, never downloaded or published by reconciliation. Albums are presented as grouped observations when Telegram media_group_id is available.
- Automatic linking requires exactly one open safe queue match of the entire normalized text, at least 80 characters. Only whitespace is normalized; semantic similarities, punctuation changes, very short captions and ambiguous matches require owner review.
- Exact linking records PUBLISHED as an already-observed fact, clears approval/scheduling controls, preserves draft/asset payload and checks all fields plus audit readback. It never calls a Telegram publishing endpoint.
- Factual published history combines observed posts with linked existing queue records without duplicates or manufacturing new Content_IDs. Already-published channel edits update the read-only observed edition, preserving prepared draft/version history.
- Similar-post suggestions produce at most one private notification per Poll; uncertain notification delivery is not retried. Channel reconciliation failures are isolated from the existing training/preview path and exposed in the workspace.
- Bot API channel deletions are not observed by this workflow. Historical/future export reconciliation remains necessary after a suspected deletion or a prolonged missed update interval. An incomplete export is not evidence of deletion.

## Historical reconciliation

See [channel-reconciliation-2026-10-08.md](channel-reconciliation-2026-10-08.md) for all 31 queue objects.

Production-shaped offline rehearsal:

- 31 canonical rows; proposed workspace sections: Work 7 / Held 2 / Published queue records 15 / Archive 7.
- Channel history: 61 message observations, 31 with text. Published combined view: 31 entries.
- Exactly one semantic suggestion: post 77 → CNT-20260913-COMP-RESULT, score 0.9565. This is a candidate, not proof from a score; factual identity is corroborated by 13 September / “Сильные духом” / 105 kg / second place / first rank. Texts differ; actual edition vs replaced draft remains an owner choice.
- Zero automatic canonical queue changes in the history rehearsal. Existing series-06 diaries and 107.5 kg decision remain Held; published post 79 remains protected.
- Older unpublished ideas remain intact until the owner chooses their fate; age alone does not imply cancellation.

The import helper stores historic observations only, six per invocation, with an audited per-message identity and verified checkpoint. It resumes safely after interruptions; uncertain audit results stop rather than replay. Historical media bytes and paths are not imported.

## Validation

- Node: 129 test-runner cases pass, including signature and stale-state protection, archive/restore, manual link, duplicate matches, observed edits, maximum text/callback limits, transport spool, history batches, private notifications, poll isolation and publication guards; legacy transport/callback/preview tests also retained. All network/Sheets/Drive/Telegram calls mocked; no live publication.
- Python: 86 tests pass, including Streamlit navigation/rendering of the new Materials page, lifecycle and signing contract.
- JavaScript syntax checks pass for both main sources and historical helper.
- Production-shaped 31-row/61-observation rehearsal does not modify queue rows or call channel transports.
- Live membership, webhook subscription, channel update receipt, installed versions and runtime readback remain acceptance checks after authorized installation. No claim of operational connection is made yet.

## Exact installation sequence after owner authorization

1. Re-read base/head/CI and production component versions. Capture rollback source and verify the current queue has no new schedule/publication conflicts. Preserve unpublished edits.
2. Replace the existing Content API main source with this PR's `automation/content_control_api_v0_4.gs`, verify source hash, deploy a new version of the same existing Web App. Do not create another project or URL. Run read-only preflight; expect 0.6.1 and `publication.channel_reconcile`.
3. Replace existing Owner Bot main source with this PR's `automation/owner_bot_v1.gs`, verify source hash, deploy a new version of the same Web App. Preserve pairing, hooks, action/sent-state flags and the existing single Poll trigger. Do not run legacy Install/Enable helpers.
4. Merge the exact authorized PR head into the existing content production branch; verify Streamlit Content Control 0.5.8 and private navigation. No scheduling buttons are used in acceptance.
5. Add `automation/channel_history_import_20261008.gs` as a helper in the existing API editor (without redeploying the Web App merely for that helper). Run `rformChannelHistoryImport20261008` until remaining=0, checking each returned checkpoint; expect 61 observations. Do not run this helper on an older API.
6. Run `rformOwnerBotV1EnableChannelSync` only after deployment, with a confirmed existing channel membership. It checks exact channel and member identity, updates the existing webhook with drop_pending_updates=false, verifies subscription/readback and enables channel capture. It does not add a trigger or grant posting privileges. If access is absent, owner action to add the existing bot to the channel is the only required dependency; do not silently grant permissions.
7. Verify private /queue, archived search/card/restore, Published combined history, protected held/published objects, version response and one existing Poll run. To accept real channel capture without a new publication, use an owner-authorized edit of an existing post if needed; do not fabricate a new post or alter public content solely for a test without authorization.
8. Confirm the desired relation of post 77 and the competition draft once in the bot; verify queue/log readback and no schedule. Optional obsolete draft decisions can be given as one batch instead of individually.

## Rollback

- Disable RFORM_OWNER_CHANNEL_SYNC_ENABLED; keep observation/audit history intact. Restore only the old allowed_updates on the same webhook with drop_pending_updates=false if required.
- Point existing API deployment back to version 14 and Bot deployment back to version 6; restore captured editor sources if needed. Existing URLs, pairing and triggers remain.
- Revert Streamlit changes through a normal reviewed revert commit; no force push.
- Never roll back or delete factual publication history merely to roll back code. Record/outcome-unknown reconciliation requires row and action-log readback before any manual repeat.

## Authorization boundary

The owner's command authorizes reversible implementation and reconciliation preparation. New production merge/replacement/deployment requires exact owner authorization under rform-operating-system references/workflows-code-release.md. No earlier 1.1.0/0.6.0 permission is reused for 1.2.0/0.6.1.
