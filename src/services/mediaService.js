const ytSearch = require('yt-search');
const axios = require('axios');
const config = require('../../config');

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '?:??';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// Open / public OMDB API key fallbacks
const OMDB_KEYS = [
  process.env.OMDB_API_KEY,
  'trilogy',
  'b9bd48a6',
  '302b11ff',
  '3430a5e8',
].filter(Boolean);

async function fetchOmdb(queryParams) {
  for (var i = 0; i < OMDB_KEYS.length; i++) {
    try {
      var k = OMDB_KEYS[i];
      var url = 'https://www.omdbapi.com/?apikey=' + k + '&' + queryParams;
      var resp = await axios.get(url, { timeout: 8000 });
      if (resp.data && resp.data.Response === 'True') {
        return resp.data;
      }
    } catch (e) {}
  }
  return null;
}

async function searchMusic(query, limit = 10, type = 'all') {
  try {
    const searchQuery = type === 'video' ? query : `${query} audio`;
    const results = await ytSearch({ query: searchQuery, hl: 'en', gl: 'US' });
    let videos = results.videos || [];
    if (type === 'channel') {
      return (results.channels || []).slice(0, limit).map(c => ({
        type: 'channel',
        name: c.name,
        url: c.url,
        subscribers: c.subCount || 0,
        videos: c.videoCount || 0,
        thumbnail: c.thumbnail,
      }));
    }
    if (type === 'playlist') {
      return (results.playlists || []).slice(0, limit).map(p => ({
        type: 'playlist',
        title: p.title,
        url: p.url,
        videos: p.videoCount || 0,
        author: p.author?.name || 'Unknown',
      }));
    }
    return videos.slice(0, limit).map(v => ({
      type: 'song',
      title: v.title,
      url: v.url,
      duration: v.duration?.seconds || 0,
      durationStr: formatDuration(v.duration?.seconds),
      author: v.author?.name || 'Unknown',
      thumbnail: v.thumbnail,
      views: v.views || 0,
      viewsStr: formatNumber(v.views),
      timestamp: v.timestamp,
    }));
  } catch (err) {
    return { error: `Search error: ${err.message}` };
  }
}

async function getMusicInfo(url) {
  try {
    const results = await ytSearch({ url });
    const v = results.videos?.[0] || results;
    if (!v || !v.title) return { error: 'Could not retrieve info.' };
    return {
      title: v.title,
      url: v.url,
      description: v.description?.substring(0, 500) || '',
      duration: formatDuration(v.duration?.seconds),
      durationSec: v.duration?.seconds || 0,
      author: v.author?.name || 'Unknown',
      authorUrl: v.author?.url || '',
      thumbnail: v.thumbnail,
      views: formatNumber(v.views),
      rawViews: v.views || 0,
      uploaded: v.ago || v.uploadDate || 'Unknown',
      likes: v.likes || 0,
    };
  } catch (err) {
    return { error: `Info error: ${err.message}` };
  }
}

async function getTrendingMusic(country = 'US', limit = 10) {
  try {
    const results = await ytSearch({ query: 'trending music', hl: 'en', gl: country });
    return (results.videos || []).slice(0, limit).map((v, i) => ({
      rank: i + 1,
      title: v.title,
      url: v.url,
      author: v.author?.name || 'Unknown',
      durationStr: formatDuration(v.duration?.seconds),
      views: formatNumber(v.views),
    }));
  } catch (err) {
    return { error: `Trending error: ${err.message}` };
  }
}

async function searchLyrics(song, artist) {
  try {
    const query = artist ? `${artist} ${song} lyrics` : `${song} lyrics`;
    const results = await ytSearch({ query, hl: 'en', gl: 'US' });
    const v = results.videos?.[0];
    if (!v) return { error: 'Lyrics not found.' };
    return {
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      author: v.author?.name || 'Unknown',
    };
  } catch (err) {
    return { error: `Lyrics error: ${err.message}` };
  }
}

