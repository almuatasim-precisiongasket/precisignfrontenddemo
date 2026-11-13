import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { applySignerChoices } from '../../utils/signingSelection';
import { createOutboxItem } from '../../../server/email/outboxStore';
import type { RequestRecord, UserProfile, WorkflowConfig } from '../../types';

test('Task 4 — Signer count derived from validated signing route matches generated notification', async (t) => {
  const requester: UserProfile = {
    id: 'u-requester',
    name: 'Requester Person',
    email: 'req@example.test',
    role: 'Admin',
    department: 'Operations',
    initials: 'RP',
    avatarColor: '#000',
    companyId: 'PEW',
  };

  const signer1: UserProfile = {
    id: 'u-signer1',
    name: 'Department Head',
    email: 's1@example.test',
    role: 'Employee',
    department: 'Operations',
    initials: 'DH',
    avatarColor: '#111',
    companyId: 'PEW',
  };

  const signer2: UserProfile = {
    id: 'u-signer2',
    name: 'Director Approver',
    email: 's2@example.test',
    role: 'Director',
    department: 'Executive',
    initials: 'DA',
    avatarColor: '#222',
    companyId: 'PEW',
  };

  const allUsers = [requester, signer1, signer2];

  await t.test('1. Single signer route yields STAGE 1 OF 1 in both preview and outbox notification', () => {
    const workflow: WorkflowConfig = {
      id: 'wf-single',
      companyId: 'PEW',
      formType: 'Administrative & Payment Request',
      version: 1,
      stages: [
        {
          id: 'stage-final',
          stageNumber: 1,
          name: 'Final Signer',
          assignedUserId: signer2.id,
          assignedRole: signer2.role,
          isFinalApproval: true,
          canReject: true,
          canReturnForCorrection: true,
          mapsToDocumentSignature: true,
        },
      ],
    } as any as WorkflowConfig;

    const selection = applySignerChoices(workflow, allUsers, requester.id, {
      'stage-final': signer2.id,
    });
    assert.equal('error' in selection, false);
    const resolvedStages = (selection as { workflow: WorkflowConfig }).workflow.stages;

    // Derived preview values
    const previewStageNumber = 1;
    const previewTotalStages = resolvedStages.length;
    const previewBadge = `STAGE ${previewStageNumber} OF ${previewTotalStages}`;
    assert.equal(previewBadge, 'STAGE 1 OF 1');

    // Generated outbox item for first signer
    const request: RequestRecord = {
      id: `PEW-AP-2026-${randomUUID()}`,
      displayId: 'PEW-AP-2026-0001',
      formType: 'Administrative & Payment Request',
      companyId: 'PEW',
      title: 'Single Signer Request',
      requesterId: requester.id,
      requesterName: requester.name,
      requesterRole: requester.role,
      department: requester.department,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'Pending Approval',
      currentStageIndex: 0,
      currentApproverId: signer2.id,
      currentApproverName: signer2.name,
      workflowVersion: 1,
      documentVersion: 1,
      workflowConfig: (selection as { workflow: WorkflowConfig }).workflow,
      approvalSteps: resolvedStages.map((s, idx) => ({
        stageId: s.id,
        stageNumber: idx + 1,
        stageName: s.name,
        assignedUserId: s.assignedUserId!,
        assignedUserName: signer2.name,
        assignedRole: s.assignedRole!,
        status: 'Pending',
      })),
      approvalHistory: [],
      attachments: [],
      formData: {
        dateOfRequest: '10 Nov 2026',
        companyId: 'PEW',
        companyName: 'Precision Engineering Works',
        requesterId: requester.id,
        requesterName: requester.name,
        department: requester.department,
        priority: 'Medium',
        workDescription: 'Work',
        documents: {} as any,
      },
      versionSnapshots: [],
    };

    const outboxItem = createOutboxItem('ACTION_REQUIRED', request, signer2, Date.now());
    assert.equal(outboxItem.payload.stageBadge, previewBadge);
    assert.equal(outboxItem.payload.totalStages, 1);
  });

  await t.test('2. Multiple signers (2 stages) yields STAGE 1 OF 2', () => {
    const workflow: WorkflowConfig = {
      id: 'wf-multi',
      companyId: 'PEW',
      formType: 'Administrative & Payment Request',
      version: 1,
      stages: [
        { id: 's1', stageNumber: 1, name: 'Manager Review', assignedUserId: signer1.id, isFinalApproval: false, requiredOnSubmit: true, canReject: true, canReturnForCorrection: true, mapsToDocumentSignature: true },
        { id: 's2', stageNumber: 2, name: 'Director Approval', assignedUserId: signer2.id, isFinalApproval: true, canReject: true, canReturnForCorrection: true, mapsToDocumentSignature: true },
      ],
    } as any as WorkflowConfig;

    const selection = applySignerChoices(workflow, allUsers, requester.id, {
      s1: signer1.id,
      s2: signer2.id,
    });
    assert.equal('error' in selection, false);
    const resolvedStages = (selection as { workflow: WorkflowConfig }).workflow.stages;

    const previewBadge = `STAGE 1 OF ${resolvedStages.length}`;
    assert.equal(previewBadge, 'STAGE 1 OF 2');

    const request: RequestRecord = {
      id: `PEW-AP-2026-${randomUUID()}`,
      displayId: 'PEW-AP-2026-0002',
      formType: 'Administrative & Payment Request',
      companyId: 'PEW',
      title: 'Multi Signer Request',
      requesterId: requester.id,
      requesterName: requester.name,
      requesterRole: requester.role,
      department: requester.department,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'Pending Approval',
      currentStageIndex: 0,
      currentApproverId: signer1.id,
      currentApproverName: signer1.name,
      workflowVersion: 1,
      documentVersion: 1,
      workflowConfig: (selection as { workflow: WorkflowConfig }).workflow,
      approvalSteps: resolvedStages.map((s, idx) => ({
        stageId: s.id,
        stageNumber: idx + 1,
        stageName: s.name,
        assignedUserId: s.assignedUserId!,
        assignedUserName: idx === 0 ? signer1.name : signer2.name,
        assignedRole: s.assignedRole!,
        status: idx === 0 ? 'Pending' : 'Pending',
      })),
      approvalHistory: [],
      attachments: [],
      formData: {
        dateOfRequest: '10 Nov 2026',
        companyId: 'PEW',
        companyName: 'Precision Engineering Works',
        requesterId: requester.id,
        requesterName: requester.name,
        department: requester.department,
        priority: 'Medium',
        workDescription: 'Work',
        documents: {} as any,
      },
      versionSnapshots: [],
    };

    const outboxItem = createOutboxItem('ACTION_REQUIRED', request, signer1, Date.now());
    assert.equal(outboxItem.payload.stageBadge, previewBadge);
    assert.equal(outboxItem.payload.totalStages, 2);
  });

  await t.test('3. Optional stage omitted drops total stages from 2 to 1', () => {
    const workflow: WorkflowConfig = {
      id: 'wf-optional',
      companyId: 'PEW',
      formType: 'Administrative & Payment Request',
      version: 1,
      stages: [
        // Optional intermediate stage (requiredOnSubmit is false/undefined)
        { id: 's1', stageNumber: 1, name: 'Optional Review', assignedUserId: signer1.id, isFinalApproval: false, requiredOnSubmit: false, canReject: true, canReturnForCorrection: true, mapsToDocumentSignature: true },
        { id: 's2', stageNumber: 2, name: 'Final Approval', assignedUserId: signer2.id, isFinalApproval: true, canReject: true, canReturnForCorrection: true, mapsToDocumentSignature: true },
      ],
    } as any as WorkflowConfig;

    // User explicitly omits optional stage s1 (passes null)
    const selection = applySignerChoices(workflow, allUsers, requester.id, {
      s1: null,
      s2: signer2.id,
    });
    assert.equal('error' in selection, false);
    const resolvedStages = (selection as { workflow: WorkflowConfig }).workflow.stages;

    assert.equal(resolvedStages.length, 1, 'Only 1 stage remains');
    const previewBadge = `STAGE 1 OF ${resolvedStages.length}`;
    assert.equal(previewBadge, 'STAGE 1 OF 1');

    const request: RequestRecord = {
      id: `PEW-AP-2026-${randomUUID()}`,
      displayId: 'PEW-AP-2026-0003',
      formType: 'Administrative & Payment Request',
      companyId: 'PEW',
      title: 'Omitted Stage Request',
      requesterId: requester.id,
      requesterName: requester.name,
      requesterRole: requester.role,
      department: requester.department,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'Pending Approval',
      currentStageIndex: 0,
      currentApproverId: signer2.id,
      currentApproverName: signer2.name,
      workflowVersion: 1,
      documentVersion: 1,
      workflowConfig: (selection as { workflow: WorkflowConfig }).workflow,
      approvalSteps: resolvedStages.map((s, idx) => ({
        stageId: s.id,
        stageNumber: idx + 1,
        stageName: s.name,
        assignedUserId: s.assignedUserId!,
        assignedUserName: signer2.name,
        assignedRole: s.assignedRole!,
        status: 'Pending',
      })),
      approvalHistory: [],
      attachments: [],
      formData: {
        dateOfRequest: '10 Nov 2026',
        companyId: 'PEW',
        companyName: 'Precision Engineering Works',
        requesterId: requester.id,
        requesterName: requester.name,
        department: requester.department,
        priority: 'Medium',
        workDescription: 'Work',
        documents: {} as any,
      },
      versionSnapshots: [],
    };

    const outboxItem = createOutboxItem('ACTION_REQUIRED', request, signer2, Date.now());
    assert.equal(outboxItem.payload.stageBadge, 'STAGE 1 OF 1');
    assert.equal(outboxItem.payload.stageBadge, previewBadge);
  });
});
