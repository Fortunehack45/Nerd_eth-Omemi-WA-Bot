var axios = require('axios');
var cheerio = require('cheerio');
var config = require('../../config');

// ─── DuckDuckGo Search ────────────────────────────────────────────────────────
async function searchDuckDuckGo(query, limit) {
  limit = limit || 5;
  try {
    // Try the lite HTML endpoint (more reliable)
    var url = 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(query);
    var resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    });
    var $ = cheerio.load(resp.data);
    var results = [];

    // Parse lite.duckduckgo.com format
    $('table').find('tr').each(function() {
      if (results.length >= limit) return false;
      var cells = $(this).find('td');
      var linkEl = cells.find('a.result-link');
      var snippetEl = cells.find('.result-snippet');
      var title = linkEl.text().trim();
      var snippet = snippetEl.text().trim();
      var href = linkEl.attr('href') || '';
      if (title && href && !href.startsWith('/')) {
        results.push({ title: title, snippet: snippet, url: href });
      }
    });

    if (results.length === 0) {
      // Fallback: HTML endpoint
      var url2 = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
      var resp2 = await axios.get(url2, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000,
      });
      var $2 = cheerio.load(resp2.data);
      $2('.result').each(function(i) {
        if (i >= limit) return false;
        var title = $2(this).find('.result__title, .result__a').first().text().trim();
        var snippet = $2(this).find('.result__snippet').text().trim();
        var link = $2(this).find('a.result__url, .result__a').attr('href') || '';
        // DuckDuckGo uses redirect URLs - extract the actual URL
        var match = link.match(/uddg=([^&]+)/);
        if (match) link = decodeURIComponent(match[1]);
        if (title && link && link.startsWith('http')) {
          results.push({ title: title, snippet: snippet, url: link });
        }
      });
    }

    if (results.length === 0) {
      return { error: 'No results found.', results: [] };
    }
    return { success: true, results: results.slice(0, limit), count: results.slice(0, limit).length };
  } catch (err) {
    return { error: 'DuckDuckGo search failed: ' + err.message, results: [] };
  }
}

// ─── Brave Search API ─────────────────────────────────────────────────────────
async function searchBrave(query, limit) {
  limit = limit || 5;
  var apiKey = config.braveSearch?.apiKey;
  if (!apiKey) return { error: 'Brave Search API key not configured.', results: [] };

  try {
    var resp = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count: limit, search_lang: 'en' },
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      timeout: 15000,
    });
    var data = resp.data;
    var webResults = data?.web?.results || [];
    var results = webResults.slice(0, limit).map(function(r) {
      return { title: r.title, snippet: r.description || '', url: r.url };
    });
    if (results.length === 0) return { error: 'No Brave results found.', results: [] };
    return { success: true, results: results, count: results.length, source: 'brave' };
  } catch (err) {
    return { error: 'Brave search failed: ' + err.message, results: [] };
  }
}

// ─── Wikipedia Search ─────────────────────────────────────────────────────────
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

// ─── Main search router ────────────────────────────────────────────────────────
async function searchWeb(query, limit) {
  limit = limit || 5;
  // Try Brave first if key is available
  if (config.braveSearch?.apiKey) {
    var braveResult = await searchBrave(query, limit);
    if (braveResult.success) return braveResult;
  }
  // Fall back to DuckDuckGo
  return await searchDuckDuckGo(query, limit);
}

module.exports = { searchWeb, searchWikipedia, searchBrave, searchDuckDuckGo };
