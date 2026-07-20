const { sendStatus, sendImageStatus } = require('../services/statusService');
const config = require('../../config');

module.exports = {
  name: 'status',
  alias: ['story', 'sts'],
  description: 'Manage WhatsApp status',
  usage: '!status <text> or !status image <caption> (reply to image)',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;

    if (!args) {
      return sock.sendMessage(sender, { text: 'Send a status.\nUsage: !status <text>' });
    }

    const parts = args.split(/\s+/);
    const subCmd = parts[0].toLowerCase();

    if (subCmd === 'image' || subCmd === 'img') {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const imageMsg = quoted?.imageMessage;
      if (!imageMsg) {
        return sock.sendMessage(sender, { text: 'Reply to an image with !status image <caption>' });
      }
      const caption = parts.slice(1).join(' ') || '';
      const buffer = await sock.downloadMediaMessage(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        ? { key: { id: msg.message.extendedTextMessage.contextInfo.stanzaId }, message: quoted }
        : msg);
      return sock.sendMessage(sender, { text: 'Image status feature requires media download.' });
    }

    const result = await sendStatus(sock, args);
    if (result.success) {
      await sock.sendMessage(sender, { text: '✅ Status posted successfully!' });
    } else {
      await sock.sendMessage(sender, { text: `Failed: ${result.error}` });
    }
  },
};
