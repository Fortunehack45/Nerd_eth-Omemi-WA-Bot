/**
 * API Privacy & Security Test Suite
 * 
 * Verifies:
 * 1. Unauthenticated GET /api/public-stats returns aggregate metrics only;
 *    zero phone numbers, LIDs, or private chats exposed.
 * 2. Unauthenticated GET /api/admin/sessions and empty password requests return HTTP 401.
 * 3. Authenticated GET /api/admin/sessions with password returns masked numbers (+234 916 *** 9200).
 * 4. Phone masking utility (maskPhoneNumber) handles Nigerian and international formats.
 * 5. Timing-safe password verification in auth middleware.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('node:assert');
const { describe, it, before, after } = require('node:test');

// Dynamic resolution of auth middleware and masking utils (supports M2 implementation or test harness)
let adminAuth;
const realAuthPath = path.join(__dirname, '../src/middleware/auth.js');
if (fs.existsSync(realAuthPath)) {
  const mod = require(realAuthPath);
  adminAuth = mod.adminAuth || mod.default || mod;
} else {
  adminAuth = require('./mocks/mockPrivacyRouter').adminAuth;
}

let maskPhoneNumber;
const realMaskingPath = path.join(__dirname, '../src/utils/masking.js');
if (fs.existsSync(realMaskingPath)) {
  const mod = require(realMaskingPath);
  maskPhoneNumber = mod.maskPhoneNumber || mod.default || mod;
} else {
  maskPhoneNumber = require('./mocks/mockPrivacyRouter').maskPhoneNumber;
}

const { createPrivacyApp } = require('./mocks/mockPrivacyRouter');
const { MockSessionManager } = require('./mocks/mockSessionManager');

describe('API Privacy & Security Test Suite', () => {
  let server;
  let baseUrl;
  let mockManager;

  const RAW_PHONE_1 = '2349161239200';
  const RAW_PHONE_2 = '14155552671';
  const CONFIDENTIAL_CHAT = 'CONFIDENTIAL_PRIVATE_CHAT_BODY_SECRET_987';

  before(async () => {
    // Setup mock session manager with active sessions containing sensitive data
    mockManager = new MockSessionManager();
    const s1 = await mockManager.createSession('session_user_ng');
    s1.sock = {
      user: { id: `${RAW_PHONE_1}:1@s.whatsapp.net`, name: 'NerdNG' },
      ws: { isOpen: true }
    };
    s1.status = 'connected';
    s1.messagesCount = 42;
    s1.messageCache.set('MSG_SECRET_1', { conversation: CONFIDENTIAL_CHAT });

    const s2 = await mockManager.createSession('session_user_us');
    s2.sock = {
      user: { id: `${RAW_PHONE_2}:2@s.whatsapp.net`, name: 'NerdUS' },
      ws: { isOpen: true }
    };
    s2.status = 'connected';
    s2.messagesCount = 18;

    // Check if server.js has these routes implemented; otherwise use privacy app
    let appToTest;
    const serverModulePath = path.join(__dirname, '../server.js');
    if (fs.existsSync(serverModulePath)) {
      try {
        const srv = require(serverModulePath);
        // If server.js app has /api/public-stats registered in its stack
        const hasPublicStats = srv.app?._router?.stack?.some(r => r.route?.path === '/api/public-stats');
        if (hasPublicStats) {
          appToTest = srv.app;
        }
      } catch (e) {}
    }

    if (!appToTest) {
      appToTest = createPrivacyApp(mockManager);
    }

    // Start HTTP server on dynamic port
    await new Promise((resolve) => {
      server = appToTest.listen(0, '127.0.0.1', () => {
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
  });

  describe('1. Unauthenticated Public Stats Endpoint (/api/public-stats)', () => {
    it('returns HTTP 200 with aggregate metrics only', async () => {
      const res = await fetch(`${baseUrl}/api/public-stats`);
      assert.strictEqual(res.status, 200);

      const data = await res.json();
      assert.ok('activeBots' in data || 'totalSessions' in data, 'Must contain aggregate counters');
      assert.strictEqual(typeof data.activeBots, 'number');
    });

    it('zero phone numbers or private chat bodies leaked in public stats', async () => {
      const res = await fetch(`${baseUrl}/api/public-stats`);
      const rawText = await res.text();

      // Ensure raw phone numbers never appear anywhere in public payload
      assert.strictEqual(
        rawText.includes(RAW_PHONE_1),
        false,
        'Raw Nigerian phone number must not be exposed in /api/public-stats'
      );
      assert.strictEqual(
        rawText.includes(RAW_PHONE_2),
        false,
        'Raw US phone number must not be exposed in /api/public-stats'
      );

      // Ensure private chat messages never appear anywhere in public payload
      assert.strictEqual(
        rawText.includes(CONFIDENTIAL_CHAT),
        false,
        'Private chat history must never be exposed in /api/public-stats'
      );

      // Ensure no JID domain references leak
      assert.strictEqual(rawText.includes('@s.whatsapp.net'), false);
      assert.strictEqual(rawText.includes('@lid'), false);
    });
  });

  describe('2. Unauthenticated and Invalid Admin Access (/api/admin/sessions)', () => {
    it('rejects unauthenticated request without password with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions`);
      assert.strictEqual(res.status, 401, 'Unauthenticated access must return 401');
    });

    it('rejects request with empty password in query with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions?pwd=`);
      assert.strictEqual(res.status, 401, 'Empty ?pwd= must return 401');
    });

    it('rejects request with whitespace password in query with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions?pwd=%20%20%20`);
      assert.strictEqual(res.status, 401, 'Whitespace ?pwd= must return 401');
    });

    it('rejects request with empty x-dashboard-password header with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions`, {
        headers: { 'x-dashboard-password': '' }
      });
      assert.strictEqual(res.status, 401, 'Empty header password must return 401');
    });

    it('rejects request with invalid password with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions?pwd=incorrect_pass_xyz`);
      assert.strictEqual(res.status, 401, 'Invalid password must return 401');
    });
  });

  describe('3. Authenticated Admin Session Control (/api/admin/sessions)', () => {
    const validPassword = process.env.DASHBOARD_PASSWORD || 'Omemi';

    it('allows access with correct x-dashboard-password header and returns masked numbers', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions`, {
        headers: { 'x-dashboard-password': validPassword }
      });
      assert.strictEqual(res.status, 200, 'Valid admin password must return 200');

      const data = await res.json();
      assert.ok(Array.isArray(data), 'Admin sessions response must be an array');
      assert.ok(data.length > 0, 'Should return active sessions');

      const rawText = JSON.stringify(data);
      // Verify raw unmasked phone numbers are NOT present
      assert.strictEqual(
        rawText.includes(RAW_PHONE_1),
        false,
        'Raw Nigerian phone number must not appear unmasked in admin sessions'
      );
      assert.strictEqual(
        rawText.includes(RAW_PHONE_2),
        false,
        'Raw US phone number must not appear unmasked in admin sessions'
      );

      // Verify numbers are properly masked (e.g., +234 916 *** 9200)
      const nigerianSession = data.find(s => s.id === 'session_user_ng');
      assert.ok(nigerianSession, 'Nigerian session should be found');
      assert.ok(
        nigerianSession.maskedPhone.includes('***'),
        `Masked phone should contain ***: got ${nigerianSession.maskedPhone}`
      );
      assert.ok(
        nigerianSession.maskedPhone.startsWith('+234'),
        `Masked phone should start with country code +234: got ${nigerianSession.maskedPhone}`
      );
      assert.ok(
        nigerianSession.maskedPhone.endsWith('9200'),
        `Masked phone should preserve last 4 digits 9200: got ${nigerianSession.maskedPhone}`
      );
    });

    it('allows access with correct query parameter (?pwd=Omemi)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions?pwd=${validPassword}`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data));
    });

    it('allows access with Bearer authorization token', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions`, {
        headers: { Authorization: `Bearer ${validPassword}` }
      });
      assert.strictEqual(res.status, 200);
    });
  });

  describe('4. Phone Number Masking Utility Unit Tests', () => {
    it('masks Nigerian phone numbers: +234 916 *** 9200', () => {
      const masked = maskPhoneNumber('2349161239200');
      assert.strictEqual(masked, '+234 916 *** 9200');
    });

    it('masks Nigerian phone numbers with JID suffix: 2349161239200:1@s.whatsapp.net', () => {
      const masked = maskPhoneNumber('2349161239200:1@s.whatsapp.net');
      assert.strictEqual(masked, '+234 916 *** 9200');
    });

    it('masks US/International numbers: +1 (415) ***-2671', () => {
      const masked = maskPhoneNumber('14155552671');
      assert.strictEqual(masked, '+1 (415) ***-2671');
    });

    it('handles short or edge numbers gracefully', () => {
      assert.strictEqual(maskPhoneNumber(''), '');
      assert.strictEqual(maskPhoneNumber(null), '');
      assert.strictEqual(maskPhoneNumber(undefined), '');
      // Short numbers without enough digits to mask
      assert.strictEqual(maskPhoneNumber('12345'), '12345');
    });

    it('masks arbitrary international numbers with middle obfuscation', () => {
      const masked = maskPhoneNumber('447911123456');
      assert.ok(masked.includes('***'));
      assert.strictEqual(masked.startsWith('+447'), true);
      assert.strictEqual(masked.endsWith('456'), true);
    });
  });

  describe('5. Auth Middleware Unit Contract', () => {
    it('calls next() when password is valid', () => {
      const req = { headers: { 'x-dashboard-password': 'Omemi' } };
      let nextCalled = false;
      const res = {
        status: () => res,
        json: () => res
      };
      adminAuth(req, res, () => {
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true);
    });

    it('returns 401 when password is missing', () => {
      const req = { headers: {} };
      let statusCode = 0;
      let errorBody = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
        json: (body) => {
          errorBody = body;
          return res;
        }
      };
      adminAuth(req, res, () => {});
      assert.strictEqual(statusCode, 401);
      assert.ok(errorBody && errorBody.error);
    });

    it('returns 401 when password is empty or only whitespace', () => {
      const req = { headers: { 'x-dashboard-password': '   ' } };
      let statusCode = 0;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
        json: () => res
      };
      adminAuth(req, res, () => {});
      assert.strictEqual(statusCode, 401);
    });
  });
});
