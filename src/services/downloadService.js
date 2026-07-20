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

// ─── YOUTUBE ─────────────────────────────────────────────────────────────────

async function getYouTubeInfo(url) {
  if (!ytdl) return { error: 'YouTube downloader not available. Run: npm install @distube/ytdl-core' };
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
  if (!ytdl) return { error: 'YouTube downloader not available.' };
  try {
    var info = await ytdl.getInfo(url);
    var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    var tempDir = ensureTempDir();
    var filePath = path.join(tempDir, 'yt_audio_' + Date.now() + '.mp4');
    var stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
    var writer = fs.createWriteStream(filePath);
    await new Promise(function(resolve, reject) {
      stream.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
      stream.on('error', reject);
      setTimeout(function() { reject(new Error('Download timeout after 3 min')); }, 180000);
    });
    var stat = fs.statSync(filePath);
    return { success: true, filePath: filePath, title: title, size: stat.size, author: info.videoDetails.author.name };
  } catch (err) {
    return { error: 'YouTube audio download failed: ' + err.message };
  }
}

async function getYouTubeVideo(url) {
  if (!ytdl) return { error: 'YouTube downloader not available.' };
  try {
    var info = await ytdl.getInfo(url);
    var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    var tempDir = ensureTempDir();
    var filePath = path.join(tempDir, 'yt_' + Date.now() + '.mp4');

    // Pick best video+audio combined format, prefer HD
    var formats = info.formats.filter(function(f) { return f.hasVideo && f.hasAudio; });
    var hdOrder = [137, 248, 299, 136, 247, 298, 135, 246, 244, 134, 243, 133, 242, 160, 18, 22];
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
    if (!format) return { error: 'No playable video format found.' };

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
    return {
      success: true, filePath: filePath, title: title, size: stat.size,
      author: info.videoDetails.author.name,
      quality: format.qualityLabel || (format.height ? format.height + 'p' : 'HD'),
    };
  } catch (err) {
    return { error: 'YouTube video download failed: ' + err.message };
  }
}

async function downloadYouTube(url) {
  if (!ytdl) return { error: 'YouTube downloader not available.' };
  try {
    var info = await ytdl.getInfo(url);
    var format = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'highestaudio' });
    if (!format) format = info.formats.filter(function(f) { return f.hasAudio; })[0];
    if (!format) return { error: 'No playable format found.' };
    var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    return {
      platform: 'youtube', title: title, author: info.videoDetails.author.name,
      duration: parseInt(info.videoDetails.lengthSeconds) || 0,
      thumbnail: info.videoDetails.thumbnails ? info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1]?.url : null,
      url: url, format: format.mimeType || 'audio/mp4', downloadUrl: format.url,
      itag: format.itag, contentLength: format.contentLength,
    };
  } catch (err) {
    return { error: 'YouTube info failed: ' + err.message };
  }
}

// ─── TIKTOK ──────────────────────────────────────────────────────────────────

async function scrapeTikTok(url) {
  // Try tikwm API (HD quality)
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
  } catch (e) { /* try fallback */ }

  // Fallback: ssstik API
  try {
    var resp2 = await axios.post('https://ssstik.io/abc', new URLSearchParams({ id: url, locale: 'en', tt: 'ZG93bmxvYWQ=' }), {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://ssstik.io' },
      timeout: 15000
    });
    var cheerio = require('cheerio');
    var $ = cheerio.load(resp2.data);
    var dlLink = $('a.pure-button').first().attr('href') || $('[href*=".mp4"]').first().attr('href');
    var title = $('.maintext').text().trim() || 'TikTok Video';
    if (dlLink) {
      return { platform: 'tiktok', title: title, author: 'Unknown', downloadUrl: dlLink, url: url };
    }
  } catch (e) { /* try next */ }

  return { platform: 'tiktok', title: 'TikTok Video', author: 'Unknown', url: url, downloadUrl: null, note: 'Could not extract direct download link.' };
}

async function downloadTikTokVideo(url) {
  try {
    var info = await scrapeTikTok(url);
    if (info.error) return info;
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
    if (stat.size < 1000) return { error: 'Downloaded file is too small, download may have failed.' };
    return { success: true, filePath: filePath, title: info.title, size: stat.size, author: info.author, thumbnail: info.thumbnail };
  } catch (err) {
    return { error: 'TikTok download failed: ' + err.message };
  }
}

