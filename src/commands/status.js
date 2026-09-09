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
      return sock.sendMessage(sender, { text: 'Send a status.\nUsage: !status <text>\nReply to an image with: !status image <caption>' });
    }

    const parts = args.split(/\s+/);
    const subCmd = parts[0].toLowerCase();

    if (subCmd === 'image' || subCmd === 'img') {
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = contextInfo?.quotedMessage;
      const imageMsg = quoted?.imageMessage;
      if (!imageMsg) {
        return sock.sendMessage(sender, { text: 'Reply to an image with !status image <caption>' });
      }
      const caption = parts.slice(1).join(' ') || '';
      try {
        const buffer = await sock.downloadMediaMessage({
          key: { remoteJid: sender, id: contextInfo.stanzaId || ('QUOTED_' + Date.now()), fromMe: false, participant: contextInfo.participant || undefined },
          message: quoted,
        });
        const result = await sendImageStatus(sock, buffer, caption);
        if (result.success) {
          return sock.sendMessage(sender, { text: '✅ Image status posted successfully!' });
        }
        return sock.sendMessage(sender, { text: 'Failed: ' + result.error });
      } catch (e) {
        return sock.sendMessage(sender, { text: 'Failed to post image status: ' + e.message });
      }
    }

    const result = await sendStatus(sock, args);
    if (result.success) {
      await sock.sendMessage(sender, { text: '✅ Status posted successfully!' });
    } else {
      await sock.sendMessage(sender, { text: `Failed: ${result.error}` });
    }
  },
};
