const { exec } = require('child_process');
const config = require('../../config');

module.exports = {
  name: 'terminal',
  alias: ['exec', 'cmd', 'shell', 'run'],
  description: 'Execute terminal commands (admin only)',
  usage: '!terminal <command>',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;
    if (!args) {
      return sock.sendMessage(sender, { text: 'Please provide a command to run.' });
    }

    await sock.sendMessage(sender, { text: `⚙️ Running: \`${args}\`` });

    exec(args, { timeout: 30000, maxBuffer: 1024 * 1024 }, async (error, stdout, stderr) => {
      let response = '';
      if (stdout) response += `*Output:*\n${stdout.substring(0, 4000)}`;
      if (stderr) response += `*Errors:*\n${stderr.substring(0, 1000)}`;
      if (error) response += `*Error:* ${error.message.substring(0, 500)}`;

      if (!response) response = 'Command executed (no output)';

      if (response.length > 4000) {
        response = response.substring(0, 4000) + '\n\n... (truncated)';
      }

      await sock.sendMessage(sender, { text: response });
    });
  },
};
