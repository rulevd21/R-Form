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

The workflow checks out an exact 40-character Git commit SHA. It never deploys a mutable branch name.

## Security boundary

The public repository must never contain:

- `.clasprc.json`;
- OAuth access/refresh tokens;
- Apps Script project IDs;
- deployment IDs or URLs;
- private spreadsheet IDs added solely for deployment configuration;
- runtime source snapshots pulled from Google.

Required secrets:

- `RFORM_CLASP_RC_JSON`
- `RFORM_DETECTOR_SCRIPT_ID`
- `RFORM_CONTENT_API_SCRIPT_ID`

Store them as GitHub Environment secrets in `production-apps-script` when possible. Repository secrets are compatible with the workflow but provide a weaker separation boundary.

`RFORM_CLASP_RC_JSON` is the authenticated clasp credential JSON normally stored at `~/.clasprc.json`. The workflow writes it only to the ephemeral runner with mode `0600`, uses it for the job, and removes it in an `always()` cleanup step.

Recommended GitHub Environment protection:

1. environment name: `production-apps-script`;
2. required reviewer: project owner;
3. prevent unreviewed production deployment where the account supports environment approvals.

The workflow itself has only `contents: read` GitHub permission.

## Two-stage release protocol

### 1. Inspect

Run the workflow with:

- component;
- operation `inspect`;
- exact reviewed `source_sha`;
- no confirmation string.

The workflow:

1. authenticates clasp;
2. pulls current Apps Script HEAD;
3. finds the runtime target file by a component-specific anchor;
4. requires exactly one anchor match;
5. reports only SHA-256 hashes and safe version metadata;
6. does not push or deploy anything.

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
4. copies the reviewed Git candidate over only that located file;
5. hashes the complete local runtime tree again;
6. requires exactly one file to have changed;
7. pushes the complete pulled project back;
8. pulls again;
9. requires exact SHA-256 equality between Git candidate and runtime readback.

Therefore unrelated Apps Script files and `appsscript.json` are preserved.

## Existing deployment only

For `content-api`, a new web-app deployment is forbidden.

Before source push, the workflow obtains the deployment inventory and requires exactly one existing deployment at `expected_deployment_version`. Its deployment ID is kept only in an ephemeral `0600` file and is not printed.

After source readback succeeds, clasp updates that same deployment ID. The workflow then re-reads deployment inventory and requires the same deployment to have advanced to a later version.

This preserves the existing deployment identity/URL.

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

## One-time credential bootstrap

Clasp 3.4.1 uses Google OAuth credentials. Authenticate clasp once with the production Google account in a trusted local or interactive environment, then store the resulting `~/.clasprc.json` content as the `RFORM_CLASP_RC_JSON` protected GitHub secret.

Do not paste that JSON into an issue, PR, Actions input, chat message, repository file, or workflow log.

The Google Apps Script API must be enabled for the account/project used by clasp.

## Pinned tooling

The workflow pins `@google/clasp@3.4.1`.

Do not float to `latest` in production. Review clasp release/security notes, then update the pin through a normal PR.
