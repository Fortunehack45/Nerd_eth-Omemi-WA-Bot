const { autoViewStatus, autoLikeStatus } = require('../services/statusService');
const { randomBetween } = require('../services/antiBanService');
const { isFeatureDisabled } = require('../services/featureService');

let lastStatusAction = 0;

async function handleStatus(sock, statusMsg) {
  if (isFeatureDisabled('status')) return;

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
