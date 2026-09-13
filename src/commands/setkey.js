const { setRuntimeKey, getProvider, getModel, testConnection } = require('../services/aiService');
const fs = require('fs');
const path = require('path');

var VALID_PROVIDERS = ['groq', 'openai', 'openrouter', 'agentrouter', 'brave'];

var PROVIDER_ALIASES = {
  groq: 'groq',
  llama: 'groq',
  openai: 'openai',
  chatgpt: 'openai',
  gpt: 'openai',
  openrouter: 'openrouter',
  or: 'openrouter',
  agentrouter: 'agentrouter',
  ar: 'agentrouter',
  brave: 'brave',
  bravesearch: 'brave',
  search: 'brave',
};

var HELP = '*🔑 API Key Management* (Admin only)\n\n' +
  'Configure AI engines and search API keys instantly without restarting the bot.\n\n' +
  '*Usage:* `!setkey <provider> <key>`\n\n' +
  '*Supported Providers:*\n' +
  '  `groq`         Groq Cloud (14,400 free req/day, ultra-fast) — https://console.groq.com\n' +
  '  `openai`       OpenAI (GPT-4o, GPT-4o-mini, DALL-E) — https://platform.openai.com\n' +
  '  `openrouter`   OpenRouter (Free & premium models) — https://openrouter.ai\n' +
  '  `agentrouter`  AgentRouter API — https://agentrouter.org\n' +
  '  `brave`        Brave Search (2,000 free searches/mo) — https://api.search.brave.com\n\n' +
  '*Diagnostic Commands:*\n' +
  '  `!setkey show`    Show active provider, model, and masked key status\n' +
  '  `!setkey test`    Ping the active AI provider to verify key connectivity\n\n' +
  '*Examples:*\n' +
  '  `!setkey groq gsk_123456789abcdef`\n' +
  '  `!setkey openai sk-proj-123456789abcdef`\n' +
  '  `!setkey brave BSA-123456789abcdef`\n' +
  '  `!setkey test`';

function maskKey(key) {
  if (!key || typeof key !== 'string' || key.trim().length < 8) return '❌ (not set)';
  var trimmed = key.trim();
  if (trimmed.includes('your-') || trimmed.includes('demo-')) return '❌ (not set)';
  return '✅ ' + trimmed.substring(0, 6) + '...' + trimmed.substring(trimmed.length - 4);
}

function updateEnvFile(provider, key) {
  try {
    var envPath = path.join(__dirname, '..', '..', '.env');
    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, '', 'utf8');
    }
    var content = fs.readFileSync(envPath, 'utf8');
    var keyMap = {
      groq: 'GROQ_API_KEY',
      openai: 'OPENAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      agentrouter: 'AGENT_ROUTER_API_KEY',
      brave: 'BRAVE_SEARCH_API_KEY',
    };
    var envKey = keyMap[provider.toLowerCase()];
    if (!envKey) return false;

    // Replace existing key entry or append
    var regex = new RegExp('^[\\t ]*' + envKey + '[\\t ]*=.*$', 'm');
    if (regex.test(content)) {
      content = content.replace(regex, envKey + '="' + key + '"');
    } else {
      content = content.trimEnd() + '\n' + envKey + '="' + key + '"\n';
    }

    // If it's an AI provider, also record AI_PROVIDER in .env so it persists across reboots
    var aiProviders = ['groq', 'openai', 'openrouter', 'agentrouter'];
    if (aiProviders.indexOf(provider.toLowerCase()) !== -1) {
      var provRegex = new RegExp('^[\\t ]*AI_PROVIDER[\\t ]*=.*$', 'm');
      if (provRegex.test(content)) {
        content = content.replace(provRegex, 'AI_PROVIDER="' + provider.toLowerCase() + '"');
      } else {
        content = content.trimEnd() + '\nAI_PROVIDER="' + provider.toLowerCase() + '"\n';
      }
    }

    fs.writeFileSync(envPath, content, 'utf8');
    return true;
  } catch (e) {
    console.error('[setkey] .env update error:', e.message);
    return false;
  }
}

