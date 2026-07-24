const fs = require('fs');
const path = require('path');
const { loadJson, saveJson, parseJid } = require('../utils/helpers');
const config = require('../../config');

const STORAGE_FILE = path.join(__dirname, '..', '..', 'storage', 'status_ads.json');

function getConfig() {
  const defaults = {
    enabled: config.statusAdBlocker?.enabled !== false,
    logBlockedAds: true,
    totalBlocked: 0,
    blockedLog: [],
  };
  return loadJson(STORAGE_FILE, defaults);
}

function saveConfig(cfg) {
  saveJson(STORAGE_FILE, cfg);
}

function isStatusAdBlockerEnabled() {
  const cfg = getConfig();
  return cfg.enabled !== false;
}

function toggleStatusAdBlocker(enable) {
  const cfg = getConfig();
  cfg.enabled = enable !== undefined ? Boolean(enable) : !cfg.enabled;
  saveConfig(cfg);
  return cfg.enabled;
}

/**
 * Detects whether a WhatsApp status broadcast is an Advertisement / Sponsored / Promotional Ad
 */
function isStatusAd(statusMsg) {
  if (!statusMsg || !statusMsg.message) return false;

  const msg = statusMsg.message;
  const key = statusMsg.key || {};
  const participant = key.participant || key.remoteJid || '';
  const cleanParticipant = parseJid(participant);

  // 1. Direct Ad / Sponsored Message Protocol Flags
  if (msg.sponsoredMessage || msg.adContext || msg.sponsored || msg.isAd) {
    return { isAd: true, reason: 'Protocol Sponsored/Ad Flag' };
  }

  // 2. ContextInfo Ad / External Reply Metadata
  const contextInfo = msg.extendedTextMessage?.contextInfo ||
    msg.imageMessage?.contextInfo ||
    msg.videoMessage?.contextInfo ||
    msg.documentMessage?.contextInfo || {};

  if (contextInfo.externalAdReply || contextInfo.sponsored || contextInfo.isAd) {
    return { isAd: true, reason: 'External Ad Context Metadata' };
  }

  if (contextInfo.sourceApp === 'facebook' || contextInfo.sourceApp === 'instagram' || contextInfo.sourceApp === 'ads') {
    return { isAd: true, reason: 'Cross-App Sponsored Source (' + contextInfo.sourceApp + ')' };
  }

  // 3. Channel / Newsletter Ad Broadcasts
  if (participant.includes('@newsletter') || contextInfo.newsletterJid) {
    return { isAd: true, reason: 'Channel Sponsored Broadcast' };
  }

  // 4. Known Meta / Official Ad Bot IDs
  if (cleanParticipant === '0' || cleanParticipant.startsWith('1000') && cleanParticipant.length > 14) {
    return { isAd: true, reason: 'Official Meta/Business Ad Bot Sender (' + cleanParticipant + ')' };
  }

  // 5. Ad Keyword & CTA Link Matching in Status Text / Captions
  const caption = (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    ''
  ).toLowerCase();

  const adKeywords = [
    '#ad', '#sponsored', '#promoted',
    'sponsored post', 'promoted story', 'whatsapp ad',
    'shop now', 'buy now', 'install app', 'download app', 'click link below',
    'special discount', 'limited offer', 'use code:', 'coupon code',
    'http://wa.me/', 'https://wa.me/', 'https://fb.watch/', 'https://ig.me/'
  ];

  for (const kw of adKeywords) {
    if (caption.includes(kw)) {
      return { isAd: true, reason: 'Ad Keyword Match ("' + kw + '")' };
    }
  }

  return { isAd: false, reason: null };
}

/**
 * Log a blocked status ad
 */
function recordBlockedAd(statusMsg, reason) {
  const cfg = getConfig();
  const key = statusMsg?.key || {};
  const participant = key.participant || key.remoteJid || 'Unknown';
  const cleanSender = parseJid(participant);
  const pushName = statusMsg?.pushName || 'Unknown Ad';

  const caption = (
    statusMsg.message?.conversation ||
    statusMsg.message?.extendedTextMessage?.text ||
    statusMsg.message?.imageMessage?.caption ||
    statusMsg.message?.videoMessage?.caption ||
    'Media Status Ad'
  ).substring(0, 100);

  cfg.totalBlocked = (cfg.totalBlocked || 0) + 1;
  cfg.blockedLog = cfg.blockedLog || [];
  cfg.blockedLog.unshift({
    id: key.id || ('AD_' + Date.now()),
    sender: cleanSender,
    pushName: pushName,
    reason: reason,
    snippet: caption,
    timestamp: Date.now(),
  });

  if (cfg.blockedLog.length > 50) {
    cfg.blockedLog = cfg.blockedLog.slice(0, 50);
  }

  saveConfig(cfg);
}

function getAdBlockerStats() {
  const cfg = getConfig();
  return {
    enabled: cfg.enabled !== false,
    totalBlocked: cfg.totalBlocked || 0,
    recentLog: (cfg.blockedLog || []).slice(0, 10),
  };
}

module.exports = {
  isStatusAdBlockerEnabled,
  toggleStatusAdBlocker,
  isStatusAd,
  recordBlockedAd,
  getAdBlockerStats,
};
