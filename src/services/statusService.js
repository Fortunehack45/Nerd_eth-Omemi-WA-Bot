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
    await sock.sendMessage('status@broadcast', { text: text });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  saveAndForwardStatus,
  downloadStatusBuffer,
  sendStatus,
};
