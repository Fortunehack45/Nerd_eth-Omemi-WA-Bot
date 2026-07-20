const { processLink, detectPlatform, downloadMedia, downloadAudio, downloadSpotifyAudio } = require('../services/downloadService');
const { parseFlags, formatBytes } = require('../utils/helpers');
const config = require('../../config');
const fs = require('fs');

var HELP = '*📥 Download Command*\n\nDownload media from YouTube, TikTok, Instagram, and Spotify. The bot downloads the file and sends it directly.\n\n*Usage:* `!download <link> [flags]`\n\n*Flags:*\n  `--audio`, `-a`    Download as audio only (MP3/M4A)\n  `--info`, `-i`     Show info without downloading\n\n*Supported Platforms:*\n  ▸ *YouTube* — Videos in HD (1080p/720p default)\n  ▸ *TikTok* — HD videos without watermark\n  ▸ *Instagram* — Posts, Reels, Stories (public only)\n  ▸ *Spotify* — Track audio (MP3)\n\n*Examples:*\n  `!download https://youtu.be/abc123`\n  `!download https://youtu.be/abc123 --audio`\n  `!download https://vm.tiktok.com/abc123`\n  `!download https://open.spotify.com/track/abc123`\n  `!download https://instagram.com/p/abc123`\n  `!download https://youtu.be/abc123 --info`';

async function sendFile(sock, sender, filePath, opts) {
  try {
    var buf = fs.readFileSync(filePath);
    var ext = filePath.split('.').pop().toLowerCase();
    var msgOpts = {};

    if (opts.type === 'audio' || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'opus'].includes(ext)) {
      var mimes = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg', mp4: 'audio/mp4' };
      msgOpts.audio = buf;
      msgOpts.mimetype = mimes[ext] || 'audio/mpeg';
      msgOpts.fileName = (opts.title || 'audio').substring(0, 80) + '.' + ext;
      msgOpts.ptt = false;
    } else if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)) {
      msgOpts.video = buf;
      msgOpts.caption = opts.title ? '🎬 *' + opts.title.substring(0, 100) + '*' : '🎬 Video';
      if (opts.quality) msgOpts.caption += '\n📺 Quality: ' + opts.quality;
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      msgOpts.image = buf;
      msgOpts.caption = opts.title ? '📸 *' + opts.title.substring(0, 100) + '*' : '📸 Image';
    } else {
      msgOpts.document = buf;
      msgOpts.fileName = (opts.title || 'file').substring(0, 80) + '.' + ext;
      msgOpts.mimetype = 'application/octet-stream';
    }

    await sock.sendMessage(sender, msgOpts);
  } catch (err) {
    await sock.sendMessage(sender, { text: '❌ Failed to send file: ' + err.message });
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }
}

module.exports = {
  name: 'download',
  alias: ['dl', 'save', 'get'],
  description: 'Download media from YouTube, TikTok, Instagram, Spotify in HD',
  usage: '!download <link> [--audio] [--info]',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parsed = parseFlags(args);
    var url = (parsed.positional.join(' ') || args).trim();
    var flags = parsed.flags;

    if (!url || !url.match(/https?:\/\//)) {
      return sock.sendMessage(sender, { text: '❌ Please provide a valid URL.\n\n' + HELP });
    }

    var platform = detectPlatform(url);
    if (platform === 'unknown') {
      return sock.sendMessage(sender, { text: '❌ Unsupported platform.\n\n*Supported:* YouTube, TikTok, Instagram, Spotify' });
    }

    // ── INFO MODE ────────────────────────────────────────────────────────────
    if (flags.info || flags.i) {
      await sock.sendMessage(sender, { text: '🔍 Fetching info for ' + platform + ' link...' });
      var info = await processLink(url);
      if (info.error) return sock.sendMessage(sender, { text: '❌ Error: ' + info.error });
      var t = '*📄 Media Info*\n\n';
      t += '*Platform:* ' + (info.platform || platform) + '\n';
      t += '*Title:* ' + (info.title || 'Unknown') + '\n';
      t += '*Author:* ' + (info.author || 'Unknown') + '\n';
      if (info.duration) t += '*Duration:* ' + info.duration + 's\n';
      if (info.contentLength) t += '*Size:* ' + formatBytes(parseInt(info.contentLength)) + '\n';
      if (info.note) t += '\n*Note:* ' + info.note;
      t += '\n\n🔗 Original: ' + url;
      return sock.sendMessage(sender, { text: t.substring(0, 4000) });
    }

    // ── AUDIO MODE ───────────────────────────────────────────────────────────
    if (flags.audio || flags.a) {
      await sock.sendMessage(sender, { text: '🎵 Downloading audio from *' + platform + '*...' });

      var audioResult;
      if (platform === 'spotify') {
        audioResult = await downloadSpotifyAudio(url);
      } else {
        audioResult = await downloadAudio(url);
      }

      if (audioResult.error) {
        return sock.sendMessage(sender, { text: '❌ Error: ' + audioResult.error });
      }

      if (audioResult.filePath) {
        var stat = fs.statSync(audioResult.filePath);
        if (stat.size < config.download.maxSize * 1024 * 1024) {
          await sock.sendMessage(sender, { text: '✅ Sending audio: *' + (audioResult.title || 'Track') + '*' });
          await sendFile(sock, sender, audioResult.filePath, { title: audioResult.title || 'Audio', type: 'audio' });
        } else {
          await sock.sendMessage(sender, { text: '⚠️ Audio file too large (' + formatBytes(stat.size) + '). Max: ' + config.download.maxSize + 'MB.\nLink: ' + url });
          try { fs.unlinkSync(audioResult.filePath); } catch (e) {}
        }
      }
      return;
    }

    // ── VIDEO/MEDIA MODE ─────────────────────────────────────────────────────
    await sock.sendMessage(sender, { text: '⬇️ Downloading *' + platform + '* media in HD... Please wait.' });

    var dlResult = await downloadMedia(url);

    if (dlResult.error) {
      return sock.sendMessage(sender, { text: '❌ Error: ' + dlResult.error });
    }

    if (dlResult.filePath) {
      var fileStat = fs.statSync(dlResult.filePath);
      if (fileStat.size < config.download.maxSize * 1024 * 1024) {
        var type = ['youtube', 'tiktok', 'instagram', 'twitter'].includes(platform) ? 'video' : 'media';
        await sock.sendMessage(sender, { text: '✅ Sending media: *' + (dlResult.title || platform) + '*' + (dlResult.quality ? ' (' + dlResult.quality + ')' : '') });
        await sendFile(sock, sender, dlResult.filePath, { title: dlResult.title, type: type, quality: dlResult.quality });
      } else {
        var info2 = await processLink(url);
        var link2 = info2.downloadUrl || url;
        await sock.sendMessage(sender, {
          text: '⚠️ File too large (' + formatBytes(fileStat.size) + '). Max: ' + config.download.maxSize + 'MB.\n🔗 Direct link: ' + link2
        });
        try { if (fs.existsSync(dlResult.filePath)) fs.unlinkSync(dlResult.filePath); } catch (e) {}
      }
    } else {
      // If no direct download, try to provide info
      var fallbackInfo = await processLink(url);
      if (fallbackInfo.downloadUrl) {
        await sock.sendMessage(sender, { text: '🔗 Direct download link:\n' + fallbackInfo.downloadUrl });
      } else {
        await sock.sendMessage(sender, { text: '❌ Could not download. Original link:\n' + url });
      }
    }
  },
};
