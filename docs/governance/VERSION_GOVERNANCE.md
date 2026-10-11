# R/Form Production & Version Governance

Status: ACTIVE  
Effective date: 2026-10-09  
Last reconciled: 2026-10-11  
Owner: project owner  
Repository: `rulevd21/R-Form`

## 1. Purpose

This policy removes ambiguity between source code, merged code and code actually running in production.

The canonical runtime inventory is `RFORM_RUNTIME_MANIFEST.json`.

## 2. Branch model

### `main`
Integration trunk and canonical repository history. New production work must arrive through reviewed PRs after tests pass.

Required repository rule: PR-only changes, relevant CI required, force-push/deletion blocked. Emergency owner/admin bypass is allowed only to restore service and must be reconciled in the same session under section 11.

### `production`
Pointer to the latest cross-component source baseline that is confirmed installed and runtime-verified. It is not an integration branch and is not required to contain every independently deployed standalone component.

Required repository rule: no feature development, force-push/deletion blocked, ref moves only after runtime acceptance and manifest reconciliation.

Rules:

1. Never move `production` because a PR was merged.
2. Move `production` only after deployment, source readback and runtime acceptance.
3. If a merged candidate is not installed, `main` may be ahead of `production`; the manifest must make that explicit.
4. Independently deployed components may cite an exact verified `source_ref` outside `production` when the manifest records the evidence.
5. Do not commit secrets, deployment URLs, private spreadsheet IDs or private Apps Script IDs to either branch.
6. GitHub branch/ruleset enforcement is an owner/admin repository setting. A missing ruleset is governance debt, not permission to bypass this policy.

## 3. Release states

Every production-affecting change must be in exactly one of these states:

- `CANDIDATE` — implementation exists but has not completed tests/review.
- `MERGED_NOT_DEPLOYED` — source is merged but runtime has not changed.
- `DEPLOYED_NOT_VERIFIED` — runtime changed but readback/acceptance is incomplete.
- `VERIFIED_PRODUCTION` — installed source matches candidate and acceptance passed.
- `SUPERSEDED` — replaced by a later implementation; retained only for history.
- `ARCHIVED_EXPERIMENT` — not part of the active production architecture.

`merged`, `deployed` and `verified` are never synonyms.

## 4. Mandatory release evidence

A PR that changes a production component must record, before being considered complete:

1. component name;
2. semantic/runtime version;
3. exact source commit SHA;
4. tests/CI result;
5. existing runtime read before modification when applicable;
6. deployment update result;
7. source readback/hash comparison;
8. smoke/E2E acceptance result;
9. rollback source/deployment baseline;
10. manifest update;
11. `production` ref update when the release becomes the new cross-component production baseline.

If any item cannot be verified, mark it explicitly instead of inferring success.

## 5. Production Manifest rule

`RFORM_RUNTIME_MANIFEST.json` is the only repository-level source for answering:

- Which component/version is in production?
- What source commit supports that statement?
- When was it last verified?
- What candidate is merged but not installed?
- What runtime provenance is unknown?

PR descriptions and chat history are release evidence, not the current inventory.

## 6. Component ownership boundaries

- `RFORM_MASTER_DATA_v1` — canonical business state.
- Training runtime — training plan/fact capture; it does not publish content.
- Content Event Detector — derives candidate events; it does not publish.
- Content Packet — deterministic projection/materialization from accepted facts/events into the existing `CONTENT_QUEUE`; it is not a new datastore.
- Content Control API — canonical content workflow gateway; it does not own Telegram transport credentials.
- Owner Bot — single daily owner cockpit/review workspace; it does not become a second datastore or publisher.
- Telegram Autopost — single Telegram publisher.
- `CONTENT_REGISTRY` — canonical post-publication content metrics layer.
- Decision review/result evidence — canonical evaluation layer linked to `DECISIONS`; it must not silently rewrite the original decision.
- Streamlit Content Control — admin/diagnostic UI, not canonical state.
- R/Form Operating System — command router only after its acceptance gate is complete.

