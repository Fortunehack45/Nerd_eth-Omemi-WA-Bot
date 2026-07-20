const ytdl = require('ytdl-core');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

function detectPlatform(url) {
  url = url.toLowerCase().trim();
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('instagram.com') || url.includes('instagr.am')) return 'instagram';
  if (url.includes('spotify.com')) return 'spotify';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('facebook.com') || url.includes('fb.watch')) return 'facebook';
  if (url.match(/\.(mp4|mp3|webm|avi|mkv|mov)$/i)) return 'direct';
  return 'unknown';
}

async function downloadYouTube(url) {
  try {
    var info = await ytdl.getInfo(url, { quality: 'lowestaudio' });
    var format = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio' });
    if (!format) format = info.formats.filter(function(f) { return f.hasAudio; })[0];
    if (!format) return { error: 'No playable format found.' };
    var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    var author = info.videoDetails.author.name;
    var duration = parseInt(info.videoDetails.lengthSeconds) || 0;
    var thumb = info.videoDetails.thumbnails && info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1] ? info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url : null;
    return {
      platform: 'youtube',
      title: title,
      author: author,
      duration: duration,
      thumbnail: thumb,
      url: url,
      format: format.mimeType || 'audio/mp4',
      downloadUrl: format.url,
      itag: format.itag,
      contentLength: format.contentLength,
    };
  } catch (err) {
    return { error: 'YouTube download failed: ' + err.message };
  }
}

async function getYouTubeAudio(url) {
  try {
    var stream = ytdl(url, { filter: 'audioonly', quality: 'lowestaudio' });
    var info = await ytdl.getInfo(url);
    var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    var filePath = path.join(config.download.path, title + '.mp3');
    if (!fs.existsSync(config.download.path)) fs.mkdirSync(config.download.path, { recursive: true });
    var writer = fs.createWriteStream(filePath);
    return new Promise(function(resolve, reject) {
      stream.pipe(writer);
      writer.on('finish', function() {
        resolve({ success: true, filePath: filePath, title: title, size: fs.statSync(filePath).size });
      });
      writer.on('error', function(err) {
        resolve({ error: 'Write error: ' + err.message });
      });
    });
  } catch (err) {
    return { error: 'Download error: ' + err.message };
  }
}

async function scrapeTikTok(url) {
  try {
    var resp = await axios.get('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url), { timeout: 10000 });
    var data = resp.data;
    return {
      platform: 'tiktok',
      title: data.title || 'TikTok Video',
      author: data.author_name || data.author_unique_id || 'Unknown',
      thumbnail: data.thumbnail_url || null,
      url: data.author_url || url,
      html: data.html || null,
      downloadUrl: null,
      note: 'Direct download not available. Use a TikTok downloader website.',
    };
  } catch (err) {
    return { error: 'TikTok info failed: ' + err.message + '. Try a TikTok downloader website.' };
  }
}

async function scrapeInstagram(url) {
  try {
    var resp = await axios.get('https://api.instagram.com/oembed?url=' + encodeURIComponent(url), { timeout: 10000 });
    var data = resp.data;
    return {
      platform: 'instagram',
      title: data.title || 'Instagram Post',
      author: data.author_name || 'Unknown',
      thumbnail: data.thumbnail_url || null,
      url: url,
      downloadUrl: null,
      note: 'Direct download not available. Send the link to a story/IG downloader service.',
    };
  } catch (err) {
    return { error: 'Instagram info failed: ' + err.message };
  }
}

async function scrapeSpotify(url) {
  try {
    var isTrack = url.includes('/track/');
    var resp = await axios.get('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), { timeout: 10000 });
    var data = resp.data;
    return {
      platform: 'spotify',
      title: data.title || 'Spotify ' + (isTrack ? 'Track' : 'Content'),
      author: data.author_name || 'Unknown',
      thumbnail: data.thumbnail_url || null,
      url: url,
      type: isTrack ? 'track' : 'other',
      note: 'Spotify downloads require premium. Use !music search to find the song.',
    };
  } catch (err) {
    return { error: 'Spotify info failed: ' + err.message };
  }
}

async function processLink(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube':
      return await downloadYouTube(url);
    case 'tiktok':
      return await scrapeTikTok(url);
    case 'instagram':
      return await scrapeInstagram(url);
    case 'spotify':
      return await scrapeSpotify(url);
    case 'twitter':
    case 'facebook':
      return { platform: platform, title: url, url: url, note: 'Direct download not available for ' + platform + '.' };
    case 'direct':
      return { platform: 'direct', title: url.split('/').pop() || 'file', url: url, downloadUrl: url, note: 'Direct file link.' };
    default:
      return { error: 'Unsupported platform. Supported: YouTube, TikTok, Instagram, Spotify.' };
  }
}

module.exports = {
  detectPlatform,
  downloadYouTube,
  getYouTubeAudio,
  scrapeTikTok,
  scrapeInstagram,
  scrapeSpotify,
  processLink,
};
