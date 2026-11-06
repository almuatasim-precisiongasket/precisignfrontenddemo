import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { createSession, provisionUser, sessionUser } from './auth';
import { createApp } from './app';

test('super-admin directory preserves identity, revokes sessions, and clears access on disable', async () => {
  const db = openDatabase(':memory:');
  const password = 'Synthetic-password-123';
  const adminId = await provisionUser(db, { name: 'Admin', email: 'admin@example.test', department: 'Test', role: 'Admin', companyId: 'PEW' }, password);
  const userId = await provisionUser(db, { name: 'Worker', email: 'worker@example.test', department: 'Test', role: 'Admin', companyId: 'PEW' }, password);
  db.prepare("INSERT INTO account_access (user_id, company_grants, is_super_admin) VALUES (?, '[\"PEW\"]', 1)").run(adminId);
  db.prepare("INSERT INTO account_access (user_id, company_grants, form_grants) VALUES (?, '[\"PEW\"]', '{\"PEW\":[\"IT Request\"]}')").run(userId);
  db.prepare("INSERT INTO requests VALUES ('request','PEW',?,'Approved',1,'{}')").run(userId);
  const admin = `precisign_session=${createSession(db, adminId)}`;
  const oldToken = createSession(db, userId);
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
    const accounts = await (await get(admin)).json();
    assert.equal(accounts.length, 2);
    assert.equal(JSON.stringify(accounts).includes('password_hash'), false);
    assert.equal((await patch(adminId, admin, { isDisabled: true })).status, 409);
    assert.equal((await patch(userId, admin, { email: ' ADMIN@example.test ' })).status, 409);
    assert.equal((await patch(userId, admin, { email: ' NEW@example.test ' })).status, 204);
    assert.equal(sessionUser(db, oldToken), null);
    assert.equal(db.prepare('SELECT requester_id FROM requests WHERE id=?').get('request')!.requester_id, userId);
    const activeToken = createSession(db, userId);
    assert.equal((await patch(userId, admin, { isDisabled: true })).status, 204);
    assert.equal(sessionUser(db, activeToken), null);
    assert.equal((await fetch(`${base}/../../auth/me`, { headers: { Cookie: `precisign_session=${activeToken}` } })).status, 401);
    assert.equal((await patch(userId, admin, { isDisabled: false })).status, 204);
    const restored = db.prepare('SELECT company_grants,form_grants FROM account_access WHERE user_id=?').get(userId)!;
    assert.equal(restored.company_grants, '[]');
    assert.equal(restored.form_grants, '{}');
    assert.equal(db.prepare('SELECT email FROM users WHERE id=?').get(userId)!.email, 'new@example.test');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  }
});
