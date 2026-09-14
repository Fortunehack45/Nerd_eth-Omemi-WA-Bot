var express = require('express');
var path = require('path');
var fs = require('fs');
var { loadJson } = require('./src/utils/helpers');
var config = require('./config');
var { adminAuth, isValidPassword } = require('./src/middleware/auth');
var { maskPhoneNumber } = require('./src/utils/masking');
var { SessionManager, sessionManager: defaultSessionManager, sanitizePairingNumber } = require('./src/session/sessionManager');

var app = express();
var PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
var DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'Omemi';

var botStatus = { connected: false, user: null, uptime: 0, startTime: Date.now() };
var recentMessages = [];
var commandLog = [];

function getActiveSessionManager() {
  if (global.sessionManager) return global.sessionManager;
  if (app.locals && app.locals.sessionManager) return app.locals.sessionManager;
  return defaultSessionManager;
}

function setSessionManager(mgr) {
  if (mgr) {
    app.locals.sessionManager = mgr;
    global.sessionManager = mgr;
  }
}

function setConnected(sock) {
  botStatus.connected = true;
  botStatus.user = (sock && sock.user) ? (sock.user.name || sock.user.id || 'Unknown') : 'Unknown';
  botStatus.startTime = Date.now();
}

function setDisconnected() {
  botStatus.connected = false;
}

function logMessage(from, text, type) {
  recentMessages.unshift({ from: from, text: text.substring(0, 100), type: type || 'message', time: Date.now() });
  if (recentMessages.length > 50) recentMessages.length = 50;
}

function logCommand(cmd, user, status) {
  commandLog.unshift({ cmd: cmd, user: user, status: status || 'ok', time: Date.now() });
  if (commandLog.length > 50) commandLog.length = 50;
}

app.use(express.json());

// Enable CORS for cross-origin dashboard connections (e.g. Vercel dashboard -> Render bot backend)
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-dashboard-password');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Public health & keep-alive endpoints for 24/7 Uptime services (e.g. UptimeRobot, Render keep-alive)
app.get('/ping', function(req, res) {
  res.status(200).json({ status: 'ok', uptime: Math.floor((Date.now() - botStatus.startTime) / 1000), timestamp: Date.now() });
});

app.get('/health', function(req, res) {
  res.status(200).json({
    status: 'online',
    connected: botStatus.connected,
    user: maskPhoneNumber(botStatus.user),
    uptime: Math.floor((Date.now() - botStatus.startTime) / 1000)
  });
});

