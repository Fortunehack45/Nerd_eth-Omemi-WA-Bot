/**
 * Edge-flow tests: direct download, onboarding, view-once show-by-reply,
 * music playlist persistence, movie formatting with stubbed axios.
 */
process.env.ANTI_BAN_ENABLED = 'false';
process.env.HUMAN_TYPING = 'false';

const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const { MockSock, makeMsg, makeGroupMsg } = require('./mock');
const { loadCommands, handleCommand } = require('../src/handlers/commandHandler');

const sock = new MockSock({ botJid: '2348000000000:1@s.whatsapp.net', botIsAdmin: true });
let passed = 0, failed = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('✅ ' + name); })
    .catch(e => { failed++; console.log('❌ ' + name + '\n   ' + (e.message || e)); });
}

async function main() {
  loadCommands();
  if (!fs.existsSync('storage')) fs.mkdirSync('storage', { recursive: true });

  // ── Local file server for direct-download test ──
  const fakeMp4 = Buffer.from('FAKE_MP4_DATA'.repeat(1000)); // ~13KB
  const server = http.createServer((req, res) => {
    if (req.url === '/video.mp4') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fakeMp4.length });
      res.end(fakeMp4);
    } else if (req.url === '/missing.mp4') {
      res.writeHead(404);
      res.end('nope');
    } else {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise(r => server.listen(3971, r));

  await check('direct video download works end-to-end', async () => {
    sock.clear();
    const r = await handleCommand(sock, makeMsg('!download http://127.0.0.1:3971/video.mp4', { fromMe: true }), 'download http://127.0.0.1:3971/video.mp4');
    assert.strictEqual(r, true);
    const sent = sock.sent.find(s => s.content.video || s.content.document);
    assert.ok(sent, 'sends video or document: ' + JSON.stringify(sock.texts()));
    // temp file cleaned up after send
    const tempDir = path.join(__dirname, '..', 'storage', 'temp');
    const leftovers = fs.existsSync(tempDir) ? fs.readdirSync(tempDir).filter(f => f.startsWith('direct_')) : [];
    assert.strictEqual(leftovers.length, 0, 'temp file deleted after send');
  });

  await check('direct download of missing file fails gracefully', async () => {
    sock.clear();
    await handleCommand(sock, makeMsg('!download http://127.0.0.1:3971/missing.mp4', { fromMe: true }), 'download http://127.0.0.1:3971/missing.mp4');
    const t = sock.texts().join(' ');
    assert.ok(t.includes('❌'), 'error reply: ' + t);
  });

  // ── Onboarding service ──
  await check('onboarding sends welcome & marks complete', async () => {
    const onb = require('../src/services/onboardingService');
    onb.resetOnboarding();
    sock.clear();
    const sent = await onb.startOnboarding(sock);
    assert.strictEqual(sent, true, 'welcome sent');
    assert.strictEqual(onb.isOnboarded(), true, 'marked onboarded');
    assert.ok(sock.sent.length >= 1, 'message sent to bot owner');
    const last = sock.last();
    assert.ok(last.content.caption || last.content.text, 'has caption/text');
    // Second run is a no-op
    sock.clear();
    const sent2 = await onb.startOnboarding(sock);
    assert.strictEqual(sent2, false, 'already onboarded -> skip');
  });

  // ── View-once: admin replies to a view-once message to retrieve it ──
  await check('viewonce show-by-reply retrieves saved media', async () => {
    // First save one
    const vo = {
      key: { remoteJid: '2348111111111@s.whatsapp.net', fromMe: false, id: 'VOSHOW' + Date.now(), participant: '2348111111111@s.whatsapp.net' },
      pushName: 'Tester',
      message: { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true, caption: 'show me' } } } },
    };
    const { saveViewOnce } = require('../src/services/viewOnceService');
    const saved = await saveViewOnce(sock, vo);
    assert.ok(saved && saved.success, 'saved for the test');

    // Now admin replies to it with !viewonce show
    sock.clear();
    const reply = makeMsg('!viewonce show');
    reply.message = {
      extendedTextMessage: {
        text: '!viewonce show',
        contextInfo: {
          participant: '2348111111111@s.whatsapp.net',
          stanzaId: vo.key.id,
          quotedMessage: vo.message,
        },
      },
    };
    const r = await handleCommand(sock, reply, 'viewonce show');
    assert.strictEqual(r, true);
    const mediaMsg = sock.sent.find(s => s.content.image || s.content.video || s.content.audio || s.content.document);
    assert.ok(mediaMsg, 'media resent to admin: ' + JSON.stringify(sock.texts()));
  });

  // ── View-once: !viewonce show <id> ──
  await check('viewonce show by id works', async () => {
    const { listSavedMedia } = require('../src/services/viewOnceService');
    const items = listSavedMedia(5);
    assert.ok(items.length >= 1);
    sock.clear();
    await handleCommand(sock, makeMsg('!viewonce show ' + items[0].id, { fromMe: true }), 'viewonce show ' + items[0].id);
    const mediaMsg = sock.sent.find(s => s.content.image || s.content.video || s.content.audio || s.content.document);
    assert.ok(mediaMsg, 'media sent by id');
  });

  // ── Music playlist persistence across commands ──
  await check('music playlist persists', async () => {
    sock.clear();
    await handleCommand(sock, makeMsg('!music playlist createpersist', { fromMe: true }), 'music playlist createpersist');
    // playlist add requires a URL
    await handleCommand(sock, makeMsg('!music playlist add https://youtu.be/xyz789 --playlist createpersist', { fromMe: true }), 'music playlist add https://youtu.be/xyz789 --playlist createpersist');
    sock.clear();
    await handleCommand(sock, makeMsg('!music playlist show createpersist', { fromMe: true }), 'music playlist show createpersist');
    const t = sock.texts().join('\n');
    assert.ok(t.includes('createpersist') || t.includes('track') || t.toLowerCase().includes('1.'), 'playlist shown: ' + t.substring(0, 150));
  });

  // ── Movie formatting with stubbed OMDB ──
  await check('movie info formats OMDB data', async () => {
    const axios = require('axios');
    const origGet = axios.get;
    axios.get = async function(url) {
      if (String(url).includes('omdbapi.com')) {
        return { data: { Response: 'True', Title: 'Inception', Year: '2010', Rated: 'PG-13', Released: '16 Jul 2010', Runtime: '148 min', Genre: 'Action, Sci-Fi', Director: 'Christopher Nolan', Writer: 'C. Nolan', Actors: 'Leonardo DiCaprio, J. Gordon-Levitt', Plot: 'A thief who steals corporate secrets.', Language: 'English', Country: 'USA', Awards: 'Won 4 Oscars', Poster: 'https://x/poster.jpg', Metascore: '74', imdbRating: '8.8', imdbVotes: '2,400,000', imdbID: 'tt1375666', Type: 'movie', BoxOffice: '$292,587,330' } };
      }
      return origGet.apply(this, arguments);
    };
    try {
      sock.clear();
      await handleCommand(sock, makeMsg('!movie info Inception', { fromMe: true }), 'movie info Inception');
      const t = sock.texts().join('\n');
      assert.ok(t.includes('Inception'), 'title shown');
      assert.ok(t.includes('2010'), 'year shown');
      assert.ok(t.includes('8.8'), 'rating shown');
      assert.ok(t.includes('Christopher Nolan'), 'director shown');
    } finally {
      axios.get = origGet;
    }
  });

  // ── Movie search with stubbed OMDB list ──
  await check('movie search formats OMDB results', async () => {
    const axios = require('axios');
    const origGet = axios.get;
    axios.get = async function(url) {
      if (String(url).includes('omdbapi.com')) {
        return { data: { Response: 'True', Search: [
          { Title: 'Movie One', Year: '2021', imdbID: 'tt1111111', Type: 'movie', Poster: 'na' },
          { Title: 'Movie Two', Year: '2022', imdbID: 'tt2222222', Type: 'series', Poster: 'na' },
        ], totalResults: '2' } };
      }
      return origGet.apply(this, arguments);
    };
    try {
      sock.clear();
      await handleCommand(sock, makeMsg('!movie search test', { fromMe: true }), 'movie search test');
      const t = sock.texts().join('\n');
      assert.ok(t.includes('Movie One'), 'first result shown');
      assert.ok(t.includes('tt1111111'), 'imdb id shown');
    } finally {
      axios.get = origGet;
    }
  });

  // ── Search service with stubbed DDG html ──
  await check('web search parses DDG lite results', async () => {
    const axios = require('axios');
    const origGet = axios.get;
    axios.get = async function(url) {
      if (String(url).includes('duckduckgo.com')) {
        return { data: '<table><tr><td>1.&nbsp;<a rel="nofollow" class="result-link" href="https://example.com/a">Result A</a></td></tr><tr><td class="result-snippet">Snippet A text</td></tr><tr><td>2.&nbsp;<a rel="nofollow" class="result-link" href="https://example.com/b">Result B</a></td></tr><tr><td class="result-snippet">Snippet B text</td></tr></table>' };
      }
      return origGet.apply(this, arguments);
    };
    try {
      sock.clear();
      await handleCommand(sock, makeMsg('!search test --limit 2', { fromMe: true }), 'search test --limit 2');
      const t = sock.texts().join('\n');
      assert.ok(t.includes('Result A'), 'first result: ' + t.substring(0, 200));
      assert.ok(t.includes('example.com/a'), 'url shown');
    } finally {
      axios.get = origGet;
    }
  });

  // ── Wikipedia search with stubbed API ──
  await check('wikipedia search parses API results', async () => {
    const axios = require('axios');
    const origGet = axios.get;
    axios.get = async function(url) {
      if (String(url).includes('wikipedia.org')) {
        return { data: { query: { search: [ { title: 'Lagos', snippet: 'A city in <b>Nigeria</b>' }, { title: 'Abuja', snippet: 'Capital city' } ] } } };
      }
      return origGet.apply(this, arguments);
    };
    try {
      sock.clear();
      await handleCommand(sock, makeMsg('!search nigeria --source wiki', { fromMe: true }), 'search nigeria --source wiki');
      const t = sock.texts().join('\n');
      assert.ok(t.includes('Lagos'), 'wiki result: ' + t.substring(0, 200));
      assert.ok(t.includes('en.wikipedia.org/wiki/Lagos'), 'wiki url');
    } finally {
      axios.get = origGet;
    }
  });

  // ── APK search with stubbed Aptoide ──
  await check('apk search formats Aptoide results', async () => {
    const axios = require('axios');
    const origGet = axios.get;
    axios.get = async function(url) {
      if (String(url).includes('aptoide.com')) {
        return { data: { datalist: { list: [ { name: 'WhatsApp Messenger', package: 'com.whatsapp', uname: 'whatsapp', file: { vername: '2.24.1', filesize: 34000000, path: 'https://apks.aptoide.com/wa.apk' }, stats: { rating: { avg: 4.5 }, downloads: 5000000000 }, icon: { url: 'https://x/icon.png' }, added: '2024-01-01', category: { name: 'Communication' } } ] } } };
      }
      return origGet.apply(this, arguments);
    };
    try {
      sock.clear();
      await handleCommand(sock, makeMsg('!apk search whatsapp', { fromMe: true }), 'apk search whatsapp');
      const t = sock.texts().join('\n');
      assert.ok(t.includes('WhatsApp Messenger'), 'app shown');
      assert.ok(t.includes('com.whatsapp'), 'package shown');
    } finally {
      axios.get = origGet;
    }
  });

  // ── AI with stubbed pollinations ──
  await check('AI free fallback returns real answer', async () => {
    const axios = require('axios');
    const origPost = axios.post;
    axios.post = async function(url) {
      if (String(url).includes('pollinations.ai')) {
        return { data: 'OK — pollinations answer' };
      }
      return origPost.apply(this, arguments);
    };
    const ai = require('../src/services/aiService');
    // force public-free provider
    const origProvider = ai.getProvider();
    try {
      const r = await ai.chatComplete([{ role: 'user', content: 'say OK' }]);
      assert.strictEqual(r.success, true, JSON.stringify(r).substring(0, 100));
      assert.ok(r.text.includes('OK'), 'answer: ' + r.text.substring(0, 60));
    } finally {
      axios.post = origPost;
    }
  });

  server.close();
  console.log('\nEDGE RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('EDGE CRASH:', e); process.exit(2); });
