const { autoViewStatus, autoLikeStatus } = require('../services/statusService');
const { randomBetween } = require('../services/antiBanService');
const { isFeatureDisabled } = require('../services/featureService');
const { isStatusAdBlockerEnabled, isStatusAd, recordBlockedAd } = require('../services/statusAdBlockerService');

let lastStatusAction = 0;

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

  const now = Date.now();
  if (now - lastStatusAction < 3000) {
    await new Promise(r => setTimeout(r, randomBetween(1000, 3000)));
  }
  lastStatusAction = Date.now();

  await autoViewStatus(sock, statusMsg);
  await new Promise(r => setTimeout(r, randomBetween(500, 1500)));
  await autoLikeStatus(sock, statusMsg);
}

module.exports = { handleStatus };
