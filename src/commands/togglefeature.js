const { disableItem, enableItem, getFeatureConfig } = require('../services/featureService');

const HELP = `*⚡ Feature & Command Switcher* (Admin Only)

Enable or disable specific commands, subcommands, or bot features dynamically.

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
  name: 'disable',
  alias: ['enable', 'toggle', 'feature', 'togglefeature'],
  description: 'Enable or disable specific commands and bot features',
  usage: '!disable <command|feature> | !enable <command|feature>',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var command = ctx.command.toLowerCase();
    var input = args ? args.trim().toLowerCase() : '';

    if (!input || input === '--help' || input === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    if (input === 'list' || input === 'status') {
      var cfg = getFeatureConfig();
      var text = '*⚙️ Feature & Command Status*\n\n';
      text += '*Disabled Features:* ' + ((cfg.disabledFeatures && cfg.disabledFeatures.length) ? cfg.disabledFeatures.join(', ') : 'None') + '\n';
      text += '*Disabled Commands:* ' + ((cfg.disabledCommands && cfg.disabledCommands.length) ? cfg.disabledCommands.join(', ') : 'None') + '\n';
      return sock.sendMessage(sender, { text: text });
    }

    if (command === 'disable' || command === 'feature' || command === 'togglefeature') {
      var res = disableItem(input);
      return sock.sendMessage(sender, {
        text: '🚫 Disabled **' + input + '** successfully!\nUsers will not be able to trigger this until re-enabled.'
      });
    }

    if (command === 'enable') {
      var res2 = enableItem(input);
      return sock.sendMessage(sender, {
        text: '✅ Enabled **' + input + '** successfully!'
      });
    }

    return sock.sendMessage(sender, { text: HELP });
  },
};
