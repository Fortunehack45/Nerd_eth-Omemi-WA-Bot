const { disableItem, enableItem, getFeatureConfig } = require('../services/featureService');

const HELP = `*⚡ Feature & Command Switcher* (Admin Only)

Enable or disable specific commands or bot features dynamically.

*Commands:*
  \`!disable <cmd|feature>\`   Disable a command or feature
  \`!enable <cmd|feature>\`    Enable a disabled command or feature
  \`!toggle list\`             List all currently disabled items

*Supported Features:*
  \`autoreply\`, \`schedule\`, \`proactive\`, \`ai\`, \`status\`, \`viewonce\` or any command name (e.g. \`music\`, \`movie\`, \`download\`, \`nuke\`)

*Examples:*
  \`!disable music\`
  \`!disable autoreply\`
  \`!enable music\`
  \`!toggle list\``;

module.exports = {
  name: 'togglefeature',
  alias: ['toggle', 'feature'],
  description: 'Enable or disable specific commands and bot features',
  usage: '!toggle <disable|enable|list> [name]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var parts = args ? args.trim().split(/\s+/) : [];
    var action = parts[0] ? parts[0].toLowerCase() : '';
    var input = parts.slice(1).join(' ').trim();

    if (!action || action === '--help' || action === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    if (action === 'list' || action === 'status' || action === 'disabled') {
      var cfg = getFeatureConfig();
      var text = '*⚙️ Feature & Command Status*\n\n';
      text += '*Disabled Features:* ' + ((cfg.disabledFeatures && cfg.disabledFeatures.length) ? cfg.disabledFeatures.join(', ') : 'None') + '\n';
      text += '*Disabled Commands:* ' + ((cfg.disabledCommands && cfg.disabledCommands.length) ? cfg.disabledCommands.join(', ') : 'None') + '\n';
      return sock.sendMessage(sender, { text: text });
    }

    if (action === 'disable' || action === 'off') {
      if (!input) return sock.sendMessage(sender, { text: '⚠️ Usage: `!toggle disable <name>`' });
      var res = disableItem(input);
      if (!res.success) return sock.sendMessage(sender, { text: res.error || 'Failed to disable item.' });
      return sock.sendMessage(sender, {
        text: '🚫 Disabled **' + (res.target || input) + '** successfully!\nUsers will not be able to trigger this until re-enabled.'
      });
    }

    if (action === 'enable' || action === 'on') {
      if (!input) return sock.sendMessage(sender, { text: '⚠️ Usage: `!toggle enable <name>`' });
      var res2 = enableItem(input);
      if (!res2.success) return sock.sendMessage(sender, { text: res2.error || 'Failed to enable item.' });
      return sock.sendMessage(sender, {
        text: '✅ Enabled **' + (res2.target || input) + '** successfully!'
      });
    }

    return sock.sendMessage(sender, { text: HELP });
  },
};
