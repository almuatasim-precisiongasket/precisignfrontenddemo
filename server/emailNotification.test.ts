import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './db';
import { provisionUser } from './auth';
import { createApp } from './app';
import {
  MockEmailTransport,
  ResendEmailTransport,
  OutboxProcessor,
  renderEmailContent,
  createOutboxItem,
  type OutboxRecord,
  type EmailPayload,
  type IEmailTransport,
} from './email';
import type { UserProfile } from '../src/types/index';
import { INITIAL_WORKFLOWS, INITIAL_REQUESTS } from '../src/data/seedData';

test('Email Outbox & Notification Lifecycle Suite', async (t) => {
  const localDb = openDatabase(':memory:');
  const transport = new MockEmailTransport();
  let fakeNow = Date.now();
  const nowFn = () => fakeNow;

  const app = await createApp(localDb, {
    origin: 'http://localhost:3000',
    secureCookies: false,
    now: nowFn,
    emailTransport: transport,
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;

  // Fixtures: Anzar (requester), Shekhar (intermediate 1), Bob (intermediate 2), Afzal (final)
  const password = 'Synthetic-password-123';
  const addUser = async (input: Parameters<typeof provisionUser>[1]) => {
    return await provisionUser(localDb, input, password);
  };

  const anzarId = await addUser({ email: 'anzar@example.test', name: 'Anzar Requester', department: 'Operations', companyId: 'PEW', role: 'Admin' });
  const shekharId = await addUser({ email: 'shekhar@example.test', name: 'Shekhar Signer', department: 'Management', companyId: 'PEW', role: 'General Manager' });
  const bobId = await addUser({ email: 'bob@example.test', name: 'Bob Intermediate', department: 'Technical', companyId: 'PEW', role: 'General Manager' });
  const afzalId = await addUser({ email: 'afzal@example.test', name: 'Afzal Director', department: 'Executive', companyId: 'PEW', role: 'Director' });

  // 4-stage workflow: Shekhar -> Bob -> Afzal
  const workflow = {
    ...INITIAL_WORKFLOWS[0],
    stages: [
      { ...INITIAL_WORKFLOWS[0].stages[0], id: 'stage-1', name: 'Initial Review', assignedUserId: shekharId, isFinalApproval: false },
      { ...INITIAL_WORKFLOWS[0].stages[0], id: 'stage-2', name: 'Technical Review', assignedUserId: bobId, isFinalApproval: false },
      { ...INITIAL_WORKFLOWS[0].stages[1], id: 'stage-3', name: 'Director Approval', assignedUserId: afzalId, isFinalApproval: true },
    ],
  };

  localDb.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW', 'Admin Work Request', 1, JSON.stringify(workflow));

  const cookies = new Map<string, string>();
  const login = async (email: string) => {
    const res = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie')!.split(';')[0];
  };

  cookies.set(anzarId, await login('anzar@example.test'));
  cookies.set(shekharId, await login('shekhar@example.test'));
  cookies.set(bobId, await login('bob@example.test'));
  cookies.set(afzalId, await login('afzal@example.test'));

  const post = (path: string, userId: string, body: unknown) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: cookies.get(userId)!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
  const f = INITIAL_REQUESTS[0].formData;
  const formData = { dateOfRequest: f.dateOfRequest, department: 'Operations', priority: 'Medium', workDescription: 'Project Alpha Request', documents: f.documents };
  const input = { companyId: 'PEW', formType: 'Admin Work Request', formData, signatureDataUrl: signature };

  await t.test('1. Submission enqueues submitter confirmation, first signer action, and all upcoming signers', async () => {
    transport.clear();
    const res = await post('/requests', anzarId, input);
    assert.equal(res.status, 201);
    const req = (await res.json()) as { id: string };

    // Check outbox rows in DB
    const rows = (localDb.prepare('SELECT * FROM email_outbox WHERE request_id = ? ORDER BY created_at ASC').all(req.id) as unknown) as OutboxRecord[];
    assert.equal(rows.length, 4, 'Should enqueue 4 emails for a 4-party submission');

    const [anzarRow, shekharRow, bobRow, afzalRow] = rows;

    // Submitter
    assert.equal(anzarRow.recipient_email, 'anzar@example.test');
    assert.equal(anzarRow.event_type, 'REQUEST_SUBMITTED');
    assert.match(anzarRow.subject, /Request submitted/i);

    // Active First Signer
    assert.equal(shekharRow.recipient_email, 'shekhar@example.test');
    assert.equal(shekharRow.event_type, 'ACTION_REQUIRED');
    assert.match(shekharRow.subject, /Signature needed/i);

    // Upcoming Intermediate Signer
    assert.equal(bobRow.recipient_email, 'bob@example.test');
    assert.equal(bobRow.event_type, 'UPCOMING_SIGNER_NOTICE');
    assert.match(bobRow.subject, /Upcoming review/i);

    // Upcoming Final Approver
    assert.equal(afzalRow.recipient_email, 'afzal@example.test');
    assert.equal(afzalRow.event_type, 'UPCOMING_FINAL_APPROVER_NOTICE');
    assert.match(afzalRow.subject, /Upcoming approval/i);

    // Verify all rows have status 'accepted' or 'delivered' because outboxProcessor ran post-commit
    for (const r of rows) {
      assert.ok(['accepted', 'delivered'].includes(r.status));
      assert.ok(r.resend_id?.startsWith('mock_resend_'));
      assert.ok(r.accepted_at);
    }
  });

  await t.test('2. Confidentiality: Emails contain metadata and portal links but no attachments or financial data', async () => {
    const row = (localDb.prepare('SELECT * FROM email_outbox LIMIT 1').get() as unknown) as OutboxRecord;
    const payload = JSON.parse(row.payload_json) as EmailPayload;

    assert.ok(payload.companyId);
    assert.ok(payload.formType);
    assert.ok(payload.requestId);
    assert.ok(payload.requesterName);
    assert.ok(payload.portalUrl.includes('/requests/'));

    // Check rendered HTML and plain text
    const { html, text } = renderEmailContent(row.event_type, payload);
    assert.ok(!html.includes('data:image/'), 'Must not leak signature data URLs');
    assert.ok(!text.includes('data:image/'));
    assert.ok(html.includes(payload.portalUrl));
    assert.ok(html.includes('Confidential form contents and attachments are protected'));
  });

  await t.test('3. Stage advancement: Next active signer receives ACTION_REQUIRED', async () => {
    // Get the request created in test 1
    const reqRow = (localDb.prepare('SELECT id, revision FROM requests LIMIT 1').get() as unknown) as { id: string; revision: number };

    // Shekhar signs stage 1
    const res1 = await post(`/requests/${reqRow.id}/approve`, shekharId, {
      expectedRevision: reqRow.revision,
      signatureDataUrl: signature,
      comment: 'Reviewed by Shekhar',
    });
    assert.equal(res1.status, 200);

    // Should enqueue ACTION_REQUIRED for Bob (stage 2)
    const bobRows = (localDb.prepare(
      'SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ? AND event_type = ?'
    ).all(reqRow.id, bobId, 'ACTION_REQUIRED') as unknown) as OutboxRecord[];
    assert.equal(bobRows.length, 1);
    assert.equal(bobRows[0].status, 'delivered');

    // Bob signs stage 2
    const res2 = await post(`/requests/${reqRow.id}/approve`, bobId, {
      expectedRevision: reqRow.revision + 1,
      signatureDataUrl: signature,
      comment: 'Reviewed by Bob',
    });
    assert.equal(res2.status, 200);

    // Should enqueue ACTION_REQUIRED for Afzal (final stage)
    const afzalRows = (localDb.prepare(
      'SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ? AND event_type = ?'
    ).all(reqRow.id, afzalId, 'ACTION_REQUIRED') as unknown) as OutboxRecord[];
    assert.equal(afzalRows.length, 1);
  });

  await t.test('4. Early final signing guard: Afzal signs early, intermediate signs later, no duplicate sign request', async () => {
    // Submit a fresh request
    const createRes = await post('/requests', anzarId, input);
    assert.equal(createRes.status, 201);
    const req = (await createRes.json()) as { id: string };

    // Afzal signs early (final stage)
    const earlyRes = await post(`/requests/${req.id}/approve`, afzalId, {
      expectedRevision: 1,
      signatureDataUrl: signature,
      comment: 'Afzal approves early',
    });
    assert.equal(earlyRes.status, 200);

    // Verify Shekhar has exactly 1 ACTION_REQUIRED email (from submission), not a duplicate after Afzal's early approval
    const shekharActionEmails = (localDb.prepare(
      'SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ? AND event_type = ?'
    ).all(req.id, shekharId, 'ACTION_REQUIRED') as unknown) as OutboxRecord[];
    assert.equal(shekharActionEmails.length, 1, 'Intermediate signer must NOT receive duplicate ACTION_REQUIRED email when final approver signs early');

    // Clear transport to isolate subsequent triggers
    transport.clear();

    // Now Shekhar signs stage 0
    const shekharRes = await post(`/requests/${req.id}/approve`, shekharId, {
      expectedRevision: 2,
      signatureDataUrl: signature,
    });
    assert.equal(shekharRes.status, 200);

    // Bob signs stage 1
    const bobRes = await post(`/requests/${req.id}/approve`, bobId, {
      expectedRevision: 3,
      signatureDataUrl: signature,
    });
    assert.equal(bobRes.status, 200);
    const completedReq = (await bobRes.json()) as { status: string };
    assert.equal(completedReq.status, 'Approved', 'Route completes because Afzal signed early');

    // Verify Afzal was NEVER sent an ACTION_REQUIRED email
    const afzalActionEmails = (localDb.prepare(
      'SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ? AND event_type = ?'
    ).all(req.id, afzalId, 'ACTION_REQUIRED') as unknown) as OutboxRecord[];
    assert.equal(afzalActionEmails.length, 0, 'Afzal must not be asked to sign twice');

    // Verify Anzar received the completion summary
    const completionEmails = (localDb.prepare(
      'SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ? AND event_type = ?'
    ).all(req.id, anzarId, 'ROUTE_COMPLETED') as unknown) as OutboxRecord[];
    assert.equal(completionEmails.length, 1);
  });

  await t.test('5. Completion summary accurately distinguishes signed vs bypassed steps without leaking bypass reason', async () => {
    // Create another request and override it via Director
    const createRes = await post('/requests', anzarId, input);
    const req = (await createRes.json()) as { id: string };

    const overrideRes = await post(`/requests/${req.id}/override`, afzalId, {
      expectedRevision: 1,
      reason: 'Urgent emergency override required',
      signatureDataUrl: signature,
    });
    assert.equal(overrideRes.status, 200);

    const compRow = (localDb.prepare(
      'SELECT * FROM email_outbox WHERE request_id = ? AND event_type = ?'
    ).get(req.id, 'ROUTE_COMPLETED') as unknown) as OutboxRecord;
    assert.ok(compRow);

    const payload = JSON.parse(compRow.payload_json) as EmailPayload;
    assert.ok(payload.completionSummary);
    const steps = payload.completionSummary.steps;

    // Stages 1 and 2 bypassed, Stage 3 signed
    assert.equal(steps[0].status, 'Bypassed');
    assert.equal(steps[1].status, 'Bypassed');
    assert.equal(steps[2].status, 'Signed');

    // Check rendered email body does NOT leak the text "Urgent emergency override required"
    const { html, text } = renderEmailContent('ROUTE_COMPLETED', payload);
    assert.ok(!html.includes('Urgent emergency override required'), 'Bypass reason text must stay inside PreciSign');
    assert.ok(!text.includes('Urgent emergency override required'));
    assert.ok(html.includes('Bypassed'));
    assert.ok(html.includes('Signed'));
  });

  await t.test('6. Inactive backup received no emails before formal replacement', async () => {
    // Add backup user
    const backupId = await addUser({ email: 'backup@example.test', name: 'Backup User', department: 'Management', companyId: 'PEW', role: 'General Manager' });

    // Submit request
    const createRes = await post('/requests', anzarId, input);
    const req = (await createRes.json()) as { id: string };

    // Check backup outbox
    const backupRows = (localDb.prepare('SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ?').all(req.id, backupId) as unknown) as OutboxRecord[];
    assert.equal(backupRows.length, 0, 'Inactive backup must receive 0 emails');
  });

  await t.test('7. Failed or unauthorized actions create zero outbox rows', async () => {
    const beforeCount = (localDb.prepare('SELECT count(*) as c FROM email_outbox').get() as { c: number }).c;

    // 1. Unauthorized submit
    const unauthRes = await post('/requests', shekharId, { ...input, companyId: 'INVALID' });
    assert.equal(unauthRes.status, 400);

    // 2. Revision conflict or non-existent request with valid schema
    const conflictRes = await post('/requests/non-existent/approve', shekharId, { expectedRevision: 999, signatureDataUrl: signature });
    assert.equal(conflictRes.status, 404);

    const afterCount = (localDb.prepare('SELECT count(*) as c FROM email_outbox').get() as { c: number }).c;
    assert.equal(afterCount, beforeCount, 'Zero outbox rows must be inserted on failure');
  });

  const samplePayload = JSON.stringify({
    companyId: 'PEW',
    companyName: 'Precision Engineering Works',
    formType: 'Admin Work Request',
    requestId: 'PEW-AW-2026-test',
    requesterName: 'Anzar Requester',
    recipientName: 'Test User',
    recipientEmail: 'test@example.test',
    portalUrl: 'http://localhost:3000/requests/test',
  });

  await t.test('8. Retry and exponential backoff on transient failure preserves request integrity', async () => {
    // Create custom outbox processor with fast backoff for testing
    const processor = new OutboxProcessor(localDb, transport, {
      backoffBaseMs: 50,
      maxBackoffMs: 200,
      now: nowFn,
    });

    // Insert a pending synthetic row
    const reqId = randomUUID();
    localDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', anzarId, 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();
    localDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', ?, 'transient@example.test', 'Transient User', 'Test', ?, ?, 'pending', 0, 3, ?, ?)
    `).run(outboxId, reqId, shekharId, samplePayload, `idem-${outboxId}`, fakeNow, fakeNow);

    // Simulate transient 429 rate limit
    transport.failNextWith = { message: 'Too many requests', retryable: true };
    const res1 = await processor.processBatch();
    assert.equal(res1.failed, 1);

    const rowAfterFail = (localDb.prepare('SELECT * FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(rowAfterFail.status, 'pending');
    assert.equal(rowAfterFail.attempts, 1);
    assert.ok(rowAfterFail.next_attempt_at > fakeNow);
    assert.match(rowAfterFail.last_error!, /Too many requests/);

    // Advance clock past backoff
    fakeNow += 100;
    const res2 = await processor.processBatch();
    assert.equal(res2.accepted, 1);

    const rowAfterSuccess = (localDb.prepare('SELECT * FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(rowAfterSuccess.status, 'delivered');
    assert.ok(rowAfterSuccess.resend_id);
    assert.ok(rowAfterSuccess.accepted_at);
  });

  await t.test('9. 24-hour idempotency expiration flags uncertain outcome as failed_unconfirmed', async () => {
    const processor = new OutboxProcessor(localDb, transport, { now: nowFn });
    const reqId = randomUUID();
    localDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', anzarId, 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();

    // 25 hours ago
    const oldCreated = fakeNow - 25 * 60 * 60 * 1000;
    localDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', ?, 'old@example.test', 'Old User', 'Test', ?, ?, 'pending', 1, 3, ?, ?)
    `).run(outboxId, reqId, shekharId, samplePayload, `idem-${outboxId}`, oldCreated, fakeNow);

    await processor.processBatch();

    const row = (localDb.prepare('SELECT * FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(row.status, 'failed_unconfirmed');
    assert.match(row.last_error!, /Idempotency window/);
  });

  await t.test('10. Restart recovery: Worker recovers and processes expired lease after crash', async () => {
    const processor = new OutboxProcessor(localDb, transport, { now: nowFn });
    const reqId = randomUUID();
    localDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', anzarId, 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();

    // Stuck in 'processing' from crashed worker with expired lease
    const expiredLease = fakeNow - 1000;
    localDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        lease_token, lease_expires_at, created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', ?, 'recover@example.test', 'Recover User', 'Test', ?, ?, 'processing', 0, 3, 'crashed_token', ?, ?, ?)
    `).run(outboxId, reqId, shekharId, samplePayload, `idem-${outboxId}`, expiredLease, fakeNow, fakeNow);

    const res = await processor.processBatch('new_worker_token');
    assert.equal(res.accepted, 1);

    const row = (localDb.prepare('SELECT * FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(row.status, 'delivered');
    assert.equal(row.lease_token, null);
  });

  await t.test('11. Concurrent workers: Two workers processing simultaneously never duplicate claims', async () => {
    const worker1 = new OutboxProcessor(localDb, transport, { now: nowFn });
    const worker2 = new OutboxProcessor(localDb, transport, { now: nowFn });

    // Insert 5 pending rows
    const reqId = randomUUID();
    localDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', anzarId, 'Pending Approval', 1, '{}');

    for (let i = 0; i < 5; i++) {
      const id = randomUUID();
      localDb.prepare(`
        INSERT INTO email_outbox (
          id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
          subject, payload_json, idempotency_key, status, attempts, max_attempts,
          created_at, next_attempt_at
        ) VALUES (?, ?, 'ACTION_REQUIRED', ?, 'concurrent@example.test', 'User', 'Subject', ?, ?, 'pending', 0, 3, ?, ?)
      `).run(id, reqId, shekharId, samplePayload, `idem-concurrent-${id}`, fakeNow, fakeNow);
    }

    // Run both workers concurrently
    const [res1, res2] = await Promise.all([
      worker1.processBatch('worker_token_1'),
      worker2.processBatch('worker_token_2'),
    ]);

    assert.equal(res1.accepted + res2.accepted, 5, 'All 5 rows should be claimed and processed across both workers');
    const remainingPending = (localDb.prepare("SELECT count(*) as c FROM email_outbox WHERE status = 'pending'").get() as { c: number }).c;
    assert.equal(remainingPending, 0);
  });

  await t.test('12. Resend transport safe delivery guard redirects unverified domains in development', async () => {
    const apiKey = process.env.RESEND_API_KEY;
    const resendTransport = new ResendEmailTransport({
      apiKey: apiKey || 're_mock_test_key_for_unit_tests',
      sender: 'PreciSign <onboarding@resend.dev>',
      mode: 'sandbox',
      testRecipient: 'delivered@resend.dev',
    });

    if (apiKey) {
      const sendRes = await resendTransport.send({
        to: 'unverified-employee@somecompany.test',
        toName: 'Employee',
        subject: 'PreciSign Sandbox Test',
        html: '<p>Testing safe sandbox redirection</p>',
        text: 'Testing safe sandbox redirection',
        idempotencyKey: `live-idem-${Date.now()}`,
      });

      assert.equal(sendRes.accepted, true, 'Resend should accept sandbox delivery');
      assert.ok(sendRes.resendId, 'Resend should return message ID');
    }
  });

  await t.test('13. Normal server startup resumes pending emails and expired leases automatically', async () => {
    const restartDb = openDatabase(':memory:');
    const mockTransport = new MockEmailTransport();
    let restartNow = Date.now();

    // Insert user, request, pending email, and expired-lease email before server boots
    const reqId = randomUUID();
    restartDb.prepare('INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES (?,?,?,?,?,?,?)')
      .run('u1', 'u1@test.com', 'User 1', 'Admin', 'Ops', 'PEW', 'hash');
    restartDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', 'u1', 'Pending Approval', 1, '{}');

    const id1 = randomUUID();
    const id2 = randomUUID();
    restartDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', 'u1', 'u1@test.com', 'User 1', 'Pending on boot', ?, ?, 'pending', 0, 3, ?, ?)
    `).run(id1, reqId, samplePayload, `idem-boot-1`, restartNow, restartNow);

    restartDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        lease_token, lease_expires_at, created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', 'u1', 'u1@test.com', 'User 1', 'Expired lease on boot', ?, ?, 'processing', 1, 3, 'crashed_token', ?, ?, ?)
    `).run(id2, reqId, samplePayload, `idem-boot-2`, restartNow - 1000, restartNow - 2000, restartNow - 1000);

    // Boot the app via standard createApp with autoStartWorker: true
    const restartApp = await createApp(restartDb, {
      origin: 'http://localhost:3000',
      secureCookies: false,
      now: () => restartNow,
      emailTransport: mockTransport,
      autoStartWorker: true,
    });

    // Wait for auto-triggered startup batch
    await new Promise(r => setTimeout(r, 60));

    // Verify both items were automatically processed on startup without any API interaction
    const row1 = (restartDb.prepare('SELECT status, resend_id FROM email_outbox WHERE id = ?').get(id1) as unknown) as OutboxRecord;
    const row2 = (restartDb.prepare('SELECT status, resend_id FROM email_outbox WHERE id = ?').get(id2) as unknown) as OutboxRecord;

    assert.equal(row1.status, 'delivered', 'Pending outbox row should be automatically delivered on server startup');
    assert.equal(row2.status, 'delivered', 'Expired lease outbox row should be automatically recovered on server startup');
    assert.equal(mockTransport.sent.length, 2);

    // Verify graceful shutdown stops the worker
    assert.ok((restartApp as any).outboxProcessor);
    (restartApp as any).outboxProcessor.stop();
  });

  await t.test('14. Pre-send recording guarantees attempt counter and timestamp are saved before transport is invoked', async () => {
    const isolatedDb = openDatabase(':memory:');
    let checkedDbBeforeSend = false;
    let recordedAttempts = -1;
    let recordedFirstAttemptAt: number | null = null;
    let testNow = Date.now();

    const crashTransport: IEmailTransport = {
      async send(options) {
        // Inspect database state at the exact moment send() is executing
        const row = (isolatedDb.prepare('SELECT attempts, first_attempt_at, last_attempt_at FROM email_outbox WHERE idempotency_key = ?')
          .get(options.idempotencyKey) as unknown) as OutboxRecord;
        if (row) {
          checkedDbBeforeSend = true;
          recordedAttempts = row.attempts;
          recordedFirstAttemptAt = row.first_attempt_at;
        }
        // Simulate immediate crash during external network call
        throw new Error('Simulated process / network crash during transport.send()');
      },
    };

    const processor = new OutboxProcessor(isolatedDb, crashTransport, { now: () => testNow });
    const reqId = randomUUID();
    isolatedDb.prepare('INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES (?,?,?,?,?,?,?)')
      .run('u-crash', 'crash@example.test', 'Crash User', 'Admin', 'Ops', 'PEW', 'hash');
    isolatedDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', 'u-crash', 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();
    const idemKey = `idem-crash-${outboxId}`;

    isolatedDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', 'u-crash', 'crash@example.test', 'Crash User', 'Subject', ?, ?, 'pending', 0, 3, ?, ?)
    `).run(outboxId, reqId, samplePayload, idemKey, testNow, testNow);

    // Run batch - transport throws inside try/catch and records transient error
    await processor.processBatch();

    assert.ok(checkedDbBeforeSend, 'Transport was invoked');
    assert.equal(recordedAttempts, 1, 'Attempt counter must be incremented in DB BEFORE transport is called');
    assert.equal(recordedFirstAttemptAt, testNow, 'first_attempt_at must be recorded in DB BEFORE transport is called');

    // Verify row in DB reflects that an attempt was made even though transport crashed
    const rowInDb = (isolatedDb.prepare('SELECT attempts, first_attempt_at, status FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(rowInDb.attempts, 1);
    assert.equal(rowInDb.first_attempt_at, testNow);
    assert.equal(rowInDb.status, 'pending');
  });

  await t.test('15. Worker losing its lease cannot overwrite a newer outcome written by a successor worker', async () => {
    const workerB = new OutboxProcessor(localDb, transport, { now: nowFn });

    const reqId = randomUUID();
    localDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', anzarId, 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();

    localDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', ?, 'lease-race@example.test', 'User', 'Subject', ?, ?, 'pending', 0, 3, ?, ?)
    `).run(outboxId, reqId, shekharId, samplePayload, `idem-lease-${outboxId}`, fakeNow, fakeNow);

    // 1. Worker A claims the row
    const tokenA = 'token-worker-A';
    localDb.prepare(`
      UPDATE email_outbox
      SET status = 'processing', lease_token = ?, lease_expires_at = ?
      WHERE id = ?
    `).run(tokenA, fakeNow + 1000, outboxId);

    // 2. Advance time so Worker A's lease expires
    fakeNow += 2000;

    // 3. Worker B claims and processes the row
    const tokenB = 'token-worker-B';
    const batchB = await workerB.processBatch(tokenB);
    assert.equal(batchB.accepted, 1);

    // Row is now delivered by Worker B
    const rowAfterB = (localDb.prepare('SELECT status, lease_token FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(rowAfterB.status, 'delivered');
    assert.equal(rowAfterB.lease_token, null);

    // 4. Now Worker A (delayed) attempts to write its outcome using stale tokenA
    const staleUpdate = localDb.prepare(`
      UPDATE email_outbox
      SET status = 'failed', last_error = 'Stale failure from slow worker A', lease_token = NULL
      WHERE id = ? AND lease_token = ?
    `).run(outboxId, tokenA);

    assert.equal(staleUpdate.changes, 0, 'Worker A must not update the row because its lease token was superseded');

    // Confirm DB still has Worker B's successful delivered outcome
    const finalRow = (localDb.prepare('SELECT status, last_error FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(finalRow.status, 'delivered');
    assert.equal(finalRow.last_error, null);
  });

  await t.test('16. Explicit delivery modes: disabled mode, missing API key, and sandbox recipient redirection', async () => {
    // 1. Disabled mode
    const disabledTransport = new ResendEmailTransport({ mode: 'disabled' });
    assert.equal(disabledTransport.getMode(), 'disabled');
    const disRes = await disabledTransport.send({
      to: 'anyone@example.test',
      toName: 'Anyone',
      subject: 'Test Disabled',
      html: '<p>Disabled</p>',
      text: 'Disabled',
      idempotencyKey: 'idem-dis',
    });
    assert.equal(disRes.accepted, false);
    assert.equal(disRes.delivered, false);
    assert.match(disRes.error!, /mode=disabled/);
    assert.equal(disRes.retryable, false);

    // 2. Missing API key in sandbox mode
    const missingKeyTransport = new ResendEmailTransport({ mode: 'sandbox', apiKey: '' });
    const missRes = await missingKeyTransport.send({
      to: 'delivered@resend.dev',
      toName: 'Delivered',
      subject: 'Test Missing Key',
      html: '<p>Missing</p>',
      text: 'Missing',
      idempotencyKey: 'idem-miss',
    });
    assert.equal(missRes.accepted, false);
    assert.equal(missRes.delivered, false);
    assert.match(missRes.error!, /Missing RESEND_API_KEY/);
    assert.equal(missRes.retryable, false);

    // Outbox processor with missing configuration marks row as failed, never successful
    const missProcessor = new OutboxProcessor(localDb, missingKeyTransport, { now: nowFn });
    const reqId = randomUUID();
    localDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', anzarId, 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();
    localDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', ?, 'missing-key@example.test', 'User', 'Subject', ?, ?, 'pending', 0, 3, ?, ?)
    `).run(outboxId, reqId, shekharId, samplePayload, `idem-no-key-${outboxId}`, fakeNow, fakeNow);

    const procRes = await missProcessor.processBatch();
    assert.equal(procRes.failed, 1);
    assert.equal(procRes.accepted, 0);

    const failedRow = (localDb.prepare('SELECT status, last_error FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(failedRow.status, 'failed');
    assert.match(failedRow.last_error!, /Missing RESEND_API_KEY/);

    // 3. Live mode with resend.dev sender domain rejected
    const liveTransport = new ResendEmailTransport({
      mode: 'live',
      apiKey: 're_dummy_key',
      sender: 'PreciSign <onboarding@resend.dev>',
    });
    const liveRes = await liveTransport.send({
      to: 'employee@precision.test',
      toName: 'Employee',
      subject: 'Live Test',
      html: '<p>Live</p>',
      text: 'Live',
      idempotencyKey: 'idem-live',
    });
    assert.equal(liveRes.accepted, false);
    assert.match(liveRes.error!, /verified custom sender domain/);
  });

  await t.test('17. Six test accounts mapping: All designated email addresses correctly mapped and notified in isolated DB', async () => {
    const pilotDb = openDatabase(':memory:');
    const mockTransport = new MockEmailTransport();
    let pilotNow = Date.now();

    const pilotApp = await createApp(pilotDb, {
      origin: 'http://localhost:3000',
      secureCookies: false,
      now: () => pilotNow,
      emailTransport: mockTransport,
    });

    const pilotServer = pilotApp.listen(0, '127.0.0.1');
    await once(pilotServer, 'listening');
    try {
      const pilotBase = `http://127.0.0.1:${(pilotServer.address() as { port: number }).port}/api`;

      // The six designated accounts:
      // 1. Muatasim: login muatasim@test.com, notification mutasimahmedtasu2023@gmail.com
      // 2. Afzal Kazi: mutasim.map@gmail.com
      // 3. Farida: contactmalhamahere@gmail.com
      // 4. Shekhar: mycodelabs786@gmail.com
      // 5. Anzar: quranlingo@gmail.com
      // 6. Taqvi: mutasimahmed02@gmail.com
      const pilotPassword = 'Pilot-Secure-Password-123';

      const muatasimId = await provisionUser(pilotDb, {
        email: 'muatasim@test.com',
        name: 'Muatasim',
        role: 'Admin',
        department: 'Management',
        companyId: 'PEW',
        isGroupAdmin: true,
      }, pilotPassword);

      const afzalId = await provisionUser(pilotDb, {
        email: 'mutasim.map@gmail.com',
        name: 'Afzal Kazi',
        role: 'Director',
        department: 'Executive',
        companyId: 'PEW',
      }, pilotPassword);

      const faridaId = await provisionUser(pilotDb, {
        email: 'contactmalhamahere@gmail.com',
        name: 'Farida',
        role: 'General Manager',
        department: 'Finance',
        companyId: 'PEW',
      }, pilotPassword);

      const shekharId = await provisionUser(pilotDb, {
        email: 'mycodelabs786@gmail.com',
        name: 'Shekhar',
        role: 'General Manager',
        department: 'Operations',
        companyId: 'PEW',
      }, pilotPassword);

      const anzarId = await provisionUser(pilotDb, {
        email: 'quranlingo@gmail.com',
        name: 'Anzar',
        role: 'Admin',
        department: 'Operations',
        companyId: 'PEW',
      }, pilotPassword);

      const taqviId = await provisionUser(pilotDb, {
        email: 'mutasimahmed02@gmail.com',
        name: 'Taqvi',
        role: 'General Manager',
        department: 'Technical',
        companyId: 'PEW',
      }, pilotPassword);

      // Configure account_access with multi-company and form grants for all six pilot accounts
      const grantSql = `
        INSERT INTO account_access (user_id, notification_email, company_grants, form_grants)
        VALUES (?, ?, '["PEW","ICCL","FSG"]', '{"PEW":["Admin Work Request"],"ICCL":["Admin Work Request"],"FSG":["Admin Work Request"]}')
        ON CONFLICT(user_id) DO UPDATE SET
          notification_email = excluded.notification_email,
          company_grants = excluded.company_grants,
          form_grants = excluded.form_grants
      `;
      pilotDb.prepare(grantSql).run(muatasimId, 'mutasimahmedtasu2023@gmail.com');
      pilotDb.prepare(grantSql).run(afzalId, 'mutasim.map@gmail.com');
      pilotDb.prepare(grantSql).run(faridaId, 'contactmalhamahere@gmail.com');
      pilotDb.prepare(grantSql).run(shekharId, 'mycodelabs786@gmail.com');
      pilotDb.prepare(grantSql).run(anzarId, 'quranlingo@gmail.com');
      pilotDb.prepare(grantSql).run(taqviId, 'mutasimahmed02@gmail.com');

      // Verify Muatasim can sign in with login email muatasim@test.com
      const loginRes = await fetch(pilotBase + '/auth/login', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'muatasim@test.com', password: pilotPassword }),
      });
      assert.equal(loginRes.status, 200);
      const loginData = (await loginRes.json()) as { user: UserProfile & { notificationEmail?: string } };
      assert.equal(loginData.user.email, 'muatasim@test.com');
      assert.equal(loginData.user.notificationEmail, 'mutasimahmedtasu2023@gmail.com');

      const anzarCookie = (await fetch(pilotBase + '/auth/login', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'quranlingo@gmail.com', password: pilotPassword }),
      })).headers.get('set-cookie')!.split(';')[0];

      // Configure a 4-stage workflow: Anzar (requester) -> Shekhar -> Farida -> Taqvi -> Afzal (final)
      const pilotWorkflow = {
        ...INITIAL_WORKFLOWS[0],
        stages: [
          { ...INITIAL_WORKFLOWS[0].stages[0], id: 'stg-1', name: 'Ops GM Review', assignedUserId: shekharId, isFinalApproval: false },
          { ...INITIAL_WORKFLOWS[0].stages[0], id: 'stg-2', name: 'Finance GM Review', assignedUserId: faridaId, isFinalApproval: false },
          { ...INITIAL_WORKFLOWS[0].stages[0], id: 'stg-3', name: 'Tech GM Review', assignedUserId: taqviId, isFinalApproval: false },
          { ...INITIAL_WORKFLOWS[0].stages[1], id: 'stg-4', name: 'Director Approval', assignedUserId: afzalId, isFinalApproval: true },
        ],
      };
      pilotDb.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW', 'Admin Work Request', 1, JSON.stringify(pilotWorkflow));

      // Submit request as Anzar
      mockTransport.clear();
      const subRes = await fetch(pilotBase + '/requests', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000', Cookie: anzarCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: 'PEW',
          formType: 'Admin Work Request',
          formData: {
            dateOfRequest: f.dateOfRequest,
            department: 'Operations',
            priority: 'Medium',
            workDescription: 'Multi-party pilot account notification test',
            documents: f.documents,
          },
          signatureDataUrl: signature,
        }),
      });
      assert.equal(subRes.status, 201);

      // Verify outbox recipients match all parties exactly
      const outboxRows = (pilotDb.prepare('SELECT recipient_name, recipient_email, event_type FROM email_outbox ORDER BY created_at ASC')
        .all() as unknown) as OutboxRecord[];

      const recipientsMap = new Map<string, string>();
      for (const r of outboxRows) {
        recipientsMap.set(r.recipient_name, r.recipient_email);
      }

      assert.equal(recipientsMap.get('Anzar'), 'quranlingo@gmail.com');
      assert.equal(recipientsMap.get('Shekhar'), 'mycodelabs786@gmail.com');
      assert.equal(recipientsMap.get('Farida'), 'contactmalhamahere@gmail.com');
      assert.equal(recipientsMap.get('Taqvi'), 'mutasimahmed02@gmail.com');
      assert.equal(recipientsMap.get('Afzal Kazi'), 'mutasim.map@gmail.com');

      // Also verify Muatasim receives notification at mutasimahmedtasu2023@gmail.com when notified
      const muatasimOutbox = createOutboxItem('ACTION_REQUIRED', {
        id: 'TEST-MUATASIM',
        companyId: 'PEW',
        formType: 'Admin Work Request',
        requesterName: 'Anzar',
        documentVersion: 1,
        approvalSteps: [],
        formData: {},
        status: 'Pending Approval',
      } as any, {
        id: muatasimId,
        name: 'Muatasim',
        email: loginData.user.notificationEmail!,
      }, pilotNow);

      assert.equal(muatasimOutbox.recipientEmail, 'mutasimahmedtasu2023@gmail.com');
      assert.equal(muatasimOutbox.recipientName, 'Muatasim');
    } finally {
      pilotServer.close();
    }
  });

  await t.test('18. Definitive rejection: When retries end with definitive rejections, status is failed', async () => {
    const testDb = openDatabase(':memory:');
    const mockTransport = new MockEmailTransport();
    let clock = Date.now();
    const processor = new OutboxProcessor(testDb, mockTransport, {
      backoffBaseMs: 50,
      maxBackoffMs: 200,
      now: () => clock,
    });

    const reqId = randomUUID();
    testDb.prepare('INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES (?,?,?,?,?,?,?)')
      .run('u-def', 'def@test.com', 'Def User', 'Admin', 'Ops', 'PEW', 'hash');
    testDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', 'u-def', 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();

    testDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', 'u-def', 'def@test.com', 'Def User', 'Subject', ?, ?, 'pending', 0, 2, ?, ?)
    `).run(outboxId, reqId, samplePayload, `idem-def-${outboxId}`, clock, clock);

    // Attempt 1: Resend definitively rejects with 429 rate limit (retryable)
    mockTransport.failNextWith = { message: 'Too many requests', retryable: true };
    await processor.processBatch();

    const row1 = (testDb.prepare('SELECT status, attempts, next_attempt_at FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(row1.status, 'pending');
    assert.equal(row1.attempts, 1);

    // Advance clock past backoff
    clock += 100;

    // Attempt 2: Resend definitively rejects again with 429 rate limit (max attempts reached: 2 of 2)
    mockTransport.failNextWith = { message: 'Too many requests', retryable: true };
    await processor.processBatch();

    const row2 = (testDb.prepare('SELECT status, attempts, last_error FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(row2.status, 'failed', 'Definitive rejection on all attempts must set status to failed');
    assert.equal(row2.attempts, 2);
    assert.match(row2.last_error!, /Too many requests/);

    // Also verify non-retryable definitive rejection immediately sets status to failed
    const immId = randomUUID();
    testDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', 'u-def', 'def@test.com', 'Def User', 'Subject', ?, ?, 'pending', 0, 3, ?, ?)
    `).run(immId, reqId, samplePayload, `idem-imm-${immId}`, clock, clock);

    mockTransport.failNextWith = { message: '[validation_error] Invalid email format', retryable: false };
    await processor.processBatch();

    const immRow = (testDb.prepare('SELECT status, attempts, last_error FROM email_outbox WHERE id = ?').get(immId) as unknown) as OutboxRecord;
    assert.equal(immRow.status, 'failed', 'Immediate non-retryable rejection must set status to failed');
    assert.equal(immRow.attempts, 1);
  });

  await t.test('19. Uncertain outcome: When retries end after timeouts, status is failed_unconfirmed even before 24 hours', async () => {
    const testDb = openDatabase(':memory:');
    const mockTransport = new MockEmailTransport();
    let clock = Date.now();
    const processor = new OutboxProcessor(testDb, mockTransport, {
      backoffBaseMs: 50,
      maxBackoffMs: 200,
      now: () => clock,
    });

    const reqId = randomUUID();
    testDb.prepare('INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES (?,?,?,?,?,?,?)')
      .run('u-unc', 'unc@test.com', 'Uncertain User', 'Admin', 'Ops', 'PEW', 'hash');
    testDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', 'u-unc', 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();
    const idemKey = `idem-unc-${outboxId}`;

    testDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', 'u-unc', 'unc@test.com', 'Uncertain User', 'Subject', ?, ?, 'pending', 0, 2, ?, ?)
    `).run(outboxId, reqId, samplePayload, idemKey, clock, clock);

    // Attempt 1: Network timeout waiting for Resend response
    mockTransport.failNextWith = { message: 'Request timed out waiting for Resend', retryable: true };
    await processor.processBatch();

    const row1 = (testDb.prepare('SELECT status, attempts, last_error FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(row1.status, 'pending');
    assert.equal(row1.attempts, 1);
    assert.match(row1.last_error!, /timed out/);

    // Advance clock by only 500ms (far before 24 hours cutoff)
    clock += 500;

    // Attempt 2: Another timeout (max attempts reached: 2 of 2)
    mockTransport.failNextWith = { message: 'Connection timed out (ETIMEDOUT)', retryable: true };
    await processor.processBatch();

    const row2 = (testDb.prepare('SELECT status, attempts, last_error FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(row2.status, 'failed_unconfirmed', 'Timeout outcome must result in failed_unconfirmed even when retry limit is reached before 24h');
    assert.equal(row2.attempts, 2);
    assert.match(row2.last_error!, /timed out/i);
  });

  await t.test('20. Later rejection does not resolve earlier timeout with unknown outcome', async () => {
    const testDb = openDatabase(':memory:');
    const mockTransport = new MockEmailTransport();
    let clock = Date.now();
    const processor = new OutboxProcessor(testDb, mockTransport, {
      backoffBaseMs: 50,
      maxBackoffMs: 200,
      now: () => clock,
    });

    const reqId = randomUUID();
    testDb.prepare('INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES (?,?,?,?,?,?,?)')
      .run('u-lat', 'lat@test.com', 'Later User', 'Admin', 'Ops', 'PEW', 'hash');
    testDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', 'u-lat', 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();
    const idemKey = `idem-lat-${outboxId}`;

    testDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', 'u-lat', 'lat@test.com', 'Later User', 'Subject', ?, ?, 'pending', 0, 2, ?, ?)
    `).run(outboxId, reqId, samplePayload, idemKey, clock, clock);

    // Attempt 1: Socket hang up / timeout (uncertain: Resend may have accepted it)
    mockTransport.failNextWith = { message: 'socket hang up waiting for response', retryable: true };
    await processor.processBatch();

    const row1 = (testDb.prepare('SELECT status, attempts, last_error FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(row1.status, 'pending');
    assert.equal(row1.attempts, 1);

    // Advance clock past backoff
    clock += 100;

    // Attempt 2: Resend definitively rejects with rate limit (or validation error)
    mockTransport.failNextWith = { message: 'Too many requests', retryable: true };
    await processor.processBatch();

    const row2 = (testDb.prepare('SELECT status, attempts, last_error FROM email_outbox WHERE id = ?').get(outboxId) as unknown) as OutboxRecord;
    assert.equal(row2.status, 'failed_unconfirmed', 'A later rejection does NOT resolve an earlier timeout with unknown outcome');
    assert.equal(row2.attempts, 2);

    // Also verify when attempt 2 is a non-retryable definitive rejection, it still becomes failed_unconfirmed
    const outboxId2 = randomUUID();
    testDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', 'u-lat', 'lat@test.com', 'Later User', 'Subject', ?, ?, 'pending', 0, 5, ?, ?)
    `).run(outboxId2, reqId, samplePayload, `idem-lat2-${outboxId2}`, clock, clock);

    // Attempt 1 times out
    mockTransport.failNextWith = { message: 'ETIMEDOUT', retryable: true };
    await processor.processBatch();

    // Advance clock
    clock += 100;

    // Attempt 2 is a non-retryable definitive rejection
    mockTransport.failNextWith = { message: '[validation_error] Domain blocked', retryable: false };
    await processor.processBatch();

    const row2Imm = (testDb.prepare('SELECT status, attempts FROM email_outbox WHERE id = ?').get(outboxId2) as unknown) as OutboxRecord;
    assert.equal(row2Imm.status, 'failed_unconfirmed', 'Non-retryable rejection on attempt 2 cannot undo attempt 1 timeout');
    assert.equal(row2Imm.attempts, 2);
  });

  await t.test('21. Retry preserves the exact same idempotency key and payload across attempts', async () => {
    const testDb = openDatabase(':memory:');
    const mockTransport = new MockEmailTransport();
    let clock = Date.now();
    const processor = new OutboxProcessor(testDb, mockTransport, {
      backoffBaseMs: 50,
      maxBackoffMs: 200,
      now: () => clock,
    });

    const reqId = randomUUID();
    testDb.prepare('INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES (?,?,?,?,?,?,?)')
      .run('u-idem', 'idem@test.com', 'Idem User', 'Admin', 'Ops', 'PEW', 'hash');
    testDb.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(reqId, 'PEW', 'u-idem', 'Pending Approval', 1, '{}');
    const outboxId = randomUUID();
    const fixedIdempotencyKey = `precisign/test-idempotency-key-${outboxId}`;

    testDb.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        created_at, next_attempt_at
      ) VALUES (?, ?, 'ACTION_REQUIRED', 'u-idem', 'idem@test.com', 'Idem User', 'Subject for Idem', ?, ?, 'pending', 0, 3, ?, ?)
    `).run(outboxId, reqId, samplePayload, fixedIdempotencyKey, clock, clock);

    // Attempt 1: Fails with retryable error
    mockTransport.failNextWith = { message: 'Too many requests', retryable: true };
    await processor.processBatch();
    assert.equal(mockTransport.sent.length, 0);

    // Advance clock past backoff
    clock += 100;

    // Attempt 2: Succeeds
    await processor.processBatch();
    assert.equal(mockTransport.sent.length, 1);

    const sentOption = mockTransport.sent[0];
    assert.equal(sentOption.idempotencyKey, fixedIdempotencyKey, 'Must use the exact same idempotency key');
    assert.equal(sentOption.to, 'idem@test.com');
    assert.equal(sentOption.subject, 'Subject for Idem');
    const parsedStored = JSON.parse(samplePayload);
    assert.ok(sentOption.html.includes(parsedStored.companyId));
  });

  server.close();
});
