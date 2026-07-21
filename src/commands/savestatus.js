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
  alias: ['sw', 'savestory', 'getstatus', 'statusdl', 'swdl', 'save'],
  description: 'Save and forward WhatsApp status to owner self-chat (admin only)',
  usage: '!savestatus (reply to a status message)',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

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
        text: '⚠️ Please reply to a WhatsApp status update with `!savestatus` or `!sw` or `!save` to save it.\n\n💡 You can also react or reply with a slightly smiling face emoji (`🙂`) to save any status.',
      });
    }

    var statusMsgKey = {
      remoteJid: quotedRemoteJid || 'status@broadcast',
      id: stanzaId || ('STATUS_' + Date.now()),
      participant: quotedParticipant || sender,
    };

    var result = await saveAndForwardStatus(sock, statusMsgKey, quotedMsg, contextInfo.pushName || msg.pushName);
    if (!result) {
      return sock.sendMessage(sender, {
        text: '❌ Could not save status from reply. Make sure the quoted message is a valid image, video, audio, or text status.',
      });
    }

    // 100% Silent — Media is delivered directly to owner self-chat!
  },
};
