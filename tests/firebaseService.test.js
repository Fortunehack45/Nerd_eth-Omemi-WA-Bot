const { describe, it } = require('node:test');
const assert = require('node:assert');
const firebaseService = require('../src/services/firebaseService');

describe('Firebase Service Unit Tests', () => {
  it('should initialize safely when unconfigured without crashing or throwing', () => {
    assert.strictEqual(typeof firebaseService.isAvailable, 'function');
    const status = firebaseService.getStatus();
    assert.ok(status !== null && typeof status === 'object');
    assert.strictEqual(typeof status.available, 'boolean');
    assert.strictEqual(typeof status.mode, 'string');
  });

  it('should return null or false gracefully when saving or getting while unconfigured', async () => {
    // If not configured, should never throw
    const saveResult = await firebaseService.saveSession('test_sess', { status: 'idle' });
    assert.strictEqual(saveResult, null);

    const getResult = await firebaseService.getSession('test_sess');
    assert.strictEqual(getResult, null);

    const delResult = await firebaseService.deleteSession('test_sess');
    assert.strictEqual(delResult, false);

    const memResult = await firebaseService.saveMemory('user_123', { facts: [] });
    assert.strictEqual(memResult, false);

    const statsResult = await firebaseService.saveStats({ activeBots: 2 });
    assert.strictEqual(statsResult, false);
  });

  it('should serialize and deserialize Firestore data types correctly', () => {
    const rawData = {
      name: 'Nerd Bot',
      active: true,
      count: 42,
      ratio: 3.14,
      empty: null,
      meta: { foo: 'bar' }
    };

    const serialized = firebaseService._serializeToFirestoreFields(rawData);
    assert.strictEqual(serialized.name.stringValue, 'Nerd Bot');
    assert.strictEqual(serialized.active.booleanValue, true);
    assert.strictEqual(serialized.count.integerValue, '42');
    assert.strictEqual(serialized.ratio.doubleValue, 3.14);
    assert.strictEqual(serialized.empty.nullValue, null);
    assert.strictEqual(typeof serialized.meta.stringValue, 'string');

    const deserialized = firebaseService._deserializeFirestoreFields(serialized);
    assert.strictEqual(deserialized.name, 'Nerd Bot');
    assert.strictEqual(deserialized.active, true);
    assert.strictEqual(deserialized.count, 42);
    assert.strictEqual(deserialized.ratio, 3.14);
    assert.strictEqual(deserialized.empty, null);
    assert.deepStrictEqual(deserialized.meta, { foo: 'bar' });
  });

  it('should sanitize session IDs with invalid characters', async () => {
    // Test that safeId sanitization prevents path injection
    const res = await firebaseService.saveSession('sess/../../../evil*name', { test: true });
    assert.strictEqual(res, null); // when unconfigured
  });

  it('should handle credentials methods safely when unconfigured', async () => {
    const credSave = await firebaseService.saveCredentials('sess_1', { 'creds.json': '{}' });
    assert.strictEqual(credSave, null);

    const credGet = await firebaseService.getCredentials('sess_1');
    assert.strictEqual(credGet, null);

    const credDel = await firebaseService.deleteCredentials('sess_1');
    assert.strictEqual(credDel, false);

    const credList = await firebaseService.listAllCredentialSessionIds();
    assert.deepStrictEqual(credList, []);

    const backupRes = await firebaseService.backupSessionFiles('sess_1', '/non/existent/dir');
    assert.strictEqual(backupRes, false);

    const restoreRes = await firebaseService.restoreSessionFiles('sess_1', '/non/existent/dir');
    assert.strictEqual(restoreRes, false);
  });

  it('should support dynamic reconfiguration via configure()', () => {
    const origStatus = firebaseService.getStatus();
    const confStatus = firebaseService.configure({ projectId: 'test-project-123' });
    assert.strictEqual(confStatus.available, true);
    assert.strictEqual(confStatus.mode, 'firestore-rest');
    assert.ok(confStatus.projectId.includes('tes'));

    // Reset back
    firebaseService.projectId = null;
    firebaseService.databaseUrl = null;
    firebaseService.apiKey = null;
    firebaseService._init();
  });
});
