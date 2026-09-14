/**
 * Admin Authentication Middleware with Timing-Safe Password Verification
 * Conforms to PROJECT.md and apiPrivacy.test.js specifications.
 */

const crypto = require('crypto');
let config = {};
try {
  config = require('../../config');
} catch (e) {}

/**
 * Validates a password in constant time using crypto.timingSafeEqual over SHA-256 hashes.
 * Returns true if valid, false otherwise.
 * @param {string} inputPwd
 * @returns {boolean}
 */
function isValidPassword(inputPwd) {
  if (!inputPwd || typeof inputPwd !== 'string') return false;
  const trimmedInput = inputPwd.trim();
  if (trimmedInput === '') return false;

  const expectedPassword = String(process.env.DASHBOARD_PASSWORD || (config && config.dashboardPassword) || 'Omemi');
  const inputHash = crypto.createHash('sha256').update(trimmedInput, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(expectedPassword, 'utf8').digest();

  return crypto.timingSafeEqual(inputHash, expectedHash);
}

/**
 * Express middleware protecting administrative endpoints.
 * Inspects:
 *  - Authorization: Bearer <pwd>
 *  - x-dashboard-password header
 *  - Query parameter ?pwd=
 *  - Request body req.body.pwd
 * 
 * Returns HTTP 401 Unauthorized if password is missing, empty, only whitespace, or invalid.
 */
function adminAuth(req, res, next) {
  const expectedPassword = String(process.env.DASHBOARD_PASSWORD || (config && config.dashboardPassword) || 'Omemi');
  let inputPassword = null;

  if (req) {
    if (req.headers) {
      if (req.headers['x-dashboard-password'] !== undefined) {
        inputPassword = req.headers['x-dashboard-password'];
      } else if (req.headers.authorization && typeof req.headers.authorization === 'string') {
        const auth = req.headers.authorization.trim();
        if (auth.toLowerCase().startsWith('bearer ')) {
          inputPassword = auth.slice(7).trim();
        } else {
          inputPassword = auth;
        }
      }
    }
    if (inputPassword === null && req.query && req.query.pwd !== undefined) {
      inputPassword = req.query.pwd;
    }
    if (inputPassword === null && req.body && req.body.pwd !== undefined) {
      inputPassword = req.body.pwd;
    }
  }

  // Missing, empty string, or whitespace only
  if (inputPassword === null || inputPassword === undefined || typeof inputPassword !== 'string' || inputPassword.trim() === '') {
    return res.status(401).json({ success: false, error: 'Unauthorized: missing or empty password' });
  }

  const trimmedInput = inputPassword.trim();
  const inputHash = crypto.createHash('sha256').update(trimmedInput, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(expectedPassword, 'utf8').digest();

  if (crypto.timingSafeEqual(inputHash, expectedHash)) {
    return next();
  }

  return res.status(401).json({ success: false, error: 'Unauthorized: invalid password' });
}

module.exports = {
  adminAuth,
  default: adminAuth,
  isValidPassword
};
