import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApprovalJourney, getInitials } from './approvalJourney';
import { RequestRecord, WorkflowConfig, UserProfile, AdminWorkFormData } from '../types/index';
import {
  createNewRequestRecord,
  approveRequestStage,
  returnRequestForCorrection,
  resubmitCorrectedRequest,
  rejectRequest,
  directorOverrideApprove,
} from './workflowEngine';

const sampleUsers: UserProfile[] = [
  {
    id: 'user-anzar',
    name: 'Anzar',
    email: 'anzar@precision-eg.com',
    role: 'Admin',
    department: 'Admin',
    initials: 'AN',
    avatarColor: '#10b981',
    companyId: 'PEW',
  },
  {
    id: 'user-shekar',
    name: 'Shekar',
    email: 'shekar@precision-eg.com',
    role: 'General Manager',
    department: 'Management',
    initials: 'SH',
    avatarColor: '#8b5cf6',
    companyId: 'PEW',
  },
  {
    id: 'user-afzal',
    name: 'Afzal Kazi',
    email: 'afzal.kazi@precision-eg.com',
    role: 'Director',
    department: 'Management',
    initials: 'AK',
    avatarColor: '#6366f1',
    companyId: 'PEW',
  },
  {
    id: 'user-observer',
    name: 'Auditor User',
    email: 'auditor@precision-eg.com',
    role: 'HR',
    department: 'Audit',
    initials: 'AU',
    avatarColor: '#0ea5e9',
    companyId: 'PEW',
  },
];

const sampleWorkflowConfig: WorkflowConfig = {
  id: 'wf-pew-admin-work',
  formType: 'Admin Work Request',
  companyId: 'PEW',
  version: 1,
  preventSelfApproval: true,
  allowDirectorOverride: true,
  reminderDays: 2,
  escalationDays: 5,
  rejectionBehavior: 'archive',
  returnBehavior: 'restart_workflow',
  stages: [
    {
      id: 'stg-1',
      stageNumber: 1,
      name: 'GM Approval',
      assignedRole: 'General Manager',
      assignedUserId: 'user-shekar',
      isFinalApproval: false,
      canReject: true,
      canReturnForCorrection: true,
      mapsToDocumentSignature: false,
    },
    {
      id: 'stg-2',
      stageNumber: 2,
      name: 'Director Approval',
      assignedRole: 'Director',
      assignedUserId: 'user-afzal',
      isFinalApproval: true,
      canReject: true,
      canReturnForCorrection: true,
      mapsToDocumentSignature: true,
    },
  ],
};

