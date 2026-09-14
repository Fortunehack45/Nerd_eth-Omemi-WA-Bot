const { processLink, detectPlatform, downloadMedia, downloadAudio, downloadSpotifyAudio } = require('../services/downloadService');
const { parseFlags, formatBytes, sendAudioMessage } = require('../utils/helpers');
const config = require('../../config');
const fs = require('fs');

var HELP = '*📥 Download Command*\n\nDownload media from YouTube, TikTok, Instagram, Spotify, Twitter/X, Pinterest, and Facebook in HD.\n\n*Usage:* `!download <link> [flags]`\n\n*Flags:*\n  `--audio`, `-a`    Download as audio only (MP3/M4A)\n  `--info`, `-i`     Show info without downloading\n\n*Supported Platforms:*\n  ▸ *YouTube* — Videos in HD & Audio (1080p/720p/MP3)\n  ▸ *TikTok* — HD videos without watermark & photo carousels\n  ▸ *Instagram* — Posts, Reels, Stories & Photos (public only)\n  ▸ *Spotify* — Full track audio (MP3 320kbps)\n  ▸ *Twitter / X* — Videos & photos in HD\n  ▸ *Pinterest* — Videos & high-res images\n  ▸ *Facebook* — Public videos & reels\n\n*Examples:*\n  `!download https://youtu.be/abc123`\n  `!download https://pin.it/abc123`\n  `!download https://x.com/user/status/123`\n  `!download https://open.spotify.com/track/abc123`';

const { optimizeVideoForWhatsApp } = require('../utils/helpers');

