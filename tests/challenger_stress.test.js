/**
 * Empirical Adversarial Stress Test Suite for SessionManager
 * 
 * Conducted by Challenger M1-1 to stress-test:
 * 1. Concurrent session creation and destruction under load (50+ sessions, race conditions).
 * 2. Session isolation on deletion (Deleting session A does not delete session B or sibling prefixes).
 * 3. getMessage returns undefined on cache misses and never throws (hostile inputs, bounded eviction).
 * 4. JID normalization against tricky edge cases (companion device suffixes, privacy LIDs, groups, newsletters, case insensitivity, malformed inputs).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');

const { SessionManager } = require('../src/session/sessionManager');
const { normalizeJid, areJidsSame, sanitizePairingNumber } = require('../src/utils/helpers');
const { makeWASocket } = require('./mocks/mockBaileys');

describe('Challenger M1-1 Empirical Stress Test Suite', () => {
  let tempBaseDir;
  let manager;

  beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenger-sm-stress-'));
    manager = new SessionManager({
      sessionsDir: tempBaseDir,
      baileysFactory: makeWASocket
    });
  });

  afterEach(async () => {
    if (manager && manager.sessions) {
      for (const sessionId of Array.from(manager.sessions.keys())) {
        try {
          await manager.destroySession(sessionId, true);
        } catch (e) {}
      }
    }
    if (fs.existsSync(tempBaseDir)) {
      try {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      } catch (err) {}
    }
  });

  // =========================================================================
  // Challenge 1: Concurrent Session Creation & Destruction Under Load
  // =========================================================================
  describe('Challenge 1: Concurrency & High Load Stress Testing', () => {
    it('handles concurrent provisioning of 50 sessions without race conditions or data loss', async () => {
      const sessionCount = 50;
      const sessionIds = Array.from({ length: sessionCount }, (_, i) => `load_sess_${String(i).padStart(3, '0')}`);

      const start = Date.now();
      // Concurrent creation
      const createdSessions = await Promise.all(sessionIds.map(id => manager.createSession(id)));
      assert.strictEqual(createdSessions.length, sessionCount);
      assert.strictEqual(manager.sessions.size, sessionCount);

      // Verify each folder exists on disk
      for (const id of sessionIds) {
        assert.ok(fs.existsSync(path.join(tempBaseDir, id)), `Session folder for ${id} must exist`);
      }

      // Concurrent socket initialization
      const sockets = await Promise.all(sessionIds.map(id => manager.startSession(id)));
      assert.strictEqual(sockets.length, sessionCount);

      // Concurrently simulate open connection
      for (const sock of sockets) {
        sock.simulateOpen();
      }

      // Verify aggregate stats under load
      const stats = manager.getPublicStats();
      assert.strictEqual(stats.totalSessions, sessionCount);
      assert.strictEqual(stats.activeBots, sessionCount);

      const elapsed = Date.now() - start;
      assert.ok(elapsed < 15000, `50 concurrent sessions should provision in < 15s (actual: ${elapsed}ms)`);
    });

    it('concurrently destroys half the sessions while the other half process messages under load', async () => {
      const sessionCount = 30;
      const sessionIds = Array.from({ length: sessionCount }, (_, i) => `mixed_sess_${i}`);

      await Promise.all(sessionIds.map(id => manager.createSession(id)));
      const sockets = await Promise.all(sessionIds.map(id => manager.startSession(id)));
      sockets.forEach(s => s.simulateOpen());

      // Split into sessions to keep (even) and sessions to destroy (odd)
      const toKeep = sessionIds.filter((_, i) => i % 2 === 0);
      const toDestroy = sessionIds.filter((_, i) => i % 2 !== 0);

      // Concurrently destroy odd sessions while sending messages to even sessions
      const destroyPromises = toDestroy.map(id => manager.destroySession(id, true));
      const messagePromises = toKeep.map(id => {
        const sess = manager.sessions.get(id);
        sess.sock.simulateIncomingMessage('2348000000000@s.whatsapp.net', `Message for ${id}`);
        return Promise.resolve();
      });

      const [destroyResults] = await Promise.all([
        Promise.all(destroyPromises),
        Promise.all(messagePromises)
      ]);

      // Verify all destroyed sessions returned true
      destroyResults.forEach(res => assert.strictEqual(res, true));

      // Verify destroyed sessions are gone from memory and disk
      for (const id of toDestroy) {
        assert.strictEqual(manager.sessions.has(id), false, `Destroyed session ${id} must not be in manager`);
        assert.strictEqual(fs.existsSync(path.join(tempBaseDir, id)), false, `Destroyed folder ${id} must be deleted`);
      }

      // Verify kept sessions are completely intact and received messages
      for (const id of toKeep) {
        assert.strictEqual(manager.sessions.has(id), true, `Kept session ${id} must still be in manager`);
        assert.strictEqual(fs.existsSync(path.join(tempBaseDir, id)), true, `Kept folder ${id} must still exist`);
        const sess = manager.sessions.get(id);
        assert.strictEqual(sess.status, 'connected');
        assert.strictEqual(sess.messagesCount, 1, `Session ${id} should have processed 1 message`);
      }

      const stats = manager.getPublicStats();
      assert.strictEqual(stats.totalSessions, toKeep.length);
      assert.strictEqual(stats.activeBots, toKeep.length);
    });

    it('guarantees idempotency when createSession is called simultaneously with the same ID', async () => {
      const targetId = 'race_condition_create';
      const results = await Promise.all(
        Array.from({ length: 10 }, () => manager.createSession(targetId))
      );

      // All 10 parallel calls must resolve to the identical session object reference
      const first = results[0];
      for (const res of results) {
        assert.strictEqual(res, first, 'All concurrent createSession calls must return the same instance');
      }
      assert.strictEqual(manager.sessions.size, 1);
    });

    it('guarantees stability under rapid create-start-destroy churn cycles', async () => {
      const churnCycles = 20;
      for (let i = 0; i < churnCycles; i++) {
        const id = `churn_${i}`;
        const sess = await manager.createSession(id);
        const sock = await manager.startSession(id);
        sock.simulateOpen();
        sock.simulateIncomingMessage('12345@s.whatsapp.net', `Churn msg ${i}`);
        assert.strictEqual(sess.status, 'connected');
        const destroyed = await manager.destroySession(id, true);
        assert.strictEqual(destroyed, true);
        assert.strictEqual(manager.sessions.has(id), false);
        assert.strictEqual(fs.existsSync(path.join(tempBaseDir, id)), false);
      }
      assert.strictEqual(manager.sessions.size, 0);
    });
  });

  // =========================================================================
  // Challenge 2: Deleting Session A Does NOT Delete Session B (Isolation)
  // =========================================================================
  describe('Challenge 2: Session Isolation on Deletion', () => {
    it('strictly preserves sibling session folders, including similar prefix names', async () => {
      const ids = [
        'tenant_account',
        'tenant_account_2',
        'tenant_account_backup',
        'tenant_acc',
        'other_tenant'
      ];

      // Provision all and seed with unique files
      for (const id of ids) {
        await manager.createSession(id);
        await manager.startSession(id);
        const dir = path.join(tempBaseDir, id);
        fs.writeFileSync(path.join(dir, 'secret_token.txt'), `token_for_${id}`, 'utf8');
        fs.mkdirSync(path.join(dir, 'keys'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'keys', 'key-1.json'), JSON.stringify({ keyId: id }), 'utf8');
      }

      assert.strictEqual(manager.sessions.size, ids.length);

      // Destroy only 'tenant_account' with deleteStorage = true
      const target = 'tenant_account';
      const destroyed = await manager.destroySession(target, true);
      assert.strictEqual(destroyed, true);

      // Verify target is completely gone
      assert.strictEqual(manager.sessions.has(target), false);
      assert.strictEqual(fs.existsSync(path.join(tempBaseDir, target)), false);

      // Verify every single sibling is 100% intact with uncorrupted contents
      const remainingIds = ids.filter(id => id !== target);
      for (const id of remainingIds) {
        assert.strictEqual(manager.sessions.has(id), true, `Sibling ${id} must remain in manager`);
        const dir = path.join(tempBaseDir, id);
        assert.ok(fs.existsSync(dir), `Directory for sibling ${id} must exist`);
        
        const tokenFile = path.join(dir, 'secret_token.txt');
        assert.ok(fs.existsSync(tokenFile), `Token file in ${id} must exist`);
        assert.strictEqual(fs.readFileSync(tokenFile, 'utf8'), `token_for_${id}`);

        const keyFile = path.join(dir, 'keys', 'key-1.json');
        assert.ok(fs.existsSync(keyFile), `Key file in ${id} must exist`);
        const parsedKey = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
        assert.strictEqual(parsedKey.keyId, id);
      }
    });

    it('refuses to delete sessionsRoot and guards against path traversal deletion attacks', async () => {
      // Malicious or accidental attempts to delete root
      const maliciousIds = [
        '..',
        '../..',
        '../../sessions',
        './',
        '',
        '   ',
        'CON',
        'PRN',
        'NUL',
        'AUX',
        'COM1',
        'LPT1'
      ];

      for (const badId of maliciousIds) {
        const result = await manager.destroySession(badId, true);
        assert.strictEqual(result, false, `destroySession should return false for invalid ID "${badId}"`);
        // Crucially, sessionsRoot must still exist!
        assert.ok(fs.existsSync(tempBaseDir), `Root directory must never be deleted by bad ID: ${badId}`);
      }
    });

    it('active socket in session B continues communicating while session A is destroyed', async () => {
      const idA = 'session_dying';
      const idB = 'session_surviving';

      await manager.createSession(idA);
      await manager.createSession(idB);

      const sockA = await manager.startSession(idA);
      const sockB = await manager.startSession(idB);

      sockA.simulateOpen();
      sockB.simulateOpen();

      // Destroy session A
      const destroyed = await manager.destroySession(idA, true);
      assert.strictEqual(destroyed, true);

      // Session B should send and receive messages without error
      const sentMsg = await sockB.sendMessage('2349161239200@s.whatsapp.net', { text: 'Bot B alive' });
      assert.ok(sentMsg);
      assert.strictEqual(sentMsg.message.text.replace(/[\u200B\u200C]/g, ''), 'Bot B alive');

      sockB.simulateIncomingMessage('2349161239200@s.whatsapp.net', 'Reply to Bot B');
      const sessB = manager.sessions.get(idB);
      assert.strictEqual(sessB.messagesCount, 1);
      assert.strictEqual(sessB.status, 'connected');
    });
  });

  // =========================================================================
  // Challenge 3: getMessage Safe Cache Misses & Decryption Protection
  // =========================================================================
  describe('Challenge 3: getMessage Safe Cache Miss & Decryption Protocol', () => {
    it('strictly returns undefined on cache misses and never throws on hostile / invalid inputs', async () => {
      const id = 'getmsg_hostile';
      await manager.createSession(id);
      const sock = await manager.startSession(id);

      assert.ok(typeof sock.getMessage === 'function');

      const hostileInputs = [
        null,
        undefined,
        '',
        12345,
        true,
        false,
        [],
        {},
        { remoteJid: '2349161239200@s.whatsapp.net' }, // missing id
        { id: null },
        { id: undefined },
        { id: '' },
        { id: 12345 },
        { id: {} },
        { id: 'NON_EXISTENT_ID' },
        { id: 'NON_EXISTENT_ID', remoteJid: '2349161239200@s.whatsapp.net' },
        { id: '__proto__' },
        { id: 'constructor' },
        { id: 'toString' },
        { id: 'valueOf' },
        {
          get id() {
            throw new Error('Exploding getter bomb');
          }
        },
        {
          get remoteJid() {
            throw new Error('Exploding remoteJid bomb');
          },
          id: 'test_id'
        }
      ];

      for (const input of hostileInputs) {
        let result;
        let threw = false;
        try {
          result = await sock.getMessage(input);
        } catch (err) {
          threw = true;
        }

        assert.strictEqual(threw, false, `getMessage must never throw, but threw for input: ${typeof input}`);
        assert.strictEqual(
          result,
          undefined,
          `getMessage must return undefined, but returned ${JSON.stringify(result)} for input`
        );
      }
    });

    it('enforces memory bounds (caps at 2000) and evicts oldest 500 without breaking newer lookups', async () => {
      const id = 'bounded_cache_test';
      const session = await manager.createSession(id);
      const sock = await manager.startSession(id);

      // Insert 2500 messages through storeSessionMessage
      for (let i = 1; i <= 2500; i++) {
        manager.storeSessionMessage(session, `MSG_${i}`, { conversation: `Content ${i}` });
      }

      // Memory bound check: size should not exceed 2000
      assert.ok(session.msgStore.size <= 2000, `msgStore size (${session.msgStore.size}) should be <= 2000`);

      // First 500 messages (1 to 500) should have been evicted and return undefined
      for (let i = 1; i <= 500; i++) {
        const res = await sock.getMessage({ id: `MSG_${i}` });
        assert.strictEqual(res, undefined, `Evicted message MSG_${i} must return undefined`);
      }

      // Newer messages (e.g. 2000 to 2500) must resolve cleanly
      for (let i = 2400; i <= 2500; i++) {
        const res = await sock.getMessage({ id: `MSG_${i}` });
        assert.ok(res, `New message MSG_${i} must be resolved`);
        assert.strictEqual(res.conversation, `Content ${i}`);
      }
    });

    it('caches bot-sent messages and enables decryption retry lookups by both id and remoteJid:id', async () => {
      const id = 'sent_msg_cache';
      const session = await manager.createSession(id);
      const sock = await manager.startSession(id);
      sock.simulateOpen();

      const recipient = '2349161239200@s.whatsapp.net';
      const payload = { text: 'Bot outgoing reply' };

      const sent = await sock.sendMessage(recipient, payload);
      assert.ok(sent?.key?.id);

      // Lookup by ID only
      const byId = await sock.getMessage({ id: sent.key.id });
      assert.deepStrictEqual(byId, payload, 'Should resolve by id');

      // Lookup by remoteJid + ID
      const byBoth = await sock.getMessage({ remoteJid: recipient, id: sent.key.id });
      assert.deepStrictEqual(byBoth, payload, 'Should resolve by remoteJid:id');
    });

    it('handles getMessage calls safely after session has been destroyed', async () => {
      const id = 'post_destroy_getmsg';
      await manager.createSession(id);
      const sock = await manager.startSession(id);

      // Pre-populate a message
      sock.simulateIncomingMessage('2348000000000@s.whatsapp.net', 'Test msg');

      // Destroy session
      await manager.destroySession(id, false);

      // Calling getMessage on destroyed socket should not crash and return undefined
      const result = await sock.getMessage({ id: 'IN_12345' });
      assert.strictEqual(result, undefined);
    });
  });

  // =========================================================================
  // Challenge 4: JID Normalization Edge Cases
  // =========================================================================
  describe('Challenge 4: JID Normalization Adversarial Edge Cases', () => {
    it('normalizes companion device suffixes for phone users (@s.whatsapp.net)', () => {
      const cases = [
        ['2349161239200:0@s.whatsapp.net', '2349161239200@s.whatsapp.net'],
        ['2349161239200:1@s.whatsapp.net', '2349161239200@s.whatsapp.net'],
        ['2349161239200:15@s.whatsapp.net', '2349161239200@s.whatsapp.net'],
        ['2349161239200:99@s.whatsapp.net', '2349161239200@s.whatsapp.net'],
        ['2349161239200_1:2@s.whatsapp.net', '2349161239200@s.whatsapp.net'],
        ['2349161239200@s.whatsapp.net', '2349161239200@s.whatsapp.net'],
        ['14155552671:2@s.whatsapp.net', '14155552671@s.whatsapp.net']
      ];

      for (const [input, expected] of cases) {
        assert.strictEqual(normalizeJid(input), expected, `Failed for ${input}`);
      }
    });

    it('preserves privacy LID domain while stripping companion device suffixes', () => {
      const cases = [
        ['1234567890123456:0@lid', '1234567890123456@lid'],
        ['1234567890123456:1@lid', '1234567890123456@lid'],
        ['1234567890123456:42@lid', '1234567890123456@lid'],
        ['1234567890123456@lid', '1234567890123456@lid'],
        ['9988776655443322_1:3@lid', '9988776655443322@lid']
      ];

      for (const [input, expected] of cases) {
        assert.strictEqual(normalizeJid(input), expected, `Failed for ${input}`);
      }
    });

    it('preserves group JID domain (@g.us) and strips device suffix if present', () => {
      const cases = [
        ['120363028472910@g.us', '120363028472910@g.us'],
        ['120363028472910:1@g.us', '120363028472910@g.us'],
        ['120363028472910:99@g.us', '120363028472910@g.us']
      ];

      for (const [input, expected] of cases) {
        assert.strictEqual(normalizeJid(input), expected, `Failed for ${input}`);
      }
    });

    it('preserves newsletter JID domain (@newsletter)', () => {
      const cases = [
        ['120363143527290123@newsletter', '120363143527290123@newsletter'],
        ['120363143527290123:1@newsletter', '120363143527290123@newsletter'],
        ['120363143527290123:5@newsletter', '120363143527290123@newsletter']
      ];

      for (const [input, expected] of cases) {
        assert.strictEqual(normalizeJid(input), expected, `Failed for ${input}`);
      }
    });

    it('preserves broadcast status JIDs (@broadcast)', () => {
      const cases = [
        ['status@broadcast', 'status@broadcast'],
        ['status:1@broadcast', 'status@broadcast'],
        ['status:99@broadcast', 'status@broadcast']
      ];

      for (const [input, expected] of cases) {
        assert.strictEqual(normalizeJid(input), expected, `Failed for ${input}`);
      }
    });

    it('normalizes legacy web format (@c.us) to standard @s.whatsapp.net', () => {
      const cases = [
        ['2349161239200:1@c.us', '2349161239200@s.whatsapp.net'],
        ['2349161239200@c.us', '2349161239200@s.whatsapp.net'],
        ['14155552671:5@c.us', '14155552671@s.whatsapp.net']
      ];

      for (const [input, expected] of cases) {
        assert.strictEqual(normalizeJid(input), expected, `Failed for ${input}`);
      }
    });

    it('formats unadorned phone numbers without domain into @s.whatsapp.net', () => {
      const cases = [
        ['2349161239200', '2349161239200@s.whatsapp.net'],
        ['+234 916 123 9200', '2349161239200@s.whatsapp.net'],
        ['1-415-555-2671', '14155552671@s.whatsapp.net']
      ];

      for (const [input, expected] of cases) {
        assert.strictEqual(normalizeJid(input), expected, `Failed for ${input}`);
      }
    });

    it('handles uppercase domains and trailing/leading whitespace gracefully', () => {
      assert.strictEqual(
        normalizeJid('  2349161239200:1@S.WHATSAPP.NET  '),
        '2349161239200@s.whatsapp.net'
      );
      assert.strictEqual(
        normalizeJid('123456:1@LID'),
        '123456@lid'
      );
      assert.strictEqual(
        normalizeJid('120363028472910:1@G.US'),
        '120363028472910@g.us'
      );
      assert.strictEqual(
        normalizeJid('120363143527290123:1@NEWSLETTER'),
        '120363143527290123@newsletter'
      );
    });

    it('handles null, undefined, non-strings, and malformed inputs without throwing', () => {
      const falsyCases = [null, undefined, '', '   ', false, true, 12345, {}, []];
      for (const val of falsyCases) {
        assert.strictEqual(normalizeJid(val), '', `Should return empty string for ${val}`);
      }
    });

    it('areJidsSame correctly compares JIDs across device suffixes and compatible domains', () => {
      // Same user across companion devices
      assert.strictEqual(
        areJidsSame('2349161239200:1@s.whatsapp.net', '2349161239200:2@s.whatsapp.net'),
        true
      );
      // Legacy c.us vs s.whatsapp.net
      assert.strictEqual(
        areJidsSame('2349161239200:1@c.us', '2349161239200@s.whatsapp.net'),
        true
      );
      // Different users
      assert.strictEqual(
        areJidsSame('2349161239200@s.whatsapp.net', '2349161239201@s.whatsapp.net'),
        false
      );
      // User vs Group
      assert.strictEqual(
        areJidsSame('120363028472910@s.whatsapp.net', '120363028472910@g.us'),
        false
      );
      // Null / undefined handling
      assert.strictEqual(areJidsSame(null, '2349161239200@s.whatsapp.net'), false);
      assert.strictEqual(areJidsSame('2349161239200@s.whatsapp.net', undefined), false);
      assert.strictEqual(areJidsSame('', ''), false);
    });
  });
});
