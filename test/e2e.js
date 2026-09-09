/**
 * End-to-end tests: messageHandler, statusHandler, antiBot, viewOnce,
 * scheduler execution, group commands, media send, unzip, getpp reply context.
 */
process.env.ANTI_BAN_ENABLED = 'false';
process.env.HUMAN_TYPING = 'false';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const { MockSock, makeMsg, makeGroupMsg } = require('./mock');
const { loadCommands } = require('../src/handlers/commandHandler');
const { handleMessage } = require('../src/handlers/messageHandler');
const { handleStatus } = require('../src/handlers/statusHandler');
const scheduler = require('../src/services/schedulerService');
const { createSchedule, checkSchedules, deleteSchedule } = scheduler;
const { detectViewOnce, getViewOnceContent } = require('../src/services/viewOnceService');
const { isBotMessage } = require('../src/services/antiBotService');
const { runSpeedTest } = require('../src/services/speedTestService');

const sock = new MockSock({ botJid: '2348000000000:1@s.whatsapp.net', botIsAdmin: true });
let passed = 0, failed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('✅ ' + name); })
    .catch(e => { failed++; console.log('❌ ' + name + '\n   ' + (e.message || e)); });
}

async function main() {
  loadCommands();
  if (!fs.existsSync('storage')) fs.mkdirSync('storage', { recursive: true });

  // ── 1. Non-command private message: memory tracked, no auto-reply ──
  await check('DM non-command: tracked, no reply', async () => {
    sock.clear();
    await handleMessage(sock, makeMsg('just chatting, no command'));
    assert.strictEqual(sock.sent.length, 0, 'should not auto-reply');
    const mem = require('../src/services/memoryService');
    const user = mem.getUser('2348111111111@s.whatsapp.net');
    assert.ok(user.messageCount >= 1, 'message count should increment');
  });

  // ── 2. Command DM routes to command handler ──
  await check('DM command routes & replies', async () => {
    sock.clear();
    await handleMessage(sock, makeMsg('!ping'));
    assert.ok(sock.sent.length >= 1, 'ping should reply');
  });

  // ── 3. Command with wrong prefix ignored ──
  await check('Non-prefixed slash command ignored', async () => {
    sock.clear();
    await handleMessage(sock, makeMsg('/ping'));
    assert.strictEqual(sock.sent.length, 0);
  });

  // ── 4. From-me command executed (admin self-commands) ──
  await check('Self-command (fromMe) executes', async () => {
    sock.clear();
    await handleMessage(sock, makeMsg('!ping', { fromMe: true }));
    assert.ok(sock.sent.length >= 1, 'fromMe command should run');
  });

  // ── 5. From-me non-command ignored ──
  await check('Self non-command ignored', async () => {
    sock.clear();
    await handleMessage(sock, makeMsg('normal own message', { fromMe: true }));
    assert.strictEqual(sock.sent.length, 0);
  });

  // ── 6. Anti-bot: BAE5 message id detected (uses dedicated rival number) ──
  await check('AntiBot detects BAE5 message id', () => {
    const botMsg = makeMsg('!ping', { id: 'BAE5ABC123', fromMe: false, remoteJid: '234440000000@s.whatsapp.net', participant: '234440000000@s.whatsapp.net' });
    const res = isBotMessage(botMsg);
    assert.strictEqual(res.isBot, true, 'BAE5 id should be flagged: ' + JSON.stringify(res));
  });

  // ── 7. Anti-bot: human message not flagged ──
  await check('AntiBot ignores human message', () => {
    const human = makeMsg('hello there friend', { id: 'HUMAN123456' });
    assert.strictEqual(isBotMessage(human).isBot, false, JSON.stringify(isBotMessage(human)));
  });

  // ── 8. AntiBot full flow: rival bot message gets blocked (dedicated rival number) ──
  await check('AntiBot flow blocks rival bot', async () => {
    // Ensure anti-bot is ON (may have been toggled off by persisted storage from other suites)
    const { setAntiBotEnabled } = require('../src/services/antiBotService');
    setAntiBotEnabled(true);
    sock.clear();
    const rival = makeMsg('Type !help for menu', { id: '3EB0XYZ789', fromMe: false, remoteJid: '234440000000@s.whatsapp.net', participant: '234440000000@s.whatsapp.net' });
    await handleMessage(sock, rival);
    // Should NOT reply to the rival; and should have attempted a block
    assert.strictEqual(sock.sent.length, 0, 'must not reply to rival bot');
    assert.ok(sock.blocked, 'should block rival: ' + sock.blocked);
    // Unblock for later tests via the public API path
    const { removeBlockedBot } = require('../src/services/antiBotService');
    removeBlockedBot('234440000000');
  });

  // ── 9. View-once detection & extraction ──
  await check('ViewOnce detection works', () => {
    const vo = {
      key: { remoteJid: '2348111111111@s.whatsapp.net', fromMe: false, id: 'VO1', participant: '2348111111111@s.whatsapp.net' },
      pushName: 'Tester',
      message: { viewOnceMessageV2: { message: { imageMessage: { url: 'https://mmg.whatsapp.net/x', viewOnce: true } } } },
    };
    assert.strictEqual(detectViewOnce(vo), true);
    const content = getViewOnceContent(vo);
    assert.ok(content, 'content extracted');
    assert.strictEqual(content.innerType, 'imageMessage');
    assert.strictEqual(detectViewOnce(makeMsg('hi')), false);
  });

  // ── 10. View-once full flow through handleMessage ──
  await check('ViewOnce flow saves media', async () => {
    sock.clear();
    const vo = {
      key: { remoteJid: '2348111111111@s.whatsapp.net', fromMe: false, id: 'VOSAVE' + Date.now(), participant: '2348111111111@s.whatsapp.net' },
      pushName: 'Tester',
      message: { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true, caption: 'secret' } } } },
    };
    await handleMessage(sock, vo);
    // mock downloadMediaMessage returns buffer -> file should be saved
    const idxFile = path.join(__dirname, '..', 'storage', 'viewonce', 'index.json');
    assert.ok(fs.existsSync(idxFile), 'index.json should exist');
    const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
    assert.ok(idx.length >= 1, 'at least one saved item');
  });

  // ── 11. Status handler: auto view + like ──
  await check('Status handler views & likes', async () => {
    sock.clear();
    sock.reads = [];
    const status = { key: { remoteJid: 'status@broadcast', fromMe: false, id: 'ST1', participant: '2348111111111@s.whatsapp.net' }, message: { conversation: 'my status' } };
    await handleStatus(sock, status);
    assert.ok(sock.reads && sock.reads.length >= 1, 'should read status');
    const reacted = sock.sent.find(s => s.content && s.content.react);
    assert.ok(reacted, 'should react to status');
  });

  // ── 12. Status handler: disabled feature does nothing ──
  await check('Status handler respects feature toggle', async () => {
    const feat = require('../src/services/featureService');
    feat.disableItem('status');
    sock.clear();
    sock.reads = [];
    const status = { key: { remoteJid: 'status@broadcast', fromMe: false, id: 'ST2', participant: '2348111111111@s.whatsapp.net' }, message: { conversation: 'x' } };
    await handleStatus(sock, status);
    feat.enableItem('status');
    assert.ok(!(sock.reads && sock.reads.length), 'should not read when disabled');
  });

  // ── 13. Scheduler: interval task fires ──
  await check('Scheduler fires due task', async () => {
    scheduler.startScheduler(sock);
    const res = createSchedule('e2e-test', 'interval', { minutes: 10 }, 'hello scheduled', '2348000000000@s.whatsapp.net');
    assert.ok(res.success);
    // Force nextRun into the past
    const schedFile = path.join(__dirname, '..', 'storage', 'schedules.json');
    const all = JSON.parse(fs.readFileSync(schedFile, 'utf8'));
    const s = all.find(x => x.id === res.schedule.id);
    s.nextRun = Date.now() - 5000;
    fs.writeFileSync(schedFile, JSON.stringify(all));
    sock.clear();
    await checkSchedules();
    const sentTo = sock.sent.map(x => x.jid);
    assert.ok(sentTo.includes('2348000000000@s.whatsapp.net'), 'schedule should send to target; got ' + JSON.stringify(sentTo));
    // nextRun should have been advanced
    const after = JSON.parse(fs.readFileSync(schedFile, 'utf8')).find(x => x.id === res.schedule.id);
    assert.ok(after.nextRun > Date.now(), 'nextRun advanced');
    deleteSchedule(res.schedule.id);
  });

  // ── 14. Scheduler: disabled feature skipped ──
  await check('Scheduler respects feature toggle', async () => {
    const feat = require('../src/services/featureService');
    feat.disableItem('schedule');
    sock.clear();
    await checkSchedules();
    feat.enableItem('schedule');
    assert.strictEqual(sock.sent.length, 0);
  });

  // ── 15. Group: tagall ──
  await check('Group tagall mentions everyone', async () => {
    sock.clear();
    const g = makeGroupMsg('!tagall meeting now');
    await handleMessage(sock, g);
    const last = sock.last();
    assert.ok(last, 'should reply');
    assert.ok(last.content.mentions && last.content.mentions.length >= 3, 'mentions all participants');
    assert.ok(last.content.text.includes('@'), 'text contains mentions');
  });

  // ── 16. Group: groupinfo ──
  await check('Group groupinfo works', async () => {
    sock.clear();
    await handleMessage(sock, makeGroupMsg('!groupinfo'));
    const t = sock.texts().join(' ');
    assert.ok(t.includes('Group Details'), 'shows group details');
    assert.ok(t.includes('Test Group'), 'shows subject');
  });

  // ── 17. Group: link (bot is admin in mock) ──
  await check('Group invite link works', async () => {
    sock.clear();
    await handleMessage(sock, makeGroupMsg('!link'));
    const t = sock.texts().join(' ');
    assert.ok(t.includes('chat.whatsapp.com/abcDefGhi'), 'link present: ' + t);
  });

  // ── 18. Group: nuke requires confirm, then runs ──
  await check('Group nuke confirm flow', async () => {
    sock.clear();
    await handleMessage(sock, makeGroupMsg('!nuke'));
    let t = sock.texts().join(' ');
    assert.ok(t.includes('WARNING'), 'warns first');
    sock.clear();
    await handleMessage(sock, makeGroupMsg('!nuke --confirm'));
    t = sock.texts().join(' ');
    assert.ok(t.includes('MASS NUKE STARTED'), 'starts nuke');
    assert.ok(sock.updates && sock.updates.some(u => u.action === 'remove'), 'removes participants');
    assert.ok(t.includes('MASS NUKE COMPLETE'), 'completes');
  });

  // ── 19. Group: adminme when bot is admin ──
  await check('Group adminme promotes caller', async () => {
    sock.clear();
    await handleMessage(sock, makeGroupMsg('!adminme', { participant: '2348000000000@s.whatsapp.net' }));
    assert.ok(sock.updates && sock.updates.some(u => u.action === 'promote'), 'promote attempted');
  });

  // ── 20. getpp with reply context (ctx.quoted) ──
  await check('getpp targets replied user', async () => {
    sock.clear();
    const m = makeMsg('!getpp');
    m.message = { extendedTextMessage: { text: '!getpp', contextInfo: { participant: '2348333333333@s.whatsapp.net', quotedMessage: { conversation: 'hey' } } } };
    await handleMessage(sock, m);
    assert.ok(sock.sent.length >= 1);
    const imgMsg = sock.sent.find(s => s.content.image);
    assert.ok(imgMsg, 'sends image');
    assert.ok(imgMsg.content.caption.includes('2348333333333'), 'caption targets quoted user');
  });

  // ── 21. getpp with mention ──
  await check('getpp targets mentioned user', async () => {
    sock.clear();
    const m = makeMsg('!getpp @2348222222222');
    m.message = { extendedTextMessage: { text: '!getpp @user', contextInfo: { mentionedJid: ['2348222222222@s.whatsapp.net'] } } };
    await handleMessage(sock, m);
    const imgMsg = sock.sent.find(s => s.content.image);
    assert.ok(imgMsg, 'sends image');
    assert.ok(imgMsg.content.caption.includes('2348222222222'), 'caption targets mentioned user');
  });

  // ── 22. media send real file ──
  await check('media send sends real file', async () => {
    const testFile = path.join(__dirname, '..', 'storage', 'e2e-test.txt');
    fs.writeFileSync(testFile, 'hello media test');
    sock.clear();
    await handleMessage(sock, makeMsg('!media send storage/e2e-test.txt'));
    const docMsg = sock.sent.find(s => s.content.document);
    assert.ok(docMsg, 'sends document');
    assert.strictEqual(docMsg.content.fileName, 'e2e-test.txt');
    fs.unlinkSync(testFile);
  });

  // ── 23. unzip real zip ──
  await check('unzip extracts real zip', async () => {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addFile('inner.txt', Buffer.from('zipped content'));
    const zipPath = path.join(__dirname, '..', 'storage', 'e2e-test.zip');
    zip.writeZip(zipPath);
    sock.clear();
    await handleMessage(sock, makeMsg('!unzip ' + zipPath));
    const t = sock.texts().join(' ');
    assert.ok(t.toLowerCase().includes('extract'), 'extraction message: ' + t);
    const extracted = path.join(__dirname, '..', 'storage', 'e2e-test', 'inner.txt');
    if (fs.existsSync(extracted)) {
      assert.strictEqual(fs.readFileSync(extracted, 'utf8'), 'zipped content');
    }
    try { fs.unlinkSync(zipPath); } catch (e) {}
  });

  // ── 24. generate real PDF & text file ──
  await check('generate produces real files', async () => {
    const { generateFile } = require('../src/services/fileGenService');
    const r1 = await generateFile('txt', 'hello world', 'e2egen');
    assert.ok(fs.existsSync(r1.filePath), 'txt exists');
    assert.ok(fs.readFileSync(r1.filePath, 'utf8').includes('hello world'));
    const r2 = await generateFile('pdf', '# Title\n\nBody', 'e2egenpdf');
    assert.ok(fs.existsSync(r2.filePath), 'pdf exists');
    const buf = fs.readFileSync(r2.filePath);
    assert.strictEqual(buf.slice(0, 4).toString(), '%PDF', 'valid PDF header');
    try { fs.unlinkSync(r1.filePath); fs.unlinkSync(r2.filePath); } catch (e) {}
  });

  // ── 25. Speed test returns structured result ──
  await check('speed test engine returns structured result', async () => {
    const r = await runSpeedTest();
    assert.ok(r && typeof r === 'object');
    // In restricted sandbox network may fail — both outcomes acceptable as long as no crash
    if (r.success) {
      assert.ok('download_mbps' in r && 'ping_ms' in r);
    } else {
      assert.ok(r.error);
    }
  });

  // ── 26. memory: conversation history stored ──
  await check('conversation history stored', async () => {
    const mem = require('../src/services/memoryService');
    mem.addToConversation('2348111111111@s.whatsapp.net', 'user', 'e2e history message');
    const ctxd = mem.getUserContext('2348111111111@s.whatsapp.net');
    assert.ok(ctxd.history.includes('e2e history message'), 'history present');
  });

  // ── 27. alias resolution ──
  await check('aliases resolve to canonical commands', async () => {
    const { getCommandByName } = require('../src/handlers/commandHandler');
    assert.strictEqual(getCommandByName('p').name, 'ping');
    assert.strictEqual(getCommandByName('h').name, 'help');
    assert.strictEqual(getCommandByName('dl').name, 'download');
    assert.strictEqual(getCommandByName('vo').name, 'viewonce');
    assert.strictEqual(getCommandByName('ask').name, 'ai');
    assert.strictEqual(getCommandByName('ai').name, 'ai', 'ai must map to ai command, not provider');
    assert.strictEqual(getCommandByName('generate').name, 'generate', 'generate must map to generate command');
    assert.strictEqual(getCommandByName('memory').name, 'memoryadmin');
    assert.strictEqual(getCommandByName('user').name, 'profile');
  });

  // ── 28. disabled command is blocked ──
  await check('disabled command blocked at dispatch', async () => {
    const feat = require('../src/services/featureService');
    const { handleCommand } = require('../src/handlers/commandHandler');
    feat.disableItem('movie');
    sock.clear();
    const r = await handleCommand(sock, makeMsg('!movie search x', { fromMe: true }), 'movie search x');
    feat.enableItem('movie');
    assert.strictEqual(r, true);
    const t = sock.texts().join(' ');
    assert.ok(t.includes('disabled'), 'says disabled: ' + t);
  });

  // ── 29. AI service public-free fallback shape ──
  await check('AI chatComplete returns structured result', async () => {
    const ai = require('../src/services/aiService');
    ai.initAI();
    const r = await ai.chatComplete([{ role: 'user', content: 'test' }]);
    assert.ok('text' in r && 'success' in r, 'structured result');
  });

  // ── 30. provider switch with fake key shape ──
  await check('provider switch validates keys', async () => {
    const ai = require('../src/services/aiService');
    delete process.env.OPENAI_API_KEY;
    const r1 = ai.switchProvider('openai');
    assert.strictEqual(r1, false, 'no key -> false');
  });

  console.log('\nE2E RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('E2E CRASH:', e); process.exit(2); });
