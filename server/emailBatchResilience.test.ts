import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './db';
import { provisionUser } from './auth';
import {
  MockEmailTransport,
  OutboxProcessor,
  enqueueOutboxSync,
  createOutboxItem,
  type OutboxRecord,
} from './email';
import type { RequestRecord } from '../src/types/index';

test('Task 3 — Outbox worker resilient batch processing', async (t) => {
  const db = openDatabase(':memory:');
  const transport = new MockEmailTransport();
  let currentTime = 1700000000000;
  const now = () => currentTime;
  const processor = new OutboxProcessor(db, transport, { now });

  // Seed company and requester to satisfy foreign keys
  const requesterId = await provisionUser(db, {
    email: 'requester@example.test',
    name: 'Requester Person',
    department: 'Operations',
    companyId: 'PEW',
    role: 'Admin',
  }, 'Synthetic-pass-123');

  const insertRequestRecord = (req: RequestRecord) => {
    db.prepare(`
      INSERT OR REPLACE INTO requests (id, company_id, requester_id, status, revision, record)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(req.id, req.companyId, req.requesterId, req.status, JSON.stringify(req));
  };

  const validRequest: RequestRecord = {
    id: `PEW-AP-2026-${randomUUID()}`,
    displayId: 'PEW-AP-2026-0001',
    formType: 'Administrative & Payment Request',
    companyId: 'PEW',
    title: 'Valid Request',
    requesterId: requesterId,
    requesterName: 'Requester Person',
    requesterRole: 'Admin',
    department: 'Operations',
    createdAt: new Date(currentTime).toISOString(),
    updatedAt: new Date(currentTime).toISOString(),
    status: 'Pending Approval',
    currentStageIndex: 0,
    currentApproverId: 'u-approver',
    currentApproverName: 'Approver Person',
    workflowVersion: 1,
    documentVersion: 1,
    workflowConfig: { id: 'wf1', companyId: 'PEW', formType: 'Administrative & Payment Request', version: 1, stages: [] } as any,
    approvalSteps: [{ stageId: 's1', stageNumber: 1, stageName: 'Stage 1', assignedUserId: 'u-approver', assignedUserName: 'Approver Person', assignedRole: 'Director', status: 'Pending' }],
    approvalHistory: [],
    attachments: [],
    formData: {
      dateOfRequest: '10 Nov 2026',
      companyId: 'PEW',
      companyName: 'Precision Engineering Works',
      requesterId: 'u-requester',
      requesterName: 'Requester Person',
      department: 'Operations',
      priority: 'Medium',
      workDescription: 'Supplies',
      documents: {
        onlineDocumentChamber: false,
        physicalDocumentChamber: false,
        companyDocumentAjeer: false,
        employeeSalaryCertificate: false,
        permanentEmploymentVisa: false,
        workVisitVisa: false,
        businessVisitVisa: false,
        agencyWakala: false,
        others: false,
        othersDescription: '',
      },
    },
    versionSnapshots: [],
  };

  await t.test('Malformed payload followed by valid row does not block valid row', async () => {
    transport.clear();
    insertRequestRecord(validRequest);
    insertRequestRecord({ ...validRequest, id: 'PEW-AP-BROKEN' });

    // 1. Enqueue malformed row (valid JSON, but missing required payload fields)
    const malformedId = randomUUID();
    const malformedPayload = JSON.stringify({ broken: 'true', missingRequestId: true, confidentialToken: 'SECRET_XYZ' });
    db.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        next_attempt_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 5, ?, ?)
    `).run(
      malformedId,
      'PEW-AP-BROKEN',
      'ACTION_REQUIRED',
      'u-target1',
      'target1@example.test',
      'Target One',
      'Malformed notification',
      malformedPayload,
      `idem-${malformedId}`,
      currentTime,
      currentTime
    );

    // 2. Enqueue valid row
    const validRecipient = { id: 'u-target2', name: 'Target Two', email: 'target2@example.test' };
    const validItem = createOutboxItem('ACTION_REQUIRED', validRequest, validRecipient, currentTime);
    enqueueOutboxSync(db, [validItem]);

    // 3. Process batch containing both items
    const batchResult = await processor.processBatch();

    assert.equal(batchResult.processed, 2, 'Should process both claimed rows');
    assert.equal(batchResult.failed, 1, 'Malformed row should record a failure');
    assert.equal(batchResult.accepted, 1, 'Valid row should succeed and be accepted');

    // 4. Assert DB state for malformed row
    const malformedRow = db.prepare('SELECT * FROM email_outbox WHERE id = ?').get(malformedId) as unknown as OutboxRecord;
    assert.equal(malformedRow.status, 'failed', 'Malformed row must be marked permanently failed');
    assert.ok(malformedRow.last_error?.includes('Invalid message payload'), 'Safe error message recorded');
    assert.ok(!malformedRow.last_error?.includes('SECRET_XYZ'), 'Error message must not leak payload contents');
    assert.equal(malformedRow.lease_token, null, 'Lease must be cleared');

    // 5. Assert DB state for valid row
    const validRow = db.prepare('SELECT * FROM email_outbox WHERE id = ?').get(validItem.id) as unknown as OutboxRecord;
    assert.ok(validRow.status === 'delivered' || validRow.status === 'accepted', 'Valid row must be delivered or accepted');
    assert.equal(validRow.attempts, 1);
    assert.equal(validRow.lease_token, null);

    // 6. Assert transport only received the valid message
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].to, 'target2@example.test');
    assert.ok(!JSON.stringify(transport.sent[0]).includes('SECRET_XYZ'));
  });

  await t.test('Rendering failure on row 1 does not block row 2', async () => {
    transport.clear();
    insertRequestRecord({ ...validRequest, id: 'PEW-AP-RENDER-FAIL' });

    // Enqueue row with payload that throws during rendering (e.g. formPreview malformed or unexpected structure)
    const renderFailId = randomUUID();
    const renderFailPayload = JSON.stringify({
      requestId: 'PEW-AP-RENDER-FAIL',
      formType: 'Administrative & Payment Request',
      formPreview: {
        companyName: null, // this will fail if rendering expects string operations
        signatures: null, // this will crash if property accessed
      },
    });

    db.prepare(`
      INSERT INTO email_outbox (
        id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
        subject, payload_json, idempotency_key, status, attempts, max_attempts,
        next_attempt_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 5, ?, ?)
    `).run(
      renderFailId,
      'PEW-AP-RENDER-FAIL',
      'ACTION_REQUIRED',
      'u-target1',
      'target1@example.test',
      'Target One',
      'Render fail subject',
      renderFailPayload,
      `idem-${renderFailId}`,
      currentTime,
      currentTime
    );

    // Followed by valid row
    const validRecipient = { id: 'u-target3', name: 'Target Three', email: 'target3@example.test' };
    const validItem = createOutboxItem('ACTION_REQUIRED', validRequest, validRecipient, currentTime);
    enqueueOutboxSync(db, [validItem]);

    const batchResult = await processor.processBatch();
    assert.equal(batchResult.processed, 2);
    assert.equal(batchResult.failed, 1);
    assert.equal(batchResult.accepted, 1);

    const failRow = db.prepare('SELECT * FROM email_outbox WHERE id = ?').get(renderFailId) as unknown as OutboxRecord;
    assert.equal(failRow.status, 'failed');
    assert.ok(failRow.last_error?.includes('rendering failed'));

    const successRow = db.prepare('SELECT * FROM email_outbox WHERE id = ?').get(validItem.id) as unknown as OutboxRecord;
    assert.ok(successRow.status === 'delivered' || successRow.status === 'accepted');
  });
});
