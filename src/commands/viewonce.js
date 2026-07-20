var fs = require('fs');
var { listSavedMedia, getSavedMedia, deleteSavedMedia, getStorageStats } = require('../services/viewOnceService');

var HELP = '*📸 View-Once Media*\n\nView, list, and manage saved view-once media (images, videos, voice notes).\n\n*Usage:* `!viewonce <subcommand>`\n\n*Subcommands:*\n  `list`              List all saved media\n  `show <id>`         View a specific media file\n  `delete <id>`       Delete a saved media\n  `stats`             Show storage statistics\n\n*Flags:*\n  `--type`, `-t` image|video|audio  Filter by type\n  `--limit`, `-l` N                 Number of results (default: 20)\n\n*Examples:*\n  `!viewonce list`\n  `!viewonce list --type image`\n  `!viewonce show 1712345678000`\n  `!viewonce delete 1712345678000`\n  `!viewonce stats`';

module.exports = {
  name: 'viewonce',
  alias: ['vo', 'viewonce', 'saved'],
  description: 'Manage saved view-once media (admin only)',
  usage: '!viewonce list | show <id> | delete <id> | stats',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parts = args.split(/\s+/);
    var sub = parts[0].toLowerCase();
    var flags = {};
    var rest = parts.slice(1);

    for (var i = 0; i < rest.length; i++) {
      if (rest[i] === '--type' || rest[i] === '-t') {
        flags.type = rest[++i];
      } else if (rest[i] === '--limit' || rest[i] === '-l') {
        flags.limit = parseInt(rest[++i]);
      }
    }

    switch (sub) {
      case 'list':
      case 'ls':
      case 'all': {
        var type = flags.type;
        var limit = flags.limit || 20;
        var items = listSavedMedia(limit, type);
        if (items.length === 0) {
          return sock.sendMessage(sender, { text: 'No saved view-once media' + (type ? ' of type "' + type + '"' : '') + '.' });
        }
        var text = '*📸 Saved View-Once Media*\n';
        if (type) text += ' (filtered: ' + type + ')';
        text += '\n\n';
        items.forEach(function(item) {
          var date = new Date(item.timestamp).toLocaleString();
          var size = item.size > 1024 * 1024 ? (item.size / 1024 / 1024).toFixed(1) + 'MB' : (item.size / 1024).toFixed(1) + 'KB';
          text += '▸ *ID:* ' + item.id + '\n';
          text += '   Type: ' + item.mediaType + ' | Size: ' + size + '\n';
          text += '   From: ' + item.senderName + ' | ' + date + '\n';
          text += '   Use: `!viewonce show ' + item.id + '`\n\n';
        });
        text += 'Total shown: ' + items.length;
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      case 'show':
      case 'get':
      case 'view': {
        var id = rest[0];
        if (!id) return sock.sendMessage(sender, { text: 'Usage: `!viewonce show <id>`\nGet the ID from `!viewonce list`' });
        var item = getSavedMedia(id);
        if (!item) return sock.sendMessage(sender, { text: 'Media with ID "' + id + '" not found.' });
        if (!fs.existsSync(item.filePath)) return sock.sendMessage(sender, { text: 'File no longer exists on disk.' });

        var buffer = fs.readFileSync(item.filePath);
        var msgOptions = { caption: '📸 View-once from ' + item.senderName + '\n' + new Date(item.timestamp).toLocaleString() };

        try {
          if (item.mediaType === 'image') {
            msgOptions.image = buffer;
            await sock.sendMessage(sender, msgOptions);
          } else if (item.mediaType === 'video') {
            msgOptions.video = buffer;
            await sock.sendMessage(sender, msgOptions);
          } else if (item.mediaType === 'audio' || item.mediaType === 'voice') {
            msgOptions.audio = buffer;
            msgOptions.mimetype = 'audio/ogg; codecs=opus';
            await sock.sendMessage(sender, msgOptions);
          } else {
            await sock.sendMessage(sender, { text: 'Unknown media type: ' + item.mediaType + '\nFile: ' + item.filePath });
          }
        } catch (err) {
          await sock.sendMessage(sender, { text: 'Error sending media: ' + err.message });
        }
        break;
      }

      case 'delete':
      case 'del':
      case 'remove': {
        var id = rest[0];
        if (!id) return sock.sendMessage(sender, { text: 'Usage: `!viewonce delete <id>`' });
        var result = deleteSavedMedia(id);
        if (result.error) return sock.sendMessage(sender, { text: 'Error: ' + result.error });
        await sock.sendMessage(sender, { text: '✅ View-once media #' + id + ' deleted.' });
        break;
      }

      case 'stats':
      case 'storage': {
        var stats = getStorageStats();
        var text = '*📊 View-Once Storage Stats*\n\n';
        text += 'Total files: ' + stats.total + '\n';
        text += 'Total size: ' + (stats.totalSize > 1024 * 1024 * 1024 ? (stats.totalSize / 1024 / 1024 / 1024).toFixed(2) + ' GB' : stats.totalSize > 1024 * 1024 ? (stats.totalSize / 1024 / 1024).toFixed(1) + ' MB' : (stats.totalSize / 1024).toFixed(1) + ' KB') + '\n\n';
        text += '*By type:*\n';
        for (var t in stats.byType) {
          text += '  ▸ ' + t + ': ' + stats.byType[t] + '\n';
        }
        text += '\n_Use `!viewonce list` to view files._';
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      default:
        await sock.sendMessage(sender, { text: 'Unknown: `' + sub + '`. Use `!viewonce --help` for commands.' });
    }
  },
};
