const config = require('../../config');
const { handleCommand } = require('./commandHandler');
const { getUser, updateUser, addToConversation } = require('../services/memoryService');
const { detectViewOnce, saveViewOnce, getOwnerJid, sendMediaItem, findByMessageId, findRecentByChatOrSender, getLastSavedMedia } = require('../services/viewOnceService');
const { isFeatureDisabled } = require('../services/featureService');
const { isAntiBotEnabled, isBotMessage, logAntiBotEvent } = require('../services/antiBotService');
const { isAdmin } = require('../services/accessControl');
const { saveAndForwardStatus } = require('../services/statusService');
const { logMessage } = require('../../server');

const VIEWONCE_EMOJIS_NORM = [
  '❤', '💖', '💕', '♥', '😍', '🥰', '💓', '💗', '💘', '❣️', '💞', '🔥',
  '😂', '🤣', '😆', '😹', '😅', '😁', '😄', '😃', '😀',
  '👍'
];

const STATUS_EMOJIS_NORM = [
  '🙂', '😊', '😀', '😃', '😁', '😄', '☺️', '😇', '😌', '😋', '😛', '😜', '🤪'
];

const EMOJI_COMMAND_MAP = {
  '🔢': 'pair',
  '🤗': 'hug',
  '😘': 'kiss',
  '🖐️': 'slap',
  '👊': 'punch',
  '💃': 'dance',
  '😉': 'wink',
  '👋': 'wave',
  '🖼️': 'getpp',
  '📷': 'getpp',
  '👤': 'profile',
  '🧹': 'nuke',
  '🚨': 'nuke',
  '💣': 'nuke',
  '💥': 'nuke',
  '👑': 'adminme',
  '📢': 'tagall',
  '👥': 'groupinfo',
  'ℹ️': 'groupinfo',
  '🔗': 'link',
  '🏓': 'ping',
  '🎵': 'music',
  '🎶': 'music',
  '🎧': 'music',
  '🎬': 'movie',
  '🍿': 'movie',
  '🎥': 'movie',
  '📦': 'unzip',
  '⚡': 'speed',
  '🚀': 'speed',
  '📸': 'viewonce',
  '👁️': 'viewonce',
  '🙈': 'viewonce',
  '📱': 'apk',
  '📲': 'apk',
  '🤖': 'ai',
  '🧠': 'ai',
  '💡': 'ai',
  '❓': 'help',
  '📜': 'help',
  '📖': 'help',
  '📥': 'download',
  '⬇️': 'download',
  '📹': 'download',
  '🔍': 'search',
  '🔎': 'search',
  '🌐': 'search',
  '📌': 'remember',
  '📝': 'generate',
  '📄': 'generate',
  '🎨': 'imagine',
  '🖌️': 'imagine',
  '⏰': 'schedule',
  '⏱️': 'schedule',
  '📅': 'schedule',
  '💾': 'memoryadmin',
  '💿': 'memoryadmin',
  '🥷': 'stealth',
  '👻': 'stealth',
  '💻': 'terminal',
  '⌨️': 'terminal',
  '🖥️': 'terminal',
  '🔑': 'access',
  '🔐': 'access',
  '🛡️': 'access',
  '⚔️': 'antibot',
  '🛑': 'antibot',
  '📣': 'broadcast',
  '📻': 'broadcast',
  '🎭': 'persona',
  '📚': 'knowledge',
  '🗂️': 'knowledge',
  '📁': 'media',
  '🗃️': 'media',
  '📊': 'status',
  '📈': 'status',
  '🎚️': 'togglefeature',
  '🔀': 'togglefeature',
  '🔨': 'banaccount',
  '🚫': 'banaccount',
  '❌': 'disable',
  '✅': 'enable',
  '📋': 'disabled',
};

const EMOJI_NORMALIZED_MAP = new Map();
for (var emojiKey in EMOJI_COMMAND_MAP) {
  EMOJI_NORMALIZED_MAP.set(emojiKey, EMOJI_COMMAND_MAP[emojiKey]);
  var normK = normalizeEmojiStr(emojiKey);
  if (normK) EMOJI_NORMALIZED_MAP.set(normK, EMOJI_COMMAND_MAP[emojiKey]);
}

