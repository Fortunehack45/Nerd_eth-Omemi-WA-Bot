const { getCommandsList, getCommandByName } = require('../handlers/commandHandler');
const { getUptime } = require('../client');
const { formatDuration } = require('../utils/helpers');
const config = require('../../config');

module.exports = {
  name: 'help',
  alias: ['h', 'menu', 'commands', '❓', '📜', '📖'],
  description: 'Show all available bot commands, short form aliases, emoji shortcuts, and usage examples',
  usage: '!help [command]',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (args) {
      var query = args.trim().toLowerCase().replace(/^!/, '');
      var cmd = getCommandByName(query);
      if (cmd) {
        var text = '*┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓*\n';
        text += '  *COMMAND DETAILS: !' + cmd.name.toUpperCase() + '*\n';
        text += '*┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛*\n\n';
        text += '*▸ Description:*\n' + cmd.description + '\n\n';
        text += '*▸ Primary Usage:*\n`' + cmd.usage + '`\n\n';
        
        if (cmd.alias) {
          var aliases = Array.isArray(cmd.alias) ? cmd.alias.join('`, `!') : cmd.alias;
          text += '*▸ Short Forms & Emoji Shortcuts:*\n`!' + aliases + '`\n\n';
        }
        
        if (cmd.examples && cmd.examples.length) {
          text += '*▸ Practical Examples:*\n';
          cmd.examples.forEach(function(ex) {
            text += '  • `' + ex + '`\n';
          });
          text += '\n';
        } else {
          text += '*▸ Practical Examples:*\n';
          text += '  • `' + cmd.usage + '`\n\n';
        }

        if (cmd.adminOnly) {
          text += '*▸ Permission Level:* 👑 Admin / Owner Only\n';
        } else if (cmd.restricted) {
          text += '*▸ Permission Level:* 🔒 Requires `' + (cmd.restrictedFeature || cmd.name) + '` access privilege\n';
        } else {
          text += '*▸ Permission Level:* 🌐 Public (All Users)\n';
        }

        return sock.sendMessage(sender, { text: text.substring(0, 4000) });
      }
      return sock.sendMessage(sender, { text: '❌ Command `' + args + '` not found.\nUse `!help` to list all ' + getCommandsList().length + ' available commands.' });
    }

    var commands = getCommandsList();
    var uptime = formatDuration(getUptime());

    var general = commands.filter(function(c) { return !c.adminOnly; });
    var admin = commands.filter(function(c) { return c.adminOnly; });

    var text = '';
    text += '*┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓*\n';
    text += '   *🤖 ' + config.botName + ' MASTER COMMAND MENU*   \n';
    text += '*┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛*\n\n';
    text += '⏱ *Uptime:* ' + uptime + '\n';
    text += '📌 *Prefix:* `' + config.prefix + '`\n';
    text += '👤 *Total Commands:* ' + commands.length + '\n';
    text += '💡 *Tip:* All commands support prefix `!`, short forms, and emoji shortcuts!\n\n';

    if (general.length) {
      text += '*━━━ 🌐 PUBLIC COMMANDS (' + general.length + ') ━━━*\n\n';
      general.forEach(function(c) {
        var aliasStr = c.alias ? (Array.isArray(c.alias) ? c.alias.slice(0, 3).join(', ') : c.alias) : '';
        text += '▸ *' + c.name.toUpperCase() + '* `' + c.usage + '`\n';
        if (aliasStr) text += '  _Short/Emoji:_ `!' + aliasStr.replace(/,/g, '`, `!') + '`\n';
        text += '  ' + c.description + '\n\n';
      });
    }

    if (admin.length) {
      text += '*━━━ 👑 ADMIN COMMANDS (' + admin.length + ') ━━━*\n\n';
      admin.forEach(function(c) {
        var aliasStr = c.alias ? (Array.isArray(c.alias) ? c.alias.slice(0, 3).join(', ') : c.alias) : '';
        text += '▸ *' + c.name.toUpperCase() + '* `' + c.usage + '`\n';
        if (aliasStr) text += '  _Short/Emoji:_ `!' + aliasStr.replace(/,/g, '`, `!') + '`\n';
        text += '  ' + c.description + '\n\n';
      });
    }

    text += '====================================\n';
    text += '_Type `!help <command>` for detailed examples and usage guide._';

    await sock.sendMessage(sender, { text: text.substring(0, 4000) });
  },
};