async function searchMovie(query, opts = {}) {
  const { year, type, limit = 10 } = opts;
  try {
    let q = query;
    if (year) q += `&y=${year}`;
    if (type) q += `&type=${type}`;
    var omdbData = await fetchOmdb('s=' + encodeURIComponent(q));
    if (omdbData && omdbData.Search) {
      return omdbData.Search.slice(0, limit).map(m => ({
        title: m.Title,
        year: m.Year,
        type: m.Type,
        imdbID: m.imdbID,
        poster: m.Poster !== 'N/A' ? m.Poster : null,
      }));
    }

    let ytQ = `${query} movie`;
    if (year) ytQ += ` ${year}`;
    if (type === 'series') ytQ += ' tv series';
    const results = await ytSearch({ query: ytQ, hl: 'en', gl: 'US' });
    return (results.videos || []).slice(0, limit).map(v => ({
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      author: v.author?.name || 'Unknown',
      views: formatNumber(v.views),
      durationStr: formatDuration(v.duration?.seconds),
    }));
  } catch (err) {
    return { error: `Search error: ${err.message}` };
  }
}

async function getMovieInfo(query) {
  try {
    const isId = query.startsWith('tt') && /^tt\d+$/.test(query);
    const param = isId ? `i=${query}` : `t=${encodeURIComponent(query)}`;
    var omdbData = await fetchOmdb(param + '&plot=full');
    if (omdbData) {
      return {
        title: omdbData.Title,
        year: omdbData.Year,
        rated: omdbData.Rated,
        released: omdbData.Released,
        runtime: omdbData.Runtime,
        genre: omdbData.Genre,
        director: omdbData.Director,
        writer: omdbData.Writer,
        actors: omdbData.Actors,
        plot: omdbData.Plot,
        language: omdbData.Language,
        country: omdbData.Country,
        awards: omdbData.Awards,
        ratings: omdbData.Ratings || [],
        imdbRating: omdbData.imdbRating,
        imdbID: omdbData.imdbID,
        poster: omdbData.Poster !== 'N/A' ? omdbData.Poster : null,
        type: omdbData.Type,
        totalSeasons: omdbData.totalSeasons,
        boxOffice: omdbData.BoxOffice,
        production: omdbData.Production,
      };
    }

    const results = await ytSearch({ query: `${query} movie trailer`, hl: 'en', gl: 'US' });
    const v = results.videos?.[0];
    if (!v) return { error: 'Movie not found.' };
    return {
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      description: v.description?.substring(0, 300) || '',
      author: v.author?.name || 'Unknown',
      views: formatNumber(v.views),
    };
  } catch (err) {
    return { error: `Info error: ${err.message}` };
  }
}

async function getTrendingMovies(region = 'US', limit = 10) {
  try {
    var omdbData = await fetchOmdb('s=2024&type=movie');
    if (omdbData && omdbData.Search) {
      return omdbData.Search.slice(0, limit).map((m, i) => ({
        rank: i + 1,
        title: m.Title,
        year: m.Year,
        imdbID: m.imdbID,
        poster: m.Poster !== 'N/A' ? m.Poster : null,
      }));
    }

    const results = await ytSearch({ query: 'trending movies 2024', hl: 'en', gl: region });
    return (results.videos || []).slice(0, limit).map((v, i) => ({
      rank: i + 1,
      title: v.title,
      url: v.url,
      author: v.author?.name || 'Unknown',
      views: formatNumber(v.views),
    }));
  } catch (err) {
    return { error: `Trending error: ${err.message}` };
  }
}

async function getSimilarMovies(title, limit = 10) {
  try {
    var search = await fetchOmdb('t=' + encodeURIComponent(title));
    if (search && search.Genre) {
      const genres = search.Genre.split(', ').slice(0, 2).join(', ');
      var omdbList = await fetchOmdb('s=' + encodeURIComponent(genres) + '&type=movie');
      if (omdbList && omdbList.Search) {
        return omdbList.Search.slice(0, limit).filter(m => m.imdbID !== search.imdbID).map(m => ({
          title: m.Title,
          year: m.Year,
          imdbID: m.imdbID,
          poster: m.Poster !== 'N/A' ? m.Poster : null,
        }));
      }
    }

    const q = `movies similar to ${title}`;
    const results = await ytSearch({ query: q, hl: 'en', gl: 'US' });
    return (results.videos || []).slice(0, limit).map(v => ({
      title: v.title,
      url: v.url,
      author: v.author?.name || 'Unknown',
    }));
  } catch (err) {
    return { error: `Similar error: ${err.message}` };
  }
}

