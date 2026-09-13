const { saveAndForwardStatus } = require('../services/statusService');
const { getOwnerJid } = require('../services/viewOnceService');
const { parseJid } = require('../utils/helpers');

var HELP = [
  '*📱 WhatsApp Status Saver* (Admin Only)',
  '',
  'Saves WhatsApp statuses (images, videos, audio, or text) directly into your personal self-chat.',
  '',
  '*Usage:*',
  '  1️⃣ Reply to any status message or status update with `!savestatus` or `!sw` or `!save`',
  '  2️⃣ Or react/reply to any status with a slightly smiling face emoji (`🙂` or `😊`)',
  '',
  '*Aliases:* `!sw`, `!savestory`, `!getstatus`, `!statusdl`, `!swdl`, `!save`',
].join('\n');

module.exports = {
  name: 'savestatus',
  alias: ['sw', 'savestory', 'getstatus', 'statusdl', 'swdl'],
  description: 'Save and forward WhatsApp status directly to your chat or DM',
  usage: '!savestatus (reply to a status message)',
  adminOnly: false,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var senderId = ctx.senderId;
    var isGroup = ctx.isGroup;

    if (args === '--help' || args === '-h' || args === 'help') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    var contextInfo = msg.message?.extendedTextMessage?.contextInfo || {};
    var stanzaId = contextInfo.stanzaId;
    var quotedParticipant = contextInfo.participant;
    var quotedRemoteJid = contextInfo.remoteJid || sender;

    if (!quotedMsg) {
      return sock.sendMessage(sender, {
        text: '⚠️ Please reply to a WhatsApp status update with `!savestatus` or `!sw` or `!save` to save it.\n\n💡 You can also react or reply with a smiling face emoji (`🙂` or `😊`) to save any status.',
      });
    }

    var statusMsgKey = {
      remoteJid: quotedRemoteJid || 'status@broadcast',
      id: stanzaId || ('STATUS_' + Date.now()),
      participant: quotedParticipant || sender,
    };

    // If used in a group chat, route media to caller's private DM so group isn't spammed
    var cleanCaller = parseJid(senderId || sender);
    var targetChat = isGroup && cleanCaller ? (cleanCaller + '@s.whatsapp.net') : sender;

    var result = await saveAndForwardStatus(sock, statusMsgKey, quotedMsg, contextInfo.pushName || msg.pushName, targetChat);
    if (!result) {
      return sock.sendMessage(sender, {
        text: '❌ Could not save status from reply. Make sure the quoted message is a valid image, video, audio, or text status.',
      });
    }

    if (isGroup) {
      await sock.sendMessage(sender, { text: '✅ Status saved! I sent it directly to your DM 📥' });
    }
  },
};
