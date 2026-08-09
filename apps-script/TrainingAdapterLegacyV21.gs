'use strict';

function getTrainingLaunchState() {
  const config = getConfig_();
  const today = getDayStateByDate_(Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd'));
  return buildTrainingLaunchState_(today, config);
}

function buildTrainingLaunchState_(today, config) {
  const training = today.training || { required: false, status: 'NOT_REQUIRED' };
  return {
    required: Boolean(training.required),
    sessionId: training.sessionId || '',
    trainingCode: training.trainingCode || '',
    status: training.status || 'UNKNOWN',
    planStatus: training.planStatus || '',
    launchAvailable: Boolean(training.required && config.trainingLegacyUrl),
    legacyUrl: training.required && config.trainingLegacyUrl ? config.trainingLegacyUrl : '',
    adapter: 'TrainingAdapterLegacyV21',
    mode: 'READ_ONLY_LAUNCH',
    productionWriterChanged: false
  };
}
