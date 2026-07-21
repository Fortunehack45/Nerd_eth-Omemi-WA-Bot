var fs = require('fs');
var {
  listSavedMedia,
  getSavedMedia,
  getLastSavedMedia,
  findByMessageId,
  findRecentByChatOrSender,
  deleteSavedMedia,
  getStorageStats,
  saveViewOnce,
  detectViewOnce,
  getViewOnceContent,
} = require('../services/viewOnceService');

var HELP = [
  '*📸 View-Once Media Manager* (Admin Only)',
  '',
  'Automatically saves all view-once media sent in any chat.',
  'Retrieve by replying to any view-once OR using the commands below.',
  '',
  '*Usage:*',
  '  `!viewonce show`           → Shows the most recently saved view-once',
  '  `!viewonce show <id>`      → Shows a specific saved view-once by ID',
  '  `!viewonce list`           → Lists all saved view-once media',
  '  `!viewonce delete <id>`    → Deletes a saved view-once by ID',
  '  `!viewonce stats`          → Shows storage usage & statistics',
  '',
  '*💡 Quick Tip:*',
  '  Reply to any view-once message with `!vv` or `!rvo` or `!viewonce show` to instantly retrieve it.',
  '',
  '*Aliases:* `!vo`, `!saved`, `!vv`, `!rvo`, `!readviewonce`, `!reveal`, `!getvo`',
].join('\n');

