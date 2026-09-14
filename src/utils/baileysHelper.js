let baileysInstance = null;
let baileysPromise = null;

async function getBaileys() {
  if (baileysInstance) return baileysInstance;
  if (!baileysPromise) {
    baileysPromise = (async () => {
      try {
        const raw = require('@whiskeysockets/baileys');
        baileysInstance = raw.default && raw.default.makeWASocket ? raw.default : raw;
        return baileysInstance;
      } catch (err) {
        // Fallback for Node ESM environments (e.g. Vercel Serverless / AWS Lambda / Node 18/20)
        try {
          const raw = await import('@whiskeysockets/baileys');
          baileysInstance = raw.default && raw.default.makeWASocket ? raw.default : raw;
          return baileysInstance;
        } catch (err2) {
          console.warn('[BAILEYS-HELPER] Failed to load @whiskeysockets/baileys:', err2.message);
          return {};
        }
      }
    })();
  }
  return await baileysPromise;
}

// Pre-warm background import without blocking
getBaileys().catch(() => {});

const DisconnectReason = {
  connectionClosed: 428,
  connectionLost: 408,
  connectionReplaced: 440,
  timedOut: 408,
  loggedOut: 401,
  badSession: 500,
  restartRequired: 515,
  multideviceMismatch: 411,
  forbidden: 403,
  unavailableService: 503
};

async function downloadContentFromMessage(content, type, options) {
  const b = await getBaileys();
  if (typeof b.downloadContentFromMessage === 'function') {
    return b.downloadContentFromMessage(content, type, options);
  }
  throw new Error('downloadContentFromMessage not available');
}

async function downloadMediaMessage(message, type, options, ctx) {
  const b = await getBaileys();
  if (typeof b.downloadMediaMessage === 'function') {
    return b.downloadMediaMessage(message, type, options, ctx);
  }
  throw new Error('downloadMediaMessage not available');
}

function normalizeMessageContent(content) {
  if (baileysInstance && typeof baileysInstance.normalizeMessageContent === 'function') {
    return baileysInstance.normalizeMessageContent(content);
  }
  if (!content) return undefined;
  if (content.viewOnceMessage?.message) return normalizeMessageContent(content.viewOnceMessage.message);
  if (content.viewOnceMessageV2?.message) return normalizeMessageContent(content.viewOnceMessageV2.message);
  if (content.viewOnceMessageV2Extension?.message) return normalizeMessageContent(content.viewOnceMessageV2Extension.message);
  if (content.ephemeralMessage?.message) return normalizeMessageContent(content.ephemeralMessage.message);
  return content;
}

module.exports = {
  getBaileys,
  DisconnectReason,
  downloadContentFromMessage,
  downloadMediaMessage,
  normalizeMessageContent
};
