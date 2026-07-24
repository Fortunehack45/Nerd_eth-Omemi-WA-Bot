const { sendStatus, sendMediaStatus } = require('../services/statusService');
const { downloadContentFromMessage, normalizeMessageContent } = require('@whiskeysockets/baileys');
const config = require('../../config');

const HELP = `*📱 WhatsApp Status Poster* (Admin Only)

Post custom text or media status updates to your WhatsApp story!

*Usage:*
  \`!status <text>\`                         Post a text status
  \`!status <caption>\` (reply to media)       Post an image, video, or audio status
  \`!poststatus <text>\`                      Alias for !status

*Examples:*
  \`!status Hello world! 🚀\`
  Reply to an image with: \`!status Check this out!\`
  Reply to a video with: \`!status New video clip\``;

module.exports = {
  name: 'status',
  alias: ['story', 'sts', 'poststatus', 'statuspost'],
  description: 'Post text or media status updates to WhatsApp story',
  usage: '!status <text | reply to media>',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;

    if (args === 'help' || args === '--help') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                      msg.message?.imageMessage?.contextInfo ||
                      msg.message?.videoMessage?.contextInfo ||
                      msg.message?.audioMessage?.contextInfo;
    var quotedMsg = contextInfo?.quotedMessage;

    // Check if current message or quoted message contains media
    var rawMsg = quotedMsg || msg.message;
    var norm = normalizeMessageContent(rawMsg) || rawMsg;
    if (norm?.ephemeralMessage?.message) norm = normalizeMessageContent(norm.ephemeralMessage.message) || norm.ephemeralMessage.message;
    if (norm?.viewOnceMessage?.message) norm = normalizeMessageContent(norm.viewOnceMessage.message) || norm.viewOnceMessage.message;

    var mediaObj = norm?.imageMessage || norm?.videoMessage || norm?.audioMessage;

    if (mediaObj) {
      var mediaType = norm.imageMessage ? 'image' : (norm.videoMessage ? 'video' : 'audio');
      var caption = args || mediaObj.caption || '';
      
      await sock.sendPresenceUpdate('composing', sender);

      try {
        var stream = await downloadContentFromMessage(mediaObj, mediaType);
        var chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        var buffer = Buffer.concat(chunks);

        if (!buffer || buffer.length === 0) {
          return sock.sendMessage(sender, { text: '❌ Failed to download media buffer for status post.' });
        }

        var resMedia = await sendMediaStatus(sock, buffer, mediaType, caption);
        if (resMedia.success) {
          return sock.sendMessage(sender, { text: '✅ *' + mediaType.toUpperCase() + ' Status Posted Successfully!*' });
        } else {
          return sock.sendMessage(sender, { text: '❌ Failed to post ' + mediaType + ' status: ' + resMedia.error });
        }
      } catch (eErr) {
        return sock.sendMessage(sender, { text: '❌ Error processing media status: ' + eErr.message });
      }
    }

    // Text status post
    if (!args || !args.trim()) {
      return sock.sendMessage(sender, {
        text: '⚠️ Please provide text to post, or reply to an image/video/audio with `!status`.\n\nType `!status help` for details.'
      });
    }

    await sock.sendPresenceUpdate('composing', sender);
    const result = await sendStatus(sock, args.trim());
    if (result.success) {
      await sock.sendMessage(sender, { text: '✅ *Text Status Posted Successfully!*' });
    } else {
      await sock.sendMessage(sender, { text: `❌ Failed to post text status: ${result.error}` });
    }
  },
};
