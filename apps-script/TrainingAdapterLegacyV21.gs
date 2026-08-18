'use strict';

function getTrainingLaunchState() {
  const config = getConfig_();
  const today = getDayStateByDate_(Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd'));
  return buildTrainingLaunchState_(today, config);
}

function buildTrainingLaunchState_(today, config) {
  const training = today.training || { required: false, status: 'NOT_REQUIRED' };
  const hasSession = Boolean(training.required && training.sessionId);
  return {
    required: Boolean(training.required),
    sessionId: training.sessionId || '',
    trainingCode: training.trainingCode || '',
    status: training.status || 'UNKNOWN',
    planStatus: training.planStatus || '',
    launchAvailable: Boolean(training.required && config.trainingLegacyUrl),
    legacyUrl: training.required && config.trainingLegacyUrl ? config.trainingLegacyUrl : '',
    structuredChangesAvailable: hasSession,
    structuredChangesMode: hasSession ? 'SANDBOX_FACT_ONLY' : 'UNAVAILABLE',
    planImmutable: true,
    adapter: 'TrainingAdapterLegacyV21',
    mode: 'LEGACY_LAUNCH_WITH_STRUCTURED_FACT_CHANGES',
    productionWriterChanged: false
  };
}
