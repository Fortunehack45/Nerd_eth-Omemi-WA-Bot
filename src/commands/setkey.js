const { setRuntimeKey, getProvider, getModel } = require('../services/aiService');
const fs = require('fs');
const path = require('path');

var VALID_PROVIDERS = ['groq', 'openai', 'openrouter', 'agentrouter', 'brave'];

var HELP = '*🔑 API Key Management* (Admin only)\n\n' +
  'Change AI and search API keys at runtime — no restart needed.\n\n' +
  '*Usage:* `!setkey <provider> <key>`\n\n' +
  '*Providers:*\n' +
  '  `groq`         Groq AI (free) — https://console.groq.com\n' +
  '  `openai`       OpenAI — https://platform.openai.com\n' +
  '  `openrouter`   OpenRouter (free tier) — https://openrouter.ai\n' +
  '  `brave`        Brave Search (2000/mo free) — https://api.search.brave.com\n\n' +
  '*Other:*\n' +
  '  `!setkey show`    Show current AI provider (keys are hidden)\n' +
  '  `!setkey test`    Test if AI is working\n\n' +
  '*Examples:*\n' +
  '  `!setkey groq gsk-abcdef1234...`\n' +
  '  `!setkey openai sk-proj-abcdef1234...`\n' +
  '  `!setkey brave BSA-abcdef1234...`\n' +
  '  `!setkey show`';

function maskKey(key) {
  if (!key || key.length < 8) return '(not set)';
  return key.substring(0, 6) + '...' + key.substring(key.length - 4);
}

function updateEnvFile(provider, key) {
  try {
    var envPath = path.join(__dirname, '..', '..', '.env');
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

    var regex = new RegExp('^' + envKey + '=.*$', 'm');
    if (regex.test(content)) {
      content = content.replace(regex, envKey + '=' + key);
    } else {
      content += '\n' + envKey + '=' + key;
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
      text += '*Active Provider:* ' + (currentProvider || 'none') + '\n';
      text += '*Active Model:* ' + (currentModel || 'N/A') + '\n\n';
      text += '*Keys Configured:*\n';
      text += '  Groq: ' + maskKey(process.env.GROQ_API_KEY) + '\n';
      text += '  OpenAI: ' + maskKey(process.env.OPENAI_API_KEY) + '\n';
      text += '  Brave Search: ' + maskKey(process.env.BRAVE_SEARCH_API_KEY) + '\n';
      text += '\n_Use `!setkey <provider> <key>` to update._';
      return sock.sendMessage(sender, { text: text });
    }

    if (sub === 'test') {
      await sock.sendMessage(sender, { text: '🔍 Testing AI connection...' });
      try {
        var { testConnection } = require('../services/aiService');
        var result = await testConnection();
        if (result.success) {
          await sock.sendMessage(sender, { text: '✅ AI is working!\n*Provider:* ' + getProvider() + '\n*Model:* ' + getModel() + '\n*Response:* ' + result.text });
        } else {
          await sock.sendMessage(sender, { text: '❌ AI test failed: ' + result.text });
        }
      } catch (e) {
        await sock.sendMessage(sender, { text: '❌ AI test error: ' + e.message });
      }
      return;
    }

    var provider = sub;
    var newKey = parts.slice(1).join('');

    if (VALID_PROVIDERS.indexOf(provider) === -1) {
      return sock.sendMessage(sender, {
        text: 'Invalid provider: `' + provider + '`\n\nValid providers: ' + VALID_PROVIDERS.join(', ') + '\n\nUse `!setkey --help` for details.',
      });
    }

    if (!newKey || newKey.length < 8) {
      return sock.sendMessage(sender, { text: 'Please provide a valid key.\n\nUsage: `!setkey ' + provider + ' <your-key>`' });
    }

    await sock.sendMessage(sender, { text: '🔄 Updating ' + provider + ' API key...' });

    // Update runtime config
    var envKeyMap = {
      groq: 'GROQ_API_KEY',
      openai: 'OPENAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      agentrouter: 'AGENT_ROUTER_API_KEY',
      brave: 'BRAVE_SEARCH_API_KEY',
    };
    process.env[envKeyMap[provider]] = newKey;

    var savedToEnv = updateEnvFile(provider, newKey);

    // Reinitialize AI if it's an AI provider
    var aiProviders = ['groq', 'openai', 'openrouter', 'agentrouter'];
    var newProviderName = provider;
    if (aiProviders.indexOf(provider) !== -1) {
      var switched = setRuntimeKey(provider, newKey);
      var text = switched
        ? '✅ AI key updated!\n*New Provider:* ' + getProvider() + '\n*Model:* ' + getModel()
        : '⚠️ Key saved but provider switch failed. Check the key is valid.\nTry `!setkey test` to verify.';
      text += '\n*Saved to .env:* ' + (savedToEnv ? '✅' : '⚠️ (restart to persist)');
      await sock.sendMessage(sender, { text: text });
    } else {
      // Brave or other
      var config = require('../../config');
      if (provider === 'brave') config.braveSearch.apiKey = newKey;
      await sock.sendMessage(sender, {
        text: '✅ ' + provider + ' key updated!\n*Saved to .env:* ' + (savedToEnv ? '✅' : '⚠️ (restart to persist)'),
      });
    }
  },
};
