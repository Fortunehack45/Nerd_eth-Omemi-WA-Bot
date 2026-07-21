const { enableItem } = require('../services/featureService');

module.exports = {
  name: 'enable',
  alias: ['ena'],
  description: 'Re-enable a disabled command or bot feature (Admin Only)',
  usage: '!enable <command|feature>',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var input = args ? args.trim() : '';

    if (!input) {
      return sock.sendMessage(sender, {
        text: '⚠️ *Usage:* `!enable <command_or_feature>`\n\n' +
          '*Examples:*\n' +
          '▸ `!enable music`\n' +
          '▸ `!enable autoreply`\n' +
          '▸ `!enable schedule`\n' +
          '▸ `!enable ai`\n\n' +
          'Use `!disabled` to see active restrictions.'
      });
    }

    var res = enableItem(input);
    if (!res.success) {
      return sock.sendMessage(sender, { text: res.error || 'Failed to enable item.' });
    }

    return sock.sendMessage(sender, {
      text: '✅ *Enabled:* `' + res.target + '`\nUsers can now use this feature/command again!'
    });
  },
};
