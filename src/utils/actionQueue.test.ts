import test from 'node:test';
import assert from 'node:assert/strict';
import { needsMyAction } from './actionQueue';
import { INITIAL_REQUESTS } from '../data/seedData';
test('queue counts unsigned final and replacement responses but not optional completion after signing',()=>{
 const r=structuredClone(INITIAL_REQUESTS[0]);r.status='Pending Approval';r.currentApproverId='first';r.approvalSteps.at(-1)!.assignedUserId='final';r.approvalSteps.at(-1)!.status='Waiting';
 assert.equal(needsMyAction(r,'final'),true);assert.equal(needsMyAction(r,'stranger'),false);
 r.approvalSteps.at(-1)!.status='Approved';assert.equal(needsMyAction(r,'final'),false);assert.equal(needsMyAction(r,'first'),true);
 r.pendingReplacement={newUserId:'new',oldUserId:'final',stageId:'final',reason:'Unavailable',proposedBy:'admin'};assert.equal(needsMyAction(r,'new'),true);
 r.status='Cancelled';assert.equal(needsMyAction(r,'new'),false);
});

test('returned routes need action from the original requester only', () => {
  const request = { ...INITIAL_REQUESTS[0], status: 'Returned for Correction' as const };
  assert.equal(needsMyAction(request, request.requesterId), true);
  assert.equal(needsMyAction(request, 'unrelated'), false);
});
