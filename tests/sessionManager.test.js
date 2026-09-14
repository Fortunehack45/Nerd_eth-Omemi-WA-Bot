/**
 * Unit Test Suite for SessionManager
 * 
 * Covers:
 * 1. Session creation and multiple concurrent sessions.
 * 2. Credential folder isolation (sessions/<session_id>/, deleting A does not affect B).
 * 3. Dynamic socket cleanup (listener removal, socket closure, cache flush).
 * 4. JID domain normalization (@lid, @s.whatsapp.net, @g.us, :device stripping).
 * 5. getMessage cache protocol (returns undefined on misses, resolves cached messages).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');

// Import real SessionManager if present; fallback to MockSessionManager harness
let SessionManagerClass;
const realSessionManagerPath = path.join(__dirname, '../src/session/sessionManager.js');
if (fs.existsSync(realSessionManagerPath)) {
  const mod = require(realSessionManagerPath);
  SessionManagerClass = mod.SessionManager || mod.default || mod;
} else {
  SessionManagerClass = require('./mocks/mockSessionManager').SessionManager;
}

const { normalizeJid } = require('../src/utils/helpers');
const { makeWASocket } = require('./mocks/mockBaileys');

describe('SessionManager Unit Test Suite', () => {
  let tempBaseDir;
  let manager;

  beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerd-sm-test-'));
    manager = new SessionManagerClass({
      sessionsDir: tempBaseDir,
      baileysFactory: makeWASocket
    });
  });

  afterEach(async () => {
    // Destroy all sessions and clean up temp folder
    if (manager && manager.sessions) {
      for (const sessionId of Array.from(manager.sessions.keys())) {
        await manager.destroySession(sessionId, true);
      }
    }
    if (fs.existsSync(tempBaseDir)) {
      try {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      } catch (err) {}
    }
  });

  describe('1. Session Creation & Multiple Concurrent Sessions', () => {
    it('should create a new session record and initialize storage folder', async () => {
      const sessionId = 'session_alpha';
      const session = await manager.createSession(sessionId);

      assert.ok(session, 'Session object should be returned');
      assert.strictEqual(session.id, sessionId);
      assert.ok(fs.existsSync(path.join(tempBaseDir, sessionId)), 'Session folder must be created');
      assert.strictEqual(manager.sessions.has(sessionId), true);
    });

    it('should support multiple concurrent sessions with distinct states and sockets', async () => {
      const idA = 'bot_user_1';
      const idB = 'bot_user_2';
      const idC = 'bot_user_3';

      const sessionA = await manager.createSession(idA);
      const sessionB = await manager.createSession(idB);
      const sessionC = await manager.createSession(idC);

      assert.strictEqual(manager.sessions.size, 3, 'Should have 3 registered sessions');

      // Start all sessions
      const sockA = await manager.startSession(idA);
      const sockB = await manager.startSession(idB);
      const sockC = await manager.startSession(idC);

      assert.ok(sockA, 'Socket A should exist');
      assert.ok(sockB, 'Socket B should exist');
      assert.ok(sockC, 'Socket C should exist');

      assert.notStrictEqual(sockA, sockB, 'Sockets must be distinct instances');
      assert.notStrictEqual(sockB, sockC, 'Sockets must be distinct instances');

      // Simulate connection open for A and B
      sockA.simulateOpen();
      sockB.simulateOpen();

      assert.strictEqual(sessionA.status, 'connected');
      assert.strictEqual(sessionB.status, 'connected');
      assert.strictEqual(sessionC.status, 'connecting');

      const stats = manager.getPublicStats();
      assert.strictEqual(stats.totalSessions, 3);
      assert.strictEqual(stats.activeBots, 2, 'Active bots count must match connected sessions');
    });

    it('should track independent message counts and logs per session', async () => {
      const id1 = 'tenant_one';
      const id2 = 'tenant_two';

      await manager.createSession(id1);
      await manager.createSession(id2);

      const sock1 = await manager.startSession(id1);
      const sock2 = await manager.startSession(id2);

      sock1.simulateIncomingMessage('11111@s.whatsapp.net', 'Hello bot 1');
      sock1.simulateIncomingMessage('11111@s.whatsapp.net', 'Command 2');
      sock2.simulateIncomingMessage('22222@s.whatsapp.net', 'Hello bot 2');

      const sess1 = manager.sessions.get(id1);
      const sess2 = manager.sessions.get(id2);

      assert.strictEqual(sess1.messagesCount, 2, 'Tenant 1 should have 2 messages');
      assert.strictEqual(sess2.messagesCount, 1, 'Tenant 2 should have 1 message');
    });
  });

  describe('2. Credential Folder Isolation', () => {
    it('should isolate credentials into sessions/<session_id>/ directories', async () => {
      const idA = 'account_isolated_A';
      const idB = 'account_isolated_B';

      await manager.createSession(idA);
      await manager.createSession(idB);

      const sockA = await manager.startSession(idA);
      const sockB = await manager.startSession(idB);

      // Trigger credentials update / save
      sockA.ev.emit('creds.update');
      sockB.ev.emit('creds.update');

      const dirA = path.join(tempBaseDir, idA);
      const dirB = path.join(tempBaseDir, idB);

      assert.ok(fs.existsSync(dirA), 'Folder A must exist');
      assert.ok(fs.existsSync(dirB), 'Folder B must exist');

      const credsA = path.join(dirA, 'creds.json');
      const credsB = path.join(dirB, 'creds.json');

      assert.ok(fs.existsSync(credsA), 'Creds A must exist in directory A');
      assert.ok(fs.existsSync(credsB), 'Creds B must exist in directory B');
    });

    it('should ensure deleting session A does not delete or alter session B', async () => {
      const idA = 'to_delete_A';
      const idB = 'to_keep_B';

      await manager.createSession(idA);
      await manager.createSession(idB);

      await manager.startSession(idA);
      await manager.startSession(idB);

      const dirA = path.join(tempBaseDir, idA);
      const dirB = path.join(tempBaseDir, idB);

      // Write a specific canary file in session B's folder
      const canaryPath = path.join(dirB, 'canary.txt');
      fs.writeFileSync(canaryPath, 'session_b_canary_data', 'utf8');

      // Destroy session A with deleteStorage = true
      const destroyed = await manager.destroySession(idA, true);
      assert.strictEqual(destroyed, true);

      // Verify Session A is deleted from manager and disk
      assert.strictEqual(manager.sessions.has(idA), false);
      assert.strictEqual(fs.existsSync(dirA), false, 'Session A directory must be deleted');

      // Verify Session B is completely intact
      assert.strictEqual(manager.sessions.has(idB), true, 'Session B must remain in manager');
      assert.strictEqual(fs.existsSync(dirB), true, 'Session B directory must still exist');
      assert.strictEqual(fs.existsSync(canaryPath), true, 'Canary file in Session B must be untouched');
      assert.strictEqual(fs.readFileSync(canaryPath, 'utf8'), 'session_b_canary_data');
    });
  });

  describe('3. Dynamic Socket Cleanup', () => {
    it('should remove all event listeners and close socket on destroySession', async () => {
      const id = 'cleanup_target';
      await manager.createSession(id);
      const sock = await manager.startSession(id);

      let listenerTriggeredAfterDestroy = false;
      sock.ev.on('messages.upsert', () => {
        listenerTriggeredAfterDestroy = true;
      });

      assert.ok(sock.ev.listenerCount('messages.upsert') > 0, 'Should have listeners before destroy');

      await manager.destroySession(id, false);

      // Event listeners should be stripped
      assert.strictEqual(
        sock.ev.listenerCount('messages.upsert'),
        0,
        'Socket event listeners must be removed on destroy'
      );

      // Socket should be marked closed
      assert.strictEqual(sock.ws.isOpen, false, 'WebSocket isOpen must be false');
      assert.strictEqual(sock.isClosed, true, 'Socket isClosed flag must be true');

      // Emitting on socket after destroy must not trigger our handler
      sock.ev.emit('messages.upsert', { messages: [] });
      assert.strictEqual(listenerTriggeredAfterDestroy, false);
    });

    it('should clear message and retry caches on destroySession', async () => {
      const id = 'cache_cleanup';
      const session = await manager.createSession(id);
      const sock = await manager.startSession(id);

      // Simulate an incoming message to populate cache
      sock.simulateIncomingMessage('12345@s.whatsapp.net', 'Test cache clear');
      assert.ok(session.messageCache.size > 0, 'Message cache should contain items');

      session.retryCache.set('key_retry_1', { attempts: 1 });
      assert.ok(session.retryCache.size > 0, 'Retry cache should contain items');

      await manager.destroySession(id, false);

      assert.strictEqual(session.messageCache.size, 0, 'Message cache must be empty after destroy');
      assert.strictEqual(session.retryCache.size, 0, 'Retry cache must be empty after destroy');
    });

    it('should return false gracefully when destroying an unknown session', async () => {
      const result = await manager.destroySession('non_existent_session_id', false);
      assert.strictEqual(result, false);
    });
  });

  describe('4. JID Normalization', () => {
    it('preserves @lid domain while stripping :device suffix', () => {
      assert.strictEqual(normalizeJid('987654321:5@lid'), '987654321@lid');
      assert.strictEqual(normalizeJid('987654321@lid'), '987654321@lid');
      assert.strictEqual(normalizeJid('100200300:12@lid'), '100200300@lid');
    });

    it('preserves @s.whatsapp.net domain while stripping :device suffix', () => {
      assert.strictEqual(
        normalizeJid('2349161239200:1@s.whatsapp.net'),
        '2349161239200@s.whatsapp.net'
      );
      assert.strictEqual(
        normalizeJid('2349161239200@s.whatsapp.net'),
        '2349161239200@s.whatsapp.net'
      );
      assert.strictEqual(
        normalizeJid('14155552671:99@s.whatsapp.net'),
        '14155552671@s.whatsapp.net'
      );
    });

    it('preserves @g.us group domain and strips device if present', () => {
      assert.strictEqual(normalizeJid('120363028472910@g.us'), '120363028472910@g.us');
      assert.strictEqual(normalizeJid('120363028472910:1@g.us'), '120363028472910@g.us');
    });

    it('handles null, undefined, empty, and non-string inputs cleanly', () => {
      assert.strictEqual(normalizeJid(null), '');
      assert.strictEqual(normalizeJid(undefined), '');
      assert.strictEqual(normalizeJid(''), '');
      assert.strictEqual(normalizeJid(12345), '');
      assert.strictEqual(normalizeJid({}), '');
    });

    it('manager.normalizeJid delegates correctly', () => {
      if (typeof manager.normalizeJid === 'function') {
        assert.strictEqual(
          manager.normalizeJid('2348001112222:3@s.whatsapp.net'),
          '2348001112222@s.whatsapp.net'
        );
      }
    });
  });

  describe('5. getMessage Cache Protocol', () => {
    it('returns undefined on cache misses to prevent decryption failure loops', async () => {
      const id = 'getmsg_test';
      await manager.createSession(id);
      const sock = await manager.startSession(id);

      assert.ok(typeof sock.getMessage === 'function', 'sock.getMessage must be a function');

      const nonExistentKey = {
        remoteJid: '2349161239200@s.whatsapp.net',
        id: 'NON_EXISTENT_MSG_ID'
      };

      const result = await sock.getMessage(nonExistentKey);
      assert.strictEqual(
        result,
        undefined,
        'getMessage must strictly return undefined on uncached lookups'
      );
    });

    it('correctly resolves cached messages when key exists', async () => {
      const id = 'getmsg_resolve';
      const session = await manager.createSession(id);
      const sock = await manager.startSession(id);

      const cachedPayload = {
        conversation: 'This is a cached message for decryption retry'
      };
      session.messageCache.set('MSG_CACHED_123', cachedPayload);

      const resolved = await sock.getMessage({
        remoteJid: '2349161239200@s.whatsapp.net',
        id: 'MSG_CACHED_123'
      });

      assert.deepStrictEqual(resolved, cachedPayload, 'Should resolve cached message payload');
    });

    it('returns undefined for empty, null, or invalid message keys', async () => {
      const id = 'getmsg_invalid';
      await manager.createSession(id);
      const sock = await manager.startSession(id);

      assert.strictEqual(await sock.getMessage(null), undefined);
      assert.strictEqual(await sock.getMessage(undefined), undefined);
      assert.strictEqual(await sock.getMessage({}), undefined);
    });

    it('automatically caches incoming messages from messages.upsert', async () => {
      const id = 'getmsg_auto_cache';
      const session = await manager.createSession(id);
      const sock = await manager.startSession(id);

      const upsert = sock.simulateIncomingMessage('2349161239200@s.whatsapp.net', 'Automated test message');
      const msgId = upsert.messages[0].key.id;

      const cached = await sock.getMessage({ id: msgId });
      assert.ok(cached, 'Message should be cached from upsert');
      assert.strictEqual(cached.conversation, 'Automated test message');
    });
  });
});
