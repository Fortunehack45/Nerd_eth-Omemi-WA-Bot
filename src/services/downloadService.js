const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { execFile } = require('child_process');
const { optimizeVideoForWhatsApp } = require('../utils/helpers');

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
  if (u.includes('spotify.com') || u.includes('spotify.link')) return 'spotify';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('pinterest.com') || u.includes('pin.it')) return 'pinterest';
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
  if (u.match(/\.(mp4|mp3|webm|avi|mkv|mov|wav|ogg|m4a|aac)$/i)) return 'direct';
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

  // Engine 1: btch-downloader direct YouTube API
  try {
    log('YT Audio — trying btch-downloader...');
    var { youtube: btchYt } = require('btch-downloader');
    var ytRes = await btchYt(url);
    if (ytRes && ytRes.status && ytRes.mp3) {
      var fpBtch = path.join(tempDir, 'yt_btch_' + ts + '.mp3');
      var stBtch = await downloadStream(ytRes.mp3, fpBtch);
      if (stBtch.size > 10000) {
        log('YT Audio — btch-downloader success (' + (stBtch.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fpBtch, title: ytRes.title || title, size: stBtch.size };
      }
    }
  } catch (e) { log('YT Audio btch-downloader fail: ' + e.message); }

  // Engine 2: Python / Executable yt-dlp (fast & best audio quality)
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

  // Engine 1: yt-dlp (Standard 720p60 HD format with format merging + compression)
  try {
    log('YT Video — trying yt-dlp 720p60 HD extractor...');
    var res = await runYtDlp([
      '-f', 'bv*[height<=720][fps<=60][ext=mp4]+ba[ext=m4a]/b[height<=720][fps<=60][ext=mp4]/b[height<=720]/best[height<=720]/best',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      '-o', outPattern,
      url
    ], 180000);

    var targetFp = null;
    if (fs.existsSync(expectedMp4)) {
      targetFp = expectedMp4;
    } else {
      var files = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('yt_video_' + ts); });
      if (files.length > 0) targetFp = path.join(tempDir, files[0]);
    }

    if (targetFp && fs.existsSync(targetFp)) {
      var st0 = fs.statSync(targetFp);
      if (st0.size > 10000) {
        log('YT Video — yt-dlp download success (' + (st0.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: targetFp, title: title, size: st0.size, quality: '720p60 HD' };
      }
    }
  } catch (e) { log('YT Video yt-dlp fail: ' + e.message); }

  // Engine 2: Cobalt (HD 720p)
  try {
    log('YT Video — trying Cobalt HD 720p...');
    var fpCob = path.join(tempDir, 'yt_video_cobalt_' + ts + '.mp4');
    var cobalt = await cobaltRequest(url, false, { videoQuality: '720' });
    if (!cobalt.success || !cobalt.url) {
      cobalt = await cobaltRequest(url, false, { videoQuality: '720' });
    }
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fpCob);
      if (stC.size > 50000) {
        log('YT Video — Cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB). Optimizing for WhatsApp Status...');
        var optCob = await optimizeVideoForWhatsApp(fpCob);
        var finalCobStat = fs.existsSync(optCob) ? fs.statSync(optCob) : stC;
        return { success: true, filePath: optCob, title: title, size: finalCobStat.size, quality: 'HD' };
      }
    }
  } catch (e) { log('YT Video Cobalt fail: ' + e.message); }

  // Engine 3: btch-downloader direct YouTube Video API fallback
  try {
    log('YT Video — trying btch-downloader...');
    var { youtube: btchYtV } = require('btch-downloader');
    var ytVRes = await btchYtV(url);
    if (ytVRes && ytVRes.status && ytVRes.mp4) {
      var fpBtchV = path.join(tempDir, 'yt_video_btch_' + ts + '.mp4');
      var stBtchV = await downloadStream(ytVRes.mp4, fpBtchV);
      if (stBtchV.size > 20000) {
        log('YT Video — btch-downloader success (' + (stBtchV.size / 1024 / 1024).toFixed(1) + 'MB). Optimizing...');
        var optBtch = await optimizeVideoForWhatsApp(fpBtchV);
        var finalBtchStat = fs.existsSync(optBtch) ? fs.statSync(optBtch) : stBtchV;
        return { success: true, filePath: optBtch, title: ytVRes.title || title, size: finalBtchStat.size, quality: 'HD' };
      }
    }
  } catch (e) { log('YT Video btch-downloader fail: ' + e.message); }

  return { error: 'YouTube video download failed.' };
}

// ─── TIKTOK ───────────────────────────────────────────────────────────────────

