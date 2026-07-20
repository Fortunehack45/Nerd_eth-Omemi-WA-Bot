module.exports = {
  name: 'getpp',
  alias: ['pfp', 'profilepic', 'avatar', 'pp'],
  description: 'Fetch and send the profile picture of the contact you are chatting with or tagged user',
  usage: '!getpp [@user | reply | phone_number]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var isGroup = ctx.isGroup;
    var targetJid = null;

    // 1. Check mentioned JIDs
    if (ctx.mentionedJids && ctx.mentionedJids.length > 0) {
      targetJid = ctx.mentionedJids[0];
    }
    // 2. Check quoted message participant
    else if (ctx.quoted && (ctx.quoted.participant || ctx.quoted.key?.participant)) {
      targetJid = ctx.quoted.participant || ctx.quoted.key.participant;
    }
    // 3. Check text args for phone number
    else if (args && args.trim()) {
      var clean = args.replace(/[^0-9]/g, '');
      if (clean.length >= 7) {
        targetJid = clean + '@s.whatsapp.net';
      }
    }
    // 4. Fallback in private DM: person chatting with
    else if (!isGroup) {
      targetJid = sender;
    }
    // 5. Fallback in group: sender themselves
    else {
      targetJid = sender;
    }

    if (!targetJid) {
      return sock.sendMessage(sender, { text: '⚠️ Please mention a user, reply to their message, or enter a phone number.' });
    }

    // Ensure @s.whatsapp.net format
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

    if (!ppUrl) {
      return sock.sendMessage(sender, {
        text: '❌ Could not retrieve profile picture for @' + targetJid.split('@')[0] + '. The user may have no profile picture set or their privacy settings hide it.',
        mentions: [targetJid]
      });
    }

    try {
      await sock.sendMessage(sender, {
        image: { url: ppUrl },
        caption: '📷 *Profile Picture of:* @' + targetJid.split('@')[0],
        mentions: [targetJid]
      });
    } catch (err) {
      await sock.sendMessage(sender, { text: '❌ Failed to send profile picture: ' + err.message });
    }
  },
};
