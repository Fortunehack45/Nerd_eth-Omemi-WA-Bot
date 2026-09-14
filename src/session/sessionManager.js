const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

let NodeCache = null;
try {
  const nc = require('@cacheable/node-cache');
  NodeCache = nc.NodeCache || nc.default || nc;
} catch (e) {}

let getBaileys, DefaultDisconnectReason;
try {
  const bh = require('../utils/baileysHelper');
  getBaileys = bh.getBaileys;
  DefaultDisconnectReason = bh.DisconnectReason;
} catch (e) {}

const { normalizeJid, sanitizePairingNumber, parseJid } = require('../utils/helpers');

let config = {};
try {
  config = require('../../config');
} catch (e) {}

// Windows reserved device names (case-insensitive)
const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

const { maskPhoneNumber } = require('../utils/masking');

let firebaseService = null;
try {
  firebaseService = require('../services/firebaseService');
} catch (e) {}

class SessionManager extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {string} [options.sessionsDir] Path to root sessions directory
   * @param {Function} [options.baileysFactory] Factory function to create WASocket
   * @param {Function} [options.authFactory] Factory function to create auth state
   * @param {Function} [options.keyStoreFactory] Factory function for cacheable signal key store
   */
  constructor(options = {}) {
    super();
    this.sessionsRoot = path.resolve(options.sessionsDir || path.join(process.cwd(), 'sessions'));
    this.sessions = new Map(); // Map<sessionId, SessionInstance>
    this.startTime = Date.now();
    this.totalMessagesProcessed = 0;
    this.handlers = {
      messageHandler: null,
      statusHandler: null,
      onConnected: null,
    };

    this.baileysFactory = options.baileysFactory || null;
    this.authFactory = options.authFactory || null;
    this.keyStoreFactory = options.keyStoreFactory || null;

    if (!fs.existsSync(this.sessionsRoot)) {
      fs.mkdirSync(this.sessionsRoot, { recursive: true });
    }

    this.backupTimers = new Map();
    this.watchdogInterval = null;
    this.clusterBotSentMessageIds = new Set();
    global.clusterBotSentMessageIds = this.clusterBotSentMessageIds;
    this.groupLocks = new Map();
    this.startWatchdog();
  }

  /**
   * Continuous 24/7 Supervisor Watchdog
   * Checks socket health and resurrects dead/stranded sessions.
   */
  startWatchdog() {
    if (this.watchdogInterval) return;
    this.watchdogInterval = setInterval(async () => {
      for (const [sessionId, session] of this.sessions.entries()) {
        if (session.status === 'connected') {
          const ws = session.sock?.ws;
          if (ws && (ws.readyState === 2 || ws.readyState === 3 || ws.isClosed)) {
            console.warn(`[WATCHDOG] Session "${sessionId}" marked connected but socket is closed. Resurrecting...`);
            this.handleConnectionClose(sessionId, { error: new Error('Watchdog detected closed socket') });
          }
        } else if (session.status === 'reconnecting') {
          if (!session.reconnectTimer) {
            console.warn(`[WATCHDOG] Session "${sessionId}" stranded in reconnecting without timer. Rescheduling...`);
            this.scheduleReconnect(sessionId, 'Watchdog recovery');
          }
        }
      }
    }, 45000);
    if (this.watchdogInterval.unref) {
      this.watchdogInterval.unref();
    }
  }

  /**
   * Stop supervisor watchdog
   */
  stopWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  /**
   * Debounced backup of session credentials and keys to Firebase
   * @param {string} sessionId
   * @param {string} sessionDir
   */
  debounceBackupSession(sessionId, sessionDir) {
    if (!firebaseService || typeof firebaseService.isAvailable !== 'function' || !firebaseService.isAvailable()) return;
    if (!this.backupTimers) this.backupTimers = new Map();
    if (this.backupTimers.has(sessionId)) {
      clearTimeout(this.backupTimers.get(sessionId));
    }
    const timer = setTimeout(() => {
      this.backupTimers.delete(sessionId);
      firebaseService.backupSessionFiles(sessionId, sessionDir).catch(err => {
        console.warn(`[SESSION-MGR] Firebase backup failed for ${sessionId}:`, err.message);
      });
    }, 2500);
    this.backupTimers.set(sessionId, timer);
  }

  /**
   * Check if a JID or phone number belongs to ANY bot session on this server.
   * @param {string} jid
   * @returns {boolean}
   */
  isClusterBot(jid) {
    if (!jid || typeof jid !== 'string') return false;
    const cleanNum = parseJid(jid);
    const rawJid = normalizeJid(jid);

    for (const session of this.sessions.values()) {
      if (session.phoneNumber && cleanNum && session.phoneNumber === cleanNum) return true;
      if (session.sock?.user?.id) {
        const sockUserNum = parseJid(session.sock.user.id);
        if (sockUserNum && cleanNum && sockUserNum === cleanNum) return true;
        if (normalizeJid(session.sock.user.id) === rawJid) return true;
      }
      if (session.sock?.user?.lid && normalizeJid(session.sock.user.lid) === rawJid) return true;
      if (session.authState?.state?.creds?.me?.id) {
        const credNum = parseJid(session.authState.state.creds.me.id);
        if (credNum && cleanNum && credNum === cleanNum) return true;
      }
      if (session.authState?.state?.creds?.me?.lid && normalizeJid(session.authState.state.creds.me.lid) === rawJid) return true;
    }
    return false;
  }

  /**
   * Acquire a deduplication lock for a group chat to ensure only 1 bot on the server handles a message.
   * @param {string} groupJid
   * @param {string} lockKey
   * @returns {boolean} True if lock acquired, false if already locked by another bot
   */
  acquireGroupLock(groupJid, lockKey) {
    if (!groupJid || !lockKey) return true;
    const fullKey = `${groupJid}:${lockKey}`;
    const now = Date.now();

    if (this.groupLocks.size > 200) {
      for (const [k, ts] of this.groupLocks.entries()) {
        if (now - ts > 12000) this.groupLocks.delete(k);
      }
    }

    if (this.groupLocks.has(fullKey)) {
      const lockTs = this.groupLocks.get(fullKey);
      if (now - lockTs < 8000) {
        return false; // Lock active! Another bot is already handling this
      }
    }

    this.groupLocks.set(fullKey, now);
    return true;
  }

  /**
   * Record a bot-sent message ID globally across the entire cluster.
   * @param {string} msgId
   */
  recordBotSentMessage(msgId) {
    if (!msgId) return;
    this.clusterBotSentMessageIds.add(msgId);
    if (this.clusterBotSentMessageIds.size > 5000) {
      const ids = Array.from(this.clusterBotSentMessageIds);
      for (let i = 0; i < 1000; i++) this.clusterBotSentMessageIds.delete(ids[i]);
    }
  }

  /**
   * 3-tier Path Traversal Guard:
   * Tier 1: Length (1 to 64 chars) and no leading/trailing whitespace.
   * Tier 2: Whitelist regex /^[a-zA-Z0-9_-]+$/ (rejects slashes, dots, path separators).
   * Tier 3: Windows reserved system device names check (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
   * @param {string} sessionId
   * @returns {string} validated sessionId
   */
  validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Session ID must be a non-empty string');
    }
    const trimmed = sessionId.trim();
    if (trimmed !== sessionId) {
      throw new Error('Session ID cannot have leading or trailing whitespace');
    }
    if (sessionId.length < 1 || sessionId.length > 64) {
      throw new Error(`Session ID length must be between 1 and 64 characters (received: ${sessionId.length})`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      throw new Error(`Invalid session ID "${sessionId}": only alphanumeric characters, underscores, and hyphens are allowed`);
    }
    if (WINDOWS_RESERVED.has(sessionId.toLowerCase())) {
      throw new Error(`Invalid session ID "${sessionId}": reserved system device name`);
    }
    return sessionId;
  }

  /**
   * Resolves safe session directory ensuring containment within sessionsRoot.
   * @param {string} sessionId
   * @returns {string} absolute path to session directory
   */
  getSafeSessionDir(sessionId) {
    const validId = this.validateSessionId(sessionId);
    const resolvedPath = path.resolve(this.sessionsRoot, validId);
    const relative = path.relative(this.sessionsRoot, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') {
      throw new Error(`Path traversal attempt detected for session ID: ${validId}`);
    }
    return resolvedPath;
  }

  /**
   * Check if a session exists in memory.
   * @param {string} sessionId
   * @returns {boolean}
   */
  hasSession(sessionId) {
    try {
      this.validateSessionId(sessionId);
      return this.sessions.has(sessionId);
    } catch (e) {
      return false;
    }
  }

  /**
   * Get session instance by ID.
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    try {
      this.validateSessionId(sessionId);
      return this.sessions.get(sessionId) || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Returns all in-memory sessions.
   * @returns {Array<Object>}
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Returns all actively connected sessions.
   * @returns {Array<Object>}
   */
  getActiveSessions() {
    return Array.from(this.sessions.values()).filter(s => s.status === 'connected' && s.sock);
  }

  /**
   * Calculate exponential backoff delay in ms:
   * delay = min(round(2500 * 1.5^n), 30000)
   * @param {number} attempts
   * @returns {number}
   */
  calculateBackoffDelay(attempts) {
    const n = Math.max(0, attempts || 0);
    return Math.min(Math.round(2500 * Math.pow(1.5, n)), 30000);
  }

  /**
   * Normalizes JID delegating to helper.
   * @param {string} jid
   * @returns {string}
   */
  normalizeJid(jid) {
    return normalizeJid(jid);
  }

  /**
   * Provision a session record and directory.
   * @param {string} sessionId
   * @param {Object} [options]
   * @returns {Promise<Object>|Object}
   */
  async createSession(sessionId, options = {}) {
    const validId = this.validateSessionId(sessionId);
    if (this.sessions.has(validId)) {
      return this.sessions.get(validId);
    }

    const sessionDir = this.getSafeSessionDir(validId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const msgStore = new Map();
    const retryCache = new Map();

    const session = {
      id: validId,
      dir: sessionDir,
      folder: sessionDir,
      sock: null,
      status: 'idle', // 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'loggedOut' | 'destroyed'
      user: null,
      phoneNumber: options.phoneNumber || null,
      lastQR: null,
      lastPairingCode: null,
      pairingCodeRequested: false,
      consecutiveErrors: 0,
      reconnectAttempts: 0,
      reconnectTimer: null,
      presenceInterval: null,
      startedAt: null,
      createdAt: Date.now(),
      messagesCount: 0,
      options,

      // Isolated per-session NodeCaches
      msgRetryCounterCache: NodeCache ? new NodeCache({ stdTTL: 3600, useClones: false }) : null,
      userDevicesCache: NodeCache ? new NodeCache({ stdTTL: 300, useClones: false }) : null,
      signalKeyStoreCache: NodeCache ? new NodeCache({ stdTTL: 300, useClones: false, deleteOnExpire: true }) : null,

      // Bounded in-memory message store (per-session)
      msgStore,
      messageCache: msgStore, // Alias for testing contract
      retryCache,            // Map cache for testing contract
      processedMsgIds: new Set(),
      botSentMessageIds: new Set(),
      manager: this,
      authState: null,
    };

    this.sessions.set(validId, session);
    this.emit('session.created', { sessionId: validId, session });
    return session;
  }

  /**
   * Connect Baileys socket for a given session.
   * @param {string} sessionId
   * @param {Object} [handlers]
   * @returns {Promise<Object>} socket
   */
  async startSession(sessionId, handlers = {}) {
    const validId = this.validateSessionId(sessionId);
    let session = this.sessions.get(validId);
    if (!session) {
      session = await this.createSession(validId);
    }

    // Cancel active reconnect timer if any
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    this.stopPresenceKeepAlive(session);

    // Clean up previous socket if existing
    if (session.sock) {
      try {
        session.sock.ev.removeAllListeners();
        session.sock.ws?.close();
        session.sock.end(undefined);
      } catch (e) {}
      session.sock = null;
    }

    session.status = 'connecting';
    this.emit('session.connecting', { sessionId: validId });

    let makeWASocketFn = this.baileysFactory;
    let authStateFn = this.authFactory;
    let keyStoreFn = this.keyStoreFactory;
    let proto = null;
    let Browsers = null;
    let fetchLatestBaileysVersion = null;

    if (!makeWASocketFn || !authStateFn) {
      const b = typeof getBaileys === 'function' ? await getBaileys() : {};
      makeWASocketFn = makeWASocketFn || b.makeWASocket;
      authStateFn = authStateFn || b.useMultiFileAuthState;
      keyStoreFn = keyStoreFn || b.makeCacheableSignalKeyStore;
      proto = b.proto;
      Browsers = b.Browsers;
      fetchLatestBaileysVersion = b.fetchLatestBaileysVersion;
    }

    // Load isolated multi-file auth state in session directory
    const { state, saveCreds } = await authStateFn(session.dir);
    session.authState = { state, saveCreds };

    // Synchronous creds.json helper for immediate persistence and test validation
    const wrappedSaveCreds = async (...args) => {
      try {
        if (session && session.dir && state?.creds) {
          const credsPath = path.join(session.dir, 'creds.json');
          try {
            fs.writeFileSync(credsPath, JSON.stringify(state.creds, null, 2), 'utf8');
          } catch (e) {}
          this.debounceBackupSession(validId, session.dir);
        }
        if (typeof saveCreds === 'function') {
          await saveCreds(...args);
        }
      } catch (err) {}
    };

    // Cacheable Signal Key Store per session
    let cacheableKeys = state.keys;
    if (typeof keyStoreFn === 'function') {
      cacheableKeys = keyStoreFn(state.keys, pino({ level: 'silent' }), session.signalKeyStoreCache || session.retryCache);
    }

    let version = [2, 3000, 1043857760];
    if (typeof fetchLatestBaileysVersion === 'function') {
      try {
        const v = await fetchLatestBaileysVersion();
        if (v && v.version) version = v.version;
      } catch (e) {}
    }

    const browser = Browsers?.ubuntu ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'];

    const getMessage = async (key) => {
      try {
        if (!key || typeof key !== 'object' || !key.id) return undefined;
        let msg = session.msgStore.get(key.id);
        if (!msg && key.remoteJid) {
          msg = session.msgStore.get(`${key.remoteJid}:${key.id}`);
        }
        if (msg) {
          return msg;
        }
      } catch (e) {}
      return undefined;
    };

    const sock = makeWASocketFn({
      version,
      auth: {
        creds: state.creds,
        keys: cacheableKeys,
        state: {
          creds: state.creds,
          keys: cacheableKeys,
        },
        saveCreds: wrappedSaveCreds,
      },
      logger: pino({ level: 'silent' }),
      browser,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLink: true,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      connectTimeoutMs: 60000,
      qrTimeout: 180000,
      shouldSyncHistoryMessage: () => false,
      fireInitQueries: true,
      emitOwnEvents: false,
      retryRequestOnFail: true,
      msgRetryCounterCache: session.msgRetryCounterCache,
      placeholderResendCache: session.msgRetryCounterCache,
      userDevicesCache: session.userDevicesCache,
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
                ...message,
              }
            }
          };
        }
        return message;
      },
      getMessage,
    });

    // Explicitly attach getMessage to socket instance
    sock.getMessage = getMessage;
    session.sock = sock;

    // Outgoing message caching and deduplication
    if (typeof sock.sendMessage === 'function') {
      const origSendMessage = sock.sendMessage.bind(sock);
      sock.sendMessage = async (jid, content, options) => {
        const sent = await origSendMessage(jid, content, options);
        if (sent?.key?.id) {
          session.botSentMessageIds.add(sent.key.id);
          this.recordBotSentMessage(sent.key.id);
          try {
            const { recordChatReply } = require('../utils/antiLoop');
            recordChatReply(jid);
          } catch (e) {}
          if (session.botSentMessageIds.size > 2000) {
            const ids = Array.from(session.botSentMessageIds);
            for (let i = 0; i < 500; i++) session.botSentMessageIds.delete(ids[i]);
          }
          if (sent.message) {
            this.storeSessionMessage(session, sent.key.id, sent.message);
            if (sent.key.remoteJid) {
              this.storeSessionMessage(session, `${sent.key.remoteJid}:${sent.key.id}`, sent.message);
            }
          }
        }
        return sent;
      };
    }

    sock.ev.on('creds.update', wrappedSaveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.lastQR = qr;
        if (!session.pairingCodeRequested) {
          session.lastPairingCode = null;
        }
        this.emit('session.qr', { sessionId: validId, qr });
      }

      if (connection === 'close') {
        this.handleConnectionClose(validId, lastDisconnect);
      }

      if (connection === 'open') {
        session.status = 'connected';
        session.user = sock.user;
        session.lastPairingCode = null;
        session.lastQR = null;
        session.pairingCodeRequested = false;
        session.consecutiveErrors = 0;
        session.consecutive401Count = 0;
        session.reconnectAttempts = 0;
        session.startedAt = Date.now();

        if (session.reconnectTimer) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = null;
        }

        console.log(`[SESSION-MGR] ✅ Session "${validId}" connected successfully! User: ${sock.user?.name || sock.user?.id || 'Connected'}`);
        this.emit('session.connected', { sessionId: validId, user: sock.user, sock });
        this.emit('session:connected', { sessionId: validId, user: sock.user, sock });

        if (firebaseService && typeof firebaseService.isAvailable === 'function' && firebaseService.isAvailable()) {
          firebaseService.saveSession(validId, {
            status: 'connected',
            phoneNumber: session.phoneNumber || null,
            maskedPhone: maskPhoneNumber(session.phoneNumber || sock.user?.id || validId),
            startedAt: session.startedAt,
            messagesCount: session.messagesCount
          }).catch(() => {});
        }

        // Active TCP keep-alive and presence ping to prevent 2-3 hour idle disconnections
        if (typeof sock.sendPresenceUpdate === 'function') {
          sock.sendPresenceUpdate('available').catch(() => {});
        }
        this.startPresenceKeepAlive(session);

        // Immediate cloud backup upon successful connection
        this.debounceBackupSession(validId, session.dir);

        const onConnected = handlers.onConnected || this.handlers.onConnected;
        if (typeof onConnected === 'function') {
          try { onConnected(sock, session); } catch (e) {}
        }

        // Auto welcome/onboarding for newly connected WhatsApp account
        try {
          const { startOnboarding } = require('../services/onboardingService');
          setTimeout(() => {
            if (session.status === 'connected' && sock.user?.id) {
              startOnboarding(sock, false, sock.user.id).catch(() => {});
            }
          }, 3500);
        } catch (e) {}
      }
    });

    sock.ev.on('messages.upsert', async (msg) => {
      try {
        if (!msg.messages || msg.messages.length === 0) return;
        session.messagesCount += msg.messages.length;
        this.totalMessagesProcessed += msg.messages.length;

        for (const m of msg.messages) {
          if (!m.message) continue;

          if (m.key?.id) {
            if (session.processedMsgIds.has(m.key.id)) continue;
            session.processedMsgIds.add(m.key.id);
            if (session.processedMsgIds.size > 3000) {
              const ids = Array.from(session.processedMsgIds);
              for (let i = 0; i < 500; i++) session.processedMsgIds.delete(ids[i]);
            }
            this.storeSessionMessage(session, m.key.id, m.message);
            if (m.key.remoteJid) {
              this.storeSessionMessage(session, `${m.key.remoteJid}:${m.key.id}`, m.message);
            }
          }

          if (m.key?.remoteJid) {
            m.key.remoteJid = normalizeJid(m.key.remoteJid);
          }

          // Auto-view status updates ONLY (status@broadcast) - NEVER mark regular user messages as read!
          const isStatusBroadcast = (m.key?.remoteJid === 'status@broadcast');
          if (isStatusBroadcast && config.status?.autoView !== false && typeof sock.readMessages === 'function') {
            try { sock.readMessages([m.key]); } catch (e) {}
          }

          // 1. Never process messages sent by this bot session OR any other bot session on the cluster
          if (m.key?.id && (session.botSentMessageIds.has(m.key.id) || this.clusterBotSentMessageIds.has(m.key.id))) {
            continue;
          }

          // 2. Never process messages sent by ANY registered bot on this cluster (halts 2 bot users chatting loops)
          const senderJid = m.key?.participant || m.key?.remoteJid;
          if (senderJid && this.isClusterBot(senderJid)) {
            continue;
          }

          // 3. Drop messages containing bot signatures / status formats
          const innerMsg = m.message?.ephemeralMessage?.message || m.message?.viewOnceMessage?.message || m.message?.viewOnceMessageV2?.message || m.message?.documentWithCaptionMessage?.message || m.message;
          const msgBody = innerMsg?.conversation || innerMsg?.extendedTextMessage?.text || innerMsg?.imageMessage?.caption || innerMsg?.videoMessage?.caption || '';
          if (msgBody) {
            try {
              const { isBotSignature } = require('../utils/antiLoop');
              if (isBotSignature(msgBody)) {
                continue;
              }
            } catch (e) {}
          }

          // 4. In group chats: de-duplicate so only 1 bot on the server handles the message/command
          if (m.key?.remoteJid?.endsWith('@g.us')) {
            const groupLockKey = m.key?.id || (msgBody ? msgBody.trim().substring(0, 50) : '');
            if (groupLockKey && !this.acquireGroupLock(m.key.remoteJid, groupLockKey)) {
              continue; // Handled by sibling bot session
            }
          }

          // Filter out history syncs / stale messages older than session start
          const isLiveNotify = (msg.type === 'notify');
          const msgTs = Number(m.messageTimestamp) || 0;
          const startedSec = Math.floor((session.startedAt || Date.now()) / 1000);
          if (!isLiveNotify || (msgTs && startedSec && msgTs < (startedSec - 30))) {
            continue;
          }

          this.emit('messages.upsert', { sessionId: validId, sock, msg: m });

          const messageHandler = handlers.messageHandler || this.handlers.messageHandler;
          if (typeof messageHandler === 'function') {
            try {
              await messageHandler(sock, m, session);
            } catch (err) {
              console.error(`[SESSION-MGR] MessageHandler error in session "${validId}":`, err.message);
            }
          }
        }
      } catch (err) {
        console.error(`[SESSION-MGR] messages.upsert error in session "${validId}":`, err.message);
      }
    });

    return sock;
  }

  /**
   * Stores message in session bounded message store (evicts oldest when exceeding 2000).
   * @param {Object} session
   * @param {string} id
   * @param {Object} message
   */
  storeSessionMessage(session, id, message) {
    if (!id || !message) return;
    session.msgStore.set(id, message);
    if (session.msgStore.size > 2000) {
      const keys = Array.from(session.msgStore.keys());
      for (let i = 0; i < 500; i++) {
        session.msgStore.delete(keys[i]);
      }
    }
  }

  /**
   * Handles socket close with status code discrimination.
   * - 401 loggedOut: purges credentials, halts auto-reconnect.
   * - 515 restartRequired: fast reconnect with preserved credentials.
   * - 440 connectionReplaced: halts auto-reconnect.
   * - Network drops: exponential backoff with preserved credentials.
   * @param {string} sessionId
   * @param {Object} lastDisconnect
   */
  handleConnectionClose(sessionId, lastDisconnect) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.stopPresenceKeepAlive(session);

    const error = lastDisconnect?.error;
    const statusCode = (error instanceof Boom)
      ? error.output?.statusCode
      : (error?.output?.statusCode || error?.statusCode || error?.code || null);

    console.log(`[SESSION-MGR] [${sessionId}] Socket closed. Code: ${statusCode}. Reason: ${error?.message || 'none'}`);

    // 1. Logged Out (401) or Multidevice Mismatch (411) -> Purge credentials, do not auto-reconnect
    if (statusCode === 401 || statusCode === 411) {
      console.log(`[SESSION-MGR] [${sessionId}] Logged out (${statusCode}). Purging credential store.`);
      session.status = 'loggedOut';
      session.sock = null;
      this.clearSessionCredentials(sessionId);
      if (firebaseService && typeof firebaseService.isAvailable === 'function' && firebaseService.isAvailable()) {
        firebaseService.deleteCredentials(sessionId).catch(() => {});
      }
      this.emit('session.loggedOut', { sessionId, statusCode });
      this.emit('session:loggedOut', { sessionId, statusCode });
      return;
    }

    // 2. Stream Restart Required (515) -> NEVER purge credentials; fast restart
    if (statusCode === 515) {
      console.log(`[SESSION-MGR] [${sessionId}] Stream restart required (515). Reconnecting with preserved credentials...`);
      if (session.reconnectAttempts > 0) session.reconnectAttempts--;
      session.status = 'connecting';
      this.scheduleReconnect(sessionId, 'Restart Required (515)', 1000);
      return;
    }

    // 3. Connection Replaced (440) -> Another instance opened this session
    if (statusCode === 440) {
      console.log(`[SESSION-MGR] [${sessionId}] Connection replaced (440). Halting auto-reconnect to prevent conflicts.`);
      session.status = 'replaced';
      session.sock = null;
      this.emit('session.replaced', { sessionId });
      this.emit('session:replaced', { sessionId });
      return;
    }

    // 4. Transient network drop (408, 428, 503, ECONNRESET, etc.) -> Exponential backoff
    session.status = 'disconnected';
    session.sock = null;
    this.emit('session.disconnected', { sessionId, statusCode, willReconnect: true, lastDisconnect });
    this.emit('session:disconnected', { sessionId, statusCode, willReconnect: true, lastDisconnect });
    this.scheduleReconnect(sessionId, `Connection closed (${statusCode || 'transient'})`);
  }

  /**
   * Schedule automatic reconnect with exponential backoff.
   * @param {string} sessionId
   * @param {string} reason
   * @param {number|null} [overrideDelayMs=null]
   */
  scheduleReconnect(sessionId, reason, overrideDelayMs = null) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.status === 'loggedOut' || session.status === 'destroyed') return;

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    this.stopPresenceKeepAlive(session);

    const delay = (typeof overrideDelayMs === 'number')
      ? overrideDelayMs
      : this.calculateBackoffDelay(session.reconnectAttempts);

    session.reconnectAttempts++;
    session.status = 'reconnecting';
    console.log(`[SESSION-MGR] [${sessionId}] 🔄 Reconnecting in ${Math.round(delay / 1000)}s (attempt #${session.reconnectAttempts}, reason: ${reason})...`);

    session.reconnectTimer = setTimeout(async () => {
      session.reconnectTimer = null;
      try {
        await this.startSession(sessionId);
      } catch (err) {
        console.error(`[SESSION-MGR] [${sessionId}] Reconnection failed:`, err?.message || err);
        this.scheduleReconnect(sessionId, 'Retry after startup failure');
      }
    }, delay);
  }

  /**
   * Purges credentials directory for a session safely.
   * @param {string} sessionId
   */
  async clearSessionCredentials(sessionId) {
    const validId = this.validateSessionId(sessionId);
    const sessionDir = this.getSafeSessionDir(validId);
    if (fs.existsSync(sessionDir)) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          break;
        } catch (e) {
          if (attempt === 2) {
            console.error(`[SESSION-MGR] Failed to clear credentials for "${validId}":`, e.message);
          }
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
  }

  /**
   * Start presence and WebSocket TCP keep-alive (35s interval).
   * Actively pings WebSocket frame and presence to prevent 2-3 hour idle disconnections.
   * @param {Object} session
   */
  startPresenceKeepAlive(session) {
    this.stopPresenceKeepAlive(session);
    if (!session) return;

    const sendPingAndPresence = async () => {
      if (!session || session.status !== 'connected' || !session.sock) return;
      try {
        // 1. Raw WebSocket Frame Ping (keeps TCP connection and cloud NAT translation tables active)
        if (session.sock.ws && typeof session.sock.ws.ping === 'function') {
          session.sock.ws.ping();
        }
        // 2. WhatsApp protocol presence signal
        if (typeof session.sock.sendPresenceUpdate === 'function') {
          await session.sock.sendPresenceUpdate('available');
        }
      } catch (e) {
        if (session.sock?.ws && (session.sock.ws.readyState === 2 || session.sock.ws.readyState === 3)) {
          console.warn(`[SESSION-MGR] [${session.id}] Zombie socket detected by keep-alive. Triggering recovery...`);
          this.handleConnectionClose(session.id, { error: new Error('Keep-alive detected zombie socket') });
        }
      }
    };

    sendPingAndPresence();

    session.presenceInterval = setInterval(sendPingAndPresence, 35000);
    if (session.presenceInterval.unref) {
      session.presenceInterval.unref();
    }
  }

  /**
   * Stop presence keep-alive.
   * @param {Object} session
   */
  stopPresenceKeepAlive(session) {
    if (session && session.presenceInterval) {
      clearInterval(session.presenceInterval);
      session.presenceInterval = null;
    }
  }

  /**
   * Request pairing code for an existing or new session.
   * @param {string} sessionId
   * @param {string} phoneNumber
   * @returns {Promise<string>} 8-digit pairing code (XXXX-XXXX)
   */
  async requestPairing(sessionId, phoneNumber) {
    const validId = this.validateSessionId(sessionId);
    const cleanPhone = sanitizePairingNumber(phoneNumber);
    if (!cleanPhone || cleanPhone.length < 10) {
      throw new Error('Invalid phone number. Please enter a valid number with country code (e.g. 2348012345678)');
    }

    let session = this.sessions.get(validId);
    if (!session) {
      session = await this.createSession(validId, { phoneNumber: cleanPhone });
    }
    session.phoneNumber = cleanPhone;
    session.pairingCodeRequested = true;

    if (session.status === 'connected' && session.sock?.authState?.creds?.registered) {
      throw new Error(`Session "${validId}" is already paired and connected to WhatsApp.`);
    }

    if (!session.sock || session.status === 'disconnected' || session.status === 'idle') {
      await this.startSession(validId);
    }

    const sock = session.sock;
    const isSocketOpen = () => !!(sock && sock.ws && (sock.ws.isOpen || sock.ws?.readyState === 1 || sock.ws?.socket?.readyState === 1));

    let attempts = 0;
    while (!isSocketOpen() && attempts < 60) {
      await new Promise(r => setTimeout(r, 400));
      attempts++;
    }

    if (!isSocketOpen()) {
      throw new Error('WhatsApp gateway connection timed out. Please verify server connectivity and try again.');
    }

    await new Promise(r => setTimeout(r, 800));

    try {
      const rawCode = await sock.requestPairingCode(cleanPhone);
      const formatted = (rawCode && rawCode.length === 8)
        ? (rawCode.slice(0, 4) + '-' + rawCode.slice(4))
        : rawCode;
      session.lastPairingCode = formatted;
      this.emit('session.pairingCode', { sessionId: validId, code: formatted, phoneNumber: cleanPhone });
      return formatted;
    } catch (err) {
      console.error(`[SESSION-MGR] Pairing code request failed for session "${validId}":`, err.message);
      throw new Error('Pairing code failed: ' + (err.message || 'Unknown error'));
    }
  }

  /**
   * Stop session socket and timers without deleting directory.
   * @param {string} sessionId
   */
  async stopSession(sessionId) {
    const validId = this.validateSessionId(sessionId);
    const session = this.sessions.get(validId);
    if (!session) return;

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    this.stopPresenceKeepAlive(session);

    if (session.sock) {
      try {
        session.sock.ev.removeAllListeners();
        session.sock.ws?.close();
        session.sock.end(undefined);
      } catch (e) {}
      session.sock = null;
    }

    session.status = 'disconnected';
  }

  /**
   * Teardown and delete session. Sibling session folders are completely untouched.
   * Cleans up sockets, listeners, caches, and filesystem directory.
   * @param {string} sessionId
   * @param {boolean} [deleteStorage=false]
   * @returns {Promise<boolean>}
   */
  async destroySession(sessionId, deleteStorage = false) {
    let validId;
    try {
      validId = this.validateSessionId(sessionId);
    } catch (e) {
      return false;
    }

    const session = this.sessions.get(validId);
    if (!session) {
      return false;
    }

    const sessionDir = this.getSafeSessionDir(validId);

    // Safeguard: Never delete the sessions root
    if (path.resolve(sessionDir) === path.resolve(this.sessionsRoot)) {
      throw new Error('Refusing to delete root sessions directory');
    }

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    this.stopPresenceKeepAlive(session);

    if (session.sock) {
      try {
        if (session.sock.ev && typeof session.sock.ev.removeAllListeners === 'function') {
          session.sock.ev.removeAllListeners();
        }
        if (session.sock.ws && typeof session.sock.ws.close === 'function') {
          session.sock.ws.close();
        }
        if (typeof session.sock.end === 'function') {
          session.sock.end();
        }
        session.sock.isClosed = true;
      } catch (e) {}
      session.sock = null;
    }

    // Flush and close all NodeCache instances
    session.msgRetryCounterCache?.flushAll?.();
    session.msgRetryCounterCache?.close?.();
    session.userDevicesCache?.flushAll?.();
    session.userDevicesCache?.close?.();
    session.signalKeyStoreCache?.flushAll?.();
    session.signalKeyStoreCache?.close?.();

    // Clear in-memory message store and tracking maps
    if (session.msgStore && typeof session.msgStore.clear === 'function') {
      session.msgStore.clear();
    }
    if (session.retryCache && typeof session.retryCache.clear === 'function') {
      session.retryCache.clear();
    }
    session.processedMsgIds?.clear();
    session.botSentMessageIds?.clear();
    session.status = 'destroyed';

    this.sessions.delete(validId);

    if (deleteStorage && fs.existsSync(sessionDir)) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          break;
        } catch (e) {
          if (attempt === 2) {
            console.error(`[SESSION-MGR] Failed to remove session directory "${sessionDir}":`, e.message);
            throw e;
          }
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    if (deleteStorage && firebaseService && typeof firebaseService.isAvailable === 'function' && firebaseService.isAvailable()) {
      firebaseService.deleteSession(validId).catch(() => {});
      firebaseService.deleteCredentials(validId).catch(() => {});
    }

    this.emit('session.destroyed', { sessionId: validId, deletedStorage: !!deleteStorage });
    return true;
  }

  /**
   * Restart all active or provisioned sessions.
   */
  async restartAllSessions() {
    const sessionIds = Array.from(this.sessions.keys());
    for (const id of sessionIds) {
      try {
        await this.startSession(id);
      } catch (err) {
        console.error(`[SESSION-MGR] Error restarting session "${id}":`, err.message);
      }
    }
  }

  /**
   * Cold startup scan of sessions/ directory rehydrating valid credentials.
   * Restores sessions from Firebase Cloud Database if available.
   * @param {Object} [handlers]
   */
  async init(handlers = {}) {
    if (handlers) {
      this.handlers = { ...this.handlers, ...handlers };
    }

    if (!fs.existsSync(this.sessionsRoot)) {
      fs.mkdirSync(this.sessionsRoot, { recursive: true });
    }

    // 0. Cloud Database Discovery & Rehydration
    if (firebaseService && typeof firebaseService.isAvailable === 'function' && firebaseService.isAvailable()) {
      try {
        console.log('[SESSION-MGR] ☁️ Checking Firebase Cloud Database for stored sessions...');
        const remoteSessionIds = await firebaseService.listAllCredentialSessionIds();
        for (const remId of remoteSessionIds) {
          try {
            this.validateSessionId(remId);
            const localDir = this.getSafeSessionDir(remId);
            const localCreds = path.join(localDir, 'creds.json');
            if (!fs.existsSync(localCreds)) {
              console.log(`[SESSION-MGR] 📥 Restoring session "${remId}" from Firebase Cloud Database...`);
              await firebaseService.restoreSessionFiles(remId, localDir);
            }
          } catch (e) {
            console.warn(`[SESSION-MGR] ⚠️ Skipping remote session ID "${remId}":`, e.message);
          }
        }
      } catch (cloudErr) {
        console.warn('[SESSION-MGR] Firebase session discovery note:', cloudErr.message);
      }
    }

    // Check for legacy migration: if creds.json is directly in root sessions/
    const legacyCreds = path.join(this.sessionsRoot, 'creds.json');
    if (fs.existsSync(legacyCreds)) {
      const defaultDir = path.join(this.sessionsRoot, 'default');
      if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true });
        console.log('[SESSION-MGR] 📦 Migrating legacy single-session files to sessions/default/...');
        const files = fs.readdirSync(this.sessionsRoot);
        for (const file of files) {
          const src = path.join(this.sessionsRoot, file);
          const stat = fs.statSync(src);
          if (stat.isFile()) {
            const dest = path.join(defaultDir, file);
            fs.renameSync(src, dest);
          }
        }
      }
    }

    const entries = fs.readdirSync(this.sessionsRoot, { withFileTypes: true });
    const sessionDirs = entries.filter(e => e.isDirectory());
    console.log(`[SESSION-MGR] 🔍 Found ${sessionDirs.length} session folder(s) in ${this.sessionsRoot}`);

    for (const dirent of sessionDirs) {
      const sessionId = dirent.name;
      try {
        this.validateSessionId(sessionId);
      } catch (e) {
        console.warn(`[SESSION-MGR] ⚠️ Skipping invalid session folder name: "${sessionId}"`);
        continue;
      }

      const credsFile = path.join(this.sessionsRoot, sessionId, 'creds.json');
      if (fs.existsSync(credsFile)) {
        try {
          const credsData = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
          const isValid = credsData && (credsData.registered === true || credsData.me?.id);
          if (isValid) {
            console.log(`[SESSION-MGR] 🔄 Rehydrating authenticated session: "${sessionId}" (${credsData.me?.id || 'Registered'})`);
            await this.startSession(sessionId).catch(err => {
              console.error(`[SESSION-MGR] Failed to rehydrate session "${sessionId}":`, err.message);
            });
            await new Promise(r => setTimeout(r, 400));
          } else {
            console.log(`[SESSION-MGR] ℹ️ Found unlinked session folder "${sessionId}". Initializing as idle.`);
            await this.createSession(sessionId);
          }
        } catch (parseErr) {
          console.error(`[SESSION-MGR] Corrupt creds.json in "${sessionId}":`, parseErr.message);
        }
      } else {
        await this.createSession(sessionId);
      }
    }
  }

  /**
   * Return public aggregate platform stats without sensitive data.
   * @returns {Object}
   */
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
    const platformUptime = `${h}h ${m}m ${s}s`;

    return {
      activeBots,
      totalSessions: this.sessions.size,
      platformUptime,
      uptimeSeconds: uptimeSec,
      totalMessagesProcessed: totalMessages || this.totalMessagesProcessed,
    };
  }

  /**
   * Return session list for Admin Dashboard with masked phone numbers.
   * @returns {Array<Object>}
   */
  getAdminSessionList() {
    const list = [];
    for (const session of this.sessions.values()) {
      const phoneOrJid = session.phoneNumber || session.user?.id || session.authState?.state?.creds?.me?.id || session.sock?.user?.id || null;
      list.push({
        id: session.id,
        maskedPhone: maskPhoneNumber(phoneOrJid),
        status: session.status,
        uptime: session.startedAt ? Math.floor((Date.now() - session.startedAt) / 1000) : (session.createdAt ? Math.floor((Date.now() - session.createdAt) / 1000) : 0),
        messagesCount: session.messagesCount || 0,
        createdAt: session.createdAt,
      });
    }
    return list;
  }
}

const defaultSessionManager = new SessionManager();

module.exports = {
  SessionManager,
  sessionManager: defaultSessionManager,
  default: SessionManager,
  sanitizePairingNumber,
  maskPhoneNumber,
};
