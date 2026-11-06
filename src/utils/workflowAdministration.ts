import type { CompanyId, UserProfile, WorkflowStageConfig } from '../types/index';
import { canUserAccessCompany } from './companyAccess';

export const canAdministerWorkflows = (user: UserProfile) => user.role === 'Director' || user.isGroupAdmin === true;

export function resolveConfiguredSigner(stage: WorkflowStageConfig, users: UserProfile[], companyId: CompanyId) {
  const eligible = users.filter(user => canUserAccessCompany(user, companyId));
  if (stage.assignedUserId) return eligible.find(user => user.id === stage.assignedUserId);
  const matches = eligible.filter(user => user.role === stage.assignedRole);
  return matches.length === 1 ? matches[0] : undefined;
}
