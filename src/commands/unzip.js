var fs = require('fs');
var path = require('path');
var { spawn } = require('child_process');
var AdmZip = null;
try { AdmZip = require('adm-zip'); } catch (e) {}

var HELP = '*📦 Unzip / Extract*\n\nExtract compressed files (ZIP, RAR, TAR, GZ).\n\n*Usage:* `!unzip <filepath>`\n\n*Examples:*\n  `!unzip storage/downloads/archive.zip`\n  `!unzip storage/something.rar`\n\n*Flags:*\n  `--output, -o`   Extract to a specific directory\n  `--list, -l`     Just list contents without extracting';

module.exports = {
  name: 'unzip',
  alias: ['extract', 'zip', 'archive', 'compress'],
  description: 'Extract compressed files: ZIP, RAR, TAR, GZ',
  usage: '!unzip <filepath> [--output dir] [--list]',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parsed = require('../utils/helpers').parseFlags(args);
    var filePath = parsed.positional.join(' ');
    var flags = parsed.flags;
    var listOnly = flags.list || flags.l;

    if (!filePath) return sock.sendMessage(sender, { text: 'Please provide a file path.\n\n*Usage:* `!unzip <filepath>`\n*Example:* `!unzip storage/downloads/archive.zip`' });

    var resolved = path.resolve(filePath);
    var storageDir = path.resolve(path.join(__dirname, '..', '..', 'storage'));
    if (!resolved.startsWith(storageDir)) {
      return sock.sendMessage(sender, { text: '⛔ Security: Only files inside the storage/ directory can be extracted.' });
    }

    if (!fs.existsSync(resolved)) {
      return sock.sendMessage(sender, { text: 'File not found: ' + filePath + '\nCheck the path with `!media list` or `!media recent`' });
    }

    var ext = path.extname(resolved).toLowerCase();
    await sock.sendMessage(sender, { text: '📦 Processing: ' + path.basename(resolved) + '...' });

    if (ext === '.zip') {
      await handleZip(sock, sender, resolved, flags, listOnly);
    } else if (ext === '.rar') {
      await handleRar(sock, sender, resolved, flags, listOnly);
    } else if (ext === '.tar' || ext === '.gz' || ext === '.tgz') {
      await handleTarGz(sock, sender, resolved, flags, listOnly);
    } else {
      await sock.sendMessage(sender, { text: 'Unsupported format: ' + ext + '\nSupported: .zip, .rar, .tar, .gz, .tgz' });
    }
  },
};

async function handleZip(sock, sender, filePath, flags, listOnly) {
  try {
    var outputDir = flags.output || flags.o || filePath.replace(/\.zip$/i, '_extracted');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    if (AdmZip) {
      var zip = new AdmZip(filePath);
      var entries = zip.getEntries();

      if (listOnly) {
        var text = '*📦 ZIP Contents: ' + path.basename(filePath) + '*\n\n';
        entries.forEach(function(e, i) {
          text += (i + 1) + '. ' + (e.isDirectory ? '📂 ' : '📄 ') + e.entryName + ' (' + formatSize(e.header.size) + ')\n';
        });
        text += '\nTotal: ' + entries.length + ' entries';
        return sock.sendMessage(sender, { text: text.substring(0, 4000) });
      }

      zip.extractAllTo(outputDir, true);
      var text = '✅ Extracted to: `' + outputDir + '`\n';
      text += 'Files: ' + entries.length + '\n\n';
      text += 'View with: `!media list ' + outputDir + '`';
      await sock.sendMessage(sender, { text: text.substring(0, 4000) });
    } else {
      await sock.sendMessage(sender, { text: '⚠️ adm-zip not installed. Install it with: npm install adm-zip\n\nFallback: Use `!terminal powershell Expand-Archive -Path "' + filePath + '" -DestinationPath "' + outputDir + '"`' });
    }
  } catch (err) {
    await sock.sendMessage(sender, { text: 'Extraction failed: ' + err.message });
  }
}

async function handleRar(sock, sender, filePath, flags, listOnly) {
  try {
    var outputDir = flags.output || flags.o || filePath.replace(/\.rar$/i, '_extracted');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    await sock.sendMessage(sender, { text: '🔧 RAR extraction requires 7-Zip or unrar on your system.\n\n' + (listOnly ? 'Listing...' : 'Extracting...') + '\n\nTry one of these:\n  `!terminal 7z l "' + filePath + '"` (list)\n  `!terminal 7z x "' + filePath + '" -o"' + outputDir + '"` (extract)\n  `!terminal unrar e "' + filePath + '" "' + outputDir + '"`' });
  } catch (err) {
    await sock.sendMessage(sender, { text: 'Error: ' + err.message });
  }
}

async function handleTarGz(sock, sender, filePath, flags, listOnly) {
  try {
    var outputDir = flags.output || flags.o || filePath.replace(/\.(tar|gz|tgz)$/i, '_extracted');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    var cmd = filePath.endsWith('.gz') && !filePath.endsWith('.tar.gz') && !filePath.endsWith('.tgz')
      ? 'tar -xzf "' + filePath + '" -C "' + outputDir + '"'
      : 'tar -xzf "' + filePath + '" -C "' + outputDir + '"';

    if (listOnly) {
      await sock.sendMessage(sender, { text: '📄 Listing TAR contents. Use: `!terminal tar -tzf "' + filePath + '"`' });
    } else {
      var { exec } = require('child_process');
      exec(cmd, { timeout: 30000 }, async function(error, stdout, stderr) {
        if (error) {
          await sock.sendMessage(sender, { text: 'Extraction failed: ' + error.message + '\n\nOn Windows, use: `!terminal 7z x "' + filePath + '" -o"' + outputDir + '"`' });
        } else {
          await sock.sendMessage(sender, { text: '✅ Extracted to: `' + outputDir + '`\nView with: `!media list ' + outputDir + '`' });
        }
      });
    }
  } catch (err) {
    await sock.sendMessage(sender, { text: 'Error: ' + err.message });
  }
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
