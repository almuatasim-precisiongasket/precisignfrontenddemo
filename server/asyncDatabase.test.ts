import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateAsyncDatabase, openAsyncDatabase } from './asyncDatabase';
import { openDatabase } from './db';
import { ownSignatureAsync, profileRoutes, saveOwnSignatureAsync } from './profile';
import express from 'express';
import { once } from 'node:events';
import { createApp } from './app';
import { INITIAL_REQUESTS } from '../src/data/seedData';
import { changePasswordAsync, hashPassword, registerAccount, resetPasswordAsync, sessionUserAsync, signInAsync, tokenHash, verifyPassword } from './auth';

test('async transactions commit all writes and roll back failures', async () => {
  const db = openAsyncDatabase('file::memory:');
  try {
    await db.execute('CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    await db.transaction(async tx => {
      await tx.execute('INSERT INTO events VALUES (?, ?)', [1, 'approved']);
      await tx.execute('INSERT INTO events VALUES (?, ?)', [2, 'history']);
    });
    await assert.rejects(db.transaction(async tx => {
      await tx.execute('INSERT INTO events VALUES (?, ?)', [3, 'temporary']);
      throw new Error('synthetic failure');
    }), /synthetic failure/);
    const result = await db.execute('SELECT id, value FROM events ORDER BY id');
    assert.deepEqual(result.rows.map(row => [Number(row.id), row.value]), [[1, 'approved'], [2, 'history']]);
  } finally {
    db.close();
  }
});

test('profile API uses the async transaction and revalidates the session', async () => {
  const db = openAsyncDatabase('file::memory:');
  await migrateAsyncDatabase(db);
  await db.execute("INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES ('synthetic','employee@example.test','Test Employee','Admin','Test','PEW','synthetic')");
  let enabled = true;
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.requireCurrentUserAsync = async () => {
      if (!enabled) throw new Error('Session revoked');
      return { id: 'synthetic', name: 'Test Employee' };
    };
    next();
  });
  app.use(profileRoutes(db));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(403).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
  const send = () => fetch(`http://127.0.0.1:${port}/me/signature`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signatureDataUrl: signature, signatureStyleText: 'Test Employee' }) });
  try {
    assert.equal((await send()).status, 200);
    enabled = false;
    assert.equal((await send()).status, 403);
    assert.equal((await ownSignatureAsync(db, 'synthetic')).signatureDataUrl, signature);
  } finally {
    server.close();
    db.close();
  }
});

test('async signature updates validate the current account and preserve exact data', async () => {
  const db = openAsyncDatabase('file::memory:');
  try {
    await migrateAsyncDatabase(db);
    await db.execute("INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES ('synthetic','employee@example.test','Test Employee','Admin','Test','PEW','synthetic')");
    const actor = async () => ({ id: 'synthetic', name: 'Test Employee' });
    assert.equal(await saveOwnSignatureAsync(db, actor, 'data:image/png;base64,dGVzdA==', 'Wrong name'), null);
    assert.deepEqual(await ownSignatureAsync(db, 'synthetic'), {});
    await saveOwnSignatureAsync(db, actor, 'data:image/png;base64,dGVzdA==', 'Test Employee');
    assert.deepEqual(await ownSignatureAsync(db, 'synthetic'), {
      signatureDataUrl: 'data:image/png;base64,dGVzdA==', signatureStyleText: 'Test Employee',
    });
    await assert.rejects(saveOwnSignatureAsync(db, async () => { throw new Error('Session revoked'); }, 'replacement', 'Test Employee'), /Session revoked/);
    assert.equal((await ownSignatureAsync(db, 'synthetic')).signatureDataUrl, 'data:image/png;base64,dGVzdA==');
  } finally { db.close(); }
});

