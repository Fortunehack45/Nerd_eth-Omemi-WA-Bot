var { addNote, getNotes, clearNotes, getUser, addFact } = require('../services/memoryService');

module.exports = {
  name: 'remember',
  alias: ['note', 'notes', 'savenote', 'memo'],
  description: 'Tell the bot to remember something important for a user',
  usage: '!remember <text> — save a note\n!remember list — view your saved notes\n!remember clear — clear all your notes\n!remember for <number> <text> — (admin) save note for another user',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var senderId = ctx.senderId;
    var isAdmin = false;
    try { var ac = require('../services/accessControl'); isAdmin = ac.isAdmin(senderId); } catch (e) {}

    if (!args) {
      return sock.sendMessage(sender, {
        text: '*🧠 Remember / Notes*\n\nTell me to remember something important!\n\n*Usage:*\n  `!remember <text>`       Save a note about yourself\n  `!remember list`         View your saved notes\n  `!remember clear`        Clear all your notes\n  `!remember fact <text>`  Save a new fact about yourself\n' + (isAdmin ? '  `!remember for <number> <text>`  Save note for another user (admin)\n  `!remember recent`      View recent learnings (admin)\n' : '') + '\n*Examples:*\n  `!remember My birthday is December 25th`\n  `!remember I prefer short responses`\n  `!remember fact I love programming`',
      });
    }

    var parsed = require('../utils/helpers').parseFlags(args);
    var parts = parsed.positional;
    var sub = parts[0] && parts[0].toLowerCase();

    if (sub === 'list' || sub === 'view' || sub === 'show') {
      var notes = getNotes(sender);
      if (!notes) {
        return sock.sendMessage(sender, { text: 'No notes saved yet. Tell me to remember something with `!remember <text>`' });
      }
      var text = '*🧠 Your Saved Notes*\n\n' + notes;
      return sock.sendMessage(sender, { text: text.substring(0, 4000) });
    }

    if (sub === 'clear' || sub === 'delete' || sub === 'remove') {
      clearNotes(sender);
      return sock.sendMessage(sender, { text: '✅ All your notes have been cleared.' });
    }

    if (sub === 'fact' || sub === 'facts') {
      var factText = parts.slice(1).join(' ');
      if (!factText) return sock.sendMessage(sender, { text: 'Usage: `!remember fact <text>`' });
      var added = addFact(sender, factText);
      if (added) {
        await sock.sendMessage(sender, { text: '✅ I\'ll remember that! 🧠\n_Fact saved: "' + factText + '"_\n\nUse `!profile` to see everything I know about you.' });
      } else {
        await sock.sendMessage(sender, { text: 'I already know that fact! 🧠\nUse `!profile` to see what I know.' });
      }
      return;
    }

    if (sub === 'recent' || sub === 'latest') {
      if (!isAdmin) return sock.sendMessage(sender, { text: 'Admin only.' });
      var { getRecentLearnings } = require('../services/memoryService');
      var learnings = getRecentLearnings(10);
      if (learnings.length === 0) return sock.sendMessage(sender, { text: 'No recent learnings yet.' });
      var text = '*🧠 Recent Learnings*\n\n';
      learnings.forEach(function(l, i) {
        text += (i + 1) + '. *' + l.name + '*\n';
        text += '   Facts: ' + l.facts.join('; ') + '\n';
        text += '   ' + new Date(l.lastLearned).toLocaleString() + '\n\n';
      });
      return sock.sendMessage(sender, { text: text.substring(0, 4000) });
    }

    if (sub === 'for' && isAdmin) {
      var targetNum = parts[1];
      var noteText = parts.slice(2).join(' ');
      if (!targetNum || !noteText) {
        return sock.sendMessage(sender, { text: 'Usage: `!remember for <number> <text>`\nExample: `!remember for 2348012345678 Important meeting at 3pm`' });
      }
      var targetJid = targetNum.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      addNote(targetJid, noteText);
      await sock.sendMessage(sender, { text: '✅ Note saved for ' + targetNum + ': "' + noteText + '"' });
      return;
    }

    if (sub === 'for') {
      return sock.sendMessage(sender, { text: 'This command is admin-only.' });
    }

    var noteText = args;
    addNote(sender, noteText);
    await sock.sendMessage(sender, {
      text: '✅ I\'ve noted that! 🧠\n_"' + noteText.substring(0, 100) + (noteText.length > 100 ? '...' : '') + '"_\n\nUse `!remember list` to see all your notes.',
    });
  },
};
