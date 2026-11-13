import assert from 'node:assert/strict';
import { existsSync, rmSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { openDatabase } from '../server/db';
import { provisionUser, hashPassword } from '../server/auth';
import { createApp } from '../server/app';
import {
  MockEmailTransport,
  OutboxProcessor,
  renderEmailContent,
} from '../server/email';
import type { OutboxRecord, EmailPayload } from '../server/email/types';
import { INITIAL_WORKFLOWS, INITIAL_REQUESTS } from '../src/data/seedData';

const DB_PATH = resolve('data/e2e-email-test.sqlite');
const TEST_PASSWORD = 'precisign';
const SAMPLE_SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';

async function runE2EEmailVerification() {
  console.log('================================================================');
  console.log('PreciSign Email MVP — End-to-End Test & Persistent Database Setup');
  console.log('================================================================\n');

  // 1. Prepare clean test database file at data/e2e-email-test.sqlite
  console.log(`[Setup] Target database path: ${DB_PATH}`);
  for (const ext of ['', '-wal', '-shm']) {
    const file = DB_PATH + ext;
    if (existsSync(file)) {
      try {
        rmSync(file, { force: true });
      } catch (err) {
        console.warn(`[Setup] Could not remove existing ${file}:`, err);
      }
    }
  }

  const db = openDatabase(DB_PATH);
  console.log('[Setup] Opened and migrated persistent test database.');

  // 2. Provision pilot accounts with assigned test email addresses
  console.log('[Setup] Provisioning 6 pilot accounts with credentials and permissions...');

  const addUser = async (params: {
    email: string;
    name: string;
    role: 'Admin' | 'General Manager' | 'Director';
    department: string;
    notificationEmail: string;
    isGroupAdmin?: boolean;
  }) => {
    const userId = await provisionUser(
      db,
      {
        email: params.email,
        name: params.name,
        role: params.role,
        department: params.department,
        companyId: 'PEW',
        isGroupAdmin: params.isGroupAdmin,
      },
      TEST_PASSWORD
    );

    // Save signature
    db.prepare('INSERT INTO user_signatures VALUES (?, ?, ?)').run(userId, SAMPLE_SIGNATURE, params.name);

    // Ensure users table role matches
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(params.role, userId);

    // Configure account_access with company grants, form grants and notification email
    const grantSql = `
      INSERT INTO account_access (user_id, notification_email, company_grants, form_grants)
      VALUES (?, ?, '["PEW","ICCL","FSG"]', '{"PEW":["Admin Work Request"],"ICCL":["Admin Work Request"],"FSG":["Admin Work Request"]}')
      ON CONFLICT(user_id) DO UPDATE SET
        notification_email = excluded.notification_email,
        company_grants = excluded.company_grants,
        form_grants = excluded.form_grants
    `;
    db.prepare(grantSql).run(userId, params.notificationEmail);

    return userId;
  };

  const anzarId = await addUser({
    email: 'quranlingo@gmail.com',
    name: 'Anzar',
    role: 'Admin',
    department: 'Operations',
    notificationEmail: 'quranlingo@gmail.com',
  });

  const shekharId = await addUser({
    email: 'mycodelabs786@gmail.com',
    name: 'Shekhar',
    role: 'General Manager',
    department: 'Operations',
    notificationEmail: 'mycodelabs786@gmail.com',
  });

  const afzalId = await addUser({
    email: 'mutasim.map@gmail.com',
    name: 'Afzal Kazi',
    role: 'Director',
    department: 'Executive',
    notificationEmail: 'mutasim.map@gmail.com',
  });

  const muatasimId = await addUser({
    email: 'muatasim@test.com',
    name: 'Muatasim',
    role: 'Admin',
    department: 'Management',
    notificationEmail: 'mutasimahmedtasu2023@gmail.com',
    isGroupAdmin: true,
  });

  const faridaId = await addUser({
    email: 'contactmalhamahere@gmail.com',
    name: 'Farida',
    role: 'General Manager',
    department: 'Finance',
    notificationEmail: 'contactmalhamahere@gmail.com',
  });

  const taqviId = await addUser({
    email: 'mutasimahmed02@gmail.com',
    name: 'Taqvi',
    role: 'General Manager',
    department: 'Technical',
    notificationEmail: 'mutasimahmed02@gmail.com',
  });

  console.log('  ✔ Anzar: login quranlingo@gmail.com -> notify quranlingo@gmail.com');
  console.log('  ✔ Shekhar: login mycodelabs786@gmail.com -> notify mycodelabs786@gmail.com');
  console.log('  ✔ Afzal Kazi: login mutasim.map@gmail.com -> notify mutasim.map@gmail.com');
  console.log('  ✔ Muatasim (Listed Backup): login muatasim@test.com -> notify mutasimahmedtasu2023@gmail.com');
  console.log('  ✔ Farida: login contactmalhamahere@gmail.com -> notify contactmalhamahere@gmail.com');
  console.log('  ✔ Taqvi: login mutasimahmed02@gmail.com -> notify mutasimahmed02@gmail.com');

  // 3. Configure 2-stage workflow on PEW with Shekhar (primary) + Muatasim (backup) -> Afzal (final)
  console.log('\n[Setup] Configuring 2-stage workflow for PEW Admin Work Request:');
  console.log('  - Stage 1: Shekhar (Primary), Muatasim (Listed Backup)');
  console.log('  - Stage 2: Afzal Kazi (Final Approver)');

  const workflow = {
    ...INITIAL_WORKFLOWS[0],
    id: 'wf-pew-admin-work',
    formType: 'Admin Work Request',
    companyId: 'PEW',
    version: 1,
    stages: [
      {
        ...INITIAL_WORKFLOWS[0].stages[0],
        id: 'stg-1',
        stageNumber: 1,
        name: 'Management Review',
        assignedUserId: shekharId,
        assignedRole: 'General Manager',
        backupSignerIds: [muatasimId],
        isFinalApproval: false,
        requiredOnSubmit: true,
        mustSign: true,
        canReject: true,
        canReturnForCorrection: true,
      },
      {
        ...INITIAL_WORKFLOWS[0].stages[1],
        id: 'stg-2',
        stageNumber: 2,
        name: 'Director Final Approval',
        assignedUserId: afzalId,
        assignedRole: 'Director',
        backupSignerIds: [],
        isFinalApproval: true,
        requiredOnSubmit: true,
        mustSign: true,
        canReject: true,
        canReturnForCorrection: true,
      },
    ],
  };

  db.prepare('INSERT OR REPLACE INTO workflows VALUES (?, ?, 1, ?)').run(
    'PEW',
    'Admin Work Request',
    JSON.stringify(workflow)
  );

  // 4. Start local test Express app with MockEmailTransport
  const transport = new MockEmailTransport();
  let fakeNow = Date.now();
  const nowFn = () => fakeNow;

  process.env.PRECISIGN_APP_URL = 'http://localhost:3000';

  const processor = new OutboxProcessor(db, transport, {
    now: nowFn,
    backoffBaseMs: 50,
    maxBackoffMs: 200,
  });

  const app = await createApp(db, {
    origin: 'http://localhost:3000',
    secureCookies: false,
    now: nowFn,
    emailTransport: transport,
    outboxProcessor: processor,
    autoStartWorker: false, // We control batch processing deterministically
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  console.log(`[Setup] Test server running on ${baseUrl}\n`);

  try {
    // Helper: Flush pending outbox items
    const flushOutbox = async () => {
      await new Promise((r) => setTimeout(r, 50));
      await processor.processBatch();
    };

    // Helper: Login and return session cookie
    const login = async (email: string, pass: string = TEST_PASSWORD) => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      assert.equal(res.status, 200, `Login should succeed for ${email}`);
      const cookie = res.headers.get('set-cookie')!.split(';')[0];
      const data = (await res.json()) as any;
      return { cookie, user: data.user };
    };

    const anzarAuth = await login('quranlingo@gmail.com');
    const shekharAuth = await login('mycodelabs786@gmail.com');
    const afzalAuth = await login('mutasim.map@gmail.com');
    const muatasimAuth = await login('muatasim@test.com');
    const faridaAuth = await login('contactmalhamahere@gmail.com');

    // =========================================================================
    // JOURNEY STEP 1: Anzar submits a request
    // =========================================================================
    console.log('----------------------------------------------------------------');
    console.log('Journey Step 1: Anzar submits request (Shekhar stage 1, Afzal stage 2)');
    console.log('----------------------------------------------------------------');

    const f = INITIAL_REQUESTS[0].formData;
    const submissionBody = {
      companyId: 'PEW',
      formType: 'Admin Work Request',
      formData: {
        dateOfRequest: f.dateOfRequest || '2026-11-12',
        department: 'Operations',
        priority: 'Urgent',
        workDescription: 'CONFIDENTIAL-PROJECT-PHOENIX: High-precision laser calibration upgrade',
        documents: {
          onlineDocumentChamber: true,
          physicalDocumentChamber: false,
          companyDocumentAjeer: false,
          employeeSalaryCertificate: false,
          permanentEmploymentVisa: false,
          workVisitVisa: false,
          businessVisitVisa: false,
          agencyWakala: false,
          others: true,
          othersDescription: 'CONFIDENTIAL-SPEC-DOC-42',
        },
      },
      signatureDataUrl: SAMPLE_SIGNATURE,
      comment: 'Urgent facility maintenance request submitted for review.',
    };

    transport.clear();

    const submitRes = await fetch(`${baseUrl}/requests`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: anzarAuth.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(submissionBody),
    });
    assert.equal(submitRes.status, 201, 'Submission must return 201 Created');
    const createdRequest = (await submitRes.json()) as any;
    const reqId = createdRequest.id;
    console.log(`  ✔ Request created with ID: ${reqId}`);
    console.log(`  ✔ Initial status: ${createdRequest.status}`);

    // Verify outbox rows created on submission
    const step1Outbox = db
      .prepare('SELECT * FROM email_outbox WHERE request_id = ? ORDER BY created_at ASC')
      .all(reqId) as unknown as OutboxRecord[];

    assert.equal(step1Outbox.length, 3, 'Submission must enqueue exactly 3 outbox rows');

    const anzarSub = step1Outbox.find((r) => r.recipient_user_id === anzarId);
    assert.ok(anzarSub, 'Anzar must receive submission confirmation');
    assert.equal(anzarSub.recipient_email, 'quranlingo@gmail.com');
    assert.equal(anzarSub.event_type, 'REQUEST_SUBMITTED');
    assert.match(anzarSub.subject, /Request Submitted/);
    console.log(`  ✔ Outbox: Submitter email enqueued for Anzar (quranlingo@gmail.com) [REQUEST_SUBMITTED]`);

    const shekharAction = step1Outbox.find((r) => r.recipient_user_id === shekharId);
    assert.ok(shekharAction, 'Shekhar must receive action-needed email');
    assert.equal(shekharAction.recipient_email, 'mycodelabs786@gmail.com');
    assert.equal(shekharAction.event_type, 'ACTION_REQUIRED');
    assert.match(shekharAction.subject, /Action Required/);
    console.log(`  ✔ Outbox: Action-needed email enqueued for Shekhar (mycodelabs786@gmail.com) [ACTION_REQUIRED]`);

    const afzalNotice = step1Outbox.find((r) => r.recipient_user_id === afzalId);
    assert.ok(afzalNotice, 'Afzal must receive upcoming-approver notice');
    assert.equal(afzalNotice.recipient_email, 'mutasim.map@gmail.com');
    assert.equal(afzalNotice.event_type, 'UPCOMING_FINAL_APPROVER_NOTICE');
    assert.match(afzalNotice.subject, /Upcoming Final Approver Notice/);
    console.log(`  ✔ Outbox: Upcoming-signer email enqueued for Afzal (mutasim.map@gmail.com) [UPCOMING_FINAL_APPROVER_NOTICE]`);

    // Verify Muatasim (listed backup) received 0 emails
    const muatasimSubRows = db
      .prepare('SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ?')
      .all(reqId, muatasimId) as unknown as OutboxRecord[];
    assert.equal(muatasimSubRows.length, 0, 'Listed backup must NOT receive any email on submission');
    console.log(`  ✔ Invariant: Listed backup (Muatasim) received 0 emails on submission`);

    // Verify Confidentiality: confidential form fields are protected
    for (const row of step1Outbox) {
      const payload = JSON.parse(row.payload_json) as EmailPayload;
      assert.equal(payload.requestId, reqId);
      assert.equal(payload.companyId, 'PEW');
      assert.equal(payload.formType, 'Admin Work Request');
      assert.equal(payload.requesterName, 'Anzar');
      assert.ok(payload.portalUrl.includes(`/requests/${reqId}`));

      const { html, text } = renderEmailContent(row.event_type, payload);
      assert.ok(!html.includes('CONFIDENTIAL-PROJECT-PHOENIX'), 'Must NOT leak workDescription in HTML');
      assert.ok(!text.includes('CONFIDENTIAL-PROJECT-PHOENIX'), 'Must NOT leak workDescription in text');
      assert.ok(!html.includes('CONFIDENTIAL-SPEC-DOC-42'), 'Must NOT leak checklist details in HTML');
      assert.ok(!html.includes('data:image/'), 'Must NOT leak signature image data');
      assert.ok(html.includes(payload.portalUrl), 'HTML must contain direct portal link');
      assert.ok(html.includes('Confidential form contents and attachments are protected'));
    }
    console.log(`  ✔ Confidentiality verified: No workDescription, checklist text, or signatures leaked in emails`);

    // Process submission batch through mock email transport
    await flushOutbox();
    assert.equal(transport.sent.length, 3, 'Mock transport must record 3 sends');
    for (const row of step1Outbox) {
      const freshRow = db.prepare('SELECT status, resend_id, accepted_at FROM email_outbox WHERE id = ?').get(row.id) as any;
      assert.equal(freshRow.status, 'delivered', `Row ${row.id} should be delivered`);
      assert.ok(freshRow.resend_id);
      assert.ok(freshRow.accepted_at);
    }
    console.log(`  ✔ Mock Transport: 3 submission emails delivered successfully`);

    // =========================================================================
    // JOURNEY STEP 2: Shekhar signs Stage 1
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('Journey Step 2: Shekhar signs Stage 1 (Management Review)');
    console.log('----------------------------------------------------------------');

    transport.clear();

    const shekharApproveRes = await fetch(`${baseUrl}/requests/${reqId}/approve`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: shekharAuth.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expectedRevision: 1,
        comment: 'Management review complete and verified.',
        signatureDataUrl: SAMPLE_SIGNATURE,
      }),
    });
    assert.equal(shekharApproveRes.status, 200, 'Shekhar approval must return 200');
    const afterShekhar = (await shekharApproveRes.json()) as any;
    assert.equal(afterShekhar.currentStageIndex, 1);
    assert.equal(afterShekhar.approvalSteps[0].status, 'Approved');
    assert.equal(afterShekhar.approvalSteps[1].status, 'Pending');
    assert.equal(afterShekhar.status, 'Pending Approval');
    console.log(`  ✔ Stage 1 approved by Shekhar; current stage advanced to Stage 2`);

    // Check outbox for Afzal action-needed email
    const step2Outbox = db
      .prepare('SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ? AND event_type = ?')
      .all(reqId, afzalId, 'ACTION_REQUIRED') as unknown as OutboxRecord[];
    assert.equal(step2Outbox.length, 1, 'Afzal must receive ACTION_REQUIRED email');
    const afzalAction = step2Outbox[0];
    assert.equal(afzalAction.recipient_email, 'mutasim.map@gmail.com');
    assert.equal(afzalAction.recipient_name, 'Afzal Kazi');
    assert.match(afzalAction.subject, /Action Required/);
    console.log(`  ✔ Outbox: Action-needed email enqueued for Afzal (mutasim.map@gmail.com) [ACTION_REQUIRED]`);

    // Confirm Muatasim (listed backup) still receives 0 emails
    const muatasimStep2Rows = db
      .prepare('SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ?')
      .all(reqId, muatasimId) as unknown as OutboxRecord[];
    assert.equal(muatasimStep2Rows.length, 0, 'Listed backup must still receive 0 emails');
    console.log(`  ✔ Invariant: Listed backup (Muatasim) still received 0 emails after intermediate signing`);

    // Process stage advancement email
    await flushOutbox();
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].to, 'mutasim.map@gmail.com');
    console.log(`  ✔ Mock Transport: Action email delivered to Afzal`);

    // =========================================================================
    // JOURNEY STEP 3: Afzal signs Stage 2 and completes route
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('Journey Step 3: Afzal signs Stage 2 and completes route');
    console.log('----------------------------------------------------------------');

    transport.clear();

    const afzalApproveRes = await fetch(`${baseUrl}/requests/${reqId}/approve`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: afzalAuth.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expectedRevision: 2,
        comment: 'Final approval granted. Ready for execution.',
        signatureDataUrl: SAMPLE_SIGNATURE,
      }),
    });
    assert.equal(afzalApproveRes.status, 200, 'Afzal approval must return 200');
    const completedReq = (await afzalApproveRes.json()) as any;
    assert.equal(completedReq.status, 'Approved', 'Overall request status must be Approved');
    assert.equal(completedReq.approvalSteps[0].status, 'Approved');
    assert.equal(completedReq.approvalSteps[1].status, 'Approved');
    console.log(`  ✔ Route completed: Final request status is Approved`);

    // Check outbox for Anzar completion email
    const completionRows = db
      .prepare('SELECT * FROM email_outbox WHERE request_id = ? AND recipient_user_id = ? AND event_type = ?')
      .all(reqId, anzarId, 'ROUTE_COMPLETED') as unknown as OutboxRecord[];
    assert.equal(completionRows.length, 1, 'Anzar must receive ROUTE_COMPLETED email');
    const compRow = completionRows[0];
    assert.equal(compRow.recipient_email, 'quranlingo@gmail.com');
    assert.equal(compRow.recipient_name, 'Anzar');
    assert.match(compRow.subject, /Route Completed/);

    const compPayload = JSON.parse(compRow.payload_json) as EmailPayload;
    assert.ok(compPayload.completionSummary, 'Must include completionSummary');
    assert.equal(compPayload.completionSummary.steps.length, 2);
    assert.equal(compPayload.completionSummary.steps[0].stageName, 'Management Review');
    assert.equal(compPayload.completionSummary.steps[0].assignedUserName, 'Shekhar');
    assert.equal(compPayload.completionSummary.steps[0].status, 'Signed');
    assert.equal(compPayload.completionSummary.steps[1].stageName, 'Director Final Approval');
    assert.equal(compPayload.completionSummary.steps[1].assignedUserName, 'Afzal Kazi');
    assert.equal(compPayload.completionSummary.steps[1].status, 'Signed');
    console.log(`  ✔ Outbox: Completion summary enqueued for Anzar (quranlingo@gmail.com) [ROUTE_COMPLETED]`);
    console.log(`  ✔ Completion summary steps accurately report:`);
    console.log(`      Stage 1: Management Review -> Signed by Shekhar`);
    console.log(`      Stage 2: Director Final Approval -> Signed by Afzal Kazi`);

    // Verify rendered completion email content
    const compRender = renderEmailContent('ROUTE_COMPLETED', compPayload);
    assert.ok(compRender.html.includes('Signer Action Summary'));
    assert.ok(compRender.html.includes('Signed'));
    assert.ok(compRender.text.includes('Signing Route Completed'));
    assert.ok(compRender.html.includes(compPayload.portalUrl));
    assert.ok(!compRender.html.includes('CONFIDENTIAL-PROJECT-PHOENIX'), 'Must not leak form fields');
    assert.ok(!compRender.text.includes('CONFIDENTIAL-PROJECT-PHOENIX'));

    // Process completion email
    await flushOutbox();
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].to, 'quranlingo@gmail.com');
    console.log(`  ✔ Mock Transport: Completion email delivered to Anzar`);

    // =========================================================================
    // INVARIANCE & ERROR TESTS
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('Error & Invariance Verification: Unauthorized Actions & Delivery Safety');
    console.log('----------------------------------------------------------------');

    const totalBefore = (db.prepare('SELECT count(*) as c FROM email_outbox').get() as { c: number }).c;

    // Check A: Unauthorized action creates ZERO outbox rows
    // Farida is not an assigned approver on this completed request
    const unauthorizedActionRes = await fetch(`${baseUrl}/requests/${reqId}/approve`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: faridaAuth.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expectedRevision: 3,
        comment: 'Unauthorized approval attempt by Farida',
        signatureDataUrl: SAMPLE_SIGNATURE,
      }),
    });
    assert.ok(
      [400, 403, 404, 409].includes(unauthorizedActionRes.status),
      `Unauthorized approval attempt must be rejected (received ${unauthorizedActionRes.status})`
    );

    // Malformed request submission
    const badSubmitRes = await fetch(`${baseUrl}/requests`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: anzarAuth.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyId: 'NON_EXISTENT_COMPANY',
        formType: 'Admin Work Request',
        formData: {},
      }),
    });
    assert.ok(
      [400, 403].includes(badSubmitRes.status),
      `Invalid submission must be rejected (received ${badSubmitRes.status})`
    );

    const totalAfter = (db.prepare('SELECT count(*) as c FROM email_outbox').get() as { c: number }).c;
    assert.equal(
      totalAfter,
      totalBefore,
      'Failed and unauthorized actions must create zero new email outbox rows'
    );
    console.log(`  ✔ Invariant verified: Failed/unauthorized actions created 0 email outbox rows`);

    // Check B: Email delivery failure does not roll back or undo the request or signatures
    // Simulate a new request where email transport fails
    transport.failNextWith = { message: 'Simulated Resend API Network Timeout', retryable: true };

    const req2Res = await fetch(`${baseUrl}/requests`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: anzarAuth.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyId: 'PEW',
        formType: 'Admin Work Request',
        formData: {
          dateOfRequest: '2026-11-12',
          department: 'Operations',
          priority: 'Medium',
          workDescription: 'Delivery failure safety check request',
          documents: f.documents,
        },
        signatureDataUrl: SAMPLE_SIGNATURE,
      }),
    });
    assert.equal(req2Res.status, 201);
    const req2 = (await req2Res.json()) as any;

    // Flush or wait for trigger to run
    await new Promise((r) => setTimeout(r, 50));
    await processor.processBatch();

    // Verify request 2 in DB is completely intact and committed!
    const req2Row = db.prepare('SELECT status, revision, record FROM requests WHERE id = ?').get(req2.id) as any;
    assert.ok(req2Row, 'Request must exist in database despite email delivery failure');
    assert.equal(req2Row.status, 'Pending Approval');
    const req2Record = JSON.parse(req2Row.record);
    assert.ok(req2Record.formData?.requesterSignatureDataUrl, 'Requester signature must be preserved in database');

    // Outbox row records the failure or retry attempt
    const failedOutboxRow = db
      .prepare('SELECT status, attempts, last_error FROM email_outbox WHERE request_id = ? AND (last_error IS NOT NULL OR attempts > 0)')
      .get(req2.id) as any;
    assert.ok(failedOutboxRow, 'Outbox row recording attempt/error must exist');
    assert.ok(failedOutboxRow.attempts >= 1, 'Attempt counter must be at least 1');
    assert.match(failedOutboxRow.last_error, /Simulated Resend API Network Timeout/);
    console.log(`  ✔ Invariant verified: Email transport failure did NOT roll back or undo the request in DB`);

    // Clear simulated failure and process remaining pending items for request 2
    transport.failNextWith = undefined;
    fakeNow += 5000; // Advance time past retry backoff
    await processor.processBatch();

    // =========================================================================
    // PERSISTENCE & FINAL AUDIT
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('Persistent Test Database Verification & Final Outbox Audit');
    console.log('----------------------------------------------------------------');

    // Query all outbox rows for the main journey request
    const allReqOutbox = db
      .prepare('SELECT id, event_type, recipient_name, recipient_email, subject, status, resend_id, accepted_at FROM email_outbox WHERE request_id = ? ORDER BY created_at ASC')
      .all(reqId) as any[];

    assert.equal(allReqOutbox.length, 5, 'Main journey must have exactly 5 email outbox rows');
    for (const r of allReqOutbox) {
      assert.equal(r.status, 'delivered', `Outbox row ${r.id} must be delivered`);
      assert.ok(r.resend_id, `Outbox row ${r.id} must have resend_id`);
      assert.ok(r.accepted_at, `Outbox row ${r.id} must have accepted_at timestamp`);
      console.log(`  [Delivered] ${r.event_type.padEnd(30)} -> ${r.recipient_name} <${r.recipient_email}>`);
    }

    // Verify request in DB
    const finalDbReq = db.prepare('SELECT id, company_id, requester_id, status, revision, record FROM requests WHERE id = ?').get(reqId) as any;
    assert.equal(finalDbReq.status, 'Approved');
    assert.equal(finalDbReq.revision, 3);
    const parsedRecord = JSON.parse(finalDbReq.record);
    assert.equal(parsedRecord.approvalSteps[0].status, 'Approved');
    assert.equal(parsedRecord.approvalSteps[1].status, 'Approved');
    assert.ok(parsedRecord.approvalSteps[0].signatureDataUrl);
    assert.ok(parsedRecord.approvalSteps[1].signatureDataUrl);
    console.log(`\n  ✔ Database Request ID: ${reqId}`);
    console.log(`  ✔ Status: ${finalDbReq.status}`);
    console.log(`  ✔ Document Revision: ${finalDbReq.revision}`);
    console.log(`  ✔ Recorded Approval Steps: 2 (both Signed with signature bytes preserved)`);

    // Checkpoint WAL to flush all transactions to disk
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } finally {
    server.close();
    db.close();
  }

  // Verify file on disk
  assert.ok(existsSync(DB_PATH), `Database file must exist on disk at ${DB_PATH}`);
  const stats = statSync(DB_PATH);
  console.log(`\n[Persistence] Database successfully saved and verified:`);
  console.log(`  Location: ${DB_PATH}`);
  console.log(`  File Size: ${stats.size} bytes`);
  console.log('================================================================');
  console.log('All end-to-end tests and persistence checks passed successfully!');
  console.log('================================================================\n');
}

runE2EEmailVerification().catch((err) => {
  console.error('\n❌ E2E Email Verification Failed:', err);
  process.exit(1);
});
