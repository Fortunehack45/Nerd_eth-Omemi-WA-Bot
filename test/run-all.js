/**
 * Runs every registered bot command through the real command handler
 * with a mocked socket. Any unhandled exception = FAIL.
 * Commands that fail due to external APIs must still reply gracefully.
 */
process.env.ANTI_BAN_ENABLED = 'false';
process.env.HUMAN_TYPING = 'false';
process.env.RANDOM_DELAYS = 'false';
process.env.DASHBOARD_PORT = '3999';

const path = require('path');
const fs = require('fs');

// Isolate test storage so we don't touch real data
const STORAGE = path.join(__dirname, '..', 'storage');
if (!fs.existsSync(STORAGE)) fs.mkdirSync(STORAGE, { recursive: true });

const { MockSock, makeMsg, makeGroupMsg } = require('./mock');
const { loadCommands, handleCommand, getCommandsList } = require('../src/handlers/commandHandler');
const config = require('../config');

const results = [];
const sock = new MockSock({ botJid: '2348000000000:1@s.whatsapp.net', botIsAdmin: true });

// Allow admin checks to pass: simulates owner sending commands from own account (fromMe)
function ownerMsg(text, opts = {}) {
  return makeMsg(text, Object.assign({ fromMe: true }, opts));
}

async function run(name, text, opts = {}) {
  const before = sock.sent.length;
  const t0 = Date.now();
  let err = null;
  let notFound = false;
  try {
    const msg = opts.group ? makeGroupMsg(text, opts) : ownerMsg(text, opts);
    const res = await handleCommand(sock, msg, text.slice(1));
    if (res === null) notFound = true;
  } catch (e) {
    err = e;
  }
  const dur = Date.now() - t0;
  const replies = sock.sent.slice(before);
  results.push({ name, text, ok: !err, notFound, err: err ? (err.stack || err.message) : null, replies: replies.length, dur, replyTexts: replies.map(r => (r.content && r.content.text || '').substring(0, 120)) });
  sock.clear();
  return err;
}

async function main() {
  console.log('=== Loading commands ===');
  loadCommands();
  const list = getCommandsList();
  console.log('Registered commands:', list.length, '\n');

  console.log('=== Running all commands (help / no-args path) ===');
  for (const c of list) {
    await run('help-path', config.prefix + c.name);
  }

  console.log('\n=== Detailed scenarios ===');
  const scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenarios.json'), 'utf8'));
  for (const s of scenarios) {
    await run(s.name, s.cmd, s.opts || {});
  }

  // ── Report ─────────────────────────────────────────────
  console.log('\n=== RESULTS ===');
  let failed = 0;
  for (const r of results) {
    if (!r.ok) {
      failed++;
      console.log('❌ FAIL [' + r.name + '] ' + r.text);
      console.log('   ' + String(r.err).split('\n').slice(0, 4).join('\n   '));
    } else if (r.replies === 0 && !r.notFound) {
      failed++;
      console.log('⚠️  NO-REPLY [' + r.name + '] ' + r.text + ' (command ran but sent nothing)');
    } else {
      const t = (r.replyTexts[0] || '').replace(/\n/g, ' ').substring(0, 70);
      console.log((r.notFound ? '⚪ IGNORED ' : '✅ PASS ') + '[' + r.name + '] ' + r.text.substring(0, 50) + ' → ' + t);
    }
  }
  console.log('\nTotal: ' + results.length + ' | Failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
