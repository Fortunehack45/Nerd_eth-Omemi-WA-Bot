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

let sock = null;
let startTime = null;
let presenceInterval = null;
let lastQR = null;
let reconnectAttempts = 0;
let lastReconnectTime = 0;
let networkStormDetected = false;
let consecutiveErrors = 0;
let isReconnecting = false;
let failedPingCount = 0;

// Saved references for 24/7 zero-downtime auto-reconnects
let savedMessageHandler = null;
let savedStatusHandler = null;
let savedOnConnected = null;

function triggerSafeReconnect(reason, delayMs) {
  delayMs = delayMs || 3000;
  if (isReconnecting) {
    return;
  }
  isReconnecting = true;
  console.log(`[CLIENT WATCHDOG] ⚡ 24/7 Auto-Reconnect triggered: ${reason} (in ${Math.round(delayMs / 1000)}s)`);

  stopHeartbeat();
  stopPresenceKeepAlive();

  if (sock) {
    try { sock.ev.removeAllListeners(); } catch (e) {}
    try { sock.ws?.terminate(); } catch (e) {}
    try { sock.end(undefined); } catch (e) {}
    sock = null;
  }

  setTimeout(async () => {
    try {
      await startClient(savedMessageHandler, savedStatusHandler, savedOnConnected);
      isReconnecting = false;
    } catch (err) {
      console.error('[CLIENT WATCHDOG] Reconnection attempt failed:', err?.message || err);
      isReconnecting = false;
      // Exponential backoff retry (min 3s, max 15s) - NEVER stops retrying
      const nextDelay = Math.min(3000 * Math.max(1, Math.min(consecutiveErrors, 5)), 15000);
      triggerSafeReconnect('Retry after failed reconnect: ' + (err?.message || 'error'), nextDelay);
    }
  }, delayMs);
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
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  // Use stealth rotating fingerprint when stealth mode is active, otherwise use stable macOS Desktop
  var browser;
  if (isStealthEnabled()) {
    var stealthFp = getSessionFingerprint();
    browser = stealthFp || Browsers.macOS('Desktop');
    console.log('[CLIENT] 🥷 Stealth fingerprint active:', Array.isArray(browser) ? browser.join(' / ') : browser);
  } else {
    browser = Browsers.macOS('Desktop');
  }

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: process.env.RENDER ? 'error' : 'silent' }),
    browser,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLink: true,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,      // Ping WA servers every 25s (prevents socket drops and timeouts)
    connectTimeoutMs: 30000,
    qrTimeout: 180000,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: true,
    emitOwnEvents: true,
    retryRequestOnFail: true,
    printQRInTerminal: false,
    getMessage: async (key) => {
      if (global.msgStore && global.msgStore.has(key.id)) {
        return global.msgStore.get(key.id);
      }
      return { conversation: 'Message' };
    },
  });

  if (!global.msgStore) global.msgStore = new Map();
  if (!global.processedMsgIds) global.processedMsgIds = new Set();

  startTime = Date.now();

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      lastQR = qr;
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

    if (lastDisconnect?.error) {
      const statusCode = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : null;
      console.error('[CLIENT] Connection update disconnect:', lastDisconnect.error?.message || lastDisconnect.error, 'StatusCode:', statusCode);

      // Handle 401 Unauthorized / Logged Out -> clear session for fresh QR code
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log('[CLIENT] Session logged out or invalid credentials. Resetting session...');
        clearSessionFolder();
      }
    }

    if (connection === 'close') {
      try { require('../server').setDisconnected(); } catch(e) {}
      const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : null;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

      if (isLoggedOut) {
        console.log('[CLIENT] Logged out or unrecoverable error (401). Resetting session credentials for fresh pairing...');
        clearSessionFolder();
        triggerSafeReconnect('Logged out / 401 fresh pairing', 2000);
      } else {
        consecutiveErrors++;
        const now = Date.now();
        const timeSinceLastReconnect = now - lastReconnectTime;
        if (timeSinceLastReconnect < 30000) {
          networkStormDetected = true;
        }
        const delay = networkStormDetected
          ? Math.min(4000 * Math.min(consecutiveErrors, 5), 20000)
          : Math.min(1500 * Math.min(consecutiveErrors, 4), 6000);

        lastReconnectTime = now;
        triggerSafeReconnect(`Connection closed (${statusCode || 'Unknown reason'})`, delay);
      }
    }

    if (connection === 'open') {
      isReconnecting = false;
      consecutiveErrors = 0;
      failedPingCount = 0;
      networkStormDetected = false;
      console.log('\n====================================================');
      console.log('✅ WHATSAPP CONNECTED SUCCESSFULLY!');
      console.log(`👤 Logged in as: ${sock.user?.name || sock.user?.id || 'Unknown'}`);
      console.log(`🌐 Dashboard: ${getDashboardUrl()}`);
      console.log('====================================================\n');

      if (config.antiBan.alwaysOnline) {
        startPresenceKeepAlive();
      }
      // Start recurring organic presence simulation if stealth mode active
      if (isStealthEnabled()) {
        const { startRecurringStealthPresence } = require('./services/stealthService');
        startRecurringStealthPresence(sock);
        console.log('[CLIENT] 🥷 Recurring organic presence simulation active.');
      }
      // Start active 24/7 heartbeat watchdog to detect and heal dead sockets immediately
      startHeartbeat();

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

        if (m.key?.id && global.msgStore) {
          if (global.processedMsgIds.has(m.key.id)) continue;
          global.processedMsgIds.add(m.key.id);
          if (global.processedMsgIds.size > 3000) {
            const arr = Array.from(global.processedMsgIds);
            for (let i = 0; i < 1500; i++) global.processedMsgIds.delete(arr[i]);
          }
          global.msgStore.set(m.key.id, m.message);
        }

        // Cache all messages immediately for anti-delete recovery
        try { cacheMessage(m, sock); } catch (e) {}

        var remoteJid = m.key?.remoteJid || '';
        var isFromMe = m.key?.fromMe;
        var msgText = m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.imageMessage?.caption || m.message?.videoMessage?.caption || '';

        // Status updates
        if (remoteJid === 'status@broadcast') {
          if (config.status.autoView || config.status.autoLike) {
            statusHandler(sock, m).catch(function(e) {
              console.error('[StatusHandler Error]', e.message);
            });
          }
          continue;
        }

        // Admin self-commands: allow owner to send commands to themselves or in any chat
        if (isFromMe) {
          var prefix = config.prefix || '!';
          var { parseJid } = require('./utils/helpers');
          var botNum = parseJid(sock.user?.id || sock.user?.jid || '');
          var isSelfChat = remoteJid ? (parseJid(remoteJid) === botNum) : false;
          var hasPrefix = msgText && msgText.startsWith(prefix);
          var isReaction = !!m.message?.reactionMessage;

          if (hasPrefix || isReaction || isSelfChat) {
            try { await messageHandler(sock, m); } catch (eH) { console.error('[MessageHandler Self Error]', eH.message); }
          }
          continue;
        }

        if (config.antiBan.enabled && isDuplicateMessage(m.key?.id)) continue;
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

let heartbeatInterval = null;

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  failedPingCount = 0;

  heartbeatInterval = setInterval(async () => {
    if (!sock) return;

    // Detect closed/broken websocket
    if (!sock.ws || sock.ws.readyState !== 1) {
      console.warn('[CLIENT WATCHDOG] WebSocket not in OPEN state (readyState=' + (sock.ws ? sock.ws.readyState : 'null') + '). Auto-healing...');
      triggerSafeReconnect('WebSocket closed or non-ready state', 1000);
      return;
    }

    try {
      // 8-second timeout race on ping/presence update
      await Promise.race([
        (typeof sock.sendPing === 'function' ? sock.sendPing() : sock.sendPresenceUpdate('available')),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout (8s)')), 8000))
      ]);
      failedPingCount = 0; // Ping succeeded, socket is 100% active
    } catch (e) {
      failedPingCount++;
      console.warn(`[CLIENT WATCHDOG] Ping failed (${failedPingCount}/2):`, e.message);
      if (failedPingCount >= 2) {
        console.error('[CLIENT WATCHDOG] 🚨 2 consecutive heartbeat pings failed! Dead socket detected. Forcing immediate zero-downtime reconnect...');
        failedPingCount = 0;
        triggerSafeReconnect('Dead socket timeout detected by 24/7 watchdog', 500);
      }
    }
  }, 15000); // 15s interval for zero downtime
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function startPresenceKeepAlive() {
  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = setInterval(async () => {
    if (!sock?.user?.id) return;
    try {
      const jids = ['status@broadcast'];
      await sock.sendPresenceUpdate('available', jids[0]);
    } catch (e) { }
  }, randomBetween(40000, 60000));
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

async function requestPairingCode(phoneNumber) {
  var cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error('Invalid phone number. Provide number with country code (e.g. 2348012345678)');
  }

  // Wait if socket is currently initializing
  var attempts = 0;
  while (!sock && attempts < 10) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  if (!sock) {
    throw new Error('WhatsApp client is starting up. Please wait 5 seconds and try again.');
  }

  if (sock.authState?.creds?.registered) {
    throw new Error('Bot is already connected to WhatsApp! Click "Reset Session" first if you want to link a new number.');
  }

  try {
    const code = await sock.requestPairingCode(cleanPhone);
    console.log('[CLIENT] Pairing code generated for:', cleanPhone, 'Code:', code);
    return code;
  } catch (err) {
    console.error('[CLIENT] Pairing code error:', err.message);
    throw new Error('Pairing code failed: ' + (err.message || 'Unknown error'));
  }
}

module.exports = { startClient, getClient, getUptime, getLastQR, requestPairingCode, resetSession, triggerSafeReconnect };
