const { chatComplete } = require('../services/aiService');
const { getUserContext, addToConversation } = require('../services/memoryService');
const { getSystemPrompt } = require('../services/personaService');
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
  restricted: true,
  restrictedFeature: 'ai',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var isPrivate = ctx.isGroup === false;

    if (!args) {
      return sock.sendMessage(sender, {
        text: '*🤖 AI Chat*\n\nChat with the AI assistant. I remember our conversations and personalize responses based on what I learn about you.\n\n*Usage:* `!ai <your question>`\n\n*Examples:*\n  `!ai What is the capital of France?`\n  `!ai Explain quantum computing simply`\n  `!ai Write a poem about technology`\n\n*Tips:*\n  • You can also just send a message directly in private chat — I\'ll respond automatically!\n  • Use `!profile` to see what I know about you\n  • Use `!profile set name <your name>` to introduce yourself',
      });
    }

    await sock.sendPresenceUpdate('composing', sender);

    var userCtx = null;
    if (config.memory.enabled && isPrivate) {
      var ctxData = getUserContext(sender);
      if (ctxData && ctxData.summary) userCtx = ctxData.summary;
    }

    var systemMessages = [{ role: 'system', content: getProfessionalSystemPrompt(config.botName, userCtx) }];

    if (config.memory.enabled && isPrivate) {
      var history = getUserContext(sender);
      if (history && history.history) {
        systemMessages.push({ role: 'system', content: 'Recent conversation:\n' + history.history.substring(0, 1500) });
      }
      addToConversation(sender, 'user', args);
    }

    var result = await chatComplete([...systemMessages, { role: 'user', content: args }]);
    await sock.sendMessage(sender, { text: result.text });

    if (config.memory.enabled && isPrivate) {
      addToConversation(sender, 'assistant', result.text);
    }
  },
};
