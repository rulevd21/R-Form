# Cline Cloud one-shot onboarding for R/Form

Status: repository preparation for browser/mobile Cline Cloud execution.

## Why this exists

The owner should not need to operate Codespaces, a terminal, `clasp`, GitHub Actions inputs, Apps Script project IDs, or deployment IDs manually. Cline Cloud can work from the browser/mobile UI against one selected GitHub repository and execute shell commands inside its cloud sandbox. The only expected owner action is an external consent step that Google itself requires.

## Repository integration

R/Form ships:

- `.clinerules/01-rform-production-safety.md` — always-on production and secret boundaries;
- `.clinerules/02-rform-cloud-operator.md` — minimum-owner-interaction behavior;
- `.clinerules/workflows/rform-one-shot-onboarding.md` — the end-to-end operational playbook;
- `scripts/cline/rform-cloud-onboard.sh` — authenticated project discovery + private runtime pull + evidence collection;
- existing `scripts/apps-script/guard.mjs` and `.github/workflows/apps-script-production.yml` — guarded apply/readback path.

Cline workspace workflows are version-controlled under `.clinerules/workflows/`. The owner can invoke the onboarding workflow from a Cline task instead of reproducing implementation steps.

## Owner flow

1. Sign in to Cline Cloud and connect GitHub.
2. Select only `rulevd21/R-Form`, branch `main`.
3. Start the workspace workflow `rform-one-shot-onboarding.md` (or tell Cline to run the R/Form one-shot onboarding workflow).
4. If Google asks for OAuth consent, approve it once. Do not paste long-lived credentials or project IDs into chat.
5. Let Cline continue through inspection and the guarded recovery gates.

No local IDE, Codespaces terminal, or iPhone shell is required.

## Security model

- Cline's repository token remains scoped to the selected repository.
- Google Apps Script source pulled by `clasp` is stored outside the Git worktree in `$HOME/.rform-cline/` with private permissions.
- The onboarding script never prints project IDs or OAuth credentials.
- If the Cline GitHub token can administer the `production-apps-script` environment, the script persists the existing three protected deployment secrets there. If not, it continues in session-only mode rather than requesting repository-admin credentials.
- Production writes remain separately guarded by runtime SHA-256, single-file change enforcement, rollback, and readback.

## Current recovery-specific constraint

Detector runtime is known to contain live-only `rformContentEventDetectorTickV03`. Historical PR #13 is reference material only. Any reconciliation must patch the pulled live source and preserve that handler.

Content API 0.7.0 / automatic training cards may use exact reviewed source commit `5550d3c423294fd89c980d08ce019808b735c434`, but production status may only be promoted after actual runtime readback and acceptance. Publication must remain disabled during acceptance.

## Expected onboarding result

The bootstrap must end with:

```text
READY: R/Form Cline Cloud runtime session prepared.
```

The private `report.json` contains only operational evidence such as target hashes and marker presence. It does not contain Apps Script IDs, tokens, or source bodies.

If an external runtime acceptance path is unavailable, Cline must stop at `DEPLOYED_NOT_VERIFIED` rather than manufacture a verification claim.
