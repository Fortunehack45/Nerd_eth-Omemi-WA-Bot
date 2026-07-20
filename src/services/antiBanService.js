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
    ['Chrome', 'Linux', '120.0.6099.144'],
    ['Chrome', 'Windows', '120.0.6099.110'],
    ['Chrome', 'Macintosh', '120.0.6099.109'],
    ['Firefox', 'Linux', '121.0'],
    ['Edge', 'Windows', '120.0.2210.91'],
    ['Safari', 'Macintosh', '17.1'],
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
    await sock.sendPresenceUpdate('composing', jid);
    const delayTime = text ? Math.min(text.length * 15 + randomBetween(100, 500), 4000) : randomBetween(500, 1500);
    await new Promise(resolve => setTimeout(resolve, delayTime));
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
