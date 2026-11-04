import type { RequestRecord, UserProfile } from '../types/index';
import { canUserAccessCompany } from './companyAccess';
export function canReadPreciRoute(user: UserProfile, request: RequestRecord) {
  return canUserAccessCompany(user,request.companyId) && Boolean(
    user.isGroupAdmin || user.role === 'Director' || user.role === 'General Manager' || user.canReplaceFinalApprover ||
    request.requesterId === user.id || request.approvalSteps?.some(step => step.assignedUserId === user.id) ||
    request.formerSignerIds?.includes(user.id) || request.pendingReplacement?.newUserId === user.id ||
    request.workflowConfig?.processingUserIds?.includes(user.id));
}
