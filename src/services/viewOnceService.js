const fs = require('fs');
const path = require('path');
const { normalizeMessageContent, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { saveJson, loadJson, sanitizeFileName, parseJid } = require('../utils/helpers');
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

// Helper to recursively unwrap nested protocol wrappers (ephemeral, viewOnce, viewOnceV2, etc.)
function unwrapMessageContent(m) {
  if (!m) return null;
  var target = m;
  for (var i = 0; i < 5; i++) {
    if (target?.ephemeralMessage?.message) target = target.ephemeralMessage.message;
    else if (target?.viewOnceMessage?.message) target = target.viewOnceMessage.message;
    else if (target?.viewOnceMessageV2?.message) target = target.viewOnceMessageV2.message;
    else if (target?.viewOnceMessageV2Extension?.message) target = target.viewOnceMessageV2Extension.message;
    else if (target?.documentWithCaptionMessage?.message) target = target.documentWithCaptionMessage.message;
    else {
      var n = normalizeMessageContent(target);
      if (n && n !== target) target = n;
      else break;
    }
  }
  return target;
}

// Extract the actual inner media message from the view-once wrapper
function getViewOnceContent(msg) {
  if (!msg || !msg.message) return null;
  var target = unwrapMessageContent(msg.message);
  if (!target) return null;

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

    // Priority 1: Direct stream decoding via downloadContentFromMessage (fastest & most reliable)
    try {
      const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
      var mediaObj = extracted.inner?.[innerType];
      if (mediaObj) {
        var rawType = innerType.replace('Message', '');
        var stream = await downloadContentFromMessage(mediaObj, rawType);
        var chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
      }
    } catch (eStream) {}

    // Priority 2: Fallback to Baileys downloadMediaMessage
    if (!buffer || buffer.length === 0) {
      try {
        buffer = await downloadMediaMessage(
          innerMsg,
          'buffer',
          {},
          { reuploadRequest: sock?.updateMediaMessage }
        );
      } catch (e1) {
        try {
          buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { reuploadRequest: sock?.updateMediaMessage }
          );
        } catch (e2) {
          if (sock && typeof sock.downloadMediaMessage === 'function') {
            try {
              buffer = await sock.downloadMediaMessage(innerMsg);
            } catch (e3) {
              try {
                buffer = await sock.downloadMediaMessage(msg);
              } catch (e4) {}
            }
          }
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

function getOwnerJid(sock) {
  var raw = sock?.user?.id || sock?.user?.jid || (config.admins && config.admins[0]) || config.ownerNumber || '';
  var clean = parseJid(raw);
  return clean ? (clean + '@s.whatsapp.net') : null;
}

function detectTypeFromBufferOrFile(buffer, filePath, fallbackType) {
  if (fallbackType && fallbackType !== 'unknown' && fallbackType !== 'media') return fallbackType;
  var ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') return 'image';
  if (ext === '.mp4' || ext === '.mkv' || ext === '.mov' || ext === '.avi') return 'video';
  if (ext === '.ogg' || ext === '.opus' || ext === '.mp3' || ext === '.m4a' || ext === '.wav') return 'audio';
  if (ext === '.pdf' || ext === '.doc' || ext === '.docx' || ext === '.zip') return 'document';

  if (buffer && buffer.length >= 4) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image';
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return 'audio';
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return 'audio';
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && (buffer[3] === 0x18 || buffer[3] === 0x1c || buffer[3] === 0x20)) return 'video';
  }
  return fallbackType || 'image';
}

// ─── Helper: Send a saved media item object ────────────────────────────────
async function sendMediaItem(sock, jid, item) {
  if (!item || !item.filePath || !fs.existsSync(item.filePath)) return false;
  var buffer = fs.readFileSync(item.filePath);
  var realType = detectTypeFromBufferOrFile(buffer, item.filePath, item.mediaType);

  var caption = [
    '📸 *View-Once Media Revealed*',
    '▸ From: ' + (item.senderName || item.sender || 'Unknown'),
    '▸ Type: ' + realType.toUpperCase(),
    '▸ ID: `' + item.id + '`',
    '▸ Saved: ' + new Date(item.timestamp || Date.now()).toLocaleString(),
    item.caption ? '▸ Caption: ' + item.caption : '',
  ].filter(Boolean).join('\n');

  return await sendBuffer(sock, jid, buffer, realType, caption, item);
}

// ─── Helper: Send a raw buffer as media ───────────────────────────────────
async function sendBuffer(sock, jid, buffer, mediaType, caption, item) {
  try {
    var realType = detectTypeFromBufferOrFile(buffer, item?.filePath, mediaType);

    if (realType === 'image') {
      await sock.sendMessage(jid, { image: buffer, caption: caption });
    } else if (realType === 'video') {
      await sock.sendMessage(jid, { video: buffer, caption: caption });
    } else if (realType === 'audio' || realType === 'voice') {
      var isPtt = (realType === 'voice' || (item && item.ptt === true));
      var mime = isPtt ? 'audio/ogg; codecs=opus' : ((item && item.mimetype) || 'audio/mp4');
      await sock.sendMessage(jid, {
        audio: buffer,
        mimetype: mime,
        ptt: isPtt,
      });
      if (caption) {
        await sock.sendMessage(jid, { text: caption });
      }
    } else if (realType === 'document') {
      await sock.sendMessage(jid, {
        document: buffer,
        fileName: (item && item.fileName) || 'document.bin',
        caption: caption,
      });
    } else {
      await sock.sendMessage(jid, { image: buffer, caption: caption });
    }
    return true;
  } catch (err) {
    console.error('[ViewOnce Send Error]', err.message);
    try {
      await sock.sendMessage(jid, { text: '❌ Failed to send media: ' + err.message });
    } catch (e) {}
    return false;
  }
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
  getOwnerJid,
  sendMediaItem,
  sendBuffer,
};
