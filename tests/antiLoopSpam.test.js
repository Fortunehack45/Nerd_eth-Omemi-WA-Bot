const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SessionManager } = require('../src/session/sessionManager');
const { isBotSignature, isQuotingBotMessage, checkChatCircuitBreaker, recordChatReply } = require('../src/utils/antiLoop');

test('Anti-Loop & Multi-Bot Spam Prevention Suite', async (t) => {

  await t.test('1. isBotSignature correctly identifies bot outputs', () => {
    assert.equal(isBotSignature('🤖 *NERD BOT* — Processing request...'), true);
    assert.equal(isBotSignature('*NERD BOT* — Media Downloader'), true);
    assert.equal(isBotSignature('✅ Sending audio: *Cool Track*'), true);
    assert.equal(isBotSignature('⚠️ File too large (65MB). Max: 50MB.'), true);
    assert.equal(isBotSignature('❌ Could not download media. Please ensure the link is public.'), true);
    assert.equal(isBotSignature('[DownloadService] Starting Spotify extraction...'), true);
    assert.equal(isBotSignature('🔗 Direct download link:\nhttps://cdn.example.com/v.mp4'), true);
    assert.equal(isBotSignature('╭─────────────\n│ *Commands Menu*\n╰─────────────'), true);

    // Normal user messages MUST NOT be flagged as bot signatures
    assert.equal(isBotSignature('Hello, how are you doing today?'), false);
    assert.equal(isBotSignature('Can you send me that picture from yesterday?'), false);
    assert.equal(isBotSignature('https://open.spotify.com/track/2BaQl0hmHrQblveTf88aIL'), false);
    assert.equal(isBotSignature('!ping'), false);
    assert.equal(isBotSignature('!ai what is the capital of France?'), false);
  });

  await t.test('2. isClusterBot recognizes all active bot sessions across formats', async () => {
    const tempDir = path.join(process.cwd(), 'tests', 'temp_antiloop_sessions_' + Date.now());
    const manager = new SessionManager({ sessionsDir: tempDir });

    const sess1 = await manager.createSession('bot_user_alpha', { phoneNumber: '2348011111111' });
    sess1.sock = {
      user: { id: '2348011111111:2@s.whatsapp.net', lid: '1111111111@lid' }
    };

    const sess2 = await manager.createSession('bot_user_beta', { phoneNumber: '2349022222222' });
    sess2.sock = {
      user: { id: '2349022222222:1@s.whatsapp.net', lid: '2222222222@lid' }
    };

    // Alpha checks if Beta is a cluster bot
    assert.equal(manager.isClusterBot('2349022222222@s.whatsapp.net'), true);
    assert.equal(manager.isClusterBot('2349022222222:1@s.whatsapp.net'), true);
    assert.equal(manager.isClusterBot('2349022222222'), true);
    assert.equal(manager.isClusterBot('2222222222@lid'), true);

    // Beta checks if Alpha is a cluster bot
    assert.equal(manager.isClusterBot('2348011111111@s.whatsapp.net'), true);
    assert.equal(manager.isClusterBot('2348011111111:2@s.whatsapp.net'), true);
    assert.equal(manager.isClusterBot('1111111111@lid'), true);

    // Third-party regular human user is NOT a cluster bot
    assert.equal(manager.isClusterBot('2347033333333@s.whatsapp.net'), false);
    assert.equal(manager.isClusterBot('14155552671@s.whatsapp.net'), false);

    for (const id of Array.from(manager.sessions.keys())) await manager.destroySession(id);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  });

  await t.test('3. acquireGroupLock ensures only 1 bot in a group handles a command', () => {
    const manager = new SessionManager({ sessionsDir: path.join(process.cwd(), 'tests', 'temp_locks') });
    const groupJid = '120363024829103948@g.us';
    const messageId = 'MSG_PING_' + Date.now();

    // Bot 1 arrives first: acquires lock
    const bot1Lock = manager.acquireGroupLock(groupJid, messageId);
    assert.equal(bot1Lock, true, 'Bot 1 must acquire the lock');

    // Bot 2 arrives milliseconds later for the same message in the group: lock rejected!
    const bot2Lock = manager.acquireGroupLock(groupJid, messageId);
    assert.equal(bot2Lock, false, 'Bot 2 must be rejected by the active lock');

    // Bot 3 arrives: also rejected!
    const bot3Lock = manager.acquireGroupLock(groupJid, messageId);
    assert.equal(bot3Lock, false, 'Bot 3 must be rejected by the active lock');

    // Different message in same group can be locked
    const diffMsgId = 'MSG_DIFFERENT_' + Date.now();
    assert.equal(manager.acquireGroupLock(groupJid, diffMsgId), true);
  });

  await t.test('4. clusterBotSentMessageIds shares sent message IDs across all sessions', async () => {
    const tempDir = path.join(process.cwd(), 'tests', 'temp_antiloop_global_' + Date.now());
    const manager = new SessionManager({ sessionsDir: tempDir });

    const sessA = await manager.createSession('bot_sender_a');
    const sessB = await manager.createSession('bot_sender_b');

    // Record message sent by Bot A
    const msgIdFromA = '3EB0ABC123456';
    manager.recordBotSentMessage(msgIdFromA);

    // Global cluster set must have it
    assert.equal(manager.clusterBotSentMessageIds.has(msgIdFromA), true);
    assert.equal(global.clusterBotSentMessageIds.has(msgIdFromA), true);

    for (const id of Array.from(manager.sessions.keys())) await manager.destroySession(id);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  });

  await t.test('5. checkChatCircuitBreaker pauses rapid automated ping-pong loops', () => {
    const testChat = 'test_chat_loop_' + Date.now() + '@s.whatsapp.net';

    // First 2 automated replies are allowed
    recordChatReply(testChat);
    assert.equal(checkChatCircuitBreaker(testChat), true);

    recordChatReply(testChat);
    assert.equal(checkChatCircuitBreaker(testChat), true);

    // 3rd rapid automated reply trips the circuit breaker
    recordChatReply(testChat);
    const allowedAfterTrip = checkChatCircuitBreaker(testChat);
    assert.equal(allowedAfterTrip, false, 'Circuit breaker must trip after rapid replies');

    // Further attempts while tripped are silenced
    assert.equal(checkChatCircuitBreaker(testChat), false);
  });

  await t.test('6. isQuotingBotMessage detects replies to bot error/status messages', () => {
    // Normal message not quoting anything
    const normalMsg = {
      message: { conversation: 'download this please https://example.com/v.mp4' }
    };
    assert.equal(isQuotingBotMessage(normalMsg), false);

    // Message quoting a bot error output
    const quotingBotMsg = {
      message: {
        extendedTextMessage: {
          text: 'try again',
          contextInfo: {
            quotedMessage: {
              conversation: '❌ Could not download media. Please ensure the link is public.'
            }
          }
        }
      }
    };
    assert.equal(isQuotingBotMessage(quotingBotMsg), true);
  });

  await t.test('7. Zero-Width Bot Watermark Protocol prevents multi-bot ping-pong', () => {
    const { BOT_WATERMARK, hasBotWatermark, addBotWatermark } = require('../src/utils/antiLoop');

    assert.ok(BOT_WATERMARK, 'BOT_WATERMARK must be defined');
    assert.equal(typeof BOT_WATERMARK, 'string');

    const plainUserMsg = '!ping';
    assert.equal(hasBotWatermark(plainUserMsg), false, 'User message must not have watermark');

    const botReply = addBotWatermark('🏓 Pong! (45ms)');
    assert.equal(hasBotWatermark(botReply), true, 'Bot reply must have watermark');
    assert.ok(botReply.includes(BOT_WATERMARK));

    // Quoting a watermarked bot message is detected
    const quotingWatermark = {
      message: {
        extendedTextMessage: {
          text: 'what?',
          contextInfo: {
            quotedMessage: {
              conversation: '🏓 Pong! (45ms)' + BOT_WATERMARK
            }
          }
        }
      }
    };
    assert.equal(isQuotingBotMessage(quotingWatermark), true);
  });

  await t.test('8. Bot session processes owner commands and does not drop fromMe', async () => {
    let processedMessage = null;
    const { handleMessage } = require('../src/handlers/messageHandler');
    const { loadCommands } = require('../src/handlers/commandHandler');
    loadCommands();

    const fakeSock = {
      user: { id: '2348012345678:1@s.whatsapp.net', name: 'Owner' },
      sendMessage: async (jid, content) => {
        processedMessage = content;
        return { key: { id: 'SENT_' + Date.now() } };
      }
    };

    const ownerMsg = {
      key: {
        remoteJid: '2348012345678@s.whatsapp.net',
        fromMe: true,
        id: 'OWNER_PING_' + Date.now(),
      },
      message: {
        conversation: '!ping'
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    await handleMessage(fakeSock, ownerMsg, {
      sessionId: 'owner_session',
      botSentMessageIds: new Set()
    });

    assert.ok(processedMessage, 'Owner !ping command must be executed');
    assert.ok(processedMessage.text.includes('Pong'), 'Response must be Pong');
  });

});
