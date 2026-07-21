const config = require('../../config');
const { handleCommand } = require('./commandHandler');
const { getUser, updateUser, addToConversation } = require('../services/memoryService');
const { detectViewOnce, saveViewOnce } = require('../services/viewOnceService');
const { isFeatureDisabled } = require('../services/featureService');
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

  // 1. Auto-save view-once media silently if enabled
  if (detectViewOnce(msg) && config.viewOnce.enabled && !isFeatureDisabled('viewonce')) {
    var result = await saveViewOnce(sock, msg);
    if (result && result.success && config.viewOnce.notifyAdmin) {
      var admins = Array.isArray(config.admins) ? config.admins : [];
      for (var a = 0; a < admins.length; a++) {
        var adminJid = admins[a] + '@s.whatsapp.net';
        try {
          await sock.sendMessage(adminJid, {
            text: '📸 View-once ' + result.mediaType + ' saved from ' + result.senderName + '\nID: ' + result.id + '\nUse `!viewonce show ' + result.id + '` to view',
          });
        } catch (e) {}
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
