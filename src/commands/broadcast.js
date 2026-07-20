const config = require('../../config');
const { randomBetween, randomDelay, checkRateLimit, humanDelay } = require('../services/antiBanService');

const broadcastLog = [];

module.exports = {
  name: 'broadcast',
  alias: ['bc', 'announce', 'blast'],
  description: 'Send a message to all chats (admin only)',
  usage: '!broadcast <message>',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;
    if (!args) {
      return sock.sendMessage(sender, { text: 'Usage: !broadcast <message>' });
    }

    if (config.antiBan.enabled) {
      const now = Date.now();
      const recentBroadcasts = broadcastLog.filter(t => now - t < 3600000);
      if (recentBroadcasts.length >= config.antiBan.maxBroadcastPerHour) {
        return sock.sendMessage(sender, {
          text: `⛔ Broadcast limit reached (${config.antiBan.maxBroadcastPerHour}/hour). Please wait.`,
        });
      }
      if (!checkRateLimit('broadcast', 3)) {
        return sock.sendMessage(sender, { text: '⛔ Too fast! Please wait before broadcasting again.' });
      }
    }

    await sock.sendMessage(sender, { text: '📡 Fetching chats for broadcast...' });

    let sent = 0;
    let failed = 0;
    const chats = {};

    for (const chat of Object.values(sock.chats || {})) {
      const jid = chat.id || chat.jid;
      if (!jid || jid === 'status@broadcast') continue;
      chats[jid] = true;
    }

    const chatIds = Object.keys(chats);

    if (config.antiBan.enabled && chatIds.length > 10) {
      await sock.sendMessage(sender, {
        text: `📬 Sending to ${chatIds.length} chats with anti-ban delays. This may take a while...`,
      });
    }

    for (const jid of chatIds) {
      try {
        if (config.antiBan.enabled) {
          const delay = randomBetween(3000, 8000);
          await new Promise(r => setTimeout(r, delay));
          await sock.sendPresenceUpdate('composing', jid);
          await humanDelay();
        }
        await sock.sendMessage(jid, { text: `📢 *Broadcast*\n\n${args}` });
        sent++;
      } catch {
        failed++;
      }
    }

    if (config.antiBan.enabled) {
      broadcastLog.push(Date.now());
    }

    await sock.sendMessage(sender, {
      text: `📊 *Broadcast Complete*\n✅ Sent: ${sent}\n❌ Failed: ${failed}\n📬 Total: ${chatIds.length}`,
    });
  },
};
