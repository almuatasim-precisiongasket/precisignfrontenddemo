import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile, WorkflowConfig, RequestRecord } from '../types';
import { routeDraft, newSigningStep } from './routeForms';
import { applySignerChoices, signerOptions } from './signingSelection';
import { proposeSignerReplacement, acceptSignerReplacement, canCompleteWithOutstandingSteps } from './routeReplacement';

const people: UserProfile[] = ['requester', 'reviewer', 'final', 'backup', 'other'].map(id => ({
  id, name: id, email: id + '@example.test', role: 'Admin', department: 'Test',
  initials: id[0], avatarColor: '#123456', companyId: 'PEW', companyGrants: ['PEW'],
}));
const workflow: WorkflowConfig = {
  id: 'directory', companyId: 'PEW', formType: 'IT Request', version: 1,
  signerSelection: 'company-directory', allowFinalBypass: true,
  preventSelfApproval: true, allowDirectorOverride: false, reminderDays: 0, escalationDays: 0,
  rejectionBehavior: 'archive', returnBehavior: 'restart_workflow',
  stages: ['review', 'final'].map((id, index) => ({
    id, stageNumber: index + 1, name: id, assignedUserId: index ? 'final' : 'reviewer', assignedRole: 'Admin',
    requiredOnSubmit: true, isFinalApproval: !!index, mapsToDocumentSignature: !!index,
    canReject: true, canReturnForCorrection: true,
  })),
};
function route(): RequestRecord {
  return {
    id: 'synthetic', companyId: 'PEW', requesterId: 'requester', documentVersion: 2,
    status: 'Pending Approval', workflowConfig: structuredClone(workflow), currentStageIndex: 1,
    currentApproverId: 'final', approvalHistory: [
      { id: 'old', version: 1, action: 'Approved', actionByUserId: 'other' },
      { id: 'current', version: 2, action: 'Approved', actionByUserId: 'reviewer' },
    ],
    approvalSteps: [
      { stageId: 'review', stageNumber: 1, assignedUserId: 'reviewer', assignedUserName: 'reviewer', status: 'Approved' },
      { stageId: 'final', stageNumber: 2, assignedUserId: 'final', assignedUserName: 'final', status: 'Pending' },
    ],
  } as RequestRecord;
}
test('directory selection permits company users, omits intermediate steps and requires final approval', () => {
  assert.equal(signerOptions(workflow, workflow.stages[1], people, 'requester').length, 4);
  const chosen = applySignerChoices(workflow, people, 'requester', { final: { primaryId: 'other', secondaryIds: ['backup'] } });
  assert.equal(chosen.workflow?.stages.length, 1);
  assert.equal(chosen.workflow?.stages[0].assignedUserId, 'other');
  assert.ok(applySignerChoices(workflow, people, 'requester', { final: null }).error);
  assert.ok(applySignerChoices(workflow, people, 'requester', { final: 'requester' }).error);
  const outsider = { ...people[3], companyGrants: ['FSG'] as const };
  assert.ok(applySignerChoices(workflow, [people[0], { ...outsider, companyGrants: ['FSG'] }], 'requester', { final: 'backup' }).error);
});
test('latest current-version signer proposes final replacement and authority transfers only on acceptance', () => {
  const request = route();
  assert.equal(proposeSignerReplacement(request, people[4], people[3], 'final', 'Unavailable').success, false);
  const proposal = proposeSignerReplacement(request, people[1], people[3], 'final', 'Unavailable');
  assert.equal(proposal.success, true);
  assert.equal(proposal.updatedRequest?.approvalSteps.at(-1)?.assignedUserId, 'final');
  const declined = acceptSignerReplacement(proposal.updatedRequest!, people[3], false);
  assert.equal(declined.updatedRequest?.approvalSteps.at(-1)?.assignedUserId, 'final');
  const accepted = acceptSignerReplacement(proposal.updatedRequest!, people[3], true);
  assert.equal(accepted.updatedRequest?.approvalSteps.at(-1)?.assignedUserId, 'backup');
  assert.equal(canCompleteWithOutstandingSteps(accepted.updatedRequest!, 'backup'), true);
  accepted.updatedRequest!.workflowConfig.allowFinalBypass = false;
  assert.equal(canCompleteWithOutstandingSteps(accepted.updatedRequest!, 'backup'), false);
  const withoutReviewer = route();
  withoutReviewer.approvalHistory = [];
  assert.equal(proposeSignerReplacement(withoutReviewer, people[0], people[3], 'final', 'Unavailable').success, true);
});


test('saving extra reviewers never recreates a removed Department Head paper mapping', () => {
  const draft = routeDraft('PEW', 'Administrative & Payment Request');
  const extra = newSigningStep('Budget review', false);
  const withoutHead = { ...draft, stages: [extra, draft.stages.at(-1)!] };
  const saved = routeDraft('PEW', 'Administrative & Payment Request', withoutHead);
  assert.equal(saved.stages[0].documentSlot, undefined);
  assert.equal(saved.stages.at(-1)?.isFinalApproval, true);
});

test('directory suggestions, optional backups and duplicate signers match the submitted snapshot', () => {
  const result = applySignerChoices(workflow, people, 'requester', {
    review: { primaryId: 'reviewer', secondaryIds: ['backup'] },
  });
  assert.equal(result.workflow?.stages[1].assignedUserId, 'final');
  assert.deepEqual(result.workflow?.stages[0].backupSignerIds, ['backup']);
  assert.equal(result.workflow?.stages.length, 2);
  assert.ok(applySignerChoices(workflow, people, 'requester', {review:'final'}).error);
  assert.ok(applySignerChoices(workflow, people, 'requester', {review:{primaryId:'reviewer',secondaryIds:['final']}}).error);
});

test('an included optional step cannot silently disappear without a selected signer', () => {
  const selected = applySignerChoices(workflow, people, 'requester', {
    review: { primaryId: null, secondaryIds: [] }, final: 'final',
  });
  assert.match(selected.error ?? '', /Choose a signer/);
});
