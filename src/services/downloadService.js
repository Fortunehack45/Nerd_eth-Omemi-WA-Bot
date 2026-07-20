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

// Helper: Download stream or buffer to local file
async function downloadFileFromUrl(fileUrl, outputPath, headers) {
  var resp = await axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
    timeout: 120000,
    headers: headers || { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  var writer = fs.createWriteStream(outputPath);
  await new Promise(function(resolve, reject) {
    resp.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  return fs.statSync(outputPath);
}

// ─── YOUTUBE (Public API Fallback Chain) ──────────────────────────────────────

async function getYouTubeInfo(url) {
  if (ytdl) {
    try {
      var info = await ytdl.getInfo(url);
      return info;
    } catch (e) {}
  }
  return { title: 'YouTube Media', videoDetails: { title: 'YouTube Media' } };
}

async function getYouTubeAudio(url) {
  var tempDir = ensureTempDir();
  var filePath = path.join(tempDir, 'yt_audio_' + Date.now() + '.mp3');

  // Method 1: Vreden Public API (Fast & Reliable)
  try {
    var vResp = await axios.get('https://api.vreden.my.id/api/ytmp3?url=' + encodeURIComponent(url), { timeout: 20000 });
    if (vResp.data && vResp.data.result && vResp.data.result.download && vResp.data.result.download.url) {
      var item = vResp.data.result;
      var stat = await downloadFileFromUrl(item.download.url, filePath);
      if (stat.size > 5000) {
        return { success: true, filePath: filePath, title: item.metadata?.title || 'YouTube Audio', size: stat.size, author: item.metadata?.author?.name || 'YouTube' };
      }
    }
  } catch (e) {}

  // Method 2: @distube/ytdl-core
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
        setTimeout(function() { reject(new Error('Timeout')); }, 120000);
      });
      var stat2 = fs.statSync(filePath);
      if (stat2.size > 5000) {
        return { success: true, filePath: filePath, title: title, size: stat2.size, author: info.videoDetails.author?.name || 'YouTube' };
      }
    } catch (e) {}
  }

  // Method 3: Cobalt Public API
  try {
    var cobaltResp = await axios.post('https://api.cobalt.tools/api/json', {
      url: url, isAudioOnly: true, aFormat: 'mp3'
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    if (cobaltResp.data && cobaltResp.data.url) {
      var stat3 = await downloadFileFromUrl(cobaltResp.data.url, filePath);
      if (stat3.size > 5000) {
        return { success: true, filePath: filePath, title: 'YouTube Audio', size: stat3.size, author: 'YouTube' };
      }
    }
  } catch (e) {}

  return { error: 'YouTube audio download failed. Try again later.' };
}

async function getYouTubeVideo(url) {
  var tempDir = ensureTempDir();
  var filePath = path.join(tempDir, 'yt_' + Date.now() + '.mp4');

  // Method 1: Vreden Public API
  try {
    var vResp = await axios.get('https://api.vreden.my.id/api/ytmp4?url=' + encodeURIComponent(url), { timeout: 25000 });
    if (vResp.data && vResp.data.result && vResp.data.result.download && vResp.data.result.download.url) {
      var item = vResp.data.result;
      var stat = await downloadFileFromUrl(item.download.url, filePath);
      if (stat.size > 10000) {
        return { success: true, filePath: filePath, title: item.metadata?.title || 'YouTube Video', size: stat.size, author: item.metadata?.author?.name || 'YouTube', quality: 'HD' };
      }
    }
  } catch (e) {}

  // Method 2: @distube/ytdl-core
  if (ytdl) {
    try {
      var info = await ytdl.getInfo(url);
      var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      var formats = info.formats.filter(function(f) { return f.hasVideo && f.hasAudio; });
      formats.sort(function(a, b) { return (parseInt(b.height) || 0) - (parseInt(a.height) || 0); });
      var format = formats[0] || ytdl.chooseFormat(info.formats, { quality: 'highest' });
      if (format) {
        var stream = ytdl(url, { format: format });
        var writer = fs.createWriteStream(filePath);
        await new Promise(function(resolve, reject) {
          stream.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
          stream.on('error', reject);
          setTimeout(function() { reject(new Error('Timeout')); }, 150000);
        });
        var stat2 = fs.statSync(filePath);
        if (stat2.size > 10000) {
          return { success: true, filePath: filePath, title: title, size: stat2.size, author: info.videoDetails.author?.name || 'YouTube', quality: format.qualityLabel || 'HD' };
        }
      }
    } catch (e) {}
  }

  // Method 3: Cobalt API
  try {
    var cobaltResp = await axios.post('https://api.cobalt.tools/api/json', { url: url, vQuality: '720' }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    if (cobaltResp.data && cobaltResp.data.url) {
      var stat3 = await downloadFileFromUrl(cobaltResp.data.url, filePath);
      if (stat3.size > 10000) {
        return { success: true, filePath: filePath, title: 'YouTube Video', size: stat3.size, author: 'YouTube', quality: 'HD' };
      }
    }
  } catch (e) {}

  return { error: 'YouTube video download failed.' };
}

// ─── INSTAGRAM (Public API Fallback Chain) ────────────────────────────────────

async function scrapeInstagram(url) {
  // Method 1: Vreden Public IG API
  try {
    var vResp = await axios.get('https://api.vreden.my.id/api/igdl?url=' + encodeURIComponent(url), { timeout: 20000 });
    if (vResp.data && vResp.data.result && vResp.data.result.length > 0) {
      var item = vResp.data.result[0];
      var dlUrl = item.url || item.downloadUrl || item;
      return { platform: 'instagram', title: 'Instagram Post', author: 'Instagram', downloadUrl: dlUrl, type: 'video' };
    }
  } catch (e) {}

  // Method 2: Cobalt API
  try {
    var cobaltResp = await axios.post('https://api.cobalt.tools/api/json', { url: url }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    if (cobaltResp.data && cobaltResp.data.url) {
      return { platform: 'instagram', title: 'Instagram Post', author: 'Instagram', downloadUrl: cobaltResp.data.url, type: 'video' };
    }
  } catch (e) {}

  // Method 3: DDInstagram proxy
  try {
    var ddUrl = url.replace('instagram.com', 'ddinstagram.com');
    var resp4 = await axios.get(ddUrl, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5 });
    var $ = require('cheerio').load(resp4.data);
    var videoSrc = $('video source').attr('src') || $('video').attr('src');
    if (videoSrc) {
      return { platform: 'instagram', title: 'Instagram Video', author: 'Instagram', downloadUrl: videoSrc, type: 'video' };
    }
  } catch (e) {}

  return { platform: 'instagram', title: 'Instagram Post', author: 'Instagram', downloadUrl: null };
}

async function downloadInstagramMedia(url) {
  try {
    var info = await scrapeInstagram(url);
    if (!info.downloadUrl) return { error: 'No download URL found. Ensure the Instagram post/reel is public.' };
    var tempDir = ensureTempDir();
    var filePath = path.join(tempDir, 'instagram_' + Date.now() + '.mp4');
    var stat = await downloadFileFromUrl(info.downloadUrl, filePath);
    if (stat.size < 1000) return { error: 'Downloaded file is too small.' };
    return { success: true, filePath: filePath, title: info.title, size: stat.size, author: info.author };
  } catch (err) {
    return { error: 'Instagram download failed: ' + err.message };
  }
}

// ─── SPOTIFY (Public API Fallback Chain) ──────────────────────────────────────

async function downloadSpotifyAudio(url) {
  var match = url.match(/\/track\/([a-zA-Z0-9]+)/);
  if (!match) return { error: 'Invalid Spotify track URL. Example: https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' };
  var trackId = match[1];
  var tempDir = ensureTempDir();
  var filePath = path.join(tempDir, 'spotify_' + Date.now() + '.mp3');

  // Metadata
  var trackTitle = 'Spotify Track';
  var artistName = 'Unknown Artist';
  try {
    var metaResp = await axios.get('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), { timeout: 8000 });
    if (metaResp.data) {
      trackTitle = metaResp.data.title || trackTitle;
      artistName = metaResp.data.author_name || artistName;
    }
  } catch (e) {}

  // Method 1: Vreden Public Spotify API
  try {
    var vResp = await axios.get('https://api.vreden.my.id/api/spotify?url=' + encodeURIComponent(url), { timeout: 20000 });
    if (vResp.data && vResp.data.result && vResp.data.result.music) {
      var stat = await downloadFileFromUrl(vResp.data.result.music, filePath);
      if (stat.size > 10000) {
        return { success: true, filePath: filePath, title: trackTitle, size: stat.size, author: artistName };
      }
    }
  } catch (e) {}

  // Method 2: SpotifyDown API
  try {
    var resp1 = await axios.get('https://api.spotifydown.com/download/' + trackId, {
      timeout: 20000,
      headers: { 'Referer': 'https://spotifydown.com/', 'User-Agent': 'Mozilla/5.0' }
    });
    if (resp1.data && resp1.data.link) {
      var stat2 = await downloadFileFromUrl(resp1.data.link, filePath);
      if (stat2.size > 10000) {
        return { success: true, filePath: filePath, title: trackTitle, size: stat2.size, author: artistName };
      }
    }
  } catch (e) {}

  // Method 3: YouTube Search Match (100% Reliable Fallback)
  try {
    var searchQuery = artistName + ' - ' + trackTitle + ' official audio';
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

  return { error: 'Spotify download failed. All servers currently busy.' };
}

// ─── TIKTOK ──────────────────────────────────────────────────────────────────

async function scrapeTikTok(url) {
  try {
    var resp = await axios.get('https://www.tikwm.com/api/', {
      params: { url: url, hd: 1 },
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (resp.data && resp.data.code === 0 && resp.data.data) {
      var d = resp.data.data;
      return { platform: 'tiktok', title: d.title || 'TikTok Video', author: d.author?.nickname || 'TikTok', downloadUrl: d.hdplay || d.play || d.wmplay };
    }
  } catch (e) {}

  return { platform: 'tiktok', title: 'TikTok Video', author: 'TikTok', downloadUrl: null };
}

async function downloadTikTokVideo(url) {
  try {
    var info = await scrapeTikTok(url);
    if (!info.downloadUrl) return { error: 'No download URL found for this TikTok.' };
    var tempDir = ensureTempDir();
    var filePath = path.join(tempDir, 'tiktok_' + Date.now() + '.mp4');
    var stat = await downloadFileFromUrl(info.downloadUrl, filePath);
    if (stat.size < 1000) return { error: 'TikTok download failed.' };
    return { success: true, filePath: filePath, title: info.title, size: stat.size, author: info.author };
  } catch (err) {
    return { error: 'TikTok download failed: ' + err.message };
  }
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

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