async function downloadTikTokVideo(url) {
  var tempDir = ensureTempDir();
  var ts = Date.now();
  var fp = path.join(tempDir, 'tiktok_' + ts + '.mp4');

  // Engine 1: tikwm.com (Fast, HD, and supports BOTH videos & photo carousels/slides)
  try {
    log('TikTok — trying tikwm.com...');
    var r1 = await axios.get('https://www.tikwm.com/api/', {
      params: { url: url, hd: 1 },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    if (r1.data && r1.data.code === 0 && r1.data.data) {
      var d = r1.data.data;

      // Check if this is a TikTok PHOTO CAROUSEL / SLIDE POST
      if (d.images && Array.isArray(d.images) && d.images.length > 0) {
        log('TikTok — detected photo carousel with ' + d.images.length + ' images');
        var imgPaths = [];
        for (var i = 0; i < d.images.length; i++) {
          var imgUrl = d.images[i];
          if (!imgUrl.startsWith('http')) imgUrl = 'https://www.tikwm.com' + imgUrl;
          var imgFp = path.join(tempDir, 'tiktok_img_' + ts + '_' + (i + 1) + '.jpg');
          try {
            var stImg = await downloadStream(imgUrl, imgFp);
            if (stImg.size > 1000) imgPaths.push(imgFp);
          } catch (eImg) {}
        }
        if (imgPaths.length > 0) {
          var audioFp = null;
          if (d.music) {
            try {
              var mUrl = d.music.startsWith('http') ? d.music : ('https://www.tikwm.com' + d.music);
              var mFp = path.join(tempDir, 'tiktok_audio_' + ts + '.mp3');
              var stM = await downloadStream(mUrl, mFp);
              if (stM.size > 2000) audioFp = mFp;
            } catch (eM) {}
          }
          return {
            success: true,
            type: 'images',
            images: imgPaths,
            title: d.title || 'TikTok Photos',
            author: d.author?.nickname || 'TikTok',
            audioPath: audioFp,
          };
        }
      }

      // If it is a video
      var dlUrl = d.hdplay || d.play;
      if (dlUrl) {
        if (!dlUrl.startsWith('http')) dlUrl = 'https://www.tikwm.com' + dlUrl;
        var st1 = await downloadStream(dlUrl, fp);
        if (st1.size > 10000) {
          log('TikTok — tikwm success (' + (st1.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fp, title: d.title || 'TikTok Video', size: st1.size, author: d.author?.nickname || 'TikTok', quality: 'HD' };
        }
      }
    }
  } catch (e) { log('TikTok tikwm fail: ' + e.message); }

  // Engine 2: btch-downloader TikTok API (Supports photos & video)
  try {
    log('TikTok — trying btch-downloader...');
    var { ttdl: btchTt } = require('btch-downloader');
    var ttRes = await btchTt(url);
    if (ttRes && ttRes.status) {
      if (ttRes.images && Array.isArray(ttRes.images) && ttRes.images.length > 0) {
        log('TikTok — btch detected photo carousel with ' + ttRes.images.length + ' images');
        var imgPathsBtch = [];
        for (var j = 0; j < ttRes.images.length; j++) {
          var imgUrlBtch = ttRes.images[j];
          var imgFpBtch = path.join(tempDir, 'tiktok_btch_img_' + ts + '_' + (j + 1) + '.jpg');
          try {
            var stImgBtch = await downloadStream(imgUrlBtch, imgFpBtch);
            if (stImgBtch.size > 1000) imgPathsBtch.push(imgFpBtch);
          } catch (eImgBtch) {}
        }
        if (imgPathsBtch.length > 0) {
          return {
            success: true,
            type: 'images',
            images: imgPathsBtch,
            title: ttRes.title || 'TikTok Photos',
            author: 'TikTok',
          };
        }
      }

      if (ttRes.video && ttRes.video.length > 0) {
        var stBtchTt = await downloadStream(ttRes.video[0], fp);
        if (stBtchTt.size > 10000) {
          log('TikTok — btch-downloader success (' + (stBtchTt.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fp, title: ttRes.title || 'TikTok Video', size: stBtchTt.size, author: 'TikTok', quality: 'HD' };
        }
      }
    }
  } catch (e) { log('TikTok btch-downloader fail: ' + e.message); }

  // Engine 3: yt-dlp
  try {
    log('TikTok — trying yt-dlp...');
    var outPatternTt = path.join(tempDir, 'tiktok_ytdlp_' + ts + '.%(ext)s');
    var expectedMp4Tt = path.join(tempDir, 'tiktok_ytdlp_' + ts + '.mp4');
    var resTt = await runYtDlp([
      '-f', 'b[height<=720][fps<=60][ext=mp4]/b[height<=720][ext=mp4]/b[height<=720]/best[height<=720]/best',
      '-o', outPatternTt,
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      url
    ], 35000);

    var targetTtFp = fs.existsSync(expectedMp4Tt) ? expectedMp4Tt : null;
    if (!targetTtFp) {
      var filesTt = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('tiktok_ytdlp_' + ts); });
      if (filesTt.length > 0) targetTtFp = path.join(tempDir, filesTt[0]);
    }
    if (targetTtFp && fs.existsSync(targetTtFp)) {
      var stYtTt = fs.statSync(targetTtFp);
      if (stYtTt.size > 10000) {
        log('TikTok — yt-dlp success (' + (stYtTt.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: targetTtFp, title: 'TikTok Video', size: stYtTt.size, author: 'TikTok', quality: 'HD' };
      }
    }
  } catch (e) { log('TikTok yt-dlp fail: ' + e.message); }

  // Engine 4: Cobalt
  try {
    log('TikTok — trying Cobalt...');
    var cobalt = await cobaltRequest(url, false);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 10000) {
        log('TikTok — Cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: 'TikTok Video', size: stC.size, author: 'TikTok', quality: 'HD' };
      }
    }
  } catch (e) { log('TikTok Cobalt fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'TikTok download failed. Ensure the video or photos are public and try again.' };
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

  // Engine 1: wf-instagram-url-direct API Scraper (High Speed, 1-2s delivery)
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

  // Engine 2: btch-downloader direct Instagram scraper (1-2s delivery)
  try {
    log('Instagram — trying btch-downloader...');
    var { igdl: btchIg } = require('btch-downloader');
    var btchRes = await btchIg(url);
    if (btchRes && Array.isArray(btchRes) && btchRes.length > 0) {
      var directBtchUrl = btchRes[0].url || btchRes[0];
      if (typeof directBtchUrl === 'string') {
        var isVidBtch = !directBtchUrl.match(/\.(jpg|jpeg|png|webp)/i);
        var fpBtch = isVidBtch ? path.join(tempDir, 'instagram_btch_' + ts + '.mp4') : path.join(tempDir, 'instagram_btch_' + ts + '.jpg');
        var stBtch = await downloadStream(directBtchUrl, fpBtch);
        if (stBtch.size > 3000) {
          log('Instagram — btch-downloader success (' + (stBtch.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fpBtch, title: 'Instagram Media', size: stBtch.size, author: 'Instagram' };
        }
      }
    }
  } catch (e) { log('Instagram btch-downloader fail: ' + e.message); }

  // Engine 3: Native yt-dlp Executable (Fallback with tight timeout)
  try {
    log('Instagram — trying native yt-dlp...');
    var resYt = await runYtDlp([
      '-f', 'b[height<=720][fps<=60][ext=mp4]/b[height<=720][ext=mp4]/b[height<=720]/best[height<=720]/best',
      '-o', outPattern,
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      url
    ], 12000);

    if (fs.existsSync(expectedMp4)) {
      var stYt = fs.statSync(expectedMp4);
      if (stYt.size > 3000) {
        log('Instagram — yt-dlp success (' + (stYt.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: expectedMp4, title: 'Instagram Media', size: stYt.size, author: 'Instagram' };
      }
    }

    var files = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('instagram_' + ts); });
    if (files.length > 0) {
      var fp0 = path.join(tempDir, files[0]);
      var st1 = fs.statSync(fp0);
      if (st1.size > 3000) {
        log('Instagram — yt-dlp file success (' + (st1.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp0, title: 'Instagram Media', size: st1.size, author: 'Instagram' };
      }
    }
  } catch (e) { log('Instagram yt-dlp fail: ' + e.message); }

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
  var artistName = '';

  // ── STEP 1: Fetch Spotify OEmbed metadata FIRST so every engine knows the real title + artist ──
  try {
    log('Spotify — fetching track metadata via Spotify OEmbed...');
    var metaR = await axios.get('https://open.spotify.com/oembed?url=' + encodeURIComponent(cleanUrl), { timeout: 6000 });
    if (metaR.data) {
      if (metaR.data.title) trackTitle = metaR.data.title;
      if (metaR.data.author_name) artistName = metaR.data.author_name;
    }
    log('Spotify — metadata: "' + trackTitle + '"' + (artistName ? ' by ' + artistName : ''));
  } catch (e) { log('Spotify OEmbed metadata note: ' + e.message); }

  // ── Engine 1: btch-downloader direct 320kbps Spotify API (with 4s timeout to prevent hanging) ──
  try {
    log('Spotify — trying btch-downloader with timeout...');
    var { spotify: btchSpotify } = require('btch-downloader');
    var btchPromise = btchSpotify(cleanUrl);
    var timeoutPromise = new Promise(function(_, reject) { setTimeout(function() { reject(new Error('timeout')); }, 4000); });
    var spRes = await Promise.race([btchPromise, timeoutPromise]);
    if (spRes && spRes.status && spRes.result && spRes.result.formats && spRes.result.formats.length > 0) {
      var directMp3 = spRes.result.formats[0].url;
      var titleSp = trackTitle !== 'Spotify Track' ? trackTitle : (spRes.result.title || trackTitle);
      var stBtch = await downloadStream(directMp3, fp);
      if (stBtch.size > 10000) {
        log('Spotify — btch-downloader success (' + (stBtch.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: titleSp, author: artistName || 'Spotify', size: stBtch.size };
      }
    }
  } catch (e) { log('Spotify btch-downloader note: ' + e.message); }

  // ── Engine 2: SoundCloud Search & Download with yt-dlp + ffmpeg (High-speed 320kbps MP3) ──
  try {
    var scQuery = artistName ? (artistName + ' ' + trackTitle) : trackTitle;
    log('Spotify — searching SoundCloud: "' + scQuery + '"...');
    var scOutPattern = path.join(tempDir, 'spotify_sc_' + ts + '.%(ext)s');
    var expectedScMp3 = path.join(tempDir, 'spotify_sc_' + ts + '.mp3');
    var scRes = await runYtDlp([
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-playlist',
      '--no-warnings',
      '-o', scOutPattern,
      'scsearch1:' + scQuery
    ], 25000);

    var targetScFp = fs.existsSync(expectedScMp3) ? expectedScMp3 : null;
    if (!targetScFp) {
      var scFiles = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('spotify_sc_' + ts); });
      if (scFiles.length > 0) targetScFp = path.join(tempDir, scFiles[0]);
    }

    if (targetScFp && fs.existsSync(targetScFp)) {
      var stSc = fs.statSync(targetScFp);
      if (stSc.size > 10000) {
        log('Spotify — SoundCloud match success (' + (stSc.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: targetScFp, title: trackTitle, author: artistName || 'Artist', size: stSc.size };
      }
    }
  } catch (e) { log('Spotify SoundCloud search fail: ' + e.message); }

  // ── Engine 3: YouTube Search & Download (fallback) ──
  try {
    var ytQuery = artistName ? (artistName + ' ' + trackTitle + ' official audio') : (trackTitle + ' audio');
    log('Spotify — searching YouTube: "' + ytQuery + '"...');
    var searchRes = await searchYouTubeAndDownloadAudio(ytQuery);
    if (searchRes.success && searchRes.filePath && fs.existsSync(searchRes.filePath)) {
      var spFp = path.join(tempDir, 'spotify_yt_' + ts + '.mp3');
      fs.renameSync(searchRes.filePath, spFp);
      var stSp = fs.statSync(spFp);
      log('Spotify — YouTube match success (' + (stSp.size / 1024).toFixed(0) + 'KB)');
      return { success: true, filePath: spFp, title: trackTitle, author: artistName || 'Artist', size: stSp.size };
    }
  } catch (e) { log('Spotify YouTube search fail: ' + e.message); }

  // ── Engine 4: Cobalt direct Spotify request ──
  try {
    log('Spotify — trying Cobalt directly...');
    var cobalt = await cobaltRequest(cleanUrl, true);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 10000) {
        log('Spotify — Cobalt success (' + (stC.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp, title: trackTitle, author: artistName || 'Spotify', size: stC.size };
      }
    }
  } catch (e) { log('Spotify Cobalt fail: ' + e.message); }

  safeUnlink(fp);
  return { error: 'Spotify track download failed. Please verify the link or try searching with `!music play ' + trackTitle.replace(/['"]/g, '') + '`' };
}

// ─── TWITTER/X ────────────────────────────────────────────────────────────────

async function downloadTwitterVideo(url) {
  var tempDir = ensureTempDir();
  var ts = Date.now();
  var fp = path.join(tempDir, 'twitter_' + ts + '.mp4');

  // Normalize x.com to twitter.com for maximum extractor compatibility
  var normalizedUrl = (url || '').trim().replace(/https?:\/\/(www\.)?x\.com/i, 'https://twitter.com');
  var tweetIdMatch = normalizedUrl.match(/status(?:es)?\/(\d+)/i);
  var tweetId = tweetIdMatch ? tweetIdMatch[1] : null;

  // Engine 1: VxTwitter JSON API (Fastest direct extractor, no rate limits, 500ms delivery)
  if (tweetId) {
    try {
      log('Twitter/X — trying VxTwitter API for id ' + tweetId + '...');
      var vxRes = await axios.get('https://api.vxtwitter.com/i/status/' + tweetId, {
        headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' },
        timeout: 7000
      });
      var vxData = vxRes.data;
      if (vxData && vxData.hasMedia && Array.isArray(vxData.mediaURLs) && vxData.mediaURLs.length > 0) {
        var tweetTitle = (vxData.text || 'Twitter/X Media').replace(/https?:\/\/\S+/g, '').trim().substring(0, 80) || 'Twitter/X Media';
        var vidExt = (vxData.media_extended || []).find(function(m) { return m.type === 'video' || m.type === 'gif'; });
        var vidUrl = vidExt ? vidExt.url : vxData.mediaURLs.find(function(u) { return u.includes('.mp4'); });
        
        if (vidUrl) {
          var stVx = await downloadStream(vidUrl, fp);
          if (stVx.size > 3000) {
            log('Twitter/X — VxTwitter video success (' + (stVx.size / 1024 / 1024).toFixed(1) + 'MB)');
            return { success: true, filePath: fp, title: tweetTitle, size: stVx.size, author: vxData.user_name || 'Twitter', quality: 'HD' };
          }
        } else {
          var imgUrl = vxData.mediaURLs[0];
          var imgExt = imgUrl.split('.').pop().split('?')[0] || 'jpg';
          var fpImg = path.join(tempDir, 'twitter_' + ts + '.' + imgExt);
          var stImg = await downloadStream(imgUrl, fpImg);
          if (stImg.size > 2000) {
            log('Twitter/X — VxTwitter photo success (' + (stImg.size / 1024).toFixed(0) + 'KB)');
            return { success: true, filePath: fpImg, title: tweetTitle, type: 'image', size: stImg.size, author: vxData.user_name || 'Twitter' };
          }
        }
      }
    } catch (eVx) { log('Twitter/X VxTwitter fail: ' + eVx.message); }

    // Engine 2: FxTwitter JSON API fallback
    try {
      log('Twitter/X — trying FxTwitter API for id ' + tweetId + '...');
      var fxRes = await axios.get('https://api.fxtwitter.com/i/status/' + tweetId, {
        headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' },
        timeout: 7000
      });
      var tweetObj = fxRes.data && fxRes.data.tweet;
      if (tweetObj && tweetObj.media) {
        var fxTitle = (tweetObj.text || 'Twitter/X Media').replace(/https?:\/\/\S+/g, '').trim().substring(0, 80) || 'Twitter/X Media';
        if (tweetObj.media.videos && tweetObj.media.videos.length > 0) {
          var fxVidUrl = tweetObj.media.videos[0].url;
          var stFx = await downloadStream(fxVidUrl, fp);
          if (stFx.size > 3000) {
            log('Twitter/X — FxTwitter video success (' + (stFx.size / 1024 / 1024).toFixed(1) + 'MB)');
            return { success: true, filePath: fp, title: fxTitle, size: stFx.size, author: tweetObj.author?.name || 'Twitter', quality: 'HD' };
          }
        } else if (tweetObj.media.photos && tweetObj.media.photos.length > 0) {
          var fxPhotoUrl = tweetObj.media.photos[0].url;
          var fpFxImg = path.join(tempDir, 'twitter_' + ts + '.jpg');
          var stFxImg = await downloadStream(fxPhotoUrl, fpFxImg);
          if (stFxImg.size > 2000) {
            log('Twitter/X — FxTwitter photo success (' + (stFxImg.size / 1024).toFixed(0) + 'KB)');
            return { success: true, filePath: fpFxImg, title: fxTitle, type: 'image', size: stFxImg.size, author: tweetObj.author?.name || 'Twitter' };
          }
        }
      }
    } catch (eFx) { log('Twitter/X FxTwitter fail: ' + eFx.message); }
  }

  // Engine 3: btch-downloader Twitter API (High Speed, 1-2s delivery)
  try {
    log('Twitter/X — trying btch-downloader...');
    var { twitter: btchTwit } = require('btch-downloader');
    var twRes = await btchTwit(normalizedUrl);
    if (twRes && (twRes.url || (Array.isArray(twRes) && twRes.length > 0))) {
      var directTwUrl = Array.isArray(twRes) ? twRes[0].url || twRes[0] : (twRes.url.hd || twRes.url.sd || twRes.url);
      if (typeof directTwUrl === 'string') {
        var stTw = await downloadStream(directTwUrl, fp);
        if (stTw.size > 3000) {
          log('Twitter/X — btch-downloader success (' + (stTw.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fp, title: twRes.title || 'Twitter/X Video', size: stTw.size, author: 'Twitter', quality: 'HD' };
        }
      }
    }
  } catch (e) { log('Twitter/X btch-downloader fail: ' + e.message); }

  // Engine 4: twitsave.com (Fast direct scraper)
  try {
    log('Twitter — trying twitsave...');
    var r2 = await axios.get('https://twitsave.com/info?url=' + encodeURIComponent(normalizedUrl), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 8000
    });
    var $ = require('cheerio').load(r2.data || '');
    var dlLink = $('a[href*=".mp4"]').first().attr('href');
    if (dlLink) {
      var st2 = await downloadStream(dlLink, fp);
      if (st2.size > 5000) {
        log('Twitter/X — twitsave success (' + (st2.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: 'Twitter/X Video', size: st2.size, author: 'Twitter', quality: 'HD' };
      }
    }
  } catch (e) { log('Twitter twitsave fail: ' + e.message); }

  // Engine 5: Native yt-dlp Executable (Reliable fallback with tight timeout)
  try {
    log('Twitter/X — trying native yt-dlp...');
    var outPatternTw = path.join(tempDir, 'twitter_' + ts + '.%(ext)s');
    var expectedMp4Tw = path.join(tempDir, 'twitter_' + ts + '.mp4');
    var resYtTw = await runYtDlp([
      '-f', 'b[height<=720][fps<=60][ext=mp4]/b[height<=720][ext=mp4]/b[height<=720]/best[height<=720]/best',
      '-o', outPatternTw,
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      normalizedUrl
    ], 15000);

    if (fs.existsSync(expectedMp4Tw)) {
      var stYtTw = fs.statSync(expectedMp4Tw);
      if (stYtTw.size > 3000) {
        log('Twitter/X — yt-dlp success (' + (stYtTw.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: expectedMp4Tw, title: 'Twitter/X Video', size: stYtTw.size, author: 'Twitter', quality: 'HD' };
      }
    }

    var filesTw = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('twitter_' + ts); });
    if (filesTw.length > 0) {
      var fpTw0 = path.join(tempDir, filesTw[0]);
      var stTw1 = fs.statSync(fpTw0);
      if (stTw1.size > 3000) {
        log('Twitter/X — yt-dlp file success (' + (stTw1.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fpTw0, title: 'Twitter/X Video', size: stTw1.size, author: 'Twitter', quality: 'HD' };
      }
    }
  } catch (e) { log('Twitter/X yt-dlp fail: ' + e.message); }

  // Engine 6: Cobalt
  try {
    log('Twitter — trying Cobalt...');
    var cobalt = await cobaltRequest(normalizedUrl, false);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 5000) {
        return { success: true, filePath: fp, title: 'Twitter/X Video', size: stC.size, author: 'Twitter', quality: 'HD' };
      }
    }
  } catch (e) { log('Twitter Cobalt fail: ' + e.message); }

  // Engine 7: Twitter Photos / Image fallback (if tweet has pictures instead of video)
  try {
    log('Twitter/X — checking for tweet photos...');
    await runYtDlp([
      '--write-thumbnail',
      '--skip-download',
      '-o', path.join(tempDir, 'twitter_photo_' + ts + '.%(ext)s'),
      normalizedUrl
    ], 20000);
    var photoFiles = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('twitter_photo_' + ts); });
    if (photoFiles.length > 0) {
      var photoFp = path.join(tempDir, photoFiles[0]);
      var stP = fs.statSync(photoFp);
      if (stP.size > 2000) {
        log('Twitter/X — photo thumbnail success (' + (stP.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: photoFp, title: 'Twitter/X Photo', type: 'image', size: stP.size, author: 'Twitter' };
      }
    }
  } catch (ePhoto) {}

  safeUnlink(fp);
  return { error: 'Twitter/X download failed. Ensure the tweet contains public video or photos.' };
}

// ─── FACEBOOK ─────────────────────────────────────────────────────────────────

async function downloadFacebookVideo(url) {
  var tempDir = ensureTempDir();
  var ts = Date.now();
  var fp = path.join(tempDir, 'facebook_' + ts + '.mp4');
  var outPatternFb = path.join(tempDir, 'facebook_' + ts + '.%(ext)s');
  var expectedMp4Fb = path.join(tempDir, 'facebook_' + ts + '.mp4');

  // Engine 1: Native yt-dlp Executable (HD, reliable)
  try {
    log('Facebook — trying native yt-dlp...');
    var resYtFb = await runYtDlp([
      '-f', 'b[height<=720][fps<=60][ext=mp4]/b[height<=720][ext=mp4]/b[height<=720]/best[height<=720]/best',
      '-o', outPatternFb,
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      url
    ], 35000);

    if (fs.existsSync(expectedMp4Fb)) {
      var stYtFb = fs.statSync(expectedMp4Fb);
      if (stYtFb.size > 5000) {
        log('Facebook — yt-dlp success (' + (stYtFb.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: expectedMp4Fb, title: 'Facebook Video', size: stYtFb.size, author: 'Facebook' };
      }
    }

    var filesFb = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('facebook_' + ts); });
    if (filesFb.length > 0) {
      var fpFb0 = path.join(tempDir, filesFb[0]);
      var stFb1 = fs.statSync(fpFb0);
      if (stFb1.size > 5000) {
        log('Facebook — yt-dlp file success (' + (stFb1.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fpFb0, title: 'Facebook Video', size: stFb1.size, author: 'Facebook' };
      }
    }
  } catch (e) { log('Facebook yt-dlp fail: ' + e.message); }

  // Engine 2: btch-downloader Facebook API
  try {
    log('Facebook — trying btch-downloader...');
    var { fbdown: btchFb } = require('btch-downloader');
    var fbRes = await btchFb(url);
    if (fbRes && (fbRes.HD || fbRes.SD || fbRes.normal || (Array.isArray(fbRes) && fbRes.length > 0))) {
      var directFbUrl = fbRes.HD || fbRes.SD || fbRes.normal || (Array.isArray(fbRes) ? fbRes[0].url || fbRes[0] : null);
      if (typeof directFbUrl === 'string' && directFbUrl.startsWith('http')) {
        var stBtchFb = await downloadStream(directFbUrl, fp);
        if (stBtchFb.size > 5000) {
          log('Facebook — btch-downloader success (' + (stBtchFb.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: fp, title: 'Facebook Video', size: stBtchFb.size, author: 'Facebook' };
        }
      }
    }
  } catch (e) { log('Facebook btch-downloader fail: ' + e.message); }

  // Engine 3: Cobalt API
  try {
    log('Facebook — trying Cobalt...');
    var cobalt = await cobaltRequest(url, false);
    if (cobalt.success && cobalt.url) {
      var stC = await downloadStream(cobalt.url, fp);
      if (stC.size > 10000) {
        log('Facebook — Cobalt success (' + (stC.size / 1024 / 1024).toFixed(1) + 'MB)');
        return { success: true, filePath: fp, title: 'Facebook Video', size: stC.size, author: 'Facebook' };
      }
    }
  } catch (e) { log('Facebook Cobalt fail: ' + e.message); }

  safeUnlink(fp);
  safeUnlink(expectedMp4Fb);
  return { error: 'Facebook video download failed. Make sure the post or reel is public.' };
}

// ─── PINTEREST ────────────────────────────────────────────────────────────────

async function downloadPinterestMedia(url) {
  var tempDir = ensureTempDir();
  var ts = Date.now();
  var finalUrl = (url || '').trim();

  // Resolve shortened pin.it URLs
  if (finalUrl.includes('pin.it')) {
    try {
      var rHead = await axios.get(finalUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        maxRedirects: 5,
        timeout: 10000
      });
      finalUrl = rHead.request?.res?.responseUrl || rHead.config?.url || finalUrl;
    } catch (e) {}
  }

  // Engine 1: Native yt-dlp (handles Pinterest video and photo pins)
  try {
    log('Pinterest — trying yt-dlp...');
    var outPattern = path.join(tempDir, 'pinterest_' + ts + '.%(ext)s');
    await runYtDlp([
      '-o', outPattern,
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      finalUrl
    ], 35000);

    var pinFiles = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('pinterest_' + ts); });
    if (pinFiles.length > 0) {
      var fp0 = path.join(tempDir, pinFiles[0]);
      var st0 = fs.statSync(fp0);
      if (st0.size > 2000) {
        var ext0 = fp0.split('.').pop().toLowerCase();
        var isImg0 = ['jpg', 'jpeg', 'png', 'webp'].includes(ext0);
        if (!isImg0 && ['mp4', 'webm', 'mov'].includes(ext0)) {
          var optFp = await optimizeVideoForWhatsApp(fp0);
          var sendFp = fs.existsSync(optFp) ? optFp : fp0;
          return { success: true, filePath: sendFp, title: 'Pinterest Video', type: 'video', size: fs.statSync(sendFp).size, author: 'Pinterest' };
        }
        return { success: true, filePath: fp0, title: 'Pinterest Image', type: 'image', size: st0.size, author: 'Pinterest' };
      }
    }
  } catch (e) { log('Pinterest yt-dlp fail: ' + e.message); }

  // Engine 2: Cheerio scrape for og:video and high-res og:image
  try {
    log('Pinterest — trying HTML scrape...');
    var pageResp = await axios.get(finalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 12000,
      maxRedirects: 5
    });

    var cheerio = require('cheerio');
    var $ = cheerio.load(pageResp.data || '');
    var ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content') || $('video source').attr('src');
    var ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content');
    var ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || 'Pinterest Media';

    if (ogVideo && ogVideo.startsWith('http')) {
      var fpV = path.join(tempDir, 'pinterest_vid_' + ts + '.mp4');
      var stV = await downloadStream(ogVideo, fpV);
      if (stV.size > 2000) {
        var optV = await optimizeVideoForWhatsApp(fpV);
        var finalV = fs.existsSync(optV) ? optV : fpV;
        return { success: true, filePath: finalV, title: ogTitle, type: 'video', size: fs.statSync(finalV).size, author: 'Pinterest' };
      }
    }

    if (ogImage && ogImage.startsWith('http')) {
      var highResImg = ogImage.replace(/\/(236x|474x|736x)\//, '/originals/');
      var fpI = path.join(tempDir, 'pinterest_img_' + ts + '.jpg');
      try {
        var stI = await downloadStream(highResImg, fpI);
        if (stI.size > 2000) {
          return { success: true, filePath: fpI, title: ogTitle, type: 'image', size: stI.size, author: 'Pinterest' };
        }
      } catch (eUp) {
        var stI2 = await downloadStream(ogImage, fpI);
        if (stI2.size > 2000) {
          return { success: true, filePath: fpI, title: ogTitle, type: 'image', size: stI2.size, author: 'Pinterest' };
        }
      }
    }
  } catch (e) { log('Pinterest scrape fail: ' + e.message); }

  // Engine 3: btch-downloader Pinterest API
  try {
    log('Pinterest — trying btch-downloader...');
    var { pinterest: btchPin } = require('btch-downloader');
    if (btchPin) {
      var pinRes = await btchPin(finalUrl);
      var mediaUrl = null;
      if (pinRes && pinRes.result) {
        if (typeof pinRes.result === 'string') mediaUrl = pinRes.result;
        else if (pinRes.result.url) mediaUrl = pinRes.result.url;
        else if (Array.isArray(pinRes.result) && pinRes.result.length > 0) {
          mediaUrl = pinRes.result[0]?.url || pinRes.result[0];
        }
      }
      if (mediaUrl && typeof mediaUrl === 'string' && mediaUrl.startsWith('http')) {
        var isVid = mediaUrl.includes('.mp4');
        var fpB = path.join(tempDir, 'pinterest_btch_' + ts + (isVid ? '.mp4' : '.jpg'));
        var stB = await downloadStream(mediaUrl, fpB);
        if (stB.size > 2000) {
          return { success: true, filePath: fpB, title: 'Pinterest Media', type: isVid ? 'video' : 'image', size: stB.size, author: 'Pinterest' };
        }
      }
    }
  } catch (e) { log('Pinterest btch fail: ' + e.message); }

  return { error: 'Pinterest download failed. Ensure the pin is public and accessible.' };
}

// ─── DIRECT DOWNLOAD ──────────────────────────────────────────────────────────

async function downloadDirectMedia(url) {
  var tempDir = ensureTempDir();
  var parsedPath = url.split('?')[0];
  var ext = path.extname(parsedPath) || '.mp4';
  var fp = path.join(tempDir, 'direct_' + Date.now() + ext);
  try {
    var st = await downloadStream(url, fp);
    if (st && st.size > 1000) {
      return { success: true, filePath: fp, title: path.basename(parsedPath) || 'Direct Media', size: st.size };
    }
  } catch (e) {
    safeUnlink(fp);
    return { error: 'Direct download failed: ' + e.message };
  }
  safeUnlink(fp);
  return { error: 'Direct download failed.' };
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

async function processLink(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return { platform: 'youtube', title: 'YouTube Video', url: url };
    case 'tiktok': { var ti = await downloadTikTokVideo(url); return ti.success ? { platform: 'tiktok', title: ti.title, downloadUrl: null } : ti; }
    case 'instagram': { var ii = await downloadInstagramMedia(url); return ii.success ? { platform: 'instagram', title: ii.title } : ii; }
    case 'facebook': { var fi = await downloadFacebookVideo(url); return fi.success ? { platform: 'facebook', title: fi.title } : fi; }
    case 'spotify': return { platform: 'spotify', title: 'Spotify Track', url: url };
    case 'twitter': { var tw = await downloadTwitterVideo(url); return tw.success ? { platform: 'twitter', title: tw.title } : tw; }
    case 'pinterest': return { platform: 'pinterest', title: 'Pinterest Media', url: url };
    case 'direct': return { platform: 'direct', title: path.basename(url.split('?')[0]) || 'Direct Media', downloadUrl: url };
    default: return { error: 'Unsupported platform: ' + platform };
  }
}

async function downloadMedia(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return await getYouTubeVideo(url);
    case 'tiktok': return await downloadTikTokVideo(url);
    case 'instagram': return await downloadInstagramMedia(url);
    case 'facebook': return await downloadFacebookVideo(url);
    case 'twitter': return await downloadTwitterVideo(url);
    case 'pinterest': return await downloadPinterestMedia(url);
    case 'direct': return await downloadDirectMedia(url);
    default: return { error: 'No video download available for: ' + platform };
  }
}

async function downloadAudio(url) {
  var platform = detectPlatform(url);
  switch (platform) {
    case 'youtube': return await getYouTubeAudio(url);
    case 'spotify': return await downloadSpotifyAudio(url);
    case 'tiktok': return await downloadTikTokVideo(url);
    case 'pinterest': return await downloadPinterestMedia(url);
    case 'direct': return await downloadDirectMedia(url);
    default: return { error: 'Audio download not supported for: ' + platform };
  }
}

// ─── YouTube / Music search helper for music command ──────────────────────────

async function searchYouTubeAndDownloadAudio(query) {
  var tempDir = ensureTempDir();
  var ts = Date.now();

  log('Audio Search — search query: "' + query + '"...');

  // Engine 1: SoundCloud Search (Fastest, zero 403s, clean 320kbps MP3)
  if (!query.startsWith('http')) {
    try {
      log('Audio Search — trying SoundCloud for "' + query + '"...');
      var scPattern = path.join(tempDir, 'audio_sc_' + ts + '.%(ext)s');
      var expectedSc = path.join(tempDir, 'audio_sc_' + ts + '.mp3');
      var scRes = await runYtDlp([
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', scPattern,
        '--no-playlist',
        '--no-warnings',
        'scsearch1:' + query
      ], 25000);

      var scFp = fs.existsSync(expectedSc) ? expectedSc : null;
      if (!scFp) {
        var scFiles = fs.readdirSync(tempDir).filter(function(f) { return f.startsWith('audio_sc_' + ts); });
        if (scFiles.length > 0) scFp = path.join(tempDir, scFiles[0]);
      }

      if (scFp && fs.existsSync(scFp)) {
        var scStat = fs.statSync(scFp);
        if (scStat.size > 10000) {
          log('Audio Search — SoundCloud success (' + (scStat.size / 1024 / 1024).toFixed(1) + 'MB)');
          return { success: true, filePath: scFp, title: query, size: scStat.size };
        }
      }
    } catch (eSc) { log('Audio Search SoundCloud fail: ' + eSc.message); }
  }

  var outPattern = path.join(tempDir, 'yt_search_' + ts + '.%(ext)s');
  var searchQuery = query.startsWith('http') ? query : ('ytsearch1:' + query);

  // Engine 2: yt-dlp search (25s tight timeout)
  try {
    var res = await runYtDlp([
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outPattern,
      '--no-playlist',
      '--no-warnings',
      searchQuery
    ], 25000);

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
        log('Audio Search — yt-dlp success (' + (st0.size / 1024).toFixed(0) + 'KB)');
        return { success: true, filePath: fp0, title: title, size: st0.size };
      }
    }
  } catch (e) { log('Audio Search yt-dlp fail: ' + e.message); }

  // Engine 3: ytSearch + getYouTubeAudio
  if (ytSearch) {
    try {
      var results = await ytSearch({ query: query, pageStart: 1, pageEnd: 2 });
      var video = results.videos && results.videos[0];
      if (!video) return { error: 'No results found for: ' + query };
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
  downloadPinterestMedia,
  downloadFacebookVideo,
  searchYouTubeAndDownloadAudio,
  processLink,
  downloadMedia,
  downloadAudio,
  downloadDirectMedia,
  // legacy compat
  getYouTubeInfo: async function(url) {
    if (ytdl) { try { return await ytdl.getInfo(url); } catch (e) {} }
    return { title: 'YouTube Media', videoDetails: { title: 'YouTube Media' } };
  },
  scrapeTikTok: async function(url) { return await downloadTikTokVideo(url); },
  scrapeInstagram: async function(url) { return await downloadInstagramMedia(url); },
};