async function getUpcomingMovies(region = 'US', limit = 10) {
  try {
    const results = await ytSearch({ query: 'upcoming movies 2025 2026 trailer', hl: 'en', gl: region });
    return (results.videos || []).slice(0, limit).map((v, i) => ({
      rank: i + 1,
      title: v.title,
      url: v.url,
      author: v.author?.name || 'Unknown',
      views: formatNumber(v.views),
    }));
  } catch (err) {
    return { error: `Upcoming error: ${err.message}` };
  }
}

async function getTopRated(genre, decade, year, limit = 10) {
  try {
    let q = 'top rated';
    if (genre) q += ` ${genre}`;
    if (decade) q += ` ${decade}`;
    if (year) q += ` ${year}`;
    const results = await ytSearch({ query: q, hl: 'en', gl: 'US' });
    return (results.videos || []).slice(0, limit).map((v, i) => ({
      rank: i + 1,
      title: v.title,
      url: v.url,
      author: v.author?.name || 'Unknown',
      views: formatNumber(v.views),
      durationStr: formatDuration(v.duration?.seconds),
    }));
  } catch (err) {
    return { error: `Top rated error: ${err.message}` };
  }
}

async function savePlaylist(name, items, description = '') {
  const { saveJson, loadJson } = require('../utils/helpers');
  const path = require('path');
  const file = path.join(__dirname, '..', '..', 'storage', 'playlists.json');
  const playlists = loadJson(file, {});
  if (!playlists[name]) {
    playlists[name] = { name, description, created: Date.now(), items: [] };
  }
  if (items) playlists[name].items.push(...items);
  saveJson(file, playlists);
  return playlists[name];
}

function getPlaylist(name) {
  const { loadJson } = require('../utils/helpers');
  const path = require('path');
  const file = path.join(__dirname, '..', '..', 'storage', 'playlists.json');
  const playlists = loadJson(file, {});
  if (name) return playlists[name] || null;
  return Object.values(playlists);
}

function removeFromPlaylist(name, index) {
  const { saveJson, loadJson } = require('../utils/helpers');
  const path = require('path');
  const file = path.join(__dirname, '..', '..', 'storage', 'playlists.json');
  const playlists = loadJson(file, {});
  if (!playlists[name]) return { error: 'Playlist not found.' };
  if (index < 0 || index >= playlists[name].items.length) return { error: 'Invalid index.' };
  const removed = playlists[name].items.splice(index, 1);
  saveJson(file, playlists);
  return { success: true, removed: removed[0] };
}

function deletePlaylist(name) {
  const { saveJson, loadJson } = require('../utils/helpers');
  const path = require('path');
  const file = path.join(__dirname, '..', '..', 'storage', 'playlists.json');
  const playlists = loadJson(file, {});
  if (!playlists[name]) return { error: 'Playlist not found.' };
  delete playlists[name];
  saveJson(file, playlists);
  return { success: true };
}

// ─── Movie Direct Download via YTS API + Direct Stream Links ───────────────────

