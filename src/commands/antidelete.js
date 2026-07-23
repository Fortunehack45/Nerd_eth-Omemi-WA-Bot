const { getConfig, setAntiDeleteEnabled } = require('../services/antiDeleteService');

const HELP = `*🗑️ Anti-Delete / Anti-Revoke Manager* (Admin Only)

Prevents contacts from deleting messages or media from your view when they hit "Delete for Everyone". Deleted messages and media are automatically captured and recovered.

*Usage:*
  \`!antidel [on | off | status | list]\`

*Subcommands:*
  \`status\`              Check current anti-delete status & statistics
  \`on\` / \`enable\`         Turn Anti-Delete ON
  \`off\` / \`disable\`       Turn Anti-Delete OFF
  \`list\`                List recent recovered deleted messages

*Flags:*
  \`--owner\`             Forward recovered messages to owner self-chat
  \`--chat\`              Post recovered messages directly in source chat`;

module.exports = {
  name: 'antidelete',
  alias: ['antidel', 'ad', 'nodelete', 'savedeleted', '🗑️'],
  description: 'Prevent message deletion when contacts hit Delete for Everyone',
  usage: '!antidel [on | off | status | list]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var sub = args ? args.trim().toLowerCase() : 'status';

    if (sub === 'on' || sub === 'enable' || sub === '1') {
      var cfg1 = setAntiDeleteEnabled(true);
      return sock.sendMessage(sender, {
        text: '✅ *Anti-Delete ENABLED!*\n\nAny message or media deleted by contacts using "Delete for Everyone" will be automatically recovered and forwarded to you.'
      });
    }

    if (sub === 'off' || sub === 'disable' || sub === '0') {
      var cfg2 = setAntiDeleteEnabled(false);
      return sock.sendMessage(sender, {
        text: '⚠️ *Anti-Delete DISABLED.*\n\nDeleted messages will no longer be captured.'
      });
    }

    if (sub === 'list' || sub === 'recent' || sub === 'logs') {
      var cfg = getConfig();
      var recent = cfg.recentDeleted || [];
      if (!recent.length) {
        return sock.sendMessage(sender, { text: '📭 No deleted messages recorded yet.' });
      }

      var text = '*🗑️ Recent Recovered Deleted Messages (' + recent.length + ')*\n\n';
      recent.forEach(function(item, i) {
        var dateStr = new Date(item.timestamp).toLocaleTimeString();
        text += (i + 1) + '. @' + item.sender + ' | 🕐 ' + dateStr + '\n   💬 ' + (item.text.substring(0, 80) || '[Media]') + '\n\n';
      });

      return sock.sendMessage(sender, { text: text, mentions: recent.map(r => r.sender + '@s.whatsapp.net') });
    }

    // Default: status
    var currentCfg = getConfig();
    var statusText = '*🗑️ Anti-Delete Status*\n\n';
    statusText += '⚡ *Status:* ' + (currentCfg.enabled ? '✅ ACTIVE (ON)' : '❌ INACTIVE (OFF)') + '\n';
    statusText += '📊 *Total Recovered:* ' + (currentCfg.savedCount || 0) + ' messages\n';
    statusText += '📥 *Forward to Owner:* ' + (currentCfg.forwardToOwner ? 'YES' : 'NO') + '\n\n';
    statusText += '_Use `!antidel on` or `!antidel off` to toggle._';

    return sock.sendMessage(sender, { text: statusText });
  },
};
