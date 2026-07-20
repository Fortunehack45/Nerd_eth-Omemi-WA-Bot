const { parseFlags, parseJid } = require('../utils/helpers');
const { isAdmin } = require('../services/accessControl');
const config = require('../../config');

const HELP = `*👥 Group Management Commands* (Admin Only)

Commands for group admins and bot owner.

*Commands:*
  \`!nuke\` or \`!group purge\`         Mass remove ALL members from group
  \`!adminme\` or \`!group adminme\`   Promote yourself to Group Admin
  \`!promote @user\`                  Promote a member to Group Admin
  \`!demote @user\`                   Demote an admin to member
  \`!tagall <message>\`              Tag every member in the group
  \`!groupinfo\`                      Show detailed group information
  \`!link\`                           Get group invite link

*Examples:*
  \`!nuke --confirm\`
  \`!adminme\`
  \`!promote @user\`
  \`!demote 2348012345678\`
  \`!tagall Attention everyone!\``;

module.exports = {
  name: 'group',
  alias: ['g', 'grp', 'nuke', 'purge', 'kickall', 'removeall', 'promote', 'demote', 'adminme', 'tagall', 'everyone', 'groupinfo', 'ginfo', 'link'],
  description: 'Group administration & mass management commands',
  usage: '!nuke | !adminme | !promote @user | !tagall',
  groupOnly: true,
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender; // Group JID (e.g. 12036304@g.us)
    var senderId = ctx.senderId; // Caller JID (e.g. 2348012345678@s.whatsapp.net)
    var command = ctx.command; // Executed command alias

    // Determine subcommand from main command or first arg
    var sub = command;
    var subArgs = args ? args.trim().split(/\s+/) : [];

    if (command === 'group' || command === 'g' || command === 'grp') {
      if (!subArgs[0] || subArgs[0] === '--help' || subArgs[0] === '-h') {
        return sock.sendMessage(sender, { text: HELP });
      }
      sub = subArgs[0].toLowerCase();
      subArgs = subArgs.slice(1);
    }

    // Fetch group metadata
    var groupMetadata;
    try {
      groupMetadata = await sock.groupMetadata(sender);
    } catch (e) {
      return sock.sendMessage(sender, { text: '❌ Could not fetch group information: ' + e.message });
    }

    var participants = groupMetadata.participants || [];
    var botNum = parseJid(sock.user?.id || sock.user?.jid || '');
    var callerNum = parseJid(senderId || '');

    var botParticipant = participants.find(p => parseJid(p.id) === botNum);
    var isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';

    // ── 1. NUKE / PURGE / MASS KICK ALL ──────────────────────────────────────
    if (['nuke', 'purge', 'kickall', 'removeall', 'clean'].includes(sub)) {
      if (!isBotAdmin) {
        return sock.sendMessage(sender, { text: '❌ The bot must be a **Group Admin** first to perform mass kick / nuke. Please promote the bot to Group Admin and try again.' });
      }

      var confirm = subArgs.includes('--confirm') || subArgs.includes('-y') || subArgs.includes('confirm');
      if (!confirm) {
        return sock.sendMessage(sender, {
          text: '⚠️ *WARNING: MASS KICK NUKE*\n\nThis command will remove **ALL members** from *' + groupMetadata.subject + '*!\n\nTo execute, type:\n`!nuke --confirm` or `!group purge --confirm`',
        });
      }

      await sock.sendMessage(sender, { text: '🚨 *MASS NUKE STARTED* — Removing all members from *' + groupMetadata.subject + '*...' });

      var targets = participants.filter(p => {
        var pNum = parseJid(p.id);
        // Exclude bot and caller/owner
        return pNum !== botNum && pNum !== callerNum && !isAdmin(p.id);
      }).map(p => p.id);

      if (targets.length === 0) {
        return sock.sendMessage(sender, { text: 'No regular members to remove.' });
      }

      var removedCount = 0;
      // Process batch removals in chunks of 10 for speed and stability
      for (var i = 0; i < targets.length; i += 10) {
        var batch = targets.slice(i, i + 10);
        try {
          await sock.groupParticipantsUpdate(sender, batch, 'remove');
          removedCount += batch.length;
          await new Promise(r => setTimeout(r, 800));
        } catch (err) {
          console.error('Batch removal error:', err.message);
        }
      }

      await sock.sendMessage(sender, {
        text: '✅ *MASS NUKE COMPLETE!*\n\nRemoved ' + removedCount + ' / ' + targets.length + ' members from *' + groupMetadata.subject + '*.',
      });
      return;
    }

    // ── 2. ADMINME (Make caller Group Admin) ──────────────────────────────────
    if (['adminme', 'makeadmin'].includes(sub)) {
      if (!isBotAdmin) {
        return sock.sendMessage(sender, { text: '❌ The bot must be a **Group Admin** first to promote you. Please promote the bot to Group Admin in this group!' });
      }
      var targetJid = parseJid(senderId) + '@s.whatsapp.net';
      try {
        await sock.groupParticipantsUpdate(sender, [targetJid], 'promote');
        await sock.sendMessage(sender, { text: '👑 Granted Group Admin privileges to @' + callerNum + '!', mentions: [targetJid] });
      } catch (e) {
        await sock.sendMessage(sender, { text: '❌ AdminMe failed: ' + e.message });
      }
      return;
    }

    // ── 3. PROMOTE ────────────────────────────────────────────────────────────
    if (['promote', 'admin'].includes(sub)) {
      if (!isBotAdmin) return sock.sendMessage(sender, { text: '❌ Bot must be a group admin to promote members.' });
      var targetJid = getTargetJid(msg, subArgs);
      if (!targetJid) return sock.sendMessage(sender, { text: 'Usage: `!promote @user` or reply to a message' });

      try {
        await sock.groupParticipantsUpdate(sender, [targetJid], 'promote');
        await sock.sendMessage(sender, { text: '✅ Promoted @' + parseJid(targetJid) + ' to Group Admin.', mentions: [targetJid] });
      } catch (e) {
        await sock.sendMessage(sender, { text: '❌ Promotion failed: ' + e.message });
      }
      return;
    }

    // ── 4. DEMOTE ─────────────────────────────────────────────────────────────
    if (['demote', 'unadmin'].includes(sub)) {
      if (!isBotAdmin) return sock.sendMessage(sender, { text: '❌ Bot must be a group admin to demote members.' });
      var targetJid = getTargetJid(msg, subArgs);
      if (!targetJid) return sock.sendMessage(sender, { text: 'Usage: `!demote @user` or reply to a message' });

      try {
        await sock.groupParticipantsUpdate(sender, [targetJid], 'demote');
        await sock.sendMessage(sender, { text: '✅ Demoted @' + parseJid(targetJid) + ' to regular member.', mentions: [targetJid] });
      } catch (e) {
        await sock.sendMessage(sender, { text: '❌ Demotion failed: ' + e.message });
      }
      return;
    }

    // ── 5. TAGALL ─────────────────────────────────────────────────────────────
    if (['tagall', 'everyone', 'all'].includes(sub)) {
      var customMsg = subArgs.join(' ') || 'Attention Everyone!';
      var text = '📢 *' + customMsg + '*\n\n';
      var mentions = [];

      participants.forEach((p, idx) => {
        text += (idx + 1) + '. @' + parseJid(p.id) + '\n';
        mentions.push(p.id);
      });

      await sock.sendMessage(sender, { text: text, mentions: mentions });
      return;
    }

    // ── 6. GROUP INFO ─────────────────────────────────────────────────────────
    if (['info', 'groupinfo', 'ginfo'].includes(sub)) {
      var admins = participants.filter(p => p.admin).map(p => '@' + parseJid(p.id));
      var text = '*👥 Group Details: ' + groupMetadata.subject + '*\n\n';
      text += '🆔 *ID:* `' + groupMetadata.id + '`\n';
      text += '👑 *Owner:* @' + parseJid(groupMetadata.owner || '') + '\n';
      text += '👥 *Members:* ' + participants.length + '\n';
      text += '⚡ *Admins (' + admins.length + '):* ' + admins.join(', ') + '\n';
      if (groupMetadata.desc) text += '\n📝 *Description:*\n' + groupMetadata.desc.substring(0, 300) + '\n';

      await sock.sendMessage(sender, { text: text, mentions: participants.filter(p => p.admin).map(p => p.id) });
      return;
    }

    // ── 7. LINK ───────────────────────────────────────────────────────────────
    if (['link', 'invitelink'].includes(sub)) {
      if (!isBotAdmin) return sock.sendMessage(sender, { text: '❌ Bot must be a group admin to get invite link.' });
      try {
        var code = await sock.groupInviteCode(sender);
        await sock.sendMessage(sender, { text: '🔗 *Group Invite Link:*\nhttps://chat.whatsapp.com/' + code });
      } catch (e) {
        await sock.sendMessage(sender, { text: '❌ Link failed: ' + e.message });
      }
      return;
    }

    await sock.sendMessage(sender, { text: 'Unknown group subcommand. Use `!group --help` for details.' });
  },
};

function getTargetJid(msg, args) {
  var mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (mentioned && mentioned.length > 0) return mentioned[0];

  var quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (quoted) return quoted;

  if (args && args.length > 0) {
    var raw = args[0].replace(/[^0-9]/g, '');
    if (raw.length >= 10) return raw + '@s.whatsapp.net';
  }

  return null;
}
