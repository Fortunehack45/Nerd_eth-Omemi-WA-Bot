const { getFeatureConfig } = require('../services/featureService');

module.exports = {
  name: 'disabled',
  alias: ['features', 'disabledlist'],
  description: 'List all currently disabled features and commands (Admin Only)',
  usage: '!disabled',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var cfg = getFeatureConfig();

    var text = '*⚙️ Feature & Command Control Center*\n\n';

    if (cfg.disabledFeatures && cfg.disabledFeatures.length > 0) {
      text += '*🔴 Disabled Features:*\n';
      cfg.disabledFeatures.forEach(function(f) { text += '▸ `' + f + '`\n'; });
    } else {
      text += '*🟢 Disabled Features:* None (all active)\n';
    }

    text += '\n';

    if (cfg.disabledCommands && cfg.disabledCommands.length > 0) {
      text += '*🔴 Disabled Commands:*\n';
      cfg.disabledCommands.forEach(function(c) { text += '▸ `!' + c + '`\n'; });
    } else {
      text += '*🟢 Disabled Commands:* None (all active)\n';
    }

    text += '\n_Use `!disable <name>` to turn off a feature/command._\n_Use `!enable <name>` to turn it back on._';

    return sock.sendMessage(sender, { text: text });
  },
};
