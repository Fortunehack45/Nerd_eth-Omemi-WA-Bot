const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { randomBetween, isDuplicateMessage } = require('./services/antiBanService');
const { isStealthEnabled, getSessionFingerprint, simulateOrganicPresence } = require('./services/stealthService');

const SESSION_DIR = path.join(__dirname, '..', 'sessions');

let NodeCache = null;
try {
  const nc = require('@cacheable/node-cache');
  NodeCache = nc.NodeCache || nc.default || nc;
} catch (e) {}

const MSG_STORE_FILE = path.join(__dirname, '..', 'storage', 'msg_store.json');
let persistentMsgStore = new Map();

function reviveBuffers(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return Buffer.from(obj.data);
  }
  for (var k in obj) {
    obj[k] = reviveBuffers(obj[k]);
  }
  return obj;
}

function initMsgStore() {
  try {
    if (fs.existsSync(MSG_STORE_FILE)) {
      var data = JSON.parse(fs.readFileSync(MSG_STORE_FILE, 'utf8'));
      if (typeof data === 'object' && data !== null) {
        for (var k in data) {
          persistentMsgStore.set(k, reviveBuffers(data[k]));
        }
      }
    }
  } catch (e) {}
}
initMsgStore();

var saveMsgStoreTimer = null;
function persistMsgStore() {
  if (saveMsgStoreTimer) return;
  saveMsgStoreTimer = setTimeout(function() {
    saveMsgStoreTimer = null;
    try {
      var dir = path.dirname(MSG_STORE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      var obj = {};
      var entries = Array.from(persistentMsgStore.entries()).slice(-2000);
      for (var i = 0; i < entries.length; i++) {
        obj[entries[i][0]] = entries[i][1];
      }
      fs.writeFileSync(MSG_STORE_FILE, JSON.stringify(obj), 'utf8');
    } catch (e) {}
  }, 1000);
}

function storeMessage(id, message) {
  if (!id || !message) return;
  persistentMsgStore.set(id, message);
  if (!global.msgStore) global.msgStore = new Map();
  global.msgStore.set(id, message);
  persistMsgStore();
}

async function getStoredMessage(key) {
  if (!key) return undefined;
  var id = typeof key === 'string' ? key : key.id;
  if (!id) return undefined;

  if (persistentMsgStore.has(id)) {
    return persistentMsgStore.get(id);
  }
  if (global.msgStore && global.msgStore.has(id)) {
    return global.msgStore.get(id);
  }
  if (key.remoteJid && persistentMsgStore.has(key.remoteJid + ':' + id)) {
    return persistentMsgStore.get(key.remoteJid + ':' + id);
  }
  try {
    var { messageCache } = require('./services/antiDeleteService');
    if (messageCache && messageCache.has(id)) {
      var cached = messageCache.get(id);
      if (cached?.content) return cached.content;
    }
  } catch (e) {}

  return undefined;
}

const msgRetryCounterCache = NodeCache ? new NodeCache({ stdTTL: 3600, useClones: false }) : undefined;
const userDevicesCache = NodeCache ? new NodeCache({ stdTTL: 300, useClones: false }) : undefined;

let sock = null;
let startTime = null;
let presenceInterval = null;
let lastQR = null;
let lastPairingCode = null;
let pairingCodeRequested = false;
let consecutiveErrors = 0;
let isConnected = false;
let reconnectTimeout = null;

// Saved references for reliable auto-reconnects
let savedMessageHandler = null;
let savedStatusHandler = null;
let savedOnConnected = null;

function scheduleReconnect(reason, delayMs) {
  delayMs = typeof delayMs === 'number' ? delayMs : 3000;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  stopPresenceKeepAlive();
  console.log(`[CLIENT] 🔄 Reconnection scheduled: ${reason} (in ${Math.round(delayMs / 1000)}s)`);

  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;
    try {
      await startClient(savedMessageHandler, savedStatusHandler, savedOnConnected);
    } catch (err) {
      console.error('[CLIENT] ❌ Reconnection attempt failed:', err?.message || err);
      scheduleReconnect('Retry after connection failure', 5000);
    }
  }, delayMs);
}

function triggerSafeReconnect(reason, delayMs) {
  scheduleReconnect(reason || 'Manual reconnect requested', delayMs || 1000);
}

