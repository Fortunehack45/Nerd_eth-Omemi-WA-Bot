/**
 * Adversarial Privacy Leakage & Phone Masking Stress Test Suite
 * 
 * Conducted by Challenger M2-2 to empirically challenge:
 * 1. maskPhoneNumber with 50+ variations of phone numbers (Nigerian, US, UK, international,
 *    companion devices :1/:2, @lid JIDs, @s.whatsapp.net JIDs, invalid/short strings, null/undefined,
 *    and double-masking idempotency).
 * 2. Unauthenticated GET /api/public-stats and GET /api/status never leak raw telephone numbers,
 *    LIDs, remote JIDs, or private chat message bodies under any simulated state.
 * 3. Public SSE GET /api/pair/stream eavesdropping vulnerability for unauthenticated listeners.
 * 4. Admin GET /api/admin/sessions strictly delivers masked numbers (+234 916 *** 9200).
 */

const fs = require('fs');
const path = require('path');
const assert = require('node:assert');
const { describe, it, before, after } = require('node:test');

const { maskPhoneNumber } = require('../src/utils/masking');
const { app, setSessionManager, logMessage, logCommand, botStatus } = require('../server');
const { MockSessionManager } = require('./mocks/mockSessionManager');

const VALID_PASSWORD = process.env.DASHBOARD_PASSWORD || 'Omemi';
const RAW_NG_PHONE = '2349161239200';
const RAW_US_PHONE = '14155552671';
const RAW_UK_PHONE = '447911123456';
const RAW_LID = '123456789012345';
const SECRET_CHAT_MSG = 'SUPER_SECRET_CHAT_CONFIDENTIAL_PAYLOAD_999';

