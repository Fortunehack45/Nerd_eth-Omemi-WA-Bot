const fs = require('fs');
const path = require('path');
const { downloadMediaMessage, downloadContentFromMessage, normalizeMessageContent } = require('@whiskeysockets/baileys');
const { saveJson, loadJson, sanitizeFileName, parseJid } = require('../utils/helpers');

const SAVE_DIR = path.join(__dirname, '..', '..', 'storage', 'status');
const INDEX_FILE = path.join(SAVE_DIR, 'index.json');

function ensureDirs() {
  if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });
}

function getIndex() {
  ensureDirs();
  return loadJson(INDEX_FILE, []);
}

function saveIndex(index) {
  saveJson(INDEX_FILE, index);
}

function getOwnerJid(sock) {
  var config = require('../../config');
  var raw = sock?.user?.id || sock?.user?.jid || (config.admins && config.admins[0]) || config.ownerNumber || '';
  var clean = parseJid(raw);
  return clean ? (clean + '@s.whatsapp.net') : null;
}

async function downloadStatusBuffer(sock, targetMsgKey, content) {
  if (!content) return null;

  var norm = normalizeMessageContent(content) || content;
  if (norm.ephemeralMessage?.message) norm = normalizeMessageContent(norm.ephemeralMessage.message) || norm.ephemeralMessage.message;
  if (norm.viewOnceMessage?.message) norm = normalizeMessageContent(norm.viewOnceMessage.message) || norm.viewOnceMessage.message;
  if (norm.viewOnceMessageV2?.message) norm = normalizeMessageContent(norm.viewOnceMessageV2.message) || norm.viewOnceMessageV2.message;
  if (norm.documentWithCaptionMessage?.message) norm = normalizeMessageContent(norm.documentWithCaptionMessage.message) || norm.documentWithCaptionMessage.message;

  var mediaObj = norm.imageMessage || norm.videoMessage || norm.audioMessage || norm.documentMessage;
  if (!mediaObj) return null;

  var mediaTypeKey = norm.imageMessage ? 'imageMessage' : (norm.videoMessage ? 'videoMessage' : (norm.audioMessage ? 'audioMessage' : 'documentMessage'));
  var singleMsg = {};
  singleMsg[mediaTypeKey] = mediaObj;

  // Attempt 1: Fast direct stream decoding from media object payload
  try {
    var rawType = mediaTypeKey.replace('Message', '');
    var stream = await downloadContentFromMessage(mediaObj, rawType);
    var chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    var buf1 = Buffer.concat(chunks);
    if (buf1 && buf1.length > 0) return buf1;
  } catch (e1) {}

  // Attempt 2: Standard downloadMediaMessage
  try {
    var buf2 = await downloadMediaMessage(
      { key: targetMsgKey, message: norm },
      'buffer',
      {},
      { logger: console, reuploadRequest: sock?.updateMediaMessage }
    );
    if (buf2 && buf2.length > 0) return buf2;
  } catch (e2) {}

  // Attempt 3: downloadMediaMessage with singleMsg container
  try {
    var buf3 = await downloadMediaMessage(
      { key: targetMsgKey, message: singleMsg },
      'buffer',
      {},
      { logger: console, reuploadRequest: sock?.updateMediaMessage }
    );
    if (buf3 && buf3.length > 0) return buf3;
  } catch (e3) {}

  // Attempt 4: sock.downloadMediaMessage
  if (sock && typeof sock.downloadMediaMessage === 'function') {
    try {
      var buf4 = await sock.downloadMediaMessage({ key: targetMsgKey, message: norm });
      if (buf4 && buf4.length > 0) return buf4;
    } catch (e4) {}
    try {
      var buf5 = await sock.downloadMediaMessage({ key: targetMsgKey, message: singleMsg });
      if (buf5 && buf5.length > 0) return buf5;
    } catch (e5) {}
  }

  return null;
}

