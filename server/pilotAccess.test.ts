import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { createSession, provisionUser, sessionUser, verifyPassword } from './auth';
import { createApp } from './app';
import { INITIAL_WORKFLOWS, INITIAL_REQUESTS } from '../src/data/seedData';
import sharp from 'sharp';

test('reset links and explicit grants enforce account boundaries', async () => {
  const db = openDatabase(':memory:');
  const password = 'Synthetic-password-123';
  const admin = await provisionUser(db, { name: 'Admin', email: 'admin@example.test', department: 'Test', role: 'Admin', companyId: 'PEW' }, password);
  const user = await provisionUser(db, { name: 'Employee', email: 'employee@example.test', department: 'Test', role: 'Admin', companyId: 'PEW' }, password);
  db.prepare('INSERT INTO account_access (user_id,is_super_admin) VALUES (?,1)').run(admin);
  db.prepare('INSERT INTO account_access (user_id,must_change_password) VALUES (?,1)').run(user);
  const adminCookie = `precisign_session=${createSession(db, admin)}`;
  const oldToken = createSession(db, user);
  const origin = 'http://localhost:3000';
  let now = Date.now();
  const app = await createApp(db, { origin, secureCookies: false, now: () => now, loginLimit: 100 });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const call = (path: string, method = 'GET', body?: unknown, cookie = adminCookie) => fetch(root + path, {
    method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const link = async () => {
    const response = await call(`/admin/accounts/${user}/reset-link`, 'POST');
    assert.equal(response.status, 200);
    return new URLSearchParams(new URL((await response.json()).link).hash.slice(1)).get('reset')!;
  };
  const redeem = (token: string) => call('/auth/reset-password', 'POST', { token, newPassword: 'New-synthetic-password-123' }, '');
  try {
    assert.equal((await call(`/admin/accounts/${user}/grants`, 'PUT', { companyIds: ['PEW'], formsByCompany: { ICCL: ['IT Request'] } })).status, 400);
    assert.equal((await call(`/admin/accounts/${user}/grants`, 'PUT', { companyIds: ['PEW'], formsByCompany: { PEW: ['IT Request'] } })).status, 204);
    assert.equal((await call(`/admin/accounts/${user}/grants`, 'PUT', { companyIds: ['FSG'], formsByCompany: {} }, `precisign_session=${oldToken}`)).status, 403);
    assert.equal(db.prepare('SELECT company_grants FROM account_access WHERE user_id=?').get(user)!.company_grants, '["PEW"]');
    const previous = await link();
    const current = await link();
    assert.equal((await redeem(previous)).status, 400);
    const results = await Promise.all([redeem(current), redeem(current)]);
    assert.deepEqual(results.map(result => result.status).sort(), [204, 400]);
    assert.equal(sessionUser(db, oldToken), null);
    const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user)!;
    assert.equal(await verifyPassword(password, String(row.password_hash)), false);
    assert.equal(await verifyPassword('New-synthetic-password-123', String(row.password_hash)), true);
    assert.equal(db.prepare('SELECT must_change_password FROM account_access WHERE user_id=?').get(user)!.must_change_password, 0);
    const userCookie = `precisign_session=${createSession(db, user, now)}`;
    const bootstrap = await (await call('/bootstrap', 'GET', undefined, userCookie)).json();
    assert.deepEqual(bootstrap.companies.map((company: { id: string }) => company.id), ['PEW']);
    assert.equal((await call('/drafts/ICCL/Admin%20Work%20Request', 'GET', undefined, userCookie)).status, 403);
    assert.equal((await call('/drafts/PEW/Admin%20Work%20Request', 'GET', undefined, userCookie)).status, 403);
    const expired = await link(); now += 31 * 60 * 1000;
    assert.equal((await redeem(expired)).status, 400);
    const pending = await link();
    assert.equal((await call(`/admin/accounts/${user}`, 'PATCH', { isDisabled: true })).status, 204);
    assert.equal((await redeem(pending)).status, 400);
    assert.equal((await call(`/admin/accounts/${user}/grants`, 'PUT', { companyIds: ['PEW'], formsByCompany: {} })).status, 409);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  }
});

test('assigned signer without a start grant can sign but visibility alone cannot', async () => {
  const db = openDatabase(':memory:');
  const ids: string[] = [];
  for (const [index, role] of ['Admin', 'General Manager', 'Director', 'Director'].entries()) {
    ids.push(await provisionUser(db, { name: `Person ${index}`, email: `person${index}@example.test`, department: 'Test', role: role as any, companyId: 'PEW' }, 'Synthetic-password-123'));
    db.prepare('INSERT INTO account_access (user_id, company_grants, form_grants) VALUES (?, ?, ?)').run(ids[index], '["PEW"]', index === 0 ? '{"PEW":["Admin Work Request"]}' : '{}');
  }
  const workflow = { ...INITIAL_WORKFLOWS[0], stages: INITIAL_WORKFLOWS[0].stages.map((stage, i) => ({ ...stage, assignedUserId: ids[i + 1] })) };
  db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW', 'Admin Work Request', 1, JSON.stringify(workflow));
  const cookies = ids.map(id => `precisign_session=${createSession(db, id)}`);
  const origin = 'http://localhost:3000';
  const app = await createApp(db, { origin, secureCookies: false });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const call = (path: string, actor: number, body?: unknown) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, Cookie: cookies[actor], 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
  const f = INITIAL_REQUESTS[0].formData;
  const input = { companyId: 'PEW', formType: 'Admin Work Request', formData: { dateOfRequest: f.dateOfRequest, department: 'Test', priority: 'Medium', workDescription: 'Synthetic', documents: f.documents }, signatureDataUrl };
  try {
    assert.equal((await call('/requests', 1, input)).status, 403);
    const createdResponse = await call('/requests', 0, input);
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal((await call(`/requests/${created.id}`, 3)).status, 200);
    assert.equal((await call(`/requests/${created.id}/approve`, 3, { expectedRevision: 1, signatureDataUrl })).status, 403);
    assert.equal((await call(`/requests/${created.id}/approve`, 1, { expectedRevision: 1, signatureDataUrl })).status, 200);
    db.prepare("UPDATE account_access SET company_grants='[]',form_grants='{}' WHERE user_id=?").run(ids[1]);
    assert.equal((await call(`/requests/${created.id}`, 1)).status, 404);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  }
});

test('removing a company during validation prevents the pending submission', async () => {
  const db = openDatabase(':memory:');
  const id = await provisionUser(db, { name: 'Employee', email: 'employee@example.test', department: 'Test', role: 'Admin', companyId: 'PEW' }, 'Synthetic-password-123');
  db.prepare('INSERT INTO account_access (user_id,company_grants,form_grants) VALUES (?,?,?)').run(id, '["PEW"]', '{"PEW":["Admin Work Request"]}');
  const cookie = `precisign_session=${createSession(db, id)}`;
  let armed = false;
  let finished!: () => void;
  const revoked = new Promise<void>(resolve => { finished = resolve; });
  const now = () => {
    if (armed) {
      armed = false;
      setImmediate(() => { db.prepare("UPDATE account_access SET company_grants='[]',form_grants='{}' WHERE user_id=?").run(id); finished(); });
    }
    return Date.now();
  };
  const origin = 'http://localhost:3000';
  const app = await createApp(db, { origin, secureCookies: false, now });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const image = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#112233' } }).png().toBuffer();
  const f = INITIAL_REQUESTS[0].formData;
  try {
    armed = true;
    const response = await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/requests`, {
      method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: 'PEW', formType: 'Admin Work Request', formData: { dateOfRequest: f.dateOfRequest, department: 'Test', priority: 'Medium', workDescription: 'Synthetic', documents: f.documents }, signatureDataUrl: `data:image/png;base64,${image.toString('base64')}` }),
    });
    await revoked;
    assert.equal(response.status, 403);
    assert.equal(db.prepare('SELECT count(*) AS count FROM requests').get()!.count, 0);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  }
});
