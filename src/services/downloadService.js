const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { execFile } = require('child_process');

// Try loading ytdl-core
var ytdl = null;
try { ytdl = require('@distube/ytdl-core'); } catch (e) {
  try { ytdl = require('ytdl-core'); } catch (e2) {}
}

var ffmpegPath = null;
try { ffmpegPath = require('ffmpeg-static'); } catch (e) {}

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

function runYtDlp(args, timeout) {
  return new Promise(function(resolve) {
    var fullArgs = ['-m', 'yt_dlp'];
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      fullArgs.push('--ffmpeg-location', ffmpegPath);
    }
    fullArgs.push.apply(fullArgs, args);

    // Try python -m yt_dlp first
    execFile('python', fullArgs, { timeout: timeout || 180000, maxBuffer: 10 * 1024 * 1024 }, function(err, stdout, stderr) {
      if (!err) {
        return resolve({ success: true, stdout: stdout, stderr: stderr });
      }

      // Fallback: try standalone yt-dlp executable
      var execArgs = [];
      if (ffmpegPath && fs.existsSync(ffmpegPath)) {
        execArgs.push('--ffmpeg-location', ffmpegPath);
      }
      execArgs.push.apply(execArgs, args);

      execFile('yt-dlp', execArgs, { timeout: timeout || 180000, maxBuffer: 10 * 1024 * 1024 }, function(err2, stdout2, stderr2) {
        if (!err2) {
          return resolve({ success: true, stdout: stdout2, stderr: stderr2 });
        }
        log('yt-dlp log: ' + (err.message || stderr || err2.message || '').substring(0, 150));
        resolve({ success: false, error: err.message || stderr, stdout: stdout, stderr: stderr });
      });
    });
  });
}

// ─── Cobalt API Helper (v10 & v7 format fallback) ────────────────────────────

var COBALT_INSTANCES = [
  'https://cobalt.tools',
  'https://api.cobalt.tools',
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
    // Try both root v10 endpoint and /api/json v7 endpoint
    var endpoints = [
      instance.replace(/\/$/, '') + '/',
      instance.endsWith('/api/json') ? instance : (instance.replace(/\/$/, '') + '/api/json'),
    ];

    for (var j = 0; j < endpoints.length; j++) {
      var targetUrl = endpoints[j];
      try {
        log('Cobalt — trying ' + targetUrl + '...');
        var resp = await axios.post(targetUrl, body, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 2500,
        });

        var data = resp.data;
        if (!data) continue;

        if (data.url) {
          return { success: true, url: data.url, filename: data.filename || null };
        }

        if (data.picker && data.picker.length > 0) {
          var picked = data.picker[0];
          if (picked.url) {
            return { success: true, url: picked.url, filename: picked.filename || null };
          }
        }
      } catch (e) {
        lastErr = e;
      }
    }
  }

  return { success: false, error: lastErr ? lastErr.message : 'All Cobalt instances failed' };
}


// ─── YOUTUBE AUDIO ────────────────────────────────────────────────────────────

