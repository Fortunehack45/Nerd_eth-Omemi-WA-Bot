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
        var clean = args.replace(/[^0-9]/g, '');
        if (clean.length >= 7) {
          targetJid = clean + '@s.whatsapp.net';
        }
      }
    }
    // 4. Fallback in group chat: default to the caller (senderId)
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

    // Ensure proper JID domain if raw number/ID passed
    if (!targetJid.includes('@')) {
      targetJid = targetJid + '@s.whatsapp.net';
    }

    await sock.sendPresenceUpdate('composing', sender);

    var ppUrl = null;
    try {
      ppUrl = await sock.profilePictureUrl(targetJid, 'image');
    } catch (e) {
      try {
        ppUrl = await sock.profilePictureUrl(targetJid);
      } catch (err) {}
    }

    var isGroupTarget = targetJid.endsWith('@g.us');
    var targetTag = isGroupTarget ? 'Group' : '@' + targetJid.split('@')[0];

    if (!ppUrl) {
      return sock.sendMessage(sender, {
        text: '❌ Could not retrieve profile picture for ' + targetTag + '. The profile picture may not be set or privacy settings prevent viewing it.',
        mentions: isGroupTarget ? [] : [targetJid]
      });
    }

    try {
      await sock.sendMessage(sender, {
        image: { url: ppUrl },
        caption: '📷 *Profile Picture of:* ' + targetTag,
        mentions: isGroupTarget ? [] : [targetJid]
      });
    } catch (err) {
      await sock.sendMessage(sender, { text: '❌ Failed to send profile picture: ' + err.message });
    }
  },
};

