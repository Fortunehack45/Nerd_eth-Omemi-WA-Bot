var path = require('path');
var fs = require('fs');
var { loadJson, saveJson } = require('../utils/helpers');
var config = require('../../config');

var ONBOARDING_FILE = path.join(__dirname, '..', '..', 'storage', 'onboarding.json');

function isOnboarded() {
  var data = loadJson(ONBOARDING_FILE, { completed: false });
  return data.completed === true;
}

function markOnboarded() {
  saveJson(ONBOARDING_FILE, { completed: true, completedAt: Date.now() });
}

function resetOnboarding() {
  saveJson(ONBOARDING_FILE, { completed: false });
}

function getOnboardingStatus() {
  var data = loadJson(ONBOARDING_FILE, { completed: false });
  return data;
}

function waitForConnection(sock, maxWaitMs) {
  return new Promise(function(resolve) {
    if (sock && sock.user && sock.user.id) return resolve(true);
    var waited = 0;
    var interval = setInterval(function() {
      waited += 1000;
      if (sock && sock.user && sock.user.id) {
        clearInterval(interval);
        resolve(true);
      } else if (waited >= maxWaitMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 1000);
  });
}

async function startOnboarding(sock) {
  if (isOnboarded()) return false;
  var admins = Array.isArray(config.admins) && config.admins.length > 0 ? config.admins : [];
  if (admins.length === 0) {
    markOnboarded();
    return false;
  }

  var adminJid = admins[0] + '@s.whatsapp.net';
  if (!adminJid || adminJid === '@s.whatsapp.net') {
    markOnboarded();
    return false;
  }

  if (sock && sock.user && sock.user.id && adminJid === sock.user.id.split(':')[0]) {
    console.log('Onboarding skipped: admin number is the same as bot number (cannot self-message)');
    return false;
  }

  var connected = await waitForConnection(sock, 60000);
  if (!connected) {
    console.error('Onboarding skipped: no connection within 60s');
    return false;
  }

  try {
    var steps = [];
    steps.push('*🎉 Welcome to Nerd-eth Bot!*\n');
    steps.push('I\'m your new WhatsApp assistant. Let\'s get you set up quickly!\n');
    steps.push('*Step 1:* Choose my persona');
    steps.push('▸ Use `!persona male` for *Nerd-eth* 🤖 (male)');
    steps.push('▸ Use `!persona female` for *Omemi* 👩‍💻 (female)');
    steps.push('');
    steps.push('*Step 2:* Explore what I can do');
    steps.push('▸ `!help` — See all commands');
    steps.push('▸ `!ping` — Check if I\'m alive');
    steps.push('▸ Just send me a message and I\'ll chat with you!\n');
    steps.push('*Step 3:* Configure me');
    steps.push('▸ `!profile set name <your name>` — Tell me your name');
    steps.push('▸ `!remember <note>` — Save important notes');
    steps.push('▸ `!access add <number>` — Grant friends access to AI features\n');
    steps.push('I\'m ready when you are! 🚀');

    await sock.sendMessage(adminJid, { text: steps.join('\n') });
    markOnboarded();
    return true;
  } catch (err) {
    console.error('Onboarding failed:', err.message);
    return false;
  }
}

module.exports = { isOnboarded, markOnboarded, resetOnboarding, startOnboarding, getOnboardingStatus };
