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
    var format = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'lowest' });
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
    var info = await ytdl.getInfo(url);
    var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    var tempDir = path.join(config.download.path, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    var filePath = path.join(tempDir, 'yt_audio_' + Date.now() + '.mp4');
    var stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
    var writer = fs.createWriteStream(filePath);
    await new Promise(function(resolve, reject) {
      stream.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
      setTimeout(function() { reject(new Error('Download timeout')); }, 120000);
    });
    var stat = fs.statSync(filePath);
    return { success: true, filePath: filePath, title: title, size: stat.size, author: info.videoDetails.author.name };
  } catch (err) {
    return { error: 'Download error: ' + err.message };
  }
}

async function scrapeTikTok(url) {
  try {
    var resp = await axios.get('https://www.tikwm.com/api/?url=' + encodeURIComponent(url), { timeout: 15000 });
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
        music: d.music || null,
        duration: d.duration || null,
        size: d.size || null,
        note: null,
      };
    }
    var fallback = await axios.get('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url), { timeout: 10000 });
    var fb = fallback.data;
    return {
      platform: 'tiktok',
      title: fb.title || 'TikTok Video',
      author: fb.author_name || 'Unknown',
      thumbnail: fb.thumbnail_url || null,
      url: url,
      downloadUrl: null,
      note: 'Direct download not available via API.',
    };
  } catch (err) {
    return { error: 'TikTok download failed: ' + err.message };
  }
}

