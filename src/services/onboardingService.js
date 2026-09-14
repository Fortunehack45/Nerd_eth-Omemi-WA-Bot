var path = require('path');
var fs = require('fs');
var { loadJson, saveJson, parseJid } = require('../utils/helpers');
var config = require('../../config');

var ONBOARDING_FILE = path.join(__dirname, '..', '..', 'storage', 'onboarding.json');

function isOnboarded(targetJid) {
  var data = loadJson(ONBOARDING_FILE, { completed: false, completedUsers: [] });
  if (targetJid) {
    var clean = parseJid(targetJid);
    return Array.isArray(data.completedUsers) && data.completedUsers.includes(clean);
  }
  return data.completed === true;
}

function markOnboarded(targetJid) {
  var data = loadJson(ONBOARDING_FILE, { completed: false, completedUsers: [] });
  data.completed = true;
  data.completedAt = Date.now();
  if (targetJid) {
    var clean = parseJid(targetJid);
    if (!Array.isArray(data.completedUsers)) data.completedUsers = [];
    if (!data.completedUsers.includes(clean)) data.completedUsers.push(clean);
  }
  saveJson(ONBOARDING_FILE, data);
}

function resetOnboarding() {
  saveJson(ONBOARDING_FILE, { completed: false, completedUsers: [] });
}

function getOnboardingStatus() {
  var data = loadJson(ONBOARDING_FILE, { completed: false, completedUsers: [] });
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

async function startOnboarding(sock, force, explicitTarget) {
  var connected = await waitForConnection(sock, 30000);
  if (!connected || !sock || !sock.user) {
    console.error('[Onboarding] Skipped: WhatsApp socket not fully ready within 30s');
    return false;
  }

  // Determine target JID(s)
  var botNumber = parseJid(sock.user.id);
  var targetCandidate = explicitTarget ? parseJid(explicitTarget) : botNumber;

  if (!force && targetCandidate && isOnboarded(targetCandidate)) {
    return false;
  }

  var targets = new Set();
  if (targetCandidate) {
    targets.add(targetCandidate + '@s.whatsapp.net');
  } else {
    var ownerNumber = config.admins && config.admins[0] ? parseJid(config.admins[0]) : '';
    if (ownerNumber) targets.add(ownerNumber + '@s.whatsapp.net');
  }

  if (targets.size === 0) {
    console.error('[Onboarding] Failed: Could not resolve valid target JID');
    return false;
  }

  try {
    var steps = [];
    steps.push('🤖 *Nerd-eth WhatsApp Bot Connected!*');
    steps.push('──────────────────────────────');
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

    for (var targetJid of targets) {
      try {
        await sock.sendMessage(targetJid, {
          image: { url: 'https://iili.io/Cwvlxwv.png' },
          caption: welcomeCaption
        });
        console.log('[Onboarding] ✅ Welcome message delivered to: ' + targetJid);
      } catch (e1) {
        try {
          await sock.sendMessage(targetJid, { text: welcomeCaption });
          console.log('[Onboarding] ✅ Welcome text message delivered to: ' + targetJid);
        } catch (e2) {
          console.error('[Onboarding Error] Failed to send welcome message to ' + targetJid + ':', e2.message);
        }
      }
    }

    markOnboarded(targetCandidate);
    return true;
  } catch (err) {
    console.error('[Onboarding Error]', err.message);
    return false;
  }
}

module.exports = { isOnboarded, markOnboarded, resetOnboarding, startOnboarding, getOnboardingStatus };
