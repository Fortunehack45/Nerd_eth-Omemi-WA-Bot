const { getUser, updateUser, addFact, addTag, removeTag, setPreference, getUserContext, getAllUsers, searchUsers } = require('../services/memoryService');

module.exports = {
  name: 'profile',
  alias: ['user', 'whoami', 'memory'],
  description: 'View or manage your user profile and what the bot knows about you',
  usage: '!profile - view your profile\n!profile set <key> <value> - set profile info\n!profile fact <text> - add a fact\n!profile tag <tag> - add a tag',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;
    const isPrivate = !sender.endsWith('@g.us');

    if (!isPrivate) {
      return sock.sendMessage(sender, { text: 'Profile commands only work in private chat.' });
    }

    if (!args) {
      const user = getUser(sender);
      const ctxData = getUserContext(sender);
      let text = `*👤 Your Profile*\n\n`;
      text += `*ID:* ${user.id}\n`;
      text += `*Name:* ${user.name || 'Not set'}\n`;
      text += `*Display Name:* ${user.pushName || 'Unknown'}\n`;
      text += `*About:* ${user.about || 'Not set'}\n`;
      text += `*Interactions:* ${user.interactionCount || 0}\n`;
      text += `*Messages:* ${user.messageCount || 0}\n`;
      text += `*First Seen:* ${new Date(user.firstSeen).toLocaleDateString()}\n`;
      text += `*Last Seen:* ${new Date(user.lastSeen).toLocaleDateString()}\n`;

      if (user.facts?.length) {
        text += `\n*📝 Facts I know about you:*\n`;
        user.facts.forEach(f => text += `  • ${f}\n`);
      }

      if (user.tags?.length) {
        text += `\n*🏷 Tags:* ${user.tags.join(', ')}\n`;
      }

      if (Object.keys(user.preferences || {}).length) {
        text += `\n*⚙ Preferences:*\n`;
        Object.entries(user.preferences).forEach(([k, v]) => text += `  • ${k}: ${v}\n`);
      }

      if (user.notes) {
        text += `\n*📌 Notes:* ${user.notes}\n`;
      }

      return sock.sendMessage(sender, { text });
    }

    const parts = args.split(/\s+/);
    const subCmd = parts[0].toLowerCase();

    switch (subCmd) {
      case 'set': {
        const key = parts[1];
        const value = parts.slice(2).join(' ');
        if (!key || !value) {
          return sock.sendMessage(sender, { text: 'Usage: !profile set <key> <value>\nKeys: name, about, notes' });
        }
        const allowed = ['name', 'about', 'notes'];
        if (!allowed.includes(key)) {
          return sock.sendMessage(sender, { text: `Key must be one of: ${allowed.join(', ')}` });
        }
        updateUser(sender, { [key]: value });
        await sock.sendMessage(sender, { text: `✅ ${key} updated to: ${value}` });
        break;
      }

      case 'fact': {
        const fact = parts.slice(1).join(' ');
        if (!fact) return sock.sendMessage(sender, { text: 'Usage: !profile fact <something about you>' });
        addFact(sender, fact);
        await sock.sendMessage(sender, { text: `✅ Fact saved: "${fact}"` });
        break;
      }

      case 'tag': {
        const tag = parts.slice(1).join(' ');
        if (!tag) return sock.sendMessage(sender, { text: 'Usage: !profile tag <tag>' });
        addTag(sender, tag);
        await sock.sendMessage(sender, { text: `✅ Tag added: ${tag}` });
        break;
      }

      case 'untag': {
        const tag = parts.slice(1).join(' ');
        if (!tag) return sock.sendMessage(sender, { text: 'Usage: !profile untag <tag>' });
        removeTag(sender, tag);
        await sock.sendMessage(sender, { text: `✅ Tag removed: ${tag}` });
        break;
      }

      case 'pref':
      case 'preference': {
        const key = parts[1];
        const value = parts.slice(2).join(' ');
        if (!key || !value) {
          return sock.sendMessage(sender, { text: 'Usage: !profile pref <key> <value>\nExample: !profile pref language Spanish' });
        }
        setPreference(sender, key, value);
        await sock.sendMessage(sender, { text: `✅ Preference set: ${key} = ${value}` });
        break;
      }

      default:
        await sock.sendMessage(sender, { text: `Unknown: ${subCmd}. Use !profile to view, or !profile set/fact/tag/pref` });
    }
  },
};
