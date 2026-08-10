'use strict';

const RFORM_PHASE3C2_VERSION = '0.3.3-sandbox';

/**
 * Phase 3C.2 bootstrap.
 * Enables client-side repeat of recent meals while reusing the accepted
 * Phase 3A submitMeal() writer unchanged. No new write endpoint is added.
 */
function getPhase3C2BootstrapState() {
  const base = getPhase3CBootstrapState();
  base.app.appVersion = RFORM_PHASE3C2_VERSION;
  base.app.modules.fastPathRepeat = true;
  base.app.writeScope = ['DAY_START', 'MEAL'];
  base.fastPaths = base.fastPaths || {};
  base.fastPaths.capabilities = {
    repeatRecentMeal: true,
    recentFoodPrefill: false,
    favoriteWrite: false,
    templateWrite: false
  };
  base.fastPaths.readOnly = false;
  return base;
}
