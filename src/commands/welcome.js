const { startOnboarding, resetOnboarding } = require('../services/onboardingService');

module.exports = {
  name: 'welcome',
  alias: ['onboard', 'welcomecmd', 'intro'],
  description: 'Send or resend the official WhatsApp bot connection welcome message',
  usage: '!welcome',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    await sock.sendMessage(sender, { text: '🔄 Resending official Welcome & Connection message...' });
    
    var sent = await startOnboarding(sock, true);
    if (!sent) {
      await sock.sendMessage(sender, { text: '❌ Failed to send welcome message. Ensure bot is connected.' });
    }
  },
};
