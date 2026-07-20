const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const config = require('../config');
const { getSafeBrowser, randomBetween, isDuplicateMessage } = require('./services/antiBanService');

const SESSION_DIR = path.join(__dirname, '..', 'sessions');

let sock = null;
let startTime = null;
let presenceInterval = null;

async function startClient(messageHandler, statusHandler, onConnected) {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const browser = config.antiBan.enabled ? getSafeBrowser() : ['WhatsAppBot', 'Chrome', '1.0.0'];

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLink: true,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    patchMessageBeforeSending: true,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: true,
    emitOwnEvents: false,
    retryRequestOnFail: true,
  });

  startTime = Date.now();

  if (config.antiBan.enabled) {
    sock.ev.on('creds.update', (creds) => {
      if (creds?.registered && creds?.serverToken && creds?.clientToken) {
        saveCreds();
      }
    });
  } else {
    sock.ev.on('creds.update', saveCreds);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n============================================');
      console.log('  Scan the QR code with your WhatsApp');
      console.log('  Open WhatsApp → Linked Devices → Link a Device');
      console.log('============================================\n');
      qrcodeTerminal.generate(qr, { small: false });
      console.log('\n============================================');
      console.log('  QR text (use at https://qrcode.monster if scan fails):');
      console.log('  ' + qr);
      try {
        var qrPath = path.join(__dirname, '..', 'storage', 'qr.png');
        QRCode.toFile(qrPath, qr, { type: 'png', width: 400, margin: 2 }, function(err) {
          if (!err) console.log('  QR image saved: ' + qrPath);
        });
      } catch (e) {}
      console.log('============================================\n');
    }
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true;
      if (shouldReconnect) {
        const delay = config.antiBan.enabled ? randomBetween(3000, 8000) : 1000;
        console.log(`Connection closed, reconnecting in ${delay}ms...`);
        setTimeout(() => startClient(messageHandler, statusHandler, onConnected), delay);
      } else {
        console.log('Logged out. Delete sessions folder and restart.');
      }
    }
    if (connection === 'open') {
      console.log('WhatsApp connected successfully!');
      console.log(`Logged in as: ${sock.user?.name || sock.user?.id || 'Unknown'}`);
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
      if (!m.message || m.key?.fromMe) continue;
      if (m.key?.remoteJid === 'status@broadcast') {
        if (config.status.autoView || config.status.autoLike) {
          await statusHandler(sock, m);
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

module.exports = { startClient, getClient, getUptime };
