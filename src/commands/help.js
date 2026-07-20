const { getCommandsList, getCommandByName } = require('../handlers/commandHandler');
const { getUptime } = require('../client');
const { formatDuration } = require('../utils/helpers');

module.exports = {
  name: 'help',
  alias: ['h', 'menu', 'commands'],
  description: 'Show all available commands',
  usage: '!help [command]',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (args) {
      var cmd = getCommandByName(args);
      if (cmd) {
        var text = '*┏━━━━━━━━━━━━━━━┓*\n';
        text += ' *Command: ' + cmd.name + '*\n';
        text += '*┗━━━━━━━━━━━━━━━┛*\n\n';
        text += '*▸ Description:*\n' + cmd.description + '\n\n';
        text += '*▸ Usage:*\n`' + cmd.usage + '`\n';
        if (cmd.alias) {
          var aliases = Array.isArray(cmd.alias) ? cmd.alias.join('`, `') : cmd.alias;
          text += '\n*▸ Aliases:*\n`' + aliases + '`\n';
        }
        if (cmd.restricted) {
          text += '\n*▸ Restriction:* Requires `' + (cmd.restrictedFeature || cmd.name) + '` access\n';
        }
        if (cmd.adminOnly) {
          text += '\n*▸ Restriction:* Admin only\n';
        }
        return sock.sendMessage(sender, { text: text.substring(0, 4000) });
      }
      return sock.sendMessage(sender, { text: 'Command "' + args + '" not found.\nUse `!help` to see all available commands.' });
    }

    var commands = getCommandsList();
    var uptime = formatDuration(getUptime());

    var general = commands.filter(function(c) { return !c.adminOnly; });
    var admin = commands.filter(function(c) { return c.adminOnly; });

    var text = '';
    text += '*┏━━━━━━━━━━━━━━━━━━━━━━━━┓*\n';
    text += ' *🤖 ' + ctx.pushName + '\'s Bot*     \n';
    text += '*┗━━━━━━━━━━━━━━━━━━━━━━━━┛*\n\n';
    text += '*⏱ Uptime:* ' + uptime + '\n';
    text += '*📌 Prefix:* `' + require('../../config').prefix + '`\n';
    text += '*👤 Total Commands:* ' + commands.length + '\n\n';

    if (general.length) {
      text += '*━━━ General Commands ━━━*\n\n';
      general.forEach(function(c) {
        text += '▸ `' + c.usage + '`\n';
        text += '  ' + c.description + '\n';
        if (c.restricted) text += '  _Requires: ' + (c.restrictedFeature || c.name) + ' access_\n';
        text += '\n';
      });
    }

    if (admin.length) {
      text += '*━━━ Admin Commands ━━━*\n\n';
      admin.forEach(function(c) {
        text += '▸ `' + c.usage + '`\n';
        text += '  ' + c.description + '\n\n';
      });
    }

    text += '*━━━━━━━━━━━━━━━━━━━━━*\n';
    text += '_Use `!help <command>` for detailed help on a specific command._';
    await sock.sendMessage(sender, { text: text.substring(0, 4000) });
  },
};