async function saveAndForwardStatus(sock, targetMsgKey, quotedMsg, pushName) {
  try {
    ensureDirs();
    var norm = normalizeMessageContent(quotedMsg) || quotedMsg;
    if (norm.ephemeralMessage?.message) norm = normalizeMessageContent(norm.ephemeralMessage.message) || norm.ephemeralMessage.message;
    if (norm.viewOnceMessage?.message) norm = normalizeMessageContent(norm.viewOnceMessage.message) || norm.viewOnceMessage.message;
    if (norm.viewOnceMessageV2?.message) norm = normalizeMessageContent(norm.viewOnceMessageV2.message) || norm.viewOnceMessageV2.message;

    if (!norm) return false;

    var mediaType = 'text';
    var inner = null;

    if (norm.imageMessage) {
      mediaType = 'image';
      inner = norm.imageMessage;
    } else if (norm.videoMessage) {
      mediaType = 'video';
      inner = norm.videoMessage;
    } else if (norm.audioMessage) {
      mediaType = 'audio';
      inner = norm.audioMessage;
    } else if (norm.conversation || norm.extendedTextMessage) {
      mediaType = 'text';
      inner = norm;
    }

    var senderJid = targetMsgKey?.participant || targetMsgKey?.remoteJid || 'Unknown';
    var cleanSender = parseJid(senderJid);
    var senderName = pushName || cleanSender;
    var caption = inner?.caption || norm?.extendedTextMessage?.text || norm?.conversation || '';

    var ownerJid = getOwnerJid(sock);
    if (!ownerJid) return false;

    var timestamp = Date.now();

    if (mediaType === 'text') {
      var header = [
        '📱 *WhatsApp Status Saved*',
        '▸ From: ' + senderName + ' (' + cleanSender + ')',
        '▸ Type: TEXT STATUS',
        '▸ Saved: ' + new Date(timestamp).toLocaleString(),
        '',
        '💬 *Status Text:*',
        caption || 'No text content',
      ].join('\n');

      await sock.sendMessage(ownerJid, { text: header });
      console.log('[StatusSaver] Text status from ' + senderName + ' sent to owner self-chat');
      return true;
    }

    // Download Media Status (Image, Video, Audio)
    var buffer = await downloadStatusBuffer(sock, targetMsgKey, norm);

    if (!buffer || buffer.length === 0) {
      console.error('[StatusSaver Error] Failed to download media buffer for status');
      return false;
    }

    var extMap = { image: '.jpg', video: '.mp4', audio: '.ogg' };
    var ext = extMap[mediaType] || '.bin';
    var fileName = timestamp + '_' + sanitizeFileName(senderName) + ext;
    var filePath = path.join(SAVE_DIR, fileName);

    fs.writeFileSync(filePath, buffer);

    var statusCaption = [
      '📱 *WhatsApp Status Saved*',
      '▸ From: ' + senderName + ' (' + cleanSender + ')',
      '▸ Type: ' + mediaType.toUpperCase(),
      '▸ Saved: ' + new Date(timestamp).toLocaleString(),
      caption ? '▸ Caption: ' + caption : '',
    ].filter(Boolean).join('\n');

    if (mediaType === 'image') {
      await sock.sendMessage(ownerJid, { image: buffer, caption: statusCaption });
    } else if (mediaType === 'video') {
      await sock.sendMessage(ownerJid, { video: buffer, caption: statusCaption });
    } else if (mediaType === 'audio') {
      await sock.sendMessage(ownerJid, { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true });
      await sock.sendMessage(ownerJid, { text: statusCaption });
    }

    // Save to index
    var index = getIndex();
    index.push({
      id: timestamp,
      fileName: fileName,
      filePath: filePath,
      mediaType: mediaType,
      sender: cleanSender,
      senderName: senderName,
      caption: caption,
      timestamp: timestamp,
    });
    saveIndex(index);

    console.log('[StatusSaver] ' + mediaType + ' status from ' + senderName + ' saved and forwarded to owner self-chat');
    return true;
  } catch (err) {
    console.error('[StatusSaver Error]', err.message);
    return false;
  }
}

