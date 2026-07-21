/**
 * Stealth Mode Service
 * Makes WhatsApp unable to identify this as a bot connection.
 * Implements fingerprint randomization, human behaviour simulation,
 * presence spoofing, and connection fingerprint rotation.
 */
const { randomBetween } = require('./antiBanService');
const path = require('path');
const fs = require('fs');
const { loadJson, saveJson } = require('../utils/helpers');

const STEALTH_FILE = path.join(__dirname, '..', '..', 'storage', 'stealth.json');

// ─── Fingerprint Pools ───────────────────────────────────────────────────────

// Real user-agent strings from real devices
const REAL_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.79 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
];

// Baileys browser fingerprints that look like real WhatsApp Web users
const BROWSER_FINGERPRINTS = [
  ['WhatsApp Web', 'Chrome', '2.2430.2'],
  ['WhatsApp Web', 'Chrome', '2.2431.5'],
  ['WhatsApp Web', 'Safari', '2.2430.7'],
  ['WhatsApp Web', 'Firefox', '2.2431.1'],
  ['WhatsApp Web', 'Edge', '2.2430.4'],
  ['WhatsApp Web', 'Chrome', '2.2432.3'],
  ['WhatsApp Web', 'Safari', '2.2429.9'],
  ['WhatsApp Web', 'Chrome', '2.2433.1'],
  ['WhatsApp Web', 'Firefox', '2.2432.6'],
];

// Human-like presence update patterns
const PRESENCE_PATTERNS = [
  // [available, composing, paused, available]
  ['available', 'available', 'available', 'available'],
  ['available', 'composing', 'paused', 'available'],
  ['available', 'available', 'composing', 'available'],
  ['available', 'available', 'available', 'composing'],
];

// ─── Storage ─────────────────────────────────────────────────────────────────

