/**
 * Zero-dependency Mock Baileys Socket and Auth Harness
 * Conforms to @whiskeysockets/baileys WASocket interface for automated testing.
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DisconnectReason = {
  connectionClosed: 428,
  connectionLost: 408,
  loggedOut: 401,
  restartRequired: 515,
  timedOut: 408,
  badSession: 500,
  connectionReplaced: 440,
  multideviceMismatch: 411,
  forbidden: 403,
  unavailableService: 503
};

class MockWASocket extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.ev = new EventEmitter();
    this.sentMessages = [];
    this.isClosed = false;
    this.getMessage = config.getMessage || (async () => undefined);

    // Initial user details
    this.user = config.auth?.state?.creds?.me || {
      id: '2349161239200:1@s.whatsapp.net',
      name: 'MockBot'
    };

    // WebSocket mock state (starts connecting until simulateOpen is triggered)
    this.ws = {
      isOpen: false,
      readyState: 0, // 0 = CONNECTING, 1 = OPEN, 3 = CLOSED
      close: () => {
        this.ws.isOpen = false;
        this.ws.readyState = 3;
      },
      terminate: () => {
        this.ws.isOpen = false;
        this.ws.readyState = 3;
      }
    };
  }

  async sendMessage(jid, content, options = {}) {
    if (this.isClosed) {
      throw new Error('Cannot send message: socket is closed');
    }
    const msgId = 'MOCK_' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const messageRecord = {
      key: {
        remoteJid: jid,
        fromMe: true,
        id: msgId,
        participant: options.participant
      },
      message: content,
      messageTimestamp: Math.floor(Date.now() / 1000),
      options
    };
    this.sentMessages.push(messageRecord);
    return messageRecord;
  }

  async requestPairingCode(phoneNumber) {
    if (!phoneNumber) {
      throw new Error('Phone number is required to generate pairing code');
    }
    // Generate an 8-character alphanumeric code formatted as XXXX-XXXX
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code.slice(0, 4) + '-' + code.slice(4);
  }

  async sendPresenceUpdate(type, toJid) {
    return true;
  }

  async readMessages(keys) {
    return true;
  }

  end(error) {
    this.isClosed = true;
    this.ws.close();
    this.ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: error || new Error('Connection terminated'),
        date: new Date()
      }
    });
  }

  async logout(error) {
    this.end(error || new Error('Logged out'));
  }

  simulateOpen() {
    this.isClosed = false;
    this.ws.isOpen = true;
    this.ws.readyState = 1;
    this.ev.emit('connection.update', {
      connection: 'open'
    });
  }

  simulateIncomingMessage(fromJid, text, isGroup = false) {
    const msgId = 'IN_' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const upsert = {
      type: 'notify',
      messages: [
        {
          key: {
            remoteJid: fromJid,
            fromMe: false,
            id: msgId,
            participant: isGroup ? '2348011112222@s.whatsapp.net' : undefined
          },
          message: {
            conversation: text
          },
          messageTimestamp: Math.floor(Date.now() / 1000)
        }
      ]
    };
    this.ev.emit('messages.upsert', upsert);
    return upsert;
  }
}

function makeWASocket(config = {}) {
  return new MockWASocket(config);
}

async function useMultiFileAuthState(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const credsPath = path.join(folderPath, 'creds.json');
  let creds;
  if (fs.existsSync(credsPath)) {
    try {
      creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    } catch (e) {
      creds = null;
    }
  }

  if (!creds) {
    creds = {
      me: {
        id: '2349161239200:1@s.whatsapp.net',
        name: 'MockBot'
      },
      registered: true,
      registration: {},
      pairingCode: null,
      noiseKey: crypto.randomBytes(32).toString('hex'),
      signedIdentityKey: crypto.randomBytes(32).toString('hex'),
      signedPreKey: crypto.randomBytes(32).toString('hex'),
      registrationId: Math.floor(Math.random() * 10000),
      advSecretKey: crypto.randomBytes(32).toString('hex'),
      processedHistoryMessages: [],
      nextPreKeyId: 1,
      firstUnuploadedPreKeyId: 1,
      accountSettings: { unarchiveChats: false }
    };
  }

  const saveCreds = async () => {
    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2), 'utf8');
  };

  const keyStore = new Map();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            const key = `${type}-${id}`;
            if (keyStore.has(key)) {
              data[id] = keyStore.get(key);
            }
          }
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value !== undefined && value !== null) {
                keyStore.set(key, value);
              } else {
                keyStore.delete(key);
              }
            }
          }
        }
      }
    },
    saveCreds
  };
}

function makeCacheableSignalKeyStore(store, logger, cache) {
  const localCache = cache || new Map();
  return {
    get: async (type, ids) => {
      const result = {};
      const missing = [];
      for (const id of ids) {
        const cacheKey = `${type}:${id}`;
        let cachedVal;
        if (localCache.get) {
          cachedVal = localCache.get(cacheKey);
        } else if (localCache instanceof Map) {
          cachedVal = localCache.get(cacheKey);
        }

        if (cachedVal !== undefined) {
          result[id] = cachedVal;
        } else {
          missing.push(id);
        }
      }

      if (missing.length > 0) {
        const fetched = await store.get(type, missing);
        for (const id of missing) {
          if (fetched && fetched[id]) {
            result[id] = fetched[id];
            const cacheKey = `${type}:${id}`;
            if (localCache.set) {
              localCache.set(cacheKey, fetched[id]);
            } else if (localCache instanceof Map) {
              localCache.set(cacheKey, fetched[id]);
            }
          }
        }
      }
      return result;
    },
    set: async (data) => {
      await store.set(data);
      for (const type in data) {
        for (const id in data[type]) {
          const cacheKey = `${type}:${id}`;
          const val = data[type][id];
          if (val !== undefined && val !== null) {
            if (localCache.set) localCache.set(cacheKey, val);
            else if (localCache instanceof Map) localCache.set(cacheKey, val);
          } else {
            if (localCache.del) localCache.del(cacheKey);
            else if (localCache.delete) localCache.delete(cacheKey);
          }
        }
      }
    },
    clear: () => {
      if (localCache.flushAll) localCache.flushAll();
      else if (localCache.clear) localCache.clear();
    }
  };
}

const Browsers = {
  ubuntu: (name) => ['Ubuntu', name || 'Chrome', '20.0.04'],
  macOS: (name) => ['macOS', name || 'Safari', '14.0'],
  baileys: (name) => ['Baileys', name || 'Chrome', '6.0']
};

module.exports = {
  makeWASocket,
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  MockWASocket,
  Browsers
};
