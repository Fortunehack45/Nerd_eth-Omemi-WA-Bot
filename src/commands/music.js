const { searchMusic, getMusicInfo, getTrendingMusic, searchLyrics, savePlaylist, getPlaylist, removeFromPlaylist, deletePlaylist, formatDuration } = require('../services/mediaService');
const { parseFlags, paginate } = require('../utils/helpers');
var ytSearch = null;
try { ytSearch = require('yt-search'); } catch (e) {}

const HELP = [
  '*🎵 Music Command*',
  '',
  'GitHub-style CLI for music search, playlists, and discovery.',
  '',
  '*Usage:*',
  '  `!music <subcommand> [args] [flags]`',
  '',
  '*Subcommands:*',
  '  `search`       Search for songs, albums, or artists',
  '  `info`         Get detailed info about a track',
  '  `trending`     Show trending/popular music',
  '  `lyrics`       Find lyrics for a song',
  '  `play`         Download and play a track as audio',
  '  `download`     Download audio file directly',
  '  `recommend`    Get music recommendations',
  '  `playlist`     Manage playlists (alias: `pl`)',
  '    `create`     Create a new playlist',
  '    `list`       List all playlists',
  '    `show`       Show playlist contents',
  '    `add`        Add a track to a playlist',
  '    `remove`     Remove a track from a playlist',
  '    `delete`     Delete a playlist',
  '',
  '*Global Flags:*',
  '  `--help`, `-h`   Show help for any subcommand',
  '',
  '*Examples:*',
  '  `!music search afrobeat --limit 5`',
  '  `!music search burna boy --type video --sort views`',
  '  `!music info https://youtu.be/...`',
  '  `!music trending --country NG --limit 10`',
  '  `!music lyrics lovelier --artist guchi`',
  '  `!music recommend --mood happy --genre pop`',
  '  `!music playlist create my-jams --desc "My favorite tracks"`',
  '  `!music playlist add https://youtu.be/... --playlist my-jams`',
].join('\n');

function usg(s, d, f) {
  let t = '*Usage:* `' + s + '`';
  if (d) t += '\n\n' + d;
  if (f) t += '\n\n*Flags:*\n' + f;
  return t;
}

function fl(n, d, s) {
  return '  `--' + n + '`' + (s ? ', `-' + s + '`' : '') + '    ' + d;
}

