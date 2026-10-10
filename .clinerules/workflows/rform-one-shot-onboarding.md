# R/Form one-shot onboarding and production recovery

Use this workflow when the owner asks to connect Cline Cloud to R/Form or to continue the pending Apps Script production recovery with minimal owner participation.

## Goal

Prepare an authenticated, private Apps Script runtime session; collect live evidence for Detector and Content API; preserve live-only Detector logic; and continue the remaining rollout only through guarded, reversible steps.

## Step 1 — Read the operating contract

Read:

- `.clinerules/01-rform-production-safety.md`
- `.clinerules/02-rform-cloud-operator.md`
- `RFORM_RUNTIME_MANIFEST.json`
- `docs/governance/APPS_SCRIPT_GITHUB_DEPLOYMENT.md`
- `docs/governance/DETECTOR_RUNTIME_RECONCILIATION_20261009.md` if present
- `docs/governance/TRAINING_CARDS_070_PRODUCTION_PREFLIGHT_20261009.md` if present

Do not assume the manifest is runtime truth where later evidence contradicts it.

## Step 2 — Prepare the private runtime session

Run:

```bash
bash scripts/cline/rform-cloud-onboard.sh
```

If it pauses for Google OAuth, ask the owner only to open the authorization URL and approve the Google account used for R/Form. Do not ask the owner to run terminal commands. Resume the waiting terminal after the one-time OAuth response is provided inside the Cline session.

If Apps Script API is disabled, give the owner the single Google Apps Script settings action printed by the script, then rerun the same script yourself.

Do not proceed until the script ends with:

```text
READY: R/Form Cline Cloud runtime session prepared.
```

Read the private `report.json` path printed by the script. Do not commit it.

## Step 3 — Reconcile Detector safely

The pulled Detector runtime is the base. Never overwrite it with a historical repository snapshot.

1. Record the live Detector target SHA-256 from the private report.
2. Confirm `rformContentEventDetectorTickV03` remains present in the live source.
3. Materialize the reviewed Detector observability source from exact Git ref `1b0474f4fa2616af5c6353650246476b67981774` only as reference material.
4. Compute the relevant diff against its prior reviewed baseline and port only the PR #12/#13 changes onto the pulled live Detector target.
5. Preserve all live-only functions, especially `rformContentEventDetectorTickV03`.
6. Require the patched candidate to contain:
   - `rformContentEventDetectorTickV03`
   - `RFORM_DETECTOR_RUN`
   - `observability_version:'0.1'`
   - `rformContentEventDetectorWriteV03`
7. Use `scripts/apps-script/guard.mjs` against the pulled project with the recorded runtime SHA-256 so exactly one source file can change.
8. Create a rollback Apps Script version before `clasp push`.
9. Push, pull again, and verify exact source hash readback.
10. Do not change trigger count/cadence/handler during source reconciliation.

If an acceptance execution path (`clasp run` or an already-existing safe executable/deployment path) is not available, do not invent a new public endpoint just for testing. Record `DEPLOYED_NOT_VERIFIED` and stop promotion until runtime behavior can be observed safely.

## Step 4 — Content API 0.7.0 / automatic cards

Only after Detector is reconciled or explicitly isolated as a separate blocked component:

1. Pull live Content API and record its target SHA-256 and deployment inventory.
2. Materialize exact reviewed source commit `5550d3c423294fd89c980d08ce019808b735c434`, path `automation/content_control_api_v0_4.gs`.
3. Use the deployment guard with the recorded runtime hash. Replace only the source file identified by anchor `RFORM_CONTENT_API_V04`.
4. Create rollback version first.
5. Push source and update the existing production web-app deployment in place; never create a parallel production API.
6. Pull again and require exact source readback.
7. Run available safe acceptance checks in this order:
   - `rformContentApiV04Preflight()` => version `0.7.0`, no schema/access regressions;
   - `rformContentApiV04EnableTrainingCards()` => baseline preserved, automatic cards true, publication disabled;
   - `rformContentApiV04TrainingCardsSelfCheck()` => exact `14` sets, `5` exercises, bench `1920`, total `8610`;
   - private owner-preview path only.
8. Never approve/schedule/publish during acceptance.

If functions cannot be executed safely from the available runtime interface, retain the exact readback evidence but classify the component no higher than `DEPLOYED_NOT_VERIFIED`.

## Step 5 — Governance update

Only after each component has matching runtime evidence:

- update `RFORM_RUNTIME_MANIFEST.json` to the state actually proven;
- move `production` only if the repository baseline represented by that ref has completed runtime acceptance;
- add concise GitHub evidence to the relevant PR/issue;
- run repository CI and governance checks;
- commit and push only governance/documentation changes that are supported by runtime evidence.

## Completion report

Return a compact table with `Detector`, `Content API`, `Training Cards`, `production ref`, and `publication`, each showing one of: `VERIFIED_PRODUCTION`, `DEPLOYED_NOT_VERIFIED`, `BLOCKED`, or `UNCHANGED`.

Do not report success for a component whose runtime acceptance did not pass.
