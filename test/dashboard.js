/**
 * Dashboard server API tests: boots the express app and exercises every endpoint.
 */
process.env.ANTI_BAN_ENABLED = 'false';
process.env.DASHBOARD_PORT = '3987';
process.env.PORT = '3987';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

if (!fs.existsSync('storage')) fs.mkdirSync('storage', { recursive: true });

const { startServer, logMessage, logCommand, setConnected } = require('../server');
const { loadCommands } = require('../src/handlers/commandHandler');

let passed = 0, failed = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('✅ ' + name); })
    .catch(e => { failed++; console.log('❌ ' + name + '\n   ' + (e.message || e)); });
}

const BASE = 'http://127.0.0.1:3987';
const PWD = 'pwd=Omemi';

async function api(method, urlPath, body, useAuth = true) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const sep = urlPath.includes('?') ? '&' : '?';
  const res = await fetch(BASE + urlPath + (useAuth ? sep + PWD : ''), opts);
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}

async function main() {
  loadCommands();
  startServer();
  // simulate connected state so status shows data
  setConnected({ user: { id: '2348000000000:1@s.whatsapp.net', name: 'TestBot' } });
  logMessage('Tester', 'hello dashboard', 'message');
  logCommand('ping', '2348000000000', 'ok');
  await new Promise(r => setTimeout(r, 600));

  await check('GET /dashboard serves HTML', async () => {
    const res = await fetch(BASE + '/dashboard?pwd=Omemi');
    const html = await res.text();
    assert.strictEqual(res.status, 200);
    assert.ok(html.includes('<html') || html.includes('<!DOCTYPE'), 'html document');
  });

  await check('API rejects missing password (401)', async () => {
    const r = await api('GET', '/api/status', null, false);
    assert.strictEqual(r.status, 401);
  });

  await check('API rejects wrong password (401)', async () => {
    const res = await fetch(BASE + '/api/status?pwd=wrongpass');
    assert.strictEqual(res.status, 401);
  });

  await check('GET /api/status returns full status', async () => {
    const r = await api('GET', '/api/status');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.connected, true);
    assert.ok(r.json.botName);
    assert.ok(typeof r.json.uptime === 'string');
    assert.ok(Array.isArray(r.json.recentMessages));
    assert.ok(r.json.commands >= 30, 'command count: ' + r.json.commands);
  });

  await check('GET /api/users returns array', async () => {
    const r = await api('GET', '/api/users');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json));
  });

  await check('GET /api/user/:id returns user', async () => {
    const r = await api('GET', '/api/user/2348111111111');
    assert.strictEqual(r.status, 200);
    assert.ok(r.json);
  });

  await check('GET /api/logs returns logs', async () => {
    const r = await api('GET', '/api/logs');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json.logs));
    assert.ok(Array.isArray(r.json.recentMessages));
    assert.ok(Array.isArray(r.json.commands));
    assert.ok(r.json.recentMessages.length >= 1);
  });

  await check('POST /api/generate-access-key returns 6-digit key', async () => {
    const r = await api('POST', '/api/generate-access-key');
    assert.strictEqual(r.status, 200);
    assert.ok(/^\d{6}$/.test(r.json.key), 'key format');
    assert.strictEqual(r.json.success, true);
  });

  await check('Generated access key authenticates', async () => {
    const k = await api('POST', '/api/generate-access-key');
    const res = await fetch(BASE + '/api/status?pwd=' + k.json.key);
    assert.strictEqual(res.status, 200);
  });

  await check('GET /api/qrdata handles no-QR', async () => {
    const r = await api('GET', '/api/qrdata');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.qr, null);
  });

  await check('GET /api/keys reports key state', async () => {
    const r = await api('GET', '/api/keys');
    assert.strictEqual(r.status, 200);
    assert.ok('groqSet' in r.json && 'openaiSet' in r.json);
    assert.ok('provider' in r.json);
  });

  await check('POST /api/keys updates runtime + .env', async () => {
    const r = await api('POST', '/api/keys', { groq: 'gsk_dashboard_test_12345' });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.updated.includes('groq'));
    assert.strictEqual(r.json.provider, 'groq');
    assert.ok(fs.existsSync(path.join(__dirname, '..', '.env')), '.env created');
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    assert.ok(env.includes('GROQ_API_KEY=gsk_dashboard_test_12345'), 'key persisted');
  });

  await check('GET /api/features returns config', async () => {
    const r = await api('GET', '/api/features');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json.disabledCommands));
    assert.ok(Array.isArray(r.json.disabledFeatures));
  });

  await check('POST /api/features/toggle disables & enables', async () => {
    const d = await api('POST', '/api/features/toggle', { name: 'movie', action: 'disable' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.json));
    const cfg = await api('GET', '/api/features');
    assert.ok(cfg.json.disabledCommands.includes('movie') || cfg.json.disabledFeatures.includes('movie'));
    const e = await api('POST', '/api/features/toggle', { name: 'movie', action: 'enable' });
    assert.strictEqual(e.status, 200);
  });

  await check('POST /api/features/toggle rejects missing name', async () => {
    const r = await api('POST', '/api/features/toggle', { action: 'disable' });
    assert.strictEqual(r.status, 400);
  });

  await check('POST /api/pair rejects bad phone', async () => {
    const r = await api('POST', '/api/pair', { phone: '123' });
    assert.strictEqual(r.status, 400);
  });

  await check('POST /api/test without sock responds error', async () => {
    const r = await api('POST', '/api/test', { to: '2348111111111' });
    assert.ok(r.status === 400 || r.status === 500, 'no live socket -> error, got ' + r.status);
  });

  await check('GET /api/owner-check responds', async () => {
    const r = await api('GET', '/api/owner-check');
    assert.strictEqual(r.status, 200);
    assert.ok('ownerNumber' in r.json);
  });

  await check('POST /api/speedtest responds', async () => {
    const r = await api('POST', '/api/speedtest');
    assert.strictEqual(r.status, 200);
    assert.ok(typeof r.json === 'object' && r.json !== null);
  });

  await check('POST /api/test-ai responds structured', async () => {
    const r = await api('POST', '/api/test-ai');
    assert.strictEqual(r.status, 200);
    assert.ok('success' in r.json);
  });

  await check('GET /api/reset-onboarding responds', async () => {
    const r = await api('GET', '/api/reset-onboarding');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.reset, true);
  });

  // Clean up test .env so it doesn't pollute the repo
  try { fs.unlinkSync(path.join(__dirname, '..', '.env')); } catch (e) {}

  console.log('\nDASHBOARD RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('DASHBOARD CRASH:', e); process.exit(2); });
