/**
 * Anti-Loop and Anti-Spam Sentinel
 * Prevents recursive message storms when two or more bot users chat in DM or share a WhatsApp group.
 */

const { parseJid } = require('./helpers');

// Per-chat reply timestamps for circuit breaker: Map<remoteJid, Array<number>>
const chatReplyTimestamps = new Map();

// Circuit breaker tripped cooldowns: Map<remoteJid, cooldownUntilTimestamp>
const chatCooldowns = new Map();

// Known bot headers and message signatures
const BOT_SIGNATURE_PATTERNS = [
  /^🤖/u,
  /^\*🤖/u,
  /^✅/u,
  /^❌/u,
  /^⚠️/u,
  /^🎵/u,
  /^⬇️/u,
  /^📸/u,
  /^🎬/u,
  /^⏳/u,
  /^\*📥/u,
  /^\*📄/u,
  /^\*═/u,
  /^═══/u,
  /^╭───/u,
  /^\[DownloadService\]/i,
  /^\[SESSION-MGR\]/i,
  /^\[ANTI-DELETE\]/i,
  /^\[CLEARED\]/i,
  /^\[SYSTEM\]/i,
  /^\[Onboarding\]/i,
  /\*NERD BOT\*/i,
  /\*Nerd Bot\*/i,
  /⚡ \*NERD BOT\*/i,
  /🤖 \*AI Assistant\*/i,
  /🤖 \*AI\*/i,
  /\*Auto-Reply\*/i,
  /🔗 Direct download link:/i,
  /🔗 Direct link:/i,
  /✅ Sending audio:/i,
  /⚠️ File too large/i,
  /❌ Could not download/i,
  /╭─────────────/i,
  /╰─────────────/i,
];

/**
 * Checks if a message body was created by a bot.
 * @param {string} text
 * @returns {boolean}
 */
function isBotSignature(text) {
  if (!text || typeof text !== 'string') return false;
  var trimmed = text.trim();
  if (!trimmed) return false;

  for (var i = 0; i < BOT_SIGNATURE_PATTERNS.length; i++) {
    if (BOT_SIGNATURE_PATTERNS[i].test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the quoted message in contextInfo has bot signatures or came from a bot.
 * @param {Object} msg
 * @returns {boolean}
 */
function isQuotingBotMessage(msg) {
  var contextInfo = msg?.message?.extendedTextMessage?.contextInfo
    || msg?.message?.imageMessage?.contextInfo
    || msg?.message?.videoMessage?.contextInfo
    || msg?.message?.documentMessage?.contextInfo;

  if (!contextInfo) return false;

  // Check quoted message ID
  var stanzaId = contextInfo.stanzaId || '';
  if (stanzaId && global.clusterBotSentMessageIds && global.clusterBotSentMessageIds.has(stanzaId)) {
    return true;
  }

  // Check quoted message text
  var qInner = contextInfo.quotedMessage?.ephemeralMessage?.message
    || contextInfo.quotedMessage?.viewOnceMessage?.message
    || contextInfo.quotedMessage?.viewOnceMessageV2?.message
    || contextInfo.quotedMessage;

  var qText = qInner?.conversation
    || qInner?.extendedTextMessage?.text
    || qInner?.imageMessage?.caption
    || qInner?.videoMessage?.caption
    || '';

  if (qText && isBotSignature(qText)) {
    return true;
  }

  return false;
}

/**
 * Chat Circuit Breaker: Prevents rapid ping-pong loops in a specific chat.
 * Limits bot to at most 3 automated replies per 10 seconds in any chat.
 * If tripped, silences automated responses in that chat for 25 seconds.
 * 
 * @param {string} chatJid
 * @returns {boolean} True if allowed to reply, False if circuit breaker tripped
 */
function checkChatCircuitBreaker(chatJid) {
  if (!chatJid) return true;
  var now = Date.now();

  // Check active cooldown
  if (chatCooldowns.has(chatJid)) {
    var until = chatCooldowns.get(chatJid);
    if (now < until) {
      return false; // Silenced!
    } else {
      chatCooldowns.delete(chatJid);
      chatReplyTimestamps.delete(chatJid);
    }
  }

  var timestamps = chatReplyTimestamps.get(chatJid) || [];
  // Keep only timestamps from last 10 seconds
  timestamps = timestamps.filter(function(ts) { return (now - ts) < 10000; });
  chatReplyTimestamps.set(chatJid, timestamps);

  if (timestamps.length >= 3) {
    // Trip the circuit breaker for 25 seconds
    chatCooldowns.set(chatJid, now + 25000);
    console.warn('[CIRCUIT-BREAKER] Spam loop detected in ' + chatJid + ' (' + timestamps.length + ' msgs in 10s). Pausing automated replies for 25s.');
    return false;
  }

  return true;
}

/**
 * Records that a bot reply was dispatched to this chat.
 * @param {string} chatJid
 */
function recordChatReply(chatJid) {
  if (!chatJid) return;
  var now = Date.now();
  var timestamps = chatReplyTimestamps.get(chatJid) || [];
  timestamps.push(now);
  chatReplyTimestamps.set(chatJid, timestamps);
}

module.exports = {
  isBotSignature,
  isQuotingBotMessage,
  checkChatCircuitBreaker,
  recordChatReply,
};
