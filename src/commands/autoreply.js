const { saveJson, loadJson } = require('../utils/helpers');
const path = require('path');

const AUTO_REPLY_FILE = path.join(__dirname, '..', '..', 'storage', 'autoreply.json');

module.exports = {
  name: 'autoreply',
  alias: ['ar', 'auto'],
  description: 'Manage auto-replies. Add/remove/list keyword-based auto responses',
  usage: '!autoreply add <keyword>|<response> | !autoreply remove <keyword> | !autoreply list',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;
    const replies = loadJson(AUTO_REPLY_FILE, {});

    if (!args) {
      return sock.sendMessage(sender, {
        text: '*Auto-Reply Commands:*\n'
          + '▸ `!autoreply add <keyword>|<response>` - Add auto-reply\n'
          + '▸ `!autoreply remove <keyword>` - Remove auto-reply\n'
          + '▸ `!autoreply list` - List all auto-replies',
      });
    }

    const parts = args.split(/\s+/);
    const subCmd = parts[0].toLowerCase();

    switch (subCmd) {
      case 'add': {
        const rest = parts.slice(1).join(' ');
        const sepIndex = rest.indexOf('|');
        if (sepIndex === -1) {
          return sock.sendMessage(sender, {
            text: 'Usage: !autoreply add <keyword>|<response>\nExample: !autoreply add hello|Hi there! How can I help?',
          });
        }
        const keyword = rest.substring(0, sepIndex).trim().toLowerCase();
        const response = rest.substring(sepIndex + 1).trim();
        if (!keyword || !response) {
          return sock.sendMessage(sender, { text: 'Keyword and response are required.' });
        }
        replies[keyword] = response;
        saveJson(AUTO_REPLY_FILE, replies);
        await sock.sendMessage(sender, {
          text: `✅ Auto-reply added!\n"${keyword}" -> "${response}"`,
        });
        break;
      }

      case 'remove':
      case 'delete':
      case 'del': {
        const keyword = parts.slice(1).join(' ').trim().toLowerCase();
        if (!keyword) {
          return sock.sendMessage(sender, { text: 'Usage: !autoreply remove <keyword>' });
        }
        if (replies[keyword]) {
          delete replies[keyword];
          saveJson(AUTO_REPLY_FILE, replies);
          await sock.sendMessage(sender, { text: `✅ Auto-reply "${keyword}" removed.` });
        } else {
          await sock.sendMessage(sender, { text: `Auto-reply "${keyword}" not found.` });
        }
        break;
      }

      case 'list': {
        const keys = Object.keys(replies);
        if (keys.length === 0) {
          return sock.sendMessage(sender, { text: 'No auto-replies configured.' });
        }
        let text = '*📋 Auto-Replies*\n\n';
        keys.forEach(k => {
          text += `▸ *${k}* -> ${replies[k].substring(0, 50)}${replies[k].length > 50 ? '...' : ''}\n`;
        });
        await sock.sendMessage(sender, { text });
        break;
      }

      default:
        await sock.sendMessage(sender, { text: `Unknown subcommand. Use !autoreply for help.` });
    }
  },
};
