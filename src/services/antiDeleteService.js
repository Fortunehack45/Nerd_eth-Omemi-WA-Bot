const path = require('path');
const fs = require('fs');
const { loadJson, saveJson, parseJid } = require('../utils/helpers');
const { downloadContentFromMessage, normalizeMessageContent } = require('@whiskeysockets/baileys');

const ANTIDELETE_FILE = path.join(__dirname, '..', '..', 'storage', 'antidelete.json');

// In-memory message store for recent messages (up to 2000 items)
const messageCache = new Map();
const MAX_CACHE_SIZE = 2000;

function getConfig() {
  const dir = path.dirname(ANTIDELETE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return loadJson(ANTIDELETE_FILE, {
    enabled: true,
    forwardToOwner: true,
    notifyChat: false,
    savedCount: 0,
    recentDeleted: []
  });
}

function saveConfig(data) {
  saveJson(ANTIDELETE_FILE, data);
}

function isAntiDeleteEnabled() {
  return getConfig().enabled === true;
}

function setAntiDeleteEnabled(enabled, opts) {
  const cfg = getConfig();
  cfg.enabled = !!enabled;
  if (opts) {
    if (opts.forwardToOwner !== undefined) cfg.forwardToOwner = !!opts.forwardToOwner;
    if (opts.notifyChat !== undefined) cfg.notifyChat = !!opts.notifyChat;
  }
  saveConfig(cfg);
  return cfg;
}

function getOwnerJid(sock) {
  const config = require('../../config');
  const raw = sock?.user?.id || sock?.user?.jid || (config.admins && config.admins[0]) || config.ownerNumber || '';
  const clean = parseJid(raw);
  return clean ? (clean + '@s.whatsapp.net') : null;
}

function unwrapMessageContent(content) {
  if (!content) return { norm: content, isViewOnce: false };
  var isViewOnce = !!(
    content.viewOnceMessage ||
    content.viewOnceMessageV2 ||
    content.viewOnceMessageV2Extension ||
    content.imageMessage?.viewOnce ||
    content.videoMessage?.viewOnce ||
    content.audioMessage?.viewOnce
  );

  var norm = normalizeMessageContent(content) || content;
  if (norm.viewOnceMessage?.message) {
    isViewOnce = true;
    norm = normalizeMessageContent(norm.viewOnceMessage.message) || norm.viewOnceMessage.message;
  } else if (norm.viewOnceMessageV2?.message) {
    isViewOnce = true;
    norm = normalizeMessageContent(norm.viewOnceMessageV2.message) || norm.viewOnceMessageV2.message;
  } else if (norm.viewOnceMessageV2Extension?.message) {
    isViewOnce = true;
    norm = normalizeMessageContent(norm.viewOnceMessageV2Extension.message) || norm.viewOnceMessageV2Extension.message;
  }

  return { norm, isViewOnce };
}

/**
 * Cache incoming message so it can be recovered if deleted
 */
function cacheMessage(msg, sock) {
  if (!msg || !msg.key || !msg.key.id) return;

  const msgId = msg.key.id;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const chatJid = msg.key.remoteJid;
  const pushName = msg.pushName || 'User';

  const { norm, isViewOnce } = unwrapMessageContent(msg.message);

  const messageText = norm?.conversation
    || norm?.extendedTextMessage?.text
    || norm?.imageMessage?.caption
    || norm?.videoMessage?.caption
    || norm?.documentMessage?.caption
    || '';

  // Extract raw message payload
  const content = msg.message;

  const cacheItem = {
    id: msgId,
    key: msg.key,
    senderJid,
    chatJid,
    pushName,
    text: messageText,
    content,
    unwrappedContent: norm,
    isViewOnce,
    savedBuffer: null,
    rawType: null,
    timestamp: Date.now(),
  };

  messageCache.set(msgId, cacheItem);

  if (messageCache.size > MAX_CACHE_SIZE) {
    const oldestKey = messageCache.keys().next().value;
    messageCache.delete(oldestKey);
  }

  // Pre-download media buffer in background so media deletion & View-Once is 100% recoverable
  try {
    const mediaObj = norm?.imageMessage || norm?.videoMessage || norm?.audioMessage || norm?.documentMessage || norm?.stickerMessage;
    if (mediaObj && sock) {
      const rawType = norm.imageMessage ? 'image' : (norm.videoMessage ? 'video' : (norm.audioMessage ? 'audio' : (norm.documentMessage ? 'document' : 'sticker')));
      downloadContentFromMessage(mediaObj, rawType).then(async (stream) => {
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        if (buf && buf.length > 0) {
          cacheItem.savedBuffer = buf;
          cacheItem.rawType = rawType;
        }
      }).catch(function() {});
    }
  } catch (e) {}
}

/**
 * Handle message deletion (protocolMessage REVOKE)
 */
async function handleRevokeMessage(sock, msg) {
  if (!isAntiDeleteEnabled()) return false;

  const protocolMsg = msg.message?.protocolMessage;
  if (!protocolMsg) return false;

  // Protocol message type 0 = REVOKE
  const isRevoke = protocolMsg.type === 0 || protocolMsg.type === 1 || protocolMsg.type === 'REVOKE';
  if (!isRevoke) return false;

  const deletedId = protocolMsg.key?.id;
  if (!deletedId) return false;

  // Find original cached message
  let original = messageCache.get(deletedId);
  if (!original && global.msgStore && global.msgStore.has(deletedId)) {
    const rawMsg = global.msgStore.get(deletedId);
    original = {
      id: deletedId,
      key: protocolMsg.key,
      senderJid: protocolMsg.key?.participant || msg.key?.remoteJid,
      chatJid: msg.key?.remoteJid,
      pushName: msg.pushName || 'User',
      text: rawMsg.conversation || rawMsg.extendedTextMessage?.text || rawMsg.imageMessage?.caption || '',
      content: rawMsg,
      timestamp: Date.now(),
    };
  }

  if (!original) {
    console.log('[AntiDelete] Revoke detected for message ' + deletedId + ', but content was not in cache.');
    return false;
  }

  const senderNum = parseJid(original.senderJid);
  const ownerJid = getOwnerJid(sock) || msg.key?.remoteJid;
  const isGroup = original.chatJid.endsWith('@g.us');

  let header = original.isViewOnce
    ? '👁️ *ANTI-DELETE: Deleted View-Once Message Recovered!*\n\n'
    : '🗑️ *ANTI-DELETE: Deleted Message Recovered!*\n\n';
  header += '👤 *Sender:* @' + senderNum + ' (' + (original.pushName || 'Unknown') + ')\n';
  header += '💬 *Chat:* ' + (isGroup ? 'Group Chat' : 'Private DM') + '\n';
  header += '🕐 *Time Sent:* ' + new Date(original.timestamp).toLocaleTimeString() + '\n';
  header += '🕐 *Time Deleted:* ' + new Date().toLocaleTimeString() + '\n\n';

  const { norm } = unwrapMessageContent(original.content);
  const mediaObj = norm?.imageMessage || norm?.videoMessage || norm?.audioMessage || norm?.documentMessage || norm?.stickerMessage;

  const cfg = getConfig();
  cfg.savedCount = (cfg.savedCount || 0) + 1;
  cfg.recentDeleted = cfg.recentDeleted || [];
  cfg.recentDeleted.unshift({
    id: deletedId,
    sender: senderNum,
    text: original.text || (mediaObj ? '[Media]' : 'Empty'),
    timestamp: Date.now()
  });
  if (cfg.recentDeleted.length > 20) cfg.recentDeleted = cfg.recentDeleted.slice(0, 20);
  saveConfig(cfg);

  try {
    // Target delivery list
    const targets = [];
    if (cfg.forwardToOwner && ownerJid) targets.push(ownerJid);
    if (cfg.notifyChat || !targets.length) {
      if (!targets.includes(original.chatJid)) targets.push(original.chatJid);
    }

    // If text message
    if (original.text && !mediaObj) {
      const fullText = header + '📝 *Original Message:*\n' + original.text;
      for (const targetJid of targets) {
        await sock.sendMessage(targetJid, { text: fullText, mentions: [original.senderJid] }).catch(function() {});
      }
      console.log('[AntiDelete] Recovered deleted text message from ' + senderNum);
      return true;
    }

    // If media message (image/video/audio/document/sticker)
    if (mediaObj) {
      const mediaTypeKey = norm.imageMessage ? 'imageMessage' : (norm.videoMessage ? 'videoMessage' : (norm.audioMessage ? 'audioMessage' : (norm.documentMessage ? 'documentMessage' : 'stickerMessage')));
      const rawType = mediaTypeKey.replace('Message', '');
      const captionText = header + (original.text ? '📝 *Caption:*\n' + original.text : '📦 *Type:* ' + rawType.toUpperCase());

      try {
        let buffer = original.savedBuffer;
        if (!buffer || !buffer.length) {
          const stream = await downloadContentFromMessage(mediaObj, rawType);
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          buffer = Buffer.concat(chunks);
        }

        if (buffer && buffer.length > 0) {
          for (const targetJid of targets) {
            if (rawType === 'image') {
              await sock.sendMessage(targetJid, { image: buffer, caption: captionText, mentions: [original.senderJid] }).catch(function() {});
            } else if (rawType === 'video') {
              await sock.sendMessage(targetJid, { video: buffer, caption: captionText, mentions: [original.senderJid] }).catch(function() {});
            } else if (rawType === 'audio') {
              await sock.sendMessage(targetJid, { audio: buffer, mimetype: 'audio/mp4', ptt: true }).catch(function() {});
              await sock.sendMessage(targetJid, { text: captionText, mentions: [original.senderJid] }).catch(function() {});
            } else if (rawType === 'sticker') {
              await sock.sendMessage(targetJid, { sticker: buffer }).catch(function() {});
              await sock.sendMessage(targetJid, { text: captionText, mentions: [original.senderJid] }).catch(function() {});
            } else {
              await sock.sendMessage(targetJid, { document: buffer, mimetype: 'application/octet-stream', fileName: 'recovered_media', caption: captionText, mentions: [original.senderJid] }).catch(function() {});
            }
          }
          console.log('[AntiDelete] Recovered deleted ' + rawType + ' media from ' + senderNum);
          return true;
        }
      } catch (e1) {
        console.error('[AntiDelete Media Download Error]', e1.message);
      }

      // Fallback if media download failed
      const fallbackText = header + '⚠️ *Original message contained media (' + rawType + '), but buffer download expired.*\n' + (original.text ? '📝 *Caption:* ' + original.text : '');
      for (const targetJid of targets) {
        await sock.sendMessage(targetJid, { text: fallbackText, mentions: [original.senderJid] }).catch(function() {});
      }
      return true;
    }

    // Default text fallback
    const textFallback = header + '📝 *Original Message:*\n' + (original.text || 'Non-text message content');
    for (const targetJid of targets) {
      await sock.sendMessage(targetJid, { text: textFallback, mentions: [original.senderJid] }).catch(function() {});
    }
    return true;
  } catch (err) {
    console.error('[AntiDelete Error]', err.message);
    return false;
  }
}

module.exports = {
  getConfig,
  saveConfig,
  isAntiDeleteEnabled,
  setAntiDeleteEnabled,
  cacheMessage,
  handleRevokeMessage,
};
