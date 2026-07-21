const path = require('path');
const fs = require('fs');
const { loadJson, saveJson, parseJid } = require('../utils/helpers');
const config = require('../../config');

const STORAGE_FILE = path.join(__dirname, '..', '..', 'storage', 'antibot.json');

function ensureDirs() {
  const dir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getAntiBotData() {
  ensureDirs();
  return loadJson(STORAGE_FILE, {
    enabled: true,
    blockedBots: [],
    logs: [],
  });
}

function saveAntiBotData(data) {
  saveJson(STORAGE_FILE, data);
}

function isAntiBotEnabled() {
  var data = getAntiBotData();
  return data.enabled !== false;
}

function setAntiBotEnabled(enabled) {
  var data = getAntiBotData();
  data.enabled = !!enabled;
  saveAntiBotData(data);
  return data.enabled;
}

function addBlockedBot(numberOrJid) {
  var clean = parseJid(numberOrJid);
  if (!clean) return { success: false, error: 'Invalid phone number or JID' };
  var data = getAntiBotData();
  if (!data.blockedBots) data.blockedBots = [];
  if (!data.blockedBots.includes(clean)) {
    data.blockedBots.push(clean);
    saveAntiBotData(data);
  }
  return { success: true, jid: clean, total: data.blockedBots.length };
}

function removeBlockedBot(numberOrJid) {
  var clean = parseJid(numberOrJid);
  if (!clean) return { success: false, error: 'Invalid phone number or JID' };
  var data = getAntiBotData();
  data.blockedBots = (data.blockedBots || []).filter(b => b !== clean);
  saveAntiBotData(data);
  return { success: true, jid: clean, total: data.blockedBots.length };
}

function getBlockedBots() {
  var data = getAntiBotData();
  return data.blockedBots || [];
}

// Bot signature patterns — ONLY match clearly automated prefixes
// NOTE: 3EB is the standard WhatsApp Web prefix, NOT a bot signature
const BOT_ID_PATTERNS = [
  /^BAE5/i,  // Baileys default ID prefix (strong signal)
  /^BOT/i,   // Popular bot frameworks
];

const BOT_TEXT_SIGNATURES = [
  /powered by.*bot/i,
  /whatsapp bot/i,
  /\[bot\]/i,
  /🤖 bot response/i,
  /auto-reply/i,
  /type !help for menu/i,
  /command list:/i,
  /created by @/i,
  /md bot/i,
];

function isBotMessage(msg) {
  if (!msg || !msg.key) return { isBot: false };
  if (msg.key.fromMe) return { isBot: false }; // Never block own bot messages

  var senderJid = msg.key.participant || msg.key.remoteJid || '';
  var senderNum = parseJid(senderJid);
  var data = getAntiBotData();

  // Check if sender is owner or admin (owners & admins are never blocked as bots)
  var isOwner = (config.admins || []).includes(senderNum);
  if (isOwner) return { isBot: false };

  // Check if sender is an approved user — approved users are never flagged as bots
  try {
    var { isApproved } = require('./accessControl');
    if (isApproved(senderJid)) return { isBot: false };
  } catch (e) {}

  // 1. Check if sender is in manually blocked bot list
  if (data.blockedBots && data.blockedBots.includes(senderNum)) {
    return { isBot: true, reason: 'Sender is listed in blocked bots directory (' + senderNum + ')' };
  }

  var msgId = msg.key.id || '';
  var messageText = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption
    || '';

  // 2. Check message ID signature (e.g. Baileys / automated bot prefixes)
  for (var i = 0; i < BOT_ID_PATTERNS.length; i++) {
    if (BOT_ID_PATTERNS[i].test(msgId)) {
      // Auto-add to blocked bots database to prevent future spam
      addBlockedBot(senderNum);
      return { isBot: true, reason: 'Automated Bot ID pattern detected (' + msgId.substring(0, 8) + ')' };
    }
  }

  // 3. Check for bot text signatures in message body
  if (messageText) {
    for (var j = 0; j < BOT_TEXT_SIGNATURES.length; j++) {
      if (BOT_TEXT_SIGNATURES[j].test(messageText)) {
        addBlockedBot(senderNum);
        return { isBot: true, reason: 'Bot text signature detected in message' };
      }
    }
  }

  return { isBot: false };
}

function logAntiBotEvent(msg, reason) {
  try {
    var data = getAntiBotData();
    var sender = msg.key.participant || msg.key.remoteJid;
    var senderName = msg.pushName || parseJid(sender);
    if (!data.logs) data.logs = [];

    data.logs.unshift({
      timestamp: Date.now(),
      sender: sender,
      senderName: senderName,
      reason: reason,
      chat: msg.key.remoteJid,
    });

    if (data.logs.length > 200) data.logs = data.logs.slice(0, 200);
    saveAntiBotData(data);
  } catch (e) {}
}

function getAntiBotStats() {
  var data = getAntiBotData();
  return {
    enabled: data.enabled !== false,
    totalBlocked: (data.blockedBots || []).length,
    blockedBots: data.blockedBots || [],
    recentLogs: (data.logs || []).slice(0, 20),
  };
}

async function banAccount(sock, targetNumberOrJid, groupJid) {
  var clean = parseJid(targetNumberOrJid);
  if (!clean) return { success: false, error: 'Invalid phone number or JID' };
  var targetJid = clean + '@s.whatsapp.net';

  var actionsTaken = [];
  var errors = [];

  // 1. Block the target account on WhatsApp
  if (sock && typeof sock.updateBlockStatus === 'function') {
    try {
      await sock.updateBlockStatus(targetJid, 'block');
      actionsTaken.push('Blocked target on WhatsApp');
    } catch (e1) {
      errors.push('Block error: ' + e1.message);
    }
  }

  // 2. If in a group chat, kick the target account from the group
  if (groupJid && groupJid.endsWith('@g.us') && sock && typeof sock.groupParticipantsUpdate === 'function') {
    try {
      await sock.groupParticipantsUpdate(groupJid, [targetJid], 'remove');
      actionsTaken.push('Kicked target from group');
    } catch (e2) {
      errors.push('Group kick error: ' + e2.message);
    }
  }

  // 3. Report user to WhatsApp if supported
  if (sock && typeof sock.reportUser === 'function') {
    try {
      await sock.reportUser(targetJid);
      actionsTaken.push('Reported target account to WhatsApp server');
    } catch (e3) {}
  }

  // 4. Save to banned accounts registry
  addBlockedBot(clean);

  var data = getAntiBotData();
  if (!data.bannedAccounts) data.bannedAccounts = [];
  if (!data.bannedAccounts.find(b => b.number === clean)) {
    data.bannedAccounts.push({
      number: clean,
      bannedAt: Date.now(),
      groupJid: groupJid || null,
      actions: actionsTaken,
    });
    saveAntiBotData(data);
  }

  return {
    success: true,
    target: clean,
    targetJid: targetJid,
    actionsTaken: actionsTaken,
    errors: errors,
  };
}

module.exports = {
  isAntiBotEnabled,
  setAntiBotEnabled,
  addBlockedBot,
  removeBlockedBot,
  getBlockedBots,
  isBotMessage,
  logAntiBotEvent,
  getAntiBotStats,
  banAccount,
};
