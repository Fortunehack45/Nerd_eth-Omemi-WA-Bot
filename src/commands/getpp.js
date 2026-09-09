const { parseJid } = require('../utils/helpers');
const axios = require('axios');

function cleanTargetJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  var trimmed = jid.trim();

  // 1. Group JID
  if (trimmed.endsWith('@g.us')) {
    var gDigits = trimmed.split('@')[0].replace(/[^0-9]/g, '');
    return gDigits ? (gDigits + '@g.us') : null;
  }

  // 2. LID JID (WhatsApp Linked Device / User LID)
  if (trimmed.endsWith('@lid')) {
    var lidDigits = trimmed.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    return lidDigits ? (lidDigits + '@lid') : null;
  }

  // 3. Standard Phone JID
  var digits = parseJid(trimmed);
  if (!digits || digits.length < 5) return null;
  return digits + '@s.whatsapp.net';
}

module.exports = {
  name: 'getpp',
  alias: ['pfp', 'profilepic', 'avatar', 'pp', '🖼️', '📷'],
  description: 'Fetch and send the profile picture of any contact, group, or tagged user',
  usage: '!getpp [@user | reply | phone_number | group | me]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var senderId = ctx.senderId;
    var isGroup = ctx.isGroup;
    var botJid = sock?.user?.id || sock?.user?.jid || '';
    var targetJid = null;

    // Extract contextInfo from message payload if present (including ephemeral wrappers)
    var inner = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message;
    var contextInfo = inner?.extendedTextMessage?.contextInfo ||
                      inner?.imageMessage?.contextInfo ||
                      inner?.videoMessage?.contextInfo ||
                      inner?.documentMessage?.contextInfo ||
                      inner?.stickerMessage?.contextInfo ||
                      inner?.audioMessage?.contextInfo ||
                      msg.message?.extendedTextMessage?.contextInfo;

    var mentionedJids = contextInfo?.mentionedJid || ctx.mentionedJids || [];
    var quotedParticipant = contextInfo?.participant || ctx.quoted?.participant || ctx.quoted?.key?.participant;

    // 1. Quoted message participant (swiping to reply to a user's message)
    if (quotedParticipant) {
      targetJid = quotedParticipant;
    }
    // 2. Mentioned JIDs (@user tag)
    else if (mentionedJids && mentionedJids.length > 0) {
      targetJid = mentionedJids[0];
    }
    // 3. Check text args
    else if (args && args.trim()) {
      var cleanArgs = args.trim().toLowerCase();
      if (cleanArgs === 'group' || cleanArgs === 'gc' || cleanArgs === 'g') {
        targetJid = sender;
      } else if (cleanArgs === 'me' || cleanArgs === 'myself' || cleanArgs === 'bot') {
        targetJid = botJid || senderId;
      } else {
        var cleanNum = args.replace(/[^0-9]/g, '');
        if (cleanNum.length >= 5) {
          targetJid = cleanNum + '@s.whatsapp.net';
        }
      }
    }
    // 4. In group chat without mention or reply: guide admin on how to target
    else if (isGroup) {
      return sock.sendMessage(sender, {
        text: '💡 *How to use !getpp in groups:*\n• Swipe / reply to any user message and type `!getpp`\n• Tag a user: `!getpp @user`\n• Phone number: `!getpp 23480...`\n• Group icon: `!getpp group`\n• Your own profile: `!getpp me`'
      });
    }
    // 5. Fallback in private DM: default to contact
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

      console.log('[getpp Debug] Querying profilePictureUrl for JID:', cJid);

      // Strategy 1: High-Res 'image'
      try {
        const u = await sock.profilePictureUrl(cJid, 'image');
        if (u) {
          console.log('[getpp Debug] High-res image URL retrieved successfully for:', cJid);
          return { url: u, jid: cJid };
        }
      } catch (e1) {
        console.log('[getpp Debug] High-res query failed for ' + cJid + ':', e1.message);
      }

      // Strategy 2: 'preview' Thumbnail
      try {
        const u = await sock.profilePictureUrl(cJid, 'preview');
        if (u) {
          console.log('[getpp Debug] Preview thumbnail URL retrieved successfully for:', cJid);
          return { url: u, jid: cJid };
        }
      } catch (e2) {
        console.log('[getpp Debug] Preview query failed for ' + cJid + ':', e2.message);
      }

      // Strategy 3: Default query without type argument
      try {
        const u = await sock.profilePictureUrl(cJid);
        if (u) {
          console.log('[getpp Debug] Default URL retrieved successfully for:', cJid);
          return { url: u, jid: cJid };
        }
      } catch (e3) {
        console.log('[getpp Debug] Default query failed for ' + cJid + ':', e3.message);
      }

      // Strategy 4: If @lid failed, try phone JID @s.whatsapp.net
      if (cJid.endsWith('@lid')) {
        var numDigits = parseJid(rawJid);
        if (numDigits && numDigits.length >= 7) {
          var altJid = numDigits + '@s.whatsapp.net';
          try {
            const u = await sock.profilePictureUrl(altJid, 'image');
            if (u) return { url: u, jid: altJid };
          } catch (e4) {}
          try {
            const u = await sock.profilePictureUrl(altJid, 'preview');
            if (u) return { url: u, jid: altJid };
          } catch (e5) {}
        }
      }

      return null;
    }

    var resObj = await fetchPPUrl(targetJid);

    // Smart Fallbacks:
    // If target was caller in group and failed, try group picture
    if (!resObj && isGroup && (!args || !args.trim())) {
      console.log('[getpp Debug] Caller picture failed, attempting group picture fallback...');
      resObj = await fetchPPUrl(sender);
    }
    // If target was group picture and failed, try caller picture
    if (!resObj && isGroup && (!args || !args.trim())) {
      console.log('[getpp Debug] Group picture failed, attempting caller picture fallback...');
      resObj = await fetchPPUrl(senderId);
    }
    // If private DM contact picture failed, try bot's own profile picture
    if (!resObj && !isGroup && botJid) {
      console.log('[getpp Debug] DM contact picture failed, attempting bot profile picture fallback...');
      resObj = await fetchPPUrl(botJid);
    }

    if (!resObj || !resObj.url) {
      var displayTag = targetJid.endsWith('@g.us') ? 'Group' : '@' + (parseJid(targetJid) || 'User');
      return sock.sendMessage(sender, {
        text: '❌ Could not retrieve profile picture for ' + displayTag + '.\n\n💡 The contact or group may not have a profile picture set, or their privacy settings ("Who can see my profile photo") prevent viewing it.',
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
          timeout: 15000
        });
        if (res.data && res.data.length > 0) {
          buffer = Buffer.from(res.data);
          console.log('[getpp Debug] Downloaded image buffer via axios (' + buffer.length + ' bytes)');
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
            console.log('[getpp Debug] Downloaded image buffer via fetch (' + buffer.length + ' bytes)');
          }
        } catch (eFetch) {}
      }

      if (buffer && buffer.length > 0) {
        await sock.sendMessage(sender, {
          image: buffer,
          caption: '📷 *Profile Picture of:* ' + targetTag,
          mentions: isGroupTarget ? [] : [targetJidUsed]
        });
        console.log('[getpp Debug] Sent profile picture buffer successfully to:', sender);
      } else {
        await sock.sendMessage(sender, {
          image: { url: ppUrl },
          caption: '📷 *Profile Picture of:* ' + targetTag,
          mentions: isGroupTarget ? [] : [targetJidUsed]
        });
        console.log('[getpp Debug] Sent profile picture URL successfully to:', sender);
      }
    } catch (err) {
      console.error('[getpp Send Error]', err.message);
      await sock.sendMessage(sender, { text: '❌ Failed to send profile picture: ' + err.message });
    }
  },
};

