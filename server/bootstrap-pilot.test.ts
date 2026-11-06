import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapPilot } from './bootstrap-pilot';
import { openDatabase } from './db';
import { verifyPassword } from './auth';
import { createApp } from './app';
import { once } from 'node:events';

test('pilot bootstrap provisions six stable accounts once without overwriting access or passwords', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'precisign-pilot-'));
  const path = join(directory, 'pilot.sqlite');
  const credentials = join(directory, 'credentials.json');
  try {
    assert.deepEqual(await bootstrapPilot(path, credentials), { created: true });
    const initialCredentials = readFileSync(credentials, 'utf8');
    const rows: { name: string; email: string; password: string }[] = JSON.parse(initialCredentials);
    assert.equal(rows.length, 6);
    assert.equal(new Set(rows.map(row => row.password)).size, 6);
    const db = openDatabase(path);
    try {
      assert.equal(db.prepare('SELECT count(*) AS count FROM pilot_identities').get()!.count, 6);
      assert.equal(db.prepare('SELECT count(*) AS count FROM account_access WHERE is_super_admin=1').get()!.count, 1);
      const account = db.prepare("SELECT password_hash, company_grants, must_change_password FROM account_profiles WHERE id='pilot-muatasim'").get()!;
      assert.deepEqual(JSON.parse(String(account.company_grants)), ['PEW', 'ICCL', 'FSG']);
      assert.equal(account.must_change_password, 1);
      assert.equal(await verifyPassword(rows.find(row => row.name === 'Muatasim')!.password, String(account.password_hash)), true);
      db.prepare("UPDATE users SET email='changed@example.test' WHERE id='pilot-muatasim'").run();
      db.prepare("UPDATE account_access SET company_grants='[]' WHERE user_id='pilot-muatasim'").run();
    } finally { db.close(); }
    assert.deepEqual(await bootstrapPilot(path, credentials), { created: false });
    assert.equal(readFileSync(credentials, 'utf8'), initialCredentials);
    const reopened = openDatabase(path);
    try {
      assert.equal(reopened.prepare("SELECT email FROM users WHERE id='pilot-muatasim'").get()!.email, 'changed@example.test');
      assert.equal(reopened.prepare("SELECT company_grants FROM account_access WHERE user_id='pilot-muatasim'").get()!.company_grants, '[]');
    } finally { reopened.close(); }
    const other = join(directory, 'other.sqlite');
    const preexisting = openDatabase(other);
    preexisting.close();
    await assert.rejects(bootstrapPilot(other, join(directory, 'other.json')), /not marked as a pilot/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('each pilot user can sign in and replace their temporary password', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'precisign-pilot-login-'));
  const path = join(directory, 'pilot.sqlite');
  const credentials = join(directory, 'credentials.json');
  try {
    await bootstrapPilot(path, credentials);
    const users: { email: string; password: string }[] = JSON.parse(readFileSync(credentials, 'utf8'));
    const db = openDatabase(path);
    const origin = 'http://localhost:3000';
    const app = await createApp(db, { origin, secureCookies: false });
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const post = (path: string, body: unknown, cookie = '') => fetch(base + path, {
      method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    try {
      for (const user of users) {
        const login = await post('/auth/login', user);
        assert.equal(login.status, 200);
        assert.equal((await login.clone().json()).user.mustChangePassword, true);
        const cookie = login.headers.get('set-cookie')!.split(';')[0];
        assert.equal((await post('/auth/change-password', { currentPassword: user.password, newPassword: 'Synthetic-new-password-456' }, cookie)).status, 204);
        assert.equal((await post('/auth/login', user)).status, 401);
        assert.equal((await post('/auth/login', { email: user.email, password: 'Synthetic-new-password-456' })).status, 200);
      }
    } finally {
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
