const config = require('../../config');
const { handleCommand } = require('./commandHandler');
const { chatComplete } = require('../services/aiService');
const { checkRateLimit, checkMessageRate, simulateTyping, randomDelay, randomBetween, shouldThrottle } = require('../services/antiBanService');
const { getUser, updateUser, addToConversation, getUserContext, extractFactsFromMessage } = require('../services/memoryService');
const { detectViewOnce, saveViewOnce } = require('../services/viewOnceService');
const { isAdmin, canUse } = require('../services/accessControl');
const { loadJson } = require('../utils/helpers');
const { handleProactive } = require('../services/proactiveService');
const { getPersona, getSystemPrompt } = require('../services/personaService');
const { isFeatureDisabled } = require('../services/featureService');
const { logMessage } = require('../../server');
const path = require('path');

const cooldowns = new Map();
const lastAcknowledge = new Map();

function isCommand(text) {
  return text && text.startsWith(config.prefix);
}

function isMentioned(messageText, botName) {
  var lower = messageText.toLowerCase();
  var names = [botName.toLowerCase(), 'bot', 'chatbot', 'assistant'];
  return names.some(function(n) { return lower.includes(n); });
}

function getProfessionalSystemPrompt(botName, userName, userContext) {
  var extraCtx = null;
  if (userContext) {
    extraCtx = 'About the person you are talking to:\n' + userContext + '\n\nUse this information to personalize your responses naturally.';
  }
  return getSystemPrompt(extraCtx);
}

function acknowledgeLearning(sender, messageText) {
  var learned = extractFactsFromMessage(messageText, sender);
  if (learned && learned.length > 0) {
    var now = Date.now();
    var last = lastAcknowledge.get(sender) || 0;
    if (now - last > 60000) {
      lastAcknowledge.set(sender, now);
      return learned;
    }
  }
  return null;
}

async function handleMessage(sock, msg) {
  var sender = msg.key.remoteJid;
  var isPrivate = !sender.endsWith('@g.us');
  var messageText = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption
    || '';

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

  if (isPrivate && !msg.key?.fromMe) {
    logMessage(msg.pushName || sender, messageText, 'message');
  }

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
    if (config.memory.autoLearn) {
      var newLearnings = acknowledgeLearning(sender, messageText);
    }
  }

  if (isCommand(messageText)) {
    var cmdText = messageText.slice(config.prefix.length).trim();
    await handleCommand(sock, msg, cmdText);
    return;
  }

  // After command check — skip further processing for own messages
  if (msg.key?.fromMe) return;

  if (config.antiBan.enabled && config.antiBan.safeMode) {
    if (!checkRateLimit('ai_response', 10)) return;
    if (!checkMessageRate(sender)) return;
    if (shouldThrottle()) await randomDelay(2000, 5000);
  }

  var senderId = msg.key.participant || sender;
  var cooldownKey = 'ai_' + senderId;
  var now = Date.now();

  if (cooldowns.has(cooldownKey)) {
    var lastUsed = cooldowns.get(cooldownKey);
    if (now - lastUsed < 3000) return;
  }
  cooldowns.set(cooldownKey, now);

  if (!isPrivate) {
    if (!isMentioned(messageText, config.botName)) return;
  }

  if (isPrivate && !isFeatureDisabled('proactive')) {
    var proactiveHandled = await handleProactive(sock, sender, messageText, msg.pushName);
    if (proactiveHandled) {
      if (config.memory.enabled && isPrivate) {
        addToConversation(sender, 'assistant', '(proactive response)');
      }
      return;
    }
  }

  if (isPrivate && newLearnings && newLearnings.length > 0) {
    var learningText = '🧠 *Noted!* I learned something new about you:';
    learningText += '\n' + newLearnings.slice(0, 3).map(function(l) { return '▸ ' + l.fact; }).join('\n');
    learningText += '\n\nUse `!profile` to see what I know about you.';
    if (config.antiBan.enabled && config.antiBan.humanTyping) {
      await simulateTyping(sock, sender, learningText);
    } else {
      await sock.sendPresenceUpdate('composing', sender);
    }
    await new Promise(function(r) { setTimeout(r, randomBetween(300, 800)); });
    await sock.sendMessage(sender, { text: learningText });
    return;
  }

  if (isPrivate && !isFeatureDisabled('ai')) {
    try {
      if (config.antiBan.enabled && config.antiBan.humanTyping) {
        await simulateTyping(sock, sender, messageText);
      } else {
        await sock.sendPresenceUpdate('composing', sender);
      }

      var userName = msg.pushName || 'User';
      var userCtx = null;
      if (config.memory.enabled && isPrivate) {
        var ctx = getUserContext(sender);
        if (ctx && ctx.summary) userCtx = ctx.summary;
      }

      var systemPrompt = getProfessionalSystemPrompt(config.botName, userName, userCtx);
      var messages = [{ role: 'system', content: systemPrompt }];

      if (config.memory.enabled && isPrivate) {
        var history = getUserContext(sender);
        if (history && history.history) {
          messages.push({ role: 'system', content: 'Recent conversation:\n' + history.history.substring(0, 1500) });
        }
      }

      messages.push({ role: 'user', content: messageText });

      var result = await chatComplete(messages);

      var isGreeting = messageText.trim().match(/^(hi|hello|hey|welcome|start|menu|greetings|hola|good morning|good evening|who are you)/i);
      if (isGreeting) {
        try {
          await sock.sendMessage(sender, {
            image: { url: 'https://iili.io/Cwvlxwv.png' },
            caption: result.text
          });
        } catch (e) {
          await sock.sendMessage(sender, { text: result.text });
        }
      } else {
        await sock.sendMessage(sender, { text: result.text });
      }
      logMessage(config.botName, result.text, 'response');

      if (config.memory.enabled && isPrivate) {
        addToConversation(sender, 'assistant', result.text);
      }
    } catch (err) {
      console.error('AI response error:', err.message);
      try {
        await sock.sendMessage(sender, { text: 'I apologize, but I encountered an error processing your message. Please try again.' });
      } catch (e) {}
    }
  }
}

module.exports = { handleMessage };
