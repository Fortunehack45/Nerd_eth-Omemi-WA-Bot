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
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
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

  // API 1: y2mate.guru
  try {
    log('YT Audio — trying y2mate.guru...');
    var r1 = await axios.post('https://www.y2mate.com/mates/analyzeV2/ajax',
      'k_query=' + encodeURIComponent(url) + '&k_page=home&hl=en&q_auto=1',
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }
    );
    if (r1.data && r1.data.links && r1.data.links.mp3) {
      var mp3Links = r1.data.links.mp3;
      var mp3Key = Object.keys(mp3Links)[0];
      var mp3Item = mp3Links[mp3Key];
      if (mp3Item && mp3Item.k) {
        var r1b = await axios.post('https://www.y2mate.com/mates/convertV2/index',
          'vid=' + (r1.data.vid || '') + '&k=' + encodeURIComponent(mp3Item.k),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }
        );
        if (r1b.data && r1b.data.dlink) {
          var st1 = await downloadStream(r1b.data.dlink, fp);
          if (st1.size > 10000) {
            log('YT Audio — y2mate success (' + (st1.size / 1024).toFixed(0) + 'KB)');
            return { success: true, filePath: fp, title: title, size: st1.size };
          }
        }
      }
    }
  } catch (e) { log('YT Audio API1 fail: ' + e.message); }

  // API 2: loader.to
  try {
    log('YT Audio — trying loader.to...');
    var loaderResp = await axios.get('https://loader.to/ajax/download.php?format=mp3&url=' + encodeURIComponent(url), {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://loader.to/' },
      timeout: 15000,
    });
    if (loaderResp.data && loaderResp.data.id) {
      var jobId = loaderResp.data.id;
      // Poll for completion
      for (var i = 0; i < 15; i++) {
        await new Promise(function(res) { setTimeout(res, 3000); });
        var pollResp = await axios.get('https://loader.to/ajax/progress.php?id=' + jobId, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://loader.to/' },
          timeout: 10000,
        });
        if (pollResp.data && pollResp.data.download_url) {
          var stL = await downloadStream(pollResp.data.download_url, fp);
          if (stL.size > 10000) {
            log('YT Audio — loader.to success (' + (stL.size / 1024).toFixed(0) + 'KB)');
            return { success: true, filePath: fp, title: title, size: stL.size };
          }
          break;
        }
        if (pollResp.data && pollResp.data.progress === 100) break;
      }
    }
  } catch (e) { log('YT Audio API2 fail: ' + e.message); }

  // API 3: Cobalt tools
  try {
    log('YT Audio — trying cobalt.tools...');
    var cResp = await axios.post('https://api.cobalt.tools/api/json', {
      url: url, isAudioOnly: true, aFormat: 'mp3', isNoTTWatermark: true
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 25000
    });
    if (cResp.data && cResp.data.url) {
      var stC = await downloadStream(cResp.data.url, fp);
      if (stC.size > 10000) {
        log('YT Audio — cobalt success (' + (stC.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: title, size: stC.size };
      }
    }
  } catch (e) { log('YT Audio API3 fail: ' + e.message); }

  // API 4: @distube/ytdl-core direct stream
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
    } catch (e) { log('YT Audio API4 fail: ' + e.message); }
  }

  // API 5: Vreden
  try {
    log('YT Audio — trying vreden...');
    var vr = await axios.get('https://api.vreden.my.id/api/ytmp3?url=' + encodeURIComponent(url), { timeout: 25000 });
    var dlUrl = vr.data && vr.data.result && (vr.data.result.download?.url || vr.data.result.url);
    if (dlUrl) {
      var stV = await downloadStream(dlUrl, fp);
      if (stV.size > 10000) {
        log('YT Audio — vreden success (' + (stV.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: vr.data.result.metadata?.title || title, size: stV.size };
      }
    }
  } catch (e) { log('YT Audio API5 fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'YouTube audio download failed. Please try again later or use the direct YouTube link.' };
}

// ─── YOUTUBE VIDEO ────────────────────────────────────────────────────────────

async function getYouTubeVideo(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'yt_video_' + Date.now() + '.mp4');
  var title = 'YouTube Video';

  // API 1: Cobalt
  try {
    log('YT Video — trying cobalt.tools...');
    var cResp = await axios.post('https://api.cobalt.tools/api/json', {
      url: url, vQuality: '720', isNoTTWatermark: true
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 25000
    });
    if (cResp.data && cResp.data.url) {
      var stC = await downloadStream(cResp.data.url, fp);
      if (stC.size > 50000) {
        log('YT Video — cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: title, size: stC.size, quality: '720p' };
      }
    }
  } catch (e) { log('YT Video API1 fail: ' + e.message); }

  // API 2: Vreden
  try {
    log('YT Video — trying vreden...');
    var vr = await axios.get('https://api.vreden.my.id/api/ytmp4?url=' + encodeURIComponent(url), { timeout: 25000 });
    var dlUrl = vr.data && vr.data.result && (vr.data.result.download?.url || vr.data.result.url);
    if (dlUrl) {
      var stV = await downloadStream(dlUrl, fp);
      if (stV.size > 50000) {
        log('YT Video — vreden success (' + (stV.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: vr.data.result.metadata?.title || title, size: stV.size, quality: 'HD' };
      }
    }
  } catch (e) { log('YT Video API2 fail: ' + e.message); }

  // API 3: ytdl-core
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
    } catch (e) { log('YT Video API3 fail: ' + e.message); }
  }

  safeUnlink(fp);
  return { error: 'YouTube video download failed. Please try again later.' };
}

// ─── TIKTOK ───────────────────────────────────────────────────────────────────

async function downloadTikTokVideo(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'tiktok_' + Date.now() + '.mp4');

  // API 1: tikwm.com (fast & reliable)
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
        var st1 = await downloadStream(dlUrl, fp);
        if (st1.size > 10000) {
          log('TikTok — tikwm success (' + (st1.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fp, title: d.title || 'TikTok Video', size: st1.size, author: d.author?.nickname || 'TikTok' };
        }
      }
    }
  } catch (e) { log('TikTok API1 fail: ' + e.message); }

  // API 2: ssstik.io
  try {
    log('TikTok — trying ssstik.io...');
    var r2a = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
    var $ = require('cheerio').load(r2a.data || '');
    var r2 = await axios.post('https://ssstik.io/abc?url=' + encodeURIComponent(url), 'id=' + encodeURIComponent(url) + '&locale=en&tt=', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://ssstik.io/en',
        'Origin': 'https://ssstik.io'
      },
      timeout: 20000
    });
    var $2 = require('cheerio').load(r2.data || '');
    var dlLink = $2('a[href*=".mp4"]').first().attr('href') || $2('a.btn').first().attr('href');
    if (dlLink && dlLink.startsWith('http')) {
      var st2 = await downloadStream(dlLink, fp);
      if (st2.size > 10000) {
        log('TikTok — ssstik success (' + (st2.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: 'TikTok Video', size: st2.size, author: 'TikTok' };
      }
    }
  } catch (e) { log('TikTok API2 fail: ' + e.message); }

  // API 3: Cobalt
  try {
    log('TikTok — trying cobalt...');
    var cResp = await axios.post('https://api.cobalt.tools/api/json', { url: url, isNoTTWatermark: true }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    if (cResp.data && cResp.data.url) {
      var stC = await downloadStream(cResp.data.url, fp);
      if (stC.size > 10000) {
        log('TikTok — cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: 'TikTok Video', size: stC.size, author: 'TikTok' };
      }
    }
  } catch (e) { log('TikTok API3 fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'TikTok download failed. Ensure the video is public.' };
}

// ─── INSTAGRAM ────────────────────────────────────────────────────────────────

async function downloadInstagramMedia(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'instagram_' + Date.now() + '.mp4');

  // API 1: Vreden
  try {
    log('Instagram — trying vreden...');
    var r1 = await axios.get('https://api.vreden.my.id/api/igdl?url=' + encodeURIComponent(url), { timeout: 20000 });
    var items = r1.data && r1.data.result;
    if (items && items.length > 0) {
      var dlUrl = items[0].url || items[0].downloadUrl;
      if (dlUrl) {
        var st1 = await downloadStream(dlUrl, fp);
        if (st1.size > 5000) {
          log('Instagram — vreden success (' + (st1.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fp, title: 'Instagram Post', size: st1.size, author: 'Instagram' };
        }
      }
    }
  } catch (e) { log('Instagram API1 fail: ' + e.message); }

  // API 2: Cobalt
  try {
    log('Instagram — trying cobalt...');
    var cResp = await axios.post('https://api.cobalt.tools/api/json', { url: url }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    if (cResp.data && cResp.data.url) {
      var stC = await downloadStream(cResp.data.url, fp);
      if (stC.size > 5000) {
        log('Instagram — cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: 'Instagram Post', size: stC.size, author: 'Instagram' };
      }
    }
  } catch (e) { log('Instagram API2 fail: ' + e.message); }

  // API 3: DDInstagram
  try {
    log('Instagram — trying ddinstagram proxy...');
    var ddUrl = url.replace('www.instagram.com', 'ddinstagram.com').replace('instagram.com', 'ddinstagram.com');
    var resp3 = await axios.get(ddUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000, maxRedirects: 8
    });
    var $ = require('cheerio').load(resp3.data || '');
    var videoSrc = $('video source').attr('src') || $('video').attr('src') || $('meta[property="og:video"]').attr('content');
    if (videoSrc && videoSrc.startsWith('http')) {
      var st3 = await downloadStream(videoSrc, fp);
      if (st3.size > 5000) {
        log('Instagram — ddinstagram success');
        return { success: true, filePath: fp, title: 'Instagram Video', size: st3.size, author: 'Instagram' };
      }
    }
  } catch (e) { log('Instagram API3 fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'Instagram download failed. Ensure the post/reel is public.' };
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

  // Get metadata
  try {
    var metaR = await axios.get('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), { timeout: 8000 });
    if (metaR.data) {
      trackTitle = metaR.data.title || trackTitle;
      artistName = metaR.data.author_name || artistName;
    }
  } catch (e) {}

  log('Spotify — track: "' + trackTitle + '" by ' + artistName);

  // API 1: SpotifyDown
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
  } catch (e) { log('Spotify API1 fail: ' + e.message); }

  // API 2: Vreden
  try {
    log('Spotify — trying vreden...');
    var r2 = await axios.get('https://api.vreden.my.id/api/spotify?url=' + encodeURIComponent(url), { timeout: 20000 });
    if (r2.data && r2.data.result && r2.data.result.music) {
      var st2 = await downloadStream(r2.data.result.music, fp);
      if (st2.size > 10000) {
        log('Spotify — vreden success (' + (st2.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: trackTitle, size: st2.size, author: artistName };
      }
    }
  } catch (e) { log('Spotify API2 fail: ' + e.message); }

  // API 3: YouTube match (most reliable fallback)
  try {
    log('Spotify — falling back to YouTube match...');
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
  } catch (e) { log('Spotify API3 fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'Spotify download failed. All servers are currently busy. Try again in a few minutes.' };
}

// ─── TWITTER/X ────────────────────────────────────────────────────────────────

async function downloadTwitterVideo(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'twitter_' + Date.now() + '.mp4');

  // API 1: Cobalt
  try {
    log('Twitter — trying cobalt...');
    var cResp = await axios.post('https://api.cobalt.tools/api/json', { url: url }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    if (cResp.data && cResp.data.url) {
      var stC = await downloadStream(cResp.data.url, fp);
      if (stC.size > 10000) {
        return { success: true, filePath: fp, title: 'Twitter Video', size: stC.size, author: 'Twitter' };
      }
    }
  } catch (e) { log('Twitter API1 fail: ' + e.message); }

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
  } catch (e) { log('Twitter API2 fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'Twitter video download failed. Ensure the tweet contains a video.' };
}

// ─── FACEBOOK ─────────────────────────────────────────────────────────────────

async function downloadFacebookVideo(url) {
  var tempDir = ensureTempDir();
  var fp = path.join(tempDir, 'facebook_' + Date.now() + '.mp4');

  try {
    log('Facebook — trying cobalt...');
    var cResp = await axios.post('https://api.cobalt.tools/api/json', { url: url }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    if (cResp.data && cResp.data.url) {
      var stC = await downloadStream(cResp.data.url, fp);
      if (stC.size > 10000) {
        return { success: true, filePath: fp, title: 'Facebook Video', size: stC.size, author: 'Facebook' };
      }
    }
  } catch (e) { log('Facebook API1 fail: ' + e.message); }

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
