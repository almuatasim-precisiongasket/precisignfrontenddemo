import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openDatabase, transaction } from './db';
import { hashPassword, verifyPassword, provisionUser, sessionLifetime, createSession, sessionUser } from './auth';
import { createApp } from './app';

const account = { email: 'worker@example.test', name: 'Test Worker', department: 'Test', role: 'Admin' as const, companyId: 'PEW' as const };
const password = 'Synthetic-test-password-123';

test('schema initializes empty, rolls back and persists accounts across reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'precisign-'));
  const path = join(directory, 'test.sqlite');
  let db = openDatabase(path);
  try {
    assert.equal(db.prepare('SELECT count(*) AS n FROM requests').get()!.n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get()!.n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM companies').get()!.n, 3);
    assert.throws(() => transaction(db, () => { db.prepare("UPDATE companies SET name='changed' WHERE id='PEW'").run(); throw new Error('rollback'); }));
    assert.equal(db.prepare("SELECT name FROM companies WHERE id='PEW'").get()!.name, 'Precision Engineering Works');
    const id = await provisionUser(db, account, password);
    const session = createSession(db, id);
    await assert.rejects(provisionUser(db, { ...account, email: ' WORKER@EXAMPLE.TEST ' }, password));
    await assert.rejects(provisionUser(db, { ...account, companyId: 'PEG' as any }, password));
    db.close(); db = openDatabase(path);
    assert.equal(sessionUser(db, session)?.id, id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get()!.n, 1);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 3);
  } finally { db.close(); rmSync(directory, { recursive: true }); }
});

test('HTTPS mode sets secure cookies and rejects insecure origin configuration', async () => {
  const db = openDatabase(':memory:');
  await assert.rejects(createApp(db, { origin: 'http://localhost:3000', secureCookies: true }));
  await provisionUser(db, account, password);
  const app = await createApp(db, { origin: 'https://precisign.example.test', secureCookies: true });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://precisign.example.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password }) });
    assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie')!, /; Secure/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});

test('password hashing is salted, bounded and verifies safely', async () => {
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second); assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
  await assert.rejects(hashPassword('short'));
  await assert.rejects(hashPassword('x'.repeat(1025)));
});

test('HTTP login, cookies, expiry, independent sessions, origin checks and logout', async () => {
  const db = openDatabase(':memory:');
  let now = Date.now();
  await provisionUser(db, account, password);
  const origin = 'http://localhost:3000';
  const app = await createApp(db, { origin, secureCookies: false, now: () => now, loginLimit: 5 });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const login = (body: unknown, requestOrigin = origin) => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
    assert.equal((await login({ email: account.email, password }, 'https://other.test')).status, 403);
    assert.equal((await login({ email: account.email, password: 'wrong' })).status, 401);
    const response = await login({ email: ' WORKER@EXAMPLE.TEST ', password });
    assert.equal(response.status, 200);
    const cookieHeader = response.headers.get('set-cookie')!;
    assert.match(cookieHeader, /HttpOnly/); assert.match(cookieHeader, /SameSite=Lax/);
    const cookie = cookieHeader.split(';')[0];
    const body = await response.text();
    assert.equal(/password|token_hash|scrypt/.test(body), false);
    const rawToken = cookie.split('=')[1];
    assert.notEqual(db.prepare('SELECT token_hash FROM sessions').get()!.token_hash, rawToken);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: 'precisign_session=%broken' } })).status, 401);
    const other = await login({ email: account.email, password });
    const otherCookie = other.headers.get('set-cookie')!.split(';')[0];
    const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
    assert.equal(logout.status, 204); assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: otherCookie } })).status, 200);
    now += sessionLifetime + 1;
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: otherCookie } })).status, 401);
    await login({ email: 'missing@example.test', password });
    await login({ email: 'missing@example.test', password });
    await login({ email: 'missing@example.test', password });
    await login({ email: 'missing@example.test', password });
    await login({ email: 'missing@example.test', password });
    assert.equal((await login({ email: account.email, password })).status, 429);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
