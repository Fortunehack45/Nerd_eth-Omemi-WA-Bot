var express = require('express');
var path = require('path');
var fs = require('fs');
var { loadJson } = require('./src/utils/helpers');
var config = require('./config');

var app = express();
var PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
var DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'Omemi';

var botStatus = { connected: false, user: null, uptime: 0, startTime: Date.now() };
var recentMessages = [];
var commandLog = [];

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
    user: botStatus.user,
    uptime: Math.floor((Date.now() - botStatus.startTime) / 1000)
  });
});

app.get('/', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/dashboard', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.use(express.static(path.join(__dirname, 'public')));

var validPasscodes = new Set();

app.post('/api/generate-access-key', auth, function(req, res) {
  var key = Math.floor(100000 + Math.random() * 900000).toString();
  validPasscodes.add(key);
  res.json({ success: true, key: key });
});

function isValidPassword(inputPwd) {
  // If no password sent or empty, allow access by default
  if (!inputPwd || String(inputPwd).trim() === '') return true;
  var trimmed = String(inputPwd).trim();

  // 1. Configured Dashboard Password
  var expected = process.env.DASHBOARD_PASSWORD || config.dashboardPassword || 'Omemi';
  if (trimmed === expected || trimmed.toLowerCase() === expected.toLowerCase()) return true;

  // 2. Default admin passwords
  var lower = trimmed.toLowerCase();
  if (lower === 'omemi' || lower === 'admin' || lower === 'nerd') return true;

  // 3. Dynamic generated passcodes (issued by authenticated admin)
  if (validPasscodes.has(trimmed)) return true;

  // 4. Custom per-user passwords from storage/user_passwords.json
  try {
    var userPassFile = path.join(__dirname, 'storage', 'user_passwords.json');
    if (fs.existsSync(userPassFile)) {
      var userPasses = JSON.parse(fs.readFileSync(userPassFile, 'utf8'));
      if (Object.values(userPasses).includes(trimmed)) return true;
    }
  } catch(e) {}

  return false;
}

function auth(req, res, next) {
  var pwd = req.query.pwd || req.headers['x-dashboard-password'] || (req.body && req.body.pwd);
  if (isValidPassword(pwd)) return next();
  return res.status(401).json({ error: 'Unauthorized. Use password "Omemi" or check DASHBOARD_PASSWORD.' });
}

app.get('/api/status', auth, function(req, res) {
  var p = require('./src/services/personaService');
  var persona = p.getPersona();
  var mem = require('./src/services/memoryService');
  var allUsers = mem.getAllUsers();
  var totalFacts = 0;
  allUsers.forEach(function(u) { totalFacts += (u.facts ? u.facts.length : 0); });

  var uptime = Math.floor((Date.now() - botStatus.startTime) / 1000);
  var h = Math.floor(uptime / 3600);
  var m = Math.floor((uptime % 3600) / 60);
  var s = uptime % 60;

  res.json({
    connected: botStatus.connected,
    botName: config.botName,
    persona: persona.name,
    personaEmoji: persona.emoji,
    user: botStatus.user,
    uptime: h + 'h ' + m + 'm ' + s + 's',
    uptimeSeconds: uptime,
    users: allUsers.length,
    facts: totalFacts,
    commands: require('./src/handlers/commandHandler').getCommandsList().length,
    prefix: config.prefix,
    pairingCode: (typeof require('./src/client').getLastPairingCode === 'function') ? require('./src/client').getLastPairingCode() : null,
    recentMessages: recentMessages.slice(0, 10),
    commandLog: commandLog.slice(0, 10),
  });
});

app.get('/api/users', auth, function(req, res) {
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

app.get('/api/user/:id', auth, function(req, res) {
  var mem = require('./src/services/memoryService');
  var jid = req.params.id.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  var user = mem.getUser(jid);
  res.json(user);
});

app.get('/api/logs', auth, function(req, res) {
  var logFile = path.join(__dirname, 'storage', 'bot.log');
  var logs = [];
  if (fs.existsSync(logFile)) {
    var content = fs.readFileSync(logFile, 'utf8');
    logs = content.split('\n').filter(Boolean).slice(-100);
  }
  res.json({ logs: logs, recentMessages: recentMessages.slice(0, 20), commands: commandLog.slice(0, 20) });
});

app.post('/api/speedtest', auth, async function(req, res) {
  var speedSvc = require('./src/services/speedTestService');
  var result = await speedSvc.runSpeedTest();
  res.json(result);
});

app.get('/api/qrdata', auth, async function(req, res) {
  var client = require('./src/client');
  var qr = client.getLastQR();
  var pairingCode = (typeof client.getLastPairingCode === 'function') ? client.getLastPairingCode() : null;
  if (!qr) return res.json({ qr: null, dataUrl: null, pairingCode: pairingCode, connected: botStatus.connected, user: botStatus.user });
  try {
    var QRCode = require('qrcode');
    var dataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320, errorCorrectionLevel: 'H' });
    res.json({ qr: qr, dataUrl: dataUrl, pairingCode: pairingCode, connected: botStatus.connected, user: botStatus.user });
  } catch (e) {
    res.json({ qr: qr, dataUrl: null, pairingCode: pairingCode, connected: botStatus.connected, user: botStatus.user, error: e.message });
  }
});

app.post('/api/refresh-qr', auth, function(req, res) {
  try {
    var client = require('./src/client');
    client.resetSession();
    res.json({ success: true, message: 'QR Code refreshed. Generating fresh handshake...' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Refresh failed' });
  }
});

app.post('/api/reset-session', auth, function(req, res) {
  try {
    var client = require('./src/client');
    client.resetSession();
    res.json({ success: true, message: 'Session reset! Stale credentials cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Reset failed' });
  }
});

app.get('/api/keys', auth, function(req, res) {
  var aiSvc = require('./src/services/aiService');
  res.json({
    provider: aiSvc.getProvider(),
    model: aiSvc.getModel(),
    groqSet: !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 5),
    openaiSet: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 5),
    openrouterSet: !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 5),
    braveSet: !!(process.env.BRAVE_SEARCH_API_KEY && process.env.BRAVE_SEARCH_API_KEY.length > 5),
  });
});

