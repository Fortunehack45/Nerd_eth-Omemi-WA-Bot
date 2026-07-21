const fs = require('fs');
const path = require('path');
const { normalizeMessageContent, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { saveJson, loadJson, sanitizeFileName } = require('../utils/helpers');
const config = require('../../config');

const SAVE_DIR = path.join(__dirname, '..', '..', 'storage', 'viewonce');
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

// Detect ALL view-once message types (including v1, v2, v2Extension, ephemeral, & flag properties)
function detectViewOnce(msg) {
  if (!msg || !msg.message) return false;
  var m = msg.message;
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

  if (m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension) return true;

  var norm = normalizeMessageContent(m);
  if (norm) {
    var mediaKeys = ['imageMessage', 'videoMessage', 'audioMessage', 'voiceMessage', 'documentMessage'];
    for (var i = 0; i < mediaKeys.length; i++) {
      var k = mediaKeys[i];
      if (norm[k] && (norm[k].viewOnce || norm[k].viewOnceMessage || norm[k].viewOnceMessageV2)) {
        return true;
      }
    }
  }

  if (m.imageMessage?.viewOnce || m.videoMessage?.viewOnce || m.audioMessage?.viewOnce || m.voiceMessage?.viewOnce) return true;

  return false;
}

// Extract the actual inner media message from the view-once wrapper
function getViewOnceContent(msg) {
  if (!msg || !msg.message) return null;
  var m = msg.message;
  var norm = normalizeMessageContent(m);

  var target = norm || m;
  var innerType = null;
  var mediaKeys = ['imageMessage', 'videoMessage', 'audioMessage', 'voiceMessage', 'documentMessage'];

  for (var i = 0; i < mediaKeys.length; i++) {
    if (target[mediaKeys[i]]) {
      innerType = mediaKeys[i];
      break;
    }
  }

  if (!innerType) return null;

  var mediaMsg = { key: msg.key, message: target };
  return { msg: mediaMsg, innerType: innerType, inner: target };
}

function getMediaType(innerType) {
  if (innerType === 'imageMessage') return 'image';
  if (innerType === 'videoMessage') return 'video';
  if (innerType === 'audioMessage') return 'audio';
  if (innerType === 'voiceMessage') return 'voice';
  if (innerType === 'documentMessage') return 'document';
  return 'unknown';
}

async function saveViewOnce(sock, msg) {
  if (!config.viewOnce.enabled) return null;
  if (msg.key?.fromMe) return null; // Never auto-save own outgoing messages

  var messageId = msg.key?.id || '';

  // DEDUPLICATION CHECK: If this message ID was already saved, return existing entry to prevent loops!
  if (messageId) {
    var existing = findByMessageId(messageId);
    if (existing && fs.existsSync(existing.filePath)) {
      return { success: true, alreadySaved: true, ...existing };
    }
  }

  var extracted = getViewOnceContent(msg);
  if (!extracted) return null;

  var innerMsg = extracted.msg;
  var innerType = extracted.innerType;
  var mediaType = getMediaType(innerType);
  var sender = msg.key.participant || msg.key.remoteJid;
  var senderName = msg.pushName || sender;
  var chatId = msg.key.remoteJid;

  try {
    var buffer = null;

    // 1. Try downloading with original msg object (best for Baileys reupload handling)
    try {
      buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { logger: console, reuploadRequest: sock?.updateMediaMessage }
      );
    } catch (e1) {
      // 2. Fallback to innerMsg
      try {
        buffer = await downloadMediaMessage(
          innerMsg,
          'buffer',
          {},
          { logger: console, reuploadRequest: sock?.updateMediaMessage }
        );
      } catch (e2) {
        // 3. Fallback to sock.downloadMediaMessage if bound
        if (sock && typeof sock.downloadMediaMessage === 'function') {
          try {
            buffer = await sock.downloadMediaMessage(msg);
          } catch (e3) {
            try {
              buffer = await sock.downloadMediaMessage(innerMsg);
            } catch (e4) {
              console.error('[ViewOnce] Download error:', e4.message);
              return { error: 'Media download failed: ' + e4.message };
            }
          }
        } else {
          console.error('[ViewOnce] Download error:', e2.message);
          return { error: 'Media download failed: ' + e2.message };
        }
      }
    }

    if (!buffer || buffer.length === 0) return { error: 'Media download returned empty buffer.' };

    ensureDirs();
    var timestamp = Date.now();
    var extMap = { image: '.jpg', video: '.mp4', audio: '.ogg', voice: '.ogg', document: '.bin' };
    var ext = extMap[mediaType] || '.bin';
    var fileName = timestamp + '_' + sanitizeFileName(senderName) + ext;
    var filePath = path.join(SAVE_DIR, fileName);

    fs.writeFileSync(filePath, buffer);
    var size = buffer.length;
    var innerObj = extracted.inner?.[innerType] || {};
    var caption = innerObj.caption || '';
    var mimetype = innerObj.mimetype || '';
    var ptt = innerObj.ptt || (mediaType === 'voice');

    var index = getIndex();
    var newEntry = {
      id: timestamp,
      messageId: messageId,
      fileName: fileName,
      filePath: filePath,
      mediaType: mediaType,
      mimetype: mimetype,
      ptt: ptt,
      sender: sender,
      senderName: senderName,
      chatId: chatId,
      timestamp: timestamp,
      size: size,
      caption: caption,
    };
    index.push(newEntry);
    saveIndex(index);

    console.log('[ViewOnce] Saved ' + mediaType + ' from ' + senderName + ' (' + (size / 1024).toFixed(1) + 'KB)');
    return { success: true, alreadySaved: false, ...newEntry };
  } catch (err) {
    console.error('[ViewOnce] Save error:', err.message);
    return { error: err.message };
  }
}

