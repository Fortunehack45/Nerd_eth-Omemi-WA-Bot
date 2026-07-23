const { parseJid } = require('../utils/helpers');

const HELP = `*🎭 Reaction Commands & Emoji Reactions*

Send fun reactions or emoji reactions to messages!

*Commands:*
  \`!react <emoji>\`             React to a replied message with an emoji
  \`!hug @user\`                Send a warm hug reaction
  \`!kiss @user\`               Send a kiss reaction
  \`!slap @user\`               Send a slap reaction
  \`!pat @user\`                Send a head pat reaction
  \`!punch @user\`              Send a playful punch reaction
  \`!dance\`                    Send a dance reaction
  \`!laugh\`                    Send a laugh reaction
  \`!wink\`                     Send a wink reaction
  \`!wave\`                     Send a wave reaction

*Examples:*
  \`!react 🔥\` (replying to a message)
  \`!hug @John\`
  \`!slap @Alex\``;

const ACTIONS = {
  hug: { emoji: '🤗', text: 'gave a warm hug to' },
  kiss: { emoji: '😘', text: 'sent a sweet kiss to' },
  slap: { emoji: '🖐️', text: 'slapped' },
  pat: { emoji: '🫳', text: 'patted the head of' },
  punch: { emoji: '👊', text: 'punched' },
  dance: { emoji: '💃', text: 'is dancing with' },
  laugh: { emoji: '😂', text: 'is laughing at' },
  wink: { emoji: '😉', text: 'winked at' },
  wave: { emoji: '👋', text: 'waved at' },
  highfive: { emoji: '🙌', text: 'high-fived' }
};

module.exports = {
  name: 'react',
  alias: ['r', 'reaction', 'hug', 'kiss', 'slap', 'pat', 'punch', 'dance', 'laugh', 'wink', 'wave', 'highfive', '🤗', '😘', '🖐️', '👊', '💃', '😂', '😉', '👋'],
  description: 'Send message emoji reactions or fun roleplay reactions',
  usage: '!react <emoji> | !hug @user | !slap @user',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var senderId = ctx.senderId;
    var command = ctx.command;
    var isGroup = ctx.isGroup;

    // Check if command is a roleplay action alias (e.g. !hug, !slap)
    var actionKey = command.toLowerCase();
    if (ACTIONS[actionKey]) {
      var act = ACTIONS[actionKey];
      var contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                        msg.message?.imageMessage?.contextInfo ||
                        msg.message?.videoMessage?.contextInfo;
      
      var targetJid = contextInfo?.mentionedJid?.[0] || contextInfo?.participant;
      if (!targetJid && args) {
        var clean = args.replace(/[^0-9]/g, '');
        if (clean.length >= 7) targetJid = clean + '@s.whatsapp.net';
      }

      var callerTag = '@' + parseJid(senderId);
      var targetTag = targetJid ? '@' + parseJid(targetJid) : 'everyone';
      var mentions = targetJid ? [senderId, targetJid] : [senderId];

      var caption = act.emoji + ' ' + callerTag + ' ' + act.text + ' ' + targetTag + '!';

      await sock.sendMessage(sender, { text: caption, mentions: mentions });
      return;
    }

    // Standard !react command: react to quoted message or current message
    var emoji = args ? args.trim() : '👍';
    var contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    var targetKey = contextInfo?.stanzaId ? {
      remoteJid: sender,
      fromMe: false,
      id: contextInfo.stanzaId,
      participant: contextInfo.participant
    } : msg.key;

    try {
      await sock.sendMessage(sender, {
        react: {
          text: emoji,
          key: targetKey
        }
      });
    } catch (e) {
      await sock.sendMessage(sender, { text: '❌ Failed to send reaction: ' + e.message });
    }
  },
};
