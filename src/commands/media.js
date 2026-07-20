var fs = require('fs');
var path = require('path');
var { loadJson, saveJson, parseFlags } = require('../utils/helpers');

var HELP = '*📁 Media Manager*\n\nView, send, and manage files — images, videos, audio, documents.\n\n*Usage:* `!media <subcommand> [args]`\n\n*Subcommands:*\n  `send <path>`      Send a file from the server path\n  `list [dir]`       List files in a directory\n  `info <path>`      Show file information\n  `recent`           Show recent downloads and generated files\n\n*Examples:*\n  `!media list storage/generated`\n  `!media send storage/generated/report.pdf`\n  `!media info storage/viewonce/photo.jpg`';

module.exports = {
  name: 'media',
  alias: ['file', 'files', 'view', 'sendfile'],
  description: 'View, send, and manage files on the server',
  usage: '!media send <path> | list [dir] | info <path> | recent',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parsed = parseFlags(args);
    var sub = parsed.positional[0] && parsed.positional[0].toLowerCase();
    var rest = parsed.positional.slice(1).join(' ');
    var flags = parsed.flags;

    var baseDirs = [path.join(__dirname, '..', '..', 'storage'), path.join(__dirname, '..', '..')];
    function resolveSafe(p) {
      if (!p) return null;
      var resolved = path.resolve(p);
      for (var b of baseDirs) {
        if (resolved.startsWith(path.resolve(b))) return resolved;
      }
      return null;
    }

    switch (sub) {
      case 'send':
      case 'open':
      case 'view': {
        var filePath = resolveSafe(rest);
        if (!filePath) return sock.sendMessage(sender, { text: 'Invalid or unsafe path. Only storage/ directory is accessible.\n\nExample: `!media send storage/generated/file.pdf`' });
        if (!fs.existsSync(filePath)) return sock.sendMessage(sender, { text: 'File not found: ' + rest });

        try {
          var stat = fs.statSync(filePath);
          if (stat.size > 100 * 1024 * 1024) return sock.sendMessage(sender, { text: 'File too large (max 100MB). Size: ' + (stat.size / 1024 / 1024).toFixed(1) + 'MB' });

          var buffer = fs.readFileSync(filePath);
          var ext = path.extname(filePath).toLowerCase();
          var msgOpts = {};

          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
            msgOpts.image = buffer;
            msgOpts.caption = '📸 *' + path.basename(filePath) + '*\n' + formatBytes(stat.size);
          } else if (['.mp4', '.webm', '.mkv', '.mov', '.avi'].includes(ext)) {
            msgOpts.video = buffer;
            msgOpts.caption = '🎬 *' + path.basename(filePath) + '*\n' + formatBytes(stat.size);
          } else if (['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext)) {
            msgOpts.audio = buffer;
            msgOpts.mimetype = 'audio/mpeg';
          } else if (['.pdf', '.docx', '.doc', '.txt', '.md', '.json', '.zip', '.rar'].includes(ext)) {
            msgOpts.document = buffer;
            msgOpts.fileName = path.basename(filePath);
            msgOpts.mimetype = getMime(ext);
          } else {
            msgOpts.document = buffer;
            msgOpts.fileName = path.basename(filePath);
            msgOpts.mimetype = 'application/octet-stream';
          }

          await sock.sendMessage(sender, msgOpts);
        } catch (err) {
          await sock.sendMessage(sender, { text: 'Error sending file: ' + err.message });
        }
        break;
      }

      case 'list':
      case 'ls':
      case 'dir': {
        var dirPath = rest ? path.resolve(rest) : path.join(__dirname, '..', '..', 'storage');
        if (!fs.existsSync(dirPath)) return sock.sendMessage(sender, { text: 'Directory not found: ' + rest });
        var items = fs.readdirSync(dirPath);
        var dirs = [];
        var files = [];
        items.forEach(function(item) {
          var full = path.join(dirPath, item);
          try {
            if (fs.statSync(full).isDirectory()) dirs.push(item + '/');
            else files.push(item);
          } catch (e) {}
        });

        var text = '*📁 Directory Listing*\n';
        text += '*Path:* ' + dirPath + '\n';
        text += '*Total:* ' + items.length + ' items\n\n';

        if (dirs.length) {
          text += '*Folders:*\n';
          dirs.forEach(function(d) { text += '  📂 ' + d + '\n'; });
          text += '\n';
        }
        if (files.length) {
          text += '*Files:*\n';
          files.slice(0, 30).forEach(function(f) {
            var fpath = path.join(dirPath, f);
            try {
              var sz = fs.statSync(fpath).size;
              text += '  📄 ' + f + ' (' + formatBytes(sz) + ')\n';
            } catch (e) { text += '  📄 ' + f + '\n'; }
          });
          if (files.length > 30) text += '  ...and ' + (files.length - 30) + ' more\n';
        }

        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      case 'info':
      case 'details':
      case 'stat': {
        var filePath = resolveSafe(rest);
        if (!filePath) return sock.sendMessage(sender, { text: 'Invalid path.' });
        if (!fs.existsSync(filePath)) return sock.sendMessage(sender, { text: 'Not found: ' + rest });

        var stat = fs.statSync(filePath);
        var text = '*📄 File Info*\n\n';
        text += '*Name:* ' + path.basename(filePath) + '\n';
        text += '*Path:* ' + filePath + '\n';
        text += '*Size:* ' + formatBytes(stat.size) + '\n';
        text += '*Created:* ' + new Date(stat.birthtime).toLocaleString() + '\n';
        text += '*Modified:* ' + new Date(stat.mtime).toLocaleString() + '\n';
        text += '*Type:* ' + (stat.isDirectory() ? 'Directory' : 'File') + '\n';
        text += '\n*Send it:* `!media send ' + rest + '`';
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      case 'recent':
      case 'latest':
      case 'new': {
        var storage = path.join(__dirname, '..', '..', 'storage');
        var allFiles = [];
        function walk(dir) {
          try {
            var entries = fs.readdirSync(dir);
            entries.forEach(function(e) {
              var full = path.join(dir, e);
              var stat;
              try { stat = fs.statSync(full); } catch (ex) { return; }
              if (stat.isDirectory()) walk(full);
              else allFiles.push({ name: e, path: full, mtime: stat.mtimeMs, size: stat.size });
            });
          } catch (err) {}
        }
        walk(storage);
        allFiles.sort(function(a, b) { return b.mtime - a.mtime; });
        var recent = allFiles.slice(0, 15);

        var text = '*📂 Recent Files*\n\n';
        recent.forEach(function(f, i) {
          var rel = path.relative(path.join(__dirname, '..', '..'), f.path);
          text += (i + 1) + '. *' + f.name + '*\n';
          text += '   ' + formatBytes(f.size) + ' | ' + new Date(f.mtime).toLocaleString() + '\n';
          text += '   `!media send ' + rel + '`\n\n';
        });

        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      default:
        await sock.sendMessage(sender, { text: 'Unknown: `' + sub + '`. Use `!media --help` for commands.' });
    }
  },
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getMime(ext) {
  var map = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
  };
  return map[ext] || 'application/octet-stream';
}
