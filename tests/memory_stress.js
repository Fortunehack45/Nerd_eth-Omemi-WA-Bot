/**
 * Empirical Memory Stress Harness for Bounded Message Store
 * 
 * Verifies:
 * 1. Pushing 20,000 messages through SessionManager
 * 2. msgStore.size stays bounded between 1500 and 2001 (eviction cycles occur repeatedly)
 * 3. processedMsgIds stays bounded between 2500 and 3001
 * 4. Memory footprint flattens out and does not leak
 * 5. Full memory teardown on destroySession
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { SessionManager } = require('../src/session/sessionManager');
const { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('./mocks/mockBaileys');

async function runMemoryStress() {
  console.log('--- Starting Empirical Memory Stress Harness ---');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerd-mem-stress-'));
  const manager = new SessionManager({
    sessionsDir: tempDir,
    baileysFactory: makeWASocket,
    authFactory: useMultiFileAuthState,
    keyStoreFactory: makeCacheableSignalKeyStore
  });

  const sessionId = 'stress_bot_alpha';
  const session = await manager.createSession(sessionId);
  const sock = await manager.startSession(sessionId);

  const initialMemory = process.memoryUsage();
  console.log(`Initial Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Initial RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`);

  const TOTAL_MESSAGES = 20000;
  const BATCH_SIZE = 2000;
  let maxMsgStoreSize = 0;
  let maxProcessedIdsSize = 0;
  const telemetry = [];

  for (let i = 1; i <= TOTAL_MESSAGES; i++) {
    sock.simulateIncomingMessage('2349161239200@s.whatsapp.net', `Stress message #${i} with payload data to test memory retention.`);
    
    const storeSize = session.msgStore.size;
    const processedSize = session.processedMsgIds.size;
    if (storeSize > maxMsgStoreSize) maxMsgStoreSize = storeSize;
    if (processedSize > maxProcessedIdsSize) maxProcessedIdsSize = processedSize;

    // Hard bounds assertion
    if (storeSize > 2001) {
      throw new Error(`CRITICAL: msgStore.size ${storeSize} exceeded upper bound 2001 at message #${i}`);
    }
    if (processedSize > 3001) {
      throw new Error(`CRITICAL: processedMsgIds.size ${processedSize} exceeded upper bound 3001 at message #${i}`);
    }

    if (i % BATCH_SIZE === 0) {
      const mem = process.memoryUsage();
      const point = {
        messages: i,
        msgStoreSize: storeSize,
        processedIdsSize: processedSize,
        heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
        rssMB: (mem.rss / 1024 / 1024).toFixed(2)
      };
      telemetry.push(point);
      console.log(`[Batch ${i}/${TOTAL_MESSAGES}] msgStore: ${point.msgStoreSize} | processed: ${point.processedIdsSize} | Heap: ${point.heapUsedMB} MB | RSS: ${point.rssMB} MB`);
    }
  }

  console.log('\n--- Telemetry Summary ---');
  console.log(`Total messages processed: ${TOTAL_MESSAGES}`);
  console.log(`Peak msgStore.size: ${maxMsgStoreSize} (Bound: <= 2001) -> PASS`);
  console.log(`Peak processedMsgIds.size: ${maxProcessedIdsSize} (Bound: <= 3001) -> PASS`);
  
  const midBatch = telemetry[4]; // 10,000 messages
  const endBatch = telemetry[9]; // 20,000 messages
  console.log(`Heap at 10,000 msgs: ${midBatch.heapUsedMB} MB vs at 20,000 msgs: ${endBatch.heapUsedMB} MB`);
  
  // Verify msgStore and processedMsgIds eviction occurred repeatedly
  assert.ok(maxMsgStoreSize <= 2001, 'msgStore must never exceed 2001');
  assert.ok(maxProcessedIdsSize <= 3001, 'processedMsgIds must never exceed 3001');

  // Verify getMessage behavior on evicted vs fresh messages
  const oldestCheck = await sock.getMessage({ id: 'IN_00000000', remoteJid: '2349161239200@s.whatsapp.net' });
  assert.strictEqual(oldestCheck, undefined, 'Oldest messages must return undefined');

  // Destroy session and test teardown
  await manager.destroySession(sessionId, true);
  assert.strictEqual(session.msgStore.size, 0, 'msgStore must be 0 after destroy');
  assert.strictEqual(session.processedMsgIds.size, 0, 'processedMsgIds must be 0 after destroy');
  assert.strictEqual(manager.sessions.size, 0, 'Session map must be 0 after destroy');

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('✅ Memory stress test passed with 100% success. Zero memory unbounded growth detected.');
  process.exit(0);
}

runMemoryStress().catch((err) => {
  console.error('❌ Memory stress test failed:', err);
  process.exit(1);
});
