'use strict';

const RFORM_PHASE3C5_VERSION = '0.3.7-sandbox';

function getPhase3C5BootstrapState() {
  const base = getPhase3C4BootstrapState();
  base.app = base.app || {};
  base.app.appVersion = RFORM_PHASE3C5_VERSION;
  base.app.modules = base.app.modules || {};
  base.app.modules.fastPathNutrition = true;
  base.fastPaths = base.fastPaths || {};
  base.fastPaths.capabilities = base.fastPaths.capabilities || {};
  base.fastPaths.capabilities.recentFoodPrefill = true;
  return base;
}
