const { generateImage } = require('../services/aiService');

module.exports = {
  name: 'imagine',
  alias: ['draw', 'generate', 'img', 'image', 'dalle'],
  description: 'Generate an image from text description using AI',
  usage: '!imagine <description> [--size 1024x1024] [--count N]',
  restricted: true,
  restrictedFeature: 'imagine',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, {
        text: '*🎨 Image Generation*\n\nGenerate AI images from text descriptions using DALL-E 3.\n\n*Usage:* `!imagine <description>`\n\n*Examples:*\n  `!imagine a futuristic city at sunset`\n  `!imagine a cute cat wearing a hat, digital art`\n  `!imagine an astronaut riding a horse on mars, photo realistic`',
      });
    }

    var query = args;
    if (query.length > 1000) query = query.substring(0, 1000);

    await sock.sendMessage(sender, { text: '🎨 Generating image: "' + query.substring(0, 80) + '..."\n_This may take 15-30 seconds..._' });
    await sock.sendPresenceUpdate('composing', sender);

    var result = await generateImage(query);
    if (result.success && result.url) {
      try {
        const axios = require('axios');
        var resp = await axios.get(result.url, { responseType: 'arraybuffer', timeout: 30000 });
        await sock.sendMessage(sender, {
          image: Buffer.from(resp.data),
          caption: '🎨 *' + query.substring(0, 200) + '*',
        });
      } catch (err) {
        await sock.sendMessage(sender, { text: 'Generated but failed to download. Open URL:\n' + result.url });
      }
    } else {
      await sock.sendMessage(sender, { text: 'Failed: ' + (result.error || 'Unknown error') + '\n\nTip: If AgentRouter is active, switch to OpenAI with `!provider switch openai`' });
    }
  },
};