async function cmdSearch(sock, sender, args, flags) {
  const query = args.join(' ');
  if (!query) {
    return sock.sendMessage(sender, {
      text: usg('!music search <query> [--limit N] [--type song|video|channel|playlist] [--sort relevance|date|views]',
        'Search for music across YouTube. Supports songs, channels, and playlists.',
        fl('limit', 'Number of results (default: 10, max: 20)', 'l') + '\n' +
        fl('type', 'Type filter: song, video, channel, playlist', 't') + '\n' +
        fl('sort', 'Sort by: relevance, date, views', 's')),
    });
  }

  const limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 10, 20);
  const type = flags.type || flags.t || 'all';

  await sock.sendMessage(sender, { text: '🔍 Searching music for "' + query + '"...' });

  const results = await searchMusic(query, limit, type);
  if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
  if (!results.length) return sock.sendMessage(sender, { text: 'No results for "' + query + '".' });

  if (results[0] && results[0].type === 'channel') {
    let text = '*📺 Channels for "' + query + '"*\n\n';
    results.forEach(function(r, i) {
      text += (i + 1) + '. *' + r.name + '*\n   Subs: ' + r.subscribers + ' | Videos: ' + r.videos + '\n   ' + r.url + '\n\n';
    });
    return sock.sendMessage(sender, { text });
  }
  if (results[0] && results[0].type === 'playlist') {
    let text = '*📋 Playlists for "' + query + '"*\n\n';
    results.forEach(function(r, i) {
      text += (i + 1) + '. *' + r.title + '*\n   By ' + r.author + ' | ' + r.videos + ' videos\n   ' + r.url + '\n\n';
    });
    return sock.sendMessage(sender, { text });
  }

  const sortBy = flags.sort || flags.s || 'relevance';
  let sorted = results.slice();
  if (sortBy === 'views') sorted.sort(function(a, b) { return b.views - a.views; });
  else if (sortBy === 'date') sorted.sort(function(a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });

  let text = '*🎵 Music Results for "' + query + '"*\n*(Sorted by: ' + sortBy + ')*\n\n';
  sorted.forEach(function(r, i) {
    var num = String(i + 1).padStart(2, ' ');
    text += num + '. *' + r.title + '*\n    👤 ' + r.author + ' | ⏱ ' + r.durationStr + ' | 👁 ' + r.viewsStr + '\n    ' + r.url + '\n\n';
  });

  const pages = paginate(text);
  for (const page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

async function cmdInfo(sock, sender, args, flags) {
  const query = args.join(' ');
  if (!query) {
    return sock.sendMessage(sender, { text: '*Usage:* `!music info <url | title>`\n\nGet detailed information about a specific track including duration, upload date, description, and more.' });
  }

  await sock.sendMessage(sender, { text: '📄 Fetching info for "' + query.substring(0, 50) + '..."' });
  const info = await getMusicInfo(query);
  if (info.error) return sock.sendMessage(sender, { text: 'Error: ' + info.error });

  let text = '*📄 Track Info*\n\n';
  text += '*Title:* ' + info.title + '\n';
  text += '*Author:* ' + info.author + '\n';
  text += '*Duration:* ' + info.duration + '\n';
  text += '*Views:* ' + info.views + '\n';
  text += '*Uploaded:* ' + info.uploaded + '\n';
  if (info.likes) text += '*Likes:* ' + info.likes + '\n';
  if (info.description) text += '\n*Description:*\n' + info.description.substring(0, 500) + '\n';
  text += '\n🔗 ' + info.url;
  if (info.authorUrl) text += '\n👤 Author: ' + info.authorUrl;
  await sock.sendMessage(sender, { text });
}

async function cmdTrending(sock, sender, args, flags) {
  const country = (flags.country || flags.c || 'US').toUpperCase();
  const limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 10, 20);

  await sock.sendMessage(sender, { text: '📈 Fetching trending music for ' + country + '...' });
  const results = await getTrendingMusic(country, limit);
  if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
  if (!results.length) return sock.sendMessage(sender, { text: 'No trending results.' });

  let text = '*📈 Trending Music \u2014 ' + country + '*\n\n';
  results.forEach(function(r) {
    text += '*' + r.rank + '.* ' + r.title + '\n   👤 ' + r.author + ' | ⏱ ' + r.durationStr + ' | 👁 ' + r.views + '\n   ' + r.url + '\n\n';
  });

  const pages = paginate(text);
  for (const page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

async function cmdLyrics(sock, sender, args, flags) {
  const artist = flags.artist || flags.a;
  const song = args.join(' ');
  if (!song) {
    return sock.sendMessage(sender, { text: '*Usage:* `!music lyrics <song> [--artist, -a <name>]`\n\nFind lyrics for a song.\n\n*Examples:*\n  `!music lyrics lovelier`\n  `!music lyrics alone --artist burna boy`' });
  }

  await sock.sendMessage(sender, { text: '📝 Searching lyrics for "' + song + '"' + (artist ? ' by ' + artist : '') + '...' });
  const result = await searchLyrics(song, artist);
  if (result.error) return sock.sendMessage(sender, { text: 'Error: ' + result.error });

  let text = '*📝 Lyrics Found*\n\n';
  text += '*Song:* ' + result.title + '\n';
  if (result.author) text += '*Artist:* ' + result.author + '\n';
  text += '\n▶️ Watch: ' + result.url;
  await sock.sendMessage(sender, { text });
}

async function cmdPlay(sock, sender, args, flags) {
  var query = args.join(' ');
  if (!query) {
    return sock.sendMessage(sender, {
      text: '*Usage:* `!music play <query | url>`\n\nDownload and send a track as audio.\n\n*Supported:*\n  • Any search query (e.g. _Burna Boy Last Last_)\n  • YouTube URL\n  • Spotify track URL (https://open.spotify.com/track/...)\n\n*Examples:*\n  `!music play Davido Fall`\n  `!music play https://youtu.be/abc123`\n  `!music play https://open.spotify.com/track/abc`',
    });
  }

  var { getYouTubeAudio, downloadSpotifyAudio, searchYouTubeAndDownloadAudio } = require('../services/downloadService');
  var fs2 = require('fs');

  // ── Spotify URL ──────────────────────────────────────────────────────────
  if (query.includes('spotify.com/track/')) {
    await sock.sendMessage(sender, { text: '🎵 Downloading Spotify track...\n_Searching YouTube match, please wait up to 60s..._' });
    var spResult = await downloadSpotifyAudio(query);
    if (spResult.error) return sock.sendMessage(sender, { text: '❌ ' + spResult.error });
    if (spResult.filePath && fs2.existsSync(spResult.filePath)) {
      var buf = fs2.readFileSync(spResult.filePath);
      await sock.sendMessage(sender, {
        audio: buf,
        mimetype: 'audio/mpeg',
        fileName: (spResult.title || 'track').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80) + '.mp3',
        ptt: false,
      });
      try { fs2.unlinkSync(spResult.filePath); } catch (e) {}
      await sock.sendMessage(sender, { text: '✅ *' + (spResult.title || 'Track') + '*\n👤 ' + (spResult.author || 'Spotify') });
    }
    return;
  }

  // ── YouTube URL ──────────────────────────────────────────────────────────
  if (query.includes('youtube.com/') || query.includes('youtu.be/')) {
    await sock.sendMessage(sender, { text: '🎵 Downloading YouTube audio...\n_Please wait up to 60 seconds..._' });
    var ytResult = await getYouTubeAudio(query);
    if (ytResult.error) return sock.sendMessage(sender, { text: '❌ ' + ytResult.error });
    if (ytResult.filePath && fs2.existsSync(ytResult.filePath)) {
      var buf2 = fs2.readFileSync(ytResult.filePath);
      await sock.sendMessage(sender, {
        audio: buf2,
        mimetype: 'audio/mpeg',
        fileName: (ytResult.title || 'audio').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80) + '.mp3',
        ptt: false,
      });
      try { fs2.unlinkSync(ytResult.filePath); } catch (e) {}
      await sock.sendMessage(sender, { text: '✅ *' + (ytResult.title || 'Audio') + '*' });
    }
    return;
  }

  // ── Search Query ─────────────────────────────────────────────────────────
  await sock.sendMessage(sender, { text: '🔍 Searching for "' + query.substring(0, 60) + '"...\n_Downloading audio, please wait up to 60 seconds..._' });

  // First try yt-search to find the best match and show user what we found
  var previewSent = false;
  if (typeof ytSearch === 'function') {
    try {
      var sr = await ytSearch({ query: query, pageStart: 1, pageEnd: 1 });
      var v = sr.videos && sr.videos[0];
      if (v) {
        await sock.sendMessage(sender, { text: '🎵 Found: *' + v.title + '*\n👤 ' + v.author.name + ' | ⏱ ' + v.timestamp + '\n_Downloading..._' });
        previewSent = true;
      }
    } catch (e) {}
  }

  var searchResult = await searchYouTubeAndDownloadAudio(query);
  if (searchResult.error) return sock.sendMessage(sender, { text: '❌ ' + searchResult.error });

  if (searchResult.filePath && fs2.existsSync(searchResult.filePath)) {
    var buf3 = fs2.readFileSync(searchResult.filePath);
    var sizeMB = (buf3.length / 1024 / 1024).toFixed(1);
    if (buf3.length > 100 * 1024 * 1024) {
      try { fs2.unlinkSync(searchResult.filePath); } catch (e) {}
      return sock.sendMessage(sender, { text: '⚠️ File too large (' + sizeMB + 'MB). Try a shorter track.' });
    }
    await sock.sendMessage(sender, {
      audio: buf3,
      mimetype: 'audio/mpeg',
      fileName: (searchResult.title || query).replace(/[<>:"/\\|?*]/g, '_').substring(0, 80) + '.mp3',
      ptt: false,
    });
    try { fs2.unlinkSync(searchResult.filePath); } catch (e) {}
    if (!previewSent) {
      await sock.sendMessage(sender, { text: '✅ *' + (searchResult.title || query) + '*' });
    }
  } else {
    await sock.sendMessage(sender, { text: '❌ Download failed. Please try again or use a direct YouTube link.' });
  }
}

async function cmdRecommend(sock, sender, args, flags) {
  const mood = flags.mood || flags.m;
  const genre = flags.genre || flags.g;
  const query = [genre, mood, 'music'].filter(Boolean).join(' ');
  if (!query) {
    return sock.sendMessage(sender, {
      text: usg('!music recommend [--mood, -m <mood>] [--genre, -g <genre>]',
        'Get music recommendations based on mood or genre.',
        fl('mood', 'Mood: happy, chill, sad, energetic, romantic', 'm') + '\n' +
        fl('genre', 'Genre: pop, rock, afro, jazz, classical, hip-hop', 'g') + '\n' +
        fl('limit', 'Number of results (default: 10)', 'l')),
    });
  }

  const limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 10, 20);
  await sock.sendMessage(sender, { text: '🎧 Finding ' + (mood || genre) + ' recommendations...' });

  const results = await searchMusic(query, limit);
  if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
  if (!results.length) return sock.sendMessage(sender, { text: 'No recommendations found.' });

  let text = '*🎧 Recommendations*\n';
  if (mood) text += '*Mood:* ' + mood;
  if (genre) text += (mood ? ' | ' : '') + '*Genre:* ' + genre;
  text += '\n\n';

  results.forEach(function(r, i) {
    text += (i + 1) + '. *' + r.title + '*\n   👤 ' + r.author + ' | ⏱ ' + r.durationStr + '\n   ' + r.url + '\n\n';
  });

  const pages = paginate(text);
  for (const page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

async function cmdPlaylist(sock, sender, subArgs, flags) {
  const sub = subArgs[0] && subArgs[0].toLowerCase();

  if (!sub || sub === '--help' || sub === '-h') {
    return sock.sendMessage(sender, {
      text: '*📋 Playlist Management*\n\n*Usage:* `!music playlist <subcommand> [args] [flags]`\n\n*Subcommands:*\n  `create`     Create a new playlist\n  `list`       List all your playlists\n  `show`       Show contents of a playlist\n  `add`        Add a track to a playlist\n  `remove`     Remove a track from a playlist\n  `delete`     Delete a playlist',
    });
  }

  switch (sub) {
    case 'create': {
      const plName = subArgs[1];
      const desc = flags.desc || flags.d || '';
      if (!plName) return sock.sendMessage(sender, { text: '*Usage:* `!music playlist create <name> [--desc, -d <description>]`' });
      await savePlaylist(plName, [], desc);
      await sock.sendMessage(sender, { text: '✅ Playlist "' + plName + '" created.' + (desc ? '\n📝 ' + desc : '') + '\n\nAdd tracks: `!music playlist add <url> --playlist ' + plName + '`' });
      break;
    }

    case 'list': {
      const playlists = getPlaylist();
      if (!playlists || playlists.length === 0) {
        return sock.sendMessage(sender, { text: 'No playlists yet. Create one with `!music playlist create <name>`' });
      }
      let text = '*📋 Your Playlists*\n\n';
      playlists.forEach(function(p) {
        text += '▸ *' + p.name + '* \u2014 ' + (p.items ? p.items.length : 0) + ' tracks\n';
        if (p.description) text += '  ' + p.description + '\n';
        text += '  Created: ' + new Date(p.created).toLocaleDateString() + '\n\n';
      });
      await sock.sendMessage(sender, { text });
      break;
    }

    case 'show': {
      const plN = subArgs[1];
      if (!plN) return sock.sendMessage(sender, { text: '*Usage:* `!music playlist show <name>`' });
      const pl = getPlaylist(plN);
      if (!pl) return sock.sendMessage(sender, { text: 'Playlist "' + plN + '" not found.' });
      if (!pl.items || pl.items.length === 0) {
        return sock.sendMessage(sender, { text: 'Playlist "' + plN + '" is empty.\nAdd tracks: `!music playlist add <url> --playlist ' + plN + '`' });
      }
      let text = '*📋 ' + pl.name + '*\n';
      if (pl.description) text += pl.description + '\n';
      text += pl.items.length + ' tracks\n\n';
      pl.items.forEach(function(item, i) {
        text += (i + 1) + '. *' + (item.title || item.url) + '*\n   ' + item.url + '\n\n';
      });
      const pages = paginate(text);
      for (const page of pages) {
        await sock.sendMessage(sender, { text: page });
      }
      break;
    }

    case 'add': {
      const track = subArgs.slice(1).join(' ');
      const plN2 = flags.playlist || flags.p;
      if (!track) return sock.sendMessage(sender, { text: '*Usage:* `!music playlist add <url | title> --playlist, -p <name>`' });
      if (!plN2) return sock.sendMessage(sender, { text: 'Specify playlist with `--playlist, -p <name>`' });

      const results = await searchMusic(track, 1);
      if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
      if (!results.length) return sock.sendMessage(sender, { text: 'No results for "' + track + '".' });

      const item = { title: results[0].title, url: results[0].url, addedAt: Date.now() };
      await savePlaylist(plN2, [item]);
      await sock.sendMessage(sender, { text: '✅ Added to "' + plN2 + '":\n*' + item.title + '*\n' + item.url });
      break;
    }

    case 'remove': {
      const idx = parseInt(subArgs[1]) - 1;
      const plN3 = flags.playlist || flags.p;
      if (isNaN(idx)) return sock.sendMessage(sender, { text: '*Usage:* `!music playlist remove <index> --playlist, -p <name>`' });
      if (!plN3) return sock.sendMessage(sender, { text: 'Specify playlist with `--playlist, -p <name>`' });
      const result = removeFromPlaylist(plN3, idx);
      if (result.error) return sock.sendMessage(sender, { text: 'Error: ' + result.error });
      await sock.sendMessage(sender, { text: '✅ Removed #' + (idx + 1) + ' from "' + plN3 + '":\n*' + (result.removed ? result.removed.title || 'Unknown' : 'Unknown') + '*' });
      break;
    }

    case 'delete': {
      const plN4 = subArgs[1];
      if (!plN4) return sock.sendMessage(sender, { text: '*Usage:* `!music playlist delete <name>`' });
      const result = deletePlaylist(plN4);
      if (result.error) return sock.sendMessage(sender, { text: 'Error: ' + result.error });
      await sock.sendMessage(sender, { text: '✅ Playlist "' + plN4 + '" deleted.' });
      break;
    }

    default:
      await sock.sendMessage(sender, { text: 'Unknown playlist subcommand: `' + sub + '`. Use `!music playlist` to see available subcommands.' });
  }
}

module.exports = {
  name: 'music',
  alias: ['song', 'audio', 'songs', 'tune', 'play', 'yt', 'yta', 'ytmp3', 'sing'],
  description: 'Music search, playlist management, and discovery \u2014 GitHub-style CLI',
  usage: '!music <subcommand> [args] [flags] or !song <query>',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    const { positional: parsedArgs, flags } = parseFlags(args);
    const sub = parsedArgs[0] && parsedArgs[0].toLowerCase();

    if (flags.help || flags.h) {
      const helpMap = {
        search: usg('!music search <query> [--limit N] [--type song|video|channel|playlist] [--sort relevance|date|views]',
          'Search for music across YouTube. Supports songs, channels, and playlists.',
          fl('limit', 'Number of results (default: 10, max: 20)', 'l') + '\n' +
          fl('type', 'Type filter: song, video, channel, playlist', 't') + '\n' +
          fl('sort', 'Sort by: relevance, date, views', 's')),
        info: '*Usage:* `!music info <url | title>`\n\nGet detailed information about a specific track including description, upload date, likes, and more.',
        trending: usg('!music trending [--country, -c <code>] [--limit N]',
          'Show trending/popular music by country.',
          fl('country', 'ISO country code (default: US). E.g., NG, GB, FR, JP', 'c') + '\n' +
          fl('limit', 'Number of results (default: 10)', 'l')),
        lyrics: usg('!music lyrics <song> [--artist, -a <name>]',
          'Find lyrics for a song.',
          fl('artist', 'Artist name to narrow search', 'a')),
        play: usg('!music play <query | url> [--quality N]',
          'Get the best playable link for a track.',
          fl('quality', 'Preferred quality: 128, 192, 320', 'q')),
        recommend: usg('!music recommend [--mood, -m <mood>] [--genre, -g <genre>] [--limit N]',
          'Get music recommendations based on mood or genre.',
          fl('mood', 'Mood: happy, chill, sad, energetic, romantic', 'm') + '\n' +
          fl('genre', 'Genre: pop, rock, afro, jazz, classical, hip-hop', 'g') + '\n' +
          fl('limit', 'Number of results (default: 10)', 'l')),
        playlist: 'Use `!music playlist` to see all playlist subcommands.',
      };
      const helpText = helpMap[sub] || HELP;
      return sock.sendMessage(sender, { text: helpText });
    }

    switch (sub) {
      case 'search':
      case 'find':
        await cmdSearch(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'info':
      case 'details':
        await cmdInfo(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'trending':
      case 'top':
      case 'popular':
      case 'hot':
        await cmdTrending(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'lyrics':
      case 'lyric':
      case 'text':
        await cmdLyrics(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'play':
      case 'listen':
      case 'stream':
        await cmdPlay(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'download':
      case 'dl':
        await cmdPlay(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'recommend':
      case 'rec':
      case 'suggestions':
        await cmdRecommend(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'playlist':
      case 'pl':
      case 'playlists':
        await cmdPlaylist(sock, sender, parsedArgs.slice(1), flags);
        break;
      default:
        // Default to playing the full query if sub is not a recognized management subcommand
        await cmdPlay(sock, sender, args, flags);
    }
  },
};
