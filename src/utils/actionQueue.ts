import type { RequestRecord } from '../types/index';
export function needsMyAction(request: RequestRecord, userId: string): boolean {
  if (request.status !== 'Pending Approval') return false;
  const final = request.approvalSteps.at(-1);
  return request.currentApproverId === userId || request.pendingReplacement?.newUserId === userId ||
    (final?.assignedUserId === userId && final.status !== 'Approved' && final.status !== 'Bypassed');
}
