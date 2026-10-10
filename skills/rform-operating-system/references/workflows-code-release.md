# Code & Release Workflows

Use GitHub for code state. Never infer deployed production from a branch name alone.

## Diagnosis

1. resolve repository/component;
2. resolve current deployed version if available;
3. identify relevant branch/base and recent changes;
4. reproduce or inspect the defect;
5. diagnose root cause;
6. choose the minimum sufficient change;
7. identify adjacent regression risk.

## Change preparation

Safe reversible work may be prepared on a non-production branch when the user requested the workflow:

- documentation;
- tests;
- patches;
- release notes;
- migration scripts that are not executed against production.

Do not merge or deploy merely because a patch exists.

## Exact version rule

If the user says `Публикуй vX.Y.Z`, first determine whether that version belongs to content or an application/release. If it is an application, operate on that exact version. Never silently substitute a newer/different release.

## Production gate

Require explicit owner authorization before:

- merging to production/main when that changes production behavior;
- replacing production Apps Script code;
- deploying a Web App/Streamlit release;
- changing production datastore/schema;
- changing secrets/permissions.

After an authorized production action, verify the deployed version/capabilities and relevant regression tests before reporting success.

## Existing-system rule

Do not create a new app, repo, Apps Script project or service when the current component can implement the change safely. Preserve stable interfaces such as current deployment URLs/secrets unless a root-cause fix requires otherwise and the owner approves it.
