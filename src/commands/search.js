var { searchWeb, searchWikipedia } = require('../services/searchService');

module.exports = {
  name: 'search',
  alias: ['google', 'web', 'internet', 'wiki', 'wikipedia'],
  description: 'Search the internet for information',
  usage: '!search <query> [--source web|wiki] [--limit N]',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args) {
      return sock.sendMessage(sender, {
        text: '*🔍 Internet Search*\n\nSearch the web or Wikipedia for information.\n\n*Usage:* `!search <query>`\n\n*Flags:*\n  `--source, -s`  Search source: `web` (default) or `wiki`\n  `--limit, -l`   Number of results (max: 10)\n\n*Examples:*\n  `!search latest AI developments`\n  `!search Nigeria population --source wiki`\n  `!search JavaScript array methods --limit 5`',
      });
    }

    var parsed = require('../utils/helpers').parseFlags(args);
    var query = parsed.positional.join(' ');
    var flags = parsed.flags;
    var source = flags.source || flags.s || 'web';
    var limit = Math.min(parseInt(flags.limit) || parseInt(flags.l) || 5, 10);

    await sock.sendMessage(sender, { text: '🔍 Searching ' + source + ' for "' + query.substring(0, 80) + '"...' });
    await sock.sendPresenceUpdate('composing', sender);

    var result;
    if (source === 'wiki' || source === 'wikipedia') {
      result = await searchWikipedia(query, limit);
    } else {
      result = await searchWeb(query, limit);
    }

    if (result.error) {
      return sock.sendMessage(sender, { text: 'Search failed: ' + result.error + '\n\nTry a different query or source (`--source wiki`).' });
    }

    var title = source === 'wiki' ? '📚 Wikipedia Results' : '🌐 Web Search Results';
    var text = '*🔍 ' + title + '*\n';
    text += '*Query:* ' + query + '\n';
    text += '*Results:* ' + result.count + '\n\n';

    result.results.forEach(function(r, i) {
      text += (i + 1) + '. *' + r.title + '*\n';
      if (r.snippet) text += '   ' + r.snippet.substring(0, 200) + '\n';
      if (r.url) text += '   🔗 ' + r.url + '\n';
      text += '\n';
    });

    var pages = require('../utils/helpers').paginate(text);
    for (var p of pages) {
      await sock.sendMessage(sender, { text: p });
    }
  },
};