async function getMovieDownload(query) {
  try {
    var searchQuery = query.trim();
    var imdbId = null;
    var movieTitle = searchQuery;
    var movieYear = null;
    var omdbDetails = null;

    if (!searchQuery.match(/^tt\d+$/)) {
      omdbDetails = await fetchOmdb('t=' + encodeURIComponent(searchQuery) + '&type=movie');
      if (omdbDetails) {
        imdbId = omdbDetails.imdbID;
        movieTitle = omdbDetails.Title;
        movieYear = omdbDetails.Year;
      }
    } else {
      imdbId = searchQuery;
    }

    // Query YTS API mirrors
    var ytsMirrors = [
      'https://yts.mx/api/v2/',
      'https://yts.lt/api/v2/',
      'https://yts.am/api/v2/',
      'https://yts.do/api/v2/',
      'https://yts.rs/api/v2/',
    ];

    var movie = null;
    var torrents = [];

    for (var i = 0; i < ytsMirrors.length; i++) {
      try {
        var base = ytsMirrors[i];
        var endpoint = imdbId
          ? base + 'movie_details.json?imdb_id=' + imdbId + '&with_images=true'
          : base + 'list_movies.json?query_term=' + encodeURIComponent(movieTitle) + '&limit=5';

        var { data: res } = await axios.get(endpoint, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (imdbId && res?.data?.movie) {
          movie = res.data.movie;
          torrents = movie.torrents || [];
          if (torrents.length > 0) break;
        } else if (res?.data?.movies && res.data.movies.length > 0) {
          movie = res.data.movies[0];
          torrents = movie.torrents || [];
          if (torrents.length > 0) break;
        }
      } catch (e) {}
    }

    // Web Watch / Direct Stream Links
    var watchLinks = [];
    var code = imdbId || movie?.imdb_code;
    if (code) {
      watchLinks.push({ provider: 'VidSrc HD Stream', url: 'https://vidsrc.me/embed/movie?imdb=' + code });
      watchLinks.push({ provider: 'VidSrc CC Player', url: 'https://vidsrc.cc/v2/embed/movie/' + code });
      watchLinks.push({ provider: '2Embed HD Player', url: 'https://www.2embed.cc/embed/' + code });
      watchLinks.push({ provider: 'AutoEmbed Direct', url: 'https://player.autoembed.cc/embed/movie/' + code });
      watchLinks.push({ provider: 'VidSrc TO Player', url: 'https://vidsrc.to/embed/movie/' + code });
    }

    if (!movie && !omdbDetails) {
      return { error: 'Movie "' + query + '" not found. Please check spelling or use IMDb ID (e.g. tt1375666).' };
    }

    var title = movie?.title || omdbDetails?.Title || movieTitle;
    var year = movie?.year || omdbDetails?.Year || movieYear;
    var rating = movie?.rating || omdbDetails?.imdbRating || '?';
    var summary = movie?.summary || omdbDetails?.Plot || '';

    var sortedTorrents = torrents.map(function(t) {
      var dn = encodeURIComponent(title + ' (' + year + ') [' + t.quality + ']');
      var trackers = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.openbittorrent.com:80',
        'udp://open.stealth.si:80/announce',
        'udp://tracker.coppersurfer.tk:6969/announce',
      ].map(tr => '&tr=' + encodeURIComponent(tr)).join('');

      return {
        quality: t.quality,
        size: t.size,
        type: t.type || 'bluray',
        seeds: t.seeds || 0,
        peers: t.peers || 0,
        magnetUrl: 'magnet:?xt=urn:btih:' + t.hash + '&dn=' + dn + trackers,
        torrentUrl: t.url,
      };
    });

    return {
      found: true,
      title: title,
      year: year,
      rating: rating,
      summary: summary.substring(0, 300),
      imdbId: code,
      ytsUrl: movie?.url || ('https://yts.mx/movies/' + (movie?.slug || '')),
      torrents: sortedTorrents,
      watchLinks: watchLinks,
    };
  } catch (err) {
    return { error: 'Movie search failed: ' + err.message };
  }
}

module.exports = {
  searchMusic,
  getMusicInfo,
  getTrendingMusic,
  searchLyrics,
  searchMovie,
  getMovieInfo,
  getMovieDownload,
  getTrendingMovies,
  getSimilarMovies,
  getUpcomingMovies,
  getTopRated,
  savePlaylist,
  getPlaylist,
  removeFromPlaylist,
  deletePlaylist,
  formatDuration,
  formatNumber,
};