function getDashboardUrl() {
  try {
    const { getDashboardUrl: getUrl } = require('../server');
    return getUrl();
  } catch (e) {
    var pwd = process.env.DASHBOARD_PASSWORD || 'admin';
    var baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://' + (process.env.RENDER_SERVICE_NAME || 'nerd-eth-omemi-wa-bot') + '.onrender.com';
    return baseUrl + '/dashboard?pwd=' + pwd;
  }
}

function clearSessionFolder() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      const files = fs.readdirSync(SESSION_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(SESSION_DIR, file));
      }
      console.log('[CLIENT] Cleared corrupted session folder.');
    }
  } catch (e) {
    console.error('[CLIENT] Failed to clear session folder:', e.message);
  }
}

function resetSession() {
  lastQR = null;
  lastPairingCode = null;
  pairingCodeRequested = false;
  isConnected = false;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  clearSessionFolder();
  try {
    var { resetOnboarding } = require('./services/onboardingService');
    resetOnboarding();
  } catch (e) {}
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.ws?.close();
      sock.end(undefined);
    } catch (e) {}
    sock = null;
  }
  scheduleReconnect('Session reset requested', 1000);
}

async function startClient(messageHandler, statusHandler, onConnected) {
  if (messageHandler) savedMessageHandler = messageHandler;
  if (statusHandler) savedStatusHandler = statusHandler;
  if (onConnected) savedOnConnected = onConnected;
  // Clean up previous socket if existing
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.ws?.close();
      sock.end(undefined);
    } catch (e) {}
    sock = null;
  }

  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1043857760] }));

  // WhatsApp Desktop on macOS is the most stable companion device identity for Multi-Device
  var browser = Browsers.macOS('Desktop');

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLink: true,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,      // Ping WA servers every 25s natively
    connectTimeoutMs: 60000,
    qrTimeout: 180000,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: true,
    emitOwnEvents: true,
    retryRequestOnFail: true,
    msgRetryCounterCache,
    userDevicesCache,
    printQRInTerminal: false,
    patchMessageBeforeSending: (message) => {
      const requiresPatch = !!(
        message.buttonsMessage ||
        message.templateMessage ||
        message.listMessage
      );
      if (requiresPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...message
            }
          }
        };
      }
      return message;
    },
    getMessage: async (key) => {
      return await getStoredMessage(key);
    },
  });

  if (!global.msgStore) global.msgStore = new Map();
  if (!global.processedMsgIds) global.processedMsgIds = new Set();
  if (!global.botSentMessageIds) global.botSentMessageIds = new Set();

  // Intercept sendMessage to track bot-sent messages and cache for decryption retries
  const origSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const sent = await origSendMessage(jid, content, options);
    if (sent?.key?.id) {
      if (!global.botSentMessageIds) global.botSentMessageIds = new Set();
      global.botSentMessageIds.add(sent.key.id);
      if (global.botSentMessageIds.size > 2000) {
        const ids = Array.from(global.botSentMessageIds);
        for (let i = 0; i < 500; i++) global.botSentMessageIds.delete(ids[i]);
      }
      if (sent?.message) {
        storeMessage(sent.key.id, sent.message);
        if (sent.key.remoteJid) {
          storeMessage(sent.key.remoteJid + ':' + sent.key.id, sent.message);
        }
      }
      try {
        var textPreview = content?.text || content?.caption || (content?.video ? '🎬 Video' : (content?.image ? '📸 Image' : (content?.audio ? '🎵 Audio' : 'Media')));
        if (textPreview) {
          var { logMessage } = require('../server');
          logMessage('🤖 Nerd Bot', textPreview, 'outgoing');
        }
      } catch (e) {}
    }
    return sent;
  };

  startTime = Date.now();

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      lastQR = qr;
      var autoPairNumber = (process.env.PAIRING_NUMBER || config.pairingNumber || '').replace(/[^0-9]/g, '');
      if (autoPairNumber && autoPairNumber.length >= 10 && !pairingCodeRequested && !sock?.authState?.creds?.registered) {
        pairingCodeRequested = true;
        setTimeout(async () => {
          try {
            if (!sock || isConnected || sock.authState?.creds?.registered) return;
            var code = await sock.requestPairingCode(autoPairNumber);
            var formatted = (code && code.length === 8) ? (code.slice(0, 4) + '-' + code.slice(4)) : code;
            lastPairingCode = formatted;
            console.log('\n╔════════════════════════════════════════════════════════════════╗');
            console.log('║  🔢 WHATSAPP PAIRING CODE GENERATED                           ║');
            console.log('║  Phone: ' + autoPairNumber.padEnd(52) + ' ║');
            console.log('║  Pairing Code: ' + formatted.padEnd(45) + ' ║');
            console.log('║                                                                ║');
            console.log('║  1. Open WhatsApp on phone                                     ║');
            console.log('║  2. Go to Linked Devices → Link a Device                       ║');
            console.log('║  3. Tap "Link with phone number instead"                       ║');
            console.log('║  4. Enter the pairing code above                               ║');
            console.log('╚════════════════════════════════════════════════════════════════╝\n');
          } catch (pairErr) {
            console.warn('[CLIENT] Auto pairing code failed:', pairErr.message);
          }
        }, 1500);
      }

      const dashUrl = getDashboardUrl();
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║  📲 SCAN QR CODE TO CONNECT WHATSAPP                          ║');
      console.log('║  Open Dashboard: ' + dashUrl.padEnd(43) + ' ║');
      console.log('║  WhatsApp → Linked Devices → Link a Device                      ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
      QRCode.toString(qr, { type: 'terminal', small: true }, function(e, str) {
        if (!e && str) console.log(str);
        var qrFile = path.join(__dirname, '..', 'storage', 'qr.png');
        QRCode.toFile(qrFile, qr, { type: 'png', width: 512, margin: 2, color: { dark: '#000', light: '#FFF' } }, function() {});
      });
    }

    if (connection === 'close') {
      isConnected = false;
      try { require('../server').setDisconnected(); } catch(e) {}
      stopPresenceKeepAlive();

      const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : null;
      console.log(`[CLIENT] Connection closed. StatusCode: ${statusCode || 'unknown'}. Reason: ${lastDisconnect?.error?.message || 'none'}`);

      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

      if (isLoggedOut) {
        console.log('[CLIENT] Logged out or unrecoverable error (401). Resetting session credentials for fresh pairing...');
        clearSessionFolder();
        scheduleReconnect('Logged out / 401 fresh pairing', 3000);
      } else {
        consecutiveErrors++;
        const delay = Math.min(2500 * Math.min(consecutiveErrors, 4), 10000);
        console.log(`[CLIENT] Auto-reconnecting in ${Math.round(delay / 1000)}s...`);
        scheduleReconnect(`Connection closed (${statusCode || 'unknown'})`, delay);
      }
    }

    if (connection === 'open') {
      isConnected = true;
      lastPairingCode = null;
      pairingCodeRequested = false;
      consecutiveErrors = 0;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      console.log('\n====================================================');
      console.log('✅ WHATSAPP CONNECTED SUCCESSFULLY!');
      console.log(`👤 Logged in as: ${sock.user?.name || sock.user?.id || 'Unknown'}`);
      console.log(`🌐 Dashboard: ${getDashboardUrl()}`);
      console.log('====================================================\n');

      if (config.antiBan.alwaysOnline) {
        sock.sendPresenceUpdate('available').catch(() => {});
        startPresenceKeepAlive();
      }
      // Start recurring organic presence simulation if stealth mode active
      if (isStealthEnabled()) {
        const { startRecurringStealthPresence } = require('./services/stealthService');
        startRecurringStealthPresence(sock);
        console.log('[CLIENT] 🥷 Recurring organic presence simulation active.');
      }

      var { init: initScheduler } = require('./services/schedulerService');
      initScheduler(sock);

      if (typeof onConnected === 'function') {
        try { onConnected(sock); } catch (e) { console.error('[CLIENT] onConnected error:', e.message); }
      }
    }
  });

  sock.ev.on('messages.upsert', async (msg) => {
    try {
      if (!msg.messages || msg.messages.length === 0) return;
      var { cacheMessage } = require('./services/antiDeleteService');
      for (const m of msg.messages) {
        if (!m.message) continue;

        // Clean remoteJid: strip device suffix (e.g. :12) to prevent Baileys query timeouts
        if (m.key?.remoteJid && !m.key.remoteJid.endsWith('@g.us') && m.key.remoteJid.includes(':')) {
          m.key.remoteJid = m.key.remoteJid.split(':')[0] + '@s.whatsapp.net';
        }

        if (m.key?.id) {
          storeMessage(m.key.id, m.message);
        }

        // Cache all messages immediately for anti-delete recovery
        try { cacheMessage(m, sock); } catch (e) {}

        // Acknowledge read receipt to keep multi-device session synchronized
        if (m.key) {
          try { sock.readMessages([m.key]); } catch (e) {}
        }

        // Never allow bot-sent programmatic messages to trigger command handler / AI loop
        if (m.key?.id && global.botSentMessageIds && global.botSentMessageIds.has(m.key.id)) {
          continue;
        }

        var remoteJid = m.key?.remoteJid || '';

        // Status updates
        if (remoteJid === 'status@broadcast') {
          if (config.status.autoView || config.status.autoLike) {
            statusHandler(sock, m).catch(function(e) {
              console.error('[StatusHandler Error]', e.message);
            });
          }
          continue;
        }

        // Process message (works for both owner commands and other user commands)
        try {
          await messageHandler(sock, m);
        } catch (eH) {
          console.error('[MessageHandler Error]', eH.message);
        }
      }
    } catch (upsertErr) {
      console.error('[CLIENT] messages.upsert top-level error caught:', upsertErr?.message || upsertErr);
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    if (!updates || !updates.length) return;
    var { handleRevokeMessage } = require('./services/antiDeleteService');
    for (var update of updates) {
      if (update.update?.messageStubType === 68 || update.update?.protocolMessage?.type === 0 || update.update?.protocolMessage?.type === 'REVOKE') {
        var deletedId = update.key?.id || update.update?.protocolMessage?.key?.id;
        if (deletedId) {
          var fakeRevokeMsg = {
            key: update.key,
            pushName: update.pushName || 'User',
            message: {
              protocolMessage: {
                key: { id: deletedId },
                type: 0
              }
            }
          };
          await handleRevokeMessage(sock, fakeRevokeMsg).catch(function(e) {
            console.error('[AntiDelete Update Error]', e.message);
          });
        }
      }
    }
  });

  return sock;
}