module.exports = {
  name: 'setkey',
  alias: ['apikey', 'changekey'],
  description: 'Set API keys for AI and search (admin only)',
  usage: '!setkey <provider> <key> | !setkey show | !setkey test',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parts = args.trim().split(/\s+/);
    var sub = parts[0].toLowerCase();

    if (sub === 'show' || sub === 'status' || sub === 'info') {
      var currentProvider = getProvider();
      var currentModel = getModel();
      var text = '*🔑 AI Key Status*\n\n';
      text += '*Active AI Provider:* ' + (currentProvider ? currentProvider.toUpperCase() : 'NONE') + '\n';
      text += '*Active Model:* ' + (currentModel || 'N/A') + '\n\n';
      text += '*Configured Keys:*\n';
      text += '  • Groq: ' + maskKey(process.env.GROQ_API_KEY) + (currentProvider === 'groq' ? ' *(Active)*' : '') + '\n';
      text += '  • OpenAI: ' + maskKey(process.env.OPENAI_API_KEY) + (currentProvider === 'openai' ? ' *(Active)*' : '') + '\n';
      text += '  • OpenRouter: ' + maskKey(process.env.OPENROUTER_API_KEY) + (currentProvider === 'openrouter' ? ' *(Active)*' : '') + '\n';
      text += '  • AgentRouter: ' + maskKey(process.env.AGENT_ROUTER_API_KEY) + (currentProvider === 'agentrouter' ? ' *(Active)*' : '') + '\n';
      text += '  • Brave Search: ' + maskKey(process.env.BRAVE_SEARCH_API_KEY) + '\n';
      text += '\n_Use `!setkey <provider> <key>` to add or update a key._\n';
      text += '_Use `!setkey test` to verify active AI connectivity._';
      return sock.sendMessage(sender, { text: text });
    }

    if (sub === 'test') {
      await sock.sendMessage(sender, { text: '🔍 *Testing AI connection...*' });
      try {
        var result = await testConnection();
        if (result.success) {
          await sock.sendMessage(sender, {
            text: '✅ *AI Connection Successful!*\n\n' +
              '*Provider:* ' + getProvider().toUpperCase() + '\n' +
              '*Model:* ' + getModel() + '\n' +
              '*Response:* "' + (result.text || 'OK') + '"'
          });
        } else {
          await sock.sendMessage(sender, {
            text: '❌ *AI Test Failed*\n\n' +
              '*Provider:* ' + getProvider().toUpperCase() + '\n' +
              '*Error:* ' + (result.text || 'Unknown error') + '\n\n' +
              '*Troubleshooting:*\n' +
              '• Verify your key at https://console.groq.com/keys\n' +
              '• Update key with: `!setkey groq <your-key>`'
          });
        }
      } catch (e) {
        await sock.sendMessage(sender, { text: '❌ AI test error: ' + e.message });
      }
      return;
    }

    // Resolve provider name / alias
    var rawProvider = sub;
    var provider = PROVIDER_ALIASES[rawProvider] || rawProvider;

    if (VALID_PROVIDERS.indexOf(provider) === -1) {
      return sock.sendMessage(sender, {
        text: '❌ Invalid provider: `' + rawProvider + '`\n\n' +
          '*Supported providers:*\n' +
          VALID_PROVIDERS.map(function(p) { return '  • `' + p + '`'; }).join('\n') +
          '\n\nUse `!setkey --help` for full usage instructions.',
      });
    }

    // Clean key: strip quotes, backticks, multiline whitespace
    var newKey = parts.slice(1).join(' ').trim().replace(/^[`"']+|[`"']+$/g, '').trim();

    if (!newKey || newKey.length < 8) {
      return sock.sendMessage(sender, {
        text: '⚠️ Please provide a valid key.\n\n*Usage:* `!setkey ' + provider + ' <your-key>`\n*Example:* `!setkey groq gsk_123456789abcdef`',
      });
    }

    await sock.sendMessage(sender, { text: '🔄 Updating ' + provider.toUpperCase() + ' key...' });

    // Update environment variable
    var envKeyMap = {
      groq: 'GROQ_API_KEY',
      openai: 'OPENAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      agentrouter: 'AGENT_ROUTER_API_KEY',
      brave: 'BRAVE_SEARCH_API_KEY',
    };
    var envVar = envKeyMap[provider];
    process.env[envVar] = newKey;

    var savedToEnv = updateEnvFile(provider, newKey);

    // Reinitialize AI if it's an AI provider
    var aiProviders = ['groq', 'openai', 'openrouter', 'agentrouter'];
    if (aiProviders.indexOf(provider) !== -1) {
      process.env.AI_PROVIDER = provider;
      var switched = setRuntimeKey(provider, newKey);
      var text = switched
        ? '✅ *' + provider.toUpperCase() + ' Key Activated Successfully!*\n\n' +
          '*Active Provider:* ' + getProvider().toUpperCase() + '\n' +
          '*Active Model:* ' + getModel() + '\n' +
          '*Saved to .env:* ' + (savedToEnv ? '✅ Yes (persists across restarts)' : '⚠️ Check file permissions') + '\n\n' +
          '_Try `!setkey test` now to verify the live connection!_'
        : '⚠️ Key saved, but provider switch failed. Please verify the key format and run `!setkey test`.';
      await sock.sendMessage(sender, { text: text });
    } else {
      // Brave search or other API
      var config = require('../../config');
      if (provider === 'brave') {
        config.braveSearch.apiKey = newKey;
        config.braveSearch.enabled = true;
      }
      await sock.sendMessage(sender, {
        text: '✅ *' + provider.toUpperCase() + ' Key Updated!*\n\n' +
          '*Status:* Active for internet searches (`!search`)\n' +
          '*Saved to .env:* ' + (savedToEnv ? '✅ Yes (persists across restarts)' : '⚠️ Check file permissions'),
      });
    }
  },
};