async function sendStatus(sock, text) {
  try {
    if (!sock) return { success: false, error: 'WhatsApp client is not connected' };
    const colors = ['#1f2937', '#111827', '#0f172a', '#1e1b4b', '#311b92', '#1a237e', '#004d40', '#4a148c', '#880e4f', '#3e2723', '#264653', '#2a9d8f', '#e76f51'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    await sock.sendMessage('status@broadcast', {
      text: text,
      backgroundColor: randomColor,
      font: Math.floor(Math.random() * 5) + 1
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendMediaStatus(sock, buffer, mediaType, caption) {
  try {
    if (!sock) return { success: false, error: 'WhatsApp client is not connected' };
    if (!buffer || !buffer.length) return { success: false, error: 'Empty media buffer' };

    if (mediaType === 'image') {
      await sock.sendMessage('status@broadcast', { image: buffer, caption: caption || '' });
    } else if (mediaType === 'video') {
      await sock.sendMessage('status@broadcast', { video: buffer, caption: caption || '' });
    } else if (mediaType === 'audio') {
      await sock.sendMessage('status@broadcast', { audio: buffer, mimetype: 'audio/mp4', ptt: true });
    } else {
      return { success: false, error: 'Unsupported media type for status: ' + mediaType };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function autoViewStatus(sock, statusMsg) {
  var config = require('../../config');
  if (config.status?.autoView === false) return false;
  if (!statusMsg || !statusMsg.key || !sock) return false;

  try {
    const rawParticipant = statusMsg.key.participant || statusMsg.key.remoteJid || '';
    const cleanNum = parseJid(rawParticipant);
    const cleanParticipant = cleanNum ? (cleanNum + '@s.whatsapp.net') : rawParticipant;

    const statusKey = {
      remoteJid: 'status@broadcast',
      id: statusMsg.key.id,
      participant: cleanParticipant,
      fromMe: false
    };

    if (typeof sock.readMessages === 'function') {
      await sock.readMessages([statusKey]);
    } else if (typeof sock.sendReceipt === 'function') {
      await sock.sendReceipt('status@broadcast', cleanParticipant, [statusMsg.key.id], 'read');
    }
    console.log('[AutoViewStatus] 👁️ Auto-viewed WhatsApp Status from: @' + cleanNum);
    return true;
  } catch (err) {
    console.error('[AutoViewStatus Error]', err.message);
  }
  return false;
}

const STATUS_LIKE_EMOJIS = ['💚', '❤️', '🔥', '👍', '👏', '😍', '💯', '✨', '🎉', '😎', '🙌', '💫', '🌟', '🥰', '🤩', '💥'];

async function autoLikeStatus(sock, statusMsg) {
  var config = require('../../config');
  if (config.status?.autoLike === false) return false;
  if (!statusMsg || !statusMsg.key || !sock) return false;

  try {
    const key = statusMsg.key;
    const rawParticipant = key.participant || key.remoteJid || '';
    const cleanNum = parseJid(rawParticipant);
    if (!cleanNum) return false;
    const cleanParticipant = cleanNum + '@s.whatsapp.net';

    const reactionEmoji = STATUS_LIKE_EMOJIS[Math.floor(Math.random() * STATUS_LIKE_EMOJIS.length)];

    const statusKey = {
      remoteJid: 'status@broadcast',
      id: key.id,
      participant: cleanParticipant,
      fromMe: false
    };

    // Strategy 1: Standard Baileys status reaction with statusJidList
    try {
      await sock.sendMessage(
        'status@broadcast',
        { react: { text: reactionEmoji, key: statusKey } },
        { statusJidList: [cleanParticipant] }
      );
      console.log('[AutoLikeStatus] ' + reactionEmoji + ' Auto-liked status from: @' + cleanNum);
      return true;
    } catch (e1) {
      // Strategy 2: Direct participant reaction fallback
      try {
        await sock.sendMessage(cleanParticipant, { react: { text: reactionEmoji, key: statusKey } });
        console.log('[AutoLikeStatus] ' + reactionEmoji + ' Auto-liked (direct) from: @' + cleanNum);
        return true;
      } catch (e2) {
        console.error('[AutoLikeStatus] Both strategies failed:', e1.message, '|', e2.message);
      }
    }
  } catch (err) {
    console.error('[AutoLikeStatus Error]', err.message);
  }
  return false;
}

module.exports = {
  saveAndForwardStatus,
  downloadStatusBuffer,
  sendStatus,
  sendMediaStatus,
  autoViewStatus,
  autoLikeStatus,
};