const sampleFormData: AdminWorkFormData = {
  dateOfRequest: '03 Nov 2026',
  companyId: 'PEW',
  companyName: 'PEW - Precision Engineering Works',
  requesterId: 'user-anzar',
  requesterName: 'Anzar',
  department: 'Admin',
  priority: 'Urgent',
  workDescription: 'Renovation of the main meeting room.',
  documents: {
    onlineDocumentChamber: true,
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
  requesterSignatureName: 'Anzar',
};

test('resubmission does not reuse old stage comments or dates', () => {
  const request = createNewRequestRecord({ id: 'version-test', formType: 'Admin Work Request', formData: sampleFormData, requester: sampleUsers[0], workflowConfig: sampleWorkflowConfig, users: sampleUsers });
  const approved = approveRequestStage({ request, actingUser: sampleUsers[1], comment: 'old note' }).updatedRequest!;
  const returned = returnRequestForCorrection({ request: approved, actingUser: sampleUsers[2], reason: 'fix' }).updatedRequest!;
  const revised = resubmitCorrectedRequest({ request: returned, actingUser: sampleUsers[0], updatedFormData: returned.formData }).updatedRequest!;
  const journey = buildApprovalJourney(revised);
  assert.equal(journey.milestones[1].comments, undefined);
  assert.equal(journey.milestones[1].signatureDate, undefined);
  assert.equal(journey.lifecycleEvents.some(event => event.comments === 'old note'), true);
});

test('override shows the actual director, without signing bypassed stages', () => {
  const request = createNewRequestRecord({ id: 'override-test', formType: 'Admin Work Request', formData: sampleFormData, requester: sampleUsers[0], workflowConfig: sampleWorkflowConfig, users: sampleUsers });
  const director = { ...sampleUsers[2], id: 'alternate-director', name: 'Alternate Director' };
  const result = directorOverrideApprove({ request, directorUser: director, reason: 'Urgent' }).updatedRequest!;
  const journey = buildApprovalJourney(result);
  assert.equal(journey.milestones[1].signatureStatus, 'not_required');
  assert.equal(journey.milestones[2].participantName, director.name);
  assert.equal(journey.lifecycleEvents.at(-1)?.actionByUserId, director.id);
});

test('Scenario A & Section 4 Rules: Anzar submits -> Shekar approves -> Afzal pending', () => {
  const anzar = sampleUsers[0];
  const shekar = sampleUsers[1];
  const afzal = sampleUsers[2];

  // 1. Initial creation
  const req = createNewRequestRecord({
    id: 'PEW-AW-2026-0090',
    formType: 'Admin Work Request',
    formData: sampleFormData,
    requester: anzar,
    workflowConfig: sampleWorkflowConfig,
    users: sampleUsers,
  });

  // At stage 0: 0 of 2 approval stages completed, waiting for Shekar
  const journeyInitial = buildApprovalJourney(req, 'user-shekar');
  assert.equal(journeyInitial.stageCounts.totalStages, 2);
  assert.equal(journeyInitial.stageCounts.completedStages, 0);
  assert.equal(journeyInitial.stageCounts.summaryText, '0 of 2 approval stages completed');
  assert.equal(journeyInitial.milestones.length, 3); // 1 Requester + 2 stages
  assert.equal(journeyInitial.responsibility.headline, 'Action required from you');

  // Shekar approves stage 1
  const step1 = approveRequestStage({
    request: req,
    actingUser: shekar,
    comment: 'GM verified and approved.',
  });
  assert.equal(step1.success, true);
  const afterShekar = step1.updatedRequest!;

  // 2. Verified for Observer (third party viewing)
  const journeyObserver = buildApprovalJourney(afterShekar, 'user-observer');
  assert.equal(journeyObserver.stageCounts.completedStages, 1);
  assert.equal(journeyObserver.stageCounts.totalStages, 2);
  assert.equal(journeyObserver.stageCounts.percentage, 50);
  assert.equal(journeyObserver.stageCounts.summaryText, '1 of 2 approval stages completed');
  assert.equal(journeyObserver.responsibility.headline, 'Waiting for Afzal Kazi — Director');
  assert.equal(journeyObserver.responsibility.isCurrentUserResponsible, false);

  // Check 3 Milestones:
  // Milestone 0: Anzar (Submitted & Signed)
  assert.equal(journeyObserver.milestones[0].participantName, 'Anzar');
  assert.equal(journeyObserver.milestones[0].statusLabel, 'Submitted & Signed');
  assert.equal(journeyObserver.milestones[0].status, 'submitted');

  // Milestone 1: Shekar (Approved & Signed)
  assert.equal(journeyObserver.milestones[1].participantName, 'Shekar');
  assert.equal(journeyObserver.milestones[1].statusLabel, 'Approved & Signed');
  assert.equal(journeyObserver.milestones[1].status, 'completed');
  assert.equal(journeyObserver.milestones[1].comments, 'GM verified and approved.');

  // Milestone 2: Afzal Kazi (Awaiting Approval)
  assert.equal(journeyObserver.milestones[2].participantName, 'Afzal Kazi');
  assert.equal(journeyObserver.milestones[2].statusLabel, 'Awaiting Approval');
  assert.equal(journeyObserver.milestones[2].status, 'current');

  // 3. Verified for Afzal (the responsible approver)
  const journeyAfzal = buildApprovalJourney(afterShekar, 'user-afzal');
  assert.equal(journeyAfzal.responsibility.headline, 'Action required from you');
  assert.equal(journeyAfzal.responsibility.isCurrentUserResponsible, true);
  assert.equal(journeyAfzal.milestones[2].isAssignedToCurrentUser, true);

  // 4. Afzal completes approval
  const step2 = approveRequestStage({
    request: afterShekar,
    actingUser: afzal,
    comment: 'Director certified.',
  });
  assert.equal(step2.success, true);
  const completedReq = step2.updatedRequest!;

  const journeyComplete = buildApprovalJourney(completedReq);
  assert.equal(journeyComplete.status, 'Approved');
  assert.equal(journeyComplete.stageCounts.completedStages, 2);
  assert.equal(journeyComplete.stageCounts.percentage, 100);
  assert.equal(journeyComplete.stageCounts.summaryText, 'All 2 approval stages completed');
  assert.equal(journeyComplete.responsibility.headline, 'PreciRoute completed');
  assert.equal(journeyComplete.responsibility.variant, 'completed');
});

test('Scenario B: Return for correction highlights requester responsibility', () => {
  const anzar = sampleUsers[0];
  const shekar = sampleUsers[1];

  const req = createNewRequestRecord({
    id: 'PEW-AW-2026-0091',
    formType: 'Admin Work Request',
    formData: sampleFormData,
    requester: anzar,
    workflowConfig: sampleWorkflowConfig,
    users: sampleUsers,
  });

  const returned = returnRequestForCorrection({
    request: req,
    actingUser: shekar,
    reason: 'Please attach the room floor plan and supplier quotation.',
  });
  assert.equal(returned.success, true);
  const returnedReq = returned.updatedRequest!;

  // When requester views it
  const journeyRequester = buildApprovalJourney(returnedReq, 'user-anzar');
  assert.equal(journeyRequester.responsibility.variant, 'returned');
  assert.match(journeyRequester.responsibility.headline, /Action required from you/);
  assert.match(journeyRequester.responsibility.subtext, /floor plan and supplier quotation/);
  assert.equal(journeyRequester.responsibility.isCurrentUserResponsible, true);
  assert.equal(journeyRequester.milestones[0].status, 'returned');
  assert.equal(journeyRequester.milestones[0].statusLabel, 'Returned for Correction');

  // When another user views it
  const journeyObserver = buildApprovalJourney(returnedReq, 'user-observer');
  assert.equal(journeyObserver.responsibility.headline, 'Returned to Anzar for correction');
  assert.equal(journeyObserver.responsibility.isCurrentUserResponsible, false);

  // Now Anzar resubmits
  const resubmitted = resubmitCorrectedRequest({
    request: returnedReq,
    actingUser: anzar,
    updatedFormData: {
      ...sampleFormData,
      workDescription: 'Renovation with floor plan attached.',
    },
    changeNote: 'Attached vendor quotes and floor plan.',
  });
  assert.equal(resubmitted.success, true);
  const v2Req = resubmitted.updatedRequest!;

  const journeyV2 = buildApprovalJourney(v2Req, 'user-shekar');
  assert.equal(journeyV2.documentVersion, 2);
  assert.equal(journeyV2.milestones[0].statusLabel, 'Resubmitted (v2)');
  assert.equal(journeyV2.milestones[1].status, 'current');
  assert.equal(journeyV2.stageCounts.completedStages, 0);
});

test('Scenario C: User without approval authority sees read-only journey', () => {
  const anzar = sampleUsers[0];
  const req = createNewRequestRecord({
    id: 'PEW-AW-2026-0092',
    formType: 'Admin Work Request',
    formData: sampleFormData,
    requester: anzar,
    workflowConfig: sampleWorkflowConfig,
    users: sampleUsers,
  });

  const journey = buildApprovalJourney(req, 'user-observer');
  assert.equal(journey.responsibility.isCurrentUserResponsible, false);
  assert.equal(journey.responsibility.headline, 'Waiting for Shekar — General Manager');
  assert.equal(journey.milestones.every((m) => !m.isAssignedToCurrentUser), true);
});

test('Scenario D: Rejected request terminates active journey accurately', () => {
  const anzar = sampleUsers[0];
  const shekar = sampleUsers[1];

  const req = createNewRequestRecord({
    id: 'PEW-AW-2026-0093',
    formType: 'Admin Work Request',
    formData: sampleFormData,
    requester: anzar,
    workflowConfig: sampleWorkflowConfig,
    users: sampleUsers,
  });

  const rejected = rejectRequest({
    request: req,
    actingUser: shekar,
    reason: 'Budget frozen for Q4 renovations.',
  });
  assert.equal(rejected.success, true);

  const journey = buildApprovalJourney(rejected.updatedRequest!, 'user-anzar');
  assert.equal(journey.status, 'Rejected');
  assert.equal(journey.responsibility.variant, 'rejected');
  assert.match(journey.responsibility.headline, /Request rejected by Shekar — General Manager/);
  assert.match(journey.responsibility.subtext, /Budget frozen for Q4 renovations/);
  // Stage 1 was rejected, Stage 2 remains upcoming/not awaiting action
  assert.equal(journey.milestones[1].status, 'rejected');
  assert.equal(journey.milestones[2].status, 'waiting');
  assert.equal(journey.milestones[2].isCurrentActionRequired, false);
});

test('Scenario E: Single-approver workflow and 4-approver workflow calculate accurately', () => {
  const anzar = sampleUsers[0];
  const afzal = sampleUsers[2];

  // 1-approver workflow
  const singleStageConfig: WorkflowConfig = {
    ...sampleWorkflowConfig,
    id: 'wf-single',
    stages: [
      {
        id: 'stg-dir-only',
        stageNumber: 1,
        name: 'Director Approval',
        assignedRole: 'Director',
        assignedUserId: 'user-afzal',
        isFinalApproval: true,
        canReject: true,
        canReturnForCorrection: true,
        mapsToDocumentSignature: true,
      },
    ],
  };

  const reqSingle = createNewRequestRecord({
    id: 'PEW-AW-2026-0094',
    formType: 'Admin Work Request',
    formData: sampleFormData,
    requester: anzar,
    workflowConfig: singleStageConfig,
    users: sampleUsers,
  });

  const journeySingle = buildApprovalJourney(reqSingle);
  assert.equal(journeySingle.stageCounts.totalStages, 1);
  assert.equal(journeySingle.milestones.length, 2); // 1 Requester + 1 Approver
  assert.equal(journeySingle.stageCounts.summaryText, '0 of 1 approval stage completed');

  // 4-approver workflow
  const fourStageConfig: WorkflowConfig = {
    ...sampleWorkflowConfig,
    id: 'wf-four-stages',
    stages: [
      {
        id: 'stg-dept',
        stageNumber: 1,
        name: 'Dept Head Review',
        assignedRole: 'Admin',
        assignedUserId: 'user-anzar-mgr',
        isFinalApproval: false,
        canReject: true,
        canReturnForCorrection: true,
        mapsToDocumentSignature: false,
      },
      {
        id: 'stg-fin',
        stageNumber: 2,
        name: 'Finance Review',
        assignedRole: 'Finance',
        assignedUserId: 'user-asad',
        isFinalApproval: false,
        canReject: true,
        canReturnForCorrection: true,
        mapsToDocumentSignature: false,
      },
      {
        id: 'stg-gm',
        stageNumber: 3,
        name: 'GM Verification',
        assignedRole: 'General Manager',
        assignedUserId: 'user-shekar',
        isFinalApproval: false,
        canReject: true,
        canReturnForCorrection: true,
        mapsToDocumentSignature: false,
      },
      {
        id: 'stg-dir',
        stageNumber: 4,
        name: 'Director Approval',
        assignedRole: 'Director',
        assignedUserId: 'user-afzal',
        isFinalApproval: true,
        canReject: true,
        canReturnForCorrection: true,
        mapsToDocumentSignature: true,
      },
    ],
  };

  const reqFour = createNewRequestRecord({
    id: 'PEW-AW-2026-0095',
    formType: 'Admin Work Request',
    formData: sampleFormData,
    requester: anzar,
    workflowConfig: fourStageConfig,
    users: [...sampleUsers,
      { ...anzar, id: 'user-anzar-mgr', name: 'Department Manager' },
      { ...anzar, id: 'user-asad', name: 'Asad', role: 'Finance' },
    ],
  });

  const journeyFour = buildApprovalJourney(reqFour);
  assert.equal(journeyFour.stageCounts.totalStages, 4);
  assert.equal(journeyFour.milestones.length, 5); // 1 Requester + 4 Approvers
  assert.equal(journeyFour.stageCounts.summaryText, '0 of 4 approval stages completed');
});

test('Scenario F: Saved workflow snapshot is preserved even if global config changes', () => {
  const anzar = sampleUsers[0];
  const req = createNewRequestRecord({
    id: 'PEW-AW-2026-0096',
    formType: 'Admin Work Request',
    formData: sampleFormData,
    requester: anzar,
    workflowConfig: sampleWorkflowConfig, // Version 1 with 2 stages
    users: sampleUsers,
  });

  // Imagine global workflow config was updated later to version 2 with 3 stages
  const newGlobalWorkflowConfig: WorkflowConfig = {
    ...sampleWorkflowConfig,
    version: 2,
    stages: [
      ...sampleWorkflowConfig.stages,
      {
        id: 'stg-extra',
        stageNumber: 3,
        name: 'Compliance Signoff',
        assignedRole: 'HR',
        isFinalApproval: true,
        canReject: true,
        canReturnForCorrection: true,
        mapsToDocumentSignature: true,
      },
    ],
  };

  // Building journey for the existing request uses its saved snapshot
  const journey = buildApprovalJourney(req);
  assert.equal(journey.workflowVersion, 1);
  assert.equal(journey.stageCounts.totalStages, 2);
  assert.equal(journey.milestones.length, 3);
});

test('Initials extraction utility works for diverse names', () => {
  assert.equal(getInitials('Anzar'), 'AN');
  assert.equal(getInitials('Afzal Kazi'), 'AK');
  assert.equal(getInitials('Jay Shankar'), 'JS');
  assert.equal(getInitials('Mohammed Al-Dosari'), 'MA');
  assert.equal(getInitials(''), '??');
});