app.get('/', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/dashboard', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/admin', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.get('/admin.html', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.use(express.static(path.join(__dirname, 'public')));

// Public aggregate stats endpoint (Strictly zero phone numbers, LIDs, remote JIDs, or private chats)
app.get('/api/public-stats', function(req, res) {
  var mgr = getActiveSessionManager();
  if (mgr && typeof mgr.getPublicStats === 'function') {
    return res.status(200).json(mgr.getPublicStats());
  }
  var uptime = Math.floor((Date.now() - botStatus.startTime) / 1000);
  var h = Math.floor(uptime / 3600);
  var m = Math.floor((uptime % 3600) / 60);
  var s = uptime % 60;
  return res.status(200).json({
    status: 'online',
    activeBots: botStatus.connected ? 1 : 0,
    totalSessions: botStatus.connected ? 1 : 0,
    platformUptime: h + 'h ' + m + 'm ' + s + 's',
    uptimeSeconds: uptime,
    totalMessagesProcessed: 0
  });
});

// Status endpoint: unauthenticated returns aggregate metrics only; authenticated returns dashboard stats
app.get('/api/status', function(req, res) {
  var pwd = req.query.pwd || req.headers['x-dashboard-password'] || (req.body && req.body.pwd);
  if (req.headers && req.headers.authorization && typeof req.headers.authorization === 'string' && req.headers.authorization.toLowerCase().startsWith('bearer ')) {
    pwd = req.headers.authorization.slice(7).trim();
  }

  var isAdmin = isValidPassword(pwd);
  var mgr = getActiveSessionManager();
  var publicStats = (mgr && typeof mgr.getPublicStats === 'function')
    ? mgr.getPublicStats()
    : {
        activeBots: botStatus.connected ? 1 : 0,
        totalSessions: botStatus.connected ? 1 : 0,
        platformUptime: Math.floor((Date.now() - botStatus.startTime) / 1000) + 's',
        uptimeSeconds: Math.floor((Date.now() - botStatus.startTime) / 1000),
        totalMessagesProcessed: recentMessages.length
      };

  if (!isAdmin) {
    // Unauthenticated caller gets strictly aggregate metrics only
    return res.status(200).json({
      status: 'online',
      activeBots: publicStats.activeBots,
      totalSessions: publicStats.totalSessions,
      platformUptime: publicStats.platformUptime,
      uptimeSeconds: publicStats.uptimeSeconds,
      totalMessagesProcessed: publicStats.totalMessagesProcessed
    });
  }

  // Authenticated Super-Admin gets full dashboard metrics
  var p = require('./src/services/personaService');
  var persona = p.getPersona();
  var mem = require('./src/services/memoryService');
  var allUsers = mem.getAllUsers();
  var totalFacts = 0;
  allUsers.forEach(function(u) { totalFacts += (u.facts ? u.facts.length : 0); });

  var uptime = publicStats.uptimeSeconds;
  var h = Math.floor(uptime / 3600);
  var m = Math.floor((uptime % 3600) / 60);
  var s = uptime % 60;

  return res.json({
    status: 'online',
    connected: botStatus.connected,
    botName: config.botName,
    persona: persona.name,
    personaEmoji: persona.emoji,
    user: maskPhoneNumber(botStatus.user),
    uptime: h + 'h ' + m + 'm ' + s + 's',
    uptimeSeconds: uptime,
    activeBots: publicStats.activeBots,
    totalSessions: publicStats.totalSessions,
    users: allUsers.length,
    facts: totalFacts,
    commands: require('./src/handlers/commandHandler').getCommandsList().length,
    prefix: config.prefix,
    pairingCode: null,
    recentMessages: [],
    commandLog: commandLog.slice(0, 10),
  });
});

// Public Pairing Endpoint: requests pairing code from WhatsApp Noise protocol via SessionManager
app.post('/api/pair', async function(req, res) {
  var phone = req.body.phone || req.body.number;
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return res.status(400).json({ success: false, error: 'Phone number required' });
  }

  var rawPhone = phone.trim();
  var cleanPhone = '';
  try {
    cleanPhone = sanitizePairingNumber(rawPhone);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message || 'Invalid phone number' });
  }

  if (!cleanPhone || cleanPhone.length < 10) {
    return res.status(400).json({ success: false, error: 'Invalid phone number. Please include country code.' });
  }

  var sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : `session_${cleanPhone}`;
  var mgr = getActiveSessionManager();

  if (!mgr) {
    return res.status(500).json({ success: false, error: 'SessionManager not available' });
  }

  try {
    var code = await mgr.requestPairing(sessionId, cleanPhone);
    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      code: code
    });
  } catch (err) {
    console.error(`[SERVER] Pairing request failed for ${cleanPhone}:`, err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Pairing request failed'
    });
  }
});

// Public session status endpoint
app.get('/api/sessions/:id/status', function(req, res) {
  var id = req.params.id;
  var mgr = getActiveSessionManager();
  var session = (mgr && mgr.sessions) ? mgr.sessions.get(id) : null;

  if (!session) {
    return res.status(200).json({
      sessionId: id,
      status: 'disconnected',
      connected: false
    });
  }

  return res.status(200).json({
    sessionId: id,
    status: session.status || 'idle',
    connected: session.status === 'connected',
    pairingCode: session.lastPairingCode || null
  });
});

