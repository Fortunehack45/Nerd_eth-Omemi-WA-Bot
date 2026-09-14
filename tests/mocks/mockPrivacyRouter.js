/**
 * Reference Privacy Router & Security Middleware conforming to PROJECT.md specifications.
 * Used for deterministic testing of API privacy, route guards, and masking.
 */

const express = require('express');
const crypto = require('crypto');

function maskPhoneNumber(phoneOrJid) {
  if (!phoneOrJid || typeof phoneOrJid !== 'string') return '';
  const clean = phoneOrJid.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!clean || clean.length < 7) return clean;

  if (clean.startsWith('234') && clean.length === 13) {
    // Nigerian standard: +234 916 *** 9200
    const country = clean.slice(0, 3);
    const prefix = clean.slice(3, 6);
    const suffix = clean.slice(-4);
    return `+${country} ${prefix} *** ${suffix}`;
  }

  if (clean.length === 11 && clean.startsWith('1')) {
    // US / North America standard: +1 (415) ***-2671
    const country = clean.slice(0, 1);
    const area = clean.slice(1, 4);
    const suffix = clean.slice(-4);
    return `+${country} (${area}) ***-${suffix}`;
  }

  // Generic fallback: first 3 digits + *** + last 3 digits
  const head = clean.slice(0, 3);
  const tail = clean.slice(-3);
  return `+${head} *** ${tail}`;
}

function adminAuth(req, res, next) {
  const expectedPassword = process.env.DASHBOARD_PASSWORD || 'Omemi';
  let inputPassword = null;

  // Extract from query, header, or Bearer auth
  if (req.headers && req.headers['x-dashboard-password']) {
    inputPassword = req.headers['x-dashboard-password'];
  } else if (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    inputPassword = req.headers.authorization.slice(7);
  } else if (req.query && req.query.pwd !== undefined) {
    inputPassword = req.query.pwd;
  } else if (req.body && req.body.pwd !== undefined) {
    inputPassword = req.body.pwd;
  }

  // Missing or empty password returns 401
  if (!inputPassword || typeof inputPassword !== 'string' || inputPassword.trim() === '') {
    return res.status(401).json({ error: 'Unauthorized: missing or empty password' });
  }

  const trimmedInput = inputPassword.trim();
  const inputBuffer = Buffer.from(trimmedInput, 'utf8');
  const expectedBuffer = Buffer.from(expectedPassword, 'utf8');

  // Timing safe comparison (must have equal length buffers)
  if (inputBuffer.length !== expectedBuffer.length) {
    return res.status(401).json({ error: 'Unauthorized: invalid password' });
  }

  if (crypto.timingSafeEqual(inputBuffer, expectedBuffer)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: invalid password' });
}

function createPrivacyApp(sessionManager) {
  const app = express();
  app.use(express.json());

  // Public Stats Endpoint: Returns ONLY aggregate metrics, ZERO phone numbers or private chats
  app.get('/api/public-stats', (req, res) => {
    if (sessionManager && typeof sessionManager.getPublicStats === 'function') {
      const stats = sessionManager.getPublicStats();
      return res.status(200).json(stats);
    }
    return res.status(200).json({
      activeBots: 0,
      totalSessions: 0,
      platformUptime: '0h 0m 0s',
      totalMessagesProcessed: 0
    });
  });

  // Admin Sessions Endpoint: Protected by adminAuth, returns masked numbers (+234 916 *** 9200)
  app.get('/api/admin/sessions', adminAuth, (req, res) => {
    if (sessionManager && typeof sessionManager.getAdminSessionList === 'function') {
      const list = sessionManager.getAdminSessionList();
      return res.status(200).json(list);
    }
    return res.status(200).json([]);
  });

  return app;
}

module.exports = {
  maskPhoneNumber,
  adminAuth,
  createPrivacyApp
};
