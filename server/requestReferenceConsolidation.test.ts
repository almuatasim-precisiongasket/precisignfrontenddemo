import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  formTypeToPrefix,
  formatSequenceReference,
  allocateSequenceSync,
  getRequestDisplayReference,
} from './email/requestSequence';
import { resubmitCorrectedRequest } from '../src/utils/workflowEngine';
import type { RequestRecord, UserProfile } from '../src/types/index';

test('Task 8 — Consolidate request reference logic', async (t) => {
  await t.test('1. Verify all supported form prefixes and fallback', () => {
    assert.equal(formTypeToPrefix('Administrative & Payment Request'), 'AP');
    assert.equal(formTypeToPrefix('Admin Work Request'), 'AW');
    assert.equal(formTypeToPrefix('IT Request'), 'IT');
    assert.equal(formTypeToPrefix('R&D Initiative'), 'RD');
    assert.equal(formTypeToPrefix('Cash Voucher'), 'CV');
    assert.equal(formTypeToPrefix('Expense Claim'), 'EC');
    assert.equal(formTypeToPrefix('Custom Legacy Form'), 'AW', 'Fallback should map to AW');
  });

  await t.test('2. getRequestDisplayReference handles sequenced and legacy references cleanly', () => {
    // Sequenced record with displayId
    assert.equal(
      getRequestDisplayReference({ id: 'PEW-AP-2026-uuid-1234', displayId: 'PEW-AP-2026-0001' }),
      'PEW-AP-2026-0001'
    );

    // Legacy record without displayId
    assert.equal(
      getRequestDisplayReference({ id: 'PEW-AW-2026-0018' }),
      'PEW-AW-2026-0018'
    );

    // Unsequenced legacy UUID record without displayId
    assert.equal(
      getRequestDisplayReference({ id: 'PEW-AW-2026-63d0a16d-2ffd-496a-a48d-28ef4ff6b9ba' }),
      'PEW-AW-2026-63d0a16d-2ffd-496a-a48d-28ef4ff6b9ba'
    );
  });

  await t.test('3. Sequence allocation scoped by company, form code, and year', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE request_counters (
        company_id TEXT NOT NULL,
        form_code TEXT NOT NULL,
        year INTEGER NOT NULL,
        last_seq INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (company_id, form_code, year)
      );
    `);

    // Scoped by company
    assert.equal(allocateSequenceSync(db, 'ICCL', 'AP', 2026), 'ICCL-AP-2026-0001');
    assert.equal(allocateSequenceSync(db, 'ICCL', 'AP', 2026), 'ICCL-AP-2026-0002');
    assert.equal(allocateSequenceSync(db, 'PEW', 'AP', 2026), 'PEW-AP-2026-0001');
    assert.equal(allocateSequenceSync(db, 'FSG', 'AP', 2026), 'FSG-AP-2026-0001');

    // Scoped by form code
    assert.equal(allocateSequenceSync(db, 'ICCL', 'IT', 2026), 'ICCL-IT-2026-0001');
    assert.equal(allocateSequenceSync(db, 'ICCL', 'CV', 2026), 'ICCL-CV-2026-0001');
    assert.equal(allocateSequenceSync(db, 'ICCL', 'EC', 2026), 'ICCL-EC-2026-0001');

    // Scoped by year
    assert.equal(allocateSequenceSync(db, 'ICCL', 'AP', 2027), 'ICCL-AP-2027-0001');
  });

  await t.test('4. Reference and displayId preservation on resubmission', () => {
    const user: UserProfile = {
      id: 'u-anzar',
      name: 'Anzar',
      email: 'anzar@example.test',
      role: 'Admin',
      department: 'Operations',
      initials: 'A',
      avatarColor: '#000',
      companyId: 'ICCL',
    };

    const initialRequest: RequestRecord = {
      id: 'ICCL-AP-2026-unique-uuid-999',
      displayId: 'ICCL-AP-2026-0042',
      formType: 'Administrative & Payment Request',
      companyId: 'ICCL',
      title: 'Workshop repair',
      requesterId: user.id,
      requesterName: user.name,
      requesterRole: user.role,
      department: user.department,
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
      status: 'Returned for Correction',
      currentStageIndex: 0,
      currentApproverId: user.id,
      currentApproverName: user.name,
      workflowVersion: 1,
      documentVersion: 1,
      workflowConfig: {
        id: 'wf1',
        companyId: 'ICCL',
        formType: 'Administrative & Payment Request',
        version: 1,
        stages: [
          { id: 's1', stageNumber: 1, name: 'Approver', assignedUserId: user.id, isFinalApproval: true, canReject: true, canReturnForCorrection: true, mapsToDocumentSignature: true },
        ],
      } as any,
      approvalSteps: [
        { stageId: 's1', stageNumber: 1, stageName: 'Approver', assignedUserId: user.id, assignedUserName: user.name, assignedRole: user.role, status: 'Pending' },
      ],
      approvalHistory: [
        { id: 'h1', stepNumber: 0, action: 'Submitted', actionByUserId: user.id, actionByName: user.name, actionByRole: user.role, dateTime: '2026-11-10T10:00:00.000Z', version: 1 },
      ],
      attachments: [],
      formData: {
        dateOfRequest: '10 Nov 2026',
        companyId: 'ICCL',
        companyName: 'ICCL',
        requesterId: user.id,
        requesterName: user.name,
        department: 'Operations',
        priority: 'Medium',
        workDescription: 'Workshop equipment',
        documents: {} as any,
      },
      versionSnapshots: [],
    };

    const resubmission = resubmitCorrectedRequest({
      request: initialRequest,
      actingUser: user,
      updatedFormData: { ...initialRequest.formData, workDescription: 'Corrected workshop equipment' },
      changeNote: 'Fixed description per manager feedback',
    });

    assert.equal(resubmission.success, true);
    const updated = resubmission.updatedRequest!;

    // Both id and displayId MUST be preserved
    assert.equal(updated.id, 'ICCL-AP-2026-unique-uuid-999');
    assert.equal(updated.displayId, 'ICCL-AP-2026-0042');
    assert.equal(getRequestDisplayReference(updated), 'ICCL-AP-2026-0042');
    assert.equal(updated.documentVersion, 2);
  });
});