// Public SSE pairing stream endpoint
app.get('/api/pair/stream', function(req, res) {
  var sessionId = req.query.sessionId || req.query.id;
  var phone = req.query.phone;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  var sendEvent = function(event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {}
  };

  sendEvent('connected_stream', { message: 'Pairing stream connected', sessionId: sessionId || null });

  var mgr = getActiveSessionManager();
  if (!mgr) {
    sendEvent('error', { message: 'SessionManager not available' });
    return res.end();
  }

  if (sessionId && mgr.sessions && mgr.sessions.has(sessionId)) {
    var existing = mgr.sessions.get(sessionId);
    sendEvent('status', { sessionId: sessionId, status: existing.status });
    if (existing.lastPairingCode) {
      sendEvent('pairing_code', { sessionId: sessionId, code: existing.lastPairingCode });
    }
    if (existing.status === 'connected') {
      sendEvent('connected', { sessionId: sessionId, status: 'connected' });
      return res.end();
    }
  }

  var onPairingCode = function(data) {
    if (!data) return;
    var matchesSession = Boolean(sessionId && data.sessionId === sessionId);
    var matchesPhone = Boolean(phone && data.phoneNumber === phone);
    if (matchesSession || matchesPhone) {
      sendEvent('pairing_code', {
        sessionId: data.sessionId,
        code: data.code || data.pairingCode
      });
    }
  };

  var onSessionConnected = function(data) {
    if (!data) return;
    if (sessionId && data.sessionId === sessionId) {
      sendEvent('connected', { sessionId: data.sessionId, status: 'connected' });
      cleanup();
      res.end();
    }
  };

  var onSessionDisconnected = function(data) {
    if (!data) return;
    if (sessionId && data.sessionId === sessionId) {
      sendEvent('disconnected', { sessionId: data.sessionId, status: 'disconnected' });
    }
  };

  var onSessionStatus = function(data) {
    if (!data) return;
    if (sessionId && data.sessionId === sessionId) {
      sendEvent('status', { sessionId: data.sessionId, status: data.status });
      if (data.status === 'connected') {
        cleanup();
        res.end();
      }
    }
  };

  mgr.on('session.pairingCode', onPairingCode);
  mgr.on('session.connected', onSessionConnected);
  mgr.on('session.disconnected', onSessionDisconnected);
  mgr.on('session.status', onSessionStatus);

  var heartbeatInterval = setInterval(function() {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {}
  }, 15000);

  var timeout = setTimeout(function() {
    sendEvent('timeout', { message: 'Pairing stream timed out after 3 minutes' });
    cleanup();
    res.end();
  }, 180000);

  var cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeatInterval);
    clearTimeout(timeout);
    if (mgr) {
      mgr.removeListener('session.pairingCode', onPairingCode);
      mgr.removeListener('session.connected', onSessionConnected);
      mgr.removeListener('session.disconnected', onSessionDisconnected);
      mgr.removeListener('session.status', onSessionStatus);
    }
  }

  req.on('close', cleanup);
});

// Alias auth to adminAuth for backwards compatibility across all admin endpoints
var auth = adminAuth;

var validPasscodes = new Set();

app.post('/api/generate-access-key', adminAuth, function(req, res) {
  var key = Math.floor(100000 + Math.random() * 900000).toString();
  validPasscodes.add(key);
  res.json({ success: true, key: key });
});

// Admin session management endpoints
app.get('/api/admin/sessions', adminAuth, function(req, res) {
  var mgr = getActiveSessionManager();
  if (mgr && typeof mgr.getAdminSessionList === 'function') {
    var list = mgr.getAdminSessionList();
    var maskedList = list.map(function(item) {
      return {
        id: item.id,
        maskedPhone: maskPhoneNumber(item.maskedPhone || item.phoneNumber || item.id),
        status: item.status,
        uptime: item.uptime,
        messagesCount: item.messagesCount,
        createdAt: item.createdAt
      };
    });
    return res.status(200).json(maskedList);
  }
  return res.status(200).json([]);
});