function getEmojiCommand(text) {
  if (!text) return null;
  var trimmed = text.trim();
  var firstChar = Array.from(trimmed)[0];
  if (firstChar && EMOJI_NORMALIZED_MAP.has(firstChar)) {
    return EMOJI_NORMALIZED_MAP.get(firstChar);
  }
  var cleaned = normalizeEmojiStr(trimmed);
  if (cleaned && EMOJI_NORMALIZED_MAP.has(cleaned)) {
    return EMOJI_NORMALIZED_MAP.get(cleaned);
  }
  return null;
}

function isCommand(text) {
  return text && text.startsWith(config.prefix);
}

function normalizeEmojiStr(str) {
  if (!str) return '';
  return str.replace(/[\uFE00-\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, '');
}

function hasEmojiMatch(text, emojiListNorm) {
  if (!text) return false;
  var cleaned = normalizeEmojiStr(text.trim());
  for (var i = 0; i < emojiListNorm.length; i++) {
    if (cleaned.includes(emojiListNorm[i])) return true;
  }
  return false;
}

async function handleMessage(sock, msg) {
  var sender = msg.key.remoteJid;
  var isPrivate = !sender.endsWith('@g.us');
  var inner = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message?.documentWithCaptionMessage?.message || msg.message;
  var messageText = inner?.conversation
    || inner?.extendedTextMessage?.text
    || inner?.imageMessage?.caption
    || inner?.videoMessage?.caption
    || inner?.documentMessage?.caption
    || inner?.reactionMessage?.text
    || msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || '';

  // Anti-Delete Engine: Cache incoming message & handle Delete for Everyone (revoke)
  var { cacheMessage, handleRevokeMessage } = require('../services/antiDeleteService');
  if (!msg.message?.protocolMessage) {
    cacheMessage(msg, sock);
  } else {
    var isRevoked = await handleRevokeMessage(sock, msg);
    if (isRevoked) return;
  }

  // Never allow bot-sent programmatic messages to trigger commands or loops
  if (msg.key?.id && global.botSentMessageIds && global.botSentMessageIds.has(msg.key.id)) {
    return;
  }

  // 1. Emoji Reaction Trigger (Admin reacting to View-Once or Status)
  var reaction = msg.message?.reactionMessage;
  if (reaction) {
    // Ignore reactions sent by the bot itself
    if (msg.key?.fromMe) return;

    var reactionEmoji = reaction.text || '';
    var isCallerAdmin = isAdmin(msg.key?.participant || sender, false);

    if (isCallerAdmin) {
      var { parseJid } = require('../utils/helpers');
      var callerId = reaction.key?.participant || sender;
      var cleanCallerNum = parseJid(callerId);
      var ownerJid = cleanCallerNum ? (cleanCallerNum + '@s.whatsapp.net') : (getOwnerJid(sock) || sender);

      // View-Once trigger via Emoji Reaction (❤️, 😂, 👍)
      if (hasEmojiMatch(reactionEmoji, VIEWONCE_EMOJIS_NORM)) {
        var targetMsgId = reaction.key?.id;
        var savedItem = targetMsgId ? findByMessageId(targetMsgId) : null;

        if (!savedItem) {
          savedItem = findRecentByChatOrSender(reaction.key?.remoteJid, reaction.key?.participant);
        }
        if (!savedItem) {
          savedItem = getLastSavedMedia();
        }

        if (savedItem && ownerJid) {
          await sendMediaItem(sock, ownerJid, savedItem);
          console.log('[EmojiReaction ViewOnce] Delivered saved viewonce ' + savedItem.id + ' to owner self-chat (' + ownerJid + ')');
        }
        return; // Silent delivery — no text message in source chat!
      }

      // Status Saver trigger via Emoji Reaction (🙂, 😊)
      if (hasEmojiMatch(reactionEmoji, STATUS_EMOJIS_NORM)) {
        if (reaction.key) {
          var statusMsgKey = {
            remoteJid: reaction.key.remoteJid || 'status@broadcast',
            id: reaction.key.id || ('STATUS_' + Date.now()),
            participant: reaction.key.participant || sender,
          };
          await saveAndForwardStatus(sock, statusMsgKey, reaction.key.message || {}, msg.pushName);
        }
        return; // Silent delivery — no text message in source chat!
      }
    }
    return;
  }

  // 2. Auto-save view-once media silently if enabled (incoming messages only)
  if (!msg.key?.fromMe && detectViewOnce(msg) && config.viewOnce.enabled && !isFeatureDisabled('viewonce')) {
    var result = await saveViewOnce(sock, msg);
    if (result && result.success && !result.alreadySaved) {
      var targetOwner = getOwnerJid(sock) || sender;
      if (targetOwner) {
        try {
          await sendMediaItem(sock, targetOwner, result);
          console.log('[ViewOnce Auto-Forward] Delivered ' + result.mediaType + ' from ' + result.senderName + ' to owner self-chat (' + targetOwner + ')');
        } catch (e) {
          console.error('[ViewOnce Auto-Forward Error]', e.message);
        }
      }
    }
    return;
  }

  // 3. Admin Emoji & Keyword Triggers (MUST be explicit reply or exact keyword, not loose text)
  var cleanText = messageText.trim();
  var cleanCmdKey = cleanText.toLowerCase().replace(/^!/, '');
  var isViewOnceKeyword = ['vv', 'rvo', 'viewonce', 'reveal', 'getvo'].includes(cleanCmdKey);
  var isStatusKeyword = ['sw', 'savestatus', 'savestory', 'getstatus', 'swdl'].includes(cleanCmdKey);

  var contextInfo = msg.message?.extendedTextMessage?.contextInfo || {};
  var stanzaId = contextInfo.stanzaId;
  var isQuotingMessage = !!(stanzaId || contextInfo.quotedMessage);

  // Strictly require exact keyword, or exact single emoji while replying to a message
  var isSingleViewOnceEmoji = isQuotingMessage && VIEWONCE_EMOJIS_NORM.includes(normalizeEmojiStr(cleanText));
  var isSingleStatusEmoji = isQuotingMessage && STATUS_EMOJIS_NORM.includes(normalizeEmojiStr(cleanText));

  var isEmojiOrKeywordTrigger = isSingleViewOnceEmoji
    || isSingleStatusEmoji
    || isViewOnceKeyword
    || isStatusKeyword;

  if (isEmojiOrKeywordTrigger) {
    var isCallerAdmin = msg.key?.fromMe ? true : isAdmin(msg.key?.participant || sender, false);

    if (isCallerAdmin) {
      var { parseJid } = require('../utils/helpers');
      var callerId = msg.key?.fromMe ? (sock.user?.id || sender) : (msg.key?.participant || sender);
      var cleanCallerNum = parseJid(callerId);
      var ownerJid = cleanCallerNum ? (cleanCallerNum + '@s.whatsapp.net') : (getOwnerJid(sock) || sender);
      var contextInfo = msg.message?.extendedTextMessage?.contextInfo || {};
      var stanzaId = contextInfo.stanzaId;
      var quotedParticipant = contextInfo.participant;
      var quotedRemoteJid = contextInfo.remoteJid || sender;
      var quotedMsg = contextInfo.quotedMessage;

      // --- VIEW-ONCE HANDLER (isSingleViewOnceEmoji, vv, rvo, viewonce) ---
      if (isSingleViewOnceEmoji || isViewOnceKeyword) {
        // 1. If replying to a saved message by stanzaId
        if (stanzaId) {
          var savedItem = findByMessageId(stanzaId);
          if (savedItem && ownerJid) {
            await sendMediaItem(sock, ownerJid, savedItem);
            console.log('[Emoji/Keyword Trigger] Delivered saved viewonce ' + savedItem.id + ' to owner self-chat');
            return;
          }
        }

        // 2. If replying to a viewonce message, reconstruct & decrypt
        if (quotedMsg) {
          var reconstructed = {
            key: {
              remoteJid: sender,
              fromMe: false,
              id: stanzaId || ('QUOTED_' + Date.now()),
              participant: quotedParticipant || '',
            },
            message: quotedMsg,
            pushName: contextInfo.pushName || 'Unknown',
          };

          if (detectViewOnce(reconstructed)) {
            try {
              var saveResult = await saveViewOnce(sock, reconstructed);
              if (saveResult && saveResult.success && ownerJid) {
                await sendMediaItem(sock, ownerJid, saveResult);
                console.log('[Emoji/Keyword Trigger] Extracted & delivered viewonce to owner self-chat');
                return;
              }
            } catch (e) {}
          }
        }

        // 3. Fallback: Find recent saved viewonce by chat/sender or get latest saved
        var recentSaved = findRecentByChatOrSender(sender, quotedParticipant);
        if (!recentSaved) {
          recentSaved = getLastSavedMedia();
        }

        if (recentSaved && ownerJid) {
          await sendMediaItem(sock, ownerJid, recentSaved);
          console.log('[Emoji/Keyword Trigger] Delivered recent viewonce ' + recentSaved.id + ' to owner self-chat');
        } else if (isViewOnceKeyword) {
          await sock.sendMessage(ownerJid, { text: '⚠️ No saved view-once media found in storage.' });
        }
        return; // 100% Silent in source chat!
      }

      // --- STATUS SAVER HANDLER (isSingleStatusEmoji, sw, save, savestatus) ---
      if (isSingleStatusEmoji || isStatusKeyword) {
        if (quotedMsg) {
          var statusMsgKey = {
            remoteJid: quotedRemoteJid || 'status@broadcast',
            id: stanzaId || ('STATUS_' + Date.now()),
            participant: quotedParticipant || sender,
          };
          await saveAndForwardStatus(sock, statusMsgKey, quotedMsg, contextInfo.pushName || msg.pushName, sender);
        } else if (isStatusKeyword) {
          var statusMsgKey = {
            remoteJid: 'status@broadcast',
            id: 'STATUS_' + Date.now(),
            participant: sender,
          };
          await saveAndForwardStatus(sock, statusMsgKey, {}, msg.pushName, sender);
        }
        return; // 100% Silent in source chat!
      }
    }
  }

  if (!messageText) return;

  // 4. Log message activity to dashboard live feed
  var fromDisplay = msg.key?.fromMe ? 'You (Admin)' : (msg.pushName || (sender.includes('@') ? sender.split('@')[0] : sender));
  logMessage(fromDisplay, messageText, isPrivate ? (msg.key?.fromMe ? 'self' : 'dm') : 'group');

  // 5. Track user history silently if memory is enabled
  if (config.memory.enabled && isPrivate && !msg.key?.fromMe) {
    var user = getUser(sender);
    var pushName = msg.pushName || '';
    if (pushName && user.pushName !== pushName) {
      updateUser(sender, { pushName: pushName });
    }
    updateUser(sender, {
      messageCount: (user.messageCount || 0) + 1,
      interactionCount: (user.interactionCount || 0) + 1,
    });
    addToConversation(sender, 'user', messageText);
  }

  // 6. Handle commands (with prefix '!' or emoji shortcuts or prefixless commands)
  var trimmed = messageText.trim();
  var isCmd = isCommand(trimmed);

  // If the message is from the bot's own account (fromMe: true),
  // ONLY process if it starts with the command prefix (e.g. !ping, !help),
  // OR if it's a URL download request from the owner in self-chat.
  if (msg.key?.fromMe && !isCmd) {
    var checkUrl = /(https?:\/\/[^\s]+)/gi;
    if (!trimmed.match(checkUrl) || isFeatureDisabled('download')) {
      return;
    }
  }

  if (isCmd) {
    var cmdText = trimmed.slice(config.prefix.length).trim();
    var firstChar = Array.from(cmdText)[0] || '';
    // Only map emoji shortcut if the command starts with an emoji symbol
    if (firstChar && EMOJI_NORMALIZED_MAP.has(firstChar)) {
      var mappedCmd = EMOJI_NORMALIZED_MAP.get(firstChar);
      var restArgs = cmdText.slice(firstChar.length).trim();
      var fullCmdText = mappedCmd + (restArgs ? ' ' + restArgs : '');
      await handleCommand(sock, msg, fullCmdText);
      return;
    }
    await handleCommand(sock, msg, cmdText);
    return;
  }

  // Support prefixless commands for admin and users (e.g. ai, ask, gpt, getpp, get pp, ping, help)
  var lowerTrimmed = trimmed.toLowerCase();
  if (lowerTrimmed === 'ai' || lowerTrimmed.startsWith('ai ') || lowerTrimmed === 'ask' || lowerTrimmed.startsWith('ask ') || lowerTrimmed === 'gpt' || lowerTrimmed.startsWith('gpt ')) {
    var restAi = trimmed.replace(/^(ai|ask|gpt)\s*/i, '').trim();
    await handleCommand(sock, msg, 'ai' + (restAi ? ' ' + restAi : ''));
    return;
  }
  if (lowerTrimmed === 'getpp' || lowerTrimmed.startsWith('getpp ') || lowerTrimmed === 'get pp' || lowerTrimmed.startsWith('get pp ')) {
    var rest = lowerTrimmed.replace(/^get\s*pp\s*/i, '').trim();
    await handleCommand(sock, msg, 'getpp' + (rest ? ' ' + rest : ''));
    return;
  }
  if (lowerTrimmed === 'ping' || lowerTrimmed === 'help') {
    await handleCommand(sock, msg, lowerTrimmed);
    return;
  }

  // Emoji shortcuts (works for both owner and users)
  var emojiCmd = getEmojiCommand(trimmed);
  if (emojiCmd) {
    var firstSymbol = Array.from(trimmed)[0] || '';
    var restArgs = trimmed.slice(firstSymbol.length).trim();
    var fullCmdText = emojiCmd + (restArgs ? ' ' + restArgs : '');
    await handleCommand(sock, msg, fullCmdText);
    return;
  }

  // 7. Natural Language & URL Auto-Downloader
  // Automatically detects media URLs and downloads them if:
  // - The user says "download this", "save this", "dl this", "get this", etc.
  // - OR the message consists primarily of the media URL
  // - OR the user quoted/replied to a message containing a media URL with a download request
  if (!isFeatureDisabled('download')) {
    var urlRegex = /(https?:\/\/[^\s]+)/gi;
    var matchedUrls = trimmed.match(urlRegex) || [];
    var contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    var quotedText = '';
    if (contextInfo?.quotedMessage) {
      var qInner = contextInfo.quotedMessage?.ephemeralMessage?.message
        || contextInfo.quotedMessage?.viewOnceMessage?.message
        || contextInfo.quotedMessage?.viewOnceMessageV2?.message
        || contextInfo.quotedMessage;
      quotedText = qInner?.conversation
        || qInner?.extendedTextMessage?.text
        || qInner?.imageMessage?.caption
        || qInner?.videoMessage?.caption
        || '';
    }

    var targetUrl = null;
    var detectedPlat = null;
    var { detectPlatform } = require('../services/downloadService');

    // Check URLs in the incoming message
    for (var u of matchedUrls) {
      var clean = u.replace(/[.,!?;:)>\]]+$/, '');
      var plat = detectPlatform(clean);
      if (plat && plat !== 'unknown') {
        targetUrl = clean;
        detectedPlat = plat;
        break;
      }
    }

    // Check quoted message if current message expresses download intent
    var hasDownloadIntent = /\b(download|save|dl|get|grab|rip|load)\b/i.test(trimmed);
    if (!targetUrl && quotedText && hasDownloadIntent) {
      var quotedUrls = quotedText.match(urlRegex) || [];
      for (var qu of quotedUrls) {
        var cleanQu = qu.replace(/[.,!?;:)>\]]+$/, '');
        var qPlat = detectPlatform(cleanQu);
        if (qPlat && qPlat !== 'unknown') {
          targetUrl = cleanQu;
          detectedPlat = qPlat;
          break;
        }
      }
    }

    if (targetUrl) {
      // Check if message is essentially just the URL or has explicit download intent
      var remainingText = trimmed.replace(urlRegex, '').trim();
      var isBareUrl = remainingText.length <= 20;
      if (hasDownloadIntent || isBareUrl) {
        var hasAudioIntent = /\b(audio|sound|song|mp3|music)\b/i.test(trimmed);
        var downloadCmdText = 'download ' + targetUrl + (hasAudioIntent ? ' --audio' : '');
        await handleCommand(sock, msg, downloadCmdText);
        return;
      }
    }
  }

  // 8. Auto-AI response in private DM for non-command text messages (DISABLED by default)
  // AI only responds when explicitly invoked via !ai <question> unless autoReplyDM is explicitly enabled in config
  if (config.ai?.autoReplyDM === true && isPrivate && !msg.key?.fromMe && messageText && !isCmd) {
    if (!isFeatureDisabled('ai')) {
      try {
        var aiCmd = require('../commands/ai');
        await aiCmd.execute(sock, msg, messageText, {
          sender: sender,
          senderId: msg.key.participant || sender,
          pushName: msg.pushName || 'User',
          isGroup: false,
          command: 'ai',
        });
      } catch (e) {
        console.error('[Auto AI DM Error]', e.message);
      }
    }
    return;
  }

  return;
}

module.exports = { handleMessage };
