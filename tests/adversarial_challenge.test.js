/**
 * Empirical Adversarial Challenge Test Suite for Milestone 1
 * 
 * Tests:
 * 1. Path Traversal & Malicious SessionId Boundary Rejection (100% rejection)
 * 2. Bounded Message Store Eviction & Memory Boundedness (>2000 messages)
 * 3. Exponential Backoff Calculation & Disconnect Status Code Discrimination
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');

const { SessionManager } = require('../src/session/sessionManager');
const { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('./mocks/mockBaileys');

describe('Adversarial Challenge Test Suite (Milestone 1)', () => {
  let tempBaseDir;
  let manager;

  beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerd-adv-test-'));
    manager = new SessionManager({
      sessionsDir: tempBaseDir,
      baileysFactory: makeWASocket,
      authFactory: useMultiFileAuthState,
      keyStoreFactory: makeCacheableSignalKeyStore
    });
  });

  afterEach(async () => {
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

  describe('1. Path Traversal & Malicious SessionId Boundary Rejection', () => {
    const maliciousInputs = [
      // Direct path traversal attempts
      '../../etc/passwd',
      '..\\..\\windows',
      '..\\..\\..\\..\\..\\..\\windows\\system32\\cmd.exe',
      '../../etc/shadow',
      '....//....//etc/passwd',
      '../victim_session',
      'victim/../../target',
      '/',
      '\\',
      '.',
      '..',
      '/etc/passwd',
      'C:\\Windows\\System32',
      'C:/Windows/System32',
      '\\\\localhost\\c$\\secret',

      // Windows reserved system device names (uppercase)
      'CON', 'PRN', 'AUX', 'NUL',
      'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
      'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',

      // Windows reserved system device names (lowercase and mixed case)
      'con', 'prn', 'aux', 'nul',
      'cOn', 'PrN', 'aUx', 'NuL',
      'com1', 'CoM2', 'lpt1', 'LpT9',

      // Whitespace attacks
      ' ',
      '   ',
      '\t',
      '\n',
      '\r\n',
      ' session_with_lead_space',
      'session_with_trail_space ',
      'session with inner space',
      'session\twith\ttab',

      // Special characters & injection vectors
      'session!name',
      'session@name',
      'session#name',
      'session$name',
      'session%name',
      'session^name',
      'session&name',
      'session*name',
      'session(name)',
      'session+name',
      'session=name',
      'session{name}',
      'session[name]',
      'session;name',
      'session:name',
      'session"name',
      'session\'name',
      'session<name>',
      'session,name',
      'session.name',
      'session?name',
      'session/name',
      'session\\name',
      'session|name',
      'session`name`',
      'session~name',
      'session\0nullbyte',

      // Boundary length violations
      '', // 0 chars
      'a'.repeat(65), // 65 chars (exceeds max 64)
      'a'.repeat(256), // 256 chars
      'a'.repeat(1024), // 1024 chars

      // Non-string types
      null,
      undefined,
      12345,
      true,
      false,
      {},
      [],
      () => {},
      Symbol('sessionId')
    ];

    it('rejects 100% of malicious and boundary inputs in validateSessionId()', () => {
      let rejectedCount = 0;
      for (const input of maliciousInputs) {
        assert.throws(
          () => manager.validateSessionId(input),
          (err) => err instanceof Error,
          `Expected validateSessionId to throw for input: ${String(input)}`
        );
        rejectedCount++;
      }
      assert.strictEqual(rejectedCount, maliciousInputs.length, 'Must reject 100% of malicious inputs');
    });

    it('rejects 100% of malicious and boundary inputs in getSafeSessionDir()', () => {
      for (const input of maliciousInputs) {
        assert.throws(
          () => manager.getSafeSessionDir(input),
          (err) => err instanceof Error,
          `Expected getSafeSessionDir to throw for input: ${String(input)}`
        );
      }
    });

    it('rejects 100% of malicious inputs in createSession() without writing to filesystem', async () => {
      for (const input of maliciousInputs) {
        await assert.rejects(
          async () => await manager.createSession(input),
          (err) => err instanceof Error,
          `Expected createSession to reject input: ${String(input)}`
        );
      }
      // Verify tempBaseDir remains completely empty
      const files = fs.readdirSync(tempBaseDir);
      assert.strictEqual(files.length, 0, 'No malicious directories must be created on disk');
    });

    it('rejects 100% of malicious inputs in startSession()', async () => {
      for (const input of maliciousInputs) {
        await assert.rejects(
          async () => await manager.startSession(input),
          (err) => err instanceof Error,
          `Expected startSession to reject input: ${String(input)}`
        );
      }
    });

    it('returns false or null safely for malicious inputs in query and destroy methods', async () => {
      for (const input of maliciousInputs) {
        assert.strictEqual(manager.hasSession(input), false, `hasSession must return false for: ${String(input)}`);
        assert.strictEqual(manager.getSession(input), null, `getSession must return null for: ${String(input)}`);
        const destroyed = await manager.destroySession(input, true);
        assert.strictEqual(destroyed, false, `destroySession must return false for: ${String(input)}`);
      }
    });

    it('accepts valid session IDs within boundary specifications', () => {
      const validIds = [
        'a', // min length: 1 char
        'z',
        '0',
        '9',
        'valid_session',
        'valid-session-123',
        'USER_BOT_01',
        'Session-Alpha_99',
        'a'.repeat(64) // max length: 64 chars
      ];

      for (const id of validIds) {
        assert.strictEqual(manager.validateSessionId(id), id);
        const resolved = manager.getSafeSessionDir(id);
        assert.strictEqual(resolved, path.resolve(tempBaseDir, id));
      }
    });

    it('guarantees sessionsRoot can never be targeted or deleted via destroySession', async () => {
      // Direct traversal targeting root
      assert.throws(
        () => manager.getSafeSessionDir('.'),
        (err) => err instanceof Error
      );

      // Verify destroySession on any invalid or relative token returns false without deleting root
      const initialRootExists = fs.existsSync(tempBaseDir);
      assert.strictEqual(initialRootExists, true);

      const resultDot = await manager.destroySession('.', true);
      assert.strictEqual(resultDot, false);
      assert.strictEqual(fs.existsSync(tempBaseDir), true, 'sessionsRoot must remain intact');

      const resultEmpty = await manager.destroySession('', true);
      assert.strictEqual(resultEmpty, false);
      assert.strictEqual(fs.existsSync(tempBaseDir), true, 'sessionsRoot must remain intact');
    });
  });

  describe('2. Bounded Message Store Eviction & Memory Boundedness', () => {
    it('strictly bounds message store to <= 2001 entries when pushing > 2000 messages', async () => {
      const sessionId = 'mem_stress_session';
      const session = await manager.createSession(sessionId);
      const sock = await manager.startSession(sessionId);

      // Verify clean initial state
      assert.strictEqual(session.msgStore.size, 0);

      // Push 1,000 incoming messages (each stores key.id and remoteJid:key.id -> 2,000 entries)
      for (let i = 0; i < 1000; i++) {
        sock.simulateIncomingMessage('2349161239200@s.whatsapp.net', `Message payload #${i}`);
      }
      assert.strictEqual(session.msgStore.size, 2000, 'Store should hold exactly 2,000 entries after 1,000 messages');

      // Push message 1,001 (triggers storeSessionMessage eviction threshold: size > 2000 -> evicts 500 oldest keys)
      sock.simulateIncomingMessage('2349161239200@s.whatsapp.net', 'Message payload #1000');
      // When the 1st key was added (2001 entries), 500 were evicted -> 1501 entries. Then 2nd key added -> 1502 entries.
      assert.ok(session.msgStore.size <= 2001, `Store size ${session.msgStore.size} must be <= 2001`);
      assert.strictEqual(session.msgStore.size, 1502, 'Store size should drop to 1502 after 500-key eviction');

      // Now push another 1,500 messages (total 2,501 messages = > 5,000 raw key insertions)
      for (let i = 1001; i <= 2500; i++) {
        sock.simulateIncomingMessage('2349161239200@s.whatsapp.net', `Stress message #${i}`);
        assert.ok(session.msgStore.size <= 2001, `Invariant violation: msgStore size ${session.msgStore.size} exceeded 2001 at message ${i}`);
      }

      // Assert bounded state
      assert.ok(session.msgStore.size <= 2001, 'Store must remain bounded at or below 2001 entries');
      assert.ok(session.msgStore.size >= 1500, 'Store should maintain recent window of at least 1500 entries');
    });

    it('correctly evicts oldest entries and preserves latest entries for getMessage retrieval', async () => {
      const sessionId = 'fifo_eviction_session';
      const session = await manager.createSession(sessionId);
      const sock = await manager.startSession(sessionId);

      // Push message 0 and capture its ID
      const upsertFirst = sock.simulateIncomingMessage('2349161239200@s.whatsapp.net', 'FIRST_CANARY_MESSAGE');
      const firstMsgId = upsertFirst.messages[0].key.id;

      // Verify message 0 is initially present and retrievable
      const initialCached = await sock.getMessage({ id: firstMsgId, remoteJid: '2349161239200@s.whatsapp.net' });
      assert.ok(initialCached, 'First message must be initially retrievable');
      assert.strictEqual(initialCached.conversation, 'FIRST_CANARY_MESSAGE');

      // Now push 2,200 more messages to trigger multiple eviction cycles
      let latestMsgId = null;
      for (let i = 1; i <= 2200; i++) {
        const u = sock.simulateIncomingMessage('2349161239200@s.whatsapp.net', `Eviction train #${i}`);
        latestMsgId = u.messages[0].key.id;
      }

      // Verify message 0 was evicted (oldest)
      const evictedLookup = await sock.getMessage({ id: firstMsgId, remoteJid: '2349161239200@s.whatsapp.net' });
      assert.strictEqual(evictedLookup, undefined, 'Oldest message must be evicted and return undefined');

      // Verify the latest message is retained and retrievable
      const latestLookup = await sock.getMessage({ id: latestMsgId, remoteJid: '2349161239200@s.whatsapp.net' });
      assert.ok(latestLookup, 'Latest message must still be in cache');
      assert.strictEqual(latestLookup.conversation, 'Eviction train #2200');
    });

    it('bounds botSentMessageIds and processedMsgIds tracking sets under high message volume', async () => {
      const sessionId = 'tracking_sets_bound';
      const session = await manager.createSession(sessionId);
      const sock = await manager.startSession(sessionId);

      // Simulate 3,500 incoming messages (processedMsgIds threshold is > 3000 -> evicts 500)
      for (let i = 0; i < 3500; i++) {
        sock.simulateIncomingMessage('2349161239200@s.whatsapp.net', `Processed check #${i}`);
      }
      assert.ok(session.processedMsgIds.size <= 3001, `processedMsgIds size ${session.processedMsgIds.size} must be <= 3001`);

      // Send 2,500 bot messages (botSentMessageIds threshold is > 2000 -> evicts 500)
      for (let i = 0; i < 2500; i++) {
        await sock.sendMessage('2349161239200@s.whatsapp.net', { text: `Bot reply #${i}` });
      }
      assert.ok(session.botSentMessageIds.size <= 2001, `botSentMessageIds size ${session.botSentMessageIds.size} must be <= 2001`);
    });

    it('reclaims all memory structures and flushes caches upon destroySession()', async () => {
      const sessionId = 'teardown_mem_reclaim';
      const session = await manager.createSession(sessionId);
      const sock = await manager.startSession(sessionId);

      // Populate store and caches
      for (let i = 0; i < 500; i++) {
        sock.simulateIncomingMessage('2349161239200@s.whatsapp.net', `Teardown message #${i}`);
      }
      await sock.sendMessage('2349161239200@s.whatsapp.net', { text: 'Bot canary' });

      assert.ok(session.msgStore.size > 0);
      assert.ok(session.processedMsgIds.size > 0);
      assert.ok(session.botSentMessageIds.size > 0);

      // Destroy session
      const destroyed = await manager.destroySession(sessionId, true);
      assert.strictEqual(destroyed, true);

      // Verify all session data structures are wiped
      assert.strictEqual(session.msgStore.size, 0, 'msgStore must be cleared');
      assert.strictEqual(session.processedMsgIds.size, 0, 'processedMsgIds must be cleared');
      assert.strictEqual(session.botSentMessageIds.size, 0, 'botSentMessageIds must be cleared');
      assert.strictEqual(session.status, 'destroyed');
      assert.strictEqual(session.sock, null);
      assert.strictEqual(manager.sessions.has(sessionId), false);
    });
  });

  describe('3. Exponential Backoff Calculation & Disconnect Handling', () => {
    it('verifies exact mathematical values for exponential backoff schedule', () => {
      // Expected formula: delay = Math.min(Math.round(2500 * Math.pow(1.5, n)), 30000)
      const expectedSchedule = [
        { attempt: 0, expected: 2500 },
        { attempt: 1, expected: 3750 },
        { attempt: 2, expected: 5625 },
        { attempt: 3, expected: 8438 },
        { attempt: 4, expected: 12656 },
        { attempt: 5, expected: 18984 },
        { attempt: 6, expected: 28477 },
        { attempt: 7, expected: 30000 }, // 42715 capped to 30000
        { attempt: 8, expected: 30000 },
        { attempt: 15, expected: 30000 },
        { attempt: 100, expected: 30000 }
      ];

      for (const { attempt, expected } of expectedSchedule) {
        const calculated = manager.calculateBackoffDelay(attempt);
        assert.strictEqual(
          calculated,
          expected,
          `Backoff calculation mismatch at attempt #${attempt}: got ${calculated}, expected ${expected}`
        );
      }
    });

    it('handles negative, zero, null, and undefined attempts safely', () => {
      assert.strictEqual(manager.calculateBackoffDelay(0), 2500);
      assert.strictEqual(manager.calculateBackoffDelay(-1), 2500);
      assert.strictEqual(manager.calculateBackoffDelay(-99), 2500);
      assert.strictEqual(manager.calculateBackoffDelay(null), 2500);
      assert.strictEqual(manager.calculateBackoffDelay(undefined), 2500);
    });

    it('purges credentials and halts auto-reconnect on 401 loggedOut', async () => {
      const sessionId = 'disconnect_401_test';
      const session = await manager.createSession(sessionId);
      const sock = await manager.startSession(sessionId);

      // Write a dummy creds.json file
      const credsFile = path.join(session.dir, 'creds.json');
      fs.writeFileSync(credsFile, JSON.stringify({ me: { id: '123' }, registered: true }), 'utf8');
      assert.strictEqual(fs.existsSync(credsFile), true);

      let loggedOutEmitted = false;
      manager.on('session.loggedOut', (e) => {
        if (e.sessionId === sessionId) loggedOutEmitted = true;
      });

      // Simulate 401 error
      manager.handleConnectionClose(sessionId, {
        error: { output: { statusCode: 401 }, message: 'Connection failure: 401' }
      });

      assert.strictEqual(session.status, 'loggedOut');
      assert.strictEqual(session.sock, null);
      assert.strictEqual(session.reconnectTimer, null, 'Must NOT schedule reconnect on 401');
      assert.strictEqual(loggedOutEmitted, true, 'session.loggedOut event must be emitted');

      // Wait a tick for async rmSync retry loop
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(fs.existsSync(session.dir), false, 'Session credentials folder must be purged on 401');
    });

    it('preserves credentials and schedules fast 1000ms reconnect on 515 restartRequired', async () => {
      const sessionId = 'disconnect_515_test';
      const session = await manager.createSession(sessionId);
      await manager.startSession(sessionId);

      // Write canary in session dir
      const canaryPath = path.join(session.dir, 'canary.txt');
      fs.writeFileSync(canaryPath, 'credentials_intact', 'utf8');

      session.reconnectAttempts = 3;

      // Simulate 515 error
      manager.handleConnectionClose(sessionId, {
        error: { output: { statusCode: 515 }, message: 'Stream restart required' }
      });

      assert.strictEqual(session.status, 'reconnecting');
      assert.ok(session.reconnectTimer !== null, 'Must schedule reconnect timer on 515');
      // reconnectAttempts decremented by 1 before scheduleReconnect, then incremented by scheduleReconnect -> remains 3
      assert.strictEqual(session.reconnectAttempts, 3, 'reconnectAttempts must not be penalized on 515');
      assert.strictEqual(fs.existsSync(canaryPath), true, 'Credentials must be strictly preserved on 515');
      assert.strictEqual(fs.readFileSync(canaryPath, 'utf8'), 'credentials_intact');

      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    });

    it('preserves credentials and halts auto-reconnect on 440 connectionReplaced', async () => {
      const sessionId = 'disconnect_440_test';
      const session = await manager.createSession(sessionId);
      await manager.startSession(sessionId);

      const canaryPath = path.join(session.dir, 'canary.txt');
      fs.writeFileSync(canaryPath, 'credentials_intact', 'utf8');

      let replacedEmitted = false;
      manager.on('session.replaced', (e) => {
        if (e.sessionId === sessionId) replacedEmitted = true;
      });

      // Simulate 440 error
      manager.handleConnectionClose(sessionId, {
        error: { output: { statusCode: 440 }, message: 'Connection replaced by secondary instance' }
      });

      assert.strictEqual(session.status, 'replaced');
      assert.strictEqual(session.sock, null);
      assert.strictEqual(session.reconnectTimer, null, 'Must NOT schedule reconnect on 440');
      assert.strictEqual(replacedEmitted, true, 'session.replaced event must be emitted');
      assert.strictEqual(fs.existsSync(canaryPath), true, 'Credentials must be preserved on 440');
    });

    it('preserves credentials and schedules exponential backoff on transient network drop', async () => {
      const sessionId = 'disconnect_network_drop';
      const session = await manager.createSession(sessionId);
      await manager.startSession(sessionId);

      assert.strictEqual(session.reconnectAttempts, 0);

      // Simulate 408 timed out drop
      manager.handleConnectionClose(sessionId, {
        error: { output: { statusCode: 408 }, message: 'Connection lost' }
      });

      assert.strictEqual(session.status, 'reconnecting');
      assert.strictEqual(session.reconnectAttempts, 1, 'reconnectAttempts incremented to 1');
      assert.ok(session.reconnectTimer !== null, 'reconnectTimer scheduled');

      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    });
  });
});
