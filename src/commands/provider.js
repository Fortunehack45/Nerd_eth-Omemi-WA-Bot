const { getProvider, switchProvider, listAgentRouterModels } = require('../services/aiService');
const config = require('../../config');

module.exports = {
  name: 'provider',
  alias: ['ai', 'model', 'switch'],
  description: 'View or switch AI provider (OpenAI / AgentRouter)',
  usage: '!provider - show current provider\n!provider switch agentrouter - switch to AgentRouter\n!provider switch openai - switch to OpenAI\n!provider models - list AgentRouter models',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;

    if (!args) {
      const current = getProvider();
      let text = `*🤖 AI Provider*\n\n`;
      text += `Current: *${current === 'agentrouter' ? 'AgentRouter' : current === 'openai' ? 'OpenAI' : 'Not configured'}*\n\n`;
      text += `*Available:*\n`;
      if (config.agentRouter.apiKey && config.agentRouter.apiKey !== 'ar-your-agentrouter-key') {
        text += `▸ AgentRouter (${config.agentRouter.baseUrl})\n`;
      }
      if (config.openai.apiKey && config.openai.apiKey !== 'sk-your-openai-api-key') {
        text += `▸ OpenAI\n`;
      }
      text += `\nSwitch: !provider switch <name>`;
      return sock.sendMessage(sender, { text });
    }

    const parts = args.split(/\s+/);
    const subCmd = parts[0].toLowerCase();

    switch (subCmd) {
      case 'switch': {
        const target = parts[1]?.toLowerCase();
        if (!target || (target !== 'openai' && target !== 'agentrouter')) {
          return sock.sendMessage(sender, { text: 'Usage: !provider switch <openai|agentrouter>' });
        }
        const success = switchProvider(target);
        if (success) {
          await sock.sendMessage(sender, { text: `✅ Switched to ${target === 'agentrouter' ? 'AgentRouter' : 'OpenAI'}` });
        } else {
          await sock.sendMessage(sender, { text: `❌ Cannot switch to ${target}. Check API key in .env` });
        }
        break;
      }

      case 'models': {
        await sock.sendMessage(sender, { text: 'Fetching available models...' });
        const result = await listAgentRouterModels();
        if (result.success) {
          let text = '*📋 AgentRouter Models*\n\n';
          result.models.slice(0, 30).forEach(m => {
            text += `▸ ${m.id}\n`;
          });
          if (result.models.length > 30) {
            text += `\n...and ${result.models.length - 30} more`;
          }
          await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        } else {
          await sock.sendMessage(sender, { text: `Error: ${result.error}` });
        }
        break;
      }

      default:
        await sock.sendMessage(sender, { text: `Unknown: ${subCmd}. Use !provider for info.` });
    }
  },
};
