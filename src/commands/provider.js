const { getProvider, getModel, switchProvider, listModels } = require('../services/aiService');
const config = require('../../config');

module.exports = {
  name: 'provider',
  alias: ['model', 'switch', 'aiprovider'],
  description: 'View or switch active AI provider (Groq / OpenAI / OpenRouter / AgentRouter)',
  usage: '!provider - show current provider\n!provider switch <groq|openai|openrouter|agentrouter>\n!provider models - list available models',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;

    if (!args) {
      const current = getProvider();
      const currentModel = getModel();
      let text = `*🤖 AI Engine & Provider*\n\n`;
      text += `*Current Provider:* ${current ? current.toUpperCase() : 'NONE'}\n`;
      text += `*Current Model:* ${currentModel || 'N/A'}\n\n`;
      text += `*Available Providers:*\n`;
      text += `▸ \`groq\` (Groq Cloud — Llama-3.1 8B Instant)\n`;
      text += `▸ \`openai\` (OpenAI — GPT-4o / GPT-4o-mini)\n`;
      text += `▸ \`openrouter\` (OpenRouter)\n`;
      text += `▸ \`agentrouter\` (AgentRouter)\n\n`;
      text += `*Switch Provider:* \`!provider switch <name>\`\n`;
      text += `*Set API Key:* \`!setkey <provider> <key>\``;
      return sock.sendMessage(sender, { text });
    }

    const parts = args.trim().split(/\s+/);
    const subCmd = parts[0].toLowerCase();

    switch (subCmd) {
      case 'switch': {
        const target = parts[1]?.toLowerCase();
        const valid = ['groq', 'openai', 'openrouter', 'agentrouter'];
        if (!target || valid.indexOf(target) === -1) {
          return sock.sendMessage(sender, { text: '⚠️ Usage: `!provider switch <groq|openai|openrouter|agentrouter>`' });
        }
        const success = switchProvider(target);
        if (success) {
          await sock.sendMessage(sender, {
            text: `✅ *Switched AI Provider to ${target.toUpperCase()}!*\n*Active Model:* ${getModel()}`
          });
        } else {
          await sock.sendMessage(sender, {
            text: `❌ Cannot switch to ${target.toUpperCase()}.\nNo valid API key configured. Run:\n\`!setkey ${target} <your-key>\``
          });
        }
        break;
      }

      case 'models': {
        await sock.sendMessage(sender, { text: '🔍 Fetching available models for ' + getProvider().toUpperCase() + '...' });
        const result = await listModels();
        if (result.success && Array.isArray(result.models)) {
          let text = '*📋 Available Models (' + result.provider.toUpperCase() + ')*\n\n';
          result.models.slice(0, 25).forEach(m => {
            text += `▸ ${m.id || m.name || m}\n`;
          });
          if (result.models.length > 25) {
            text += `\n...and ${result.models.length - 25} more`;
          }
          await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        } else {
          await sock.sendMessage(sender, { text: `⚠️ Models list unavailable: ${result.error || 'Check API key'}` });
        }
        break;
      }

      default:
        await sock.sendMessage(sender, { text: `Unknown subcommand: "${subCmd}". Use \`!provider\` for info.` });
    }
  },
};
