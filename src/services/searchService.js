var axios = require('axios');
var cheerio = require('cheerio');

async function searchWeb(query, limit) {
  limit = limit || 5;
  try {
    var url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    var resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });
    var $ = cheerio.load(resp.data);
    var results = [];
    $('.result').each(function(i) {
      if (i >= limit) return false;
      var title = $(this).find('.result__title').text().trim();
      var snippet = $(this).find('.result__snippet').text().trim();
      var link = $(this).find('.result__url').attr('href') || '';
      var match = link.match(/uddg=(.+?)&/);
      if (match) link = decodeURIComponent(match[1]);
      if (title) {
        results.push({ title: title, snippet: snippet, url: link });
      }
    });
    if (results.length === 0) {
      return { error: 'No results found.', results: [] };
    }
    return { success: true, results: results, count: results.length };
  } catch (err) {
    return { error: 'Search failed: ' + err.message, results: [] };
  }
}

async function searchWikipedia(query, limit) {
  limit = limit || 3;
  try {
    var url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(query) + '&format=json&srlimit=' + limit;
    var resp = await axios.get(url, { timeout: 10000 });
    var data = resp.data;
    if (!data.query || !data.query.search || data.query.search.length === 0) {
      return { error: 'No Wikipedia results found.' };
    }
    var results = data.query.search.slice(0, limit).map(function(r) {
      return {
        title: r.title,
        snippet: r.snippet.replace(/<[^>]*>/g, ''),
        url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(r.title.replace(/ /g, '_')),
      };
    });
    return { success: true, results: results, count: results.length };
  } catch (err) {
    return { error: 'Wikipedia search failed: ' + err.message };
  }
}

module.exports = { searchWeb, searchWikipedia };
