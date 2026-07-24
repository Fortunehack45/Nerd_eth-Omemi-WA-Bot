const { toggleStatusAdBlocker, getAdBlockerStats } = require('../services/statusAdBlockerService');

module.exports = {
  name: 'blockads',
  alias: ['adblock', 'noads', 'blockad', 'statusadblock', '🛑'],
  description: 'Manage WhatsApp Status Ad Blocker settings and view blocked ads log',
  usage: '!blockads [on|off|status]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;
    const sub = (args || '').trim().toLowerCase();

    if (sub === 'on' || sub === 'enable' || sub === '1') {
      toggleStatusAdBlocker(true);
      return sock.sendMessage(sender, {
        text: '🛡️ *WhatsApp Status Ad Blocker Enabled!*\n\nAll WhatsApp Status Ads, Meta sponsored stories, channel ads, and promotional broadcasts will be automatically blocked and skipped.'
      });
    }

    if (sub === 'off' || sub === 'disable' || sub === '0') {
      toggleStatusAdBlocker(false);
      return sock.sendMessage(sender, {
        text: '⚠️ *WhatsApp Status Ad Blocker Disabled.*\n\nStatus Ads will no longer be filtered.'
      });
    }

    // Default: Show Status & Recent Blocked Log
    const stats = getAdBlockerStats();
    let text = '🛡️ *WhatsApp Status Ad Blocker*\n\n';
    text += '• *Status:* ' + (stats.enabled ? '✅ ENABLED (Active Protection)' : '❌ DISABLED') + '\n';
    text += '• *Total Ads Blocked:* ' + stats.totalBlocked + '\n\n';

    if (stats.recentLog.length > 0) {
      text += '📋 *Recently Blocked Status Ads:*\n';
      stats.recentLog.forEach((ad, i) => {
        const time = new Date(ad.timestamp).toLocaleTimeString();
        text += `\n${i + 1}. *${ad.pushName}* (\`+${ad.sender}\`)\n`;
        text += `   Reason: ${ad.reason}\n`;
        text += `   Snippet: "${ad.snippet}"\n`;
        text += `   Time: ${time}\n`;
      });
    } else {
      text += 'No status ads detected yet. Clean status feed!';
    }

    text += '\n\n*Usage:* `!blockads [on | off | status]`';
    await sock.sendMessage(sender, { text: text });
  },
};