function getStealthConfig() {
  const dir = path.dirname(STEALTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return loadJson(STEALTH_FILE, {
    enabled: false,
    aggressiveMode: false,
    fingerprintRotation: true,
    presenceSpoofing: true,
    humanTypingDelays: true,
    readReceiptDelay: true,
    currentFingerprint: null,
    rotationInterval: 86400000, // 24 hours
    lastRotated: 0,
    messageIdSpoof: true,
    onlineStatusRandomize: true,
  });
}

function saveStealthConfig(data) {
  saveJson(STEALTH_FILE, data);
}

function isStealthEnabled() {
  return getStealthConfig().enabled === true;
}

function setStealthEnabled(enabled, opts) {
  var cfg = getStealthConfig();
  cfg.enabled = !!enabled;
  if (opts) {
    if (opts.aggressiveMode !== undefined) cfg.aggressiveMode = !!opts.aggressiveMode;
    if (opts.fingerprintRotation !== undefined) cfg.fingerprintRotation = !!opts.fingerprintRotation;
    if (opts.presenceSpoofing !== undefined) cfg.presenceSpoofing = !!opts.presenceSpoofing;
    if (opts.humanTypingDelays !== undefined) cfg.humanTypingDelays = !!opts.humanTypingDelays;
    if (opts.readReceiptDelay !== undefined) cfg.readReceiptDelay = !!opts.readReceiptDelay;
    if (opts.messageIdSpoof !== undefined) cfg.messageIdSpoof = !!opts.messageIdSpoof;
    if (opts.onlineStatusRandomize !== undefined) cfg.onlineStatusRandomize = !!opts.onlineStatusRandomize;
  }
  saveStealthConfig(cfg);
  return cfg;
}

// ─── Fingerprint Rotation ────────────────────────────────────────────────────

function getRandomFingerprint() {
  return BROWSER_FINGERPRINTS[randomBetween(0, BROWSER_FINGERPRINTS.length - 1)];
}

function getRandomUserAgent() {
  return REAL_USER_AGENTS[randomBetween(0, REAL_USER_AGENTS.length - 1)];
}

/**
 * Get the current session browser fingerprint.
 * Rotates automatically every 24h to avoid long-term pattern detection.
 */
function getSessionFingerprint() {
  var cfg = getStealthConfig();
  if (!cfg.fingerprintRotation) {
    return BROWSER_FINGERPRINTS[0]; // stable fallback
  }

  var now = Date.now();
  var needRotate = !cfg.currentFingerprint || (now - (cfg.lastRotated || 0)) > (cfg.rotationInterval || 86400000);

  if (needRotate) {
    var newFp = getRandomFingerprint();
    cfg.currentFingerprint = newFp;
    cfg.lastRotated = now;
    saveStealthConfig(cfg);
    return newFp;
  }

  return Array.isArray(cfg.currentFingerprint) ? cfg.currentFingerprint : getRandomFingerprint();
}

// ─── Human Behavior Simulation ───────────────────────────────────────────────

/**
 * Generate a realistic human message ID (NOT the BAE5/3EB0 bot prefixes).
 * Uses alphanumeric chars mimicking WhatsApp mobile message IDs.
 */
function generateHumanMessageId() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var len = randomBetween(19, 22);
  var result = '';
  for (var i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Calculate realistic human-like typing delay.
 * Based on average human WPM (50-120 WPM) with natural jitter.
 */
function calcHumanTypingDelay(text) {
  if (!text) return randomBetween(500, 1500);
  var words = text.trim().split(/\s+/).length;
  var wpm = randomBetween(50, 120); // realistic typing speed
  var baseMs = Math.round((words / wpm) * 60 * 1000);
  var jitterPct = randomBetween(10, 30) / 100;
  var jitter = Math.round(baseMs * jitterPct * (Math.random() > 0.5 ? 1 : -1));
  return Math.min(Math.max(baseMs + jitter, 800), 6000);
}

/**
 * Adds a realistic read receipt delay before bot replies.
 * Simulates human reading time based on message length.
 */
function calcReadDelay(messageText) {
  if (!messageText) return randomBetween(300, 800);
  var chars = messageText.length;
  // Average human reads ~238 words/min = ~1400 chars/min
  var readTimeMs = Math.round((chars / 1400) * 60 * 1000);
  var min = Math.max(readTimeMs, 500);
  var max = Math.max(readTimeMs * 1.5, 2000);
  return randomBetween(Math.round(min), Math.round(max));
}

/**
 * Simulate organic online/offline presence toggling.
 * Prevents the constant "always online" pattern that flags bots.
 */
async function simulateOrganicPresence(sock) {
  if (!sock || !sock.user?.id) return;
  var cfg = getStealthConfig();
  if (!cfg.enabled || !cfg.onlineStatusRandomize) return;

  try {
    var pattern = PRESENCE_PATTERNS[randomBetween(0, PRESENCE_PATTERNS.length - 1)];
    for (var i = 0; i < pattern.length; i++) {
      await sock.sendPresenceUpdate(pattern[i], 'status@broadcast');
      await new Promise(r => setTimeout(r, randomBetween(3000, 15000)));
    }
  } catch (e) {}
}

// ─── Stealth Wrapper for sendMessage ────────────────────────────────────────

/**
 * Wraps sock.sendMessage with human-like delays and message ID spoofing.
 * Call this instead of sock.sendMessage when stealth is enabled.
 */
async function stealthSend(sock, jid, content, opts) {
  var cfg = getStealthConfig();

  if (!cfg.enabled) {
    return sock.sendMessage(jid, content, opts);
  }

  // 1. Read receipt simulation delay
  if (cfg.readReceiptDelay) {
    var readDelay = calcReadDelay(content?.text || '');
    await new Promise(r => setTimeout(r, readDelay));
  }

  // 2. Simulate composing typing indicator
  if (cfg.humanTypingDelays && content?.text) {
    try {
      await sock.sendPresenceUpdate('composing', jid);
      var typingDelay = calcHumanTypingDelay(content.text);
      await new Promise(r => setTimeout(r, typingDelay));
      await sock.sendPresenceUpdate('paused', jid);
      await new Promise(r => setTimeout(r, randomBetween(200, 700)));
    } catch (e) {}
  }

  return sock.sendMessage(jid, content, opts);
}

function getStealthStats() {
  var cfg = getStealthConfig();
  return {
    enabled: cfg.enabled,
    aggressiveMode: cfg.aggressiveMode,
    fingerprintRotation: cfg.fingerprintRotation,
    presenceSpoofing: cfg.presenceSpoofing,
    humanTypingDelays: cfg.humanTypingDelays,
    readReceiptDelay: cfg.readReceiptDelay,
    messageIdSpoof: cfg.messageIdSpoof,
    onlineStatusRandomize: cfg.onlineStatusRandomize,
    lastRotated: cfg.lastRotated ? new Date(cfg.lastRotated).toISOString() : 'Never',
    currentFingerprint: cfg.currentFingerprint || 'None',
    rotationInterval: ((cfg.rotationInterval || 86400000) / 3600000) + 'h',
  };
}

module.exports = {
  isStealthEnabled,
  setStealthEnabled,
  getStealthConfig,
  getSessionFingerprint,
  getRandomFingerprint,
  getRandomUserAgent,
  generateHumanMessageId,
  calcHumanTypingDelay,
  calcReadDelay,
  simulateOrganicPresence,
  stealthSend,
  getStealthStats,
};
