const { searchMovie, getMovieInfo, getTrendingMovies, getSimilarMovies, getUpcomingMovies, getTopRated, getMovieDownload } = require('../services/mediaService');
const { parseFlags, paginate } = require('../utils/helpers');

const HELP = [
  '*🎬 Movie Command*',
  '',
  'GitHub-style CLI for movie search, discovery, and details.',
  '',
  '*Usage:*',
  '  `!movie <subcommand> [args] [flags]`',
  '',
  '*Subcommands:*',
  '  `search`       Search for movies and TV series',
  '  `info`         Get detailed information about a movie',
  '  `trending`     Show trending movies',
  '  `top`          Top rated movies by genre/decade/year',
  '  `similar`      Find movies similar to a title',
  '  `upcoming`     Upcoming movie releases',
  '  `recommend`    Personalized movie recommendations',
  '  `download`     Download a movie (torrent/magnet links via YTS)',
  '',
  '*Global Flags:*',
  '  `--help`, `-h`   Show help for any subcommand',
  '',
  '*Examples:*',
  '  `!movie search action --year 2024 --limit 10`',
  '  `!movie search inception --type movie`',
  '  `!movie info Inception`',
  '  `!movie info tt1375666`',
  '  `!movie trending --region US`',
  '  `!movie top --genre sci-fi --decade 2010s`',
  '  `!movie similar "The Matrix" --limit 8`',
  '  `!movie upcoming --limit 15`',
  '  `!movie recommend --genre thriller --rating 7 --year 2023`',
].join('\n');

