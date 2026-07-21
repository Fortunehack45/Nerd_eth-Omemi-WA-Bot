const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// Try loading ytdl
var ytdl = null;
try { ytdl = require('@distube/ytdl-core'); } catch (e) {
  try { ytdl = require('ytdl-core'); } catch (e2) {}
}

var ytSearch = null;
try { ytSearch = require('yt-search'); } catch (e) {}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectPlatform(url) {
  var u = (url || '').toLowerCase().trim();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com') || u.includes('vm.tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com') || u.includes('instagr.am')) return 'instagram';
  if (u.includes('spotify.com')) return 'spotify';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'facebook';
  if (u.match(/\.(mp4|mp3|webm|avi|mkv|mov)$/i)) return 'direct';
  return 'unknown';
}

function ensureTempDir() {
  var base = (config.download && config.download.path) ? config.download.path : path.join(__dirname, '..', '..', 'storage');
  var tempDir = path.join(base, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function safeUnlink(fp) {
  try { if (fp && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) {}
}

async function downloadStream(fileUrl, outputPath, extraHeaders) {
  var headers = Object.assign({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
  }, extraHeaders || {});

  var resp = await axios({
    method: 'GET',
    url: fileUrl,
    responseType: 'stream',
    timeout: 180000,
    headers: headers,
    maxRedirects: 10,
  });

  return new Promise(function(resolve, reject) {
    var writer = fs.createWriteStream(outputPath);
    resp.data.pipe(writer);
    writer.on('finish', function() {
      try {
        var stat = fs.statSync(outputPath);
        resolve(stat);
      } catch (e) { reject(e); }
    });
    writer.on('error', reject);
    resp.data.on('error', reject);
  });
}

function log(msg) {
  console.log('[DownloadService] ' + msg);
}

// ─── Cobalt API Helper (v10 format) ──────────────────────────────────────────
// Tries multiple community-hosted Cobalt instances for reliability

var COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://cobalt-api.kwiatekmiki.com',
  'https://cobalt.api.timelessnesses.me',
];

async function cobaltRequest(url, isAudioOnly, customOpts) {
  var body = {
    url: url,
    videoQuality: '720',
    filenameStyle: 'basic',
  };

  if (isAudioOnly) {
    body.downloadMode = 'audio';
    body.audioFormat = 'mp3';
  } else {
    body.downloadMode = 'auto';
  }

  if (customOpts) Object.assign(body, customOpts);

  var lastErr = null;

  for (var i = 0; i < COBALT_INSTANCES.length; i++) {
    var instance = COBALT_INSTANCES[i];
    try {
      log('Cobalt — trying ' + instance + '...');
      var resp = await axios.post(instance, body, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 30000,
      });

      var data = resp.data;
      if (!data) continue;

      // Cobalt v10 returns { status: "tunnel"/"redirect", url: "..." }
      // or { status: "picker", picker: [...] }
      if (data.url) {
        return { success: true, url: data.url, filename: data.filename || null };
      }

      // Cobalt v10 picker format (multiple media items, e.g. Instagram carousel)
      if (data.picker && data.picker.length > 0) {
        var picked = data.picker[0];
        if (picked.url) {
          return { success: true, url: picked.url, filename: picked.filename || null };
        }
      }

      // Legacy format fallback
      if (data.url) {
        return { success: true, url: data.url };
      }

    } catch (e) {
      lastErr = e;
      log('Cobalt instance ' + instance + ' failed: ' + (e.response?.data?.error?.code || e.message));
    }
  }

  return { success: false, error: lastErr ? lastErr.message : 'All Cobalt instances failed' };
}


// ─── YOUTUBE AUDIO ────────────────────────────────────────────────────────────

async function getYouTubeAudio(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'yt_audio_' + Date.now() + '.mp3');
  var title = 'YouTube Audio';

  // Get title early via ytdl if available
  if (ytdl) {
    try {
      var info0 = await ytdl.getInfo(url);
      title = (info0.videoDetails.title || title).replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    } catch (e) {}
  }

  // API 1: Cobalt (most reliable for YouTube)
  try {
    log('YT Audio — trying Cobalt...');
    var cobalt = await cobaltRequest(url, true);
    if (cobalt.success && cobalt.url) {
      var st1 = await downloadStream(cobalt.url, fp);
      if (st1.size > 10000) {
        log('YT Audio — Cobalt success (' + (st1.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: title, size: st1.size };
      }
    }
  } catch (e) { log('YT Audio Cobalt fail: ' + e.message); }

  // API 2: @distube/ytdl-core direct stream
  if (ytdl) {
    try {
      log('YT Audio — trying ytdl-core stream...');
      var info4 = await ytdl.getInfo(url);
      title = (info4.videoDetails.title || title).replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      var stream4 = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
      var writer4 = fs.createWriteStream(fp);
      await new Promise(function(resolve, reject) {
        stream4.pipe(writer4);
        writer4.on('finish', resolve);
        writer4.on('error', reject);
        stream4.on('error', reject);
        setTimeout(function() { reject(new Error('ytdl-core timeout')); }, 180000);
      });
      var st4 = fs.statSync(fp);
      if (st4.size > 10000) {
        log('YT Audio — ytdl-core success (' + (st4.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: title, size: st4.size };
      }
    } catch (e) { log('YT Audio ytdl-core fail: ' + e.message); }
  }

  // API 3: yt-dlp style via public converter (tomp3.cc)
  try {
    log('YT Audio — trying tomp3.cc...');
    var videoId = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (videoId) {
      var r3 = await axios.post('https://tomp3.cc/api/ajax/search', 'query=' + encodeURIComponent(url) + '&vt=mp3', {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://tomp3.cc/' },
        timeout: 15000
      });
      if (r3.data && r3.data.links && r3.data.links.mp3) {
        var mp3Links = r3.data.links.mp3;
        var mp3Key = Object.keys(mp3Links)[0];
        if (mp3Key && mp3Links[mp3Key] && mp3Links[mp3Key].k) {
          var r3b = await axios.post('https://tomp3.cc/api/ajax/convert', 'vid=' + (r3.data.vid || videoId[1]) + '&k=' + encodeURIComponent(mp3Links[mp3Key].k), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://tomp3.cc/' },
            timeout: 30000
          });
          if (r3b.data && r3b.data.dlink) {
            var st3 = await downloadStream(r3b.data.dlink, fp);
            if (st3.size > 10000) {
              log('YT Audio — tomp3 success (' + (st3.size / 1024).toFixed(0) + 'KB)');
              return { success: true, filePath: fp, title: r3.data.title || title, size: st3.size };
            }
          }
        }
      }
    }
  } catch (e) { log('YT Audio tomp3 fail: ' + e.message); }

  // API 4: savefrom.ca style API
  try {
    log('YT Audio — trying mp3download.to...');
    var r4 = await axios.get('https://api.mp3download.to/v2/converter?url=' + encodeURIComponent(url) + '&format=mp3', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000,
    });
    if (r4.data && r4.data.url) {
      var st5 = await downloadStream(r4.data.url, fp);
      if (st5.size > 10000) {
        log('YT Audio — mp3download success (' + (st5.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: r4.data.title || title, size: st5.size };
      }
    }
  } catch (e) { log('YT Audio mp3download fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'YouTube audio download failed after trying all servers. The video may be restricted or too long. Please try again later.' };
}

// ─── YOUTUBE VIDEO ────────────────────────────────────────────────────────────

async function getYouTubeVideo(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'yt_video_' + Date.now() + '.mp4');
  var title = 'YouTube Video';

  // API 1: Cobalt (most reliable)
  try {
    log('YT Video — trying Cobalt...');
    var cobalt = await cobaltRequest(url, false, { videoQuality: '720' });
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 50000) {
        log('YT Video — Cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: title, size: stC.size, quality: '720p' };
      }
    }
  } catch (e) { log('YT Video Cobalt fail: ' + e.message); }

  // API 2: ytdl-core
  if (ytdl) {
    try {
      log('YT Video — trying ytdl-core...');
      var info3 = await ytdl.getInfo(url);
      title = (info3.videoDetails.title || title).replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      var formats = info3.formats.filter(function(f) { return f.hasVideo && f.hasAudio && f.container === 'mp4'; });
      formats.sort(function(a, b) { return (parseInt(b.height) || 0) - (parseInt(a.height) || 0); });
      var fmt = formats[0];
      if (!fmt) fmt = ytdl.chooseFormat(info3.formats, { quality: 'highestvideo' });
      if (fmt) {
        var stream3 = ytdl(url, { format: fmt });
        var writer3 = fs.createWriteStream(fp);
        await new Promise(function(resolve, reject) {
          stream3.pipe(writer3);
          writer3.on('finish', resolve);
          writer3.on('error', reject);
          stream3.on('error', reject);
          setTimeout(function() { reject(new Error('timeout')); }, 300000);
        });
        var st3 = fs.statSync(fp);
        if (st3.size > 50000) {
          log('YT Video — ytdl-core success (' + (st3.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fp, title: title, size: st3.size, quality: fmt.qualityLabel || 'HD' };
        }
      }
    } catch (e) { log('YT Video ytdl-core fail: ' + e.message); }
  }

  // API 3: tomp3.cc video
  try {
    log('YT Video — trying tomp3.cc (video)...');
    var r5 = await axios.post('https://tomp3.cc/api/ajax/search', 'query=' + encodeURIComponent(url) + '&vt=mp4', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://tomp3.cc/' },
      timeout: 15000
    });
    if (r5.data && r5.data.links && r5.data.links.mp4) {
      var mp4Links = r5.data.links.mp4;
      // Try 720p first, then any available
      var quality = mp4Links['720p'] || mp4Links['480p'] || mp4Links['360p'] || mp4Links[Object.keys(mp4Links)[0]];
      if (quality && quality.k) {
        var r5b = await axios.post('https://tomp3.cc/api/ajax/convert', 'vid=' + (r5.data.vid || '') + '&k=' + encodeURIComponent(quality.k), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://tomp3.cc/' },
          timeout: 30000
        });
        if (r5b.data && r5b.data.dlink) {
          var st5v = await downloadStream(r5b.data.dlink, fp);
          if (st5v.size > 50000) {
            log('YT Video — tomp3 success (' + (st5v.size / 1024 / 1024).toFixed(1) + 'MB)');
            return { success: true, filePath: fp, title: r5.data.title || title, size: st5v.size, quality: '720p' };
          }
        }
      }
    }
  } catch (e) { log('YT Video tomp3 fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'YouTube video download failed. Please try again later.' };
}

// ─── TIKTOK ───────────────────────────────────────────────────────────────────

async function downloadTikTokVideo(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'tiktok_' + Date.now() + '.mp4');

  // API 1: tikwm.com (fast & reliable — still working)
  try {
    log('TikTok — trying tikwm.com...');
    var r1 = await axios.get('https://www.tikwm.com/api/', {
      params: { url: url, hd: 1 },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000,
    });
    if (r1.data && r1.data.code === 0 && r1.data.data) {
      var d = r1.data.data;
      var dlUrl = d.hdplay || d.play;
      if (dlUrl) {
        if (!dlUrl.startsWith('http')) dlUrl = 'https://www.tikwm.com' + dlUrl;
        var st1 = await downloadStream(dlUrl, fp);
        if (st1.size > 10000) {
          log('TikTok — tikwm success (' + (st1.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fp, title: d.title || 'TikTok Video', size: st1.size, author: d.author?.nickname || 'TikTok' };
        }
      }
    }
  } catch (e) { log('TikTok tikwm fail: ' + e.message); }

  // API 2: Cobalt
  try {
    log('TikTok — trying Cobalt...');
    var cobalt = await cobaltRequest(url, false);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 10000) {
        log('TikTok — Cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: 'TikTok Video', size: stC.size, author: 'TikTok' };
      }
    }
  } catch (e) { log('TikTok Cobalt fail: ' + e.message); }

  // API 3: tikcdn.io
  try {
    log('TikTok — trying tikcdn.io...');
    var r3 = await axios.post('https://tikcdn.io/api/download', { url: url }, {
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000,
    });
    if (r3.data && (r3.data.video || r3.data.videoHD)) {
      var vidUrl = r3.data.videoHD || r3.data.video;
      var st3 = await downloadStream(vidUrl, fp);
      if (st3.size > 10000) {
        log('TikTok — tikcdn success (' + (st3.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: r3.data.title || 'TikTok Video', size: st3.size, author: 'TikTok' };
      }
    }
  } catch (e) { log('TikTok tikcdn fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'TikTok download failed. Ensure the video is public and try again.' };
}

// ─── INSTAGRAM ────────────────────────────────────────────────────────────────

async function downloadInstagramMedia(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'instagram_' + Date.now() + '.mp4');

  // API 1: Cobalt (best for Instagram reels and posts)
  try {
    log('Instagram — trying Cobalt...');
    var cobalt = await cobaltRequest(url, false);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 5000) {
        log('Instagram — Cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: 'Instagram Post', size: stC.size, author: 'Instagram' };
      }
    }
  } catch (e) { log('Instagram Cobalt fail: ' + e.message); }

  // API 2: igdownloader.app (scraper)
  try {
    log('Instagram — trying igdownloader scraper...');
    var r2 = await axios.post('https://igdownloader.app/api/v1/post', { url: url }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://igdownloader.app',
        'Referer': 'https://igdownloader.app/',
      },
      timeout: 20000,
    });
    if (r2.data && r2.data.media && r2.data.media.length > 0) {
      var media = r2.data.media[0];
      var dlUrl = media.url || media.videoUrl || media.imageUrl;
      if (dlUrl) {
        var st2 = await downloadStream(dlUrl, fp);
        if (st2.size > 5000) {
          log('Instagram — igdownloader success (' + (st2.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fp, title: 'Instagram Post', size: st2.size, author: 'Instagram' };
        }
      }
    }
  } catch (e) { log('Instagram igdownloader fail: ' + e.message); }

  // API 3: snapinsta.app
  try {
    log('Instagram — trying snapinsta...');
    var r3 = await axios.post('https://snapinsta.app/api/ajaxSearch', 'q=' + encodeURIComponent(url) + '&t=media&lang=en', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://snapinsta.app',
        'Referer': 'https://snapinsta.app/',
      },
      timeout: 20000,
    });
    if (r3.data && r3.data.data) {
      var $ = require('cheerio').load(r3.data.data);
      var videoSrc = $('a.download-media').first().attr('href') || $('a[href*=".mp4"]').first().attr('href');
      if (!videoSrc) {
        // Try image
        videoSrc = $('a.download-media').first().attr('href') || $('img.download-media').first().attr('src');
      }
      if (videoSrc && videoSrc.startsWith('http')) {
        var st3 = await downloadStream(videoSrc, fp);
        if (st3.size > 5000) {
          log('Instagram — snapinsta success');
          return { success: true, filePath: fp, title: 'Instagram Post', size: st3.size, author: 'Instagram' };
        }
      }
    }
  } catch (e) { log('Instagram snapinsta fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'Instagram download failed. Ensure the post/reel is public and try again.' };
}

// ─── SPOTIFY ──────────────────────────────────────────────────────────────────

async function downloadSpotifyAudio(url) {
  var match = url.match(/\/track\/([a-zA-Z0-9]+)/);
  if (!match) return { error: 'Invalid Spotify track URL. Must be: https://open.spotify.com/track/...' };
  var trackId = match[1];
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'spotify_' + Date.now() + '.mp3');
  var trackTitle = 'Spotify Track';
  var artistName = 'Unknown Artist';

  // Get metadata from Spotify's oembed
  try {
    var metaR = await axios.get('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), { timeout: 8000 });
    if (metaR.data) {
      trackTitle = metaR.data.title || trackTitle;
      artistName = metaR.data.author_name || artistName;
    }
  } catch (e) {}

  log('Spotify — track: "' + trackTitle + '" by ' + artistName);

  // PRIMARY METHOD: YouTube search + download (most reliable for Spotify)
  // Search YouTube for the exact song and download the audio
  try {
    log('Spotify — searching YouTube for matching audio...');
    if (ytSearch) {
      var q = artistName + ' ' + trackTitle + ' audio';
      var ytRes = await ytSearch({ query: q, pageStart: 1, pageEnd: 2 });
      var video = ytRes.videos && ytRes.videos[0];
      if (video) {
        log('Spotify — found YT match: ' + video.title);
        var ytAudio = await getYouTubeAudio(video.url);
        if (ytAudio.success) {
          // Rename to Spotify path
          var spFp = path.join(tempDir, 'spotify_yt_' + Date.now() + '.mp3');
          fs.renameSync(ytAudio.filePath, spFp);
          return { success: true, filePath: spFp, title: trackTitle, size: ytAudio.size, author: artistName };
        }
      }
    }
  } catch (e) { log('Spotify YT search fail: ' + e.message); }

  // FALLBACK: Cobalt with Spotify URL directly
  try {
    log('Spotify — trying Cobalt directly...');
    var cobalt = await cobaltRequest(url, true);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 10000) {
        log('Spotify — Cobalt success (' + (stC.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: trackTitle, size: stC.size, author: artistName };
      }
    }
  } catch (e) { log('Spotify Cobalt fail: ' + e.message); }

  // FALLBACK 2: spotifydown.com
  try {
    log('Spotify — trying spotifydown.com...');
    var r1 = await axios.get('https://api.spotifydown.com/download/' + trackId, {
      headers: {
        'Referer': 'https://spotifydown.com/',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://spotifydown.com',
      },
      timeout: 20000,
    });
    if (r1.data && r1.data.link) {
      var st1 = await downloadStream(r1.data.link, fp);
      if (st1.size > 10000) {
        log('Spotify — spotifydown success (' + (st1.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: r1.data.metadata?.title || trackTitle, size: st1.size, author: artistName };
      }
    }
  } catch (e) { log('Spotify spotifydown fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'Spotify download failed. All servers are currently busy. Try again in a few minutes.' };
}

// ─── TWITTER/X ────────────────────────────────────────────────────────────────

async function downloadTwitterVideo(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'twitter_' + Date.now() + '.mp4');

  // API 1: Cobalt
  try {
    log('Twitter — trying Cobalt...');
    var cobalt = await cobaltRequest(url, false);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 10000) {
        return { success: true, filePath: fp, title: 'Twitter Video', size: stC.size, author: 'Twitter' };
      }
    }
  } catch (e) { log('Twitter Cobalt fail: ' + e.message); }

  // API 2: twitsave
  try {
    log('Twitter — trying twitsave...');
    var r2 = await axios.get('https://twitsave.com/info?url=' + encodeURIComponent(url), {
      headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000
    });
    var $ = require('cheerio').load(r2.data || '');
    var dlLink = $('a[href*=".mp4"]').first().attr('href');
    if (dlLink) {
      var st2 = await downloadStream(dlLink, fp);
      if (st2.size > 10000) {
        return { success: true, filePath: fp, title: 'Twitter Video', size: st2.size, author: 'Twitter' };
      }
    }
  } catch (e) { log('Twitter twitsave fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'Twitter video download failed. Ensure the tweet contains a video.' };
}

// ─── FACEBOOK ─────────────────────────────────────────────────────────────────

async function downloadFacebookVideo(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'facebook_' + Date.now() + '.mp4');

  // API 1: Cobalt
  try {
    log('Facebook — trying Cobalt...');
    var cobalt = await cobaltRequest(url, false);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 10000) {
        return { success: true, filePath: fp, title: 'Facebook Video', size: stC.size, author: 'Facebook' };
      }
    }
  } catch (e) { log('Facebook Cobalt fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'Facebook video download failed.' };
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

async function processLink(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return { platform: 'youtube', title: 'YouTube Video', url: url };
    case 'tiktok': { var ti = await downloadTikTokVideo(url); return ti.success ? { platform: 'tiktok', title: ti.title, downloadUrl: null } : ti; }
    case 'instagram': { var ii = await downloadInstagramMedia(url); return ii.success ? { platform: 'instagram', title: ii.title } : ii; }
    case 'spotify': return { platform: 'spotify', title: 'Spotify Track', url: url };
    default: return { error: 'Unsupported platform: ' + platform };
  }
}

async function downloadMedia(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return await getYouTubeVideo(url);
    case 'tiktok': return await downloadTikTokVideo(url);
    case 'instagram': return await downloadInstagramMedia(url);
    case 'twitter': return await downloadTwitterVideo(url);
    case 'facebook': return await downloadFacebookVideo(url);
    default: return { error: 'No video download available for: ' + platform };
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

// ─── YouTube search helper for music command ──────────────────────────────────

async function searchYouTubeAndDownloadAudio(query) {
  if (!ytSearch) return { error: 'yt-search not installed' };
  try {
    var results = await ytSearch({ query: query, pageStart: 1, pageEnd: 2 });
    var video = results.videos && results.videos[0];
    if (!video) return { error: 'No YouTube results for: ' + query };
    return await getYouTubeAudio(video.url);
  } catch (e) {
    return { error: 'Search failed: ' + e.message };
  }
}

module.exports = {
  detectPlatform,
  ensureTempDir,
  downloadStream,
  getYouTubeAudio,
  getYouTubeVideo,
  downloadTikTokVideo,
  downloadInstagramMedia,
  downloadSpotifyAudio,
  downloadTwitterVideo,
  downloadFacebookVideo,
  searchYouTubeAndDownloadAudio,
  processLink,
  downloadMedia,
  downloadAudio,
  // legacy compat
  getYouTubeInfo: async function(url) {
    if (ytdl) { try { return await ytdl.getInfo(url); } catch (e) {} }
    return { title: 'YouTube Media', videoDetails: { title: 'YouTube Media' } };
  },
  scrapeTikTok: async function(url) { return await downloadTikTokVideo(url); },
  scrapeInstagram: async function(url) { return await downloadInstagramMedia(url); },
};
