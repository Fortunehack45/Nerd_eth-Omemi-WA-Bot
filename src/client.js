/**
 * Backward Compatibility Layer & Legacy Facade for Multi-Session Architecture
 * 
 * Provides transparent delegating facades for legacy single-session calls
 * across index.js, server.js, command handlers, and internal services,
 * routing them seamlessly through the centralized SessionManager.
 */

const { SessionManager, sessionManager } = require('./session/sessionManager');
const { normalizeJid, sanitizePairingNumber } = require('./utils/helpers');

/**
 * Returns the default session socket or the first connected socket fallback.
 * @returns {Object|null}
 */
function getDefaultSocket() {
  const defaultSession = sessionManager.getSession('default');
  if (defaultSession?.sock) return defaultSession.sock;
  for (const session of sessionManager.sessions.values()) {
    if (session.sock) return session.sock;
  }
  return null;
}

/**
 * Legacy getClient(): returns active WASocket or null.
 * @param {string} [sessionId='default']
 * @returns {Object|null}
 */
function getClient(sessionId = 'default') {
  const session = sessionManager.getSession(sessionId);
  return session?.sock || getDefaultSocket();
}

/**
 * Legacy getUptime(): returns session or platform uptime in seconds.
 * @param {string} [sessionId='default']
 * @returns {number}
 */
function getUptime(sessionId = 'default') {
  const session = sessionManager.getSession(sessionId);
  if (session?.startedAt) {
    return Math.floor((Date.now() - session.startedAt) / 1000);
  }
  return Math.floor((Date.now() - sessionManager.startTime) / 1000);
}

/**
 * Legacy getStatus(): returns connection status object.
 * @param {string} [sessionId='default']
 * @returns {Object}
 */
function getStatus(sessionId = 'default') {
  const session = sessionManager.getSession(sessionId);
  const sock = session?.sock || getDefaultSocket();
  const isConnected = !!(sock && session?.status === 'connected');
  return {
    connected: isConnected,
    status: session?.status || (isConnected ? 'connected' : 'disconnected'),
    user: sock?.user || null
  };
}

/**
 * Legacy getLastQR(): returns last QR code string for session.
 * @param {string} [sessionId='default']
 * @returns {string|null}
 */
function getLastQR(sessionId = 'default') {
  const session = sessionManager.getSession(sessionId);
  return session?.lastQR || null;
}

/**
 * Legacy getLastPairingCode(): returns last formatted pairing code.
 * @param {string} [sessionId='default']
 * @returns {string|null}
 */
function getLastPairingCode(sessionId = 'default') {
  const session = sessionManager.getSession(sessionId);
  return session?.lastPairingCode || null;
}

/**
 * Legacy requestPairingCode(): requests pairing code for session.
 * @param {string} phoneNumber
 * @param {string} [sessionId='default']
 * @returns {Promise<string>}
 */
async function requestPairingCode(phoneNumber, sessionId = 'default') {
  return await sessionManager.requestPairing(sessionId, phoneNumber);
}

/**
 * Legacy resetSession(): unlinks and resets session credentials safely.
 * @param {string} [sessionId='default']
 * @returns {Promise<boolean>}
 */
async function resetSession(sessionId = 'default') {
  const session = sessionManager.getSession(sessionId);
  if (session) {
    session.lastQR = null;
    session.lastPairingCode = null;
    session.pairingCodeRequested = false;
  }
  try {
    const { resetOnboarding } = require('./services/onboardingService');
    resetOnboarding();
  } catch (e) {}
  
  await sessionManager.destroySession(sessionId, true);
  sessionManager.scheduleReconnect(sessionId, 'Session reset requested', 1000);
  return true;
}

/**
 * Legacy triggerSafeReconnect(): triggers manual reconnect for session.
 * @param {string} reason
 * @param {number} [delayMs=1000]
 * @param {string} [sessionId='default']
 */
function triggerSafeReconnect(reason, delayMs = 1000, sessionId = 'default') {
  sessionManager.scheduleReconnect(sessionId, reason || 'Manual reconnect requested', delayMs);
}

/**
 * Legacy clearSessionFolder(): clears session credential folder safely.
 * @param {string} [sessionId='default']
 */
function clearSessionFolder(sessionId = 'default') {
  sessionManager.clearSessionCredentials(sessionId);
}

/**
 * Legacy startClient(messageHandler, statusHandler, onConnected):
 * Initializes SessionManager and connects default session.
 * @param {Function} [messageHandler]
 * @param {Function} [statusHandler]
 * @param {Function} [onConnected]
 * @returns {Promise<Object>} socket
 */
async function startClient(messageHandler, statusHandler, onConnected) {
  if (messageHandler) sessionManager.handlers.messageHandler = messageHandler;
  if (statusHandler) sessionManager.handlers.statusHandler = statusHandler;
  if (onConnected) sessionManager.handlers.onConnected = onConnected;

  await sessionManager.init();

  if (!sessionManager.hasSession('default')) {
    await sessionManager.createSession('default');
  }

  return await sessionManager.startSession('default', {
    messageHandler,
    statusHandler,
    onConnected,
  });
}

module.exports = {
  sessionManager,
  SessionManager,
  startClient,
  getClient,
  getStatus,
  getUptime,
  getLastQR,
  getLastPairingCode,
  requestPairingCode,
  resetSession,
  triggerSafeReconnect,
  clearSessionFolder,
  sanitizePairingNumber,
  normalizeJid,
};
