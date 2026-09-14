/**
 * Reference / Mock SessionManager implementing interface contracts defined in PROJECT.md.
 * Used for deterministic E2E test harness execution and specification compliance.
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('./mockBaileys');
const { normalizeJid } = require('../../src/utils/helpers');

class MockSessionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessionsDir = options.sessionsDir || path.join(process.cwd(), 'sessions');
    this.sessions = new Map();
    this.startTime = Date.now();
    this.baileysFactory = options.baileysFactory || makeWASocket;
    this.authFactory = options.authFactory || useMultiFileAuthState;
    this.keyStoreFactory = options.keyStoreFactory || makeCacheableSignalKeyStore;

    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  async init() {
    if (!fs.existsSync(this.sessionsDir)) return;
    const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const credsPath = path.join(this.sessionsDir, entry.name, 'creds.json');
        if (fs.existsSync(credsPath)) {
          await this.createSession(entry.name);
          await this.startSession(entry.name);
        }
      }
    }
  }

  async createSession(sessionId, options = {}) {
    if (!sessionId) throw new Error('sessionId is required');
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    const sessionFolder = path.join(this.sessionsDir, sessionId);
    if (!fs.existsSync(sessionFolder)) {
      fs.mkdirSync(sessionFolder, { recursive: true });
    }

    const messageCache = new Map();
    const retryCache = new Map();

    const session = {
      id: sessionId,
      folder: sessionFolder,
      status: 'initialized',
      sock: null,
      messageCache,
      retryCache,
      createdAt: Date.now(),
      messagesCount: 0,
      options
    };

    this.sessions.set(sessionId, session);
    this.emit('session.created', { sessionId, session });
    return session;
  }

  async startSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const { state, saveCreds } = await this.authFactory(session.folder);
    const keyStore = this.keyStoreFactory(state.keys, null, session.retryCache);

    const sock = this.baileysFactory({
      auth: {
        state: {
          creds: state.creds,
          keys: keyStore
        },
        saveCreds
      },
      getMessage: async (key) => {
        if (!key || !key.id) return undefined;
        return session.messageCache.get(key.id) || undefined;
      }
    });

    session.sock = sock;
    session.status = 'connecting';

    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'open') {
        session.status = 'connected';
        this.emit('session.connected', { sessionId });
      } else if (update.connection === 'close') {
        session.status = 'disconnected';
        this.emit('session.disconnected', { sessionId, lastDisconnect: update.lastDisconnect });
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', (m) => {
      session.messagesCount += (m.messages ? m.messages.length : 1);
      // Cache messages for getMessage protocol
      if (m.messages) {
        for (const msg of m.messages) {
          if (msg.key && msg.key.id) {
            session.messageCache.set(msg.key.id, msg.message);
          }
        }
      }
    });

    return sock;
  }

  async requestPairing(sessionId, phoneNumber) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = await this.createSession(sessionId);
    }
    if (!session.sock) {
      await this.startSession(sessionId);
    }
    return await session.sock.requestPairingCode(phoneNumber);
  }

  async destroySession(sessionId, deleteStorage = false) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.sock) {
      // 1. Remove all listeners from socket ev
      if (session.sock.ev && typeof session.sock.ev.removeAllListeners === 'function') {
        session.sock.ev.removeAllListeners();
      }

      // 2. Close the socket
      if (session.sock.ws && typeof session.sock.ws.close === 'function') {
        session.sock.ws.close();
      }
      if (typeof session.sock.end === 'function') {
        session.sock.end();
      }
      session.sock.isClosed = true;
    }

    // 3. Clear caches
    if (session.messageCache) session.messageCache.clear();
    if (session.retryCache) session.retryCache.clear();

    session.status = 'destroyed';
    this.sessions.delete(sessionId);

    // 4. Optionally unlink filesystem directory
    if (deleteStorage && fs.existsSync(session.folder)) {
      try {
        fs.rmSync(session.folder, { recursive: true, force: true });
      } catch (err) {
        // Fallback for older Node versions if any
        fs.rmdirSync(session.folder, { recursive: true });
      }
    }

    this.emit('session.destroyed', { sessionId, deletedStorage: deleteStorage });
    return true;
  }

  normalizeJid(jid) {
    return normalizeJid(jid);
  }

  getPublicStats() {
    let activeBots = 0;
    let totalMessages = 0;
    for (const session of this.sessions.values()) {
      if (session.status === 'connected') {
        activeBots++;
      }
      totalMessages += (session.messagesCount || 0);
    }

    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = uptimeSec % 60;

    return {
      activeBots,
      totalSessions: this.sessions.size,
      platformUptime: `${h}h ${m}m ${s}s`,
      totalMessagesProcessed: totalMessages
    };
  }

  getAdminSessionList() {
    const { maskPhoneNumber } = require('../../src/utils/masking');
    const list = [];
    for (const [id, s] of this.sessions.entries()) {
      const rawJid = s.sock?.user?.id || s.phoneNumber || id;
      const masked = maskPhoneNumber(rawJid);

      list.push({
        id,
        maskedPhone: masked,
        status: s.status,
        uptime: Math.floor((Date.now() - s.createdAt) / 1000),
        messagesCount: s.messagesCount || 0
      });
    }
    return list;
  }
}

module.exports = {
  MockSessionManager,
  SessionManager: MockSessionManager
};
