/**
 * !banaccount — Admin Account Ban & Counter-Attack Command
 *
 * Allows admins to target a specific WhatsApp account to:
 *  1. Block the account on WhatsApp
 *  2. Kick the account from the current group (if bot is admin)
 *  3. Report the target account to WhatsApp server
 *  4. Add to persistent blocked bot database
 */

const { banAccount, parseJid } = require('../services/antiBotService');

const HELP = `*🔨 Account Ban & Counter-Attack* (Admin Only)

Execute target account ban countermeasures: block account on WhatsApp, kick from group, and report to server.

*Usage:*
  \`!banaccount <number | reply_to_message>\`
  \`!targetban <number>\`
  \`!botban <number>\`

*Examples:*
  \`!banaccount 2348012345678\`
  \`!banaccount\` (while replying to a message from target account)
`;

module.exports = {
  name: 'banaccount',
  alias: ['targetban', 'accountban', 'botban'],
  description: 'Target-ban an account: block on WhatsApp, kick from group, report to server (Admin Only)',
  usage: '!banaccount <number | reply>',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    var targetNumber = '';
    var groupJid = sender.endsWith('@g.us') ? sender : null;

    // Check if replying to a message
    var quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quoted) {
      targetNumber = quoted;
    } else if (args) {
      targetNumber = args.trim().split(/\s+/)[0];
    }

    if (!targetNumber) {
      return sock.sendMessage(sender, { text: HELP });
    }

    await sock.sendMessage(sender, { text: '⚡ *Executing Account Ban Counter-Measures...*\nTarget: `' + targetNumber + '`' });

    var res = await banAccount(sock, targetNumber, groupJid);

    if (!res.success) {
      return sock.sendMessage(sender, { text: '❌ Error: ' + res.error });
    }

    var text = '*🔨 Account Ban Executed Successfully!*\n\n';
    text += '👤 *Target:* `' + res.target + '`\n\n';
    text += '*Actions Completed:*\n';
    res.actionsTaken.forEach(function(act) {
      text += '▸ ✅ ' + act + '\n';
    });

    if (res.errors && res.errors.length > 0) {
      text += '\n*Notes:*\n';
      res.errors.forEach(function(err) {
        text += '▸ ⚠️ ' + err + '\n';
      });
    }

    await sock.sendMessage(sender, { text });
  },
};
