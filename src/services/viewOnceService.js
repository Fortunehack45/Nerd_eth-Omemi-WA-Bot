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

function detectViewOnce(msg) {
  var msgType = Object.keys(msg.message || {})[0] || '';
  return msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2';
}

function getViewOnceContent(msg) {
  var msgType = Object.keys(msg.message || {})[0] || '';
  var inner = msg.message[msgType];
  if (inner && inner.message) {
    var innerType = Object.keys(inner.message)[0] || '';
    inner.key = msg.key;
    inner.pushName = msg.pushName;
    return { msg: inner, innerType: innerType };
  }
  return null;
}

function getMediaType(innerType) {
  if (innerType === 'imageMessage') return 'image';
  if (innerType === 'videoMessage') return 'video';
  if (innerType === 'audioMessage') return 'audio';
  if (innerType === 'voiceMessage') return 'voice';
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

  try {
    var buffer = await sock.downloadMediaMessage(innerMsg);
    if (!buffer) return null;

    ensureDirs();
    var timestamp = Date.now();
    var ext = mediaType === 'image' ? '.jpg' : mediaType === 'video' ? '.mp4' : mediaType === 'audio' || mediaType === 'voice' ? '.ogg' : '.bin';
    var fileName = timestamp + '_' + sanitizeFileName(senderName) + ext;
    var filePath = path.join(SAVE_DIR, fileName);

    fs.writeFileSync(filePath, buffer);
    var size = buffer.length;

    var index = getIndex();
    index.push({
      id: timestamp,
      fileName: fileName,
      filePath: filePath,
      mediaType: mediaType,
      sender: sender,
      senderName: senderName,
      timestamp: timestamp,
      size: size,
      caption: innerMsg.message?.[innerType]?.caption || '',
    });
    saveIndex(index);

    return { success: true, mediaType: mediaType, senderName: senderName, filePath: filePath, id: timestamp };
  } catch (err) {
    console.error('ViewOnce save error:', err.message);
    return { error: err.message };
  }
}

function listSavedMedia(limit, type) {
  var index = getIndex();
  index.reverse();
  if (type) index = index.filter(function(i) { return i.mediaType === type; });
  return index.slice(0, limit || 20);
}

function getSavedMedia(id) {
  var index = getIndex();
  return index.find(function(i) { return i.id === parseInt(id) || i.id === id; });
}

function deleteSavedMedia(id) {
  var index = getIndex();
  var idx = index.findIndex(function(i) { return i.id === parseInt(id) || i.id === id; });
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
  index.forEach(function(i) {
    byType[i.mediaType] = (byType[i.mediaType] || 0) + 1;
  });
  return { total: index.length, totalSize: totalSize, byType: byType };
}

module.exports = {
  detectViewOnce,
  saveViewOnce,
  listSavedMedia,
  getSavedMedia,
  deleteSavedMedia,
  getStorageStats,
};
