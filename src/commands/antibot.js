const { isAntiBotEnabled, setAntiBotEnabled, addBlockedBot, removeBlockedBot, getBlockedBots, getAntiBotStats } = require('../services/antiBotService');

const HELP = `*🛡️ Anti-Bot Protection System* (Admin Only)

Detect and block requests from other automated bots in DMs and Group Chats.

*Commands:*
  \`!antibot on\`                Enable Anti-Bot protection
  \`!antibot off\`               Disable Anti-Bot protection
  \`!antibot add <number>\`      Manually add a bot phone number to blocklist
  \`!antibot remove <number>\`   Remove a bot number from blocklist
  \`!antibot list\`               List all blocked bot numbers
  \`!antibot stats\`              Show detection stats and recent log events

*Aliases:*
  \`!blockbot\`, \`!botblock\`, \`!ignorebot\`

*Examples:*
  \`!antibot add 2348012345678\`
  \`!antibot remove 2348012345678\`
  \`!antibot list\``;

module.exports = {
  name: 'antibot',
  alias: ['blockbot', 'botblock', 'ignorebot'],
  description: 'Block and ignore requests from other WhatsApp bots (Admin Only)',
  usage: '!antibot [on|off|add|remove|list|stats]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parts = args.trim().split(/\s+/);
    var sub = parts[0].toLowerCase();
    var input = parts.slice(1).join(' ').trim();

    switch (sub) {
      case 'on':
      case 'enable': {
        setAntiBotEnabled(true);
        return sock.sendMessage(sender, { text: '🛡️ *Anti-Bot Protection Enabled!*\nRequests from other automated WhatsApp bots in DMs and Groups will now be automatically detected and blocked.' });
      }

      case 'off':
      case 'disable': {
        setAntiBotEnabled(false);
        return sock.sendMessage(sender, { text: '⚠️ *Anti-Bot Protection Disabled.*' });
      }

      case 'add':
      case 'block': {
        if (!input) return sock.sendMessage(sender, { text: 'Usage: `!antibot add <phone_number>`' });
        var res = addBlockedBot(input);
        if (!res.success) return sock.sendMessage(sender, { text: '❌ Error: ' + res.error });
        return sock.sendMessage(sender, { text: '🚫 Added `' + res.jid + '` to blocked bots directory.\nTotal blocked bots: ' + res.total });
      }

      case 'remove':
      case 'unblock':
      case 'del': {
        if (!input) return sock.sendMessage(sender, { text: 'Usage: `!antibot remove <phone_number>`' });
        var res2 = removeBlockedBot(input);
        if (!res2.success) return sock.sendMessage(sender, { text: '❌ Error: ' + res2.error });
        return sock.sendMessage(sender, { text: '✅ Removed `' + res2.jid + '` from blocked bots directory.\nRemaining blocked bots: ' + res2.total });
      }

      case 'list':
      case 'ls': {
        var bots = getBlockedBots();
        if (bots.length === 0) {
          return sock.sendMessage(sender, { text: '📋 No bot numbers currently in the manual blocklist.' });
        }
        var text = '*📋 Blocked Bot Directory (' + bots.length + ')*\n\n';
        bots.forEach(function(b, idx) {
          text += (idx + 1) + '. `' + b + '`\n';
        });
        text += '\nUse `!antibot remove <number>` to unblock.';
        return sock.sendMessage(sender, { text: text });
      }

      case 'stats':
      case 'status':
      case 'log': {
        var stats = getAntiBotStats();
        var stText = '*🛡️ Anti-Bot Protection Status*\n\n';
        stText += 'Status: ' + (stats.enabled ? '🟢 ACTIVE' : '🔴 DISABLED') + '\n';
        stText += 'Total Blocked Bots: ' + stats.totalBlocked + '\n\n';

        if (stats.recentLogs && stats.recentLogs.length > 0) {
          stText += '*Recent Blocked Bot Attempts:*\n';
          stats.recentLogs.slice(0, 10).forEach(function(l) {
            var date = new Date(l.timestamp).toLocaleTimeString();
            stText += '▸ ' + l.senderName + ' (' + date + ')\n   Reason: ' + l.reason + '\n';
          });
        } else {
          stText += 'No recent blocked bot attempts recorded.';
        }
        return sock.sendMessage(sender, { text: stText });
      }

      default:
        return sock.sendMessage(sender, { text: HELP });
    }
  },
};
