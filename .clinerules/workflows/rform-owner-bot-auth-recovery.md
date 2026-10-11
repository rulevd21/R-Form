# R/Form · restore Owner Bot ↔ Content API signed pairing

Use this workflow only when the owner explicitly asks to restore the existing signed connection between the existing R/Form Owner Bot and Content Control API projects, then verify Owner Bot preflight and polling. This workflow is for Issue #69.

## Execution boundary

- Use **Cline Cloud** with a model explicitly marked `FREE`. Stop before spending Cline credits.
- Work only in `rulevd21/R-Form` and the two existing Google Apps Script projects already identified as the production Content Control API and Owner Bot.
- Do not create a new Apps Script project, new deployment URL, new Telegram bot, new trigger, new datastore, new publisher or new secret name.
- Do not move the `production` ref.
- Never print, paste, log, commit, echo or place in chat any secret value, OAuth material, Apps Script project ID, deployment ID, Telegram token, webhook secret or private URL.
- Do not call `rformContentApiV04CreateSecret()`; it logs the generated secret and would rotate credentials unnecessarily.
- Preserve existing owner pairing, Telegram webhook, poll trigger and publisher boundaries.

## Known starting state

- Issue #69 is the canonical gate.
- Content API `0.8.0 / closed loop 1.1.0` is installed in the existing Content API deployment.
- Owner Bot Cockpit `1.7.0` is installed in the existing Owner Bot deployment.
- Exact source readback and required CI passed before this workflow.
- The Owner Bot API address already points to the updated existing Content API deployment.
- Signed Owner Bot reads are rejected because the existing paired `RFORM_CONTENT_API_SECRET` values do not match.
- Canonical readback before recovery shows the last successful `BOT_PREVIEW_SENT` at `2026-10-09 08:12:14` for `CNT-20261009-S-20261009-C`.
- That Content_ID is currently again at `OWNER_FINAL_PREVIEW`, updated on `2026-10-11`, with owner approval/publication still closed. A post-recovery poll therefore has an observable acceptance target without fabricating a new fact.

## Step 0 — prepare authenticated cloud session

From a clean checkout of current `main`:

```bash
bash scripts/cline/rform-cloud-onboard.sh
```

If Google OAuth is required, request only that owner approval. Do not ask the owner to paste credentials into Cline chat. If the Apps Script API is disabled, request only the one settings action printed by the bootstrap.

Require:

```text
READY: R/Form Cline Cloud runtime session prepared.
```

Then discover the existing Owner Bot project read-only using `clasp list-scripts --json` plus temporary pulls. Select exactly one project whose pulled source defines both:

```text
const RFORM_OWNER_BOT_V1 = Object.freeze
const RFORM_OWNER_COCKPIT_V13 = Object.freeze
```

Do not print its project ID. Keep all discovery material in a private temporary directory and remove it at workflow end.

## Step 1 — re-confirm runtime identity without mutation

For the discovered existing projects, pull current source and confirm:

- Content API source defines `RFORM_CONTENT_API_V04` with `version: '0.8.0'`;
- Owner Bot cockpit source defines `RFORM_OWNER_COCKPIT_V13` with `version: '1.7.0'`;
- Owner Bot core still requires the property name `RFORM_CONTENT_API_SECRET`;
- Content API still uses the same property name `RFORM_CONTENT_API_SECRET` as `secretProperty`;
- existing deployment URLs are preserved;
- exactly one existing `rformOwnerBotV1Poll` trigger is expected; do not reinstall it during auth recovery.

If any identity check fails, stop without modifying Script Properties.

## Step 2 — reconcile the existing shared secret securely

The current Content API project's `RFORM_CONTENT_API_SECRET` is the source of truth. Do **not** rotate it.

Because Apps Script Script Properties are deliberately not committed to Git and are not exposed by normal source pull, request exactly one unavoidable owner secure-settings action:

```text
OWNER_ACTION_REQUIRED: In Google Apps Script Project Settings, copy the CURRENT value of RFORM_CONTENT_API_SECRET from the existing Content Control API project into the RFORM_CONTENT_API_SECRET property of the existing Owner Bot project, then save. Do not paste the value into Cline/chat. Do not change any other property.
```

The owner should perform this within Google Apps Script secure settings only. Do not request the value itself. Do not regenerate either side.

After the owner confirms the settings action is complete, continue in the same Cline task.

## Step 3 — verify signed Owner Bot preflight

First try to execute the existing `rformOwnerBotV1Preflight()` through already-authorized Apps Script tooling without changing deployments or adding an API-executable deployment.

If the current project does not support remote function execution, request only this fallback owner action in the existing Owner Bot Apps Script editor:

```text
OWNER_ACTION_REQUIRED: Run rformOwnerBotV1Preflight() once in the existing Owner Bot project. Do not change code or deployment. Return only whether it PASSed; do not paste logs containing private values.
```

Preflight acceptance requires all of the following:

- `ok=true`;
- Content API signed read succeeds;
- `contentApiVersion` is `0.8.0`;
- owner remains paired;
- poll trigger count is exactly `1`;
- bot remains enabled as configured before the auth failure;
- no new webhook/deployment/publisher is created;
- no credential value is emitted.

If signed read is still rejected, stop and leave Issue #69 open. Do not rotate secrets automatically.

## Step 4 — verify Owner Bot poll

After preflight passes, invoke `rformOwnerBotV1Poll()` through existing authorized tooling if possible. If direct invocation is unavailable, do not add a deployment or trigger; wait for the already-existing five-minute poll trigger.

Use canonical Master Data readback to verify that a new `BOT_PREVIEW_SENT` is recorded after the auth recovery for the currently eligible owner-preview packet, or for the next naturally eligible packet if the current one is no longer eligible.

For the current acceptance target, compare against the pre-recovery baseline:

```text
Content_ID: CNT-20261009-S-20261009-C
previous latest BOT_PREVIEW_SENT: 2026-10-09 08:12:14
```

Require a strictly later `BOT_PREVIEW_SENT` generated by `OWNER_BOT`. Do not manufacture an audit row.

Immediately run/observe one repeat poll and require idempotency: the same preview fingerprint must not create a duplicate `BOT_PREVIEW_SENT`.

## Step 5 — record safe evidence

Post a concise comment to Issue #69 containing only:

- auth pairing reconciled: PASS/FAIL;
- signed preflight: PASS/FAIL;
- Content API version observed;
- Owner Bot version observed;
- poll trigger count;
- post-recovery `BOT_PREVIEW_SENT` Content_ID and timestamp, if observed;
- repeat poll idempotency: PASS/FAIL;
- any remaining positive-path acceptance gate.

Never include project IDs, deployment IDs, URLs, secret values, tokens or OAuth material.

Do not close Issue #69 merely because authentication is restored. Close it only when the complete Issue #69 acceptance contract is satisfied, including the required natural positive fact → complete packet → QA → private preview path and idempotent repeat.

## Final state for this task

This recovery task is complete when:

```text
OWNER_BOT_AUTH: PASS
SIGNED_PREFLIGHT: PASS
OWNER_BOT_POLL: PASS
POLL_IDEMPOTENCY: PASS
```

If the broader natural positive-path acceptance is not yet complete, leave Issue #69 open and report the exact remaining gate.