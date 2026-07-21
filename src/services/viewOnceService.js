const fs = require('fs');
const path = require('path');
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

// Detect ALL view-once message types (Baileys v6 compatible)
function detectViewOnce(msg) {
  if (!msg || !msg.message) return false;
  return !!(
    msg.message.viewOnceMessage ||
    msg.message.viewOnceMessageV2 ||
    msg.message.viewOnceMessageV2Extension
  );
}

// Extract the actual inner media message from the view-once wrapper
function getViewOnceContent(msg) {
  var inner =
    msg.message?.viewOnceMessage?.message ||
    msg.message?.viewOnceMessageV2?.message ||
    msg.message?.viewOnceMessageV2Extension?.message;

  if (!inner) return null;

  // Find the actual media key
  var innerType = null;
  var mediaKeys = ['imageMessage', 'videoMessage', 'audioMessage', 'voiceMessage', 'documentMessage'];
  for (var i = 0; i < mediaKeys.length; i++) {
    if (inner[mediaKeys[i]]) {
      innerType = mediaKeys[i];
      break;
    }
  }

  if (!innerType) {
    innerType = Object.keys(inner)[0] || '';
  }
  if (!innerType) return null;

  var mediaMsg = { key: msg.key, message: inner };
  return { msg: mediaMsg, innerType: innerType };
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
  if (msg.key?.fromMe) return null;

  var extracted = getViewOnceContent(msg);
  if (!extracted) return null;

  var innerMsg = extracted.msg;
  var innerType = extracted.innerType;
  var mediaType = getMediaType(innerType);
  var sender = msg.key.participant || msg.key.remoteJid;
  var senderName = msg.pushName || sender;
  var chatId = msg.key.remoteJid;

  try {
    var buffer = await sock.downloadMediaMessage(innerMsg);
    if (!buffer || buffer.length === 0) return { error: 'Media download returned empty buffer.' };

    ensureDirs();
    var timestamp = Date.now();
    var extMap = { image: '.jpg', video: '.mp4', audio: '.ogg', voice: '.ogg', document: '.bin' };
    var ext = extMap[mediaType] || '.bin';
    var fileName = timestamp + '_' + sanitizeFileName(senderName) + ext;
    var filePath = path.join(SAVE_DIR, fileName);

    fs.writeFileSync(filePath, buffer);
    var size = buffer.length;
    var caption = innerMsg.message?.[innerType]?.caption || '';

    var index = getIndex();
    index.push({
      id: timestamp,
      fileName: fileName,
      filePath: filePath,
      mediaType: mediaType,
      sender: sender,
      senderName: senderName,
      chatId: chatId,
      timestamp: timestamp,
      size: size,
      caption: caption,
    });
    saveIndex(index);

    console.log('[ViewOnce] Saved ' + mediaType + ' from ' + senderName + ' (' + (size / 1024).toFixed(1) + 'KB)');
    return { success: true, mediaType: mediaType, senderName: senderName, filePath: filePath, id: timestamp, caption: caption };
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
  listSavedMedia,
  getSavedMedia,
  getLastSavedMedia,
  deleteSavedMedia,
  getStorageStats,
};
