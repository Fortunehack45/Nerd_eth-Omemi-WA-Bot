var { getAllUsers, getUser, updateUser, clearNotes } = require('../services/memoryService');
var { isAdmin } = require('../services/accessControl');
var path = require('path');
var fs = require('fs');
var { saveJson, loadJson } = require('../utils/helpers');
var config = require('../../config');

var MEMORY_FILE = path.join(__dirname, '..', '..', 'storage', 'users.json');
var CONVOS_DIR = path.join(__dirname, '..', '..', 'storage', 'conversations');

module.exports = {
  name: 'memoryadmin',
  alias: ['mem', 'memory', 'brains', 'database'],
  description: 'View, clear, or edit bot memory (admin only)',
  usage: '!memory stats | view [user] | clear [user|all] | edit <user> <field> <value> | reset',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args) {
      return sock.sendMessage(sender, {
        text: '*🧠 Memory Management* (Admin)\n\nManage everything the bot remembers.\n\n*Commands:*\n  `!memory stats`        — View memory statistics\n  `!memory view [user]`  — View a specific user\'s memory\n  `!memory clear <id>`   — Clear a user\'s facts & notes\n  `!memory clear all`    — WIPE ALL memory (!)\n  `!memory edit <id> <field> <value>`  — Edit a user field\n  `!memory reset`        — Reset ALL memory and conversations\n\n*Fields you can edit:* name, about, notes, pushName\n\n*Examples:*\n  `!memory stats`\n  `!memory view 2348012345678`\n  `!memory edit 2348012345678 name John`\n  `!memory edit 2348012345678 notes Important: VIP user`\n  `!memory clear 2348012345678`',
      });
    }

    var parts = args.split(/\s+/);
    var sub = parts[0].toLowerCase();
    var rest = parts.slice(1);

    switch (sub) {
      case 'stats':
      case 'statistics':
      case 'info': {
        var all = getAllUsers();
        var totalFacts = 0;
        var totalConvos = 0;
        all.forEach(function(u) { totalFacts += (u.facts ? u.facts.length : 0); });

        var convosDir = CONVOS_DIR;
        if (fs.existsSync(convosDir)) {
          totalConvos = fs.readdirSync(convosDir).filter(function(f) { return f.endsWith('.json'); }).length;
        }

        var text = '*🧠 Memory Statistics*\n\n';
        text += 'Total users known: ' + all.length + '\n';
        text += 'Total facts stored: ' + totalFacts + '\n';
        text += 'Conversation histories: ' + totalConvos + '\n';
        text += 'Memory file size: ' + (fs.existsSync(MEMORY_FILE) ? (fs.statSync(MEMORY_FILE).size / 1024).toFixed(1) + ' KB' : 'N/A') + '\n\n';
        text += '*Memory usage by user:*\n';
        all.slice(0, 10).forEach(function(u) {
          var name = u.name || u.pushName || u.id;
          text += '▸ ' + name + ' — ' + (u.facts ? u.facts.length : 0) + ' facts, ' + (u.notes ? u.notes.split('\n').length + ' notes' : '0 notes') + '\n';
        });
        if (all.length > 10) text += '...and ' + (all.length - 10) + ' more users\n';
        text += '\n*Manage:* `!memory view <id>`, `!memory clear <id>`';
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      case 'view':
      case 'show':
      case 'get': {
        var identifier = rest.join(' ').replace(/[^0-9]/g, '');
        if (!identifier) {
          var all = getAllUsers();
          if (all.length === 0) return sock.sendMessage(sender, { text: 'No users in memory yet.' });
          var text = '*👥 All Known Users*\n\n';
          all.slice(0, 20).forEach(function(u, i) {
            var name = u.name || u.pushName || u.id;
            text += (i + 1) + '. *' + name + '*\n';
            text += '   ID: ' + u.id + ' | Msgs: ' + (u.messageCount || 0) + ' | Facts: ' + (u.facts ? u.facts.length : 0) + '\n';
            if (u.tags && u.tags.length) text += '   Tags: ' + u.tags.join(', ') + '\n';
            text += '\n';
          });
          if (all.length > 20) text += '...and ' + (all.length - 20) + ' more.\n';
          text += '\nUse `!memory view <id>` to see full details.';
          return sock.sendMessage(sender, { text: text.substring(0, 4000) });
        }

        var userJid = identifier + '@s.whatsapp.net';
        var user = getUser(userJid);
        if (!user) return sock.sendMessage(sender, { text: 'User not found: ' + identifier });

        var text = '*👤 User Memory*\n\n';
        text += '*ID:* ' + user.id + '\n';
        text += '*Name:* ' + (user.name || 'Not set') + '\n';
        text += '*Display Name:* ' + (user.pushName || 'N/A') + '\n';
        text += '*About:* ' + (user.about || 'Not set') + '\n';
        text += '*Messages:* ' + (user.messageCount || 0) + '\n';
        text += '*Interactions:* ' + (user.interactionCount || 0) + '\n';
        text += '*First Seen:* ' + new Date(user.firstSeen).toLocaleString() + '\n';
        text += '*Last Seen:* ' + new Date(user.lastSeen).toLocaleString() + '\n';
        text += '*Last Learned:* ' + (user.lastLearned ? new Date(user.lastLearned).toLocaleString() : 'N/A') + '\n';

        if (user.facts && user.facts.length > 0) {
          text += '\n*📝 Facts (' + user.facts.length + '):*\n';
          user.facts.forEach(function(f) { text += '  • ' + f + '\n'; });
        }

        if (user.tags && user.tags.length > 0) {
          text += '\n*🏷 Tags:* ' + user.tags.join(', ') + '\n';
        }

        if (Object.keys(user.preferences || {}).length > 0) {
          text += '\n*⚙ Preferences:*\n';
          Object.entries(user.preferences).forEach(function(kv) { text += '  • ' + kv[0] + ': ' + kv[1] + '\n'; });
        }

        if (user.notes) {
          text += '\n*📌 Notes:*\n' + user.notes + '\n';
        }

        text += '\n*Manage:* `!memory edit ' + identifier + ' name <value>` | `!memory clear ' + identifier + '`';
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      case 'edit':
      case 'set':
      case 'update': {
        var identifier = rest[0] ? rest[0].replace(/[^0-9]/g, '') : '';
        var field = rest[1] ? rest[1].toLowerCase() : '';
        var value = rest.slice(2).join(' ');

        if (!identifier || !field || !value) {
          return sock.sendMessage(sender, { text: 'Usage: `!memory edit <id> <field> <value>`\n\nFields: name, about, notes, pushName\n\nExample: `!memory edit 2348012345678 name John`' });
        }

        var allowedFields = ['name', 'about', 'notes', 'pushName'];
        if (!allowedFields.includes(field)) {
          return sock.sendMessage(sender, { text: 'Invalid field: ' + field + '\nValid fields: ' + allowedFields.join(', ') });
        }

        var userJid = identifier + '@s.whatsapp.net';
        updateUser(userJid, { [field]: value });
        await sock.sendMessage(sender, { text: '✅ Updated *' + field + '* for ' + identifier + ':\n"' + value.substring(0, 200) + '"' });
        break;
      }

      case 'clear':
      case 'delete':
      case 'remove':
      case 'wipe': {
        var target = rest.join(' ').trim().toLowerCase();

        if (target === 'all' || target === 'everything' || target === '--all') {
          return sock.sendMessage(sender, {
            text: '⚠️ *WARNING:* This will permanently delete ALL user memory!\n\nType `!memory clear confirm-all` to proceed.',
          });
        }

        if (target === 'confirm-all') {
          if (fs.existsSync(MEMORY_FILE)) {
            saveJson(MEMORY_FILE, {});
          }
          if (fs.existsSync(CONVOS_DIR)) {
            var convos = fs.readdirSync(CONVOS_DIR);
            convos.forEach(function(f) {
              try { fs.unlinkSync(path.join(CONVOS_DIR, f)); } catch (e) {}
            });
          }
          await sock.sendMessage(sender, { text: '✅ ALL user memory has been wiped.\n' + (fs.existsSync(MEMORY_FILE) ? 'Memory file reset.' : '') + '\nConversation histories cleared.' });
          return;
        }

        var identifier = target.replace(/[^0-9]/g, '');
        if (!identifier) return sock.sendMessage(sender, { text: 'Usage: `!memory clear <id>` or `!memory clear all`' });

        var userJid = identifier + '@s.whatsapp.net';
        var user = getUser(userJid);
        if (!user) return sock.sendMessage(sender, { text: 'User not found: ' + identifier });

        updateUser(userJid, { facts: [], notes: '', preferences: {}, tags: [] });
        var convoFile = path.join(CONVOS_DIR, identifier + '.json');
        if (fs.existsSync(convoFile)) {
          try { fs.unlinkSync(convoFile); } catch (e) {}
        }
        await sock.sendMessage(sender, { text: '✅ Memory cleared for ' + identifier + '\nFacts, notes, preferences, tags, and conversation history deleted.' });
        break;
      }

      case 'resetconfirm':
      case 'factoryconfirm':
      case 'nukeconfirm': {
        if (fs.existsSync(MEMORY_FILE)) { saveJson(MEMORY_FILE, {}); }
        if (fs.existsSync(CONVOS_DIR)) {
          var convos = fs.readdirSync(CONVOS_DIR);
          convos.forEach(function(f) { try { fs.unlinkSync(path.join(CONVOS_DIR, f)); } catch (e) {} });
        }
        var pf = path.join(__dirname, '..', '..', 'storage', 'persona.json');
        if (fs.existsSync(pf)) { try { fs.unlinkSync(pf); } catch (e) {} }
        var af = path.join(__dirname, '..', '..', 'storage', 'access.json');
        if (fs.existsSync(af)) { try { fs.unlinkSync(af); } catch (e) {} }
        var of = path.join(__dirname, '..', '..', 'storage', 'onboarding.json');
        if (fs.existsSync(of)) { try { fs.unlinkSync(of); } catch (e) {} }
        await sock.sendMessage(sender, { text: '✅ Factory reset complete!\n\nMemory, conversations, access lists, persona, and onboarding reset.\nUse `!persona` to set my name again.' });
        break;
      }

      case 'reset':
      case 'factory':
      case 'nuke':
        return sock.sendMessage(sender, {
          text: '⚠️ *FACTORY RESET*\n\nThis will delete ALL memory, conversations, access lists, and persona.\nType `!memory resetconfirm` to proceed.\n\n_This cannot be undone._',
        });

      default:
        await sock.sendMessage(sender, { text: 'Unknown: `!memory ' + sub + '`\nUse `!memory` to see all commands.' });
    }
  },
};
