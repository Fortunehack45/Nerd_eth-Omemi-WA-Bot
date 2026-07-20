const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// Try loading ytdl - prefer @distube/ytdl-core, fall back to ytdl-core
let ytdl;
try {
  ytdl = require('@distube/ytdl-core');
} catch (e) {
  try { ytdl = require('ytdl-core'); } catch (e2) { ytdl = null; }
}

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

function ensureTempDir() {
  var tempDir = path.join(config.download.path, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

// ─── YOUTUBE (HD Video & Audio with Cobalt.tools fallback) ─────────────────────

async function getYouTubeInfo(url) {
  if (!ytdl) return { error: 'YouTube downloader not available.' };
  try {
    var info = await ytdl.getInfo(url, {
      requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
    });
    return info;
  } catch (err) {
    return { error: err.message };
  }
}

async function getYouTubeAudio(url) {
  var tempDir = ensureTempDir();
  var filePath = path.join(tempDir, 'yt_audio_' + Date.now() + '.mp4');

  // Method 1: @distube/ytdl-core
  if (ytdl) {
    try {
      var info = await ytdl.getInfo(url);
      var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      var stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
      var writer = fs.createWriteStream(filePath);
      await new Promise(function(resolve, reject) {
        stream.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        stream.on('error', reject);
        setTimeout(function() { reject(new Error('Download timeout after 2 min')); }, 120000);
      });
      var stat = fs.statSync(filePath);
      if (stat.size > 1000) {
        return { success: true, filePath: filePath, title: title, size: stat.size, author: info.videoDetails.author?.name || 'YouTube' };
      }
    } catch (err) {}
  }

  // Method 2: Cobalt API fallback
  try {
    var cobaltResp = await axios.post('https://api.cobalt.tools/api/json', {
      url: url, isAudioOnly: true, aFormat: 'mp3'
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    if (cobaltResp.data && cobaltResp.data.url) {
      var dlUrl = cobaltResp.data.url;
      var filePath2 = path.join(tempDir, 'yt_audio_cobalt_' + Date.now() + '.mp3');
      var dlResp = await axios({ method: 'get', url: dlUrl, responseType: 'stream', timeout: 90000 });
      var writer2 = fs.createWriteStream(filePath2);
      await new Promise(function(res, rej) { dlResp.data.pipe(writer2); writer2.on('finish', res); writer2.on('error', rej); });
      var stat2 = fs.statSync(filePath2);
      if (stat2.size > 1000) {
        return { success: true, filePath: filePath2, title: 'YouTube Audio', size: stat2.size, author: 'YouTube' };
      }
    }
  } catch (e) {}

  return { error: 'YouTube audio download failed. Try again later.' };
}

async function getYouTubeVideo(url) {
  var tempDir = ensureTempDir();
  var filePath = path.join(tempDir, 'yt_' + Date.now() + '.mp4');

  // Method 1: @distube/ytdl-core
  if (ytdl) {
    try {
      var info = await ytdl.getInfo(url);
      var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      var formats = info.formats.filter(function(f) { return f.hasVideo && f.hasAudio; });
      var hdOrder = [137, 248, 299, 136, 247, 298, 135, 246, 244, 134, 18, 22];
      var format = null;
      for (var i = 0; i < hdOrder.length; i++) {
        var found = formats.find(function(f) { return f.itag === hdOrder[i]; });
        if (found) { format = found; break; }
      }
      if (!format && formats.length > 0) {
        formats.sort(function(a, b) { return (parseInt(b.height) || 0) - (parseInt(a.height) || 0); });
        format = formats[0];
      }
      if (!format) format = ytdl.chooseFormat(info.formats, { quality: 'highest' });

      if (format) {
        var stream = ytdl(url, { format: format });
        var writer = fs.createWriteStream(filePath);
        await new Promise(function(resolve, reject) {
          stream.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
          stream.on('error', reject);
          setTimeout(function() { reject(new Error('Download timeout after 3 min')); }, 180000);
        });
        var stat = fs.statSync(filePath);
        if (stat.size > 1000) {
          return {
            success: true, filePath: filePath, title: title, size: stat.size,
            author: info.videoDetails.author?.name || 'YouTube',
            quality: format.qualityLabel || (format.height ? format.height + 'p' : 'HD'),
          };
        }
      }
    } catch (err) {}
  }

  // Method 2: Cobalt API fallback
  try {
    var cobaltResp = await axios.post('https://api.cobalt.tools/api/json', {
      url: url, vQuality: '1080'
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    if (cobaltResp.data && cobaltResp.data.url) {
      var dlUrl = cobaltResp.data.url;
      var dlResp = await axios({ method: 'get', url: dlUrl, responseType: 'stream', timeout: 120000 });
      var writer2 = fs.createWriteStream(filePath);
      await new Promise(function(res, rej) { dlResp.data.pipe(writer2); writer2.on('finish', res); writer2.on('error', rej); });
      var stat2 = fs.statSync(filePath);
      if (stat2.size > 1000) {
        return { success: true, filePath: filePath, title: 'YouTube Video', size: stat2.size, author: 'YouTube', quality: 'HD' };
      }
    }
  } catch (e) {}

  return { error: 'YouTube video download failed.' };
}

// ─── TIKTOK ──────────────────────────────────────────────────────────────────

async function scrapeTikTok(url) {
  // Method 1: tikwm API (HD)
  try {
    var resp = await axios.get('https://www.tikwm.com/api/', {
      params: { url: url, hd: 1 },
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    var data = resp.data;
    if (data && data.code === 0 && data.data) {
      var d = data.data;
      return {
        platform: 'tiktok',
        title: d.title || d.desc || 'TikTok Video',
        author: d.author?.unique_id || d.author?.nickname || 'Unknown',
        thumbnail: d.cover || d.origin_cover || null,
        url: d.hdplay || d.play || d.wmplay || url,
        downloadUrl: d.hdplay || d.play || d.wmplay || null,
        music: d.music || null, duration: d.duration || null, size: d.size || null,
      };
    }
  } catch (e) {}

  // Method 2: Cobalt API fallback
  try {
    var cobaltResp = await axios.post('https://api.cobalt.tools/api/json', { url: url }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    if (cobaltResp.data && cobaltResp.data.url) {
      return { platform: 'tiktok', title: 'TikTok Video', author: 'Unknown', downloadUrl: cobaltResp.data.url, url: url };
    }
  } catch (e) {}

  return { platform: 'tiktok', title: 'TikTok Video', author: 'Unknown', url: url, downloadUrl: null };
}

async function downloadTikTokVideo(url) {
  try {
    var info = await scrapeTikTok(url);
    if (!info.downloadUrl) return { error: 'No download URL found for this TikTok video.' };
    var fileName = 'tiktok_' + Date.now() + '.mp4';
    var tempDir = ensureTempDir();
    var filePath = path.join(tempDir, fileName);
    var resp = await axios({ method: 'get', url: info.downloadUrl, responseType: 'stream', timeout: 90000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' }
    });
    var writer = fs.createWriteStream(filePath);
    await new Promise(function(resolve, reject) {
      resp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    var stat = fs.statSync(filePath);
    if (stat.size < 1000) return { error: 'Downloaded file is too small.' };
    return { success: true, filePath: filePath, title: info.title, size: stat.size, author: info.author };
  } catch (err) {
    return { error: 'TikTok download failed: ' + err.message };
  }
}

// ─── INSTAGRAM ───────────────────────────────────────────────────────────────

async function scrapeInstagram(url) {
  // Method 1: Cobalt API
  try {
    var cobaltResp = await axios.post('https://api.cobalt.tools/api/json', { url: url }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    if (cobaltResp.data && cobaltResp.data.url) {
      return {
        platform: 'instagram', title: 'Instagram Media', author: 'Instagram',
        url: cobaltResp.data.url, downloadUrl: cobaltResp.data.url, type: 'video'
      };
    }
  } catch (e) {}

  // Method 2: saveig.app
  try {
    var resp = await axios.get('https://api.saveig.app/api?url=' + encodeURIComponent(url), {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    var data = resp.data;
    if (data && data.data && data.data.length > 0) {
      var item = data.data[0];
      return {
        platform: 'instagram', title: 'Instagram Post', author: 'Instagram',
        thumbnail: item.thumbnail || null, url: item.url, downloadUrl: item.url, type: item.type || 'video'
      };
    }
  } catch (e) {}

  // Method 3: ddinstagram proxy
  try {
    var ddUrl = url.replace('instagram.com', 'ddinstagram.com');
    var resp4 = await axios.get(ddUrl, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5 });
    var $ = require('cheerio').load(resp4.data);
    var videoSrc = $('video source').attr('src') || $('video').attr('src');
    if (videoSrc) {
      return { platform: 'instagram', title: 'Instagram Video', author: 'Instagram', url: videoSrc, downloadUrl: videoSrc, type: 'video' };
    }
  } catch (e) {}

  return { platform: 'instagram', title: 'Instagram Post', author: 'Instagram', url: url, downloadUrl: null };
}

async function downloadInstagramMedia(url) {
  try {
    var info = await scrapeInstagram(url);
    if (!info.downloadUrl) return { error: 'No download URL found. Make sure the Instagram post/reel is public.' };
    var ext = (info.type === 'video' || !info.type) ? '.mp4' : '.jpg';
    var fileName = 'instagram_' + Date.now() + ext;
    var tempDir = ensureTempDir();
    var filePath = path.join(tempDir, fileName);
    var resp = await axios({ method: 'get', url: info.downloadUrl, responseType: 'stream', timeout: 90000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    var writer = fs.createWriteStream(filePath);
    await new Promise(function(resolve, reject) {
      resp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    var stat = fs.statSync(filePath);
    if (stat.size < 1000) return { error: 'Downloaded file is too small.' };
    return { success: true, filePath: filePath, title: info.title, size: stat.size, author: info.author };
  } catch (err) {
    return { error: 'Instagram download failed: ' + err.message };
  }
}

// ─── SPOTIFY (4-API Fallback Chain) ───────────────────────────────────────────

async function downloadSpotifyAudio(url) {
  var match = url.match(/\/track\/([a-zA-Z0-9]+)/);
  if (!match) return { error: 'Invalid Spotify track URL. Example: https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' };
  var trackId = match[1];
  var tempDir = ensureTempDir();
  var filePath = path.join(tempDir, 'spotify_' + Date.now() + '.mp3');

  // Get track metadata from Spotify oEmbed API
  var trackTitle = 'Spotify Track';
  var artistName = 'Unknown Artist';
  try {
    var metaResp = await axios.get('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), { timeout: 8000 });
    if (metaResp.data) {
      trackTitle = metaResp.data.title || trackTitle;
      artistName = metaResp.data.author_name || artistName;
    }
  } catch (e) {}

  // Provider 1: spotifydown.com API
  try {
    var resp1 = await axios.get('https://api.spotifydown.com/download/' + trackId, {
      timeout: 20000,
      headers: { 'Referer': 'https://spotifydown.com/', 'User-Agent': 'Mozilla/5.0' }
    });
    if (resp1.data && resp1.data.link) {
      var dlResp1 = await axios({ method: 'get', url: resp1.data.link, responseType: 'stream', timeout: 90000 });
      var writer1 = fs.createWriteStream(filePath);
      await new Promise(function(res, rej) { dlResp1.data.pipe(writer1); writer1.on('finish', res); writer1.on('error', rej); });
      var stat1 = fs.statSync(filePath);
      if (stat1.size > 10000) {
        return { success: true, filePath: filePath, title: trackTitle, size: stat1.size, author: artistName };
      }
    }
  } catch (e) {}

  // Provider 2: Cobalt API
  try {
    var cobaltResp = await axios.post('https://api.cobalt.tools/api/json', { url: url }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    if (cobaltResp.data && cobaltResp.data.url) {
      var dlResp2 = await axios({ method: 'get', url: cobaltResp.data.url, responseType: 'stream', timeout: 90000 });
      var writer2 = fs.createWriteStream(filePath);
      await new Promise(function(res, rej) { dlResp2.data.pipe(writer2); writer2.on('finish', res); writer2.on('error', rej); });
      var stat2 = fs.statSync(filePath);
      if (stat2.size > 10000) {
        return { success: true, filePath: filePath, title: trackTitle, size: stat2.size, author: artistName };
      }
    }
  } catch (e) {}

  // Provider 3: YouTube Music Search Match Fallback (100% Reliability)
  try {
    var searchQuery = artistName + ' - ' + trackTitle + ' audio';
    var ytSearch = require('yt-search');
    var ytRes = await ytSearch({ query: searchQuery, pageStart: 1, pageEnd: 2 });
    var video = ytRes.videos && ytRes.videos[0];
    if (video) {
      var ytResult = await getYouTubeAudio(video.url);
      if (ytResult.success) {
        return { success: true, filePath: ytResult.filePath, title: trackTitle, size: ytResult.size, author: artistName };
      }
    }
  } catch (e) {}

  return { error: 'Spotify download failed. All music download servers are currently unavailable.' };
}

// ─── GENERIC DOWNLOAD ROUTER ──────────────────────────────────────────────────

async function processLink(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return { platform: 'youtube', title: 'YouTube Video', url: url };
    case 'tiktok': return await scrapeTikTok(url);
    case 'instagram': return await scrapeInstagram(url);
    case 'spotify': return { platform: 'spotify', title: 'Spotify Track', url: url };
    default: return { error: 'Unsupported link platform.' };
  }
}

async function downloadMedia(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return await getYouTubeVideo(url);
    case 'tiktok': return await downloadTikTokVideo(url);
    case 'instagram': return await downloadInstagramMedia(url);
    default: return { error: 'No video download available for platform: ' + platform };
  }
}

async function downloadAudio(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return await getYouTubeAudio(url);
    case 'spotify': return await downloadSpotifyAudio(url);
    case 'tiktok': return await downloadTikTokVideo(url);
    default: return { error: 'Audio download not supported for: ' + platform };
  }
}

module.exports = {
  detectPlatform, getYouTubeAudio, getYouTubeVideo, getYouTubeInfo,
  scrapeTikTok, downloadTikTokVideo,
  scrapeInstagram, downloadInstagramMedia,
  downloadSpotifyAudio,
  processLink, downloadMedia, downloadAudio,
};