// ─── INSTAGRAM ───────────────────────────────────────────────────────────────

async function scrapeInstagram(url) {
  // Try saveig.app API
  try {
    var resp = await axios.get('https://api.saveig.app/api?url=' + encodeURIComponent(url), {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    var data = resp.data;
    if (data && data.data && data.data.length > 0) {
      var item = data.data[0];
      return {
        platform: 'instagram', title: 'Instagram Post',
        author: 'Unknown', thumbnail: item.thumbnail || null,
        url: item.url, downloadUrl: item.url, type: item.type || 'video'
      };
    }
  } catch (e) {}

  // Try snapinsta/instadl
  try {
    var headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    var resp2 = await axios.post('https://snapinsta.app/action.php', 'q=' + encodeURIComponent(url), {
      headers, timeout: 15000
    });
    var d2 = resp2.data;
    if (d2 && d2.url) {
      return {
        platform: 'instagram', title: 'Instagram Post', author: 'Unknown',
        thumbnail: null, url: d2.url, downloadUrl: d2.url, type: 'video'
      };
    }
  } catch (e) {}

  // Try instafinsta
  try {
    var resp3 = await axios.get('https://instafinsta.com/api?url=' + encodeURIComponent(url), {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    var d3 = resp3.data;
    if (d3 && (d3.url || (d3.links && d3.links[0]))) {
      var dlUrl = d3.url || d3.links[0];
      return {
        platform: 'instagram', title: d3.title || 'Instagram Post', author: d3.author || 'Unknown',
        thumbnail: d3.thumbnail || null, url: dlUrl, downloadUrl: dlUrl, type: 'video'
      };
    }
  } catch (e) {}

  // ddinstagram (proxy) — free and reliable for public posts
  try {
    var ddUrl = url.replace('instagram.com', 'ddinstagram.com');
    var resp4 = await axios.get(ddUrl, {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      maxRedirects: 5
    });
    var $ = require('cheerio').load(resp4.data);
    var videoSrc = $('video source').attr('src') || $('video').attr('src');
    if (videoSrc) {
      return {
        platform: 'instagram', title: 'Instagram Video', author: 'Unknown',
        thumbnail: null, url: videoSrc, downloadUrl: videoSrc, type: 'video'
      };
    }
  } catch (e) {}

  return {
    platform: 'instagram', title: 'Instagram Post', author: 'Unknown',
    thumbnail: null, url: url, downloadUrl: null,
    note: 'Could not extract Instagram media. Make sure the post is public.'
  };
}

async function downloadInstagramMedia(url) {
  try {
    var info = await scrapeInstagram(url);
    if (info.error) return info;
    if (!info.downloadUrl) return { error: 'No download URL found. Make sure the Instagram post is public.' };
    var ext = (info.type === 'video' || !info.type) ? '.mp4' : '.jpg';
    var fileName = 'instagram_' + Date.now() + ext;
    var tempDir = ensureTempDir();
    var filePath = path.join(tempDir, fileName);
    var resp = await axios({ method: 'get', url: info.downloadUrl, responseType: 'stream', timeout: 90000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.instagram.com/' }
    });
    var writer = fs.createWriteStream(filePath);
    await new Promise(function(resolve, reject) {
      resp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    var stat = fs.statSync(filePath);
    if (stat.size < 1000) return { error: 'Downloaded file is too small. The post may be private or unavailable.' };
    return { success: true, filePath: filePath, title: info.title, size: stat.size, author: info.author, type: info.type };
  } catch (err) {
    return { error: 'Instagram download failed: ' + err.message };
  }
}

// ─── SPOTIFY ─────────────────────────────────────────────────────────────────

async function scrapeSpotify(url) {
  try {
    var resp = await axios.get('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), { timeout: 10000 });
    var data = resp.data;
    var isTrack = url.includes('/track/');
    return {
      platform: 'spotify',
      title: data.title || 'Spotify ' + (isTrack ? 'Track' : 'Content'),
      author: data.author_name || 'Unknown',
      thumbnail: data.thumbnail_url || null, url: url,
      type: isTrack ? 'track' : 'other',
    };
  } catch (err) {
    return { error: 'Spotify info failed: ' + err.message };
  }
}

async function downloadSpotifyAudio(url) {
  var match = url.match(/\/track\/([a-zA-Z0-9]+)/);
  if (!match) return { error: 'Not a valid Spotify track URL. Use a link like: https://open.spotify.com/track/...' };
  var trackId = match[1];
  var tempDir = ensureTempDir();
  var filePath = path.join(tempDir, 'spotify_' + Date.now() + '.mp3');

  // Try spotifydown.com API
  try {
    var resp = await axios.get('https://api.spotifydown.com/download/' + trackId, {
      timeout: 30000,
      headers: {
        'Referer': 'https://spotifydown.com/',
        'Origin': 'https://spotifydown.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }
    });
    var data = resp.data;
    if (data && data.link) {
      var title = (data.title || data.metadata?.title || 'Spotify Track').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      var dlResp = await axios({ method: 'get', url: data.link, responseType: 'stream', timeout: 120000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      var writer = fs.createWriteStream(filePath);
      await new Promise(function(resolve, reject) { dlResp.data.pipe(writer); writer.on('finish', resolve); writer.on('error', reject); });
      var stat = fs.statSync(filePath);
      if (stat.size > 10000) {
        return { success: true, filePath: filePath, title: title, size: stat.size, author: data.artists || data.metadata?.artists || 'Unknown' };
      }
    }
  } catch (e) {}

  // Try yank.g3v.co.uk
  try {
    var resp2 = await axios.post('https://yank.g3v.co.uk/track', { url: url }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    var d2 = resp2.data;
    if (d2 && d2.url) {
      var title2 = (d2.title || 'Spotify Track').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      var dlResp2 = await axios({ method: 'get', url: d2.url, responseType: 'stream', timeout: 120000 });
      var writer2 = fs.createWriteStream(filePath);
      await new Promise(function(resolve, reject) { dlResp2.data.pipe(writer2); writer2.on('finish', resolve); writer2.on('error', reject); });
      var stat2 = fs.statSync(filePath);
      if (stat2.size > 10000) {
        return { success: true, filePath: filePath, title: title2, size: stat2.size, author: d2.artist || 'Unknown' };
      }
    }
  } catch (e) {}

  // Try spotifySaver via yt-search fallback
  try {
    var infoResp = await axios.get('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), { timeout: 10000 });
    var trackName = infoResp.data?.title || 'unknown track';
    var ytSearch = require('yt-search');
    var r = await ytSearch({ query: trackName, pageStart: 1, pageEnd: 2 });
    var video = r.videos && r.videos[0];
    if (video && ytdl) {
      var audioResult = await getYouTubeAudio(video.url);
      if (audioResult.success) {
        return { ...audioResult, title: trackName };
      }
    }
  } catch (e) {}

  return { error: 'Spotify download failed. All providers unavailable. Try again later.' };
}

// ─── GENERIC ─────────────────────────────────────────────────────────────────

async function processLink(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return await downloadYouTube(url);
    case 'tiktok': return await scrapeTikTok(url);
    case 'instagram': return await scrapeInstagram(url);
    case 'spotify': return await scrapeSpotify(url);
    case 'twitter':
    case 'facebook':
      return { platform: platform, title: url, url: url, note: 'Direct download not available for ' + platform + '.' };
    case 'direct':
      return { platform: 'direct', title: url.split('/').pop() || 'file', url: url, downloadUrl: url };
    default:
      return { error: 'Unsupported platform. Supported: YouTube, TikTok, Instagram, Spotify.' };
  }
}

async function downloadMedia(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return await getYouTubeVideo(url);
    case 'tiktok': return await downloadTikTokVideo(url);
    case 'instagram': return await downloadInstagramMedia(url);
    case 'direct': return { platform: 'direct', title: url.split('/').pop() || 'file', url: url, downloadUrl: url };
    default: return { error: 'No download available for platform: ' + platform };
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
  detectPlatform, downloadYouTube, getYouTubeAudio, getYouTubeVideo, getYouTubeInfo,
  scrapeTikTok, downloadTikTokVideo,
  scrapeInstagram, downloadInstagramMedia,
  scrapeSpotify, downloadSpotifyAudio,
  processLink, downloadMedia, downloadAudio,
};
