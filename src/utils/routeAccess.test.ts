import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadPreciRoute } from './routeAccess';
import { proposeSignerReplacement, acceptSignerReplacement } from './routeReplacement';
import { INITIAL_REQUESTS, INITIAL_USERS } from '../data/seedData';
import { needsMyAction } from './actionQueue';
import { approveRequestStage, completePreciRoute } from './workflowEngine';

test('route reads require participation or explicit processing membership, within company access', () => {
  const route=structuredClone(INITIAL_REQUESTS.find(r=>r.companyId==='PEW')!);
  const unrelated={...INITIAL_USERS[0],id:'unrelated',role:'HR' as const,companyId:'PEW' as const,isGroupAdmin:false};
  assert.equal(canReadPreciRoute(unrelated,route),false);
  route.workflowConfig.processingUserIds=[unrelated.id];
  assert.equal(canReadPreciRoute(unrelated,route),true);
  assert.equal(canReadPreciRoute({...unrelated,companyId:'FSG',allowedCompanyIds:[]},route),false);
  route.workflowConfig.processingUserIds=[];
  route.formerSignerIds=[unrelated.id];assert.equal(canReadPreciRoute(unrelated,route),true);
  assert.equal(canReadPreciRoute({...unrelated,role:'Director'},route),true);
});

test('declined replacement keeps original final signer and signed stages cannot be replaced', () => {
  const route=structuredClone(INITIAL_REQUESTS.find(r=>r.companyId==='PEW')!);
  route.status='Pending Approval';route.approvalSteps=route.approvalSteps.map((s,i)=>({...s,status:i===0?'Pending':'Waiting',signatureDataUrl:undefined}));
  const admin={...INITIAL_USERS[0],id:'route-admin',role:'HR' as const,companyId:'PEW' as const,canReplaceFinalApprover:true};
  const target={...admin,id:'new-final',canReplaceFinalApprover:false};
  const original=route.approvalSteps.at(-1)!.assignedUserId;
  const proposal=proposeSignerReplacement(route,admin,target,route.approvalSteps.at(-1)!.stageId,'Unavailable').updatedRequest!;
  assert.ok(proposal);
  assert.equal(acceptSignerReplacement(proposal,admin,true).success,false);
  const declined=acceptSignerReplacement(proposal,target,false).updatedRequest!;
  assert.equal(declined.pendingReplacement,undefined);
  assert.equal(declined.approvalSteps.at(-1)!.assignedUserId,original);
  route.approvalSteps.at(-1)!.status='Approved';
  assert.equal(proposeSignerReplacement(route,admin,target,route.approvalSteps.at(-1)!.stageId,'Unavailable').success,false);
});

test('a configured backup gets the signing task only after activation and cannot bypass without permission', () => {
  const route = structuredClone(INITIAL_REQUESTS.find(record => record.companyId === 'PEW' && record.approvalSteps.length === 2)!);
  route.formType = 'Administrative & Payment Request';
  route.status = 'Pending Approval';
  route.currentStageIndex = 0;
  route.approvalSteps.forEach((step, index) => { step.status = index ? 'Waiting' : 'Pending'; });
  route.currentApproverId = route.approvalSteps[0].assignedUserId;
  const final = route.approvalSteps[1];
  const admin = { ...INITIAL_USERS[0], id: 'coordinator', role: 'HR' as const, companyId: 'PEW' as const, canReplaceFinalApprover: true };
  const backup = { ...admin, id: 'backup', name: 'Backup Approver', canReplaceFinalApprover: false, isGroupAdmin: false };
  const stranger = { ...backup, id: 'stranger' };
  const primary = { ...backup, id: final.assignedUserId, name: final.assignedUserName };
  route.workflowConfig.stages[1].backupSignerIds = [backup.id];
  assert.equal(needsMyAction(route, backup.id), false);
  assert.equal(canReadPreciRoute(backup, route), false);
  assert.equal(proposeSignerReplacement(route, stranger, backup, final.stageId, 'Unavailable').success, false);
  assert.equal(proposeSignerReplacement(route, admin, stranger, final.stageId, 'Unavailable').success, false);
  const activated = proposeSignerReplacement(route, admin, backup, final.stageId, 'Unavailable').updatedRequest!;
  assert.equal(needsMyAction(activated, primary.id), false);
  assert.equal(needsMyAction(activated, backup.id), true);
  assert.equal(canReadPreciRoute(backup, activated), true);
  assert.equal(completePreciRoute({ request: activated, actingUser: backup, reason: 'Urgent', signatureDataUrl: 'mark' }).success, false);
  assert.equal(approveRequestStage({ request: activated, actingUser: backup, signatureDataUrl: 'mark' }).success, true);
  const restored = proposeSignerReplacement(activated, admin, primary, final.stageId, 'Returned').updatedRequest!;
  assert.equal(needsMyAction(restored, primary.id), true);
  assert.equal(needsMyAction(restored, backup.id), false);
  assert.equal(restored.approvalHistory.at(-1)?.comments?.includes('Returned'), true);
});
