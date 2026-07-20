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
  return jid?.replace(/[^0-9]/g, '') || '';
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
};
