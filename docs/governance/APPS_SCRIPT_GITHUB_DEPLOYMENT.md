# GitHub -> Google Apps Script production deployment

Status: ACTIVE deployment mechanism candidate  
Scope: R/Form Apps Script production components  
Workflow: `.github/workflows/apps-script-production.yml`

## Purpose

This workflow removes the browser from normal R/Form Apps Script releases while preserving the production-governance rule:

`read runtime -> compare -> apply exact reviewed source -> readback -> verify -> record evidence`

It is intentionally manual (`workflow_dispatch`) and never runs on push, pull request, schedule, or merge.

## Supported components

| Component | Git source path | Runtime anchor | Runtime action |
| --- | --- | --- | --- |
| `detector` | `automation/content_event_detector_v0_3.gs` | `rformContentEventDetectorWriteV03` | replace guarded source only; existing triggers are not created, deleted, or edited |
| `content-api` | `automation/content_control_api_v0_4.gs` | `RFORM_CONTENT_API_V04` | replace guarded source, then update the existing deployment in place |

The workflow itself must be dispatched from `main`. Deployment tooling is checked out from the exact workflow-run SHA on `main`; the reviewed candidate is then materialized separately from the exact 40-character `source_sha`. Historical candidate commits therefore cannot replace or remove the deployment guard/tooling.

## Security boundary

The public repository must never contain:

- `.clasprc.json`;
- OAuth access/refresh tokens;
- Apps Script project IDs;
- deployment IDs or URLs;
- private spreadsheet IDs added solely for deployment configuration;
- runtime source snapshots pulled from Google.

Required GitHub Environment secrets:

- `RFORM_CLASP_RC_JSON`
- `RFORM_DETECTOR_SCRIPT_ID`
- `RFORM_CONTENT_API_SCRIPT_ID`

Store them in the `production-apps-script` environment. `RFORM_CLASP_RC_JSON` is the authenticated clasp credential JSON normally stored at `~/.clasprc.json`. The workflow writes it only to the ephemeral runner with mode `0600`, uses it for the job, and removes it in an `always()` cleanup step.

The workflow itself has only `contents: read` GitHub permission. Project IDs, deployment IDs, OAuth credentials and pulled runtime source are not written to the public repository or workflow summary.

## Minimal one-time bootstrap

Preferred bootstrap path is GitHub Codespaces so no local developer setup is required.

1. Open a Codespace for `rulevd21/R-Form` on `main`.
2. In its terminal run exactly:

   `bash scripts/apps-script/bootstrap-codespace.sh`

3. Complete only the interactive authorization prompts shown by the script:
   - Google approval for clasp;
   - GitHub owner approval only if the Codespace token cannot administer environment secrets.

The bootstrap script then performs the remaining work automatically:

1. verifies the repository and required tooling;
2. authenticates `@google/clasp@3.4.1`;
3. lists accessible Apps Script projects without printing their IDs;
4. identifies Detector and Content API by pulling candidate projects and verifying unique runtime source anchors;
5. creates/uses the `production-apps-script` GitHub Environment;
6. installs the three protected Environment secrets without printing their values;
7. reads the exact component `source_ref` values from `RFORM_RUNTIME_MANIFEST.json`;
8. dispatches one read-only `inspect` for Detector and one for Content API;
9. waits for both runs and returns `READY` only if both succeed;
10. removes temporary discovery files and, when it created the clasp login itself, removes the local Codespace clasp credential after bootstrap.

If `clasp list-scripts` reports that the Google Apps Script API is disabled, enable it once in Apps Script user settings and rerun the same bootstrap command. No project IDs or OAuth JSON should ever be pasted into chat, issues, PRs, Actions inputs or repository files.

## Two-stage release protocol

### 1. Inspect

Run the workflow with:

- component;
- operation `inspect`;
- exact reviewed `source_sha`;
- no confirmation string.

The workflow:

1. verifies it was dispatched from `main`;
2. checks out the exact trusted workflow/tooling SHA;
3. materializes only the requested candidate source file from the exact historical Git SHA;
4. authenticates clasp;
5. pulls current Apps Script HEAD;
6. finds the runtime target file by a component-specific anchor;
7. requires exactly one anchor match;
8. reports only SHA-256 hashes and safe version metadata;
9. does not push or deploy anything.

Record `Runtime source SHA-256 before` from the workflow summary.

### 2. Apply

Run again with:

- the same component;
- operation `apply`;
- the same exact `source_sha`;
- `expected_runtime_sha256` copied from the inspect result;
- confirmation exactly `APPLY <component> <source_sha>`;
- for `content-api`, the currently verified production deployment version.

The workflow aborts before writing if runtime HEAD changed after inspect.

## Source replacement safety

The workflow does not create a minimal local Apps Script project and push it over production.

Instead it:

1. pulls the complete current runtime project;
2. locates exactly one `.gs`/`.js` file containing the required anchor;
3. hashes every pulled file;
4. copies the separately materialized reviewed Git candidate over only that located file;
5. hashes the complete local runtime tree again;
6. requires exactly one file to have changed;
7. pushes the complete pulled project back;
8. pulls again;
9. requires exact SHA-256 equality between Git candidate and runtime readback.

Therefore unrelated Apps Script files and `appsscript.json` are preserved.

## Existing deployment only

For `content-api`, a new web-app deployment identity is forbidden.

Before source push, the workflow obtains the deployment inventory and requires exactly one existing deployment at `expected_deployment_version`. Its deployment ID is kept only in an ephemeral `0600` file and is not printed.

After source readback succeeds, clasp updates that same deployment ID. The workflow then re-reads deployment inventory and requires the same deployment to have advanced to a later version. This preserves the existing deployment identity/URL.

## Rollback

### Detector

Before applying detector source, the workflow creates an immutable Apps Script rollback version. This does not create or modify triggers.

If the apply flow fails after source push, the workflow attempts to restore the pre-change runtime target file from an ephemeral runner backup and push it back.

### Content API

The current immutable production deployment version is the rollback deployment baseline.

If failure occurs after source push, the workflow attempts both:

1. restore the pre-change runtime source from the ephemeral runner backup;
2. repoint the same deployment ID to `expected_deployment_version`.

A rollback failure is reported as `Manual runtime reconciliation is required`; it is never reported as success.

## What this workflow does not verify

GitHub/clasp source deployment is not, by itself, full runtime acceptance.

The workflow does not infer:

- that a Detector time trigger actually fired;
- trigger inventory or trigger cadence;
- business-data correctness;
- Telegram publication behavior;
- Content API feature-flag state;
- private render/self-check output unless a separate callable acceptance mechanism is explicitly added.

Accordingly:

- a successful `apply` proves guarded source deployment + source readback;
- Content API additionally proves update of the existing deployment identity;
- promotion to `VERIFIED_PRODUCTION` still requires the component-specific runtime acceptance defined by `docs/governance/VERSION_GOVERNANCE.md`.

## Pinned tooling

Production pins:

- `@google/clasp@3.4.1`;
- `actions/checkout` to an immutable commit SHA corresponding to v4;
- `actions/setup-node` to an immutable commit SHA corresponding to v4.

Do not float production tooling to `latest`. Review release/security notes and update pins through a normal PR.
