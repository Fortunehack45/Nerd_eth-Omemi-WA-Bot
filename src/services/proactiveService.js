const config = require('../../config');
const { addFact, addToConversation } = require('./memoryService');
const { getPersona } = require('./personaService');

var GREETINGS = ['hi', 'hello', 'hey', 'good morning', 'good evening', 'good afternoon', 'howdy', 'yo', 'sup', 'heyy', 'whats up', "what's up", 'wassup'];
var THANKS = ['thank', 'thanks', 'thx', 'appreciate', 'gracias', 'ty', 'thank you'];
var FAREWELLS = ['bye', 'goodbye', 'see you', 'cya', 'later', 'gtg', 'gotta go'];
var HELP_SIGNALS = ['help', 'how do', 'what can', 'what do', 'how to', 'i need help', 'can you help', 'commands?', 'menu?'];
var QUESTIONS = /\b(who|what|when|where|why|how|is|are|do|does|did|can|could|would|will|shall|should|which|has|have|was|were)\b/i;

function detectIntent(text) {
  var lower = text.toLowerCase().trim();

  if (HELP_SIGNALS.some(function(h) { return lower === h || lower.startsWith(h) || lower.endsWith(h); })) {
    return 'help';
  }

  if (GREETINGS.some(function(g) { return lower === g || lower.startsWith(g + ' ') || lower.startsWith(g + '!') || lower.startsWith(g + '.') || lower === g + ' bot'; })) {
    return 'greeting';
  }

  if (FAREWELLS.some(function(f) { return lower === f || lower === f + '!' || lower.startsWith(f + ' ') || lower === 'good ' + f; })) {
    return 'farewell';
  }

  if (THANKS.some(function(t) { return lower.includes(t) || lower.endsWith(t) || lower.startsWith(t); })) {
    return 'thanks';
  }

  if (lower.includes('your name') || lower.includes('who are you') || lower.includes('what are you')) {
    return 'whoami';
  }

  if (lower === 'ping' || lower === 'pong') {
    return 'ping';
  }

  return null;
}

function getProactiveResponse(intent, botName, pushName) {
  var name = pushName || 'there';
  var persona = getPersona();
  var emoji = persona.emoji;
  switch (intent) {
    case 'greeting':
      var msgs = [
        emoji + ' Hey ' + name + '! How can I help you today?',
        emoji + ' Hello ' + name + '! What can I do for you?',
        emoji + ' Hi ' + name + '! Ready to help — just ask or use `' + config.prefix + 'help` to see what I can do!',
        emoji + ' Hey there ' + name + '! What brings you here today?',
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];

    case 'farewell':
      var msgs = [
        'Goodbye ' + name + '! 👋 Have a great day!',
        'See you later, ' + name + '! 😊 Come back anytime!',
        'Bye ' + name + '! ✨ Take care!',
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];

    case 'thanks':
      var msgs = [
        "You're welcome, " + name + '! 😊 Happy to help!',
        'Anytime, ' + name + '! 👍 Glad I could assist!',
        'My pleasure, ' + name + '! 💪 That\'s what I\'m here for!',
        'You got it, ' + name + '! 🎉 Let me know if you need anything else!',
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];

    case 'help':
      return 'Hey ' + name + '! 👋 I can do a lot of things!\n\n' +
        '▸ *Chat with AI* — Just talk to me or use `' + config.prefix + 'ai <question>`\n' +
        '▸ *Search the web* — `' + config.prefix + 'search <query>`\n' +
        '▸ *Generate images* — `' + config.prefix + 'imagine <description>`\n' +
        '▸ *Music* — `' + config.prefix + 'music search <song>`\n' +
        '▸ *Movies* — `' + config.prefix + 'movie search <film>`\n' +
        '▸ *Download* — `' + config.prefix + 'download <url>`\n' +
        '▸ *Generate files* — `' + config.prefix + 'generate pdf <content>`\n' +
        '▸ *See all commands* — `' + config.prefix + 'help`\n' +
        '\nJust send me a message and I\'ll respond! ' + emoji;

    case 'whoami':
      return 'I am *' + persona.name + '*! ' + emoji + ' Your personal WhatsApp assistant.\n\n' +
        'I ' + (persona.pronoun === 'she' ? 'identify' : 'am') + ' ' + persona.pronoun + '/' + persona.possessive + '.\n\n' +
        'I can chat, search the web, play music, get movie info, download media, generate files, and much more.\n' +
        'Use `' + config.prefix + 'help` to see everything I can do!\n' +
        persona.footer;

    case 'ping':
      return '🏓 Pong! I\'m alive and ready! ⚡';

    default:
      return null;
  }
}

async function handleProactive(sock, sender, text, pushName) {
  var intent = detectIntent(text);
  if (!intent) return false;

  var response = getProactiveResponse(intent, config.botName, pushName);
  if (!response) return false;

  if (config.memory.enabled) {
    addToConversation(sender, 'assistant', response);
  }

  await sock.sendPresenceUpdate('composing', sender);
  var delay = 500 + Math.floor(Math.random() * 1000);
  await new Promise(function(r) { setTimeout(r, delay); });

  if (['greeting', 'help', 'whoami'].includes(intent)) {
    try {
      await sock.sendMessage(sender, {
        image: { url: 'https://iili.io/Cwvlxwv.png' },
        caption: response
      });
      return true;
    } catch (e) {}
  }

  await sock.sendMessage(sender, { text: response });
  return true;
}

function isQuestion(text) {
  return QUESTIONS.test(text.trim());
}

module.exports = { detectIntent, getProactiveResponse, handleProactive, isQuestion };
