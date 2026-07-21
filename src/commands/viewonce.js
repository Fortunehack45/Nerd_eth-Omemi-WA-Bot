var fs = require('fs');
var { listSavedMedia, getSavedMedia, getLastSavedMedia, deleteSavedMedia, getStorageStats } = require('../services/viewOnceService');

var HELP = '*📸 View-Once Media*\n\nView, list, and manage saved view-once media (images, videos, voice notes).\n\n*Usage:* `!viewonce [show|list|delete|stats] [id]`\n\n*Subcommands:*\n  `show [id]`         View the last saved media or a specific ID\n  `list`              List all saved media\n  `delete <id>`       Delete a saved media\n  `stats`             Show storage statistics\n\n*Flags:*\n  `--type`, `-t` image|video|audio  Filter by type\n  `--limit`, `-l` N                 Number of results (default: 20)\n\n*Examples:*\n  `!viewonce`                   (shows most recent view-once)\n  `!viewonce show`              (shows most recent view-once)\n  `!viewonce show 1712345678000` (shows specific ID)\n  `!viewonce list`              (lists all saved media)\n  `!viewonce stats`             (shows storage usage)';

module.exports = {
  name: 'viewonce',
  alias: ['vo', 'saved'],
  description: 'Manage saved view-once media (admin only)',
  usage: '!viewonce [show|list|delete|stats] [id]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (args === '--help' || args === '-h' || args === 'help') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parts = args ? args.trim().split(/\s+/) : [];
    var sub = parts[0] ? parts[0].toLowerCase() : 'show';
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
          text += '▸ *ID:* `' + item.id + '`\n';
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
      case 'view':
      case 'last':
      case 'latest': {
        var id = rest[0];
        var item = null;

        if (!id || id.toLowerCase() === 'last' || id.toLowerCase() === 'latest') {
          item = getLastSavedMedia();
          if (!item) {
            return sock.sendMessage(sender, { text: '⚠️ No saved view-once media found.\n\n' + HELP });
          }
        } else {
          item = getSavedMedia(id);
          if (!item) {
            return sock.sendMessage(sender, { text: '⚠️ Media with ID "' + id + '" not found. Use `!viewonce list` to view saved IDs.' });
          }
        }

        if (!fs.existsSync(item.filePath)) {
          return sock.sendMessage(sender, { text: '⚠️ File no longer exists on disk.' });
        }

        var buffer = fs.readFileSync(item.filePath);
        var captionText = '📸 *View-Once Media*\n▸ From: ' + item.senderName + '\n▸ ID: `' + item.id + '`\n▸ Saved: ' + new Date(item.timestamp).toLocaleString();
        if (item.caption) {
          captionText += '\n▸ Caption: ' + item.caption;
        }

        var msgOptions = { caption: captionText };

        try {
          if (item.mediaType === 'image') {
            msgOptions.image = buffer;
            await sock.sendMessage(sender, msgOptions);
          } else if (item.mediaType === 'video') {
            msgOptions.video = buffer;
            await sock.sendMessage(sender, msgOptions);
          } else if (item.mediaType === 'audio' || item.mediaType === 'voice') {
            await sock.sendMessage(sender, {
              audio: buffer,
              mimetype: 'audio/ogg; codecs=opus',
              ptt: (item.mediaType === 'voice'),
            });
            await sock.sendMessage(sender, { text: captionText });
          } else if (item.mediaType === 'document') {
            msgOptions.document = buffer;
            msgOptions.fileName = item.fileName || 'document.bin';
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
