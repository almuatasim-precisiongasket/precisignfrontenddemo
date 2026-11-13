import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { openAsyncDatabase, migrateAsyncDatabase } from './asyncDatabase';
import { createApp } from './app';
import { hashPassword } from './auth';
import { MockEmailTransport } from './email';
import type { DatabaseSync } from 'node:sqlite';
import type { AsyncDatabase } from './asyncDatabase';
import { INITIAL_WORKFLOWS } from '../src/data/seedData';

async function insertTestUser(
  db: DatabaseSync | AsyncDatabase,
  id: string,
  email: string,
  name: string,
  role: string,
  department: string,
  companyId: string,
  password: string
) {
  const hash = await hashPassword(password);
  const sql = `
    INSERT INTO users (id, email, name, role, department, company_id, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [id, email, name, role, department, companyId, hash];
  if ('prepare' in db) {
    db.prepare(sql).run(...params);
  } else {
    await db.execute(sql, params);
  }
}

async function setupTestApp(db: DatabaseSync | AsyncDatabase) {
  const transport = new MockEmailTransport();
  const app = await createApp(db, {
    origin: 'http://127.0.0.1:3000',
    secureCookies: false,
    emailTransport: transport,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/api`;

  return { server, base, transport };
}

test('Task 7 — Single parse per action across SQLite and Async Database paths', async (t) => {
  const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';

  async function runSuiteForDatabase(label: string, createDb: () => Promise<DatabaseSync | AsyncDatabase>) {
    await t.test(`${label}: successful action, denied action, stale revision, notification`, async () => {
      const db = await createDb();
      const { server, base, transport } = await setupTestApp(db);

      try {
        const password = 'Synthetic-password-123';
        const anzarId = `u-anzar-${label}`;
        const shekharId = `u-shekhar-${label}`;
        const outsiderId = `u-outsider-${label}`;

        await insertTestUser(db, anzarId, `anzar-${label}@example.test`, 'Anzar', 'Admin', 'Operations', 'PEW', password);
        await insertTestUser(db, shekharId, `shekhar-${label}@example.test`, 'Shekhar', 'General Manager', 'Operations', 'PEW', password);
        await insertTestUser(db, outsiderId, `outsider-${label}@example.test`, 'Outsider', 'HR', 'PEW', 'PEW', password);

        // 2-stage workflow: Shekhar -> Shekhar (or Manager -> Director)
        const wf = {
          ...INITIAL_WORKFLOWS[0],
          stages: [
            { ...INITIAL_WORKFLOWS[0].stages[0], id: 's1', assignedUserId: shekharId, isFinalApproval: false },
            { ...INITIAL_WORKFLOWS[0].stages[1], id: 's2', assignedUserId: shekharId, isFinalApproval: true },
          ],
        };

        if ('prepare' in db) {
          db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW', 'Admin Work Request', 1, JSON.stringify(wf));
        } else {
          await db.execute('INSERT INTO workflows VALUES (?,?,?,?)', ['PEW', 'Admin Work Request', 1, JSON.stringify(wf)]);
        }

        const login = async (email: string) => {
          const res = await fetch(`${base}/auth/login`, {
            method: 'POST',
            headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          assert.equal(res.status, 200);
          return res.headers.get('set-cookie')!.split(';')[0];
        };

        const anzarCookie = await login(`anzar-${label}@example.test`);
        const shekharCookie = await login(`shekhar-${label}@example.test`);
        const outsiderCookie = await login(`outsider-${label}@example.test`);

        // 1. Submit request
        const createRes = await fetch(`${base}/requests`, {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1:3000', Cookie: anzarCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: 'PEW',
            formType: 'Admin Work Request',
            signatureDataUrl: signature,
            formData: {
              dateOfRequest: '10 Nov 2026',
              department: 'Operations',
              priority: 'Medium',
              workDescription: 'Workshop maintenance',
              documents: { onlineDocumentChamber: false, physicalDocumentChamber: false, companyDocumentAjeer: false, employeeSalaryCertificate: false, permanentEmploymentVisa: false, workVisitVisa: false, businessVisitVisa: false, agencyWakala: false, others: false, othersDescription: '' },
            },
          }),
        });

        assert.equal(createRes.status, 201);
        const created = (await createRes.json()) as { id: string; revision: number };
        assert.equal(created.revision, 1);

        // 2. Denied actions:
        // 2a. User without read access gets 404
        const outsiderRes = await fetch(`${base}/requests/${created.id}/approve`, {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1:3000', Cookie: outsiderCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision: 1, signatureDataUrl: signature }),
        });
        assert.equal(outsiderRes.status, 404, 'User without read access gets 404');

        // 2b. Authorized viewer without approval authority on stage 1 gets 403
        const deniedRes = await fetch(`${base}/requests/${created.id}/approve`, {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1:3000', Cookie: anzarCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision: 1, signatureDataUrl: signature }),
        });
        assert.equal(deniedRes.status, 403, 'Unauthorized signer action must be rejected with 403');

        // 3. Stale revision: valid user sends wrong expectedRevision
        const staleRes = await fetch(`${base}/requests/${created.id}/approve`, {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1:3000', Cookie: shekharCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision: 999, signatureDataUrl: signature }),
        });
        assert.equal(staleRes.status, 409, 'Stale revision must be rejected with 409');

        // 4. Successful action: legitimate assigned signer approves stage 1
        const approveRes = await fetch(`${base}/requests/${created.id}/approve`, {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1:3000', Cookie: shekharCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision: 1, signatureDataUrl: signature, comment: 'Stage 1 verified' }),
        });
        assert.equal(approveRes.status, 200, 'Legitimate action must succeed');
        const approved = (await approveRes.json()) as { id: string; revision: number; status: string };
        assert.equal(approved.revision, 2);

        // 5. Notification-producing check: verify outbox has queued the next action notification
        if ('prepare' in db) {
          const outboxRows = db.prepare('SELECT * FROM email_outbox WHERE request_id = ?').all(created.id);
          assert.ok(outboxRows.length > 0, 'Outbox rows must be queued on notification-producing action');
        } else {
          const res = await db.execute('SELECT * FROM email_outbox WHERE request_id = ?', [created.id]);
          assert.ok(res.rows.length > 0, 'Outbox rows must be queued on notification-producing action');
        }
      } finally {
        server.close();
      }
    });
  }

  // Run suite against SQLite path
  await runSuiteForDatabase('SQLite Path', async () => openDatabase(':memory:'));

  // Run suite against Async Database path (Turso-compatible @libsql/client)
  await runSuiteForDatabase('Async Database Path', async () => {
    const db = openAsyncDatabase('file::memory:');
    await migrateAsyncDatabase(db);
    return db;
  });
});
