const fs = require('fs');
const path = require('path');
const { downloadMediaMessage, normalizeMessageContent } = require('@whiskeysockets/baileys');
const { saveJson, loadJson, sanitizeFileName, parseJid } = require('../utils/helpers');
const { getOwnerJid } = require('./viewOnceService');

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

async function saveAndForwardStatus(sock, targetMsgKey, quotedMsg, pushName) {
  try {
    ensureDirs();
    var norm = normalizeMessageContent(quotedMsg);
    var content = norm || quotedMsg;
    if (!content) return false;

    var mediaType = 'text';
    var inner = null;

    if (content.imageMessage) {
      mediaType = 'image';
      inner = content.imageMessage;
    } else if (content.videoMessage) {
      mediaType = 'video';
      inner = content.videoMessage;
    } else if (content.audioMessage) {
      mediaType = 'audio';
      inner = content.audioMessage;
    } else if (content.conversation || content.extendedTextMessage) {
      mediaType = 'text';
      inner = content;
    }

    var senderJid = targetMsgKey?.participant || targetMsgKey?.remoteJid || 'Unknown';
    var cleanSender = parseJid(senderJid);
    var senderName = pushName || cleanSender;
    var caption = inner?.caption || content?.extendedTextMessage?.text || content?.conversation || '';

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

    // Media Status (Image, Video, Audio)
    var buffer = null;
    var mediaContainer = { key: targetMsgKey, message: content };

    try {
      buffer = await downloadMediaMessage(
        mediaContainer,
        'buffer',
        {},
        { logger: console, reuploadRequest: sock?.updateMediaMessage }
      );
    } catch (e1) {
      try {
        if (sock && typeof sock.downloadMediaMessage === 'function') {
          buffer = await sock.downloadMediaMessage(mediaContainer);
        }
      } catch (e2) {
        console.error('[StatusSaver Download Error]', e2.message);
        return false;
      }
    }

    if (!buffer || buffer.length === 0) return false;

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

module.exports = {
  saveAndForwardStatus,
};
