const { getAllUsers, searchUsers } = require('../services/memoryService');
const config = require('../../config');

module.exports = {
  name: 'knowledge',
  alias: ['users', 'contacts', 'known'],
  description: 'View all known users and their stored information (admin only)',
  usage: '!knowledge - list all known users\n!knowledge search <query> - search users',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;

    if (!args) {
      const users = getAllUsers();
      if (users.length === 0) {
        return sock.sendMessage(sender, { text: 'No users known yet. Memory is empty.' });
      }

      const totalFacts = users.reduce((sum, u) => sum + (u.facts?.length || 0), 0);
      let text = `*🧠 Knowledge Base*\n\n`;
      text += `*Total Contacts:* ${users.length}\n`;
      text += `*Total Facts:* ${totalFacts}\n\n`;

      users.slice(0, 20).forEach(u => {
        const name = u.name || u.pushName || u.id;
        text += `▸ *${name}*\n`;
        text += `   ID: ${u.id} | Msgs: ${u.messageCount || 0}\n`;
        if (u.facts?.length) {
          text += `   Facts: ${u.facts.slice(0, 3).join('; ')}${u.facts.length > 3 ? ` (+${u.facts.length - 3} more)` : ''}\n`;
        }
        if (u.tags?.length) {
          text += `   Tags: ${u.tags.join(', ')}\n`;
        }
        text += '\n';
      });

      if (users.length > 20) {
        text += `...and ${users.length - 20} more. Use !knowledge search <name> to find specific users.`;
      }

      return sock.sendMessage(sender, { text: text.substring(0, 4000) });
    }

    const parts = args.split(/\s+/);
    const subCmd = parts[0].toLowerCase();

    if (subCmd === 'search' || subCmd === 'find') {
      const query = parts.slice(1).join(' ');
      if (!query) return sock.sendMessage(sender, { text: 'Usage: !knowledge search <query>' });

      const results = searchUsers(query);
      if (results.length === 0) {
        return sock.sendMessage(sender, { text: `No users found matching "${query}".` });
      }

      let text = `*🔍 Search Results for "${query}"*\n\n`;
      results.slice(0, 15).forEach(u => {
        const name = u.name || u.pushName || u.id;
        text += `▸ *${name}* (${u.id})\n`;
        text += `   Msgs: ${u.messageCount || 0} | Last: ${new Date(u.lastSeen).toLocaleDateString()}\n`;
        if (u.facts?.length) text += `   Facts: ${u.facts.slice(0, 2).join('; ')}\n`;
        text += '\n';
      });

      await sock.sendMessage(sender, { text: text.substring(0, 4000) });
    }
  },
};
