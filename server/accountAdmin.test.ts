import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { createSession, provisionUser, sessionUser, tokenHash, sessionUserAsync, hashPassword } from './auth';
import { openAsyncDatabase, migrateAsyncDatabase } from './asyncDatabase';
import { randomUUID } from 'node:crypto';
import { createApp } from './app';

test('super-admin directory preserves identity, revokes sessions, and clears access on disable', async () => {
  const url = process.env.PRECISIGN_TURSO_TEST_URL;
  if (url && new URL(url).hostname !== 'precisign-test-muatasim.aws-ap-south-1.turso.io') throw new Error('Use the separate test database.');
  const remote = url ? openAsyncDatabase(url, process.env.PRECISIGN_TURSO_TEST_TOKEN) : undefined;
  const local = remote ? undefined : openDatabase(':memory:');
  const db = remote ?? local!;
  if (remote) await migrateAsyncDatabase(remote);
  const execute = async (sql: string, ...args: (string | number)[]) => remote ? (await remote.execute(sql, args)).rows : local!.prepare(sql).all(...args);
  const suffix = remote ? randomUUID() : 'local';
  const adminEmail = remote ? `admin-${suffix}@example.test` : 'admin@example.test';
  const workerEmail = remote ? `worker-${suffix}@example.test` : 'worker@example.test';
  const newEmail = remote ? `new-${suffix}@example.test` : 'new@example.test';
  const requestId = remote ? randomUUID() : 'request';
  const addUser = async (name: string, email: string) => {
    if (local) return provisionUser(local, {name, email, department:'Test', role:'Admin', companyId:'PEW'}, password);
    const id = randomUUID();
    await execute('INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES (?,?,?,?,?,?,?)', id, email, name, 'Admin', 'Test', 'PEW', await hashPassword(password));
    return id;
  };
  const newSession = async (id: string) => {
    if (local) return createSession(local,id);
    const token = randomUUID().replaceAll('-','') + randomUUID().replaceAll('-','');
    await execute('INSERT INTO sessions VALUES (?,?,?)', tokenHash(token), id, Date.now()+3600000);
    return token;
  };
  const lookupSession = async (token: string) => remote ? sessionUserAsync(remote,token) : sessionUser(local!,token);
  const password = 'Synthetic-password-123';
  const adminId = await addUser('Admin', adminEmail);
  const userId = await addUser('Worker', workerEmail);
  await execute("INSERT INTO account_access (user_id, company_grants, is_super_admin) VALUES (?, '[\"PEW\"]', 1)", adminId);
  await execute("INSERT INTO account_access (user_id, company_grants, form_grants) VALUES (?, '[\"PEW\"]', '{\"PEW\":[\"IT Request\"]}')", userId);
  await execute("INSERT INTO requests VALUES (?,'PEW',?,'Approved',1,'{}')", requestId, userId);
  const admin = `precisign_session=${await newSession(adminId)}`;
  const oldToken = await newSession(userId);
  const user = `precisign_session=${oldToken}`;
  const origin = 'http://localhost:3000';
  const app = await createApp(db, { origin, secureCookies: false });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/accounts`;
  const get = (cookie: string) => fetch(base, { headers: { Cookie: cookie } });
  const patch = (id: string, cookie: string, body: unknown) => fetch(`${base}/${id}`, {
    method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    const userSession = { headers: { Cookie: user } };
    const bootstrap = new URL('/api/bootstrap', base);
    const changeGrants = (forms: string[]) => fetch(`${base}/${userId}/grants`, {
      method: 'PUT', headers: { Cookie: admin, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: ['PEW'], formsByCompany: { PEW: forms } }),
    });
    const before = await (await fetch(bootstrap, userSession)).json();
    assert.deepEqual(before.user.formGrants.PEW, ['IT Request']);
    assert.equal((await changeGrants(['Administrative & Payment Request'])).status, 204);
    const after = await (await fetch(bootstrap, userSession)).json();
    assert.deepEqual(after.user.formGrants.PEW, ['Administrative & Payment Request']);
    assert.equal((await changeGrants([])).status, 204);
    const removed = await (await fetch(bootstrap, userSession)).json();
    assert.deepEqual(removed.user.formGrants.PEW ?? [], []);
    const draft = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/drafts/PEW/Admin%20Work%20Request`;
    assert.equal((await fetch(draft, userSession)).status, 403);
    const submit = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/requests`;
    assert.equal((await fetch(submit, { method: 'POST', headers: { Cookie: user, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: 'PEW', formType: 'Cash Voucher' }) })).status, 403);
    assert.equal((await get(user)).status, 403);
    assert.equal((await patch(userId, user, { isDisabled: true })).status, 403);
    assert.equal((await patch(userId, user, { role: 'Finance' })).status, 403);
    assert.equal((await patch(userId, admin, { role: 'Director' })).status, 400);
    assert.equal((await patch(userId, admin, { role: 'Finance' })).status, 204);
    assert.equal((await lookupSession(oldToken))?.role, 'Finance');
    assert.equal((await patch(userId, admin, { role: 'Employee' })).status, 204);
    assert.equal((await lookupSession(oldToken))?.role, 'Employee');
    const accounts = await (await get(admin)).json();
    assert.ok(accounts.some((account: { id: string }) => account.id === userId));
    assert.equal(JSON.stringify(accounts).includes('password_hash'), false);
    assert.equal((await patch(adminId, admin, { isDisabled: true })).status, 409);
    assert.equal((await patch(userId, admin, { email: adminEmail.toUpperCase() })).status, 409);
    assert.equal((await patch(userId, admin, { email: newEmail.toUpperCase() })).status, 204);
    assert.equal((await lookupSession(oldToken)), null);
    assert.equal((await execute('SELECT requester_id FROM requests WHERE id=?', requestId))[0].requester_id, userId);
    const activeToken = await newSession(userId);
    assert.equal((await patch(userId, admin, { isDisabled: true })).status, 204);
    assert.equal((await lookupSession(activeToken)), null);
    assert.equal((await fetch(`${base}/../../auth/me`, { headers: { Cookie: `precisign_session=${activeToken}` } })).status, 401);
    assert.equal((await patch(userId, admin, { isDisabled: false })).status, 204);
    const restored = (await execute('SELECT company_grants,form_grants FROM account_access WHERE user_id=?', userId))[0];
    assert.equal(restored.company_grants, '[]');
    assert.equal(restored.form_grants, '{}');
    assert.equal((await execute('SELECT email FROM users WHERE id=?', userId))[0].email, newEmail);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (remote) await remote.transaction(async tx => {
      await tx.execute('DELETE FROM requests WHERE id=?', [requestId]);
      await tx.execute('DELETE FROM users WHERE id IN (?,?)', [adminId,userId]);
    });
    db.close();
  }
});
