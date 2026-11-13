import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planTransitionNotification,
  buildNotificationFromPlan,
  type NotificationPlan,
} from './email/outboxStore';
import type { RequestRecord, UserProfile } from '../src/types';

function createMockRecord(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: 'test-req-1',
    displayId: 'PEW-AP-2026-0001',
    companyId: 'PEW',
    formType: 'Administrative & Payment Request',
    status: 'Pending Approval',
    currentStageIndex: 0,
    currentApproverId: 'approver-1',
    requesterId: 'requester-1',
    requesterName: 'Requester Alice',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    documentVersion: 1,
    revision: 1,
    approvalSteps: [
      {
        stageId: 'stage-1',
        stageName: 'Department Head',
        assignedUserId: 'approver-1',
        assignedUserName: 'Approver Bob',
        status: 'Pending Approval',
        canApproveEarly: false,
      },
      {
        stageId: 'stage-2',
        stageName: 'General Manager',
        assignedUserId: 'approver-2',
        assignedUserName: 'GM Charlie',
        status: 'Pending Approval',
        canApproveEarly: true,
      },
    ],
    approvalHistory: [],
    formData: {
      companyId: 'PEW',
      companyName: 'PEW - Precision Engineering',
      dateOfRequest: '2026-11-13',
      department: 'Operations',
      priority: 'Urgent',
      workDescription: 'Machinery maintenance',
      documents: {} as any,
    },
    attachments: [],
    ...overrides,
  };
}

test('planTransitionNotification plans completion when approved', () => {
  const prev = createMockRecord({ status: 'Pending Approval' });
  const next = createMockRecord({ status: 'Approved', currentStageIndex: 2, currentApproverId: undefined });

  const plan = planTransitionNotification('approve', next, prev, 'approver-2', {});
  assert.deepEqual(plan, { kind: 'completion', userId: 'requester-1' });

  const planOverride = planTransitionNotification('override', next, prev, 'approver-2', {});
  assert.deepEqual(planOverride, { kind: 'completion', userId: 'requester-1' });
});

test('planTransitionNotification plans next action when approver changes', () => {
  const prev = createMockRecord({ currentApproverId: 'approver-1' });
  const next = createMockRecord({ currentApproverId: 'approver-2', currentStageIndex: 1 });

  const plan = planTransitionNotification('approve', next, prev, 'approver-1', {});
  assert.deepEqual(plan, { kind: 'nextAction', userId: 'approver-2' });
});

test('planTransitionNotification suppresses next action if approver unchanged', () => {
  const prev = createMockRecord({ currentApproverId: 'approver-1' });
  const next = createMockRecord({ currentApproverId: 'approver-1' });

  const plan = planTransitionNotification('approve', next, prev, 'approver-2', {});
  assert.equal(plan, null);
});

test('planTransitionNotification plans replacement for replace and accept-replacement', () => {
  const prev = createMockRecord({ currentApproverId: 'approver-1' });
  const next = createMockRecord({ currentApproverId: 'approver-new' });

  // replace action: uses body.newUserId
  const planReplace = planTransitionNotification(
    'replace',
    next,
    prev,
    'admin-1',
    { newUserId: 'approver-new', accept: true }
  );
  assert.deepEqual(planReplace, { kind: 'replacement', userId: 'approver-new' });

  // accept-replacement action: uses actorId
  const planAccept = planTransitionNotification(
    'accept-replacement',
    next,
    prev,
    'approver-new',
    { accept: true }
  );
  assert.deepEqual(planAccept, { kind: 'replacement', userId: 'approver-new' });

  // if accept is false, plan is null
  const planDecline = planTransitionNotification(
    'accept-replacement',
    next,
    prev,
    'approver-new',
    { accept: false }
  );
  assert.equal(planDecline, null);
});

test('buildNotificationFromPlan creates expected outbox items or suppresses disabled users', () => {
  const prev = createMockRecord({ currentApproverId: 'approver-1' });
  const next = createMockRecord({ status: 'Approved' });

  const user = { id: 'requester-1', name: 'Requester Alice', email: 'alice@example.com', isDisabled: false };
  const disabledUser = { id: 'requester-1', name: 'Requester Alice', email: 'alice@example.com', isDisabled: true };

  const item = buildNotificationFromPlan({ kind: 'completion', userId: 'requester-1' }, user, next, prev);
  assert.ok(item);
  assert.equal(item.eventType, 'ROUTE_COMPLETED');
  assert.equal(item.recipientEmail, 'alice@example.com');

  const disabledItem = buildNotificationFromPlan({ kind: 'completion', userId: 'requester-1' }, disabledUser, next, prev);
  assert.equal(disabledItem, undefined);
});

