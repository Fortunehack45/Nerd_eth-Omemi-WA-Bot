const config = require('../../config');
const { handleCommand } = require('./commandHandler');
const { getUser, updateUser, addToConversation } = require('../services/memoryService');
const { detectViewOnce, saveViewOnce } = require('../services/viewOnceService');
const { isFeatureDisabled } = require('../services/featureService');
const { isAntiBotEnabled, isBotMessage, logAntiBotEvent } = require('../services/antiBotService');
const { logMessage } = require('../../server');

function isCommand(text) {
  return text && text.startsWith(config.prefix);
}

async function handleMessage(sock, msg) {
  var sender = msg.key.remoteJid;
  var isPrivate = !sender.endsWith('@g.us');
  var messageText = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption
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

  // 1. Auto-save view-once media silently if enabled (incoming messages only)
  if (!msg.key?.fromMe && detectViewOnce(msg) && config.viewOnce.enabled && !isFeatureDisabled('viewonce')) {
    var result = await saveViewOnce(sock, msg);
    if (result && result.success && !result.alreadySaved) {
      var { getOwnerJid, sendMediaItem } = require('../services/viewOnceService');
      var targetOwner = getOwnerJid(sock);

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

  if (!messageText) return;

  // 2. Log message activity to dashboard log
  if (isPrivate && !msg.key?.fromMe) {
    logMessage(msg.pushName || sender, messageText, 'message');
  }

  // 3. Track user history silently if memory is enabled
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

  // 4. Handle commands exclusively
  if (isCommand(messageText)) {
    var cmdText = messageText.slice(config.prefix.length).trim();
    await handleCommand(sock, msg, cmdText);
    return;
  }

  // Non-command messages: Do NOT auto-reply or auto-respond in DMs or groups
  return;
}

module.exports = { handleMessage };
