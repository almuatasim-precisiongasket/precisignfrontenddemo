import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { createApp } from './app';
import { createSession, provisionUser, hashPassword, tokenHash } from './auth';
import { randomUUID, randomBytes } from 'node:crypto';
import { migrateAsyncDatabase, openAsyncDatabase } from './asyncDatabase';
import type { CompanyId, UserRole } from '../src/types/index';

test('read API enforces company permissions on every list, detail and bootstrap', async () => {
  const url = process.env.PRECISIGN_TURSO_TEST_URL;
  if (url && new URL(url).hostname !== 'precisign-test-muatasim.aws-ap-south-1.turso.io') throw new Error('Use the separate precisign-test database.');
  const remote = url ? openAsyncDatabase(url, process.env.PRECISIGN_TURSO_TEST_TOKEN) : undefined;
  const local = remote ? undefined : openDatabase(':memory:');
  const db = remote ?? local!;
  const userIds: string[] = [];
  const requestIds: string[] = [];
  const workflowCompanies: string[] = [];
  const run = async (sql: string, ...args: (string | number)[]) => remote
    ? remote.execute(sql, args) : local!.prepare(sql).run(...args);
  const addUser = async (input: Parameters<typeof provisionUser>[1]) => {
    if (local) return provisionUser(local, input, 'Synthetic-test-password-123');
    const id = randomUUID();
    await run('INSERT INTO users (id,email,name,role,department,company_id,allowed_companies,group_admin,password_hash) VALUES (?,?,?,?,?,?,?,?,?)',
      id, id + '@example.test', input.name, input.role, input.department, input.companyId,
      JSON.stringify(input.allowedCompanyIds ?? []), Number(!!input.isGroupAdmin), await hashPassword('Synthetic-test-password-123'));
    userIds.push(id);
    return id;
  };
  const createToken = async (id: string) => {
    if (local) return createSession(local, id);
    const token = randomBytes(32).toString('hex');
    await run('INSERT INTO sessions VALUES (?,?,?)', tokenHash(token), id, Date.now() + 3600000);
    return token;
  };
  let server: ReturnType<Awaited<ReturnType<typeof createApp>>['listen']> | undefined;
  try {
  if (remote) {
    await migrateAsyncDatabase(remote);
    if ((await remote.execute('SELECT 1 FROM requests UNION ALL SELECT 1 FROM workflows LIMIT 1')).rows.length) throw new Error('The Turso test database must have no requests or workflows.');
  }
  const cases: { role: UserRole; allowedCompanyIds?: CompanyId[]; isGroupAdmin?: boolean; expected: CompanyId[] }[] = [
    { role: 'Admin', expected: ['PEW'] },
    { role: 'HR', allowedCompanyIds: ['ICCL'], expected: ['ICCL', 'PEW'] },
    { role: 'General Manager', expected: ['FSG', 'ICCL', 'PEW'] },
    { role: 'Director', expected: ['FSG', 'ICCL', 'PEW'] },
    { role: 'IT', isGroupAdmin: true, expected: ['FSG', 'ICCL', 'PEW'] },
  ];
  const accounts: string[] = [];
  for (const [index, entry] of cases.entries()) accounts.push(await addUser({ email: `user${index}@example.test`, name: 'Synthetic User', department: 'Test', companyId: 'PEW', ...entry }));
  const foreign = await addUser({ email: 'foreign@example.test', name: 'Foreign User', department: 'Test', companyId: 'FSG', role: 'HR' });
  for (const company of ['PEW','ICCL','FSG']) {
    await run('INSERT INTO requests VALUES (?,?,?,?,?,?)', company, company, accounts[0], 'Pending Approval', 3, JSON.stringify({ id: company, companyId: company, requesterId: accounts[0], workflowConfig: { processingUserIds: [accounts[1]] }, formData: {}, approvalHistory: [] }));
    requestIds.push(company);
    await run('INSERT INTO workflows VALUES (?,?,?,?)', company, 'Admin Work Request', 1, JSON.stringify({ companyId: company, stages: [] }));
    workflowCompanies.push(company);
  }
  const app = await createApp(db, { origin: 'http://localhost:3000', secureCookies: false });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    assert.equal((await fetch(`${base}/api/requests`)).status, 401);
    assert.equal((await fetch(`${base}/api/bootstrap`)).status, 401);
    const unrelated = await addUser({email:'unrelated@example.test',name:'Unrelated',department:'Admin',companyId:'PEW',role:'HR'});
    const unrelatedHeaders={Cookie:`precisign_session=${await createToken(unrelated)}`};
    assert.deepEqual(await(await fetch(`${base}/api/requests`,{headers:unrelatedHeaders})).json(),[]);
    assert.equal((await fetch(`${base}/api/requests/PEW`,{headers:unrelatedHeaders})).status,404);
    const pdfHeaders = { ...unrelatedHeaders, Origin: 'http://localhost:3000', 'Content-Type': 'application/json' };
    const pdfBody = JSON.stringify({ version: 1, updatedAt: 'synthetic' });
    assert.equal((await fetch(`${base}/api/requests/PEW/document-pdf`, { method: 'POST', headers: pdfHeaders, body: pdfBody })).status, 404);
    assert.equal((await fetch(`${base}/api/requests/PEW/document-pdf`, { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: pdfBody })).status, 401);
    for (const [index, entry] of cases.entries()) {
      const headers = { Cookie: `precisign_session=${await createToken(accounts[index])}` };
      for (const scope of ['', '?scope=PEG']) {
        const response = await fetch(`${base}/api/requests${scope}`, { headers });
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).map((r: any) => r.companyId).sort(), entry.expected);
      }
      for (const company of ['PEW','ICCL','FSG'] as CompanyId[]) {
        const detail = await fetch(`${base}/api/requests/${company}`, { headers });
        const allowed = entry.expected.includes(company);
        assert.equal(detail.status, allowed ? 200 : 404);
        if (allowed) assert.equal((await detail.json()).revision, 3);
        const scoped = await fetch(`${base}/api/requests?scope=${company}`, { headers });
        assert.equal((await scoped.json()).length, allowed ? 1 : 0);
      }
      assert.equal((await fetch(`${base}/api/requests?scope=invalid`, { headers })).status, 400);
      assert.equal((await fetch(`${base}/api/requests/missing`, { headers })).status, 404);
      const bootstrap = await (await fetch(`${base}/api/bootstrap`, { headers })).json();
      assert.deepEqual(bootstrap.companies.map((c: any) => c.id).sort(), entry.expected);
      assert.deepEqual(bootstrap.workflows.map((w: any) => w.companyId).sort(), entry.expected);
      assert.equal(/password|scrypt|token_hash|signatureDataUrl/.test(JSON.stringify(bootstrap)), false);
      if (index === 0) assert.equal(bootstrap.users.some((user: any) => user.id === foreign), false);
    }
  } finally { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    try {
      if (remote && userIds.length) await remote.transaction(async tx => {
        for (const id of requestIds) await tx.execute('DELETE FROM requests WHERE id=?', [id]);
        for (const company of workflowCompanies) await tx.execute('DELETE FROM workflows WHERE company_id=? AND form_type=?', [company, 'Admin Work Request']);
        for (const id of userIds) await tx.execute('DELETE FROM users WHERE id=?', [id]);
      });
    } finally { db.close(); } }
});
