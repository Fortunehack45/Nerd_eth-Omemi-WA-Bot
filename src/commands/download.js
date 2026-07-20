const { processLink, detectPlatform, downloadMedia, downloadAudio } = require('../services/downloadService');
const { parseFlags, formatBytes } = require('../utils/helpers');
const config = require('../../config');
const fs = require('fs');

var HELP = '*📥 Download Command*\n\nDownload media from YouTube, TikTok, Instagram, and Spotify. The bot downloads the file and sends it directly.\n\n*Usage:* `!download <link> [flags]`\n\n*Flags:*\n  `--audio`, `-a`    Download as audio only\n  `--info`, `-i`     Show link info without downloading\n\n*Supported:*\n  ▸ YouTube (videos & shorts)\n  ▸ TikTok (videos)\n  ▸ Instagram (posts & reels)\n  ▸ Spotify (tracks)\n\n*Examples:*\n  `!download https://youtu.be/...`\n  `!download https://youtu.be/... --audio`\n  `!download https://vm.tiktok.com/...`\n  `!download https://open.spotify.com/track/... --audio`\n  `!download https://instagram.com/p/...`';

async function sendFile(sock, sender, filePath, opts) {
  try {
    var buf = fs.readFileSync(filePath);
    var ext = filePath.split('.').pop().toLowerCase();
    var msgOpts = {};

    if (opts.type === 'audio' || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
      var mimes = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac' };
      msgOpts.audio = buf;
      msgOpts.mimetype = mimes[ext] || 'audio/mpeg';
      msgOpts.fileName = opts.title + '.' + ext;
    } else if (opts.type === 'video' || ['mp4', 'webm', 'mkv', 'mov'].includes(ext)) {
      msgOpts.video = buf;
      msgOpts.caption = opts.title ? '🎬 *' + opts.title.substring(0, 100) + '*' : '🎬 Video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      msgOpts.image = buf;
      msgOpts.caption = opts.title ? '📸 *' + opts.title.substring(0, 100) + '*' : '📸 Image';
    } else {
      msgOpts.document = buf;
      msgOpts.fileName = opts.title + '.' + ext;
      msgOpts.mimetype = 'application/octet-stream';
    }

    await sock.sendMessage(sender, msgOpts);
  } catch (err) {
    await sock.sendMessage(sender, { text: 'Failed to send file: ' + err.message });
  } finally {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
}

module.exports = {
  name: 'download',
  alias: ['dl', 'save', 'get'],
  description: 'Download media from YouTube, TikTok, Instagram, Spotify',
  usage: '!download <link> [--audio] [--info]',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parsed = parseFlags(args);
    var url = parsed.positional.join(' ') || args;
    var flags = parsed.flags;

    if (!url || !url.match(/https?:\/\//)) {
      return sock.sendMessage(sender, { text: 'Please provide a valid URL.\n\n' + HELP });
    }

    var platform = detectPlatform(url);
    if (platform === 'unknown') {
      return sock.sendMessage(sender, { text: 'Unsupported platform. Supported: YouTube, TikTok, Instagram, Spotify.' });
    }

    if (flags.info || flags.i) {
      await sock.sendMessage(sender, { text: '🔍 Fetching info for ' + platform + ' link...' });
      var info = await processLink(url);
      if (info.error) return sock.sendMessage(sender, { text: 'Error: ' + info.error });
      var t = '*📄 Media Info*\n\n';
      t += '*Platform:* ' + info.platform + '\n';
      t += '*Title:* ' + (info.title || 'Unknown') + '\n';
      t += '*Author:* ' + (info.author || 'Unknown') + '\n';
      if (info.duration) t += '*Duration:* ' + info.duration + 's\n';
      if (info.contentLength) t += '*Size:* ' + formatBytes(parseInt(info.contentLength)) + '\n';
      if (info.note) t += '\n*Note:* ' + info.note;
      t += '\n\n🔗 Original: ' + url;
      return sock.sendMessage(sender, { text: t.substring(0, 4000) });
    }

    if (flags.audio || flags.a) {
      await sock.sendMessage(sender, { text: '🎵 Downloading audio from ' + platform + '...' });
      var audioResult = await downloadAudio(url);
      if (audioResult.error) return sock.sendMessage(sender, { text: 'Error: ' + audioResult.error });
      if (audioResult.filePath && audioResult.size < (config.download.maxSize * 1024 * 1024)) {
        await sendFile(sock, sender, audioResult.filePath, { title: audioResult.title, type: 'audio' });
      } else if (audioResult.filePath) {
        await sock.sendMessage(sender, { text: 'Audio file too large (' + formatBytes(audioResult.size) + '). Try the original link:\n' + url });
        try { fs.unlinkSync(audioResult.filePath); } catch (e) {}
      }
      return;
    }

    await sock.sendMessage(sender, { text: '⬇️ Downloading ' + platform + ' media... This may take a moment.' });

    var dlResult = await downloadMedia(url);
    if (dlResult.error) return sock.sendMessage(sender, { text: 'Error: ' + dlResult.error });

    if (dlResult.filePath && dlResult.size < (config.download.maxSize * 1024 * 1024)) {
      var type = platform === 'youtube' || platform === 'tiktok' ? 'video' : 'media';
      await sendFile(sock, sender, dlResult.filePath, { title: dlResult.title, type: type });
    } else if (dlResult.filePath) {
      var info = await processLink(url);
      var link = info.downloadUrl || url;
      await sock.sendMessage(sender, { text: 'File too large (' + formatBytes(dlResult.size) + ').\nDirect link: ' + link });
      try { fs.unlinkSync(dlResult.filePath); } catch (e) {}
    } else {
      await sock.sendMessage(sender, { text: 'Could not download. Try the original link:\n' + url });
    }
  },
};
