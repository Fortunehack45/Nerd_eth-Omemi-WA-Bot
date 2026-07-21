/**
 * !apk — APK Search & Download Command
 *
 * APIs used (all public, no key required):
 *  1. Aptoide API       — https://ws75.aptoide.com/api/7/ (best, returns direct APK URLs)
 *  2. APKPure API       — https://apkpure.com/search.html (search + download link extraction)
 *  3. F-Droid API       — https://f-droid.org/api/v1/ (open-source apps, 100% free & legal)
 *  4. APKCombo API      — https://apkcombo.com/en/apk-downloader/ (fallback scrape)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parseFlags, formatBytes, paginate } = require('../utils/helpers');

const MAX_SEND_MB = 95; // WhatsApp max file size safety margin
const TEMP_DIR = path.join(__dirname, '..', '..', 'storage', 'temp');

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

function safeUnlink(fp) {
  try { if (fp && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) {}
}

function log(msg) { console.log('[APK] ' + msg); }

function cleanName(n) {
  return (n || 'app').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').substring(0, 80);
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────

// API 1: Aptoide — free, no key, returns real download URLs
async function searchAptoide(query, limit) {
  var url = 'https://ws75.aptoide.com/api/7/apps/search/query=' +
    encodeURIComponent(query) + '/limit=' + (limit || 10);
  var resp = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  var list = resp.data && resp.data.datalist && resp.data.datalist.list;
  if (!list || !list.length) return [];
  return list.map(function(app) {
    return {
      name: app.name || 'Unknown',
      package: app.package || '',
      version: (app.file && app.file.vername) || app.uname || '',
      size: (app.file && app.file.filesize) ? formatBytes(app.file.filesize) : 'Unknown',
      sizeBytes: (app.file && app.file.filesize) || 0,
      rating: app.stats && app.stats.rating ? app.stats.rating.avg.toFixed(1) : 'N/A',
      downloads: app.stats && app.stats.downloads ? formatNum(app.stats.downloads) : 'N/A',
      icon: (app.icon && app.icon.url) || '',
      downloadUrl: (app.file && app.file.path) || '',
      source: 'Aptoide',
      updated: app.added || '',
      category: (app.category && app.category.name) || '',
    };
  });
}

// API 2: F-Droid — open-source apps, always reliable
async function searchFdroid(query, limit) {
  var resp = await axios.get('https://search.f-droid.org/?q=' + encodeURIComponent(query) + '&lang=en', {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  var $ = require('cheerio').load(resp.data || '');
  var results = [];
  $('li.package').each(function(i, el) {
    if (i >= (limit || 10)) return false;
    var name = $(el).find('a.package-header').text().trim();
    var pkg = $(el).find('a.package-header').attr('href');
    if (pkg) pkg = pkg.replace('/en/packages/', '').replace(/\/$/, '');
    var desc = $(el).find('p.package-summary').text().trim();
    if (name && pkg) {
      results.push({
        name: name,
        package: pkg,
        version: '',
        size: 'Unknown',
        sizeBytes: 0,
        rating: 'N/A',
        downloads: 'N/A',
        icon: '',
        downloadUrl: 'https://f-droid.org/repo/' + pkg + '.apk',
        source: 'F-Droid (Open Source)',
        description: desc,
        category: 'Open Source',
      });
    }
  });
  return results;
}

// API 3: APKPure — search via their suggestion API
async function searchApkPure(query, limit) {
  try {
    var resp = await axios.get('https://apkpure.com/search.html?q=' + encodeURIComponent(query), {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    var $ = require('cheerio').load(resp.data || '');
    var results = [];
    $('div.apk-list-item').each(function(i, el) {
      if (i >= (limit || 10)) return false;
      var name = $(el).find('p.p1').text().trim() || $(el).find('.apk-name').text().trim();
      var pkg = $(el).find('a').first().attr('href');
      if (pkg) { var pkgMatch = pkg.match(/\/([a-zA-Z0-9._]+)$/); pkg = pkgMatch ? pkgMatch[1] : pkg; }
      var version = $(el).find('p.p2').first().text().replace('Version:', '').trim();
      var size = $(el).find('p.p2').eq(1).text().replace('Size:', '').trim();
      if (name) {
        results.push({
          name: name,
          package: pkg || '',
          version: version || '',
          size: size || 'Unknown',
          sizeBytes: 0,
          rating: 'N/A',
          downloads: 'N/A',
          icon: $(el).find('img').first().attr('src') || '',
          downloadUrl: '',
          source: 'APKPure',
          category: '',
        });
      }
    });
    return results;
  } catch (e) { return []; }
}

async function searchAPK(query, limit) {
  limit = limit || 8;
  // Try all sources in parallel, merge results
  var results = [];
  var [aptoideRes, fdroidRes] = await Promise.allSettled([
    searchAptoide(query, limit),
    searchFdroid(query, Math.min(limit, 5)),
  ]);

  if (aptoideRes.status === 'fulfilled' && aptoideRes.value.length) {
    results = results.concat(aptoideRes.value);
  }
  if (fdroidRes.status === 'fulfilled' && fdroidRes.value.length) {
    // Append F-Droid results that aren't already in Aptoide
    fdroidRes.value.forEach(function(fr) {
      if (!results.find(function(r) { return r.package === fr.package; })) {
        results.push(fr);
      }
    });
  }

  if (!results.length) {
    var apkpureRes = await searchApkPure(query, limit).catch(function() { return []; });
    results = apkpureRes;
  }

  return results.slice(0, limit);
}

// ─── GET APK INFO ─────────────────────────────────────────────────────────────

async function getApkInfo(packageOrQuery) {
  // Try Aptoide
  try {
    var resp = await axios.get('https://ws75.aptoide.com/api/7/app/get/package_name=' +
      encodeURIComponent(packageOrQuery), {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    var app = resp.data && resp.data.data && resp.data.data.nodes && resp.data.data.nodes.meta && resp.data.data.nodes.meta.data;
    if (app && app.name) {
      return {
        name: app.name,
        package: app.package,
        version: (app.file && app.file.vername) || '',
        size: (app.file && app.file.filesize) ? formatBytes(app.file.filesize) : 'Unknown',
        sizeBytes: (app.file && app.file.filesize) || 0,
        rating: app.stats && app.stats.rating ? app.stats.rating.avg.toFixed(1) : 'N/A',
        downloads: app.stats && app.stats.downloads ? formatNum(app.stats.downloads) : 'N/A',
        downloadUrl: (app.file && app.file.path) || '',
        source: 'Aptoide',
        category: (app.category && app.category.name) || '',
        updated: app.updated || app.added || '',
        description: (app.media && app.media.description) || '',
      };
    }
  } catch (e) {}

  // Try F-Droid
  try {
    var fdResp = await axios.get('https://f-droid.org/api/v1/packages/' + packageOrQuery, {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (fdResp.data && fdResp.data.packageName) {
      var pkg = fdResp.data;
      var latest = pkg.packages && pkg.packages[0];
      return {
        name: pkg.metadata && pkg.metadata.name || pkg.packageName,
        package: pkg.packageName,
        version: latest && latest.versionName || '',
        size: latest && latest.size ? formatBytes(latest.size) : 'Unknown',
        sizeBytes: (latest && latest.size) || 0,
        downloadUrl: latest ? 'https://f-droid.org/repo/' + pkg.packageName + '_' + latest.versionCode + '.apk' : '',
        source: 'F-Droid (Open Source)',
        category: 'Open Source',
        updated: latest && latest.added ? new Date(latest.added).toLocaleDateString() : '',
        description: pkg.metadata && pkg.metadata.summary || '',
      };
    }
  } catch (e) {}

  return null;
}

// ─── DOWNLOAD APK ─────────────────────────────────────────────────────────────

async function downloadApkFromUrl(downloadUrl, appName) {
  ensureTemp();
  var fp = path.join(TEMP_DIR, 'apk_' + Date.now() + '_' + cleanName(appName) + '.apk');

  log('Downloading APK: ' + downloadUrl.substring(0, 80));

  var resp = await axios({
    method: 'GET',
    url: downloadUrl,
    responseType: 'stream',
    timeout: 300000, // 5 min for large APKs
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'application/vnd.android.package-archive, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://aptoide.com/',
    },
    maxRedirects: 15,
  });

  return new Promise(function(resolve, reject) {
    var writer = fs.createWriteStream(fp);
    resp.data.pipe(writer);
    writer.on('finish', function() {
      try {
        var stat = fs.statSync(fp);
        resolve({ filePath: fp, size: stat.size });
      } catch (e) { reject(e); }
    });
    writer.on('error', reject);
    resp.data.on('error', reject);
  });
}

// Try to get a direct download URL for a package via multiple APIs
async function resolveDownloadUrl(packageName) {
  // Try Aptoide direct
  try {
    var resp = await axios.get('https://ws75.aptoide.com/api/7/app/get/package_name=' + encodeURIComponent(packageName), {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    var app = resp.data && resp.data.data && resp.data.data.nodes && resp.data.data.nodes.meta && resp.data.data.nodes.meta.data;
    if (app && app.file && app.file.path) {
      return { url: app.file.path, size: app.file.filesize || 0, version: app.file.vername || '', name: app.name || packageName };
    }
  } catch (e) {}

  // Try F-Droid
  try {
    var fdResp = await axios.get('https://f-droid.org/api/v1/packages/' + packageName, { timeout: 10000 });
    if (fdResp.data && fdResp.data.packages && fdResp.data.packages[0]) {
      var latest = fdResp.data.packages[0];
      var dlUrl = 'https://f-droid.org/repo/' + packageName + '_' + latest.versionCode + '.apk';
      return { url: dlUrl, size: latest.size || 0, version: latest.versionName || '', name: fdResp.data.metadata?.name || packageName };
    }
  } catch (e) {}

  return null;
}

function formatNum(n) {
  if (!n) return 'N/A';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

// ─── HELP TEXT ────────────────────────────────────────────────────────────────

var HELP = [
  '*📦 APK Downloader*',
  '',
  'Search and download Android APK files directly to WhatsApp.',
  'Uses Aptoide, F-Droid, and APKPure APIs — no key required.',
  '',
  '*Usage:*',
  '  `!apk <app name>`              — Search + download top result',
  '  `!apk search <query>`          — Search only, list results',
  '  `!apk get <app name>`          — Search + download top result',
  '  `!apk download <package>`      — Download by exact package name',
  '  `!apk info <package name>`     — Get detailed app info',
  '',
  '*Flags:*',
  '  `--limit, -l <N>`   Number of search results (default: 8, max: 15)',
  '  `--source <name>`   Prefer source: aptoide, fdroid (default: auto)',
  '',
  '*Examples:*',
  '  `!apk whatsapp`',
  '  `!apk search telegram`',
  '  `!apk get com.instagram.android`',
  '  `!apk download com.spotify.music`',
  '  `!apk info vlc`',
  '  `!apk search games --limit 10`',
  '',
  '*📌 Note:* APK files over 95MB will be sent as a download link.',
  '*Sources:* Aptoide (millions of apps) · F-Droid (open-source) · APKPure',
].join('\n');

// ─── COMMAND MODULE ───────────────────────────────────────────────────────────

module.exports = {
  name: 'apk',
  alias: ['apkdl', 'getapk', 'androidapp', 'appdownload'],
  description: 'Search and download Android APK files (Aptoide + F-Droid + APKPure)',
  usage: '!apk <app name | package>',
  adminOnly: false, // Public — anyone can use
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h' || args === 'help') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parsed = parseFlags(args);
    var flags = parsed.flags;
    var parts = parsed.positional;
    var sub = parts[0] && parts[0].toLowerCase();
    var restArgs = parts.slice(1);
    var limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 8, 15);

    // ── SEARCH ─────────────────────────────────────────────────────────────
    if (sub === 'search' || sub === 'find' || sub === 'list') {
      var query = restArgs.join(' ');
      if (!query) return sock.sendMessage(sender, { text: '❌ Provide a search query.\n\n*Usage:* `!apk search <app name>`' });

      await sock.sendMessage(sender, { text: '🔍 Searching APKs for *"' + query + '"*...' });
      var results = await searchAPK(query, limit).catch(function(e) { return { error: e.message }; });

      if (!results || results.error) {
        return sock.sendMessage(sender, { text: '❌ Search failed: ' + (results && results.error || 'Unknown error') });
      }
      if (!results.length) {
        return sock.sendMessage(sender, { text: '📭 No APKs found for "' + query + '". Try a different query or package name.' });
      }

      var text = '*📦 APK Results for "' + query + '"*\n' + results.length + ' results found\n\n';
      results.forEach(function(app, i) {
        text += (i + 1) + '. *' + app.name + '*\n';
        if (app.package) text += '   📦 `' + app.package + '`\n';
        if (app.version) text += '   🏷 v' + app.version;
        if (app.size && app.size !== 'Unknown') text += ' | 💾 ' + app.size;
        if (app.rating && app.rating !== 'N/A') text += ' | ⭐ ' + app.rating;
        text += '\n';
        if (app.source) text += '   🌐 ' + app.source + '\n';
        text += '   👉 `!apk get ' + (app.package || app.name) + '`\n\n';
      });
      text += '_Use `!apk get <package>` to download any of the above._';

      var pages = paginate(text, 3800);
      for (var page of pages) {
        await sock.sendMessage(sender, { text: page });
      }
      return;
    }

    // ── INFO ───────────────────────────────────────────────────────────────
    if (sub === 'info' || sub === 'details') {
      var infoQuery = restArgs.join(' ');
      if (!infoQuery) return sock.sendMessage(sender, { text: '❌ Provide an app name or package.\n\n*Usage:* `!apk info <package>`' });

      await sock.sendMessage(sender, { text: '📄 Fetching info for *"' + infoQuery + '"*...' });

      var info = await getApkInfo(infoQuery).catch(function() { return null; });
      if (!info) {
        // Try searching
        var sr = await searchAPK(infoQuery, 1).catch(function() { return []; });
        if (sr && sr.length) info = sr[0];
      }

      if (!info) {
        return sock.sendMessage(sender, { text: '❌ App not found: "' + infoQuery + '"\n\nTry using the exact package name (e.g. `com.whatsapp`).' });
      }

      var infoText = '*📦 App Info*\n\n';
      infoText += '🏷 *Name:* ' + info.name + '\n';
      if (info.package) infoText += '📦 *Package:* `' + info.package + '`\n';
      if (info.version) infoText += '🔢 *Version:* ' + info.version + '\n';
      if (info.size && info.size !== 'Unknown') infoText += '💾 *Size:* ' + info.size + '\n';
      if (info.rating && info.rating !== 'N/A') infoText += '⭐ *Rating:* ' + info.rating + '/5\n';
      if (info.downloads && info.downloads !== 'N/A') infoText += '📥 *Downloads:* ' + info.downloads + '\n';
      if (info.category) infoText += '🏷 *Category:* ' + info.category + '\n';
      if (info.updated) infoText += '📅 *Updated:* ' + info.updated + '\n';
      if (info.source) infoText += '🌐 *Source:* ' + info.source + '\n';
      if (info.description) infoText += '\n📝 *Description:*\n' + info.description.substring(0, 400) + '\n';

      if (info.sizeBytes && info.sizeBytes > MAX_SEND_MB * 1024 * 1024) {
        infoText += '\n⚠️ *Note:* This APK is ' + info.size + ' — too large to send via WhatsApp.\n';
        if (info.downloadUrl) infoText += '🔗 *Direct Link:* ' + info.downloadUrl;
      } else if (info.package) {
        infoText += '\n👉 Download: `!apk download ' + info.package + '`';
      }

      await sock.sendMessage(sender, { text: infoText });
      return;
    }

    // ── DOWNLOAD (explicit package name) ────────────────────────────────────
    if (sub === 'download' || sub === 'dl') {
      var dlPackage = restArgs.join(' ');
      if (!dlPackage) return sock.sendMessage(sender, { text: '❌ Provide a package name.\n\n*Usage:* `!apk download com.whatsapp`' });

      await sock.sendMessage(sender, { text: '🔍 Looking up *"' + dlPackage + '"*...' });
      var resolved = await resolveDownloadUrl(dlPackage).catch(function() { return null; });

      if (!resolved || !resolved.url) {
        return sock.sendMessage(sender, { text: '❌ Could not find APK for package: `' + dlPackage + '`\n\nTry `!apk search ' + dlPackage + '` first.' });
      }

      await doDownloadAndSend(sock, sender, resolved, dlPackage);
      return;
    }

    // ── GET or bare query — search + download top result ────────────────────
    var isBareGet = sub === 'get' || sub === 'install' || sub === 'fetch';
    var searchQuery = isBareGet ? restArgs.join(' ') : parts.join(' ');

    if (!searchQuery) return sock.sendMessage(sender, { text: HELP });

    await sock.sendMessage(sender, { text: '🔍 Searching APK for *"' + searchQuery + '"*...' });

    var searchRes = await searchAPK(searchQuery, 5).catch(function(e) { return []; });
    if (!searchRes || !searchRes.length) {
      return sock.sendMessage(sender, { text: '❌ No APKs found for "' + searchQuery + '".\n\nTip: Try `!apk search ' + searchQuery + '` for broader results.' });
    }

    var topApp = searchRes[0];
    await sock.sendMessage(sender, {
      text: '📦 Found: *' + topApp.name + '*\n' +
        (topApp.package ? '📦 Package: `' + topApp.package + '`\n' : '') +
        (topApp.version ? '🏷 Version: ' + topApp.version + '\n' : '') +
        (topApp.size && topApp.size !== 'Unknown' ? '💾 Size: ' + topApp.size + '\n' : '') +
        '🌐 Source: ' + topApp.source + '\n' +
        '_Preparing download..._'
    });

    // Resolve download URL
    var dlInfo = null;
    if (topApp.downloadUrl) {
      dlInfo = { url: topApp.downloadUrl, size: topApp.sizeBytes || 0, version: topApp.version || '', name: topApp.name };
    } else if (topApp.package) {
      dlInfo = await resolveDownloadUrl(topApp.package).catch(function() { return null; });
      if (dlInfo) dlInfo.name = topApp.name;
    }

    if (!dlInfo || !dlInfo.url) {
      // No direct download, provide info instead
      var fallbackText = '⚠️ Direct download not available for *' + topApp.name + '*.\n\n';
      if (topApp.package) fallbackText += '📦 Package: `' + topApp.package + '`\n';
      if (topApp.source === 'APKPure') {
        fallbackText += '🔗 Download manually: https://apkpure.com/' + (topApp.package || searchQuery) + '\n';
      }
      fallbackText += '\n💡 Try: `!apk download ' + (topApp.package || searchQuery) + '` for a direct download attempt.';
      return sock.sendMessage(sender, { text: fallbackText });
    }

    await doDownloadAndSend(sock, sender, dlInfo, topApp.name || searchQuery);
  },
};

// ─── SHARED DOWNLOAD + SEND LOGIC ─────────────────────────────────────────────

async function doDownloadAndSend(sock, sender, dlInfo, appName) {
  var sizeMB = dlInfo.size ? (dlInfo.size / 1024 / 1024).toFixed(1) : '?';

  // If size is known and over the limit, send direct link instead
  if (dlInfo.size && dlInfo.size > MAX_SEND_MB * 1024 * 1024) {
    return sock.sendMessage(sender, {
      text: '⚠️ *' + (dlInfo.name || appName) + '*\n' +
        '💾 Size: ' + sizeMB + ' MB (too large for WhatsApp)\n\n' +
        '🔗 *Direct Download Link:*\n' + dlInfo.url + '\n\n' +
        '_WhatsApp allows max ~95MB. Copy the link above to download directly._',
    });
  }

  await sock.sendMessage(sender, {
    text: '⬇️ Downloading *' + (dlInfo.name || appName) + '*' +
      (dlInfo.version ? ' v' + dlInfo.version : '') +
      (sizeMB !== '?' ? ' (' + sizeMB + ' MB)' : '') +
      '...\n_This may take a moment, please wait..._',
  });

  var result = null;
  try {
    result = await downloadApkFromUrl(dlInfo.url, dlInfo.name || appName);
  } catch (err) {
    log('Download error: ' + err.message);
    return sock.sendMessage(sender, {
      text: '❌ Download failed: ' + err.message + '\n\n🔗 Try direct link:\n' + dlInfo.url,
    });
  }

  if (!result || !result.filePath || !fs.existsSync(result.filePath)) {
    return sock.sendMessage(sender, {
      text: '❌ Download failed (empty file).\n\n🔗 Direct link:\n' + dlInfo.url,
    });
  }

  var actualSizeMB = (result.size / 1024 / 1024).toFixed(1);

  // Check size again after download (in case we didn't know before)
  if (result.size > MAX_SEND_MB * 1024 * 1024) {
    safeUnlink(result.filePath);
    return sock.sendMessage(sender, {
      text: '⚠️ *' + (dlInfo.name || appName) + '* downloaded but is ' + actualSizeMB + ' MB — too large for WhatsApp.\n\n' +
        '🔗 *Direct Download Link:*\n' + dlInfo.url,
    });
  }

  // Send as document (APK files must be sent as document type)
  try {
    var buffer = fs.readFileSync(result.filePath);
    var fileName = cleanName(dlInfo.name || appName) + (dlInfo.version ? '_v' + dlInfo.version : '') + '.apk';
    var caption = [
      '📦 *' + (dlInfo.name || appName) + '*',
      dlInfo.version ? '🏷 Version: ' + dlInfo.version : '',
      '💾 Size: ' + actualSizeMB + ' MB',
      '📥 Downloaded via Nerd-eth Bot',
    ].filter(Boolean).join('\n');

    await sock.sendMessage(sender, {
      document: buffer,
      mimetype: 'application/vnd.android.package-archive',
      fileName: fileName,
      caption: caption,
    });

    log('APK sent: ' + fileName + ' (' + actualSizeMB + ' MB)');
  } catch (sendErr) {
    log('Send error: ' + sendErr.message);
    await sock.sendMessage(sender, {
      text: '❌ Failed to send APK file: ' + sendErr.message + '\n\n🔗 Direct link:\n' + dlInfo.url,
    });
  } finally {
    safeUnlink(result.filePath);
  }
}
