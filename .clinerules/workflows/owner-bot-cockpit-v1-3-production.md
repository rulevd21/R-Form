# Owner Bot Cockpit v1.3 — one-shot production workflow

Use this workflow only for PR #35 / `feature/owner-bot-cockpit-v1-3`.

## Non-negotiable safety

- Use a FREE model only.
- Do not scan the whole repository.
- Do not print Script IDs, deployment IDs, OAuth credentials, bot tokens, private URLs, chat IDs or Script Property values.
- Do not create a new bot, datastore, Apps Script project, web-app deployment, trigger or Telegram publisher.
- Do not alter Content API, Telegram Autopost, Detector, Training, canonical schema or publication rows.
- Do not click or simulate content/event decisions during acceptance.
- Preserve existing Owner Bot pairing, Script Properties, webhook, channel-sync setting, poll trigger and deployment URL.
- On runtime/source drift: fail closed and stop.

## Phase A — materialize the reviewed candidate

1. `git fetch origin`.
2. Checkout `feature/owner-bot-cockpit-v1-3` and fast-forward it.
3. Require clean worktree before mutation.
4. Run:
   `node scripts/release/apply-owner-bot-cockpit-v1-3.mjs --apply`
5. Run:
   `node --test tests/owner-bot-cockpit-v1-3.test.mjs`
6. Run existing deployment-guard tests.
7. Confirm the only intended new change from Phase A is `automation/owner_bot_v1.gs` and that it contains `version: '1.3.0'` plus the `oc:` cockpit route.
8. Commit that file only with message:
   `feat: route Owner Bot daily commands to Cockpit v1.3`
9. Push the same feature branch.
10. Wait for PR #35 checks. Require `Apps Script Deployment CI = success`.

## Phase B — merge reviewed source

1. Inspect PR #35 changed files/diff. Confirm no secret/private identifier was added and the architectural boundary above is intact.
2. Mark PR #35 ready for review if still draft.
3. Merge PR #35 into `main` only if required checks are green.
4. Checkout/fetch the exact merged `origin/main` and require a clean worktree.
5. Do not update the runtime manifest yet.

## Phase C — authenticated runtime inspect

1. Reuse the existing clasp OAuth session. Do not request new OAuth unless the stored authorization is actually invalid.
2. Run:
   `bash scripts/apps-script/owner-bot-cockpit-v1-3-runtime.sh inspect`
3. Require all of:
   - clasp authorization PASS;
   - exactly one live Owner Bot v1.2.4 project found;
   - live core SHA-256 equals the accepted baseline;
   - exactly one existing deployment at version 11;
   - inspect completes without writes.
4. If any check fails, stop and report only safe status lines.

## Phase D — in-place rollout

The owner's explicit instruction to execute Owner Bot Cockpit v1.3 authorizes this release, subject to the gates above.

Run exactly:

`RFORM_OWNER_BOT_COCKPIT_CONFIRM='APPLY OWNER BOT COCKPIT 1.3.0' bash scripts/apps-script/owner-bot-cockpit-v1-3-runtime.sh apply`

Require:
- exact source readback of both v1.3 files;
- the existing deployment advances in place;
- web-app GET reports `R/Form Owner Bot v1.3.0`;
- no new deployment URL/project/trigger is created;
- rollout ends with `RUNTIME_DEPLOYED_AWAITING_OWNER_ACCEPTANCE`.

If the rollout fails, allow the script's rollback path to run and do not retry automatically.

## Phase E — stop for one owner smoke action

At this point, do not perform content/event actions. Tell the owner only:

`OWNER_ACTION_REQUIRED: send /today once in the existing private R/Form Owner Bot chat and return the resulting cockpit screenshot/text.`

The expected private cockpit contains:
- `R/Form · Сегодня`;
- Closure state;
- DATA_EVENTS count and owner-gate count;
- Content Queue count and final-preview count;
- `Нужно от вас` with at most 3 owner-required actions;
- `Обновить` and `Материалы` controls.

No publication or canonical mutation is part of this smoke acceptance.