app.get('/api/admin/firebase/status', adminAuth, function(req, res) {
  var fb = null;
  try {
    fb = require('./src/services/firebaseService');
  } catch (e) {}
  if (fb && typeof fb.getStatus === 'function') {
    return res.status(200).json({ success: true, ...fb.getStatus() });
  }
  return res.status(200).json({ success: true, available: false, mode: 'none' });
});

app.post(['/api/sessions/:id/disconnect', '/api/admin/sessions/:id/disconnect'], adminAuth, async function(req, res) {
  var id = req.params.id;
  var mgr = getActiveSessionManager();
  if (!mgr) return res.status(500).json({ success: false, error: 'SessionManager not available' });

  try {
    if (typeof mgr.stopSession === 'function') {
      await mgr.stopSession(id);
    } else if (typeof mgr.destroySession === 'function') {
      await mgr.destroySession(id, false);
    }
    return res.json({ success: true, message: `Session ${id} disconnected` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete(['/api/sessions/:id', '/api/admin/sessions/:id'], adminAuth, async function(req, res) {
  var id = req.params.id;
  var mgr = getActiveSessionManager();
  if (!mgr) return res.status(500).json({ success: false, error: 'SessionManager not available' });

  try {
    if (typeof mgr.destroySession === 'function') {
      var deleted = await mgr.destroySession(id, true);
      return res.json({ success: true, deleted: deleted, message: `Session ${id} and storage deleted` });
    }
    return res.status(404).json({ success: false, error: 'Session destroy method not available' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post(['/api/sessions/restart-all', '/api/admin/sessions/restart-all'], adminAuth, async function(req, res) {
  var mgr = getActiveSessionManager();
  if (!mgr) return res.status(500).json({ success: false, error: 'SessionManager not available' });

  try {
    if (typeof mgr.restartAllSessions === 'function') {
      await mgr.restartAllSessions();
    }
    return res.json({ success: true, message: 'All sessions restart initiated' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/users', adminAuth, function(req, res) {
  var mem = require('./src/services/memoryService');
  var users = mem.getAllUsers();
  res.json(users.map(function(u) {
    return {
      id: u.id,
      name: u.name || u.pushName || u.id,
      facts: (u.facts || []).length,
      notes: u.notes ? u.notes.split('\n').length : 0,
      messages: u.messageCount || 0,
      firstSeen: u.firstSeen,
      lastSeen: u.lastSeen,
    };
  }));
});

app.get('/api/user/:id', adminAuth, function(req, res) {
  var mem = require('./src/services/memoryService');
  var jid = req.params.id.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  var user = mem.getUser(jid);
  res.json(user);
});

app.get('/api/logs', adminAuth, function(req, res) {
  var logFile = path.join(__dirname, 'storage', 'bot.log');
  var logs = [];
  if (fs.existsSync(logFile)) {
    var content = fs.readFileSync(logFile, 'utf8');
    logs = content.split('\n').filter(Boolean).slice(-100);
  }
  res.json({ logs: logs, recentMessages: recentMessages.slice(0, 20), commands: commandLog.slice(0, 20) });
});

app.post('/api/speedtest', adminAuth, async function(req, res) {
  var speedSvc = require('./src/services/speedTestService');
  var result = await speedSvc.runSpeedTest();
  res.json(result);
});

// Helper to generate QR code response
async function generateQrResponse(sessionId, res) {
  var mgr = getActiveSessionManager();
  var session = (mgr && typeof mgr.getSession === 'function') ? mgr.getSession(sessionId) : null;

  var qr = session?.lastQR;
  if (!qr) {
    try {
      var client = require('./src/client');
      qr = (typeof client.getLastQR === 'function') ? client.getLastQR(sessionId) : null;
    } catch (e) {}
  }
  var isConnected = session?.status === 'connected' || (sessionId === 'default' && botStatus.connected);
  var userStr = session?.user?.id || (sessionId === 'default' ? botStatus.user : null);

  if (isConnected) {
    return res.json({ qr: null, dataUrl: null, connected: true, status: 'connected', user: maskPhoneNumber(userStr) });
  }

  // If session is unstarted or idle, boot it to generate fresh QR
  if (!qr && mgr && (!session || session.status === 'idle' || session.status === 'disconnected')) {
    mgr.startSession(sessionId).catch(function() {});
  }

  if (!qr) {
    return res.json({ qr: null, dataUrl: null, connected: false, status: session?.status || 'starting' });
  }

  try {
    var QRCode = require('qrcode');
    var dataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320, errorCorrectionLevel: 'M' });
    res.json({ qr: qr, dataUrl: dataUrl, connected: false, status: 'waiting_for_scan' });
  } catch (e) {
    res.json({ qr: qr, dataUrl: null, connected: false, status: 'error', error: e.message });
  }
}

// Public QR Code endpoint for pairing: Allows any user to scan and link WhatsApp
app.get('/api/pair/qr', async function(req, res) {
  var sessionId = req.query.sessionId ? String(req.query.sessionId).trim() : 'default';
  return generateQrResponse(sessionId, res);
});

// Admin QR Code endpoint (Protected)
app.get('/api/qrdata', adminAuth, async function(req, res) {
  var sessionId = req.query.sessionId ? String(req.query.sessionId).trim() : 'default';
  return generateQrResponse(sessionId, res);
});

app.post('/api/refresh-qr', adminAuth, async function(req, res) {
  var sessionId = req.query.sessionId || (req.body && req.body.sessionId) || 'default';
  var mgr = getActiveSessionManager();
  if (mgr) {
    try {
      await mgr.stopSession(sessionId).catch(function() {});
      await mgr.startSession(sessionId).catch(function() {});
      return res.json({ success: true, message: 'QR Code refreshed. Generating fresh handshake...' });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Refresh failed' });
    }
  }
  try {
    var client = require('./src/client');
    client.resetSession(sessionId);
    res.json({ success: true, message: 'QR Code refreshed. Generating fresh handshake...' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Refresh failed' });
  }
});

app.post('/api/reset-session', adminAuth, function(req, res) {
  try {
    var client = require('./src/client');
    client.resetSession();
    res.json({ success: true, message: 'Session reset! Stale credentials cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Reset failed' });
  }
});

app.post('/api/admin/firebase/sync', adminAuth, async function(req, res) {
  var fb = null;
  try { fb = require('./src/services/firebaseService'); } catch(e) {}
  var mgr = getActiveSessionManager();
  if (!fb || !fb.isAvailable()) {
    return res.status(400).json({ success: false, error: 'Firebase is not configured or available' });
  }
  if (!mgr) {
    return res.status(500).json({ success: false, error: 'SessionManager not available' });
  }

  try {
    var backedUp = 0;
    for (const [id, session] of mgr.sessions.entries()) {
      if (session.dir && fs.existsSync(path.join(session.dir, 'creds.json'))) {
        await fb.backupSessionFiles(id, session.dir);
        backedUp++;
      }
    }
    return res.json({ success: true, message: `Successfully synced ${backedUp} session(s) to Firebase Cloud Database` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/firebase/config', adminAuth, function(req, res) {
  var fb = null;
  try { fb = require('./src/services/firebaseService'); } catch(e) {}
  if (!fb) return res.status(500).json({ success: false, error: 'Firebase service not loaded' });

  var { projectId, databaseUrl, apiKey } = req.body || {};
  var status = fb.configure({ projectId, databaseUrl, apiKey });
  res.json({ success: true, ...status });
});

app.get('/api/keys', adminAuth, function(req, res) {
  var aiSvc = require('./src/services/aiService');
  res.json({
    provider: aiSvc.getProvider(),
    model: aiSvc.getModel(),
    groqSet: !!((process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 5) || (config.groq && config.groq.apiKey)),
    openaiSet: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 5),
    openrouterSet: !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 5),
    braveSet: !!(process.env.BRAVE_SEARCH_API_KEY && process.env.BRAVE_SEARCH_API_KEY.length > 5),
  });
});

app.get('/api/features', adminAuth, function(req, res) {
  var featSvc = require('./src/services/featureService');
  res.json(featSvc.getFeatureConfig());
});

app.post('/api/features/toggle', adminAuth, function(req, res) {
  var featSvc = require('./src/services/featureService');
  var name = req.body.name;
  var action = req.body.action;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  var result = (action === 'disable') ? featSvc.disableItem(name) : featSvc.enableItem(name);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// Access Control Management Endpoints
app.get('/api/access', adminAuth, function(req, res) {
  var acSvc = require('./src/services/accessControl');
  res.json({ enabled: config.access ? config.access.enabled : false, users: acSvc.listUsers() });
});

app.post('/api/access/add', adminAuth, function(req, res) {
  var acSvc = require('./src/services/accessControl');
  var number = req.body.number;
  var name = req.body.name;
  var features = req.body.features;
  if (!number) return res.status(400).json({ error: 'Phone number is required' });
  var result = acSvc.addUser(number, features, name);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/access/remove', adminAuth, function(req, res) {
  var acSvc = require('./src/services/accessControl');
  var number = req.body.number;
  if (!number) return res.status(400).json({ error: 'Phone number is required' });
  var result = acSvc.removeUser(number);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/access/toggle-feature', adminAuth, function(req, res) {
  var acSvc = require('./src/services/accessControl');
  var number = req.body.number;
  var feature = req.body.feature;
  if (!number || !feature) return res.status(400).json({ error: 'Number and feature are required' });
  var result = acSvc.toggleFeature(number, feature);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/keys', adminAuth, function(req, res) {
  var aiSvc = require('./src/services/aiService');
  var groq = req.body.groq;
  var openai = req.body.openai;
  var openrouter = req.body.openrouter;
  var brave = req.body.brave;
  var updated = [];

  var updateEnv = function(keyName, val) {
    try {
      process.env[keyName] = val;
      var envPath = path.join(__dirname, '.env');
      if (fs.existsSync(envPath)) {
        var content = fs.readFileSync(envPath, 'utf8');
        var regex = new RegExp('^' + keyName + '=.*$', 'm');
        if (regex.test(content)) {
          content = content.replace(regex, keyName + '=' + val);
        } else {
          content += '\n' + keyName + '=' + val;
        }
        fs.writeFileSync(envPath, content, 'utf8');
      }
    } catch(e) {}
  };

  if (groq) { aiSvc.setRuntimeKey('groq', groq); updateEnv('GROQ_API_KEY', groq); updated.push('groq'); }
  if (openai) { aiSvc.setRuntimeKey('openai', openai); updateEnv('OPENAI_API_KEY', openai); updated.push('openai'); }
  if (openrouter) { aiSvc.setRuntimeKey('openrouter', openrouter); updateEnv('OPENROUTER_API_KEY', openrouter); updated.push('openrouter'); }
  if (brave) { config.braveSearch.apiKey = brave; updateEnv('BRAVE_SEARCH_API_KEY', brave); updated.push('brave'); }

  res.json({ success: true, updated: updated, provider: aiSvc.getProvider(), model: aiSvc.getModel() });
});

app.post('/api/test-ai', adminAuth, async function(req, res) {
  try {
    var aiSvc = require('./src/services/aiService');
    var result = await aiSvc.testConnection();
    res.json({ success: result.success, response: result.text, provider: aiSvc.getProvider(), model: aiSvc.getModel() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/test', adminAuth, function(req, res) {
  var target = req.body.to || (config.admins && config.admins[0]);
  if (!target) return res.status(400).json({ error: 'No target number. Set "to" in body or OWNER_NUMBER in env' });
  var client = require('./src/client');
  var sock = client.getClient();
  if (!sock) return res.status(400).json({ error: 'Bot not initialized' });
  var jid = target.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  sock.sendMessage(jid, { text: '✅ Bot test message at ' + new Date().toLocaleString() }).then(function() {
    res.json({ success: true, sent: true, to: jid });
  }).catch(function(err) {
    res.status(500).json({ error: err.message || 'Send failed' });
  });
});

app.get('/api/reset-onboarding', adminAuth, function(req, res) {
  var onboarding = require('./src/services/onboardingService');
  onboarding.resetOnboarding();
  var client = require('./src/client');
  var sock = client.getClient();
  if (sock) {
    onboarding.startOnboarding(sock).then(function(sent) {
      res.json({ reset: true, welcomeSent: sent, admin: config.admins, botNumber: sock.user?.id });
    });
  } else {
    res.json({ reset: true, welcomeSent: false, error: 'Bot not connected yet' });
  }
});

app.get('/api/owner-check', adminAuth, function(req, res) {
  var client = require('./src/client');
  var sock = client.getClient();
  res.json({
    ownerNumber: config.admins,
    botNumber: sock?.user?.id || null,
    sameNumber: sock?.user?.id && config.admins[0] ? sock.user.id.startsWith(config.admins[0]) : false,
  });
});

function getDashboardUrl() {
  var pwd = process.env.DASHBOARD_PASSWORD || 'Omemi';
  var baseUrl = process.env.RENDER_EXTERNAL_URL;
  if (!baseUrl && process.env.RENDER_SERVICE_NAME) {
    baseUrl = 'https://' + process.env.RENDER_SERVICE_NAME + '.onrender.com';
  }
  if (!baseUrl) {
    var port = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
    baseUrl = 'http://localhost:' + port;
  }
  return baseUrl + '/dashboard?pwd=' + pwd;
}

function startSelfPing() {
  var http = require('http');
  var https = require('https');
  var pingIntervalMs = 2 * 60 * 1000; // 2 minutes (Render sleeps at 15m)

  setInterval(function() {
    var port = process.env.PORT || process.env.DASHBOARD_PORT || 3000;

    // 1. Internal Loopback Ping (keeps process event loop active inside container)
    try {
      http.get('http://127.0.0.1:' + port + '/ping', function(res) {}).on('error', function(e) {});
    } catch (e) {}

    // 2. External Hostname Ping (prevents Render Free Web Service idle sleep)
    var selfUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
    if (!selfUrl && process.env.RENDER_SERVICE_NAME) {
      selfUrl = 'https://' + process.env.RENDER_SERVICE_NAME + '.onrender.com';
    }
    if (!selfUrl) {
      selfUrl = 'https://nerd-eth-omemi-wa-bot-n540.onrender.com';
    }

    try {
      var pingTarget = selfUrl.replace(/\/$/, '') + '/ping';
      if (pingTarget.startsWith('https')) {
        var options = { rejectUnauthorized: false, headers: { 'User-Agent': 'Render-247-KeepAlive/2.0' } };
        https.get(pingTarget, options, function(res) {
          console.log('[24/7 SELF-PING] Pinged public endpoint (' + res.statusCode + ')');
        }).on('error', function(e) {});
      } else {
        http.get(pingTarget, function(res) {
          console.log('[24/7 SELF-PING] Pinged public endpoint (' + res.statusCode + ')');
        }).on('error', function(e) {});
      }
    } catch (e) {}
  }, pingIntervalMs);
}

function startServer(customPort) {
  var port = customPort || process.env.PORT || process.env.DASHBOARD_PORT || 3000;
  return app.listen(port, '0.0.0.0', function() {
    var dashUrl = getDashboardUrl();
    console.log('\n====================================================');
    console.log('🌐 ADMIN DASHBOARD URL (OPEN TO SCAN QR / PAIR CODE):');
    console.log('👉 ' + dashUrl);
    console.log('====================================================\n');
    startSelfPing();
  });
}

module.exports = {
  app,
  startServer,
  setConnected,
  setDisconnected,
  logMessage,
  logCommand,
  getDashboardUrl,
  botStatus,
  setSessionManager,
  getActiveSessionManager,
  defaultSessionManager
};
