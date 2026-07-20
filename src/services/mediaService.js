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
    const omdbKey = process.env.OMDB_API_KEY;
    if (omdbKey) {
      let q = query;
      if (year) q += `&y=${year}`;
      if (type) q += `&type=${type}`;
      const { data } = await axios.get(`https://www.omdbapi.com/?apikey=${omdbKey}&s=${encodeURIComponent(q)}`, { timeout: 8000 });
      if (data.Response === 'True') {
        return data.Search.slice(0, limit).map(m => ({
          title: m.Title,
          year: m.Year,
          type: m.Type,
          imdbID: m.imdbID,
          poster: m.Poster !== 'N/A' ? m.Poster : null,
        }));
      }
    }
    let q = `${query} movie`;
    if (year) q += ` ${year}`;
    if (type === 'series') q += ' tv series';
    const results = await ytSearch({ query: q, hl: 'en', gl: 'US' });
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
    const omdbKey = process.env.OMDB_API_KEY;
    if (omdbKey) {
      const isId = query.startsWith('tt') && /^tt\d+$/.test(query);
      const param = isId ? `i=${query}` : `t=${encodeURIComponent(query)}`;
      const { data } = await axios.get(`https://www.omdbapi.com/?apikey=${omdbKey}&${param}&plot=full`, { timeout: 8000 });
      if (data.Response === 'True') {
        return {
          title: data.Title,
          year: data.Year,
          rated: data.Rated,
          released: data.Released,
          runtime: data.Runtime,
          genre: data.Genre,
          director: data.Director,
          writer: data.Writer,
          actors: data.Actors,
          plot: data.Plot,
          language: data.Language,
          country: data.Country,
          awards: data.Awards,
          ratings: data.Ratings || [],
          imdbRating: data.imdbRating,
          imdbID: data.imdbID,
          poster: data.Poster !== 'N/A' ? data.Poster : null,
          type: data.Type,
          totalSeasons: data.totalSeasons,
          boxOffice: data.BoxOffice,
          production: data.Production,
        };
      }
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
    const omdbKey = process.env.OMDB_API_KEY;
    if (omdbKey) {
      const { data } = await axios.get(`https://www.omdbapi.com/?apikey=${omdbKey}&s=2024&type=movie`, { timeout: 8000 });
      if (data.Response === 'True') {
        return data.Search.slice(0, limit).map((m, i) => ({
          rank: i + 1,
          title: m.Title,
          year: m.Year,
          imdbID: m.imdbID,
          poster: m.Poster !== 'N/A' ? m.Poster : null,
        }));
      }
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
    const omdbKey = process.env.OMDB_API_KEY;
    if (omdbKey) {
      const { data: search } = await axios.get(`https://www.omdbapi.com/?apikey=${omdbKey}&t=${encodeURIComponent(title)}`, { timeout: 8000 });
      if (search.Response === 'True' && search.Genre) {
        const genres = search.Genre.split(', ').slice(0, 2).join(', ');
        const { data } = await axios.get(`https://www.omdbapi.com/?apikey=${omdbKey}&s=${encodeURIComponent(genres)}&type=movie`, { timeout: 8000 });
        if (data.Response === 'True') {
          return data.Search.slice(0, limit).filter(m => m.imdbID !== search.imdbID).map(m => ({
            title: m.Title,
            year: m.Year,
            imdbID: m.imdbID,
            poster: m.Poster !== 'N/A' ? m.Poster : null,
          }));
        }
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
    const results = await ytSearch({ query: 'upcoming movies 2024 2025 trailer', hl: 'en', gl: region });
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

module.exports = {
  searchMusic,
  getMusicInfo,
  getTrendingMusic,
  searchLyrics,
  searchMovie,
  getMovieInfo,
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
