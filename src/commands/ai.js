const aiService = require('../services/aiService');
const { getUserContext, addToConversation } = require('../services/memoryService');
const { getSystemPrompt } = require('../services/personaService');
const { formatForWhatsApp } = require('../utils/whatsappFormatter');
const config = require('../../config');

function getProfessionalSystemPrompt(botName, userContext) {
  var extra = userContext ? 'About the person you are talking to:\n' + userContext + '\n\nUse this to personalize responses.' : null;
  return getSystemPrompt(extra);
}

module.exports = {
  name: 'ai',
  alias: ['ask', 'chat', 'gpt'],
  description: 'Chat with AI assistant. The bot remembers what it learns about you.',
  usage: '!ai <your question>',
  adminOnly: false,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var isPrivate = ctx.isGroup === false;

    if (!args) {
      return sock.sendMessage(sender, {
        text: '*🤖 AI Chat*\n\nChat with the AI assistant. I remember our conversations and personalize responses based on what I learn about you.\n\n*Usage:* `!ai <your question>`\n\n*Examples:*\n  `!ai What is the capital of France?`\n  `!ai Explain quantum computing simply`\n  `!ai Write a poem about technology`\n\n*Tips:*\n  • You can also just send a message directly in private chat — I\'ll respond automatically!\n  • Use `!profile` to see what I know about you\n  • Use `!profile set name <your name>` to introduce yourself',
      });
    }

    await sock.sendPresenceUpdate('composing', sender);

    var callerJid = ctx.senderId || sender;
    var userCtx = null;
    if (config.memory.enabled) {
      var ctxData = getUserContext(callerJid);
      if (ctxData && ctxData.summary) userCtx = ctxData.summary;
      if (ctxData && ctxData.language && ctxData.language !== 'auto') {
        userCtx = (userCtx ? userCtx + '\n' : '') + 'CRITICAL INSTRUCTION: The user has selected ' + ctxData.language + ' as their preferred language. Formulate your entire response in ' + ctxData.language + '.';
      }
    }

    var systemMessages = [{ role: 'system', content: getProfessionalSystemPrompt(config.botName, userCtx) }];

    if (config.memory.enabled && isPrivate) {
      var history = getUserContext(callerJid);
      if (history && history.history) {
        systemMessages.push({ role: 'system', content: 'Recent conversation:\n' + history.history.substring(0, 1500) });
      }
      addToConversation(callerJid, 'user', args);
    }

    var result = await aiService.chatComplete([...systemMessages, { role: 'user', content: args }]);
    var replyText = formatForWhatsApp(result.text);
    await sock.sendMessage(sender, { text: replyText }, { quoted: msg });

    if (config.memory.enabled && isPrivate) {
      addToConversation(sender, 'assistant', replyText);
    }
  },
};
