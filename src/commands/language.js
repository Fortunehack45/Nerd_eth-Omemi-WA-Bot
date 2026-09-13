const { getLanguage, setLanguage } = require('../services/memoryService');
const { parseJid } = require('../utils/helpers');

const POPULAR_LANGUAGES = [
  'English', 'Spanish (Español)', 'French (Français)', 'Arabic (العربية)',
  'Yoruba (Èdè Yorùbá)', 'Hausa (Harshen Hausa)', 'Igbo (Asụsụ Igbo)',
  'Portuguese (Português)', 'German (Deutsch)', 'Russian (Русский)',
  'Hindi (हिन्दी)', 'Chinese (中文)', 'Japanese (日本語)', 'Swahili (Kiswahili)'
];

const HELP = `*🌐 Language Preference & Multilingual AI*

Set your preferred language for the bot! The bot understands and responds fluently in *any* language worldwide.

*Usage:*
  \`!language <language_name>\`   — Set your language (e.g. Spanish, French, Yoruba)
  \`!language auto\`              — Automatically detect language from your messages
  \`!language\`                   — Check your current language setting

*Popular Languages:*
${POPULAR_LANGUAGES.map(l => `▸ ${l}`).join('\n')}

*Examples:*
  \`!language Spanish\`
  \`!lang French\`
  \`!lang Yoruba\`
  \`!lang Arabic\`
  \`!lang auto\`
`;

module.exports = {
  name: 'language',
  alias: ['lang', 'setlang', 'idioma', 'tongue'],
  description: 'Set or view your preferred language for bot interactions and AI',
  usage: '!language [language_name|auto]',
  adminOnly: false,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var senderId = ctx.senderId || sender;

    if (!args || args.trim() === '' || args.trim() === '--help' || args.trim() === '-h') {
      var currentLang = getLanguage(senderId);
      var text = '*🌐 Language Settings*\n\n';
      text += `👤 *Your Current Language:* *${currentLang.toUpperCase()}*\n`;
      if (currentLang === 'auto') {
        text += '_Auto-detection active: The bot will detect and reply in whatever language you write in._\n\n';
      } else {
        text += `_The bot will always reply to you in ${currentLang}._\n\n`;
      }
      text += HELP;
      return sock.sendMessage(sender, { text: text });
    }

    var chosenLang = args.trim();
    if (chosenLang.toLowerCase() === 'auto' || chosenLang.toLowerCase() === 'default') {
      setLanguage(senderId, 'auto');
      return sock.sendMessage(sender, {
        text: '🌐 *Language Set to Auto-Detection!*\n\nThe bot will automatically detect whatever language you write in and reply back in that exact same language naturally! 🚀'
      });
    }

    var low = chosenLang.toLowerCase();
    const LANG_MAP = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
      pt: 'Portuguese', ru: 'Russian', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese',
      ko: 'Korean', hi: 'Hindi', yo: 'Yoruba', ha: 'Hausa', ig: 'Igbo', sw: 'Swahili'
    };
    var formattedLang = LANG_MAP[low] || (chosenLang.charAt(0).toUpperCase() + chosenLang.slice(1));
    setLanguage(senderId, formattedLang);

    var confirmText = `🌐 *Language Updated Successfully!*\n\n` +
      `Your preferred language has been set to: *${formattedLang}*.\n\n` +
      `The AI assistant and conversations will now respond to you in *${formattedLang}*! 🚀\n\n` +
      `_Type \`!language auto\` anytime to revert to automatic language detection._`;

    return sock.sendMessage(sender, { text: confirmText });
  },
};
