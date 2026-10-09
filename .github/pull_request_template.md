## Scope

- Component(s):
- Change type: feature / fix / hotfix / governance / docs / experiment
- Production-affecting: YES / NO

## Source and state

- Current state: CANDIDATE / MERGED_NOT_DEPLOYED / DEPLOYED_NOT_VERIFIED / VERIFIED_PRODUCTION / SUPERSEDED / ARCHIVED_EXPERIMENT
- Base source/version:
- Candidate version:
- Exact candidate commit:
- Canonical datastore/state owner affected:

## Validation

- [ ] Unit/regression tests pass
- [ ] CI passes on the exact candidate commit
- [ ] Data/schema compatibility checked
- [ ] Duplicate writer/router/publisher not introduced
- [ ] Secrets/private deployment identifiers are not committed

## Production release evidence

Complete this section only when production-affecting.

- [ ] Existing runtime/source read before modification
- [ ] Deployment performed against the intended existing/new deployment
- [ ] Runtime source read back after deployment
- [ ] Readback matches the reviewed candidate/hash
- [ ] Smoke/E2E acceptance passed
- [ ] Rollback baseline recorded
- [ ] `RFORM_RUNTIME_MANIFEST.json` updated
- [ ] `production` ref moved only after verification, if this release changes the cross-component verified baseline

Deployment evidence / acceptance result:

Rollback:

## Safety boundaries

What this PR explicitly does **not** change:

- 

## Supersession

- Replaces PR/version:
- Older PRs/branches to mark SUPERSEDED:

## Definition of done

A production-affecting release is not DONE at merge. Required path:

`code -> tests -> merge -> deploy -> readback -> runtime acceptance -> manifest -> production ref`