function usg(s, d, f) {
  var t = '*Usage:* `' + s + '`';
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
      text: usg('!movie search <query> [--year YYYY] [--type movie|series] [--limit N]',
        'Search for movies and TV series.',
        fl('year', 'Filter by release year', 'y') + '\n' +
        fl('type', 'Type: movie, series', 't') + '\n' +
        fl('limit', 'Number of results (default: 10, max: 20)', 'l')),
    });
  }

  const year = flags.year || flags.y;
  const type = flags.type || flags.t;
  const limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 10, 20);

  await sock.sendMessage(sender, { text: '🔍 Searching movies for "' + query + '"...' });
  const results = await searchMovie(query, { year, type, limit });
  if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
  if (!results.length) return sock.sendMessage(sender, { text: 'No results for "' + query + '".' });

  var text = '*🎬 Movie Results for "' + query + '"*\n';
  if (year) text += '*Year:* ' + year;
  if (type) text += (year ? ' | ' : '') + '*Type:* ' + type;
  text += '\n\n';

  results.forEach(function(r, i) {
    text += String(i + 1).padStart(2, ' ') + '. *' + r.title + '*\n';
    if (r.year) text += '   📅 ' + r.year;
    if (r.type) text += ' | 🏷 ' + r.type;
    if (r.imdbID) text += ' | 🆔 `' + r.imdbID + '`';
    text += '\n';
    if (r.url) text += '   🔗 ' + r.url + '\n';
    if (r.views) text += '   👁 ' + r.views + '\n';
    text += '\n';
  });

  const pages = paginate(text);
  for (const page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

async function cmdInfo(sock, sender, args, flags) {
  const query = args.join(' ');
  if (!query) {
    return sock.sendMessage(sender, {
      text: usg('!movie info <title | IMDb ID> [--full]',
        'Get detailed information about a movie. Use an IMDb ID starting with `tt` for best results.',
        fl('full', 'Show full plot (default: truncated)', 'f')),
    });
  }

  await sock.sendMessage(sender, { text: '📄 Fetching details for "' + query.substring(0, 50) + '..."' });
  const info = await getMovieInfo(query);
  if (info.error) return sock.sendMessage(sender, { text: 'Error: ' + info.error });

  const fullPlot = flags.full || flags.f;

  var text = '*🎬 ' + info.title + '*\n\n';
  if (info.year) text += '📅 *Year:* ' + info.year + '\n';
  if (info.rated) text += '🔞 *Rated:* ' + info.rated + '\n';
  if (info.released) text += '📆 *Released:* ' + info.released + '\n';
  if (info.runtime) text += '⏱ *Runtime:* ' + info.runtime + '\n';
  if (info.genre) text += '🎭 *Genre:* ' + info.genre + '\n';
  if (info.director) text += '🎬 *Director:* ' + info.director + '\n';
  if (info.writer) text += '✍️ *Writer:* ' + info.writer + '\n';
  if (info.actors) text += '👥 *Cast:* ' + info.actors + '\n';
  if (info.language) text += '🗣 *Language:* ' + info.language + '\n';
  if (info.country) text += '🌍 *Country:* ' + info.country + '\n';
  if (info.awards) text += '🏆 *Awards:* ' + info.awards + '\n';
  if (info.boxOffice) text += '💰 *Box Office:* ' + info.boxOffice + '\n';
  if (info.production) text += '🏢 *Production:* ' + info.production + '\n';
  if (info.type === 'series' && info.totalSeasons) text += '📺 *Seasons:* ' + info.totalSeasons + '\n';
  if (info.imdbRating && info.imdbRating !== 'N/A') text += '⭐ *IMDb Rating:* ' + info.imdbRating + '/10\n';
  if (info.imdbID) text += '🆔 *IMDb:* `' + info.imdbID + '`\n';

  if (info.ratings && info.ratings.length) {
    text += '\n*Ratings:*\n';
    info.ratings.forEach(function(r) {
      text += '  \u2022 ' + r.Source + ': ' + r.Value + '\n';
    });
  }

  if (info.plot) {
    text += '\n*Plot:*\n' + (fullPlot ? info.plot : info.plot.substring(0, 300) + '...') + '\n';
    if (!fullPlot && info.plot.length > 300) {
      text += '\n_Use --full to see the complete plot._';
    }
  }

  if (info.url) text += '\n🔗 ' + info.url;
  await sock.sendMessage(sender, { text: text.substring(0, 4000) });
}

async function cmdTrending(sock, sender, args, flags) {
  const region = (flags.region || flags.r || 'US').toUpperCase();
  const limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 10, 20);

  await sock.sendMessage(sender, { text: '📈 Fetching trending movies for ' + region + '...' });
  const results = await getTrendingMovies(region, limit);
  if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
  if (!results.length) return sock.sendMessage(sender, { text: 'No trending results.' });

  var text = '*📈 Trending Movies \u2014 ' + region + '*\n\n';
  results.forEach(function(r) {
    text += '*' + r.rank + '.* ' + r.title + '\n';
    if (r.year) text += '   📅 ' + r.year;
    if (r.imdbID) text += ' | 🆔 `' + r.imdbID + '`';
    if (r.author) text += ' | 👤 ' + r.author;
    text += '\n';
    if (r.url) text += '   🔗 ' + r.url + '\n';
    text += '\n';
  });

  const pages = paginate(text);
  for (const page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

async function cmdTop(sock, sender, args, flags) {
  const genre = flags.genre || flags.g;
  const decade = flags.decade || flags.d;
  const year = flags.year || flags.y;
  const limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 10, 20);

  if (!genre && !decade && !year) {
    return sock.sendMessage(sender, {
      text: usg('!movie top [--genre, -g <genre>] [--decade, -d <decade>] [--year, -y YYYY] [--limit N]',
        'Discover top rated movies by genre, decade, or year. Combine filters for precise results.',
        fl('genre', 'Genre: action, comedy, drama, sci-fi, horror, romance', 'g') + '\n' +
        fl('decade', 'Decade: 1980s, 1990s, 2000s, 2010s', 'd') + '\n' +
        fl('year', 'Specific year: 1994, 2010, 2023', 'y') + '\n' +
        fl('limit', 'Number of results (default: 10)', 'l')),
    });
  }

  await sock.sendMessage(sender, { text: '🏆 Fetching top rated...' });
  const results = await getTopRated(genre, decade, year, limit);
  if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
  if (!results.length) return sock.sendMessage(sender, { text: 'No results found.' });

  var text = '*🏆 Top Rated*';
  if (genre) text += ' *Genre:* ' + genre;
  if (decade) text += (genre ? ' |' : '') + ' *Decade:* ' + decade;
  if (year) text += (genre || decade ? ' |' : '') + ' *Year:* ' + year;
  text += '\n\n';

  results.forEach(function(r) {
    text += '*' + r.rank + '.* ' + r.title + '\n';
    if (r.author) text += '   👤 ' + r.author;
    if (r.views) text += ' | 👁 ' + r.views;
    if (r.durationStr) text += ' | ⏱ ' + r.durationStr;
    text += '\n';
    if (r.url) text += '   🔗 ' + r.url + '\n';
    text += '\n';
  });

  const pages = paginate(text);
  for (const page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

async function cmdSimilar(sock, sender, args, flags) {
  const query = args.join(' ');
  const limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 10, 20);

  if (!query) {
    return sock.sendMessage(sender, {
      text: usg('!movie similar <title> [--limit N]',
        'Find movies similar to a given title based on genre and keywords.',
        fl('limit', 'Number of results (default: 10)', 'l')),
    });
  }

  await sock.sendMessage(sender, { text: '🔍 Finding movies similar to "' + query + '"...' });
  const results = await getSimilarMovies(query, limit);
  if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
  if (!results.length) return sock.sendMessage(sender, { text: 'No similar movies found for "' + query + '".' });

  var text = '*🎬 Similar to "' + query + '"*\n\n';
  results.forEach(function(r, i) {
    text += (i + 1) + '. *' + r.title + '*\n';
    if (r.year) text += '   📅 ' + r.year;
    if (r.imdbID) text += ' | 🆔 `' + r.imdbID + '`';
    text += '\n';
    if (r.url) text += '   🔗 ' + r.url + '\n';
    text += '\n';
  });

  const pages = paginate(text);
  for (const page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

async function cmdUpcoming(sock, sender, args, flags) {
  const region = (flags.region || flags.r || 'US').toUpperCase();
  const limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 10, 20);

  await sock.sendMessage(sender, { text: '📅 Fetching upcoming movies for ' + region + '...' });
  const results = await getUpcomingMovies(region, limit);
  if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
  if (!results.length) return sock.sendMessage(sender, { text: 'No upcoming movies found.' });

  var text = '*📅 Upcoming Movies \u2014 ' + region + '*\n\n';
  results.forEach(function(r) {
    text += '*' + r.rank + '.* ' + r.title + '\n';
    if (r.author) text += '   👤 ' + r.author;
    if (r.views) text += ' | 👁 ' + r.views;
    text += '\n';
    if (r.url) text += '   🔗 ' + r.url + '\n';
    text += '\n';
  });

  const pages = paginate(text);
  for (const page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

async function cmdRecommend(sock, sender, args, flags) {
  const genre = flags.genre || flags.g;
  const rating = flags.rating || flags.r;
  const year = flags.year || flags.y;
  const language = flags.language || flags.lang;

  var query = [];
  if (genre) query.push(genre);
  if (year) query.push(year);
  query.push('movie');
  const searchQuery = query.join(' ');

  if (!searchQuery || searchQuery === 'movie') {
    return sock.sendMessage(sender, {
      text: usg('!movie recommend [--genre, -g <genre>] [--rating, -r <min>] [--year, -y YYYY] [--language, --lang <code>]',
        'Get personalized movie recommendations.',
        fl('genre', 'Genre: action, comedy, drama, horror, sci-fi, thriller', 'g') + '\n' +
        fl('rating', 'Minimum IMDb rating (1-10)', 'r') + '\n' +
        fl('year', 'Release year', 'y') + '\n' +
        fl('language', 'Language code: en, fr, es, etc.', '')),
    });
  }

  const limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 10, 20);
  await sock.sendMessage(sender, { text: '🎯 Finding recommendations...' });
  const results = await searchMovie(searchQuery, { limit });
  if (results.error) return sock.sendMessage(sender, { text: 'Error: ' + results.error });
  if (!results.length) return sock.sendMessage(sender, { text: 'No recommendations found.' });

  var text = '*🎯 Movie Recommendations*';
  if (genre) text += ' *Genre:* ' + genre;
  if (year) text += (genre ? ' |' : '') + ' *Year:* ' + year;
  if (rating) text += (genre || year ? ' |' : '') + ' *Min Rating:* ' + rating;
  if (language) text += (genre || year || rating ? ' |' : '') + ' *Language:* ' + language;
  text += '\n\n';

  results.forEach(function(r, i) {
    text += (i + 1) + '. *' + r.title + '*\n';
    if (r.year) text += '   📅 ' + r.year;
    if (r.type) text += ' | 🏷 ' + r.type;
    if (r.imdbID) text += ' | 🆔 `' + r.imdbID + '`';
    text += '\n';
    if (r.url) text += '   🔗 ' + r.url + '\n';
    text += '\n';
  });

  const pages = paginate(text);
  for (const page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

async function cmdDownload(sock, sender, args, flags) {
  var query = args.join(' ');
  if (!query) {
    return sock.sendMessage(sender, {
      text: usg('!movie download <title | IMDb ID>',
        'Get download & streaming links for a movie.\n\n*Supported:* 1080p, 720p, 2160p (4K), Direct HD Watch Links\n\n*Examples:*\n  `!movie download Inception`\n  `!movie download tt1375666`\n  `!movie download Avatar`',
        ''),
    });
  }

  await sock.sendMessage(sender, { text: '🎬 Searching movie download links for "' + query.substring(0, 50) + '"...' });
  var result = await getMovieDownload(query);

  if (result.error && !result.found) {
    return sock.sendMessage(sender, { text: '❌ ' + result.error });
  }

  var text = '*🎬 ' + result.title + ' (' + (result.year || '?') + ')*\n';
  if (result.rating) text += '⭐ *Rating:* ' + result.rating + '/10\n';
  if (result.imdbId) text += '🆔 *IMDb:* `' + result.imdbId + '`\n';
  if (result.summary) text += '\n*Plot:* ' + result.summary + '\n';

  if (result.watchLinks && result.watchLinks.length > 0) {
    text += '\n*🌐 Direct HD Watch / Stream Links:*\n';
    result.watchLinks.forEach(function(w) {
      text += '  ▸ [' + w.provider + '](' + w.url + ')\n';
    });
  }

  if (result.torrents && result.torrents.length > 0) {
    text += '\n*📥 Torrent & Magnet Download Options:*\n';
    result.torrents.forEach(function(t, i) {
      text += '\n*' + (i + 1) + '.* ' + t.quality + ' (' + (t.type || 'HD') + ') — ' + t.size + '\n';
      text += '   💾 Torrent: ' + t.torrentUrl + '\n';
      text += '   🧲 Magnet: `' + t.magnetUrl + '`\n';
    });
  } else {
    text += '\n⚠️ No direct torrents found. You can watch online using the stream links above!';
  }

  text += '\n\n_💡 Magnet links can be pasted into qBittorrent, uTorrent, or TorrentDownloader._';

  var pages = paginate(text, 3800);
  for (var page of pages) {
    await sock.sendMessage(sender, { text: page });
  }
}

module.exports = {
  name: 'movie',
  alias: ['film', 'movies', 'films', 'cinema'],
  description: 'Movie search, discovery, details, and recommendations \u2014 GitHub-style CLI',
  usage: '!movie <subcommand> [args] [flags]',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    const { positional: parsedArgs, flags } = parseFlags(args);
    const sub = parsedArgs[0] && parsedArgs[0].toLowerCase();

    if (flags.help || flags.h) {
      const helpMap = {
        search: usg('!movie search <query> [--year YYYY] [--type movie|series] [--limit N]',
          'Search for movies and TV series.',
          fl('year', 'Filter by release year', 'y') + '\n' +
          fl('type', 'Type: movie, series', 't') + '\n' +
          fl('limit', 'Number of results (default: 10)', 'l')),
        info: usg('!movie info <title | IMDb ID> [--full]',
          'Get detailed movie info including plot, cast, ratings, awards, and box office.',
          fl('full', 'Show full plot', 'f')),
        trending: usg('!movie trending [--region, -r <code>] [--limit N]',
          'Show trending movies by region.',
          fl('region', 'ISO region code (default: US)', 'r') + '\n' +
          fl('limit', 'Number of results', 'l')),
        top: usg('!movie top [--genre, -g <genre>] [--decade, -d <decade>] [--year, -y YYYY] [--limit N]',
          'Top rated movies filtered by genre, decade, or year.',
          fl('genre', 'Genre filter', 'g') + '\n' +
          fl('decade', 'Decade filter', 'd') + '\n' +
          fl('year', 'Year filter', 'y') + '\n' +
          fl('limit', 'Number of results', 'l')),
        similar: usg('!movie similar <title> [--limit N]',
          'Find movies similar to a given title.',
          fl('limit', 'Number of results', 'l')),
        upcoming: usg('!movie upcoming [--region, -r <code>] [--limit N]',
          'Upcoming movie releases by region.',
          fl('region', 'ISO region code (default: US)', 'r') + '\n' +
          fl('limit', 'Number of results', 'l')),
        recommend: usg('!movie recommend [--genre, -g <genre>] [--rating, -r <min>] [--year, -y YYYY] [--language, --lang <code>]',
          'Personalized movie recommendations.',
          fl('genre', 'Genre filter', 'g') + '\n' +
          fl('rating', 'Minimum IMDb rating', 'r') + '\n' +
          fl('year', 'Release year', 'y') + '\n' +
          fl('language', 'Language code', '')),
      };
      return sock.sendMessage(sender, { text: helpMap[sub] || HELP });
    }

    switch (sub) {
      case 'search':
      case 'find':
        await cmdSearch(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'info':
      case 'details':
      case 'get':
        await cmdInfo(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'trending':
      case 'popular':
      case 'hot':
        await cmdTrending(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'top':
      case 'toprated':
      case 'best':
        await cmdTop(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'similar':
      case 'related':
        await cmdSimilar(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'upcoming':
      case 'coming':
      case 'releases':
        await cmdUpcoming(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'recommend':
      case 'rec':
      case 'suggest':
      case 'suggestions':
        await cmdRecommend(sock, sender, parsedArgs.slice(1), flags);
        break;
      case 'download':
      case 'dl':
      case 'torrent':
      case 'get':
        await cmdDownload(sock, sender, parsedArgs.slice(1), flags);
        break;
      default:
        await sock.sendMessage(sender, { text: 'Unknown subcommand: `' + sub + '`. Use `!movie --help` to see all available subcommands.' });
    }
  },
};