async function getYouTubeAudio(url) {
  var tempDir = ensureTempDir();
  var ts = Date.now();
  var outPattern = path.join(tempDir, 'yt_audio_' + ts + '.%(ext)s');
  var expectedMp3 = path.join(tempDir, 'yt_audio_' + ts + '.mp3');
  var title = 'YouTube Audio';

  if (ytSearch) {
    try {
      var info0 = await ytSearch({ url });
      if (info0 && info0.title) title = info0.title;
      else if (info0 && info0.videos && info0.videos[0]) title = info0.videos[0].title;
    } catch (e) {}
  }

  // Engine 1: Python / Executable yt-dlp (fast & best audio quality)
  try {
    log('YT Audio — trying yt-dlp...');
    var res = await runYtDlp([
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outPattern,
      '--no-playlist',
      '--no-warnings',
      url
    ], 180000);

    if (fs.existsSync(expectedMp3)) {
      var st0 = fs.statSync(expectedMp3);
      if (st0.size > 5000) {
        log('YT Audio — yt-dlp success (' + (st0.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: expectedMp3, title: title, size: st0.size };
      }
    }

    var files = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('yt_audio_' + ts); });
    if (files.length > 0) {
      var fp0 = path.join(tempDir, files[0]);
      var st1 = fs.statSync(fp0);
      if (st1.size > 5000) {
        log('YT Audio — yt-dlp fallback file success (' + (st1.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp0, title: title, size: st1.size };
      }
    }
  } catch (e) { log('YT Audio yt-dlp fail: ' + e.message); }

  // Engine 2: y2mate public REST API
  try {
    log('YT Audio — trying y2mate...');
    var fpY2 = path.join(tempDir, 'yt_y2mate_' + ts + '.mp3');
    var r1 = await axios.post('https://www.y2mate.com/mates/analyzeV2/ajax', 
      'k_query=' + encodeURIComponent(url) + '&k_page=home&hl=en&q_auto=0', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.y2mate.com/'
      },
      timeout: 15000
    });
    if (r1.data && r1.data.links && r1.data.links.mp3) {
      var mp3Obj = r1.data.links.mp3;
      var key = Object.keys(mp3Obj)[0];
      var k = mp3Obj[key] && mp3Obj[key].k;
      var vid = r1.data.vid;
      if (k && vid) {
        var r2 = await axios.post('https://www.y2mate.com/mates/convertV2/index',
          'vid=' + vid + '&k=' + encodeURIComponent(k), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://www.y2mate.com/'
          },
          timeout: 20000
        });
        if (r2.data && r2.data.dlink) {
          var stY2 = await downloadStream(r2.data.dlink, fpY2);
          if (stY2.size > 5000) {
            log('YT Audio — y2mate success (' + (stY2.size / 1024).toFixed(0) + 'KB)');
            return { success: true, filePath: fpY2, title: r1.data.title || title, size: stY2.size };
          }
        }
      }
    }
  } catch (e) { log('YT Audio y2mate fail: ' + e.message); }

  // Engine 3: Cobalt
  try {
    log('YT Audio — trying Cobalt...');
    var cobalt = await cobaltRequest(url, true);
    if (cobalt.success && cobalt.url) {
      var fpCob = path.join(tempDir, 'yt_cobalt_' + ts + '.mp3');
      var st1 = await downloadStream(cobalt.url, fpCob);
      if (st1.size > 10000) {
        log('YT Audio — Cobalt success (' + (st1.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fpCob, title: title, size: st1.size };
      }
    }
  } catch (e) { log('YT Audio Cobalt fail: ' + e.message); }

  // Engine 4: ytdl-core stream fallback
  if (ytdl) {
    try {
      log('YT Audio — trying ytdl-core stream...');
      var fpCore = path.join(tempDir, 'yt_core_' + ts + '.mp3');
      var info4 = await ytdl.getInfo(url);
      title = (info4.videoDetails.title || title).replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
      var stream4 = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
      var writer4 = fs.createWriteStream(fpCore);
      await new Promise(function(resolve, reject) {
        stream4.pipe(writer4);
        writer4.on('finish', resolve);
        writer4.on('error', reject);
        stream4.on('error', reject);
        setTimeout(function() { reject(new Error('ytdl-core timeout')); }, 180000);
      });
      var st4 = fs.statSync(fpCore);
      if (st4.size > 10000) {
        log('YT Audio — ytdl-core success (' + (st4.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fpCore, title: title, size: st4.size };
      }
    } catch (e) { log('YT Audio ytdl-core fail: ' + e.message); }
  }

  return { error: 'YouTube audio download failed after trying all engines. Please try again later.' };
}

// ─── YOUTUBE VIDEO ────────────────────────────────────────────────────────────

async function getYouTubeVideo(url) {
  var tempDir = ensureTempDir();
  var ts = Date.now();
  var outPattern = path.join(tempDir, 'yt_video_' + ts + '.%(ext)s');
  var expectedMp4 = path.join(tempDir, 'yt_video_' + ts + '.mp4');
  var title = 'YouTube Video';

  if (ytSearch) {
    try {
      var info0 = await ytSearch({ url });
      if (info0 && info0.title) title = info0.title;
      else if (info0 && info0.videos && info0.videos[0]) title = info0.videos[0].title;
    } catch (e) {}
  }

  // Engine 1: yt-dlp
  try {
    log('YT Video — trying yt-dlp...');
    var res = await runYtDlp([
      '-f', 'b[ext=mp4]/best[ext=mp4]/best',
      '-o', outPattern,
      '--no-playlist',
      '--no-warnings',
      url
    ], 180000);

    if (fs.existsSync(expectedMp4)) {
      var st0 = fs.statSync(expectedMp4);
      if (st0.size > 10000) {
        log('YT Video — yt-dlp success (' + (st0.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: expectedMp4, title: title, size: st0.size, quality: 'HD' };
      }
    }

    var files = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('yt_video_' + ts); });
    if (files.length > 0) {
      var fp0 = path.join(tempDir, files[0]);
      var st1 = fs.statSync(fp0);
      if (st1.size > 10000) {
        log('YT Video — yt-dlp fallback file success (' + (st1.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp0, title: title, size: st1.size, quality: 'HD' };
      }
    }
  } catch (e) { log('YT Video yt-dlp fail: ' + e.message); }

  // Engine 2: Cobalt
  try {
    log('YT Video — trying Cobalt...');
    var fpCob = path.join(tempDir, 'yt_video_cobalt_' + ts + '.mp4');
    var cobalt = await cobaltRequest(url, false, { videoQuality: '720' });
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fpCob);
      if (stC.size > 50000) {
        log('YT Video — Cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fpCob, title: title, size: stC.size, quality: '720p' };
      }
    }
  } catch (e) { log('YT Video Cobalt fail: ' + e.message); }

  return { error: 'YouTube video download failed.' };
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

// ─── INSTAGRAM ────────────────────────────────────────────────────────────────

async function downloadInstagramMedia(url) {
  var tempDir = ensureTempDir();
  var ts = Date.now();
  var fpCob = path.join(tempDir, 'instagram_cobalt_' + ts + '.mp4');
  var fpSnap = path.join(tempDir, 'instagram_snap_' + ts + '.mp4');
  var outPattern = path.join(tempDir, 'instagram_' + ts + '.%(ext)s');
  var expectedMp4 = path.join(tempDir, 'instagram_' + ts + '.mp4');

  // Engine 1: wf-instagram-url-direct API Scraper (High Speed)
  try {
    log('Instagram — trying wf-instagram-url-direct...');
    var { instagramGetUrl } = require('wf-instagram-url-direct');
    var igRes = await instagramGetUrl(url);
    if (igRes && igRes.url_list && igRes.url_list.length > 0) {
      var directIgUrl = igRes.url_list[0];
      var isDirectVid = !directIgUrl.match(/\.(jpg|jpeg|png|webp)/i);
      var fpIg = isDirectVid ? path.join(tempDir, 'instagram_direct_' + ts + '.mp4') : path.join(tempDir, 'instagram_direct_' + ts + '.jpg');
      var stIg = await downloadStream(directIgUrl, fpIg);
      if (stIg.size > 3000) {
        log('Instagram — wf-instagram-url-direct success (' + (stIg.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fpIg, title: 'Instagram Media', size: stIg.size, author: 'Instagram' };
      }
    }
  } catch (e) { log('Instagram wf-direct fail: ' + e.message); }

  // Engine 2: SnapSave API Scraper
  try {
    log('Instagram — trying SnapSave...');
    var snapResp = await axios.post('https://snapsave.app/action.php', 
      'url=' + encodeURIComponent(url), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Origin': 'https://snapsave.app',
        'Referer': 'https://snapsave.app/'
      },
      timeout: 10000,
    });

    if (snapResp.data) {
      var scriptData = snapResp.data;
      var match = scriptData.match(/}\s*\(\s*("[\s\S]+?")\s*,\s*(\d+)\s*,\s*("[\s\S]+?")\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (match) {
        var _h = JSON.parse(match[1]);
        var _u = parseInt(match[2]);
        var _n = JSON.parse(match[3]);
        var _t = parseInt(match[4]);
        var _e = parseInt(match[5]);
        var _r = parseInt(match[6]);

        var _0xc17e = ["", "split", "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/", "slice", "indexOf", "", "", ".", "pow", "reduce", "reverse", "0"];
        var decodeFunc = function(d, ev, f) {
          var g = _0xc17e[2][_0xc17e[1]](_0xc17e[0]);
          var h = g[_0xc17e[3]](0, ev);
          var i = g[_0xc17e[3]](0, f);
          var j = d[_0xc17e[1]](_0xc17e[0])[_0xc17e[10]]()[_0xc17e[9]](function(a, b, c) {
            if (h[_0xc17e[4]](b) !== -1) return a += h[_0xc17e[4]](b) * (Math[_0xc17e[8]](ev, c));
          }, 0);
          var k = _0xc17e[0];
          while (j > 0) { k = i[j % f] + k; j = (j - (j % f)) / f; }
          return k || _0xc17e[11];
        };

        var htmlDecoded = (function(h, u, n, t, e, r) {
          var resStr = "";
          for (var idx = 0, len = h.length; idx < len; idx++) {
            var s = "";
            while (h[idx] !== n[e]) { s += h[idx]; idx++; }
            for (var j = 0; j < n.length; j++) s = s.replace(new RegExp(n[j], "g"), j);
            resStr += String.fromCharCode(decodeFunc(s, e, 10) - t);
          }
          return decodeURIComponent(escape(resStr));
        })(_h, _u, _n, _t, _e, _r);

        if (htmlDecoded) {
          var links = [...htmlDecoded.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(u => u.startsWith('http'));
          if (links.length > 0) {
            var dlUrl = links[0];
            var isVid = !dlUrl.match(/\.(jpg|jpeg|png|webp)/i);
            var snapFile = isVid ? fpSnap : path.join(tempDir, 'instagram_snap_' + ts + '.jpg');
            var stSnap = await downloadStream(dlUrl, snapFile);
            if (stSnap.size > 3000) {
              log('Instagram — SnapSave success (' + (stSnap.size / 1024 / 1024).toFixed(1) + 'MB)');
              return { success: true, filePath: snapFile, title: 'Instagram Media', size: stSnap.size, author: 'Instagram' };
            }
          }
        }
      }
    }
  } catch (e) { log('Instagram SnapSave fail: ' + e.message); }

  // Engine 3: Cobalt v10 / v7 API
  try {
    log('Instagram — trying Cobalt...');
    var cobalt = await cobaltRequest(url, false);
    if (cobalt.success && cobalt.url) {
      var isVideo = !cobalt.url.match(/\.(jpg|jpeg|png|webp)/i);
      var targetFp = isVideo ? fpCob : path.join(tempDir, 'instagram_cobalt_' + ts + '.jpg');
      var stC = await downloadStream(cobalt.url, targetFp);
      if (stC.size > 3000) {
        log('Instagram — Cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: targetFp, title: 'Instagram Media', size: stC.size, author: 'Instagram' };
      }
    }
  } catch (e) { log('Instagram Cobalt fail: ' + e.message); }

  // Engine 4: Short-timeout yt-dlp fallback (5 seconds timeout)
  try {
    log('Instagram — trying yt-dlp fallback (short timeout)...');
    var res = await runYtDlp([
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      '-o', outPattern,
      '--no-warnings',
      url
    ], 5000);

    if (fs.existsSync(expectedMp4)) {
      var st0 = fs.statSync(expectedMp4);
      if (st0.size > 5000) {
        log('Instagram — yt-dlp success (' + (st0.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: expectedMp4, title: 'Instagram Media', size: st0.size, author: 'Instagram' };
      }
    }

    var files = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('instagram_' + ts); });
    if (files.length > 0) {
      var fp0 = path.join(tempDir, files[0]);
      var st1 = fs.statSync(fp0);
      if (st1.size > 5000) {
        log('Instagram — yt-dlp file success (' + (st1.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp0, title: 'Instagram Media', size: st1.size, author: 'Instagram' };
      }
    }
  } catch (e) { log('Instagram yt-dlp fail: ' + e.message); }

  safeUnlink(expectedMp4);
  safeUnlink(fpSnap);
  safeUnlink(fpCob);
  return { error: 'Instagram download failed. Ensure the post/reel is public and try again.' };
}

// ─── SPOTIFY ──────────────────────────────────────────────────────────────────

async function downloadSpotifyAudio(url) {
  var cleanUrl = (url || '').trim();
  var tempDir = ensureTempDir();
  var ts = Date.now();
  var fp = path.join(tempDir, 'spotify_' + ts + '.mp3');
  var trackTitle = 'Spotify Track';
  var artistName = 'Unknown Artist';

  // Extract metadata via Spotify OEmbed API
  try {
    log('Spotify — fetching track metadata via Spotify OEmbed...');
    var metaR = await axios.get('https://open.spotify.com/oembed?url=' + encodeURIComponent(cleanUrl), { timeout: 8000 });
    if (metaR.data) {
      if (metaR.data.title) trackTitle = metaR.data.title;
      if (metaR.data.author_name) artistName = metaR.data.author_name;
    }
  } catch (e) { log('Spotify OEmbed metadata note: ' + e.message); }

  log('Spotify — searching audio for: "' + trackTitle + '" by ' + artistName);

  // PRIMARY METHOD: YouTube search + download (Matches Spotify song to high-res YouTube audio)
  try {
    var searchQuery = artistName !== 'Unknown Artist'
      ? (artistName + ' ' + trackTitle + ' official audio')
      : (trackTitle + ' audio');

    log('Spotify — searching YouTube: "' + searchQuery + '"...');

    var searchRes = await searchYouTubeAndDownloadAudio(searchQuery);
    if (searchRes.success && searchRes.filePath && fs.existsSync(searchRes.filePath)) {
      var spFp = path.join(tempDir, 'spotify_yt_' + ts + '.mp3');
      fs.renameSync(searchRes.filePath, spFp);
      var stSp = fs.statSync(spFp);
      log('Spotify — YouTube match success (' + (stSp.size / 1024).toFixed(0) + 'KB)');
      return { success: true, filePath: spFp, title: trackTitle, size: stSp.size, author: artistName };
    }
  } catch (e) { log('Spotify YouTube search fail: ' + e.message); }

  // FALLBACK 1: Cobalt direct Spotify request
  try {
    log('Spotify — trying Cobalt directly...');
    var cobalt = await cobaltRequest(cleanUrl, true);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 10000) {
        log('Spotify — Cobalt success (' + (stC.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: trackTitle, size: stC.size, author: artistName };
      }
    }
  } catch (e) { log('Spotify Cobalt fail: ' + e.message); }

  // FALLBACK 2: spotifydown API
  var trackMatch = cleanUrl.match(/\/track\/([a-zA-Z0-9]+)/);
  if (trackMatch && trackMatch[1]) {
    try {
      log('Spotify — trying spotifydown API...');
      var r1 = await axios.get('https://api.spotifydown.com/download/' + trackMatch[1], {
        headers: {
          'Referer': 'https://spotifydown.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
  }

  safeUnlink(fp);
  return { error: 'Spotify track download failed. Please verify the link or try searching by title.' };
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
  var tempDir = ensureTempDir();
  var ts = Date.now();
  var outPattern = path.join(tempDir, 'yt_search_' + ts + '.%(ext)s');

  log('YT Search Audio — search query: "' + query + '"...');

  var searchQuery = query.startsWith('http') ? query : ('ytsearch1:' + query);

  // Engine 1: yt-dlp search
  try {
    var res = await runYtDlp([
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outPattern,
      '--no-playlist',
      '--no-warnings',
      searchQuery
    ], 180000);

    var files = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('yt_search_' + ts); });
    if (files.length > 0) {
      var fp0 = path.join(tempDir, files[0]);
      var st0 = fs.statSync(fp0);
      if (st0.size > 5000) {
        var title = query;
        if (ytSearch) {
          try {
            var sr = await ytSearch({ query: query, pageStart: 1, pageEnd: 1 });
            if (sr.videos && sr.videos[0]) title = sr.videos[0].title;
          } catch (e) {}
        }
        log('YT Search Audio — yt-dlp success (' + (st0.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp0, title: title, size: st0.size };
      }
    }
  } catch (e) { log('YT Search Audio yt-dlp fail: ' + e.message); }

  // Engine 2: ytSearch + getYouTubeAudio
  if (ytSearch) {
    try {
      var results = await ytSearch({ query: query, pageStart: 1, pageEnd: 2 });
      var video = results.videos && results.videos[0];
      if (!video) return { error: 'No YouTube results found for: ' + query };
      return await getYouTubeAudio(video.url);
    } catch (e) {
      return { error: 'Search failed: ' + e.message };
    }
  }

  return { error: 'No audio found for query: ' + query };
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
