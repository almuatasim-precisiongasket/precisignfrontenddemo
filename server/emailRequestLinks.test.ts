import test from 'node:test';
import assert from 'node:assert/strict';
import { getAppPortalUrl } from './email/outboxStore';
import { parsePageRoute } from '../src/navigation/pageRoutes';

test('Task 2 — Request links in emails adhere to configuration precedence and security rules', async (t) => {
  const originalEnv = { ...process.env };

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  await t.test('1. PRECISIGN_EMAIL_APP_URL takes top precedence', () => {
    process.env.PRECISIGN_EMAIL_APP_URL = 'https://email.precisign.example.com';
    process.env.PRECISIGN_APP_URL = 'https://app.precisign.example.com';
    process.env.APP_ORIGIN = 'https://origin.precisign.example.com';
    process.env.NODE_ENV = 'development';

    const url = getAppPortalUrl('PEW-AP-2026-0001');
    assert.equal(url, 'https://email.precisign.example.com/requests/PEW-AP-2026-0001');

    const parsed = parsePageRoute(url);
    assert.equal(parsed.view, 'review-sign');
    assert.equal(parsed.requestId, 'PEW-AP-2026-0001');
  });

  await t.test('2. PRECISIGN_APP_URL takes precedence over APP_ORIGIN', () => {
    delete process.env.PRECISIGN_EMAIL_APP_URL;
    process.env.PRECISIGN_APP_URL = 'https://app.precisign.example.com';
    process.env.APP_ORIGIN = 'https://origin.precisign.example.com';
    process.env.NODE_ENV = 'development';

    const url = getAppPortalUrl('ICCL-CV-2026-0042');
    assert.equal(url, 'https://app.precisign.example.com/requests/ICCL-CV-2026-0042');
  });

  await t.test('3. APP_ORIGIN is used when email/app specific URLs are omitted', () => {
    delete process.env.PRECISIGN_EMAIL_APP_URL;
    delete process.env.PRECISIGN_APP_URL;
    process.env.APP_ORIGIN = 'https://origin.precisign.example.com';
    process.env.NODE_ENV = 'development';

    const url = getAppPortalUrl('FSG-EC-2026-0099');
    assert.equal(url, 'https://origin.precisign.example.com/requests/FSG-EC-2026-0099');
  });

  await t.test('4. Development defaults to http://127.0.0.1:3000 without localhost:5173 leak', () => {
    delete process.env.PRECISIGN_EMAIL_APP_URL;
    delete process.env.PRECISIGN_APP_URL;
    delete process.env.APP_ORIGIN;
    process.env.NODE_ENV = 'development';

    const url = getAppPortalUrl('PEW-123');
    assert.equal(url, 'http://127.0.0.1:3000/requests/PEW-123');
    assert.ok(!url.includes('5173'), 'Should not default to vite port 5173');
  });

  await t.test('5. Production rejects localhost or missing origins', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PRECISIGN_EMAIL_APP_URL;
    delete process.env.PRECISIGN_APP_URL;
    delete process.env.APP_ORIGIN;

    assert.throws(() => {
      getAppPortalUrl('PEW-123');
    }, /must be set/);

    process.env.APP_ORIGIN = 'http://localhost:3000';
    assert.throws(() => {
      getAppPortalUrl('PEW-123');
    }, /cannot link to local origin/);

    process.env.APP_ORIGIN = 'http://insecure-domain.example.com';
    assert.throws(() => {
      getAppPortalUrl('PEW-123');
    }, /must link to HTTPS/);

    process.env.APP_ORIGIN = 'https://portal.precisign.com';
    const validProdUrl = getAppPortalUrl('PEW-123');
    assert.equal(validProdUrl, 'https://portal.precisign.com/requests/PEW-123');
  });

  await t.test('6. Trailing slashes on origin are cleanly trimmed and ids encoded', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ORIGIN = 'https://portal.precisign.com///';

    const url = getAppPortalUrl('TEST-ID-SPECIAL#1');
    assert.equal(url, 'https://portal.precisign.com/requests/TEST-ID-SPECIAL%231');

    const parsed = parsePageRoute(url);
    assert.equal(parsed.view, 'review-sign');
    assert.equal(parsed.requestId, 'TEST-ID-SPECIAL#1');
  });
});

