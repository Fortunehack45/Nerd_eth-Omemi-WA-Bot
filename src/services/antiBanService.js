const config = require('../../config');

const actionLog = new Map();
const messageCounts = new Map();
const processedJids = new Set();

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(min = 500, max = 2000) {
  return new Promise(resolve => setTimeout(resolve, randomBetween(min, max)));
}

function humanDelay() {
  const ms = randomBetween(800, 3000);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function typingDelay(text) {
  const wpm = randomBetween(180, 350);
  const words = text.split(/\s+/).length;
  const seconds = (words / wpm) * 60;
  const jitter = seconds * randomBetween(5, 25) / 100;
  const total = Math.min(Math.max(Math.floor((seconds + jitter) * 1000), 500), 5000);
  return new Promise(resolve => setTimeout(resolve, total));
}

function checkRateLimit(action, maxPerMinute = 15) {
  const now = Date.now();
  const windowMs = 60000;
  const key = `${action}`;

  if (!actionLog.has(key)) {
    actionLog.set(key, []);
  }

  const timestamps = actionLog.get(key).filter(t => now - t < windowMs);
  timestamps.push(now);
  actionLog.set(key, timestamps);

  return timestamps.length <= maxPerMinute;
}

function checkMessageRate(jid) {
  const now = Date.now();
  const windowMs = 60000;

  if (!messageCounts.has(jid)) {
    messageCounts.set(jid, []);
  }

  const timestamps = messageCounts.get(jid).filter(t => now - t < windowMs);
  timestamps.push(now);
  messageCounts.set(jid, timestamps);

  const maxPerChat = config.antiBan.maxMessagesPerChat || 20;
  return timestamps.length <= maxPerChat;
}

function shouldProcessJid(jid) {
  if (processedJids.size > 1000) processedJids.clear();
  return true;
}

function getSafeBrowser() {
  const browsers = [
    ['Chrome', 'Windows', '130.0.6723.91'],
    ['Chrome', 'Windows', '131.0.6778.86'],
    ['Chrome', 'Windows', '132.0.6834.110'],
    ['Chrome', 'Macintosh', '131.0.6778.86'],
    ['Chrome', 'Macintosh', '132.0.6834.110'],
    ['Chrome', 'Linux', '130.0.6723.91'],
    ['Firefox', 'Windows', '135.0'],
    ['Firefox', 'Macintosh', '135.0'],
    ['Firefox', 'Linux', '134.0'],
    ['Edge', 'Windows', '132.0.2957.127'],
    ['Edge', 'Windows', '133.0.3065.69'],
    ['Safari', 'Macintosh', '18.3'],
    ['Safari', 'Macintosh', '18.2'],
    ['Chrome', 'Android', '132.0.6834.79'],
    ['Chrome', 'Android', '131.0.6778.135'],
    ['Samsung', 'Android', '26.0'],
    ['Opera', 'Windows', '114.0.5282.0'],
  ];
  return browsers[randomBetween(0, browsers.length - 1)];
}

function getRandomMessageId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 21; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function simulateTyping(sock, jid, text) {
  try {
    if (!sock || typeof sock.sendPresenceUpdate !== 'function') return;
    await sock.sendPresenceUpdate('composing', jid).catch(function() {});
    // Fast organic typing delay (300ms to 700ms max)
    const delayTime = Math.min(Math.max((text ? text.length * 8 : 300), 300), 700);
    await new Promise(resolve => setTimeout(resolve, delayTime));
    await sock.sendPresenceUpdate('paused', jid).catch(function() {});
  } catch (e) { }
}

function shouldThrottle() {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 6) return true;
  return false;
}

function getThrottleDelay() {
  if (shouldThrottle()) {
    return randomBetween(3000, 7000);
  }
  return randomBetween(300, 1500);
}

const seenMessageIds = new Set();
function isDuplicateMessage(messageId) {
  if (seenMessageIds.has(messageId)) return true;
  if (seenMessageIds.size > 5000) seenMessageIds.clear();
  seenMessageIds.add(messageId);
  return false;
}

module.exports = {
  randomBetween,
  randomDelay,
  humanDelay,
  typingDelay,
  checkRateLimit,
  checkMessageRate,
  shouldProcessJid,
  getSafeBrowser,
  getRandomMessageId,
  simulateTyping,
  shouldThrottle,
  getThrottleDelay,
  isDuplicateMessage,
};
