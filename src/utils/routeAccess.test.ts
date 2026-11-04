import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadPreciRoute } from './routeAccess';
import { proposeSignerReplacement, acceptSignerReplacement } from './routeReplacement';
import { INITIAL_REQUESTS, INITIAL_USERS } from '../data/seedData';

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