function stopHeartbeat() {}

function startPresenceKeepAlive() {
  if (presenceInterval) clearInterval(presenceInterval);
  if (sock?.user?.id && isConnected) {
    sock.sendPresenceUpdate('available').catch(() => {});
  }
  // Native Baileys keepAliveIntervalMs: 25000 handles socket TCP ping silently.
  // Refresh presence status every 2.5 minutes (150s) instead of 25s to avoid WhatsApp server kicks/disconnects.
  presenceInterval = setInterval(async () => {
    if (!sock?.user?.id || !isConnected) return;
    try {
      await sock.sendPresenceUpdate('available');
    } catch (e) { }
  }, 150000);
}

function stopPresenceKeepAlive() {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
}

function getClient() {
  return sock;
}

function getUptime() {
  return Math.floor((Date.now() - startTime) / 1000);
}

function getLastQR() {
  return lastQR;
}

function getLastPairingCode() {
  return lastPairingCode;
}

async function requestPairingCode(phoneNumber) {
  var cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error('Invalid phone number. Provide number with country code (e.g. 2348012345678)');
  }

  // Wait if socket is currently initializing, or auto-start client
  var attempts = 0;
  if (!sock) {
    console.log('[CLIENT] Socket not started, auto-starting client for pairing request...');
    try { startClient(); } catch(e) {}
  }
  while (!sock && attempts < 15) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  if (!sock) {
    throw new Error('WhatsApp client is initializing. Please wait a few seconds and try again.');
  }

  if (sock.authState?.creds?.registered) {
    throw new Error('Bot is already connected to WhatsApp! Click "Reset Session" below first if you want to link a new number.');
  }

  try {
    const rawCode = await sock.requestPairingCode(cleanPhone);
    const formatted = (rawCode && rawCode.length === 8) ? (rawCode.slice(0, 4) + '-' + rawCode.slice(4)) : rawCode;
    lastPairingCode = formatted;
    console.log('[CLIENT] Pairing code generated for:', cleanPhone, 'Code:', formatted);
    return formatted;
  } catch (err) {
    console.error('[CLIENT] Pairing code error:', err.message);
    throw new Error('Pairing code failed: ' + (err.message || 'Unknown error'));
  }
}

module.exports = { startClient, getClient, getUptime, getLastQR, getLastPairingCode, requestPairingCode, resetSession, triggerSafeReconnect };
