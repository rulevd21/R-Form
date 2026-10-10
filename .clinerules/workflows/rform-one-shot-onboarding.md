# R/Form one-shot onboarding and production recovery

Use this workflow when the owner asks to connect Cline Cloud to R/Form or continue the pending Apps Script production recovery with minimum owner participation.

## Hard cost/context gate

Before doing any repository analysis:

- Use a model explicitly marked `FREE` in Cline Cloud. If the active model is not free, stop immediately with `OWNER_ACTION_REQUIRED: SELECT_FREE_MODEL`; do not spend paid Cline credits.
- Do not recursively scan, index, summarize, or read the whole repository.
- Do not paste full Apps Script sources, large diffs, or command logs into model context.
- Prefer deterministic shell commands, hashes, `grep`, targeted `git show`, and repository scripts.
- Before the private runtime session is ready, the only repository file you need to execute is `scripts/cline/rform-cloud-onboard.sh`.
- Keep owner interaction limited to unavoidable Google OAuth/consent.

## Step 1 — Bootstrap immediately

Do not read governance documents first. Run immediately:

```bash
bash scripts/cline/rform-cloud-onboard.sh
```

If it pauses for Google OAuth, ask the owner only to open the authorization URL and approve the Google account used for R/Form. Do not ask the owner to run terminal commands. Resume the waiting terminal after the one-time OAuth response is returned to the active Cline session.

If Apps Script API is disabled, give the owner only the single Google Apps Script settings action printed by the script, then rerun the same script yourself.

Do not proceed until the script ends with:

```text
READY: R/Form Cline Cloud runtime session prepared.
```

Read only the private `report.json` path printed by the script. Do not commit it and do not print secrets/project IDs.

## Step 2 — Load only the minimum operating contract

After `READY`, read only:

- `.clinerules/01-rform-production-safety.md`
- `RFORM_RUNTIME_MANIFEST.json`
- `docs/governance/DETECTOR_RUNTIME_RECONCILIATION_20261009.md` if needed for the Detector gate
- `docs/governance/TRAINING_CARDS_070_PRODUCTION_PREFLIGHT_20261009.md` only when entering the Content API gate

Do not read unrelated top-level projects or historical discussions.

## Step 3 — Reconcile Detector safely

The pulled Detector runtime is the base. Never overwrite it with a historical repository snapshot.

1. Record the live Detector target SHA-256 from the private report.
2. Confirm `rformContentEventDetectorTickV03` remains present in the live source using `grep`; do not load the full source into chat.
3. Use exact Git refs as merge inputs:
   - pre-PR12 base: `5bf96eed801a2eb1669d576f777b3c5db1ef4ae7`
   - reviewed PR12 merge: `365215bf6c414fbf538034169cb42d5f6672934d`
   - reviewed PR13 source: `1b0474f4fa2616af5c6353650246476b67981774`
4. Prefer a deterministic three-way merge/patch against the pulled live file. Preserve all live-only functions, especially `rformContentEventDetectorTickV03`. If the merge conflicts, stop this component rather than guessing.
5. Require the patched candidate to contain all of:
   - `rformContentEventDetectorTickV03`
   - `RFORM_DETECTOR_RUN`
   - `observability_version:'0.1'`
   - `rformContentEventDetectorWriteV03`
   - the PR12 no-op counters `unchanged` and `filteredUnchanged`
6. Use `scripts/apps-script/guard.mjs` with the recorded runtime SHA-256 so exactly one source file can change.
7. Create a rollback Apps Script version before `clasp push`.
8. Push, pull again, and verify exact source hash readback.
9. Do not change trigger count/cadence/handler during source reconciliation.

If an acceptance execution path is not available, record `DEPLOYED_NOT_VERIFIED`; do not create a new public endpoint merely for testing.

## Step 4 — Content API 0.7.0 / automatic cards

Only after Detector is reconciled or explicitly isolated as a separate blocked component:

1. Pull live Content API and record its target SHA-256 and deployment inventory using shell output only.
2. Materialize exact reviewed source commit `5550d3c423294fd89c980d08ce019808b735c434`, path `automation/content_control_api_v0_4.gs`, without loading the whole file into model context.
3. Use the deployment guard with the recorded runtime hash. Replace only the source file identified by anchor `RFORM_CONTENT_API_V04`.
4. Create rollback version first.
5. Push source and update the existing production web-app deployment in place; never create a parallel production API.
6. Pull again and require exact source readback.
7. Run available safe acceptance checks in this order:
   - `rformContentApiV04Preflight()` => version `0.7.0`, no schema/access regressions;
   - `rformContentApiV04EnableTrainingCards()` => baseline preserved, automatic cards true, publication disabled;
   - `rformContentApiV04TrainingCardsSelfCheck()` => exact `14` sets, `5` exercises, bench `1920`, total `8610`;
   - private owner-preview path only.
8. Never approve, schedule, or publish during acceptance.

If functions cannot be executed safely from the available runtime interface, retain exact readback evidence but classify the component no higher than `DEPLOYED_NOT_VERIFIED`.

## Step 5 — Governance update

Only after each component has matching runtime evidence:

- update `RFORM_RUNTIME_MANIFEST.json` to the state actually proven;
- move `production` only if the represented repository baseline completed runtime acceptance;
- add concise GitHub evidence to the relevant PR/issue;
- run repository CI/governance checks;
- commit and push only evidence-supported governance/documentation changes.

## Completion report

Return only a compact table with `Detector`, `Content API`, `Training Cards`, `production ref`, and `publication`, each as `VERIFIED_PRODUCTION`, `DEPLOYED_NOT_VERIFIED`, `BLOCKED`, or `UNCHANGED`.

Do not report success for a component whose runtime acceptance did not pass.