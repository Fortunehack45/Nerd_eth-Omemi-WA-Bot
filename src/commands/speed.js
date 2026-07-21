const { runSpeedTest } = require('../services/speedTestService');

module.exports = {
  name: 'speed',
  alias: ['speedtest', 'nettest'],
  description: 'Run live high-precision internet speed test (download, upload, latency)',
  usage: '!speed',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;
    await sock.sendMessage(sender, {
      text: '⚡ *Running Real Internet Speed Test...*\nMeasuring latency, download speed, and upload speed. Please wait a few seconds.'
    });

    const result = await runSpeedTest();

    if (!result || !result.success) {
      return sock.sendMessage(sender, {
        text: '❌ Speed test failed: ' + (result?.error || 'Network error')
      });
    }

    const text = '🚀 *Internet Speed Test Results*\n\n' +
      '📥 *Download Speed:* `' + result.download_mbps + ' Mbps`\n' +
      '📤 *Upload Speed:* `' + result.upload_mbps + ' Mbps`\n' +
      '📶 *Latency / Ping:* `' + result.ping_ms + ' ms`\n' +
      '⚙️ *Engine:* `' + (result.engine || 'High-Precision Socket Engine') + '`';

    await sock.sendMessage(sender, { text: text });
  },
};
