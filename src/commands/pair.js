const { requestPairingCode, getClient } = require('../client');

const HELP = `*🔢 WhatsApp Pairing Code Generator* (QR Code Optional)

Generate an 8-digit WhatsApp Pairing Code to connect your bot account directly without scanning a QR code with a camera.

*Usage:*
  \`!pair <phone_number>\`

*Example:*
  \`!pair 2348012345678\`
  \`!pair +1 (555) 019-2831\`

*How to use:*
  1️⃣ Run \`!pair <your_number_with_country_code>\`
  2️⃣ Open WhatsApp on your phone ➔ **Linked Devices** ➔ **Link a Device** ➔ **Link with phone number instead**
  3️⃣ Enter the 8-digit code displayed by the bot!`;

module.exports = {
  name: 'pair',
  alias: ['code', 'pairing', 'paircode', 'connectcode', 'pcode', '🔢', '🔑'],
  description: 'Generate 8-digit WhatsApp pairing code (QR Code optional)',
  usage: '!pair <phone_number_with_country_code>',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args.trim() === '' || args.trim() === '--help' || args.trim() === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var cleanPhone = args.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      return sock.sendMessage(sender, {
        text: '❌ Invalid phone number. Please enter full phone number with country code (e.g. `!pair 2348012345678`).'
      });
    }

    await sock.sendMessage(sender, { text: '🔄 Requesting 8-digit pairing code for `' + cleanPhone + '`...' });

    try {
      var pairingCode = await requestPairingCode(cleanPhone);
      var text = '*🔢 WHATSAPP PAIRING CODE GENERATED*\n\n';
      text += '📱 *Phone Number:* `' + cleanPhone + '`\n';
      text += '🔑 *PAIRING CODE:* `' + pairingCode + '`\n\n';
      text += '👉 *Instructions:*\n';
      text += '1. Open WhatsApp on phone (`' + cleanPhone + '`)\n';
      text += '2. Go to **Settings / Linked Devices** ➔ **Link a Device**\n';
      text += '3. Tap **"Link with phone number instead"**\n';
      text += '4. Enter code: `' + pairingCode + '`\n\n';
      text += '⏰ Code expires in 2 minutes!';

      await sock.sendMessage(sender, { text: text });
    } catch (err) {
      await sock.sendMessage(sender, {
        text: '❌ Pairing Code Error: ' + err.message
      });
    }
  },
};
