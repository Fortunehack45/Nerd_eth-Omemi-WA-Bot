/**
 * Adversarial Authentication & Authorization Stress Test Suite
 * 
 * Conducted by Challenger M2-1 to empirically challenge:
 * 1. Missing passwords, empty strings, whitespace-only strings, wrong data types (numbers, objects, arrays, null, boolean, symbols), unicode characters, null bytes.
 * 2. Bearer token permutations, x-dashboard-password header permutations, and query parameter ?pwd= permutations.
 * 3. Timing-safe comparison execution and constant-time properties.
 * 4. Strict HTTP 401 returned across all protected routes (/api/admin/sessions, /api/sessions/:id/disconnect, /api/sessions/:id [DELETE], /api/sessions/restart-all, /api/logs, /api/users, etc.).
 * 5. Parameter pollution and precedence order attack resilience.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('node:assert');
const { describe, it, before, after } = require('node:test');

const { adminAuth, isValidPassword } = require('../src/middleware/auth');
const { app, setSessionManager } = require('../server');
const { MockSessionManager } = require('./mocks/mockSessionManager');

const VALID_PASSWORD = process.env.DASHBOARD_PASSWORD || 'Omemi';

describe('Challenger M2-1 Empirical Auth Stress Test Suite', () => {
  let server;
  let baseUrl;
  let mockManager;

  before(async () => {
    // Attach mock session manager with sample session for testing admin routes
    mockManager = new MockSessionManager();
    const s1 = await mockManager.createSession('test_sess_001');
    s1.sock = {
      user: { id: '2349161239200:1@s.whatsapp.net', name: 'TestUser' },
      ws: { isOpen: true }
    };
    s1.status = 'connected';
    s1.messagesCount = 10;
    setSessionManager(mockManager);

    // Bind ephemeral HTTP server for live route testing
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mockManager) {
      for (const id of Array.from(mockManager.sessions.keys())) {
        try {
          await mockManager.destroySession(id, true);
        } catch (e) {}
      }
    }
  });

  // =========================================================================
  // Challenge 1: Boundary & Type Coercion Stress (isValidPassword Unit)
  // =========================================================================
  describe('Challenge 1: Input Boundary & Type Coercion Stress (isValidPassword)', () => {
    it('rejects missing, undefined, null, and empty inputs', () => {
      assert.strictEqual(isValidPassword(), false);
      assert.strictEqual(isValidPassword(undefined), false);
      assert.strictEqual(isValidPassword(null), false);
      assert.strictEqual(isValidPassword(''), false);
    });

    it('rejects whitespace-only strings of diverse whitespace characters', () => {
      assert.strictEqual(isValidPassword(' '), false);
      assert.strictEqual(isValidPassword('     '), false);
      assert.strictEqual(isValidPassword('\t'), false);
      assert.strictEqual(isValidPassword('\n'), false);
      assert.strictEqual(isValidPassword('\r\n'), false);
      assert.strictEqual(isValidPassword(' \t \r \n \f \v '), false);
    });

    it('rejects non-string data types without throwing or type-coercing', () => {
      // Numbers
      assert.strictEqual(isValidPassword(0), false);
      assert.strictEqual(isValidPassword(12345), false);
      assert.strictEqual(isValidPassword(-1), false);
      assert.strictEqual(isValidPassword(NaN), false);
      assert.strictEqual(isValidPassword(Infinity), false);

      // Booleans
      assert.strictEqual(isValidPassword(true), false);
      assert.strictEqual(isValidPassword(false), false);

      // Objects & Arrays
      assert.strictEqual(isValidPassword({}), false);
      assert.strictEqual(isValidPassword({ pwd: VALID_PASSWORD }), false);
      assert.strictEqual(isValidPassword({ toString: () => VALID_PASSWORD }), false);
      assert.strictEqual(isValidPassword([]), false);
      assert.strictEqual(isValidPassword([VALID_PASSWORD]), false);

      // Functions & Symbols
      assert.strictEqual(isValidPassword(() => VALID_PASSWORD), false);
      assert.strictEqual(isValidPassword(Symbol(VALID_PASSWORD)), false);
    });

    it('rejects unicode variations, homoglyphs, and injected control bytes', () => {
      // Cyrillic lookalikes (homoglyph attack: Cyrillic 'О' \u041e, Cyrillic 'е' \u0435)
      const homoglyph = '\u041em\u0435mi';
      assert.strictEqual(isValidPassword(homoglyph), false, 'Homoglyph password must not match');

      // Accented characters
      assert.strictEqual(isValidPassword('Omémì'), false);
      assert.strictEqual(isValidPassword('Ömemi'), false);

      // Emojis
      assert.strictEqual(isValidPassword('Omemi🤖'), false);
      assert.strictEqual(isValidPassword('🔐'), false);

      // Null byte injection
      assert.strictEqual(isValidPassword('Omemi\0'), false);
      assert.strictEqual(isValidPassword('\0Omemi'), false);
      assert.strictEqual(isValidPassword('Om\0emi'), false);
      assert.strictEqual(isValidPassword('Omemi\0admin_bypass'), false);

      // Internal newline and carriage return injection
      assert.strictEqual(isValidPassword('Om\nemi'), false);
      assert.strictEqual(isValidPassword('Om\r\nemi'), false);
      assert.strictEqual(isValidPassword('Omemi\nextra'), false);

      // Zero-width spaces & hidden non-whitespace chars
      assert.strictEqual(isValidPassword('Omemi\u200B'), false);
      assert.strictEqual(isValidPassword('Om\u200Bemi'), false);
    });

    it('enforces strict case sensitivity', () => {
      assert.strictEqual(isValidPassword(VALID_PASSWORD.toLowerCase()), false);
      assert.strictEqual(isValidPassword(VALID_PASSWORD.toUpperCase()), false);
      assert.strictEqual(isValidPassword('oMeMi'), false);
    });

    it('rejects partial matches and substring prefixes/suffixes', () => {
      assert.strictEqual(isValidPassword(VALID_PASSWORD.slice(0, -1)), false);
      assert.strictEqual(isValidPassword(VALID_PASSWORD + '1'), false);
      assert.strictEqual(isValidPassword('1' + VALID_PASSWORD), false);
      assert.strictEqual(isValidPassword(VALID_PASSWORD + VALID_PASSWORD), false);
    });

    it('accepts correct password with or without surrounding whitespace', () => {
      assert.strictEqual(isValidPassword(VALID_PASSWORD), true);
      assert.strictEqual(isValidPassword(`  ${VALID_PASSWORD}  `), true);
      assert.strictEqual(isValidPassword(`\t${VALID_PASSWORD}\n`), true);
    });

    it('survives extremely long strings without DoS, RangeError, or memory explosion', () => {
      const longString10K = 'A'.repeat(10000);
      const longString100K = 'B'.repeat(100000);
      assert.strictEqual(isValidPassword(longString10K), false);
      assert.strictEqual(isValidPassword(longString100K), false);
    });
  });

  // =========================================================================
  // Challenge 2: Timing Attack Resilience & Constant-Time Verification
  // =========================================================================
  describe('Challenge 2: Timing Attack Resilience Verification', () => {
    it('verifies that crypto.timingSafeEqual is strictly invoked over 32-byte SHA-256 buffers', () => {
      let timingSafeEqualCalled = false;
      let bufferSizesMatch = false;

      const originalTimingSafeEqual = crypto.timingSafeEqual;
      try {
        crypto.timingSafeEqual = function (a, b) {
          timingSafeEqualCalled = true;
          bufferSizesMatch = Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.length === 32 && b.length === 32;
          return originalTimingSafeEqual.apply(this, arguments);
        };

        const result = isValidPassword(VALID_PASSWORD);
        assert.strictEqual(result, true);
        assert.strictEqual(timingSafeEqualCalled, true, 'crypto.timingSafeEqual MUST be called');
        assert.strictEqual(bufferSizesMatch, true, 'Buffers must be exactly 32 bytes (SHA-256 digests)');
      } finally {
        crypto.timingSafeEqual = originalTimingSafeEqual;
      }
    });

    it('guarantees constant-time execution without RangeError across arbitrary password lengths', () => {
      // In native Node crypto.timingSafeEqual, mismatched buffer lengths throw RangeError.
      // Pre-hashing with SHA-256 guarantees constant buffer size (32 bytes) for any string length.
      const inputsToTest = [
        'X',                       // 1 char wrong
        'Xmemi',                   // 1st char wrong, same length
        'Omemx',                   // Last char wrong, same length
        'WrongPasswordEntirely',   // Mismatched length
        VALID_PASSWORD,            // Exact match
        'Z'.repeat(10000)          // Massive string
      ];

      for (const input of inputsToTest) {
        assert.doesNotThrow(() => {
          isValidPassword(input);
        }, `isValidPassword must never throw RangeError on input of length ${input.length}`);
      }
    });

    it('executes timing benchmarks across candidate passwords without anomalous divergence', () => {
      const iterations = 5000;
      const candidates = [
        { label: 'FirstCharMismatch', pass: 'Xmemi' },
        { label: 'LastCharMismatch', pass: 'Omemx' },
        { label: 'LengthMismatch', pass: 'Om' },
        { label: 'ValidPassword', pass: VALID_PASSWORD }
      ];

      // Warm up JIT
      for (let i = 0; i < 500; i++) {
        isValidPassword('warmup');
      }

      const timings = {};
      for (const cand of candidates) {
        const start = process.hrtime.bigint();
        for (let i = 0; i < iterations; i++) {
          isValidPassword(cand.pass);
        }
        const diff = process.hrtime.bigint() - start;
        timings[cand.label] = Number(diff) / iterations; // average ns per operation
      }

      // Timing divergence between first-char and last-char mismatch must be minimal (within measurement noise)
      const ratio = timings.FirstCharMismatch / timings.LastCharMismatch;
      assert.ok(ratio > 0.5 && ratio < 2.0, `Timing ratio between early and late character mismatch should be ~1.0: got ${ratio}`);
    });
  });

  // =========================================================================
  // Challenge 3: Transport & Header/Query Permutation Stress (Middleware Contract)
  // =========================================================================
  describe('Challenge 3: Transport Channel & Header Permutations (adminAuth Unit)', () => {
    function runMiddleware(req) {
      return new Promise((resolve) => {
        let nextCalled = false;
        let statusCode = 200;
        let responseJson = null;

        const res = {
          status: function (code) {
            statusCode = code;
            return res;
          },
          json: function (payload) {
            responseJson = payload;
            resolve({ nextCalled, statusCode, responseJson });
          }
        };

        const next = () => {
          nextCalled = true;
          resolve({ nextCalled, statusCode, responseJson });
        };

        adminAuth(req, res, next);
      });
    }

    it('rejects malformed req objects gracefully without throwing unhandled exceptions', async () => {
      const r1 = await runMiddleware(null);
      assert.strictEqual(r1.statusCode, 401);
      assert.strictEqual(r1.nextCalled, false);

      const r2 = await runMiddleware({});
      assert.strictEqual(r2.statusCode, 401);
      assert.strictEqual(r2.nextCalled, false);

      const r3 = await runMiddleware({ headers: null, query: null, body: null });
      assert.strictEqual(r3.statusCode, 401);
      assert.strictEqual(r3.nextCalled, false);
    });

    describe('x-dashboard-password Header Permutations', () => {
      it('rejects empty, whitespace, and wrong headers with HTTP 401', async () => {
        const cases = ['', '   ', '\t\n', 'wrong_pass', 'omemi'];
        for (const val of cases) {
          const res = await runMiddleware({ headers: { 'x-dashboard-password': val } });
          assert.strictEqual(res.statusCode, 401, `Expected 401 for header: "${val}"`);
          assert.strictEqual(res.nextCalled, false);
          assert.strictEqual(res.responseJson.success, false);
        }
      });

      it('rejects non-string header types (array pollution / duplicate headers) with HTTP 401', async () => {
        const arrayRes = await runMiddleware({ headers: { 'x-dashboard-password': [VALID_PASSWORD] } });
        assert.strictEqual(arrayRes.statusCode, 401, 'Array header must return 401');
        assert.strictEqual(arrayRes.nextCalled, false);

        const objRes = await runMiddleware({ headers: { 'x-dashboard-password': { pwd: VALID_PASSWORD } } });
        assert.strictEqual(objRes.statusCode, 401, 'Object header must return 401');
        assert.strictEqual(objRes.nextCalled, false);
      });

      it('accepts correct x-dashboard-password with trimming', async () => {
        const res1 = await runMiddleware({ headers: { 'x-dashboard-password': VALID_PASSWORD } });
        assert.strictEqual(res1.nextCalled, true);

        const res2 = await runMiddleware({ headers: { 'x-dashboard-password': `  ${VALID_PASSWORD}  ` } });
        assert.strictEqual(res2.nextCalled, true);
      });
    });

    describe('Authorization Bearer Permutations', () => {
      it('accepts valid Bearer token case-insensitively with leading/trailing spaces', async () => {
        const validHeaders = [
          `Bearer ${VALID_PASSWORD}`,
          `bearer ${VALID_PASSWORD}`,
          `BEARER ${VALID_PASSWORD}`,
          `Bearer    ${VALID_PASSWORD}   `,
          `  Bearer ${VALID_PASSWORD}  `
        ];

        for (const h of validHeaders) {
          const res = await runMiddleware({ headers: { authorization: h } });
          assert.strictEqual(res.nextCalled, true, `Bearer token should pass for: "${h}"`);
        }
      });

      it('rejects malformed Bearer tokens with HTTP 401', async () => {
        const invalidHeaders = [
          'Bearer',                  // missing space and token
          'Bearer ',                 // empty token
          'Bearer    ',              // whitespace token
          'Bearer wrong_pass',       // wrong token
          `Bearer${VALID_PASSWORD}`, // missing space
          `Basic ${VALID_PASSWORD}`,  // wrong scheme
          `Token ${VALID_PASSWORD}`,  // wrong scheme
          'Bearer null',
          'Bearer undefined'
        ];

        for (const h of invalidHeaders) {
          const res = await runMiddleware({ headers: { authorization: h } });
          assert.strictEqual(res.statusCode, 401, `Expected 401 for: "${h}"`);
          assert.strictEqual(res.nextCalled, false);
        }
      });
    });

    describe('Query Parameter ?pwd= Permutations & Parameter Pollution', () => {
      it('rejects missing, empty, and whitespace query parameters with HTTP 401', async () => {
        const emptyCases = [{ pwd: '' }, { pwd: '   ' }, { pwd: 'wrong' }];
        for (const q of emptyCases) {
          const res = await runMiddleware({ headers: {}, query: q });
          assert.strictEqual(res.statusCode, 401);
          assert.strictEqual(res.nextCalled, false);
        }
      });

      it('rejects HTTP Parameter Pollution (array / duplicate ?pwd=) with HTTP 401', async () => {
        // In Express, ?pwd=Omemi&pwd=evil produces query.pwd = ['Omemi', 'evil']
        const res = await runMiddleware({ headers: {}, query: { pwd: [VALID_PASSWORD, 'evil'] } });
        assert.strictEqual(res.statusCode, 401, 'Array query parameter must return 401');
        assert.strictEqual(res.nextCalled, false);
      });

      it('rejects object query parameters (?pwd[test]=1) with HTTP 401', async () => {
        const res = await runMiddleware({ headers: {}, query: { pwd: { test: '1' } } });
        assert.strictEqual(res.statusCode, 401, 'Object query parameter must return 401');
        assert.strictEqual(res.nextCalled, false);
      });

      it('accepts correct query parameter ?pwd=Omemi', async () => {
        const res = await runMiddleware({ headers: {}, query: { pwd: VALID_PASSWORD } });
        assert.strictEqual(res.nextCalled, true);
      });
    });

    describe('Body Parameter req.body.pwd Permutations', () => {
      it('rejects non-string body types (numbers, booleans, objects) with HTTP 401', async () => {
        const badBodies = [
          { pwd: '' },
          { pwd: '   ' },
          { pwd: 12345 },
          { pwd: true },
          { pwd: false },
          { pwd: {} },
          { pwd: [VALID_PASSWORD] },
          { pwd: null }
        ];

        for (const b of badBodies) {
          const res = await runMiddleware({ headers: {}, query: {}, body: b });
          assert.strictEqual(res.statusCode, 401, `Expected 401 for body: ${JSON.stringify(b)}`);
          assert.strictEqual(res.nextCalled, false);
        }
      });

      it('accepts correct body parameter req.body.pwd', async () => {
        const res = await runMiddleware({ headers: {}, query: {}, body: { pwd: VALID_PASSWORD } });
        assert.strictEqual(res.nextCalled, true);
      });
    });

    describe('Precedence & Conflict Resolution', () => {
      it('prefers x-dashboard-password header over query param and rejects if header is empty', async () => {
        // Attacker sends empty header trying to bypass while providing query param
        const res = await runMiddleware({
          headers: { 'x-dashboard-password': '' },
          query: { pwd: VALID_PASSWORD }
        });
        assert.strictEqual(res.statusCode, 401, 'Empty header must take precedence and return 401');
        assert.strictEqual(res.nextCalled, false);
      });

      it('prefers x-dashboard-password header over query param and rejects if header is wrong', async () => {
        const res = await runMiddleware({
          headers: { 'x-dashboard-password': 'wrong' },
          query: { pwd: VALID_PASSWORD }
        });
        assert.strictEqual(res.statusCode, 401, 'Invalid header must take precedence and return 401');
        assert.strictEqual(res.nextCalled, false);
      });

      it('prefers Authorization header over query param and rejects if Bearer is wrong', async () => {
        const res = await runMiddleware({
          headers: { authorization: 'Bearer wrong' },
          query: { pwd: VALID_PASSWORD }
        });
        assert.strictEqual(res.statusCode, 401, 'Invalid Bearer must take precedence and return 401');
        assert.strictEqual(res.nextCalled, false);
      });
    });
  });

  // =========================================================================
  // Challenge 4: Exhaustive Route Audit — Strict HTTP 401 on All Protected Routes
  // =========================================================================
  describe('Challenge 4: Strict HTTP 401 Across All Protected Server Routes', () => {
    // Complete inventory of all administrative/protected routes in server.js
    const protectedRoutes = [
      { method: 'GET', path: '/api/admin/sessions' },
      { method: 'POST', path: '/api/sessions/test_sess_001/disconnect' },
      { method: 'POST', path: '/api/admin/sessions/test_sess_001/disconnect' },
      { method: 'DELETE', path: '/api/sessions/test_sess_001' },
      { method: 'DELETE', path: '/api/admin/sessions/test_sess_001' },
      { method: 'POST', path: '/api/sessions/restart-all' },
      { method: 'POST', path: '/api/admin/sessions/restart-all' },
      { method: 'GET', path: '/api/users' },
      { method: 'GET', path: '/api/user/2349161239200' },
      { method: 'GET', path: '/api/logs' },
      { method: 'POST', path: '/api/speedtest' },
      { method: 'GET', path: '/api/qrdata' },
      { method: 'POST', path: '/api/refresh-qr' },
      { method: 'POST', path: '/api/reset-session' },
      { method: 'GET', path: '/api/keys' },
      { method: 'POST', path: '/api/keys' },
      { method: 'GET', path: '/api/features' },
      { method: 'POST', path: '/api/features/toggle' },
      { method: 'GET', path: '/api/access' },
      { method: 'POST', path: '/api/access/add' },
      { method: 'POST', path: '/api/access/remove' },
      { method: 'POST', path: '/api/access/toggle-feature' },
      { method: 'POST', path: '/api/generate-access-key' },
      { method: 'POST', path: '/api/test-ai' },
      { method: 'POST', path: '/api/test' },
      { method: 'GET', path: '/api/reset-onboarding' },
      { method: 'GET', path: '/api/owner-check' }
    ];

    async function sendRequest(method, routePath, headers = {}, body = null) {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };
      if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        options.body = JSON.stringify(body);
      }
      return fetch(`${baseUrl}${routePath}`, options);
    }

    it('rejects unauthenticated requests without credentials with HTTP 401 across ALL protected routes', async () => {
      for (const route of protectedRoutes) {
        const res = await sendRequest(route.method, route.path);
        assert.strictEqual(
          res.status,
          401,
          `Route ${route.method} ${route.path} MUST return HTTP 401 when unauthenticated. Got: ${res.status}`
        );

        const data = await res.json();
        assert.strictEqual(data.success, false, `Route ${route.method} ${route.path} response must have success: false`);
        assert.ok(data.error, `Route ${route.method} ${route.path} response must contain error message`);
      }
    });

    it('rejects empty query parameter ?pwd= with HTTP 401 across ALL protected routes', async () => {
      for (const route of protectedRoutes) {
        const separator = route.path.includes('?') ? '&' : '?';
        const res = await sendRequest(route.method, `${route.path}${separator}pwd=`);
        assert.strictEqual(
          res.status,
          401,
          `Route ${route.method} ${route.path}?pwd= MUST return HTTP 401 on empty password. Got: ${res.status}`
        );
      }
    });

    it('rejects whitespace query parameter ?pwd=%20%20 with HTTP 401 across ALL protected routes', async () => {
      for (const route of protectedRoutes) {
        const separator = route.path.includes('?') ? '&' : '?';
        const res = await sendRequest(route.method, `${route.path}${separator}pwd=%20%20%20`);
        assert.strictEqual(
          res.status,
          401,
          `Route ${route.method} ${route.path}?pwd=whitespace MUST return HTTP 401. Got: ${res.status}`
        );
      }
    });

    it('rejects invalid password with HTTP 401 across ALL protected routes', async () => {
      for (const route of protectedRoutes) {
        const res = await sendRequest(route.method, route.path, {
          'x-dashboard-password': 'invalid_secret_attack_vector'
        });
        assert.strictEqual(
          res.status,
          401,
          `Route ${route.method} ${route.path} MUST return HTTP 401 on wrong password. Got: ${res.status}`
        );
      }
    });

    it('rejects invalid Bearer token with HTTP 401 across ALL protected routes', async () => {
      for (const route of protectedRoutes) {
        const res = await sendRequest(route.method, route.path, {
          Authorization: 'Bearer invalid_bearer_token'
        });
        assert.strictEqual(
          res.status,
          401,
          `Route ${route.method} ${route.path} MUST return HTTP 401 on invalid Bearer. Got: ${res.status}`
        );
      }
    });

    it('rejects HTTP Parameter Pollution (?pwd=wrong&pwd=Omemi) with HTTP 401', async () => {
      const res = await sendRequest('GET', `/api/admin/sessions?pwd=wrong&pwd=${VALID_PASSWORD}`);
      assert.strictEqual(res.status, 401, 'Polluted query parameter array must return 401');
    });
  });

  // =========================================================================
  // Challenge 5: Public Endpoints vs Dual-Mode /api/status Security
  // =========================================================================
  describe('Challenge 5: Public Endpoints & Dual-Mode Status Security', () => {
    it('allows unauthenticated access to public health endpoints without 401', async () => {
      const pingRes = await fetch(`${baseUrl}/ping`);
      assert.strictEqual(pingRes.status, 200);

      const healthRes = await fetch(`${baseUrl}/health`);
      assert.strictEqual(healthRes.status, 200);

      const statsRes = await fetch(`${baseUrl}/api/public-stats`);
      assert.strictEqual(statsRes.status, 200);
      const stats = await statsRes.json();
      assert.ok('activeBots' in stats, 'Public stats must contain activeBots');
    });

    it('public /api/status returns aggregate metrics ONLY without auth credentials', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      // Aggregate metrics are present
      assert.strictEqual(typeof data.activeBots, 'number');
      assert.strictEqual(typeof data.totalSessions, 'number');

      // Sensitive fields MUST NOT be present in unauthenticated response
      assert.strictEqual('recentMessages' in data, false, 'recentMessages must not leak in unauthenticated /api/status');
      assert.strictEqual('commandLog' in data, false, 'commandLog must not leak in unauthenticated /api/status');
      assert.strictEqual('botName' in data, false, 'botName must not leak in unauthenticated /api/status');
      assert.strictEqual('user' in data, false, 'bot user must not leak in unauthenticated /api/status');
      assert.strictEqual('prefix' in data, false, 'prefix must not leak in unauthenticated /api/status');
    });

    it('public /api/status with wrong password still returns aggregate metrics ONLY', async () => {
      const res = await fetch(`${baseUrl}/api/status?pwd=wrong_password`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual('recentMessages' in data, false);
      assert.strictEqual('commandLog' in data, false);
      assert.strictEqual('user' in data, false);
    });

    it('authenticated /api/status returns full dashboard metrics with masked user number', async () => {
      const res = await fetch(`${baseUrl}/api/status?pwd=${VALID_PASSWORD}`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      // Full admin dashboard metrics are present
      assert.ok('recentMessages' in data, 'recentMessages should be present for admin');
      assert.ok('commandLog' in data, 'commandLog should be present for admin');
      assert.ok('commands' in data, 'commands count should be present for admin');
    });
  });

  // =========================================================================
  // Challenge 6: Authenticated Administrative Access (Sanity & False-Positive Check)
  // =========================================================================
  describe('Challenge 6: Authenticated Access Validation (False-Positive Check)', () => {
    it('grants access to protected endpoints with valid x-dashboard-password header', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions`, {
        headers: { 'x-dashboard-password': VALID_PASSWORD }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 1);
      assert.ok(data[0].maskedPhone.includes('***'), 'Phone number in admin sessions must be masked');
    });

    it('grants access to protected endpoints with valid Authorization: Bearer token', async () => {
      const res = await fetch(`${baseUrl}/api/logs`, {
        headers: { Authorization: `Bearer ${VALID_PASSWORD}` }
      });
      assert.strictEqual(res.status, 200);
    });

    it('grants access to protected endpoints with valid ?pwd= query parameter', async () => {
      const res = await fetch(`${baseUrl}/api/features?pwd=${VALID_PASSWORD}`);
      assert.strictEqual(res.status, 200);
    });
  });
});
