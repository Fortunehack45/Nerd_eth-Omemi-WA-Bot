var { switchPersona, getPersona, listPersonas } = require('../services/personaService');

module.exports = {
  name: 'persona',
  alias: ['mode', 'gender', 'identity', 'botname'],
  description: 'Switch bot persona between Nerd-eth (male) and Omemi (female)',
  usage: '!persona — show current persona\n!persona male — switch to Nerd-eth (male)\n!persona female — switch to Omemi (female)\n!persona list — list all available personas',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args) {
      var current = getPersona();
      var text = '*👤 Current Persona*\n\n';
      text += '*Name:* ' + current.name + ' ' + current.emoji + '\n';
      text += '*Pronouns:* ' + current.pronounCap + '/' + current.possessiveCap + '\n';
      text += '*Description:* ' + current.description + '\n\n';
      text += '*Available:*\n';
      var all = listPersonas();
      all.forEach(function(p) {
        text += '▸ *' + p.name + '* (' + p.mode + ') — ' + p.pronoun + '/' + p.possessive + '\n';
      });
      text += '\n*Switch:* `!persona male` or `!persona female`';
      return sock.sendMessage(sender, { text: text.substring(0, 4000) });
    }

    var mode = args.trim().toLowerCase();

    if (mode === 'list' || mode === 'all') {
      var all = listPersonas();
      var text = '*👤 Available Personas*\n\n';
      all.forEach(function(p) {
        text += '▸ *' + p.name + '* (`' + p.mode + '`)\n';
        text += '  ' + p.description + '\n';
        text += '  Pronouns: ' + p.pronoun + '/' + p.possessive + ' ' + p.emoji + '\n\n';
      });
      text += 'Use `!persona male` or `!persona female` to switch.';
      return sock.sendMessage(sender, { text: text.substring(0, 4000) });
    }

    var result = switchPersona(mode);
    if (result.error) {
      return sock.sendMessage(sender, { text: result.error + '\n\nUse `!persona list` to see available personas.' });
    }

    var p = result.persona;
    await sock.sendMessage(sender, {
      text: '✅ Switched to *' + p.name + '* ' + p.emoji + '\n\n' + p.greeting + '\n\nFrom now on, I\'ll use "' + p.pronounCap + '/' + p.possessiveCap + '" pronouns.\nUse `!persona` anytime to check or switch again.',
    });
  },
};