module.exports = {
  name: 'viewonce',
  alias: ['vo', 'saved', 'rvo', 'readviewonce', 'vv', 'reveal', 'getvo'],
  description: 'Manage and retrieve saved view-once media (admin only)',
  usage: '!viewonce [show|list|delete|stats] [id]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (args === '--help' || args === '-h' || args === 'help') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parts = args ? args.trim().split(/\s+/) : [];
    var sub = parts[0] ? parts[0].toLowerCase() : 'show';

    // Handle when user types `!vv` or `!rvo` directly without subcommands
    if (sub !== 'show' && sub !== 'list' && sub !== 'ls' && sub !== 'all' && sub !== 'delete' && sub !== 'del' && sub !== 'remove' && sub !== 'stats' && sub !== 'info' && sub !== 'get' && sub !== 'view' && sub !== 'last' && sub !== 'latest' && sub !== 'retrieve') {
      // User passed an ID directly e.g. `!vv 1721550000` or just `!vv`
      if (/^\d+$/.test(sub)) {
        rest = [sub];
        sub = 'show';
      } else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        sub = 'show';
      }
    }

    var flags = {};

    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '--type' || parts[i] === '-t') {
        flags.type = parts[++i];
      } else if (parts[i] === '--limit' || parts[i] === '-l') {
        flags.limit = parseInt(parts[++i]);
      }
    }

    var rest = parts.slice(sub === 'show' || sub === 'list' || sub === 'delete' || sub === 'stats' ? 1 : 0);

    switch (sub) {
      // ── LIST ─────────────────────────────────────────────────────────────────
      case 'list':
      case 'ls':
      case 'all': {
        var type = flags.type;
        var limit = flags.limit || 20;
        var items = listSavedMedia(limit, type);
        if (items.length === 0) {
          return sock.sendMessage(sender, {
            text: '📂 No saved view-once media' + (type ? ' of type "' + type + '"' : '') + '.\n\nView-once media is automatically saved when someone sends it in any chat.',
          });
        }
        var text = '*📸 Saved View-Once Media (' + items.length + ' items)*\n\n';
        items.forEach(function(item, idx) {
          var date = new Date(item.timestamp).toLocaleString();
          var sizeStr = item.size > 1024 * 1024
            ? (item.size / 1024 / 1024).toFixed(1) + ' MB'
            : (item.size / 1024).toFixed(1) + ' KB';
          text += (idx + 1) + '. *' + item.mediaType.toUpperCase() + '* — from ' + item.senderName + '\n';
          text += '   🆔 `' + item.id + '` | 📦 ' + sizeStr + ' | 🕐 ' + date + '\n';
          text += '   👉 `!viewonce show ' + item.id + '`\n\n';
        });
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      // ── SHOW / GET (default) ─────────────────────────────────────────────────
      case 'show':
      case 'get':
      case 'view':
      case 'last':
      case 'latest':
      case 'retrieve': {
        // ── CASE A: Admin replied to a view-once message — find it in saved media ──
        var quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        var quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
        var stanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        var chatId = msg.key?.remoteJid;

        if (quotedMsg) {
          // PRIORITY 1: Look up already-saved media by the original message ID
          if (stanzaId) {
            var savedByMsgId = findByMessageId(stanzaId);
            if (savedByMsgId && fs.existsSync(savedByMsgId.filePath)) {
              await sendMediaItem(sock, sender, savedByMsgId);
              return;
            }
          }

          // PRIORITY 2: Look up recent saved media by sender or chat
          var recentSaved = findRecentByChatOrSender(chatId, quotedParticipant);
          if (recentSaved && fs.existsSync(recentSaved.filePath)) {
            await sendMediaItem(sock, sender, recentSaved);
            return;
          }

          // PRIORITY 3: Reconstruct the quoted message as a full Baileys message object
          var reconstructed = {
            key: {
              remoteJid: chatId || sender,
              fromMe: false,
              id: stanzaId || ('QUOTED_' + Date.now()),
              participant: quotedParticipant || '',
            },
            message: quotedMsg,
            pushName: msg.message?.extendedTextMessage?.contextInfo?.pushName || 'Unknown',
          };

          var isVO = detectViewOnce(reconstructed);
          if (isVO) {
            await sock.sendMessage(sender, { text: '📥 Detected view-once in reply — attempting to retrieve...' });
            try {
              var saveResult = await saveViewOnce(sock, reconstructed);
              if (saveResult && saveResult.success) {
                var savedItem = getSavedMedia(saveResult.id);
                if (savedItem && fs.existsSync(savedItem.filePath)) {
                  await sendMediaItem(sock, sender, savedItem);
                  return;
                }
              }
            } catch (e) {}

            var extracted = getViewOnceContent(reconstructed);
            if (extracted) {
              try {
                var buf = await sock.downloadMediaMessage({ key: reconstructed.key, message: extracted.inner });
                if (buf && buf.length > 0) {
                  var mtype = extracted.innerType.replace('Message', '').toLowerCase();
                  var caption = '*📸 View-Once Media (directly retrieved)*\n▸ From: ' + (quotedParticipant || 'Unknown') + '\n▸ Decrypted: ' + new Date().toLocaleString();
                  await sendBuffer(sock, sender, buf, mtype, caption);
                  return;
                }
              } catch (e2) {}
            }
          }

          // PRIORITY 4: Fallback to the latest saved item overall
          var lastFallback = getLastSavedMedia();
          if (lastFallback && fs.existsSync(lastFallback.filePath)) {
            await sendMediaItem(sock, sender, lastFallback);
            return;
          }

          return sock.sendMessage(sender, {
            text: '⚠️ Could not retrieve view-once from reply.\n\n💡 The bot automatically saves view-once media as soon as it arrives in any chat. Use `!viewonce list` to see all saved media.',
          });
        }

        // ── CASE B: No reply — show latest saved or a specific ID ──
        var id = rest[0];
        var item = null;

        if (!id || id.toLowerCase() === 'last' || id.toLowerCase() === 'latest') {
          item = getLastSavedMedia();
          if (!item) {
            return sock.sendMessage(sender, {
              text: '⚠️ No saved view-once media found.\n\n*How to use:*\n1️⃣ Bot automatically saves view-once media when anyone sends it in any chat.\n2️⃣ Reply to any view-once message with `!viewonce show`\n3️⃣ Or use `!viewonce list` to see all previously saved media.',
            });
          }
        } else {
          item = getSavedMedia(id);
          if (!item) {
            return sock.sendMessage(sender, {
              text: '⚠️ Media ID "' + id + '" not found.\n\nUse `!viewonce list` to see all saved IDs.',
            });
          }
        }

        if (!fs.existsSync(item.filePath)) {
          return sock.sendMessage(sender, {
            text: '⚠️ File for ID `' + item.id + '` no longer exists on disk.\n\nUse `!viewonce delete ' + item.id + '` to clean up the entry.',
          });
        }

        await sendMediaItem(sock, sender, item);
        break;
      }

      // ── DELETE ───────────────────────────────────────────────────────────────
      case 'delete':
      case 'del':
      case 'remove': {
        var delId = rest[0];
        if (!delId) return sock.sendMessage(sender, { text: 'Usage: `!viewonce delete <id>`\n\nGet IDs from `!viewonce list`' });
        var result = deleteSavedMedia(delId);
        if (result.error) return sock.sendMessage(sender, { text: '❌ Error: ' + result.error });
        await sock.sendMessage(sender, { text: '✅ View-once media `' + delId + '` has been deleted.' });
        break;
      }

      // ── STATS ────────────────────────────────────────────────────────────────
      case 'stats':
      case 'storage':
      case 'info': {
        var stats = getStorageStats();
        var totalSizeStr = stats.totalSize > 1024 * 1024 * 1024
          ? (stats.totalSize / 1024 / 1024 / 1024).toFixed(2) + ' GB'
          : stats.totalSize > 1024 * 1024
            ? (stats.totalSize / 1024 / 1024).toFixed(1) + ' MB'
            : (stats.totalSize / 1024).toFixed(1) + ' KB';
        var statText = '*📊 View-Once Storage Statistics*\n\n';
        statText += '📁 Total files saved: *' + stats.total + '*\n';
        statText += '💾 Total storage used: *' + totalSizeStr + '*\n\n';
        statText += '*By media type:*\n';
        for (var t in stats.byType) {
          var icons = { image: '🖼️', video: '🎬', audio: '🎵', voice: '🎤', document: '📄', unknown: '❓' };
          statText += '  ' + (icons[t] || '▸') + ' ' + t + ': ' + stats.byType[t] + ' file(s)\n';
        }
        statText += '\n_Use `!viewonce list` to browse all files._';
        await sock.sendMessage(sender, { text: statText });
        break;
      }

      default:
        await sock.sendMessage(sender, { text: '❓ Unknown subcommand: `' + sub + '`\n\n' + HELP });
    }
  },
};

