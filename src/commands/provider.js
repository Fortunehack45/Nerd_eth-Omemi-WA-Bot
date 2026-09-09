const { getProvider, switchProvider, listAgentRouterModels, getModel } = require('../services/aiService');
const config = require('../../config');

var PROVIDER_LABELS = {
  groq: 'Groq',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  agentrouter: 'AgentRouter',
  'public-free': 'Public Free AI (no key needed)',
};

module.exports = {
  name: 'provider',
  alias: ['model', 'switch'],
  description: 'View or switch AI provider (Groq / OpenAI / OpenRouter / AgentRouter)',
  usage: '!provider - show current provider\n!provider switch <groq|openai|openrouter|agentrouter> - switch provider\n!provider models - list models for the active provider',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;

    if (!args) {
      const current = getProvider();
      let text = `*🤖 AI Provider*\n\n`;
      var currentLabel = PROVIDER_LABELS[current] || (current === 'none' ? 'Not initialized (Public Free AI on first use)' : current);
      text += `Current: *${currentLabel}*\n`;
      if (current && current !== 'none') text += `Model: *${getModel() || 'N/A'}*\n`;
      text += `\n*Available:*\n`;
      var groqKey = process.env.GROQ_API_KEY;
      if (groqKey && groqKey !== 'gsk-demo-key') text += `▸ Groq (free — set with !setkey groq <key>)\n`;
      if (config.agentRouter.apiKey && config.agentRouter.apiKey !== 'ar-your-agentrouter-key') {
        text += `▸ AgentRouter (${config.agentRouter.baseUrl})\n`;
      }
      if (config.openai.apiKey && config.openai.apiKey !== 'sk-your-openai-api-key') {
        text += `▸ OpenAI\n`;
      }
      if (process.env.OPENROUTER_API_KEY) text += `▸ OpenRouter (free tier)\n`;
      text += `▸ Public Free AI (always available fallback)\n`;
      text += `\nSwitch: !provider switch <groq|openai|openrouter|agentrouter>`;
      return sock.sendMessage(sender, { text });
    }

    const parts = args.split(/\s+/);
    const subCmd = parts[0].toLowerCase();

    switch (subCmd) {
      case 'switch': {
        const target = parts[1]?.toLowerCase();
        if (!target || ['openai', 'agentrouter', 'groq', 'openrouter'].indexOf(target) === -1) {
          return sock.sendMessage(sender, { text: 'Usage: !provider switch <groq|openai|openrouter|agentrouter>' });
        }
        const success = switchProvider(target);
        if (success) {
          await sock.sendMessage(sender, { text: `✅ Switched to ${PROVIDER_LABELS[target] || target}\n*Model:* ${getModel() || 'N/A'}` });
        } else {
          await sock.sendMessage(sender, { text: `❌ Cannot switch to ${target}. Set its API key first with !setkey ${target} <key>` });
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
