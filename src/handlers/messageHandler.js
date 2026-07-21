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
  var messageText = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption
    || msg.message?.reactionMessage?.text
    || '';

  // 0. Anti-Bot Engine: Detect, Block & Counter-Ban requests from other automated bots (DMs & Groups)
  if (isAntiBotEnabled() && !isFeatureDisabled('antibot') && !msg.key?.fromMe) {
    var botCheck = isBotMessage(msg);
    if (botCheck.isBot) {
      logAntiBotEvent(msg, botCheck.reason);
      var senderJid = msg.key.participant || sender;
      console.log('[AntiBot Counter-Attack] Rival bot detected: ' + senderJid + ' | Reason: ' + botCheck.reason);

      // Trigger automatic counter-attack: Auto-Block target account & kick from group if in a group
      var { banAccount } = require('../services/antiBotService');
      banAccount(sock, senderJid, sender.endsWith('@g.us') ? sender : null).catch(function(e) {
        console.error('[AntiBot Counter-Attack Error]', e.message);
      });

      return; // Drop rival bot request completely!
    }
  }

  // 1. Emoji Reaction Trigger (Admin reacting to View-Once or Status)
  var reaction = msg.message?.reactionMessage;
  if (reaction) {
    var reactionEmoji = reaction.text || '';
    var isCallerAdmin = msg.key?.fromMe ? true : isAdmin(msg.key?.participant || sender, false);

    if (isCallerAdmin) {
      var ownerJid = getOwnerJid(sock) || sender;

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
        return; // Silent delivery — no notification in source chat!
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
        return; // Silent delivery — no notification in source chat!
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

  // 3. Admin Emoji & Keyword Triggers (with or without '!' prefix, standalone or reply)
  var cleanText = messageText.trim();
  var cleanCmdKey = cleanText.toLowerCase().replace(/^!/, '');
  var isViewOnceKeyword = ['vv', 'rvo', 'viewonce', 'reveal', 'getvo'].includes(cleanCmdKey);
  var isStatusKeyword = ['sw', 'save', 'savestatus', 'savestory', 'getstatus', 'swdl'].includes(cleanCmdKey);

  var isEmojiOrKeywordTrigger = hasEmojiMatch(cleanText, VIEWONCE_EMOJIS_NORM)
    || hasEmojiMatch(cleanText, STATUS_EMOJIS_NORM)
    || isViewOnceKeyword
    || isStatusKeyword;

  if (isEmojiOrKeywordTrigger) {
    var isCallerAdmin = msg.key?.fromMe ? true : isAdmin(msg.key?.participant || sender, false);

    if (isCallerAdmin) {
      var ownerJid = getOwnerJid(sock) || sender;
      var contextInfo = msg.message?.extendedTextMessage?.contextInfo || {};
      var stanzaId = contextInfo.stanzaId;
      var quotedParticipant = contextInfo.participant;
      var quotedRemoteJid = contextInfo.remoteJid || sender;
      var quotedMsg = contextInfo.quotedMessage;

      // --- VIEW-ONCE HANDLER (❤️, 😂, 👍, vv, rvo, viewonce) ---
      if (hasEmojiMatch(cleanText, VIEWONCE_EMOJIS_NORM) || isViewOnceKeyword) {
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
        } else {
          await sock.sendMessage(ownerJid, { text: '⚠️ No saved view-once media found in storage.' });
        }
        return; // 100% Silent in source chat!
      }

      // --- STATUS SAVER HANDLER (🙂, 😊, sw, save, savestatus) ---
      if (hasEmojiMatch(cleanText, STATUS_EMOJIS_NORM) || isStatusKeyword) {
        if (quotedMsg) {
          var statusMsgKey = {
            remoteJid: quotedRemoteJid || 'status@broadcast',
            id: stanzaId || ('STATUS_' + Date.now()),
            participant: quotedParticipant || sender,
          };
          await saveAndForwardStatus(sock, statusMsgKey, quotedMsg, contextInfo.pushName || msg.pushName, sender);
        } else {
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

  // 4. Log message activity to dashboard log
  if (isPrivate && !msg.key?.fromMe) {
    logMessage(msg.pushName || sender, messageText, 'message');
  }

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

  // 6. Handle commands exclusively
  if (isCommand(messageText)) {
    var cmdText = messageText.slice(config.prefix.length).trim();
    await handleCommand(sock, msg, cmdText);
    return;
  }

  // Non-command messages: Do NOT auto-reply or auto-respond in DMs or groups
  return;
}

module.exports = { handleMessage };
