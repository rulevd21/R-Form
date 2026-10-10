# R/Form production safety

These rules apply to every Cline task in this repository.

## Scope

- The production system is R/Form. `commercial-wines/` and `life-planner/` are unrelated workloads; do not modify them unless the owner explicitly asks.
- Treat `RFORM_RUNTIME_MANIFEST.json`, `docs/governance/`, exact Git commits, and live runtime readback as the governance chain. Live runtime evidence overrides stale documentation.
- A merged commit is not deployed. A deployed commit is not verified until readback and acceptance pass.

## Secrets and private runtime data

- Never commit, print, paste into a PR, or expose in chat: `.clasprc.json`, OAuth tokens/codes/redirect URLs, Apps Script project IDs, deployment IDs, private GitHub tokens, Telegram tokens, or newly discovered private identifiers.
- Runtime pulls from Google Apps Script must remain outside the repository under `$HOME/.rform-cline/` (or another private temporary directory) with restrictive permissions.
- Do not add runtime source snapshots to the public repository.

## Apps Script production rules

- Always `clasp pull` the live project before proposing or applying a production change.
- Locate target files by stable source anchor, never by guessed filename alone.
- Detector has a known live-only handler `rformContentEventDetectorTickV03`. Preserve it. Never replace the Detector file wholesale with the historical PR #13 snapshot.
- Reconcile Detector changes as a minimal patch on top of the pulled live source. After patching, require `rformContentEventDetectorTickV03` to remain present and require the PR #13 receipt markers (`RFORM_DETECTOR_RUN`, `observability_version:'0.1'`) to be present.
- For Content API 0.7.0 / automatic training cards, use the exact reviewed Git source and preserve the existing production deployment in place. Do not create a parallel production API.
- During acceptance, publication must stay disabled. Do not approve, schedule, or send Telegram posts unless the owner explicitly requests publication in the current task.

## Change control

- Before any production write, create a rollback point and record the current runtime SHA-256.
- After any write, pull again and require exact source readback.
- If runtime drift, ambiguous project discovery, multiple anchor matches, missing rollback evidence, or an unexpected trigger/deployment state is observed: stop the write path and report the blocker. Never overwrite ambiguity.
- Move the `production` branch or mark a component `VERIFIED_PRODUCTION` only after runtime acceptance evidence exists.
- Never claim an operation succeeded based only on a Git merge, local test, or intended command.
