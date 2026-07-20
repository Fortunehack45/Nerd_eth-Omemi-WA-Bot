var express = require('express');
var path = require('path');
var fs = require('fs');
var { loadJson } = require('./src/utils/helpers');
var config = require('./config');

var app = express();
var PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
var DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'admin';

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

function auth(req, res, next) {
  var pwd = req.query.pwd || req.headers['x-dashboard-password'];
  if (pwd === DASHBOARD_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized. Add ?pwd=yourpassword or set DASHBOARD_PASSWORD in .env' });
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

app.get('/api/qr', auth, function(req, res) {
  var client = require('./src/client');
  var qr = client.getLastQR();
  if (!qr) return res.json({ qr: null, message: 'No QR available. Bot may already be connected.' });
  var qrFile = path.join(__dirname, 'storage', 'qr.png');
  if (fs.existsSync(qrFile)) {
    return res.sendFile(qrFile);
  }
  res.json({ qr: qr, message: 'QR image not found. Use /api/qrdata for raw text.' });
});

app.get('/api/qrdata', auth, function(req, res) {
  var client = require('./src/client');
  var qr = client.getLastQR();
  res.json({ qr: qr || null });
});

app.post('/api/pair', auth, function(req, res) {
  var phone = req.body.phone;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  var cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length < 10) return res.status(400).json({ error: 'Invalid phone number (min 10 digits)' });
  var client = require('./src/client');
  client.requestPairingCode(cleaned).then(function(code) {
    res.json({ success: true, code: code, phone: cleaned });
  }).catch(function(err) {
    res.status(500).json({ error: err.message || 'Pairing failed' });
  });
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

app.get('/api/health', function(req, res) {
  res.json({ status: botStatus.connected ? 'online' : 'offline', time: Date.now() });
});

function startServer() {
  app.listen(PORT, '0.0.0.0', function() {
    console.log('Dashboard: http://0.0.0.0:' + PORT + '/dashboard?pwd=' + DASHBOARD_PASSWORD);
  });
}

module.exports = { startServer, setConnected, setDisconnected, logMessage, logCommand, botStatus };
