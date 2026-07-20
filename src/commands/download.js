const { processLink, detectPlatform, getYouTubeAudio } = require('../services/downloadService');
const { parseFlags, formatBytes } = require('../utils/helpers');
const config = require('../../config');

var HELP = '*📥 Download Command*\n\nDownload media from YouTube, TikTok, Instagram, and Spotify links.\n\n*Usage:* `!download <link> [flags]`\n\nJust send a link and the bot will fetch the details.\n\n*Flags:*\n  `--audio`, `-a`    Download as audio only (YouTube)\n  `--info`, `-i`     Show link info without downloading\n\n*Supported:*\n  ▸ YouTube (videos & shorts)\n  ▸ TikTok (videos)\n  ▸ Instagram (posts & reels)\n  ▸ Spotify (tracks)\n\n*Examples:*\n  `!download https://youtu.be/...`\n  `!download https://youtu.be/... --audio`\n  `!download https://vm.tiktok.com/...`\n  `!download https://instagram.com/p/... --info`\n  `!download https://open.spotify.com/track/...`';

module.exports = {
  name: 'download',
  alias: ['dl', 'save', 'get'],
  description: 'Download media from YouTube, TikTok, Instagram, Spotify',
  usage: '!download <link> [--audio] [--info]',
  restricted: true,
  restrictedFeature: 'download',
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

    await sock.sendMessage(sender, { text: '🔍 Processing ' + platform + ' link...' });

    if (flags.info || flags.i) {
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

    var result = await processLink(url);

    if (result.error) {
      return sock.sendMessage(sender, { text: 'Error: ' + result.error });
    }

    if (platform === 'youtube') {
      if (flags.audio || flags.a) {
        await sock.sendMessage(sender, { text: '🎵 Downloading audio... This may take a moment.' });
        var audioResult = await getYouTubeAudio(url);
        if (audioResult.error) return sock.sendMessage(sender, { text: 'Error: ' + audioResult.error });
        if (audioResult.filePath && audioResult.size < (config.download.maxSize * 1024 * 1024)) {
          var fileBuffer = require('fs').readFileSync(audioResult.filePath);
          await sock.sendMessage(sender, {
            audio: fileBuffer,
            mimetype: 'audio/mpeg',
            fileName: audioResult.title + '.mp3',
          });
          try { require('fs').unlinkSync(audioResult.filePath); } catch (e) {}
        } else {
          await sock.sendMessage(sender, { text: 'File too large or processing issue.\nDownload directly: ' + (result.downloadUrl || url) });
        }
      } else {
        var text = '*📥 YouTube Download*\n\n';
        text += '*Title:* ' + result.title + '\n';
        text += '*Author:* ' + result.author + '\n';
        if (result.duration) text += '*Duration:* ' + Math.floor(result.duration / 60) + ':' + String(result.duration % 60).padStart(2, '0') + '\n';
        if (result.thumbnail) text += '\n📸 Thumbnail: ' + result.thumbnail + '\n';
        text += '\n📹 Watch: ' + result.url + '\n';
        if (result.downloadUrl) {
          text += '\n📥 *Direct Download Link:*\n' + result.downloadUrl + '\n';
          text += '\n_Tip: Use `--audio` to get the audio file._';
        } else {
          text += '\n⚠️ No direct link available. Try a YouTube downloader website.';
        }
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
      }
    } else if (platform === 'tiktok' || platform === 'instagram' || platform === 'spotify') {
      var text = '*📥 ' + result.platform.charAt(0).toUpperCase() + result.platform.slice(1) + ' Info*\n\n';
      text += '*Title:* ' + (result.title || 'Unknown') + '\n';
      text += '*Author:* ' + (result.author || 'Unknown') + '\n';
      if (result.thumbnail) text += '\n📸 Thumbnail: ' + result.thumbnail + '\n';
      text += '\n🔗 Original: ' + url + '\n';
      if (result.note) text += '\n*Note:* ' + result.note;
      await sock.sendMessage(sender, { text: text.substring(0, 4000) });
    } else {
      await sock.sendMessage(sender, { text: '*Platform:* ' + result.platform + '\n*URL:* ' + url + '\n\n⚠️ Automatic download not available for this platform.' });
    }
  },
};