describe('Empirical Privacy & Masking Challenger Test Suite (challenger_m2_2)', () => {
  let server;
  let baseUrl;
  let mockManager;

  before(async () => {
    // 1. Configure MockSessionManager with multi-tenant active sessions containing sensitive data
    mockManager = new MockSessionManager();

    const s1 = await mockManager.createSession('session_user_ng');
    s1.phoneNumber = RAW_NG_PHONE;
    s1.sock = {
      user: { id: `${RAW_NG_PHONE}:1@s.whatsapp.net`, name: 'NerdNG' },
      ws: { isOpen: true }
    };
    s1.status = 'connected';
    s1.messagesCount = 25;
    s1.messageCache.set('MSG_001', { conversation: SECRET_CHAT_MSG });

    const s2 = await mockManager.createSession('session_user_us');
    s2.phoneNumber = RAW_US_PHONE;
    s2.sock = {
      user: { id: `${RAW_US_PHONE}:2@s.whatsapp.net`, name: 'NerdUS' },
      ws: { isOpen: true }
    };
    s2.status = 'connected';
    s2.messagesCount = 14;

    const s3 = await mockManager.createSession('session_user_lid');
    s3.phoneNumber = RAW_LID;
    s3.sock = {
      user: { id: `${RAW_LID}:1@lid`, name: 'NerdLID' },
      ws: { isOpen: true }
    };
    s3.status = 'connected';
    s3.messagesCount = 5;

    // Inject mockManager into server
    setSessionManager(mockManager);

    // Populate server-level botStatus, recentMessages, commandLog
    botStatus.connected = true;
    botStatus.user = `${RAW_NG_PHONE}:1@s.whatsapp.net`;
    logMessage(`${RAW_NG_PHONE}@s.whatsapp.net`, SECRET_CHAT_MSG, 'text');
    logCommand('!ai test', `${RAW_NG_PHONE}@s.whatsapp.net`, 'ok');

    // Bind server to ephemeral port
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
  });

  // =========================================================================
  // Challenge 1: 50+ Variations of maskPhoneNumber
  // =========================================================================
  describe('Challenge 1: maskPhoneNumber with 50+ variations', () => {
    const testCases = [
      // Nigerian 13-digit standard (+234 916 *** 9200)
      { input: '2349161239200', expected: '+234 916 *** 9200', desc: '1. Nigerian standard 13 digits' },
      { input: '+2349161239200', expected: '+234 916 *** 9200', desc: '2. Nigerian with plus prefix' },
      { input: '+234 916 123 9200', expected: '+234 916 *** 9200', desc: '3. Nigerian with spaces' },
      { input: '234-916-123-9200', expected: '+234 916 *** 9200', desc: '4. Nigerian with hyphens' },
      { input: '+234 (916) 123-9200', expected: '+234 916 *** 9200', desc: '5. Nigerian with parens' },
      { input: '2348031234567', expected: '+234 803 *** 4567', desc: '6. Nigerian MTN 234803...' },
      { input: '2347012345678', expected: '+234 701 *** 5678', desc: '7. Nigerian Airtel 234701...' },
      { input: '2348123456789', expected: '+234 812 *** 6789', desc: '8. Nigerian 234812...' },
      { input: '2349098765432', expected: '+234 909 *** 5432', desc: '9. Nigerian 9mobile 234909...' },
      { input: '2348000000000', expected: '+234 800 *** 0000', desc: '10. Nigerian all zeroes suffix' },
      { input: '2349999999999', expected: '+234 999 *** 9999', desc: '11. Nigerian all nines suffix' },

      // Nigerian local 11-digit (080..., 091...)
      { input: '08031234567', expected: '+234 803 *** 4567', desc: '12. Nigerian local 0803...' },
      { input: '09161239200', expected: '+234 916 *** 9200', desc: '13. Nigerian local 0916...' },
      { input: '07012345678', expected: '+234 701 *** 5678', desc: '14. Nigerian local 0701...' },
      { input: '08123456789', expected: '+234 812 *** 6789', desc: '15. Nigerian local 0812...' },
      { input: '09098765432', expected: '+234 909 *** 5432', desc: '16. Nigerian local 0909...' },
      { input: '080-312-34567', expected: '+234 803 *** 4567', desc: '17. Nigerian local hyphenated' },

      // US/North America 11-digit (+1 (415) ***-2671)
      { input: '14155552671', expected: '+1 (415) ***-2671', desc: '18. US 11-digit standard' },
      { input: '+14155552671', expected: '+1 (415) ***-2671', desc: '19. US with plus prefix' },
      { input: '+1 (415) 555-2671', expected: '+1 (415) ***-2671', desc: '20. US formatted string' },
      { input: '12125550199', expected: '+1 (212) ***-0199', desc: '21. US NYC area code 212' },
      { input: '18005551234', expected: '+1 (800) ***-1234', desc: '22. US toll free 800' },
      { input: '13105559876', expected: '+1 (310) ***-9876', desc: '23. US LA area code 310' },

      // UK & International numbers
      { input: '447911123456', expected: '+447 *** 456', desc: '24. UK standard 447911...' },
      { input: '+447911123456', expected: '+447 *** 456', desc: '25. UK with plus' },
      { input: '+44 7911 123456', expected: '+447 *** 456', desc: '26. UK spaced' },
      { input: '33612345678', expected: '+336 *** 678', desc: '27. France mobile +33' },
      { input: '4915123456789', expected: '+491 *** 789', desc: '28. Germany mobile +49' },
      { input: '919876543210', expected: '+919 *** 210', desc: '29. India mobile +91' },
      { input: '8613800138000', expected: '+861 *** 000', desc: '30. China mobile +86' },
      { input: '819012345678', expected: '+819 *** 678', desc: '31. Japan mobile +81' },
      { input: '61412345678', expected: '+614 *** 678', desc: '32. Australia mobile +61' },
      { input: '5511987654321', expected: '+551 *** 321', desc: '33. Brazil mobile +55' },
      { input: '27821234567', expected: '+278 *** 567', desc: '34. South Africa +27' },
      { input: '233241234567', expected: '+233 *** 567', desc: '35. Ghana mobile +233' },
      { input: '254712345678', expected: '+254 *** 678', desc: '36. Kenya mobile +254' },

      // Companion devices & WhatsApp JIDs
      { input: '2349161239200:1', expected: '+234 916 *** 9200', desc: '37. Companion :1 suffix' },
      { input: '2349161239200:2', expected: '+234 916 *** 9200', desc: '38. Companion :2 suffix' },
      { input: '2349161239200:99', expected: '+234 916 *** 9200', desc: '39. Companion :99 suffix' },
      { input: '2349161239200:1@s.whatsapp.net', expected: '+234 916 *** 9200', desc: '40. Nigerian JID with device :1' },
      { input: '2349161239200:2@s.whatsapp.net', expected: '+234 916 *** 9200', desc: '41. Nigerian JID with device :2' },
      { input: '2349161239200@s.whatsapp.net', expected: '+234 916 *** 9200', desc: '42. Nigerian JID without device' },
      { input: '14155552671:1@s.whatsapp.net', expected: '+1 (415) ***-2671', desc: '43. US JID with device :1' },
      { input: '447911123456:2@s.whatsapp.net', expected: '+447 *** 456', desc: '44. UK JID with device :2' },
      { input: '123456789012345@lid', expected: '+123 *** 345', desc: '45. LID JID' },
      { input: '987654321012345:1@lid', expected: '+987 *** 345', desc: '46. LID JID with device :1' },
      { input: '551234567890123:2@lid', expected: '+551 *** 123', desc: '47. LID JID with device :2' },

      // Invalid, empty, and edge cases
      { input: '', expected: '', desc: '48. Empty string' },
      { input: '   ', expected: '', desc: '49. Whitespace string' },
      { input: null, expected: '', desc: '50. null' },
      { input: undefined, expected: '', desc: '51. undefined' },
      { input: 2349161239200, expected: '+234 916 *** 9200', desc: '52. Raw number type' },
      { input: '12345', expected: '12345', desc: '53. Short number 5 digits (<7)' },
      { input: '123456', expected: '123456', desc: '54. Short number 6 digits (<7)' },
      { input: '0', expected: '0', desc: '55. Single digit 0' },
      { input: 'alphanumeric_test', expected: 'alphanumeric_test', desc: '56. Non-digits string' },
      { input: ':1@s.whatsapp.net', expected: '', desc: '57. Bare device + domain' },
    ];

    for (const tc of testCases) {
      it(tc.desc, () => {
        const result = maskPhoneNumber(tc.input);
        assert.strictEqual(result, tc.expected, `Mismatch for input: ${tc.input}`);
      });
    }

    // Challenge 1.B: Idempotency & Double-Masking Defect Detection
    it('58. Idempotency test: maskPhoneNumber on already masked Nigerian number', () => {
      const maskedOnce = maskPhoneNumber('2349161239200');
      assert.strictEqual(maskedOnce, '+234 916 *** 9200');
      
      const maskedTwice = maskPhoneNumber(maskedOnce);
      // If maskPhoneNumber is NOT idempotent, +234 916 *** 9200 becomes +234 *** 200
      assert.strictEqual(
        maskedTwice,
        '+234 916 *** 9200',
        `IDEMPOTENCY FAILED: maskPhoneNumber('${maskedOnce}') returned '${maskedTwice}' instead of keeping '${maskedOnce}'`
      );
    });

    it('59. Idempotency test: maskPhoneNumber on already masked US number', () => {
      const maskedOnce = maskPhoneNumber('14155552671');
      assert.strictEqual(maskedOnce, '+1 (415) ***-2671');
      
      const maskedTwice = maskPhoneNumber(maskedOnce);
      assert.strictEqual(
        maskedTwice,
        '+1 (415) ***-2671',
        `IDEMPOTENCY FAILED: maskPhoneNumber('${maskedOnce}') returned '${maskedTwice}' instead of keeping '${maskedOnce}'`
      );
    });
  });

  // =========================================================================
  // Challenge 2: Unauthenticated Privacy Leakage Stress
  // =========================================================================
  describe('Challenge 2: Unauthenticated GET /api/public-stats and GET /api/status', () => {
    it('GET /api/public-stats returns HTTP 200 and zero sensitive information', async () => {
      const res = await fetch(`${baseUrl}/api/public-stats`);
      assert.strictEqual(res.status, 200);
      const rawText = await res.text();

      // Check for phone numbers
      assert.strictEqual(rawText.includes(RAW_NG_PHONE), false, 'Must not contain raw Nigerian phone');
      assert.strictEqual(rawText.includes(RAW_US_PHONE), false, 'Must not contain raw US phone');
      assert.strictEqual(rawText.includes(RAW_LID), false, 'Must not contain raw LID');

      // Check for private chat message bodies
      assert.strictEqual(rawText.includes(SECRET_CHAT_MSG), false, 'Must not contain private chat message body');

      // Check for JID domains
      assert.strictEqual(rawText.includes('@s.whatsapp.net'), false, 'Must not contain @s.whatsapp.net');
      assert.strictEqual(rawText.includes('@lid'), false, 'Must not contain @lid');
    });

    it('GET /api/status without credentials returns aggregate metrics only and zero leaks', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      assert.strictEqual(res.status, 200);
      const rawText = await res.text();

      assert.strictEqual(rawText.includes(RAW_NG_PHONE), false, 'Must not contain raw Nigerian phone');
      assert.strictEqual(rawText.includes(RAW_US_PHONE), false, 'Must not contain raw US phone');
      assert.strictEqual(rawText.includes(RAW_LID), false, 'Must not contain raw LID');
      assert.strictEqual(rawText.includes(SECRET_CHAT_MSG), false, 'Must not contain private chat body');
      assert.strictEqual(rawText.includes('@s.whatsapp.net'), false, 'Must not contain @s.whatsapp.net');
      assert.strictEqual(rawText.includes('@lid'), false, 'Must not contain @lid');

      const json = JSON.parse(rawText);
      assert.strictEqual('recentMessages' in json, false, 'Must not contain recentMessages');
      assert.strictEqual('commandLog' in json, false, 'Must not contain commandLog');
      assert.strictEqual('user' in json, false, 'Must not contain user field');
    });

    it('GET /api/status with empty/whitespace/invalid password remains unauthenticated', async () => {
      const queries = ['?pwd=', '?pwd=%20%20', '?pwd=incorrect_password_xyz'];
      for (const q of queries) {
        const res = await fetch(`${baseUrl}/api/status${q}`);
        assert.strictEqual(res.status, 200);
        const rawText = await res.text();

        assert.strictEqual(rawText.includes(RAW_NG_PHONE), false);
        assert.strictEqual(rawText.includes(SECRET_CHAT_MSG), false);
        const json = JSON.parse(rawText);
        assert.strictEqual('recentMessages' in json, false);
      }
    });
  });

  // =========================================================================
  // Challenge 3: Public SSE Stream Eavesdropping Vulnerability
  // =========================================================================
  describe('Challenge 3: Public SSE GET /api/pair/stream Eavesdropping Challenge', () => {
    it('checks if an unauthenticated client on /api/pair/stream eavesdrops on other users', async () => {
      // Connect to SSE stream WITHOUT sessionId
      const controller = new AbortController();
      let streamData = '';

      const streamPromise = fetch(`${baseUrl}/api/pair/stream`, {
        signal: controller.signal
      }).then(async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            streamData += decoder.decode(value, { stream: true });
            if (streamData.includes('VICTIM_SECRET_PHONE_2348000000001')) {
              break;
            }
          }
        } catch (e) {}
      });

      // Allow connection to establish
      await new Promise((r) => setTimeout(r, 200));

      // Victim requests pairing code on the platform
      mockManager.emit('session.pairingCode', {
        sessionId: 'victim_session_123',
        code: '9999-8888',
        phoneNumber: 'VICTIM_SECRET_PHONE_2348000000001'
      });

      // Wait a short duration for transmission
      await new Promise((r) => setTimeout(r, 300));
      controller.abort();
      await streamPromise.catch(() => {});

      // ASSERTION: An unauthenticated stream listener WITHOUT a sessionId MUST NOT receive other users' phone numbers!
      assert.strictEqual(
        streamData.includes('VICTIM_SECRET_PHONE_2348000000001'),
        false,
        'CRITICAL PRIVACY LEAK: Unauthenticated /api/pair/stream broadcasted another user\'s raw phone number and pairing code to an unparameterized listener!'
      );
    });
  });

  // =========================================================================
  // Challenge 4: Admin GET /api/admin/sessions Phone Masking Exact Format
  // =========================================================================
  describe('Challenge 4: Admin GET /api/admin/sessions Phone Masking', () => {
    it('strictly delivers masked numbers in exact format (+234 916 *** 9200)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/sessions`, {
        headers: { 'x-dashboard-password': VALID_PASSWORD }
      });
      assert.strictEqual(res.status, 200);

      const sessions = await res.json();
      assert.ok(Array.isArray(sessions));
      assert.ok(sessions.length >= 3, 'Must have populated sessions');

      const ngSession = sessions.find(s => s.id === 'session_user_ng');
      assert.ok(ngSession, 'Nigerian session must exist');

      // Requirement: Strictly delivers masked numbers (+234 916 *** 9200)
      assert.strictEqual(
        ngSession.maskedPhone,
        '+234 916 *** 9200',
        `Admin sessions maskedPhone FORMAT DEFECT: expected '+234 916 *** 9200', but received '${ngSession.maskedPhone}'`
      );

      const usSession = sessions.find(s => s.id === 'session_user_us');
      assert.ok(usSession, 'US session must exist');
      assert.strictEqual(
        usSession.maskedPhone,
        '+1 (415) ***-2671',
        `Admin sessions US maskedPhone FORMAT DEFECT: expected '+1 (415) ***-2671', but received '${usSession.maskedPhone}'`
      );
    });
  });
});
