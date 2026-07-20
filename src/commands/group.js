const { parseFlags, parseJid } = require('../utils/helpers');
const { isAdmin } = require('../services/accessControl');
const config = require('../../config');

const HELP = `*👥 Group Management Commands* (Admin Only)

Commands for group admins and bot owner.

*Subcommands / Commands:*
  \`!group purge\` or \`!purge\`       Mass remove members from group
  \`!group promote <user>\`        Promote member to admin
  \`!group demote <user>\`         Demote admin to member
  \`!group adminme\` or \`!adminme\` Promote yourself to admin (if bot is admin)
  \`!group info\` or \`!groupinfo\`   Show detailed group information
  \`!group tagall\` or \`!tagall\`    Tag every member in the group
  \`!group link\`                  Get group invite link

*Examples:*
  \`!group purge --confirm\`
  \`!group promote @user\`
  \`!group demote 2348012345678\`
  \`!group tagall Attention everyone!\``;

module.exports = {
  name: 'group',
  alias: ['g', 'grp', 'nuke', 'purge', 'kickall', 'removeall', 'promote', 'demote', 'adminme', 'tagall', 'everyone', 'groupinfo', 'ginfo'],
  description: 'Group administration & mass management commands',
  usage: '!nuke | !group purge | !group promote @user',
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
    var botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;
    var botParticipant = participants.find(p => p.id.split(':')[0] === botJid?.split('@')[0]);
    var isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';

    // ── 1. PURGE / NUKE / MASS KICK ALL ──────────────────────────────────────
    if (['nuke', 'purge', 'kickall', 'removeall', 'clean'].includes(sub)) {
      if (!isBotAdmin) {
        return sock.sendMessage(sender, { text: '❌ The bot must be a **Group Admin** to perform mass kick / purge.' });
      }

      var confirm = subArgs.includes('--confirm') || subArgs.includes('-y');
      if (!confirm) {
        return sock.sendMessage(sender, {
          text: '⚠️ *WARNING: MASS KICK NUKE*\n\nThis command will remove **ALL members** from this group!\n\nTo confirm, type:\n`!nuke --confirm` or `!group purge --confirm`',
        });
      }

      await sock.sendMessage(sender, { text: '🚨 *PURGE STARTED* — Removing all members from ' + groupMetadata.subject + '...' });

      var targets = participants.filter(p => {
        var pNum = parseJid(p.id);
        var botNum = parseJid(botJid || '');
        var callerNum = parseJid(senderId || '');
        // Exclude bot and caller/owner
        return pNum !== botNum && pNum !== callerNum && !isAdmin(p.id);
      });

      if (targets.length === 0) {
        return sock.sendMessage(sender, { text: 'No members to remove.' });
      }

      var removedCount = 0;
      for (var target of targets) {
        try {
          await sock.groupParticipantsUpdate(sender, [target.id], 'remove');
          removedCount++;
          // Safety delay to prevent WhatsApp rate-limiting or anti-spam bans
          await new Promise(r => setTimeout(r, 600));
        } catch (err) {
          console.error('Failed to remove participant:', target.id, err.message);
        }
      }

      await sock.sendMessage(sender, {
        text: '✅ *PURGE COMPLETE!*\n\nRemoved ' + removedCount + ' / ' + targets.length + ' members from *' + groupMetadata.subject + '*.',
      });
      return;
    }

    // ── 2. PROMOTE ────────────────────────────────────────────────────────────
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

    // ── 3. DEMOTE ─────────────────────────────────────────────────────────────
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

    // ── 4. ADMINME (Make caller group admin) ──────────────────────────────────
    if (['adminme', 'makeadmin'].includes(sub)) {
      if (!isBotAdmin) return sock.sendMessage(sender, { text: '❌ Bot must be a group admin to promote you.' });
      try {
        await sock.groupParticipantsUpdate(sender, [senderId], 'promote');
        await sock.sendMessage(sender, { text: '👑 Granted Group Admin privileges to @' + parseJid(senderId) + '!', mentions: [senderId] });
      } catch (e) {
        await sock.sendMessage(sender, { text: '❌ AdminMe failed: ' + e.message });
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
  // 1. Mentioned JID
  var mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (mentioned && mentioned.length > 0) return mentioned[0];

  // 2. Quoted message participant
  var quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (quoted) return quoted;

  // 3. Raw number arg
  if (args && args.length > 0) {
    var raw = args[0].replace(/[^0-9]/g, '');
    if (raw.length >= 10) return raw + '@s.whatsapp.net';
  }

  return null;
}
