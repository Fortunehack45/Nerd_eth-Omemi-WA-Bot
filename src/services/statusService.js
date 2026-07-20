const config = require('../../config');
const { sleep } = require('../utils/helpers');
const { randomBetween, checkRateLimit } = require('./antiBanService');

const viewedStatuses = new Set();
let lastStatusView = 0;
let lastStatusReact = 0;

async function autoViewStatus(sock, statusMsg) {
  if (!config.status.autoView) return;

  const key = statusMsg.key?.id;
  if (!key || viewedStatuses.has(key)) return;
  viewedStatuses.add(key);

  if (config.antiBan.enabled) {
    const now = Date.now();
    if (now - lastStatusView < 5000) {
      await new Promise(r => setTimeout(r, randomBetween(2000, 5000)));
    }
    if (!checkRateLimit('status_view', 30)) return;
    lastStatusView = Date.now();
  }

  try {
    await sock.readMessages([statusMsg.key]);
  } catch (e) { }
}

async function autoLikeStatus(sock, statusMsg) {
  if (!config.status.autoLike) return;

  const key = statusMsg.key?.id;
  if (!key) return;

  if (config.antiBan.enabled) {
    const now = Date.now();
    if (now - lastStatusReact < 8000) {
      await new Promise(r => setTimeout(r, randomBetween(2000, 4000)));
    }
    if (!checkRateLimit('status_like', 20)) return;
    lastStatusReact = Date.now();

    if (viewedStatuses.size % randomBetween(3, 6) === 0) return;
  }

  try {
    await sock.sendMessage(statusMsg.key.remoteJid, {
      react: { text: '❤️', key: statusMsg.key },
    });
  } catch (e) { }
}

async function sendStatus(sock, text, options = {}) {
  try {
    if (config.antiBan.enabled) {
      if (!checkRateLimit('send_status', 5)) {
        return { success: false, error: 'Status rate limit reached. Try later.' };
      }
      const lastHour = viewedStatuses.size;
      if (lastHour > 10) {
        return { success: false, error: 'Too many statuses posted recently. Wait before posting again.' };
      }
      await new Promise(r => setTimeout(r, randomBetween(2000, 5000)));
    }
    await sock.sendMessage('status@broadcast', { text });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendImageStatus(sock, imagePath, caption = '') {
  try {
    const { readFileSync } = require('fs');
    const img = readFileSync(imagePath);
    await sock.sendMessage('status@broadcast', {
      image: img,
      caption,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendVideoStatus(sock, videoPath, caption = '') {
  try {
    const { readFileSync } = require('fs');
    const vid = readFileSync(videoPath);
    await sock.sendMessage('status@broadcast', {
      video: vid,
      caption,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { autoViewStatus, autoLikeStatus, sendStatus, sendImageStatus, sendVideoStatus };