No new component may duplicate an existing canonical writer, publisher, router or state store without an explicit architecture decision.

## 7. PR lifecycle

### Keep open only when

- work is active;
- the PR contains a unique requirement not yet promoted;
- or it is an explicitly named acceptance/release gate.

### Close as superseded when

- a later PR implements the same requirement;
- production already contains a later verified version;
- the branch is an abandoned RC/sandbox that must not be promoted;
- or the PR body is materially inconsistent with the current architecture.

Before closing a superseded PR, add a short comment stating what replaced it.

## 8. Branch lifecycle

Allowed long-lived branches:

- `main`
- `production`
- optionally `develop` only if it is actively used and has a documented role.

Feature/agent/fix/release branches should be short-lived. After merge/supersession, they are historical and should not be treated as production sources.

Branch deletion is optional; clarity of status is mandatory. Do not delete a branch when it is the only retained source for a deployed or auditable historical release.

## 9. Apps Script rule

Apps Script is not allowed to become an undocumented second Git repository.

For every production Apps Script update:

1. read current source;
2. compare it to expected baseline;
3. apply the exact reviewed candidate;
4. update the existing deployment unless a new deployment is explicitly required;
5. read source back;
6. compare exact source/hash;
7. run preflight/smoke acceptance;
8. record rollback version;
9. update manifest.

A live Apps Script source whose provenance cannot be matched to GitHub is `RECONCILIATION_REQUIRED` and blocks further feature work on that component until reconciled.

## 10. Version numbering

Use component-level semantic versions. Do not infer version from file suffix alone.

Examples:

- Owner Bot `1.6.0`
- Content API `0.7.0`
- Content Control `0.5.10`
- Training CORE `2.1.9` / UI `2.2.2`
- Content Event Detector `0.4` / lifecycle `1.0` only after its runtime acceptance gate passes.

The repository itself does not need one global product version while independently deployed components exist.

## 11. Emergency hotfixes

A production hotfix may be deployed before a normal release merge only when needed to restore service, but the same session must:

- capture the pre-hotfix source;
- record the exact patch;
- verify runtime readback;
- create/reconcile the GitHub commit/PR;
- update the manifest.

A hotfix must never remain only in Apps Script.

## 12. Current baseline reconciled 2026-10-11

- `production` points to `5550d3c423294fd89c980d08ce019808b735c434`, the current cross-component verified source baseline.
- Runtime Manifest v1.0.10 records the verified standalone component refs, including Owner Bot `1.6.0`, Content API `0.7.0`, Telegram Autopost `0.3.2`, R/Form Operating System `1.1.5`, and Automatic Training Cards `0.7.0`.
- Content Event Detector `0.4` / lifecycle `1.0` is deployed in place but remains `DEPLOYED_NOT_VERIFIED` for the new lifecycle until native scheduled START/FINISH receipt evidence plus repeated idempotent/no-op readback passes Issue #42. Until that gate passes, the manifest intentionally retains the previously accepted detector production classification.
- Runtime/version provenance cleanup tracked by Issue #26 is complete. Commercial Wines repository separation is tracked independently and must not block R/Form runtime releases.
- GitHub readback on 2026-10-11 showed `main` and `production` without enforced protection; the required ruleset is tracked as an owner/admin repository-governance gate.

## 13. Definition of done

A production-affecting task is not DONE until:

`code -> tests -> merge -> deploy -> readback -> runtime acceptance -> manifest -> production ref (when applicable)`

If deployment is intentionally deferred, the task must end at `MERGED_NOT_DEPLOYED`, not DONE/PRODUCTION.

For a closed-loop feature, functional completion additionally requires:

`accepted fact -> event -> materialized packet/decision -> owner gate -> result/metrics -> next review signal`.
