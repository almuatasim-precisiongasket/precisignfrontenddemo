import type { RequestRecord, UserProfile } from '../types/index';
import { needsProcessingAction } from './routeProcessing';

export function needsMyAction(request: RequestRecord, user: string | UserProfile): boolean {
  if (typeof user !== 'string' && needsProcessingAction(request, user)) return true;
  const userId = typeof user === 'string' ? user : user.id;
  if (request.status === 'Returned for Correction') return request.requesterId === userId;
  if (request.status !== 'Pending Approval') return false;
  const final = request.approvalSteps.at(-1);
  return request.currentApproverId === userId || request.pendingReplacement?.newUserId === userId ||
    (final?.assignedUserId === userId && final.status !== 'Approved' && final.status !== 'Bypassed');
}
