const { parseJid } = require('../utils/helpers');

module.exports = {
  name: 'getpp',
  alias: ['pfp', 'profilepic', 'avatar', 'pp'],
  description: 'Fetch and send the profile picture of the contact you are chatting with, group, or tagged user',
  usage: '!getpp [@user | reply | phone_number | group]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var senderId = ctx.senderId;
    var isGroup = ctx.isGroup;
    var targetJid = null;

    // Extract contextInfo from message payload if present
    var contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                      msg.message?.imageMessage?.contextInfo ||
                      msg.message?.videoMessage?.contextInfo ||
                      msg.message?.documentMessage?.contextInfo ||
                      msg.message?.stickerMessage?.contextInfo ||
                      msg.message?.audioMessage?.contextInfo;

    var mentionedJids = contextInfo?.mentionedJid || ctx.mentionedJids || [];
    var quotedParticipant = contextInfo?.participant || ctx.quoted?.participant || ctx.quoted?.key?.participant;

    // 1. Check mentioned JIDs
    if (mentionedJids && mentionedJids.length > 0) {
      targetJid = mentionedJids[0];
    }
    // 2. Check quoted message participant
    else if (quotedParticipant) {
      targetJid = quotedParticipant;
    }
    // 3. Check text args
    else if (args && args.trim()) {
      var cleanArgs = args.trim().toLowerCase();
      if (cleanArgs === 'group' || cleanArgs === 'gc' || cleanArgs === 'g') {
        targetJid = sender;
      } else {
        var cleanNum = args.replace(/[^0-9]/g, '');
        if (cleanNum.length >= 7) {
          targetJid = cleanNum + '@s.whatsapp.net';
        }
      }
    }
    // 4. Fallback in group chat: default to caller
    else if (isGroup) {
      targetJid = senderId || sender;
    }
    // 5. Fallback in private DM: default to sender
    else {
      targetJid = sender;
    }

    if (!targetJid) {
      return sock.sendMessage(sender, { text: '⚠️ Please mention a user, reply to their message, or enter a phone number.' });
    }

    // Clean JID: strip device IDs like ':12' or '@s.whatsapp.net' duplicates
    var isGroupTarget = targetJid.endsWith('@g.us');
    var cleanJid = isGroupTarget
      ? targetJid
      : (parseJid(targetJid) ? (parseJid(targetJid) + '@s.whatsapp.net') : targetJid);

    await sock.sendPresenceUpdate('composing', sender);

    var ppUrl = null;
    try {
      ppUrl = await sock.profilePictureUrl(cleanJid, 'image');
    } catch (e) {
      try {
        ppUrl = await sock.profilePictureUrl(cleanJid, 'preview');
      } catch (err1) {
        try {
          ppUrl = await sock.profilePictureUrl(cleanJid);
        } catch (err2) {}
      }
    }

    var targetTag = isGroupTarget ? 'Group' : '@' + parseJid(cleanJid);

    if (!ppUrl) {
      return sock.sendMessage(sender, {
        text: '❌ Could not retrieve profile picture for ' + targetTag + '. The profile picture may not be set or privacy settings prevent viewing it.',
        mentions: isGroupTarget ? [] : [cleanJid]
      });
    }

    try {
      // Fetch buffer directly for 100% reliable message delivery
      var buffer = null;
      try {
        var res = await fetch(ppUrl);
        if (res.ok) {
          var arrBuf = await res.arrayBuffer();
          buffer = Buffer.from(arrBuf);
        }
      } catch (eFetch) {}

      if (buffer && buffer.length > 0) {
        await sock.sendMessage(sender, {
          image: buffer,
          caption: '📷 *Profile Picture of:* ' + targetTag,
          mentions: isGroupTarget ? [] : [cleanJid]
        });
      } else {
        await sock.sendMessage(sender, {
          image: { url: ppUrl },
          caption: '📷 *Profile Picture of:* ' + targetTag,
          mentions: isGroupTarget ? [] : [cleanJid]
        });
      }
    } catch (err) {
      await sock.sendMessage(sender, { text: '❌ Failed to send profile picture: ' + err.message });
    }
  },
};

