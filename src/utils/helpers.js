const fs = require('fs');
const path = require('path');

function extractCommand(text) {
  if (!text || typeof text !== 'string') return { command: '', args: '', fullText: '' };
  const parts = text.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase() || '';
  const args = parts.slice(1).join(' ') || '';
  return { command, args, fullText: text.trim() };
}

function parseJid(jid) {
  if (!jid || typeof jid !== 'string') return '';
  var clean = jid.split('@')[0].split(':')[0];
  return clean.replace(/[^0-9]/g, '');
}

function isOwner(jid, ownerNumbers) {
  const sender = parseJid(jid);
  return ownerNumbers.some(owner => parseJid(owner) === sender);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseFlags(args) {
  const parts = args.trim().split(/\s+/);
  const positional = [];
  const flags = {};
  const shortMap = {};

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];

    if (p.startsWith('--')) {
      const eqIdx = p.indexOf('=');
      if (eqIdx !== -1) {
        const key = p.slice(2, eqIdx);
        const val = p.slice(eqIdx + 1);
        flags[key] = val || true;
      } else {
        const key = p.slice(2);
        const next = parts[i + 1];
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (p.startsWith('-') && !p.startsWith('--') && p.length > 1) {
      const rest = p.slice(1);
      if (rest.length === 1) {
        const key = rest;
        const next = parts[i + 1];
        shortMap[key] = true;
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      } else {
        for (const ch of rest) {
          flags[ch] = true;
          shortMap[ch] = true;
        }
      }
    } else {
      positional.push(p);
    }
  }

  return { positional, flags, shortMap };
}

function formatFlagHelp(flags) {
  return flags.map(f => {
    const short = f.short ? `-${f.short}, ` : '    ';
    const long = `--${f.name}`;
    const val = f.value ? ` <${f.value}>` : '';
    return `  ${short}${long}${val}    ${f.desc}`;
  }).join('\n');
}

function formatSubcommandHelp(name, desc, usage, subcommands, flags) {
  let text = `*${name}* — ${desc}\n\n`;
  text += `*Usage:* \`${usage}\`\n\n`;
  if (subcommands && subcommands.length) {
    text += '*Subcommands:*\n';
    text += subcommands.map(s => `  \`${s.name}\`    ${s.desc}`).join('\n');
    text += '\n\n';
  }
  if (flags && flags.length) {
    text += '*Flags:*\n';
    text += formatFlagHelp(flags);
  }
  return text;
}

function paginate(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const pages = [];
  let remaining = text;
  while (remaining.length > 0) {
    let split = remaining.lastIndexOf('\n\n', maxLen);
    if (split === -1 || split > maxLen) split = remaining.lastIndexOf('\n', maxLen);
    if (split === -1 || split > maxLen) split = maxLen;
    pages.push(remaining.slice(0, split));
    remaining = remaining.slice(split).trimStart();
  }
  return pages;
}

function saveJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadJson(filePath, defaultVal = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) { }
  return defaultVal;
}

async function sendAudioMessage(sock, sender, filePath, title, author) {
  const { execFile } = require('child_process');
  var ffmpegPath = null;
  try { ffmpegPath = require('ffmpeg-static'); } catch (e) {}

  if (!fs.existsSync(filePath)) {
    await sock.sendMessage(sender, { text: '❌ Audio file not found.' });
    return;
  }

  // Build a meaningful filename: "Artist - Title.mp3" when both are known
  var cleanTitle  = (title  || 'Audio Track').replace(/[<>:"/\\|?*\r\n]/g, '_').trim().substring(0, 80);
  var cleanAuthor = (author || '').replace(/[<>:"/\\|?*\r\n]/g, '_').trim().substring(0, 60);
  var isGenericAuthor = !cleanAuthor || ['Unknown Artist', 'Spotify', 'YouTube', 'Download'].includes(cleanAuthor);
  var baseName = isGenericAuthor ? cleanTitle : (cleanAuthor + ' - ' + cleanTitle);
  var fileName  = baseName.substring(0, 110) + '.mp3';

  var taggedPath = filePath.replace(/\.[^.]+$/, '') + '_tagged.mp3';
  var taggedOk   = false;

  // 1. Embed ID3 title + artist metadata so WhatsApp audio player shows the correct song name
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    try {
      await new Promise(function(resolve, reject) {
        var metaArgs = [];
        if (cleanTitle)  metaArgs.push('-metadata', 'title='  + cleanTitle);
        if (!isGenericAuthor) metaArgs.push('-metadata', 'artist=' + cleanAuthor);
        var args = ['-y', '-i', filePath, '-c', 'copy', '-id3v2_version', '3'].concat(metaArgs).concat([taggedPath]);
        execFile(ffmpegPath, args, { timeout: 30000 }, function(err) {
          if (!err && fs.existsSync(taggedPath) && fs.statSync(taggedPath).size > 1000) {
            resolve();
          } else {
            reject(err || new Error('ffmpeg ID3 output invalid'));
          }
        });
      });
      taggedOk = true;
    } catch (e) {
      console.warn('[sendAudioMessage] ID3 tagging skipped:', e && e.message);
    }
  }

  var sendPath = (taggedOk && fs.existsSync(taggedPath)) ? taggedPath : filePath;
  var caption = '🎵 *' + cleanTitle + '*';
  if (!isGenericAuthor) caption += '\n👤 ' + cleanAuthor;

  // 2. Send as document with audio/mpeg MIME type.
  //    WhatsApp ALWAYS shows the fileName for document-type messages.
  //    Sending as `audio` type causes WA to assign a random ID (e.g. "aaaghJ784").
  try {
    var buf = fs.readFileSync(sendPath);
    await sock.sendMessage(sender, {
      document: buf,
      mimetype: 'audio/mpeg',
      fileName: fileName,
      caption: caption,
    });
  } catch (err) {
    console.warn('[sendAudioMessage] Document send failed, falling back to audio type:', err.message);
    try {
      var buf2 = fs.readFileSync(sendPath);
      await sock.sendMessage(sender, {
        audio: buf2,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: fileName,
      });
    } catch (err2) {
      console.error('[sendAudioMessage] All send attempts failed:', err2.message);
      await sock.sendMessage(sender, { text: '❌ Failed to send audio: ' + err2.message });
    }
  } finally {
    try { if (fs.existsSync(filePath))  fs.unlinkSync(filePath);  } catch (e) {}
    try { if (fs.existsSync(taggedPath)) fs.unlinkSync(taggedPath); } catch (e) {}
  }
}

module.exports = {
  extractCommand,
  parseJid,
  isOwner,
  formatBytes,
  formatDuration,
  sleep,
  sanitizeFileName,
  saveJson,
  loadJson,
  randomBetween,
  parseFlags,
  formatFlagHelp,
  formatSubcommandHelp,
  paginate,
  sendAudioMessage,
};
