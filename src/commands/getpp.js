const { parseJid } = require('../utils/helpers');
const axios = require('axios');

function cleanTargetJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  var trimmed = jid.trim();
  if (trimmed.endsWith('@g.us')) {
    var gDigits = trimmed.split('@')[0].replace(/[^0-9]/g, '');
    return gDigits ? (gDigits + '@g.us') : null;
  }
  var digits = parseJid(trimmed);
  if (!digits || digits.length < 5) return null;
  return digits + '@s.whatsapp.net';
}

module.exports = {
  name: 'getpp',
  alias: ['pfp', 'profilepic', 'avatar', 'pp', '🖼️', '📷'],
  description: 'Fetch and send the profile picture of any contact, group, or tagged user',
  usage: '!getpp [@user | reply | phone_number | group]',
  adminOnly: false,
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
        if (cleanNum.length >= 5) {
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

    await sock.sendPresenceUpdate('composing', sender);

    // Profile Picture retrieval helper with multi-type fallback
    async function fetchPPUrl(rawJid) {
      if (!sock || typeof sock.profilePictureUrl !== 'function') return null;
      var cJid = cleanTargetJid(rawJid);
      if (!cJid) return null;
      try {
        const u = await sock.profilePictureUrl(cJid, 'image');
        if (u) return { url: u, jid: cJid };
      } catch (e1) {}
      try {
        const u = await sock.profilePictureUrl(cJid, 'preview');
        if (u) return { url: u, jid: cJid };
      } catch (e2) {}
      try {
        const u = await sock.profilePictureUrl(cJid);
        if (u) return { url: u, jid: cJid };
      } catch (e3) {}
      return null;
    }

    var resObj = await fetchPPUrl(targetJid);

    // Smart Fallbacks for group chat:
    // If target was caller in group and failed, fallback to group picture
    if (!resObj && isGroup && (!args || !args.trim())) {
      resObj = await fetchPPUrl(sender);
    }
    // If target was group picture and failed, fallback to caller picture
    if (!resObj && isGroup && (!args || !args.trim())) {
      resObj = await fetchPPUrl(senderId);
    }

    if (!resObj || !resObj.url) {
      var displayTag = targetJid.endsWith('@g.us') ? 'Group' : '@' + (parseJid(targetJid) || 'User');
      return sock.sendMessage(sender, {
        text: '❌ Could not retrieve profile picture for ' + displayTag + '.\n\n💡 The contact or group may not have a profile picture set, or privacy settings ("Who can see my profile photo") prevent viewing it.',
        mentions: targetJid.endsWith('@g.us') ? [] : [targetJid]
      });
    }

    var ppUrl = resObj.url;
    var targetJidUsed = resObj.jid;
    var isGroupTarget = targetJidUsed.endsWith('@g.us');
    var targetTag = isGroupTarget ? 'Group' : '@' + parseJid(targetJidUsed);

    try {
      // Download buffer using axios with browser User-Agent headers
      var buffer = null;
      try {
        const res = await axios.get(ppUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          },
          timeout: 12000
        });
        if (res.data && res.data.length > 0) {
          buffer = Buffer.from(res.data);
        }
      } catch (eAxios) {
        console.warn('[getpp Axios Warning]', eAxios.message);
        try {
          var res2 = await fetch(ppUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          });
          if (res2.ok) {
            var arrBuf = await res2.arrayBuffer();
            buffer = Buffer.from(arrBuf);
          }
        } catch (eFetch) {}
      }

      if (buffer && buffer.length > 0) {
        await sock.sendMessage(sender, {
          image: buffer,
          caption: '📷 *Profile Picture of:* ' + targetTag,
          mentions: isGroupTarget ? [] : [targetJidUsed]
        });
      } else {
        await sock.sendMessage(sender, {
          image: { url: ppUrl },
          caption: '📷 *Profile Picture of:* ' + targetTag,
          mentions: isGroupTarget ? [] : [targetJidUsed]
        });
      }
    } catch (err) {
      console.error('[getpp Send Error]', err.message);
      await sock.sendMessage(sender, { text: '❌ Failed to send profile picture: ' + err.message });
    }
  },
};

