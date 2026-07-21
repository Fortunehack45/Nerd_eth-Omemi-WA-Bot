const { disableItem } = require('../services/featureService');

module.exports = {
  name: 'disable',
  alias: ['dis'],
  description: 'Disable a specific command or bot feature (Admin Only)',
  usage: '!disable <command|feature>',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var input = args ? args.trim().toLowerCase() : '';

    if (!input) {
      return sock.sendMessage(sender, {
        text: '⚠️ *Usage:* `!disable <command_or_feature>`\n\n*Examples:*\n▸ `!disable music` (disables !music command)\n▸ `!disable autoreply` (disables auto-replies)\n▸ `!disable schedule` (disables scheduling)\n▸ `!disable ai` (disables AI responses)'
      });
    }

    var res = disableItem(input);
    var label = res.isFeature ? 'feature' : 'command';
    return sock.sendMessage(sender, {
      text: '🚫 *Disabled ' + label + ':* `' + input + '`\nThis ' + label + ' can no longer be triggered by users until re-enabled with `!enable ' + input + '`.'
    });
  },
};
