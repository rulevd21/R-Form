'use strict';

/**
 * One-shot sandbox runtime gate for Training FREE v0.1.
 *
 * Safety:
 * - getMasterSpreadsheet_() must resolve to an RFORM_MASTER_DATA_SANDBOX_* datastore;
 * - this function must never be executed against production;
 * - it performs only the FREE schema migration plus read-only regression checks.
 *
 * Expected result: { status: 'PASS', ... }
 */
function runTrainingFreeRuntimeAcceptance() {
  const startedAt = new Date();
  const firstMigration = migrateTrainingFreeSchema();
  const secondMigration = migrateTrainingFreeSchema();

  const idempotency = {
    sessionHeadersAdded: Array.isArray(secondMigration.sessionHeadersAdded) ? secondMigration.sessionHeadersAdded : [],
    setHeadersAdded: Array.isArray(secondMigration.setHeadersAdded) ? secondMigration.setHeadersAdded : [],
    eventTypesAdded: Array.isArray(secondMigration.eventTypesAdded) ? secondMigration.eventTypesAdded : []
  };

  const idempotent =
    idempotency.sessionHeadersAdded.length === 0 &&
    idempotency.setHeadersAdded.length === 0 &&
    idempotency.eventTypesAdded.length === 0;

  const regression = runTrainingFreeFoundationRegression();
  const state = inspectTrainingFreeFoundationState();

  const checks = [
    {
      name: 'first migration completed',
      status: firstMigration && firstMigration.status === 'APPLIED' ? 'PASS' : 'FAIL',
      detail: firstMigration || null
    },
    {
      name: 'schema migration is idempotent',
      status: idempotent ? 'PASS' : 'FAIL',
      detail: idempotency
    },
    {
      name: 'foundation regression is green',
      status: regression && regression.status === 'PASS' ? 'PASS' : 'FAIL',
      detail: regression || null
    },
    {
      name: 'production writer boundary preserved',
      status: state && state.productionWriterChanged === false ? 'PASS' : 'FAIL',
      detail: state ? { productionWriterChanged: state.productionWriterChanged } : null
    }
  ];

  const failed = checks.filter(item => item.status !== 'PASS');
  const result = {
    status: failed.length ? 'FAIL' : 'PASS',
    gate: 'FREE-02-RUNTIME',
    version: typeof RFORM_TRAINING_FREE_VERSION !== 'undefined' ? RFORM_TRAINING_FREE_VERSION : '',
    datastore: state && state.datastore ? state.datastore : '',
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    checks,
    firstMigration,
    secondMigration,
    regression,
    state
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}
