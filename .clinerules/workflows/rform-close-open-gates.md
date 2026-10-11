# R/Form · close remaining privileged gates

Use this workflow only when the owner explicitly asks to complete the remaining open R/Form tasks: Stage 3 runtime acceptance (#42), repository protection (#56), Telegram metrics runtime activation (#57), and Commercial Wines migration (#55).

## Hard boundaries

- Use a Cline Cloud model explicitly marked `FREE`. Stop before spending paid Cline credits.
- Work only in `rulevd21/R-Form` and the new `rulevd21/commercial-wines` destination created by this workflow.
- Never print Apps Script project IDs, OAuth material, GitHub tokens, deployment IDs, Telegram secrets, or private URLs.
- Never weaken acceptance gates just to close an issue.
- Never mark a runtime component `VERIFIED_PRODUCTION` without runtime evidence.
- Never delete `commercial-wines/` from R/Form before the destination repository and public artifact are byte-verified.
- Never backfill Telegram 24h/72h/7d metrics from a later cumulative counter.
- Preserve one canonical datastore, one publisher, and Owner Bot as the only owner cockpit.

## Step 0 — prepare one authenticated runtime session

From a clean checkout of current `main`:

```bash
bash scripts/cline/rform-cloud-onboard.sh
```

If the script asks for Google OAuth, request only that unavoidable owner approval and then resume the same terminal session. If it says Apps Script API is disabled, request only the settings action printed by the script.

Do not continue until it prints:

```text
READY: R/Form Cline Cloud runtime session prepared.
```

## Step 1 — close Stage 3 runtime acceptance (#42)

Run:

```bash
bash scripts/cline/verify-capture-closure-events-v1.sh
```

Pass criteria are strict:

- at least one complete natural `INSTALLABLE_EVENT` START/FINISH receipt for detector `0.4`, lifecycle `1.0`, observability `0.1`;
- at least one scheduled `NO_OP` receipt with `mutation_count=0`;
- no receipt outcome `ERROR` is used as acceptance evidence.

The real post-cutover closure/business readback is already recorded in Issue #42 and must remain intact: accepted `D-20261010` closure produced deterministic day and nutrition lifecycle events without duplicates.

If the script passes, create a small governance branch from latest `main` and update only the `content_event_detector` entry in `RFORM_RUNTIME_MANIFEST.json`:

- `production_version`: `0.4 / lifecycle 1.0 + observability 0.1`;
- `source_ref`: reviewed PR #43 source commit `503dbd4c4b924fbe6299c8eb06ba807746cf6196`;
- `status`: `VERIFIED_PRODUCTION`;
- `last_verified`: current date;
- `deployment_evidence`: include PR #43 guarded in-place rollout plus the scheduled START/FINISH + NO_OP acceptance;
- notes must state that the existing 6-hour `rformContentEventDetectorWriteV03` trigger was preserved and that only `DATA_EVENTS` is mutated by the detector.

Increment only the manifest patch version, run repository tests, open a PR, wait for `R/Form required PR gate`, merge normally, then close Issue #42 with the merged manifest commit and safe acceptance evidence.

If native receipts are unavailable, stop #42 as `DEPLOYED_NOT_VERIFIED`; do not edit the manifest and do not close the issue.

## Step 2 — apply GitHub governance (#56)

Only after the universal `R/Form required PR gate` workflow is present on `main`, run:

```bash
bash scripts/cline/apply-rform-rulesets.sh
```

Expected readback:

```text
RULESET_READBACK: PASS
DONE: main and production rulesets are active.
```

Then inspect repository rulesets with `gh api repos/rulevd21/R-Form/rulesets` and verify two active branch rulesets exist:

1. `R/Form main protection`
   - target `refs/heads/main`;
   - pull request required;
   - required check `R/Form required PR gate`;
   - deletion blocked;
   - non-fast-forward/force pushes blocked;
   - admin role bypass exists only for emergency restoration/governed release.

2. `R/Form production ref protection`
   - target `refs/heads/production`;
   - deletion blocked;
   - non-fast-forward/force pushes blocked;
   - ordinary updates restricted; admin bypass is reserved for governed release after runtime acceptance.

Post a concise readback to Issue #56 and close it only when the API returns both active rulesets.

## Step 3 — deploy Telegram Content Metrics v1 (#57)

The reviewed source is already on `main` at `automation/telegram_content_metrics_v1.gs` and passed dedicated CI before merge.

Run:

```bash
bash scripts/cline/deploy-telegram-metrics-v1.sh
```

This must:

- add the metrics source only to the already-discovered Content API Apps Script project;
- preserve the existing Content API source/deployment;
- create a rollback version before first push;
- pull back and require exact source hash readback;
- attempt to install exactly one six-hour metrics trigger;
- never call Telegram write/Bot API methods and never change `CONTENT_QUEUE` publication state.

If the script returns:

```text
OWNER_ACTION_REQUIRED: RUN_APPS_SCRIPT_FUNCTION_rformTelegramMetricsInstallTriggerV1
```

request only this one unavoidable owner action in the existing Content API Apps Script project: run `rformTelegramMetricsInstallTriggerV1` once, then inspect triggers and require exactly one `rformTelegramMetricsCollectV1` clock trigger. Do not ask for project IDs or credentials in chat.

After trigger installation, do not manufacture an acceptance sample. Wait for/inspect only a naturally published `Content_ID` whose exact `Posted_At` places it inside a valid observation window:

- 24–<36h;
- 72–<96h;
- 168–<192h.

A production acceptance pass requires:

1. public Telegram source exposes the exact post and an observed views counter;
2. collector writes the matching checkpoint to the same `Content_ID` row in `CONTENT_REGISTRY` with `Metrics_Source=TELEGRAM_PUBLIC_WEB_PREVIEW` and actual `Metrics_Observed_At`;
3. unavailable counters stay blank, not zero;
4. immediate rerun leaves the completed checkpoint unchanged;
5. no experiment is concluded unless its own metric and minimum-sample contract is met.

Only then close #57. If no eligible natural checkpoint exists in this execution session, leave #57 open with status `DEPLOYED_AWAITING_NATURAL_CHECKPOINT`; do not fabricate timing or values.

## Step 4 — migrate Commercial Wines (#55)

Run only after #56 protection is active:

```bash
bash scripts/cline/migrate-commercial-wines.sh
```

The script is fail-closed and must perform this order:

1. split `commercial-wines/` history from current R/Form `main`;
2. create/reuse public `rulevd21/commercial-wines`;
3. push subtree history as destination `main`;
4. byte-verify destination `index.html` against R/Form source;
5. enable GitHub Pages from `main` root;
6. require the public Pages artifact to return the exact same bytes;
7. only then create a normal cleanup PR removing active `commercial-wines/` from R/Form;
8. wait for `R/Form required PR gate`, merge, reverify destination, and close #55.

If destination or Pages verification fails, preserve the source subtree and leave #55 open.

## Step 5 — final readback

Run these checks without mutating anything:

```bash
gh issue view 42 -R rulevd21/R-Form --json state,url
gh issue view 55 -R rulevd21/R-Form --json state,url
gh issue view 56 -R rulevd21/R-Form --json state,url
gh issue view 57 -R rulevd21/R-Form --json state,url
gh api repos/rulevd21/R-Form/rulesets --jq '.[] | {name,enforcement,target}'
git fetch origin main production --prune
git log -1 --oneline origin/main
git log -1 --oneline origin/production
```

Expected final state:

- #42 CLOSED only if native scheduled receipt + NO_OP acceptance passed and manifest promotion merged;
- #56 CLOSED with both rulesets API-verified;
- #55 CLOSED only after destination + Pages byte verification and cleanup PR merge;
- #57 CLOSED only after a real source-backed in-window checkpoint + no-op rerun; otherwise OPEN with `DEPLOYED_AWAITING_NATURAL_CHECKPOINT`.

Do not move `production` merely because repository housekeeping or metrics code merged. Move it only if the repository baseline being represented has separately satisfied its governed runtime acceptance policy.
