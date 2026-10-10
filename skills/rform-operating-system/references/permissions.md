# R/Form Permission Contract

Tool permission is not owner authorization. A command authorizes only the side effects inherent in that intent.

## No extra approval required

When the user has issued the corresponding command and validation passes:

- read canonical R/Form sources;
- calculate plan/fact, remaining macros, trends and status;
- create/open a day without duplicating an existing day;
- add a supplied meal or training fact to the canonical ingest/write path;
- close a day through the existing `DAY_CLOSURE` gate;
- create/update a DRAFT training week or Weekly Report;
- prepare or edit a publication draft/package without scheduling;
- classify stale content as covered/hold/superseded when the intent explicitly requests queue refresh/cleanup and history is preserved;
- run QA and readback.

## Explicit owner command required

Require an unambiguous owner command for:

- external publication;
- approving or scheduling a publication;
- production deployment;
- GitHub merge to a protected/production branch;
- production code replacement;
- destructive data deletion;
- permission/secret changes;
- irreversible history rewrite;
- paid API/SaaS introduction;
- materially changing a current approved business rule when evidence does not determine a unique answer.

For publication, approval applies to the exact material/version/preview resolved by the workflow.

## Forbidden by standing policy

- workflows that depend on user email;
- sending email;
- exposing secrets/tokens;
- silently replacing canonical business facts with chat memory;
- deleting old content merely to remove it from an active UI;
- creating a second production datastore or publication state machine when MASTER_DATA / CONTENT_QUEUE already owns the state.

## Safe write discipline

For every authorized write:

1. resolve exact object ID and current state;
2. check duplicates/version freshness;
3. write the minimum fields required by the intent;
4. read back;
5. report success only after verification.

If a stronger canonical API/gateway exists, use it instead of an ad-hoc direct sheet write.
