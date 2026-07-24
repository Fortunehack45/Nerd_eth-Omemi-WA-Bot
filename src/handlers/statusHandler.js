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

  // 1. Auto-View Status (Mark as read)
  try {
    await autoViewStatus(sock, statusMsg);
  } catch (eV) {
    console.error('[AutoViewStatus Error]', eV.message);
  }

  // 2. Auto-Like Status (Send reaction emoji)
  try {
    await autoLikeStatus(sock, statusMsg);
  } catch (eL) {
    console.error('[AutoLikeStatus Error]', eL.message);
  }
}

module.exports = { handleStatus };
