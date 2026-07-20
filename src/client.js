const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { randomBetween, isDuplicateMessage } = require('./services/antiBanService');

const SESSION_DIR = path.join(__dirname, '..', 'sessions');

let sock = null;
let startTime = null;
let presenceInterval = null;
let lastQR = null;
let reconnectAttempts = 0;
let lastReconnectTime = 0;
let networkStormDetected = false;
let consecutiveErrors = 0;

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

async function startClient(messageHandler, statusHandler, onConnected) {
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

  // Standard Baileys browser string for maximum stability on WhatsApp servers
  const browser = Browsers.ubuntu('Chrome');

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: process.env.RENDER ? 'error' : 'silent' }),
    browser,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLink: false,
    defaultQueryTimeoutMs: 120000,
    keepAliveIntervalMs: 15000,
    connectTimeoutMs: 60000,
    qrTimeout: 180000,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: true,
    emitOwnEvents: true,
    retryRequestOnFail: true,
    printQRInTerminal: false,
  });

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
      const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : null;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;

      if (shouldReconnect) {
        consecutiveErrors++;
        const now = Date.now();
        const timeSinceLastReconnect = now - lastReconnectTime;

        if (timeSinceLastReconnect < 30000) {
          networkStormDetected = true;
        }

        const delay = networkStormDetected
          ? Math.min(5000 * Math.min(consecutiveErrors, 6), 30000)
          : Math.min(2000 * Math.min(consecutiveErrors, 5), 10000);

        console.log(`[CLIENT] Connection closed, reconnecting in ${Math.round(delay/1000)}s... (attempt #${consecutiveErrors})`);
        lastReconnectTime = now;

        setTimeout(() => startClient(messageHandler, statusHandler, onConnected), delay);
      } else {
        console.log('[CLIENT] Logged out or unrecoverable error. Restarting fresh auth session...');
        setTimeout(() => startClient(messageHandler, statusHandler, onConnected), 3000);
      }
    }

    if (connection === 'open') {
      consecutiveErrors = 0;
      networkStormDetected = false;
      console.log('\n====================================================');
      console.log('✅ WHATSAPP CONNECTED SUCCESSFULLY!');
      console.log(`👤 Logged in as: ${sock.user?.name || sock.user?.id || 'Unknown'}`);
      console.log(`🌐 Dashboard: ${getDashboardUrl()}`);
      console.log('====================================================\n');

      if (config.antiBan.alwaysOnline) {
        startPresenceKeepAlive();
      }
      if (typeof onConnected === 'function') {
        onConnected(sock);
      }
    }
  });

  sock.ev.on('messages.upsert', async (msg) => {
    if (!msg.messages || msg.messages.length === 0) return;
    for (const m of msg.messages) {
      if (!m.message) continue;
      var remoteJid = m.key?.remoteJid || '';
      var isFromMe = m.key?.fromMe;
      var msgText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';

      // Status updates
      if (remoteJid === 'status@broadcast') {
        if (config.status.autoView || config.status.autoLike) {
          await statusHandler(sock, m);
        }
        continue;
      }

      // Admin self-commands: allow owner to send commands to themselves
      if (isFromMe) {
        var prefix = config.prefix || '!';
        if (msgText && msgText.startsWith(prefix)) {
          await messageHandler(sock, m);
        }
        continue;
      }

      if (config.antiBan.enabled && isDuplicateMessage(m.key?.id)) continue;
      if (config.antiBan.enabled && config.antiBan.safeMode) {
        await new Promise(r => setTimeout(r, randomBetween(200, 800)));
      }
      await messageHandler(sock, m);
    }
  });

  return sock;
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
  if (!sock) throw new Error('Client not initialized');
  const code = await sock.requestPairingCode(phoneNumber);
  console.log('[CLIENT] Pairing code requested for:', phoneNumber, 'Code:', code);
  return code;
}

module.exports = { startClient, getClient, getUptime, getLastQR, requestPairingCode };
