const { autoViewStatus, autoLikeStatus } = require('../services/statusService');
const { isFeatureDisabled } = require('../services/featureService');
const { isStatusAdBlockerEnabled, isStatusAd, recordBlockedAd } = require('../services/statusAdBlockerService');

async function handleStatus(sock, statusMsg) {
  if (isFeatureDisabled('status')) return;

  // Status Ad Blocker Engine: Detect, Block & Skip WhatsApp Status Ads & Sponsored Stories
  if (isStatusAdBlockerEnabled()) {
    const adCheck = isStatusAd(statusMsg);
    if (adCheck.isAd) {
      const sender = statusMsg?.key?.participant || statusMsg?.key?.remoteJid || 'Unknown';
      console.log('🛑 [Status Ad Blocker] Blocked & Skipped WhatsApp Status Ad from: ' + sender + ' | Reason: ' + adCheck.reason);
      recordBlockedAd(statusMsg, adCheck.reason);
      return; // DROP AD COMPLETELY — DO NOT VIEW OR LIKE!
    }
  }

  // Execute Auto-View and Auto-Like concurrently without blocking delays
  Promise.allSettled([
    autoViewStatus(sock, statusMsg),
    autoLikeStatus(sock, statusMsg)
  ]).catch(function(err) {
    console.error('[StatusHandler Async Error]', err.message);
  });
}

module.exports = { handleStatus };
