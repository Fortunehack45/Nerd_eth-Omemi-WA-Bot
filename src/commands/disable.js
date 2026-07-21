const { disableItem } = require('../services/featureService');

module.exports = {
  name: 'disable',
  alias: ['dis'],
  description: 'Disable a specific command or bot feature (Admin Only)',
  usage: '!disable <command|feature>',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var input = args ? args.trim() : '';

    if (!input) {
      return sock.sendMessage(sender, {
        text: '⚠️ *Usage:* `!disable <command_or_feature>`\n\n' +
          '*Examples:*\n' +
          '▸ `!disable music` (disables !music command)\n' +
          '▸ `!disable schedule` (disables scheduling)\n' +
          '▸ `!disable ai` (disables AI responses)\n\n' +
          'Use `!disabled` to see active restrictions.'
      });
    }

    var res = disableItem(input);
    if (!res.success) {
      return sock.sendMessage(sender, { text: res.error || 'Failed to disable item.' });
    }

    var label = res.isFeature ? 'feature & command' : 'command';
    return sock.sendMessage(sender, {
      text: '🚫 *Disabled ' + label + ':* `' + res.target + '`\nThis item can no longer be used or triggered until re-enabled with `!enable ' + res.target + '`.'
    });
  },
};
