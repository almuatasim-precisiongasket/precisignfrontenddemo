import type { RequestRecord, UserProfile, ApprovalHistoryItem } from '../types/index';
import { canUserAccessCompany } from './companyAccess';
import { canAdministerWorkflows } from './workflowAdministration';

function event(request: RequestRecord, actor: UserProfile, action: ApprovalHistoryItem['action'], comments: string): ApprovalHistoryItem {
  return { id: crypto.randomUUID(), stepNumber: 0, actionByUserId: actor.id, actionByName: actor.name, actionByRole: actor.role, action, comments, dateTime: new Date().toISOString(), version: request.documentVersion };
}
export function proposeSignerReplacement(request: RequestRecord, actor: UserProfile, target: UserProfile, stageId: string, reason: string) {
  const index = request.approvalSteps.findIndex(step => step.stageId === stageId);
  const step = request.approvalSteps[index];
  if (request.status !== 'Pending Approval' || !step || request.pendingReplacement || !reason?.trim() || !canUserAccessCompany(actor,request.companyId) || !canUserAccessCompany(target,request.companyId) || target.id === request.requesterId || target.id === step.assignedUserId || request.approvalSteps.some(s => s.assignedUserId === target.id) || ['Approved','Bypassed','Rejected'].includes(step.status)) return { success: false, error: 'Invalid replacement or route state.' };
  const final = index === request.approvalSteps.length - 1;
  if (final ? !actor.canReplaceFinalApprover : !canAdministerWorkflows(actor)) return { success: false, error: 'Replacement permission required.' };
  const proposed: RequestRecord = { ...request, updatedAt: new Date().toISOString(), pendingReplacement: { stageId, oldUserId: step.assignedUserId, newUserId: target.id, reason: reason.trim(), proposedBy: actor.id }, approvalHistory: [...request.approvalHistory,event(request,actor,'Signer Replacement Proposed',`${step.assignedUserName} → ${target.name}: ${reason.trim()}`)] };
  // Final authority transfers only upon acceptance. Intermediate replacement is immediate.
  return final ? { success: true, updatedRequest: proposed } : acceptSignerReplacement(proposed,target,true);
}
export function acceptSignerReplacement(request: RequestRecord, actor: UserProfile, accept: boolean) {
  const pending = request.pendingReplacement;
  const index = request.approvalSteps.findIndex(step => step.stageId === pending?.stageId);
  const step = request.approvalSteps[index];
  if (request.status !== 'Pending Approval' || !pending || !step || pending.newUserId !== actor.id || step.assignedUserId !== pending.oldUserId || ['Approved','Bypassed','Rejected'].includes(step.status) || !canUserAccessCompany(actor,request.companyId)) return { success: false, error: 'Replacement is no longer available.' };
  const updatedRequest: RequestRecord = { ...request, updatedAt: new Date().toISOString(), pendingReplacement: undefined,
    formerSignerIds: accept ? [...new Set([...(request.formerSignerIds || []),pending.oldUserId])] : request.formerSignerIds,
    approvalSteps: request.approvalSteps.map((s,i) => accept && i === index ? { ...s, assignedUserId: actor.id, assignedUserName: actor.name, assignedRole: actor.role } : s),
    approvalHistory: [...request.approvalHistory,event(request,actor,accept ? 'Signer Replaced' : 'Replacement Declined',`${pending.oldUserId} → ${actor.name}: ${pending.reason}`)] };
  if (accept) {
    updatedRequest.workflowConfig = structuredClone(request.workflowConfig);
    updatedRequest.workflowConfig.stages[index] = { ...updatedRequest.workflowConfig.stages[index], assignedUserId: actor.id, assignedRole: actor.role };
    if (index === request.currentStageIndex) { updatedRequest.currentApproverId = actor.id; updatedRequest.currentApproverName = actor.name; }
    if (index === request.approvalSteps.length - 1) updatedRequest.finalApproverName = actor.name;
  }
  return { success: true, updatedRequest };
}