async function sendFile(sock, sender, filePath, opts) {
  opts = opts || {};
  try {
    if (!fs.existsSync(filePath)) {
      await sock.sendMessage(sender, { text: '❌ Downloaded file not found.' });
      return;
    }

    var ext = filePath.split('.').pop().toLowerCase();

    if (opts.type === 'audio' || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'opus'].includes(ext)) {
      await sendAudioMessage(sock, sender, filePath, opts.title || 'Audio', opts.author || 'Download', { asDocument: opts.asDocument });
      return;
    }

    if (opts.type === 'image' || ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      var imgBuf = fs.readFileSync(filePath);
      var imgCap = opts.title ? '📸 *' + opts.title.substring(0, 100) + '*' : '📸 Image';
      await sock.sendMessage(sender, { image: imgBuf, caption: imgCap });
      return;
    }

    if (opts.type === 'video' || ['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)) {
      var stat = fs.statSync(filePath);
      var sizeMB = stat.size / (1024 * 1024);
      var sendFp = filePath;

      // WhatsApp limits inline videos to ~64MB. If video is > 50MB (like a 75MB TikTok),
      // or if it is not MP4, compress with ffmpeg ultrafast so it stays under 50MB and plays inline!
      if (sizeMB > 50 || ext !== 'mp4') {
        console.log('[DOWNLOAD] Compressing/optimizing video (' + sizeMB.toFixed(1) + 'MB) for WhatsApp inline playback...');
        var optFp = await optimizeVideoForWhatsApp(filePath);
        if (fs.existsSync(optFp)) {
          sendFp = optFp;
          ext = 'mp4';
        }
      }

      var vidBuf = fs.readFileSync(sendFp);
      var caption = opts.title ? '🎬 *' + opts.title.substring(0, 100) + '*' : '🎬 Video';
      if (opts.quality) caption += '\n📺 Quality: ' + opts.quality;

      // 1. Try sending as native inline playable WhatsApp video
      try {
        await sock.sendMessage(sender, {
          video: vidBuf,
          mimetype: 'video/mp4',
          caption: caption,
        });
        try { if (sendFp !== filePath && fs.existsSync(sendFp)) fs.unlinkSync(sendFp); } catch (e) {}
        return;
      } catch (e1) {
        console.warn('[DOWNLOAD] Primary video send failed, falling back to video document mode:', e1.message);
      }

      // 2. Fallback: Send as MP4 Video Document (NEVER application/octet-stream / BIN!)
      var safeName = (opts.title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 60).trim() || 'video';
      if (!safeName.toLowerCase().endsWith('.mp4')) safeName += '.mp4';
      await sock.sendMessage(sender, {
        document: vidBuf,
        mimetype: 'video/mp4',
        fileName: safeName,
        caption: caption
      });
      try { if (sendFp !== filePath && fs.existsSync(sendFp)) fs.unlinkSync(sendFp); } catch (e) {}
      return;
    }

    // Fallback for non-video files
    var docBuf = fs.readFileSync(filePath);
    var docExt = ext || 'bin';
    var docName = (opts.title || 'media').replace(/[<>:"/\\|?*]/g, '_').substring(0, 60).trim() + '.' + docExt;
    var docMime = (docExt === 'pdf') ? 'application/pdf' : ((docExt === 'apk') ? 'application/vnd.android.package-archive' : 'application/octet-stream');
    await sock.sendMessage(sender, {
      document: docBuf,
      mimetype: docMime,
      fileName: docName,
      caption: '📄 ' + (opts.title || 'Downloaded Media')
    });
  } catch (err) {
    console.error('[DOWNLOAD] sendFile error:', err);
    await sock.sendMessage(sender, { text: '❌ Failed to send file: ' + err.message });
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }
}

module.exports = {
  name: 'download',
  alias: ['dl', 'save', 'get', 'yt', 'ytdl', 'ytmp4', 'ytmp3', 'ig', 'insta', 'instagram', 'tiktok', 'tt'],
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

    // If no URL scheme found but text was provided, search audio or movie download
    if (!url.match(/https?:\/\//i)) {
      if (flags.audio || flags.a || ctx.command === 'ytmp3' || ctx.command === 'song' || ctx.command === 'play') {
        var { searchYouTubeAndDownloadAudio } = require('../services/downloadService');
        await sock.sendMessage(sender, { text: '🔍 Searching audio for "' + url.substring(0, 60) + '"...' });
        var musicRes = await searchYouTubeAndDownloadAudio(url);
        if (musicRes.error) return sock.sendMessage(sender, { text: '❌ Error: ' + musicRes.error });
        if (musicRes.filePath && fs.existsSync(musicRes.filePath)) {
          await sendFile(sock, sender, musicRes.filePath, { title: musicRes.title, type: 'audio' });
        }
        return;
      }
      return sock.sendMessage(sender, { text: '❌ Please provide a valid URL (YouTube, TikTok, Instagram, Spotify) or use `!music play <song>` or `!movie download <title>`.' });
    }

    var platform = detectPlatform(url);
    if (platform === 'unknown') {
      return sock.sendMessage(sender, { text: '❌ Unsupported platform.\n\n*Supported:* YouTube, TikTok, Instagram, Spotify, Twitter/X, Pinterest, Facebook' });
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

    // ── AUDIO MODE (or Spotify default) ──────────────────────────────────────
    if (flags.audio || flags.a || platform === 'spotify') {
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

    // Handle photo carousels (e.g. TikTok photos / slide posts)
    if (dlResult.type === 'images' && Array.isArray(dlResult.images) && dlResult.images.length > 0) {
      await sock.sendMessage(sender, { text: '📸 Sending ' + dlResult.images.length + ' photos from *' + (dlResult.title || 'TikTok') + '*...' });
      for (var imgIdx = 0; imgIdx < dlResult.images.length; imgIdx++) {
        var imgFp = dlResult.images[imgIdx];
        if (fs.existsSync(imgFp)) {
          var imgBuf = fs.readFileSync(imgFp);
          var imgCap = (imgIdx === 0 && dlResult.title) ? ('📸 *' + dlResult.title + '*\n[1/' + dlResult.images.length + ']') : ('[' + (imgIdx + 1) + '/' + dlResult.images.length + ']');
          try {
            await sock.sendMessage(sender, { image: imgBuf, caption: imgCap });
          } catch (eImg) {
            console.warn('[DOWNLOAD] Failed to send carousel image ' + imgIdx, eImg.message);
          }
          try { fs.unlinkSync(imgFp); } catch (e) {}
        }
      }
      if (dlResult.audioPath && fs.existsSync(dlResult.audioPath)) {
        await sendAudioMessage(sock, sender, dlResult.audioPath, (dlResult.title || 'TikTok') + ' Audio', dlResult.author || 'TikTok');
      }
      return;
    }

    if (dlResult.filePath) {
      var fileStat = fs.statSync(dlResult.filePath);
      if (fileStat.size < config.download.maxSize * 1024 * 1024) {
        var isImage = dlResult.type === 'image' || ['jpg', 'jpeg', 'png', 'webp'].includes(dlResult.filePath.split('.').pop().toLowerCase());
        var type = isImage ? 'image' : (['youtube', 'tiktok', 'instagram', 'twitter', 'facebook', 'pinterest'].includes(platform) ? 'video' : 'media');
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