async function downloadTikTokVideo(url) {
  try {
    var info = await scrapeTikTok(url);
    if (info.error) return info;
    if (!info.downloadUrl) return { error: 'No download URL found for this TikTok video.' };
    var fileName = 'tiktok_' + Date.now() + '.mp4';
    var tempDir = path.join(config.download.path, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    var filePath = path.join(tempDir, fileName);
    var resp = await axios({ method: 'get', url: info.downloadUrl, responseType: 'stream', timeout: 60000 });
    var writer = fs.createWriteStream(filePath);
    await new Promise(function(resolve, reject) {
      resp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    var stat = fs.statSync(filePath);
    return { success: true, filePath: filePath, title: info.title, size: stat.size, author: info.author, thumbnail: info.thumbnail };
  } catch (err) {
    return { error: 'TikTok download failed: ' + err.message };
  }
}

async function scrapeInstagram(url) {
  try {
    var resp = await axios.get('https://instasave.io/api?url=' + encodeURIComponent(url), {
      timeout: 15000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    var data = resp.data;
    if (data && data.media && data.media.length > 0) {
      var first = data.media[0];
      return {
        platform: 'instagram',
        title: data.title || 'Instagram Post',
        author: data.author || first.author || 'Unknown',
        thumbnail: first.thumbnail || data.thumbnail || null,
        url: first.url || url,
        downloadUrl: first.url || null,
        type: first.type || 'image',
        note: null,
      };
    }
    var fallbackResp = await axios.get('https://api.instagram.com/oembed?url=' + encodeURIComponent(url), { timeout: 10000 });
    var fb = fallbackResp.data;
    return {
      platform: 'instagram',
      title: fb.title || 'Instagram Post',
      author: fb.author_name || 'Unknown',
      thumbnail: fb.thumbnail_url || null,
      url: url,
      downloadUrl: null,
      note: 'Direct download not available via API.',
    };
  } catch (err) {
    var fbResp = await axios.get('https://api.instagram.com/oembed?url=' + encodeURIComponent(url), { timeout: 10000 });
    var fb = fbResp.data;
    return {
      platform: 'instagram',
      title: fb.title || 'Instagram Post',
      author: fb.author_name || 'Unknown',
      thumbnail: fb.thumbnail_url || null,
      url: url,
      downloadUrl: null,
      note: 'Direct download not available via API.',
    };
  }
}

async function downloadInstagramMedia(url) {
  try {
    var info = await scrapeInstagram(url);
    if (info.error) return info;
    if (!info.downloadUrl) return { error: 'No download URL found for this Instagram post.' };
    var ext = info.type === 'video' ? '.mp4' : '.jpg';
    var fileName = 'instagram_' + Date.now() + ext;
    var tempDir = path.join(config.download.path, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    var filePath = path.join(tempDir, fileName);
    var resp = await axios({ method: 'get', url: info.downloadUrl, responseType: 'stream', timeout: 60000 });
    var writer = fs.createWriteStream(filePath);
    await new Promise(function(resolve, reject) {
      resp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    var stat = fs.statSync(filePath);
    return { success: true, filePath: filePath, title: info.title, size: stat.size, author: info.author, type: info.type };
  } catch (err) {
    return { error: 'Instagram download failed: ' + err.message };
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
      note: null,
    };
  } catch (err) {
    return { error: 'Spotify info failed: ' + err.message };
  }
}

async function downloadSpotifyAudio(url) {
  try {
    var match = url.match(/\/track\/([a-zA-Z0-9]+)/);
    if (!match) return { error: 'Not a valid Spotify track URL.' };
    var trackId = match[1];
    var resp = await axios.get('https://api.spotifydown.com/download/' + trackId, {
      timeout: 20000,
      headers: { 'Referer': 'https://spotifydown.com/', 'Origin': 'https://spotifydown.com/' },
    });
    var data = resp.data;
    if (!data || !data.link) return { error: 'Spotify download failed: no link returned.' };
    var title = (data.title || data.metadata?.title || 'Spotify Track').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    var fileName = 'spotify_' + Date.now() + '.mp3';
    var tempDir = path.join(config.download.path, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    var filePath = path.join(tempDir, fileName);
    var dlResp = await axios({ method: 'get', url: data.link, responseType: 'stream', timeout: 120000 });
    var writer = fs.createWriteStream(filePath);
    await new Promise(function(resolve, reject) {
      dlResp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    var stat = fs.statSync(filePath);
    return { success: true, filePath: filePath, title: title, size: stat.size, author: data.artists || data.metadata?.artists || 'Unknown' };
  } catch (err) {
    return { error: 'Spotify download failed: ' + err.message };
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

async function getYouTubeVideo(url) {
  try {
    var info = await ytdl.getInfo(url);
    var hdFormats = info.formats.filter(function(f) { return f.hasVideo && f.hasAudio; });
    var format = hdFormats[0];
    if (format) {
      var hdItags = [37, 22, 18];
      for (var i = 0; i < hdItags.length; i++) {
        var found = hdFormats.find(function(f) { return f.itag === hdItags[i]; });
        if (found) { format = found; break; }
      }
    }
    if (!format) format = ytdl.chooseFormat(info.formats, { quality: 'highest' });
    if (!format) return { error: 'No playable video format found.' };
    var title = info.videoDetails.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    var filePath = path.join(config.download.path, 'temp', 'yt_' + Date.now() + '.mp4');
    var tempDir = path.join(config.download.path, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    var stream = ytdl(url, { quality: format.itag });
    var writer = fs.createWriteStream(filePath);
    await new Promise(function(resolve, reject) {
      stream.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
      setTimeout(function() { reject(new Error('Download timeout')); }, 120000);
    });
    var stat = fs.statSync(filePath);
    return { success: true, filePath: filePath, title: title, size: stat.size };
  } catch (err) {
    return { error: 'YouTube video download failed: ' + err.message };
  }
}

async function downloadMedia(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube':
      return await getYouTubeVideo(url);
    case 'tiktok':
      return await downloadTikTokVideo(url);
    case 'instagram':
      return await downloadInstagramMedia(url);
    case 'direct':
      return { platform: 'direct', title: url.split('/').pop() || 'file', url: url, downloadUrl: url, note: 'Direct file link.' };
    default:
      return { error: 'No download available for this platform.' };
  }
}

async function downloadAudio(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube':
      return await getYouTubeAudio(url);
    case 'spotify':
      return await downloadSpotifyAudio(url);
    case 'tiktok':
      return await downloadTikTokVideo(url);
    default:
      return { error: 'Audio download not available for ' + platform + '.' };
  }
}

module.exports = {
  detectPlatform,
  downloadYouTube,
  getYouTubeAudio,
  getYouTubeVideo,
  scrapeTikTok,
  downloadTikTokVideo,
  scrapeInstagram,
  downloadInstagramMedia,
  scrapeSpotify,
  downloadSpotifyAudio,
  processLink,
  downloadMedia,
  downloadAudio,
};