// ─── Helper: Send a saved media item object ────────────────────────────────
async function sendMediaItem(sock, jid, item) {
  var buffer = fs.readFileSync(item.filePath);
  var caption = [
    '📸 *View-Once Media Revealed*',
    '▸ From: ' + item.senderName,
    '▸ Type: ' + item.mediaType.toUpperCase(),
    '▸ ID: `' + item.id + '`',
    '▸ Saved: ' + new Date(item.timestamp).toLocaleString(),
    item.caption ? '▸ Caption: ' + item.caption : '',
  ].filter(Boolean).join('\n');

  await sendBuffer(sock, jid, buffer, item.mediaType, caption, item);
}

// ─── Helper: Send a raw buffer as media ───────────────────────────────────
async function sendBuffer(sock, jid, buffer, mediaType, caption, item) {
  try {
    if (mediaType === 'image') {
      await sock.sendMessage(jid, { image: buffer, caption: caption });
    } else if (mediaType === 'video') {
      await sock.sendMessage(jid, { video: buffer, caption: caption });
    } else if (mediaType === 'audio' || mediaType === 'voice') {
      await sock.sendMessage(jid, {
        audio: buffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: (mediaType === 'voice'),
      });
      await sock.sendMessage(jid, { text: caption });
    } else if (mediaType === 'document') {
      await sock.sendMessage(jid, {
        document: buffer,
        fileName: (item && item.fileName) || 'document.bin',
        caption: caption,
      });
    } else {
      await sock.sendMessage(jid, { text: caption + '\n\nFile path: ' + ((item && item.filePath) || 'unknown') });
    }
  } catch (err) {
    await sock.sendMessage(jid, { text: '❌ Failed to send media: ' + err.message });
  }
}
