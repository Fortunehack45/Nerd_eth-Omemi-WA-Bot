const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SessionManager } = require('../src/session/sessionManager');
const { makeWASocket } = require('./mocks/mockBaileys');
const { unshortenTikTokUrl } = require('../src/services/downloadService');

test('TikTok & E2EE Decryption Protocol Test Suite', async (t) => {

  await t.test('1. TikTok shortlink unshortener resolves vt.tiktok.com or passes through canonical links', async () => {
    const canonical = 'https://www.tiktok.com/@cnn/video/7685350322666999053';
    const res1 = await unshortenTikTokUrl(canonical);
    assert.equal(res1, canonical);

    assert.equal(await unshortenTikTokUrl(''), '');
    assert.equal(await unshortenTikTokUrl('https://example.com/video'), 'https://example.com/video');

    const shortUrl = 'https://vt.tiktok.com/ZSqQ7Y2Eh/';
    const unshortened = await unshortenTikTokUrl(shortUrl);
    assert.ok(unshortened.includes('tiktok.com/'), 'Should resolve to a tiktok.com URL');
    assert.ok(unshortened.includes('7685350322666999053') || unshortened.includes('cnn'), 'Should contain video ID or author handle');
  });

  await t.test('2. placeholderResendCache is isolated from msgRetryCounterCache', async () => {
    const tempDir = path.join(process.cwd(), 'tests', 'temp_cache_isolation_' + Date.now());
    const manager = new SessionManager({ sessionsDir: tempDir, baileysFactory: makeWASocket });

    const session = await manager.createSession('test_cache_isolation', { phoneNumber: '2348011112222' });

    assert.ok(session.msgRetryCounterCache, 'msgRetryCounterCache must exist');
    assert.ok(session.placeholderResendCache, 'placeholderResendCache must exist');

    assert.notStrictEqual(
      session.placeholderResendCache,
      session.msgRetryCounterCache,
      'placeholderResendCache and msgRetryCounterCache must be strictly different instances'
    );

    session.placeholderResendCache.set('msg_id_100', true);
    session.msgRetryCounterCache.set('msg_id_100', 3);

    assert.equal(session.placeholderResendCache.get('msg_id_100'), true);
    assert.equal(session.msgRetryCounterCache.get('msg_id_100'), 3);

    await manager.destroySession('test_cache_isolation');
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  });

  await t.test('3. getMessage safely resolves across normalized, suffixed, and participant keys', async () => {
    const tempDir = path.join(process.cwd(), 'tests', 'temp_getmsg_protocol_' + Date.now());
    const manager = new SessionManager({ sessionsDir: tempDir, baileysFactory: makeWASocket });

    const sessionId = 'test_getmsg_proto';
    const session = await manager.createSession(sessionId, { phoneNumber: '2348099998888' });
    const sock = await manager.startSession(sessionId);

    const messageProto = { conversation: 'Decrypted secret media message' };
    const wrappedMsg = { key: { id: '3EB0_RETRY_TEST' }, message: messageProto };

    manager.storeSessionMessage(session, '3EB0_RETRY_TEST', wrappedMsg);
    manager.storeSessionMessage(session, '2348099998888@s.whatsapp.net:3EB0_RETRY_TEST', wrappedMsg);

    const found1 = await sock.getMessage({ id: '3EB0_RETRY_TEST' });
    assert.deepEqual(found1, messageProto, 'Should unwrap WebMessageInfo to inner messageProto');

    const found2 = await sock.getMessage({ id: '3EB0_RETRY_TEST', remoteJid: '2348099998888@s.whatsapp.net' });
    assert.deepEqual(found2, messageProto);

    const found3 = await sock.getMessage({ id: '3EB0_RETRY_TEST', remoteJid: '2348099998888:1@s.whatsapp.net' });
    assert.deepEqual(found3, messageProto, 'Should resolve normalized JID without device suffix');

    manager.storeSessionMessage(session, '2347011112222@s.whatsapp.net:GROUP_MSG_1', messageProto);
    const found4 = await sock.getMessage({
      id: 'GROUP_MSG_1',
      remoteJid: '120363000000000000@g.us',
      participant: '2347011112222:2@s.whatsapp.net'
    });
    assert.deepEqual(found4, messageProto, 'Should resolve via normalized participant key');

    const notFound = await sock.getMessage({ id: 'UNKNOWN_MSG_999' });
    assert.strictEqual(notFound, undefined);

    await manager.destroySession(sessionId);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  });

  await t.test('4. Persistent disk hydration restores messages across session restarts', async () => {
    const tempDir = path.join(process.cwd(), 'tests', 'temp_persistence_' + Date.now());
    const manager = new SessionManager({ sessionsDir: tempDir, baileysFactory: makeWASocket });

    const sessionId = 'persistent_session_test';
    const session1 = await manager.createSession(sessionId, { phoneNumber: '2348123456789' });

    const testMsg = { conversation: 'Persistent message across restart' };
    manager.storeSessionMessage(session1, 'PERSIST_KEY_1', testMsg);

    const msgStoreFile = path.join(session1.dir, 'messages_store.json');
    fs.writeFileSync(msgStoreFile, JSON.stringify(Array.from(session1.msgStore.entries())));

    const manager2 = new SessionManager({ sessionsDir: tempDir, baileysFactory: makeWASocket });
    const session2 = await manager2.createSession(sessionId, { phoneNumber: '2348123456789' });

    assert.ok(session2.msgStore.has('PERSIST_KEY_1'), 'msgStore must be hydrated from messages_store.json');
    assert.deepEqual(session2.msgStore.get('PERSIST_KEY_1'), testMsg);

    await manager2.destroySession(sessionId);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  });
});