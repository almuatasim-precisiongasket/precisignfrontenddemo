import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, transaction } from './db';
import { hashPassword, verifyPassword, provisionUser, sessionLifetime, createSession, sessionUser } from './auth';
import { createApp } from './app';

const account = { email: 'worker@example.test', name: 'Test Worker', department: 'Test', role: 'Admin' as const, companyId: 'PEW' as const };
const password = 'Synthetic-test-password-123';

test('temporary password sessions are restricted and password changes revoke all sessions', async () => {
  const db = openDatabase(':memory:');
  const userId = await provisionUser(db, account, password);
  db.prepare('INSERT INTO account_access (user_id, must_change_password) VALUES (?, 1)').run(userId);
  const otherToken = createSession(db, userId);
  const origin = 'http://localhost:3000';
  const app = await createApp(db, { origin, secureCookies: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const post = (path: string, body: unknown, cookie = '') => fetch(base + path, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  });
  try {
    const login = await post('/auth/login', { email: account.email, password });
    assert.equal(login.status, 200);
    assert.equal((await login.clone().json()).user.mustChangePassword, true);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    for (const path of ['/bootstrap', '/requests', '/drafts/PEW/Admin%20Work%20Request', '/admin/accounts']) {
      assert.equal((await fetch(base + path, { headers: { Cookie: cookie } })).status, 403);
    }
    assert.equal((await post('/requests/some-id/document-pdf', {}, cookie)).status, 403);
    assert.equal((await post('/requests/some-id/approve', {}, cookie)).status, 403);
    assert.equal((await fetch(base + '/me/signature', { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await post('/auth/change-password', { currentPassword: 'wrong', newPassword: 'Different-password-123' }, cookie)).status, 403);
    assert.equal((await post('/auth/change-password', { currentPassword: password, newPassword: 'Different-password-123' }, cookie)).status, 204);
    assert.equal(sessionUser(db, otherToken), null);
    assert.equal((await fetch(base + '/auth/me', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await post('/auth/login', { email: account.email, password })).status, 401);
    assert.equal((await post('/auth/login', { email: account.email, password: 'Different-password-123' })).status, 200);
    db.prepare('UPDATE account_access SET is_disabled=1 WHERE user_id=?').run(userId);
    assert.equal((await post('/auth/login', { email: account.email, password: 'Different-password-123' })).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});

test('signup creates a private zero-grant account and stores an optional signature', async () => {
  const db = openDatabase(':memory:');
  const legacyId = await provisionUser(db, account, password);
  const legacyCookie = `precisign_session=${createSession(db, legacyId)}`;
  const origin = 'http://localhost:3000';
  const app = await createApp(db, { origin, secureCookies: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const post = (path: string, body: unknown, cookie = '') => fetch(base + path, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  });
  const mark = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
  const input = { name: 'New Worker', email: ' New@Example.test ', department: 'Test', password, signatureDataUrl: mark };
  try {
    assert.equal((await post('/auth/signup', { ...input, role: 'Director' })).status, 400);
    assert.equal((await post('/auth/signup', { ...input, password: 'short' })).status, 400);
    assert.equal((await post('/auth/signup', { ...input, signatureDataUrl: 'invalid' })).status, 400);
    assert.equal((await post('/auth/signup', input)).status, 204);
    assert.equal((await post('/auth/signup', { ...input, email: 'new@example.test' })).status, 409);
    assert.equal((await post('/auth/signup', { ...input, email: 'another@example.test', signatureDataUrl: undefined })).status, 204);
    const login = await post('/auth/login', { email: 'new@example.test', password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const get = (path: string, value = cookie) => fetch(base + path, { headers: { Cookie: value } });
    const bootstrap = await (await get('/bootstrap')).json();
    assert.deepEqual(bootstrap.user.companyGrants, []);
    assert.deepEqual(bootstrap.companies, []);
    assert.deepEqual(bootstrap.users, []);
    assert.deepEqual(bootstrap.workflows, []);
    assert.equal(bootstrap.user.signatureDataUrl, mark);
    assert.deepEqual(await (await get('/requests')).json(), []);
    assert.equal((await get('/drafts/PEW/Admin%20Work%20Request')).status, 403);
    assert.equal((await post('/requests', { companyId: 'PEW', formType: 'IT Request' }, cookie)).status, 403);
    const legacy = await (await get('/bootstrap', legacyCookie)).json();
    assert.equal(legacy.users.some((user: { email: string }) => user.email === 'new@example.test'), false);
    assert.equal((await post('/auth/logout', {}, cookie)).status, 204);
    assert.equal((await get('/auth/me')).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});

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
    assert.throws(() => transaction(db, () => {
      db.exec("INSERT OR ROLLBACK INTO companies VALUES ('PEW', 'duplicate')");
    }), { code: 'ERR_SQLITE_ERROR', errcode: 1555 });
    const id = await provisionUser(db, account, password);
    const session = createSession(db, id);
    await assert.rejects(provisionUser(db, { ...account, email: ' WORKER@EXAMPLE.TEST ' }, password));
    await assert.rejects(provisionUser(db, { ...account, companyId: 'PEG' as any }, password));
    db.close(); db = openDatabase(path);
    assert.equal(sessionUser(db, session)?.id, id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get()!.n, 1);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 8);
  } finally { db.close(); rmSync(directory, { recursive: true }); }
});

test('a failed upgrade rolls back every pending migration and can be retried', () => {
  const directory = mkdtempSync(join(tmpdir(), 'precisign-'));
  const path = join(directory, 'migration.sqlite');
  const setup = openDatabase(path);
  setup.exec(`DROP TABLE password_resets; DROP VIEW account_profiles; DROP TABLE account_access; DROP TABLE route_administrators;
    PRAGMA user_version = 2;
    CREATE TRIGGER fail_upgrade BEFORE UPDATE ON companies BEGIN
      SELECT RAISE(ABORT, 'synthetic migration failure');
    END;`);
  setup.close();
  try {
    assert.throws(() => openDatabase(path), /synthetic migration failure/);
    const inspect = new DatabaseSync(path);
    try {
      assert.equal(inspect.prepare('PRAGMA user_version').get()!.user_version, 2);
      assert.equal(inspect.prepare("SELECT name FROM sqlite_schema WHERE name='route_administrators'").get(), undefined);
      inspect.exec('DROP TRIGGER fail_upgrade');
    } finally { inspect.close(); }
    const upgraded = openDatabase(path);
    try {
      assert.equal(upgraded.prepare('PRAGMA user_version').get()!.user_version, 8);
      assert.ok(upgraded.prepare("SELECT name FROM sqlite_schema WHERE name='route_administrators'").get());
    } finally { upgraded.close(); }
  } finally { rmSync(directory, { recursive: true }); }
});

test('version-four migration keeps legacy accounts and grants', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'precisign-migration-'));
  const path = join(directory, 'legacy.sqlite');
  let db = openDatabase(path);
  try {
    const id = await provisionUser(db, { ...account, allowedCompanyIds: ['ICCL'] }, password);
    db.exec('DROP TABLE password_resets; DROP VIEW account_profiles; DROP TABLE account_access; PRAGMA user_version=4');
    db.close();
    db = openDatabase(path);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 8);
    const token = createSession(db, id);
    const user = sessionUser(db, token);
    assert.equal(user?.id, id);
    assert.equal(user?.companyGrants, undefined);
    assert.deepEqual(user?.allowedCompanyIds, ['ICCL']);
  } finally {
    db.close();
    rmSync(directory, { recursive: true });
  }
});

test('API reports SQLite write contention and leaves the request safe to retry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'precisign-'));
  const path = join(directory, 'contention.sqlite');
  const db = openDatabase(path);
  const blocker = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 0');
  const user = await provisionUser(db, account, password);
  const token = createSession(db, user);
  const origin = 'http://localhost:3000';
  const app = await createApp(db, { origin, secureCookies: false });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/auth/logout`;
  const logout = () => fetch(url, { method: 'POST', headers: { Origin: origin, Cookie: `precisign_session=${token}` } });
  try {
    blocker.exec('BEGIN IMMEDIATE');
    const busy = await logout();
    assert.equal(busy.status, 503);
    assert.equal(busy.headers.get('retry-after'), '1');
    assert.equal((await busy.json()).error, 'Storage is temporarily busy. Try again shortly.');
    assert.equal(sessionUser(db, token)?.id, user);
    blocker.exec('ROLLBACK');
    assert.equal((await logout()).status, 204);
    assert.equal(sessionUser(db, token), null);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    blocker.close();
    db.close();
    rmSync(directory, { recursive: true });
  }
});

test('HTTPS mode sets secure cookies and rejects insecure origin configuration', async () => {
  const db = openDatabase(':memory:');
  await assert.rejects(createApp(db, { origin: 'http://localhost:3000', secureCookies: true }));
  const userId = await provisionUser(db, account, password);
  db.prepare('INSERT INTO route_administrators (user_id) VALUES (?)').run(userId);
  const app = await createApp(db, { origin: 'https://precisign.example.test', secureCookies: true });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const login = (cookie = '') => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://precisign.example.test', 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ email: account.email, password }) });
    const response = await login();
    assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie')!, /; Secure/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const me = () => fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
    const profile = await response.json();
    assert.equal(profile.user.canReplaceFinalApprover, true);
    assert.deepEqual(profile, await (await me()).json());

    db.exec("CREATE TRIGGER fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'synthetic insert failure'); END;");
    const failed = await login(cookie);
    assert.equal(failed.status, 500);
    assert.equal(failed.headers.get('set-cookie'), null);
    assert.equal((await me()).status, 200);
    db.exec('DROP TRIGGER fail_session');
    assert.equal((await login(cookie)).status, 200);
    assert.equal((await me()).status, 401);
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

test('successful office sign-ins do not exhaust the login failure limit', async () => {
  const db = openDatabase(':memory:');
  await provisionUser(db, account, password);
  const origin = 'http://localhost:3000';
  const app = await createApp(db, { origin, secureCookies: false, loginLimit: 2 });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/auth/login`;
  const login = (candidate: string) => fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: candidate }) });
  try {
    for (let i = 0; i < 6; i++) assert.equal((await login(password)).status, 200);
    assert.equal((await login('wrong')).status, 401);
    assert.equal((await login('wrong')).status, 401);
    assert.equal((await login(password)).status, 429);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  }
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
    const malformed = (path: string, requestOrigin: string) => fetch(`${base}/api/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin }, body: '{',
    });
    assert.equal((await malformed('auth/login', 'https://other.test')).status, 403);
    assert.equal((await malformed('requests', origin)).status, 401);
    const badLogin = await malformed('auth/login', origin);
    assert.equal(badLogin.status, 400);
    assert.equal(badLogin.headers.get('cache-control'), 'no-store');
    const unsupportedCharset = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=iso-8859-1', Origin: origin }, body: '{}',
    });
    assert.equal(unsupportedCharset.status, 415);
    assert.deepEqual(await unsupportedCharset.json(), { error: 'Unsupported request encoding.' });
    assert.equal((await login({ email: account.email, password: 'x'.repeat(17000) })).status, 413);
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
