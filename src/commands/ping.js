const { getUptime } = require('../client');
const { formatDuration } = require('../utils/helpers');

module.exports = {
  name: 'ping',
  alias: ['p', 'uptime', 'alive'],
  description: 'Check bot status and response time',
  usage: '!ping',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;
    const start = Date.now();
    const uptime = getUptime();

    await sock.sendMessage(sender, { text: '🏓 Pong!' });
    const latency = Date.now() - start;

    await sock.sendMessage(sender, {
      text: `*Bot Status*\n🤖 Name: ${require('../../config').botName}\n⏱ Uptime: ${formatDuration(uptime)}\n📶 Latency: ${latency}ms\n✅ Online`,
    });
  },
};
