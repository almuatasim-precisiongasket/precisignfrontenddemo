import type { RequestRecord, UserProfile, ApprovalHistoryItem } from '../types/index';
import { canUserAccessCompany } from './companyAccess';
import { canAdministerWorkflows } from './workflowAdministration';

function event(request: RequestRecord, actor: UserProfile, action: ApprovalHistoryItem['action'], comments: string): ApprovalHistoryItem {
  return { id: crypto.randomUUID(), stepNumber: 0, actionByUserId: actor.id, actionByName: actor.name, actionByRole: actor.role, action, comments, dateTime: new Date().toISOString(), version: request.documentVersion };
}
export function usesConfiguredBackups(request: RequestRecord) {
  return ['Administrative & Payment Request', 'IT Request', 'Cash Voucher', 'Expense Claim', 'R&D Initiative'].includes(request.formType);
}

export function configuredReplacementIds(request: RequestRecord, stageId: string) {
  const step = request.approvalSteps.find(item => item.stageId === stageId);
  const stage = request.workflowConfig.stages.find(item => item.id === stageId);
  return [step?.primarySignerId ?? stage?.assignedUserId, ...(stage?.backupSignerIds ?? [])]
    .filter((id): id is string => !!id && id !== step?.assignedUserId);
}

export function canProposeFinalReplacement(request: RequestRecord, actor: UserProfile) {
  if (!canUserAccessCompany(actor, request.companyId)) return false;
  if (actor.canReplaceFinalApprover) return true;
  if (request.workflowConfig.signerSelection !== 'company-directory') return false;
  const finalId = request.approvalSteps.at(-1)?.assignedUserId;
  const previous = [...request.approvalHistory].reverse().find(item =>
    item.version === request.documentVersion && item.action === 'Approved'
    && item.actionByUserId !== finalId);
  return actor.id === (previous?.actionByUserId ?? request.requesterId);
}

export function canCompleteWithOutstandingSteps(request: RequestRecord, actorId: string) {
  const final = request.approvalSteps.at(-1);
  if (!final || final.assignedUserId !== actorId) return false;
  if (request.workflowConfig.signerSelection === 'company-directory') return request.workflowConfig.allowFinalBypass === true;
  if (!usesConfiguredBackups(request) || !final.primarySignerId || final.primarySignerId === actorId) return true;
  return request.workflowConfig.stages.find(stage => stage.id === final.stageId)?.backupCompletionUserIds?.includes(actorId) === true;
}
export function proposeSignerReplacement(request: RequestRecord, actor: UserProfile, target: UserProfile, stageId: string, reason: string) {
  const index = request.approvalSteps.findIndex(step => step.stageId === stageId);
  const step = request.approvalSteps[index];
  if (request.status !== 'Pending Approval' || !step || request.pendingReplacement || !reason?.trim() || !canUserAccessCompany(actor,request.companyId) || !canUserAccessCompany(target,request.companyId) || target.id === request.requesterId || target.id === step.assignedUserId || request.approvalSteps.some(s => s.assignedUserId === target.id) || ['Approved','Bypassed','Rejected'].includes(step.status)) return { success: false, error: 'Invalid replacement or route state.' };
  const final = index === request.approvalSteps.length - 1;
  if (usesConfiguredBackups(request) && request.workflowConfig.signerSelection !== 'company-directory') {
    if (!actor.canReplaceFinalApprover) return { success: false, error: 'Backup activation permission required.' };
    if (!configuredReplacementIds(request, stageId).includes(target.id)) return { success: false, error: 'Choose a configured backup or return the step to its primary signer.' };
    const updatedRequest: RequestRecord = {
      ...request,
      updatedAt: new Date().toISOString(),
      formerSignerIds: [...new Set([...(request.formerSignerIds ?? []), step.assignedUserId])],
      approvalSteps: request.approvalSteps.map((item, i) => i === index ? {
        ...item, primarySignerId: item.primarySignerId ?? step.assignedUserId, assignedUserId: target.id, assignedUserName: target.name, assignedRole: target.role,
      } : item),
      approvalHistory: [...request.approvalHistory, event(request, actor, 'Signer Replaced', `${step.assignedUserName} → ${target.name}: ${reason.trim()}`)],
    };
    if (index === request.currentStageIndex) {
      updatedRequest.currentApproverId = target.id;
      updatedRequest.currentApproverName = target.name;
    }
    if (final) updatedRequest.finalApproverName = target.name;
    return { success: true, updatedRequest };
  }
  if (final ? !canProposeFinalReplacement(request, actor) : !canAdministerWorkflows(actor)) return { success: false, error: 'Replacement permission required.' };
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
