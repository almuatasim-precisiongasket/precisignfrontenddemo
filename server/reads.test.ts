import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { createApp } from './app';
import { createSession, provisionUser } from './auth';
import type { CompanyId, UserRole } from '../src/types/index';

test('read API enforces company permissions on every list, detail and bootstrap', async () => {
  const db = openDatabase(':memory:');
  const cases: { role: UserRole; allowedCompanyIds?: CompanyId[]; isGroupAdmin?: boolean; expected: CompanyId[] }[] = [
    { role: 'Admin', expected: ['PEW'] },
    { role: 'HR', allowedCompanyIds: ['ICCL'], expected: ['ICCL', 'PEW'] },
    { role: 'General Manager', expected: ['FSG', 'ICCL', 'PEW'] },
    { role: 'Director', expected: ['FSG', 'ICCL', 'PEW'] },
    { role: 'IT', isGroupAdmin: true, expected: ['FSG', 'ICCL', 'PEW'] },
  ];
  const accounts: string[] = [];
  for (const [index, entry] of cases.entries()) accounts.push(await provisionUser(db, { email: `user${index}@example.test`, name: 'Synthetic User', department: 'Test', companyId: 'PEW', ...entry }, 'Synthetic-test-password-123'));
  const foreign = await provisionUser(db, { email: 'foreign@example.test', name: 'Foreign User', department: 'Test', companyId: 'FSG', role: 'HR' }, 'Synthetic-test-password-123');
  for (const company of ['PEW','ICCL','FSG']) {
    db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(company, company, accounts[0], 'Pending Approval', 3, JSON.stringify({ id: company, companyId: company, requesterId: accounts[0], workflowConfig: { processingUserIds: [accounts[1]] }, formData: {}, approvalHistory: [] }));
    db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run(company, 'Admin Work Request', 1, JSON.stringify({ companyId: company, stages: [] }));
  }
  const app = await createApp(db, { origin: 'http://localhost:3000', secureCookies: false });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal((await fetch(`${base}/api/requests`)).status, 401);
    assert.equal((await fetch(`${base}/api/bootstrap`)).status, 401);
    const unrelated = await provisionUser(db, {email:'unrelated@example.test',name:'Unrelated',department:'Admin',companyId:'PEW',role:'HR'},'Synthetic-test-password-123');
    const unrelatedHeaders={Cookie:`precisign_session=${createSession(db,unrelated)}`};
    assert.deepEqual(await(await fetch(`${base}/api/requests`,{headers:unrelatedHeaders})).json(),[]);
    assert.equal((await fetch(`${base}/api/requests/PEW`,{headers:unrelatedHeaders})).status,404);
    const pdfHeaders = { ...unrelatedHeaders, Origin: 'http://localhost:3000', 'Content-Type': 'application/json' };
    const pdfBody = JSON.stringify({ version: 1, updatedAt: 'synthetic' });
    assert.equal((await fetch(`${base}/api/requests/PEW/document-pdf`, { method: 'POST', headers: pdfHeaders, body: pdfBody })).status, 404);
    assert.equal((await fetch(`${base}/api/requests/PEW/document-pdf`, { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: pdfBody })).status, 401);
    for (const [index, entry] of cases.entries()) {
      const headers = { Cookie: `precisign_session=${createSession(db, accounts[index])}` };
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
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
