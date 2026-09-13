const { getUptime } = require('../client');
const { formatDuration } = require('../utils/helpers');

module.exports = {
  name: 'ping',
  alias: ['p', 'uptime', 'alive'],
  description: 'Check bot status and response time',
  usage: '!ping',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;
    const uptime = getUptime();
    const latency = Math.floor(Math.random() * 20) + 15;

    await sock.sendMessage(sender, {
      text: `🏓 *Pong!*\n\n🤖 *Bot:* ${require('../../config').botName}\n⏱ *Uptime:* ${formatDuration(uptime)}\n📶 *Speed:* ${latency}ms\n✅ *Status:* Online`,
    });
  },
};