app.get('/api/features', auth, function(req, res) {
  var featSvc = require('./src/services/featureService');
  res.json(featSvc.getFeatureConfig());
});

app.post('/api/features/toggle', auth, function(req, res) {
  var featSvc = require('./src/services/featureService');
  var name = req.body.name;
  var action = req.body.action;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  var result = (action === 'disable') ? featSvc.disableItem(name) : featSvc.enableItem(name);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// Access Control Management Endpoints
app.get('/api/access', auth, function(req, res) {
  var acSvc = require('./src/services/accessControl');
  res.json({ enabled: config.access ? config.access.enabled : false, users: acSvc.listUsers() });
});

app.post('/api/access/add', auth, function(req, res) {
  var acSvc = require('./src/services/accessControl');
  var number = req.body.number;
  var name = req.body.name;
  var features = req.body.features;
  if (!number) return res.status(400).json({ error: 'Phone number is required' });
  var result = acSvc.addUser(number, features, name);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/access/remove', auth, function(req, res) {
  var acSvc = require('./src/services/accessControl');
  var number = req.body.number;
  if (!number) return res.status(400).json({ error: 'Phone number is required' });
  var result = acSvc.removeUser(number);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/access/toggle-feature', auth, function(req, res) {
  var acSvc = require('./src/services/accessControl');
  var number = req.body.number;
  var feature = req.body.feature;
  if (!number || !feature) return res.status(400).json({ error: 'Number and feature are required' });
  var result = acSvc.toggleFeature(number, feature);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/keys', auth, function(req, res) {
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

app.post('/api/test-ai', auth, async function(req, res) {
  try {
    var aiSvc = require('./src/services/aiService');
    var result = await aiSvc.testConnection();
    res.json({ success: result.success, response: result.text, provider: aiSvc.getProvider(), model: aiSvc.getModel() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pair', auth, async function(req, res) {
  var phone = req.body.phone;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  var client = require('./src/client');
  try {
    var code = await client.requestPairingCode(phone);
    res.json({ success: true, code: code, phone: phone });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Pairing request failed' });
  }
});

app.post('/api/test', auth, function(req, res) {
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

app.get('/api/reset-onboarding', auth, function(req, res) {
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

app.get('/api/owner-check', auth, function(req, res) {
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

module.exports = { app, startServer, setConnected, setDisconnected, logMessage, logCommand, getDashboardUrl, botStatus };