test('async schema migration creates the application schema and is repeatable', async () => {
  const db = openAsyncDatabase('file::memory:');
  const original = openDatabase(':memory:');
  try {
    await migrateAsyncDatabase(db);
    await migrateAsyncDatabase(db);
    const version = await db.execute('SELECT version FROM precisign_schema_version WHERE id=1');
    assert.equal(Number(version.rows[0].version), 9);
    const companies = await db.execute('SELECT id FROM companies ORDER BY id');
    assert.deepEqual(companies.rows.map(row => row.id), ['FSG', 'ICCL', 'PEW']);
    const requests = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='requests'");
    assert.equal(requests.rows.length, 1);
    const schemaSql = "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name";
    const expected = original.prepare(schemaSql).all();
    const actual = await db.execute(schemaSql);
    assert.deepEqual(actual.rows.filter(row => row.name !== 'precisign_schema_version').map(row => ({ type: row.type, name: row.name, sql: row.sql })),
      expected.map(row => ({ type: row.type, name: row.name, sql: row.sql })));
  } finally {
    db.close();
    original.close();
  }
});

test('async session lookup rejects expired and disabled accounts', async () => {
  const db = openAsyncDatabase('file::memory:');
  try {
    await migrateAsyncDatabase(db);
    await db.execute("INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES ('synthetic','employee@example.test','Test Employee','Admin','Test','PEW','synthetic')");
    await db.execute("INSERT INTO account_access (user_id,company_grants) VALUES ('synthetic','[]')");
    const token = 'a'.repeat(64);
    await db.execute('INSERT INTO sessions VALUES (?,?,?)', [tokenHash(token), 'synthetic', 1000]);
    assert.equal((await sessionUserAsync(db, token, 999))?.id, 'synthetic');
    assert.equal(await sessionUserAsync(db, token, 1000), null);
    await db.execute("UPDATE account_access SET is_disabled=1 WHERE user_id='synthetic'");
    assert.equal(await sessionUserAsync(db, token, 999), null);
  } finally { db.close(); }
});

test('async sign-in creates and revokes sessions while rejecting invalid credentials', async () => {
  const db = openAsyncDatabase('file::memory:');
  try {
    await migrateAsyncDatabase(db);
    const hash = await hashPassword('Synthetic-password-123');
    await db.execute("INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES ('synthetic','employee@example.test','Test Employee','Admin','Test','PEW',?)", [hash]);
    await db.execute("INSERT INTO account_access (user_id,company_grants) VALUES ('synthetic','[]')");
    assert.equal(await signInAsync(db, 'employee@example.test', 'wrong', hash, undefined, () => 1), null);
    const first = await signInAsync(db, 'EMPLOYEE@example.test', 'Synthetic-password-123', hash, undefined, () => 1);
    assert.equal(first?.user.id, 'synthetic');
    const next = await signInAsync(db, 'employee@example.test', 'Synthetic-password-123', hash, first?.token, () => 2);
    assert.equal(await sessionUserAsync(db, first?.token, 2), null);
    assert.equal((await sessionUserAsync(db, next?.token, 2))?.id, 'synthetic');
    await db.execute("UPDATE account_access SET is_disabled=1 WHERE user_id='synthetic'");
    assert.equal(await signInAsync(db, 'employee@example.test', 'Synthetic-password-123', hash, undefined, () => 3), null);
  } finally { db.close(); }
});

test('async registration creates zero-grant accounts and rejects duplicate emails', async () => {
  const db = openAsyncDatabase('file::memory:');
  try {
    await migrateAsyncDatabase(db);
    const input = { name: 'Test Employee', email: 'employee@example.test', department: 'Test', password: 'Synthetic-password-123' };
    await registerAccount(db, input);
    await assert.rejects(registerAccount(db, { ...input, email: 'EMPLOYEE@example.test' }), /Account could not be created/);
    const accounts = await db.execute('SELECT company_grants,form_grants,role_override FROM account_access');
    assert.equal(accounts.rows.length, 1);
    assert.equal(accounts.rows[0].company_grants, '[]');
    assert.equal(accounts.rows[0].form_grants, '{}');
    assert.equal(accounts.rows[0].role_override, 'Employee');
  } finally { db.close(); }
});

