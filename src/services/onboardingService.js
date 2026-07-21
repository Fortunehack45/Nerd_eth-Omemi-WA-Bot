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

  var connected = await waitForConnection(sock, 60000);
  if (!connected) {
    console.error('Onboarding skipped: no connection within 60s');
    return false;
  }

  var admins = Array.isArray(config.admins) && config.admins.length > 0 ? config.admins : [];
  var adminJid = admins[0] ? (admins[0] + '@s.whatsapp.net') : (sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null);
  if (!adminJid) return false;
  if (!connected) {
    console.error('Onboarding skipped: no connection within 60s');
    return false;
  }

  try {
    var steps = [];
    steps.push('*🎉 Welcome to Nerd-eth Bot!*\n');
    steps.push('I\'m your new WhatsApp assistant built for multi-purpose automation, AI, and media management!\n');
    steps.push('*👨‍💻 About the Creator:*');
    steps.push('Built by *Fortune Adebayo (AKA: Nerd_eth)* — Full-Stack & AI Software Engineer.');
    steps.push('🌐 *Portfolio:* https://fortuneadebayo.space/');
    steps.push('📲 *WhatsApp:* +234 916 768 9200');
    steps.push('𝕏 *Follow:* @OnNerd_eth\n');
    steps.push('*Step 1:* Choose my persona');
    steps.push('▸ Use `!persona male` for *Nerd-eth* 🤖 (male)');
    steps.push('▸ Use `!persona female` for *Omemi* 👩‍💻 (female)\n');
    steps.push('*Step 2:* Explore what I can do');
    steps.push('▸ `!help` — See all commands');
    steps.push('▸ `!ping` — Check bot health');
    steps.push('▸ `!apk <app>` — Download Android APKs');
    steps.push('▸ `!music play <song>` — Stream & download music\n');
    steps.push('*Step 3:* Configure me');
    steps.push('▸ `!profile set name <your name>` — Tell me your name');
    steps.push('▸ `!remember <note>` — Save important notes');
    steps.push('▸ `!access add <number>` — Grant friends AI access\n');
    steps.push('I\'m ready when you are! 🚀');

    var welcomeCaption = steps.join('\n');
    var targetJid = adminJid;
    if (sock && sock.user && sock.user.id) {
      targetJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    }

    try {
      await sock.sendMessage(targetJid, {
        image: { url: 'https://iili.io/Cwvlxwv.png' },
        caption: welcomeCaption
      });
    } catch (e) {
      await sock.sendMessage(targetJid, { text: welcomeCaption });
    }
    markOnboarded();
    return true;
  } catch (err) {
    console.error('Onboarding failed:', err.message);
    return false;
  }
}

module.exports = { isOnboarded, markOnboarded, resetOnboarding, startOnboarding, getOnboardingStatus };
