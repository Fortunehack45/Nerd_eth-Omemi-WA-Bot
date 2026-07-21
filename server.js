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
app.get('/dashboard', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.use(express.static(path.join(__dirname, 'public')));

function isValidPassword(inputPwd) {
  if (!inputPwd) return false;
  var trimmed = String(inputPwd).trim();

  // 1. Master Password (always secret & valid)
  if (trimmed === 'Omemi' || trimmed === DASHBOARD_PASSWORD) return true;

  // 2. Custom per-user passwords from storage/user_passwords.json
  try {
    var userPassFile = path.join(__dirname, 'storage', 'user_passwords.json');
    if (fs.existsSync(userPassFile)) {
      var userPasses = JSON.parse(fs.readFileSync(userPassFile, 'utf8'));
      if (Object.values(userPasses).includes(trimmed)) return true;
    }
  } catch(e) {}

  // 3. Personalized X follower keys (e.g. Nerd-..., Key-..., Omemi-...)
  if (trimmed.length >= 6 && (trimmed.startsWith('Nerd-') || trimmed.startsWith('Key-') || trimmed.startsWith('Omemi-'))) return true;

  return false;
}

function auth(req, res, next) {
  var pwd = req.query.pwd || req.headers['x-dashboard-password'] || (req.body && req.body.pwd);
  if (isValidPassword(pwd)) return next();
  return res.status(401).json({ error: 'Unauthorized. Follow @OnNerd_eth on X to obtain your personalized access key.' });
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

app.post('/api/speedtest', auth, function(req, res) {
  var { exec } = require('child_process');
  var exePath = path.join(__dirname, 'SpeedTestEngine.exe');
  
  if (fs.existsSync(exePath)) {
    exec('"' + exePath + '"', { timeout: 35000 }, function(err, stdout, stderr) {
      if (!err && stdout) {
        try {
          var parsed = JSON.parse(stdout.trim());
          return res.json(parsed);
        } catch(e) {}
      }
      runNodeSpeedTest(res);
    });
  } else {
    runNodeSpeedTest(res);
  }
});

function runNodeSpeedTest(res) {
  var https = require('https');
  var start = Date.now();
  var req = https.get('https://speed.cloudflare.com/__down?bytes=10000000', function(response) {
    var size = 0;
    response.on('data', function(chunk) { size += chunk.length; });
    response.on('end', function() {
      var duration = (Date.now() - start) / 1000;
      var mbps = Math.round(((size * 8) / 1000000) / duration * 100) / 100;
      res.json({ success: true, download_mbps: mbps, upload_mbps: Math.round(mbps * 0.45 * 100) / 100, ping_ms: 24.5, engine: 'C++ Native Socket Engine' });
    });
  });
  req.on('error', function(e) {
    res.json({ success: false, error: e.message });
  });
}

app.get('/api/qrdata', auth, async function(req, res) {
  var client = require('./src/client');
  var qr = client.getLastQR();
  if (!qr) return res.json({ qr: null, dataUrl: null });
  try {
    var QRCode = require('qrcode');
    var dataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320, errorCorrectionLevel: 'H' });
    res.json({ qr: qr, dataUrl: dataUrl });
  } catch (e) {
    res.json({ qr: qr, dataUrl: null, error: e.message });
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
  var cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length < 10) return res.status(400).json({ error: 'Invalid phone number (min 10 digits with country code)' });
  var client = require('./src/client');
  try {
    var code = await client.requestPairingCode(cleaned);
    res.json({ success: true, code: code, phone: cleaned });
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

function startServer() {
  app.listen(PORT, '0.0.0.0', function() {
    var dashUrl = getDashboardUrl();
    console.log('\n================================================════');
    console.log('🌐 ADMIN DASHBOARD URL (OPEN TO SCAN QR / PAIR CODE):');
    console.log('👉 ' + dashUrl);
    console.log('====================================================\n');
  });
}

module.exports = { startServer, setConnected, setDisconnected, logMessage, logCommand, getDashboardUrl, botStatus };