function listSavedMedia(limit, type) {
  var index = getIndex();
  var items = index.slice().reverse();
  if (type) items = items.filter(function(i) { return i.mediaType === type; });
  return items.slice(0, limit || 20);
}

function getSavedMedia(id) {
  var index = getIndex();
  return index.find(function(i) { return i.id === parseInt(id) || i.id === id || String(i.id) === String(id); });
}

function getLastSavedMedia() {
  var index = getIndex();
  if (!index || index.length === 0) return null;
  return index[index.length - 1];
}

// Look up a saved view-once by the original WhatsApp message ID (stanzaId from a reply)
function findByMessageId(messageId) {
  if (!messageId) return null;
  var index = getIndex();
  return index.find(function(i) { return i.messageId && i.messageId === messageId; }) || null;
}

// Smart fallback: find recent saved viewonce by chat or sender
function findRecentByChatOrSender(chatId, sender) {
  var index = getIndex();
  if (!index || index.length === 0) return null;
  for (var i = index.length - 1; i >= 0; i--) {
    var item = index[i];
    if (chatId && item.chatId === chatId) return item;
    if (sender && item.sender === sender) return item;
  }
  return null;
}

function deleteSavedMedia(id) {
  var index = getIndex();
  var idx = index.findIndex(function(i) { return i.id === parseInt(id) || i.id === id || String(i.id) === String(id); });
  if (idx === -1) return { error: 'Media not found.' };
  var item = index[idx];
  try { if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath); } catch (e) {}
  index.splice(idx, 1);
  saveIndex(index);
  return { success: true };
}

function getStorageStats() {
  var index = getIndex();
  var totalSize = index.reduce(function(sum, i) { return sum + (i.size || 0); }, 0);
  var byType = {};
  index.forEach(function(i) { byType[i.mediaType] = (byType[i.mediaType] || 0) + 1; });
  return { total: index.length, totalSize: totalSize, byType: byType };
}

module.exports = {
  detectViewOnce,
  saveViewOnce,
  getViewOnceContent,
  listSavedMedia,
  getSavedMedia,
  getLastSavedMedia,
  findByMessageId,
  findRecentByChatOrSender,
  deleteSavedMedia,
  getStorageStats,
};