test('async password reset consumes the link and revokes sessions', async () => {
  const db = openAsyncDatabase('file::memory:');
  try {
    await migrateAsyncDatabase(db);
    await registerAccount(db, { name: 'Test Employee', email: 'employee@example.test', department: 'Test', password: 'Synthetic-password-123' });
    const user = (await db.execute('SELECT id FROM users')).rows[0];
    const reset = 'b'.repeat(64), session = 'c'.repeat(64);
    await db.execute('INSERT INTO password_resets VALUES (?,?,?)', [String(user.id), tokenHash(reset), 100]);
    await db.execute('INSERT INTO sessions VALUES (?,?,?)', [tokenHash(session), String(user.id), 100]);
    await resetPasswordAsync(db, reset, 'New-synthetic-password-456', () => 10);
    await assert.rejects(resetPasswordAsync(db, reset, 'New-synthetic-password-456', () => 10), /invalid or expired/i);
    assert.equal(await sessionUserAsync(db, session, 10), null);
    const row = (await db.execute('SELECT password_hash FROM users WHERE id=?', [String(user.id)])).rows[0];
    assert.equal(await verifyPassword('New-synthetic-password-456', String(row.password_hash)), true);
  } finally { db.close(); }
});

test('async password change revokes sessions after revalidating the current user', async () => {
  const db = openAsyncDatabase('file::memory:');
  try {
    await migrateAsyncDatabase(db);
    await registerAccount(db, { name: 'Test Employee', email: 'employee@example.test', department: 'Test', password: 'Synthetic-password-123' });
    const login = await signInAsync(db, 'employee@example.test', 'Synthetic-password-123', await hashPassword('Dummy-password-123'), undefined, () => 1);
    assert.ok(login);
    const requireUser = async (tx: import('./asyncDatabase').AsyncQueryConnection) => {
      const user = await sessionUserAsync(tx, login.token, 2);
      if (!user) throw new Error('Session revoked');
      return user;
    };
    await assert.rejects(changePasswordAsync(db, login.user.id, 'wrong', 'Replacement-password-456', requireUser), /Invalid credentials/);
    await changePasswordAsync(db, login.user.id, 'Synthetic-password-123', 'Replacement-password-456', requireUser);
    assert.equal(await sessionUserAsync(db, login.token, 2), null);
    assert.ok(await signInAsync(db, 'employee@example.test', 'Replacement-password-456', '', undefined, () => 3));
  } finally { db.close(); }
});

test('Express authentication uses asynchronous storage', async () => {
  const db = openAsyncDatabase('file::memory:');
  await migrateAsyncDatabase(db);
  const app = await createApp(db, { origin: 'http://localhost:3000', secureCookies: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const post = (path: string, body: unknown, cookie = '') => fetch(base + path, { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
  try {
    const input = { name: 'Synthetic Employee', email: 'employee@example.test', department: 'Test', password: 'Synthetic-password-123' };
    assert.equal((await post('/auth/signup', input)).status, 204);
    const login = await post('/auth/login', { email: input.email, password: input.password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(base + '/auth/me', { headers: { cookie } })).status, 200);
    const user = await login.json();
    const sample = { ...INITIAL_REQUESTS[0], id: 'synthetic-route', requesterId: user.user.id, companyId: 'PEW' };
    await db.execute('INSERT INTO requests VALUES (?,?,?,?,?,?)', ['synthetic-route', 'PEW', user.user.id, sample.status, 1, JSON.stringify(sample)]);
    assert.equal((await fetch(base + '/requests/synthetic-route', { headers: { cookie } })).status, 404);
    await db.execute('UPDATE account_access SET company_grants=? WHERE user_id=?', [JSON.stringify(['PEW']), user.user.id]);
    assert.equal((await fetch(base + '/requests/synthetic-route', { headers: { cookie } })).status, 200);
    const bootstrap = await (await fetch(base + '/bootstrap', { headers: { cookie } })).json();
    assert.deepEqual(bootstrap.companies.map((company: { id: string }) => company.id), ['PEW']);
    assert.equal((await fetch(base + '/requests/unknown', { headers: { cookie } })).status, 404);
    assert.equal((await post('/auth/logout', {}, cookie)).status, 204);
    assert.equal((await fetch(base + '/auth/me', { headers: { cookie } })).status, 401);
  } finally { server.close(); db.close(); }
});
