import {
  RequestRecord,
  WorkflowConfig,
  UserProfile,
  AdminWorkFormData,
  ApprovalStepState,
  ApprovalHistoryItem,
  AttachmentItem,
} from '../types/index';
import { canUserAccessCompany } from './companyAccess';
import { canCompleteWithOutstandingSteps } from './routeReplacement';

export function createNewRequestRecord(params: {
  id: string;
  formType: RequestRecord['formType'];
  formData: AdminWorkFormData;
  requester: UserProfile;
  workflowConfig: WorkflowConfig;
  users: UserProfile[];
  attachments?: AttachmentItem[];
  comment?: string;
  signatureDataUrl?: string;
}): RequestRecord {
  const { id, formType, formData, requester, workflowConfig, users, attachments = [], comment, signatureDataUrl } = params;
  if (!workflowConfig) throw new Error('No workflow is configured for this company and form.');
  if (!['PEW', 'ICCL', 'FSG'].includes(formData.companyId) || workflowConfig.companyId !== formData.companyId) {
    throw new Error('The request company does not match the workflow company.');
  }
  if (!canUserAccessCompany(requester, formData.companyId)) throw new Error('You do not have access to this company.');
  if (workflowConfig.formType !== formType) throw new Error('The workflow does not match the requested form.');
  if (!workflowConfig.stages?.length) throw new Error('The workflow must have at least one approval stage.');
  if (workflowConfig.stages.some((stage, index) => stage.isFinalApproval !== (index === workflowConfig.stages.length - 1))) {
    throw new Error('The workflow must designate only its last stage as final approver.');
  }
  const now = new Date().toISOString();

  // Build approval steps from workflowConfig stages
  const approvalSteps: ApprovalStepState[] = workflowConfig.stages.map((stage, index) => {
    // Resolve user by explicit assignedUserId or role
    const candidates = users.filter((u) => stage.assignedRole && u.role === stage.assignedRole && canUserAccessCompany(u, workflowConfig.companyId));
    if (!stage.assignedUserId && candidates.length > 1) {
      throw new Error(`Ambiguous approver for stage ${stage.name}; assign a specific user.`);
    }
    const assignedUser = stage.assignedUserId
      ? users.find((u) => u.id === stage.assignedUserId)
      : candidates[0];

    if (!assignedUser || !canUserAccessCompany(assignedUser, workflowConfig.companyId)) {
      throw new Error(`No eligible approver is configured for stage ${stage.name}.`);
    }
    if (assignedUser.id === requester.id) {
      throw new Error('The requester signs on submission and cannot also be an approver (self-approval).');
    }

    return {
      stageId: stage.id,
      stageNumber: stage.stageNumber,
      stageName: stage.name,
      assignedUserId: assignedUser?.id || stage.assignedUserId || '',
      assignedUserName: assignedUser?.name || stage.name,
      assignedRole: stage.assignedRole || assignedUser?.role || 'Approver',
      status: index === 0 ? 'Pending' : 'Waiting',
    };
  });

  const firstStep = approvalSteps[0];
  const finalStep = approvalSteps[approvalSteps.length - 1];

  const enrichedFormData: AdminWorkFormData = {
    ...formData,
    requesterSignatureName: requester.name,
    requesterSignatureDate: now,
    requesterSignatureDataUrl: signatureDataUrl || requester.signatureDataUrl,
  };

  const initialHistory: ApprovalHistoryItem = {
    id: `hist-${Date.now()}-1`,
    stepNumber: 0,
    actionByUserId: requester.id,
    actionByName: requester.name,
    actionByRole: requester.role,
    action: 'Submitted',
    dateTime: now,
    comments: comment || 'Request submitted.',
    version: 1,
  };

  return {
    id,
    formType,
    companyId: formData.companyId,
    title: formData.workDescription.slice(0, 50) || `${formType} - ${requester.name}`,
    requesterId: requester.id,
    requesterName: requester.name,
    requesterRole: requester.role,
    department: formData.department || requester.department,
    createdAt: now,
    updatedAt: now,
    status: 'Pending Approval',
    currentStageIndex: 0,
    currentApproverId: firstStep?.assignedUserId,
    currentApproverName: firstStep?.assignedUserName,
    firstApproverName: firstStep?.assignedUserName,
    finalApproverName: finalStep?.assignedUserName,
    workflowVersion: workflowConfig.version,
    documentVersion: 1,
    workflowConfig: structuredClone(workflowConfig),
    approvalSteps,
    approvalHistory: [initialHistory],
    attachments,
    formData: enrichedFormData,
    versionSnapshots: [
      {
        version: 1,
        updatedAt: now,
        updatedBy: requester.name,
        formData: enrichedFormData,
        changeNote: 'Initial Submission',
      },
    ],
  };
}

export function approveRequestStage(params: {
  request: RequestRecord;
  actingUser: UserProfile;
  comment?: string;
  signatureDataUrl?: string;
}): { success: boolean; error?: string; updatedRequest?: RequestRecord } {
  const { request, actingUser, comment, signatureDataUrl } = params;

  // 1. Allowed workflow state
  if (request.status !== 'Pending Approval') {
    return { success: false, error: `Request cannot be approved in '${request.status}' state.` };
  }

  const finalIndex = request.approvalSteps.length - 1;
  const signingIndex = request.approvalSteps[finalIndex]?.assignedUserId === actingUser.id ? finalIndex : request.currentStageIndex;
  const currentStep = request.approvalSteps[signingIndex];
  if (!currentStep) {
    return { success: false, error: 'No active approval stage found.' };
  }
  if (currentStep.status === 'Approved' || currentStep.status === 'Bypassed') return { success: false, error: 'This stage has already been signed or bypassed.' };

  // 2. Authorization check: must be assigned approver
  const isAssigned = currentStep.assignedUserId === actingUser.id;
  if (!isAssigned) {
    return {
      success: false,
      error: `Unauthorized: This stage is assigned to ${currentStep.assignedUserName}.`,
    };
  }

  // 3. Valid company context
  if (!canUserAccessCompany(actingUser, request.companyId)) {
    return { success: false, error: 'Unauthorized: User does not have access to this company entity.' };
  }

  // 4. Prevent self approval check
  if ((request.workflowConfig?.preventSelfApproval || actingUser.role === 'Director') && request.requesterId === actingUser.id) {
    return {
      success: false,
      error: 'Self-approval is prohibited by organization policy.',
    };
  }

  // 5. Require confirmed signer identity
  const effectiveSignerName = actingUser.name?.trim();
  if (!effectiveSignerName) {
    return { success: false, error: 'Signer identity is required for approval.' };
  }

  const now = new Date().toISOString();
  const nextStageIndex = request.approvalSteps.findIndex((step, index) => index !== signingIndex && step.status !== 'Approved' && step.status !== 'Bypassed');
  const isFinalStage = nextStageIndex === -1;

  // Clone steps and update current
  const updatedSteps = request.approvalSteps.map((step, idx) => {
    if (idx === signingIndex) {
      return {
        ...step,
        status: 'Approved' as const,
        actionDate: now,
        comments: comment?.trim() || undefined,
        signatureDataUrl: signatureDataUrl || actingUser.signatureDataUrl,
      };
    }
    if (idx === nextStageIndex && !isFinalStage) {
      return {
        ...step,
        status: 'Pending' as const,
      };
    }
    return step;
  });

  const newHistoryItem: ApprovalHistoryItem = {
    id: `hist-${Date.now()}-${request.approvalHistory.length + 1}`,
    stepNumber: signingIndex + 1,
    actionByUserId: actingUser.id,
    actionByName: actingUser.name,
    actionByRole: actingUser.role,
    action: 'Approved',
    dateTime: now,
    comments: comment?.trim() || 'Checked and approved.',
    version: request.documentVersion,
  };

  const updatedFormData: AdminWorkFormData = { ...request.formData };
  // Check if this stage maps to document signature or is final stage
  const currentStageConfig = request.workflowConfig?.stages?.[signingIndex];
  if (signingIndex === finalIndex || currentStageConfig?.mapsToDocumentSignature) {
    updatedFormData.approvalAuthoritySignatureName = actingUser.name;
    updatedFormData.approvalAuthoritySignatureDate = now;
    updatedFormData.approvalAuthoritySignatureDataUrl =
      signatureDataUrl || actingUser.signatureDataUrl;
  } else if (request.formType === 'Administrative & Payment Request' && (request.workflowConfig.signerSelection === 'company-directory' ? currentStageConfig?.documentSlot === 'department-head' : signingIndex === 0 && finalIndex === 1) && updatedFormData.administrativePayment) {
    const dataUrl = signatureDataUrl || actingUser.signatureDataUrl;
    if (dataUrl) updatedFormData.administrativePayment = {
      ...updatedFormData.administrativePayment,
      departmentHeadSignature: { name: actingUser.name, dataUrl },
    };
  } else if (request.formType === 'Expense Claim' && (request.workflowConfig.signerSelection === 'company-directory' ? currentStageConfig?.documentSlot === 'department-head' : signingIndex === 0 && finalIndex === 1) && updatedFormData.expenseClaim) {
    const dataUrl = signatureDataUrl || actingUser.signatureDataUrl;
    if (dataUrl) updatedFormData.expenseClaim = {
      ...updatedFormData.expenseClaim,
      departmentHeadSignature: { name: actingUser.name, dataUrl },
    };
  }

  const nextApprover = !isFinalStage ? updatedSteps[nextStageIndex] : undefined;

  const updatedRequest: RequestRecord = {
    ...request,
    updatedAt: now,
    status: isFinalStage ? 'Approved' : 'Pending Approval',
    currentStageIndex: isFinalStage ? request.currentStageIndex : nextStageIndex,
    currentApproverId: nextApprover?.assignedUserId,
    currentApproverName: nextApprover?.assignedUserName,
    approvalSteps: updatedSteps,
    approvalHistory: [...request.approvalHistory, newHistoryItem],
    formData: updatedFormData,
  };

  return { success: true, updatedRequest };
}

export function returnRequestForCorrection(params: {
  request: RequestRecord;
  actingUser: UserProfile;
  reason: string;
}): { success: boolean; error?: string; updatedRequest?: RequestRecord } {
  const { request, actingUser, reason } = params;

  if (!reason || !reason.trim()) {
    return { success: false, error: 'A clear reason is required to return for correction.' };
  }

  if (request.status !== 'Pending Approval') {
    return { success: false, error: `Cannot return request in '${request.status}' state.` };
  }

  const currentStep = request.approvalSteps[request.currentStageIndex];
  const isFinalApprover = request.approvalSteps.at(-1)?.assignedUserId === actingUser.id;
  if (currentStep?.assignedUserId !== actingUser.id && !isFinalApprover) {
    return { success: false, error: 'Only the current or final approver can return for correction.' };
  }
  if (!isFinalApprover && request.workflowConfig.stages[request.currentStageIndex]?.canReturnForCorrection === false) {
    return { success: false, error: 'Return for correction is disabled for this stage.' };
  }

  if (!canUserAccessCompany(actingUser, request.companyId)) {
    return { success: false, error: 'Unauthorized: User does not have access to this company entity.' };
  }

  const now = new Date().toISOString();

  const newHistoryItem: ApprovalHistoryItem = {
    id: `hist-${Date.now()}-${request.approvalHistory.length + 1}`,
    stepNumber: request.currentStageIndex + 1,
    actionByUserId: actingUser.id,
    actionByName: actingUser.name,
    actionByRole: actingUser.role,
    action: 'Returned for Correction',
    dateTime: now,
    comments: reason.trim(),
    version: request.documentVersion,
  };

  const updatedRequest: RequestRecord = {
    ...request,
    updatedAt: now,
    status: 'Returned for Correction',
    approvalHistory: [...request.approvalHistory, newHistoryItem],
  };

  return { success: true, updatedRequest };
}

export function resubmitCorrectedRequest(params: {
  request: RequestRecord;
  actingUser: UserProfile;
  updatedFormData: AdminWorkFormData;
  attachments?: AttachmentItem[];
  changeNote?: string;
  signatureDataUrl?: string;
}): { success: boolean; error?: string; updatedRequest?: RequestRecord } {
  const { request, actingUser, updatedFormData, changeNote, signatureDataUrl, attachments } = params;

  if (request.status !== 'Returned for Correction') {
    return { success: false, error: 'Only returned requests can be resubmitted.' };
  }

  if (request.requesterId !== actingUser.id) {
    return { success: false, error: 'Only the original requester can resubmit this request.' };
  }
  if (updatedFormData.companyId !== request.companyId || updatedFormData.requesterId !== request.requesterId) {
    return { success: false, error: 'The requester and company cannot be changed during correction.' };
  }

  const now = new Date().toISOString();
  const nextVersion = request.documentVersion + 1;

  // Reset steps based on workflow policy: restart workflow from stage 0
  const resetSteps: ApprovalStepState[] = request.approvalSteps.map((step, idx) => ({
    ...step,
    status: idx === 0 ? 'Pending' : 'Waiting',
    actionDate: undefined,
    comments: undefined,
    signatureDataUrl: undefined,
  }));

  const enrichedFormData: AdminWorkFormData = {
    ...updatedFormData,
    ...(updatedFormData.administrativePayment && {
      administrativePayment: { ...updatedFormData.administrativePayment, departmentHeadSignature: undefined },
    }),
    ...(updatedFormData.expenseClaim && {
      expenseClaim: { ...updatedFormData.expenseClaim, departmentHeadSignature: undefined },
    }),
    requesterSignatureName: actingUser.name,
    requesterSignatureDate: now,
    requesterSignatureDataUrl: signatureDataUrl || actingUser.signatureDataUrl,
    approvalAuthoritySignatureName: undefined,
    approvalAuthoritySignatureDate: undefined,
    approvalAuthoritySignatureDataUrl: undefined,
  };

  const revisionNote = changeNote?.trim();
  const newHistoryItem: ApprovalHistoryItem = {
    id: `hist-${Date.now()}-${request.approvalHistory.length + 1}`,
    stepNumber: 0,
    actionByUserId: actingUser.id,
    actionByName: actingUser.name,
    actionByRole: actingUser.role,
    action: 'Submitted',
    dateTime: now,
    comments: revisionNote ? `Resubmitted: ${revisionNote}` : `Resubmitted Version ${nextVersion}`,
    version: nextVersion,
  };

  const firstStep = resetSteps[0];

  const updatedRequest: RequestRecord = {
    ...request,
    documentVersion: nextVersion,
    updatedAt: now,
    status: 'Pending Approval',
    currentStageIndex: 0,
    currentApproverId: firstStep?.assignedUserId,
    currentApproverName: firstStep?.assignedUserName,
    approvalSteps: resetSteps,
    approvalHistory: [...request.approvalHistory, newHistoryItem],
    formData: enrichedFormData,
    attachments: attachments ?? request.attachments,
    versionSnapshots: [
      ...request.versionSnapshots,
      {
        version: nextVersion,
        updatedAt: now,
        updatedBy: actingUser.name,
        formData: enrichedFormData,
        changeNote: revisionNote || `Version ${nextVersion} corrections`,
      },
    ],
  };

  return { success: true, updatedRequest };
}

export function rejectRequest(params: {
  request: RequestRecord;
  actingUser: UserProfile;
  reason: string;
}): { success: boolean; error?: string; updatedRequest?: RequestRecord } {
  const { request, actingUser, reason } = params;

  if (!reason || !reason.trim()) {
    return { success: false, error: 'A clear reason is required to reject a request.' };
  }

  if (request.status !== 'Pending Approval') {
    return { success: false, error: `Cannot reject request in '${request.status}' state.` };
  }

  const currentStep = request.approvalSteps[request.currentStageIndex];
  const isFinalApprover = request.approvalSteps.at(-1)?.assignedUserId === actingUser.id;
  if (currentStep?.assignedUserId !== actingUser.id && !isFinalApprover) {
    return { success: false, error: 'Only the current or final approver can reject.' };
  }
  if (!isFinalApprover && currentStep?.assignedUserId === actingUser.id && request.workflowConfig.stages[request.currentStageIndex]?.canReject === false) {
    return { success: false, error: 'Rejection is disabled for this stage.' };
  }

  if (!canUserAccessCompany(actingUser, request.companyId)) {
    return { success: false, error: 'Unauthorized: User does not have access to this company entity.' };
  }

  const now = new Date().toISOString();

  const rejectingIndex = isFinalApprover ? request.approvalSteps.length - 1 : request.currentStageIndex;
  const updatedSteps = request.approvalSteps.map((step, idx) => {
    if (idx === rejectingIndex) {
      return {
        ...step,
        status: 'Rejected' as const,
        actionDate: now,
        comments: reason.trim(),
      };
    }
    return step;
  });

  const newHistoryItem: ApprovalHistoryItem = {
    id: `hist-${Date.now()}-${request.approvalHistory.length + 1}`,
    stepNumber: rejectingIndex + 1,
    actionByUserId: actingUser.id,
    actionByName: actingUser.name,
    actionByRole: actingUser.role,
    action: 'Rejected',
    dateTime: now,
    comments: reason.trim(),
    version: request.documentVersion,
  };

  const updatedRequest: RequestRecord = {
    ...request,
    updatedAt: now,
    status: 'Rejected',
    currentApproverId: undefined,
    currentApproverName: undefined,
    approvalSteps: updatedSteps,
    approvalHistory: [...request.approvalHistory, newHistoryItem],
  };

  return { success: true, updatedRequest };
}

/** Explicit final-user authority; legacy Director Override history remains unchanged. */
export function cancelPreciRoute(params: { request: RequestRecord; actingUser: UserProfile; reason: string }) {
  const { request, actingUser, reason } = params;
  if (request.requesterId !== actingUser.id || !canUserAccessCompany(actingUser, request.companyId) || !['Pending Approval','Returned for Correction'].includes(request.status) || !reason?.trim()) return { success: false, error: 'Only the requester can cancel an unfinished route, with a reason.' };
  const now = new Date().toISOString();
  const updatedRequest: RequestRecord = { ...request, status: 'Cancelled', updatedAt: now, currentApproverId: undefined, currentApproverName: undefined, approvalHistory: [...request.approvalHistory, { id: crypto.randomUUID(), stepNumber: 0, actionByUserId: actingUser.id, actionByName: actingUser.name, actionByRole: actingUser.role, action: 'Cancelled', dateTime: now, comments: reason.trim(), version: request.documentVersion }] };
  return { success: true, updatedRequest };
}

export function completePreciRoute(params: { request: RequestRecord; actingUser: UserProfile; reason: string; signatureDataUrl?: string }) {
  const { request, actingUser, reason, signatureDataUrl } = params;
  if (request.status !== 'Pending Approval' || request.requesterId === actingUser.id || !canUserAccessCompany(actingUser, request.companyId) || request.approvalSteps.at(-1)?.assignedUserId !== actingUser.id) {
    return { success: false, error: 'Only the assigned final approver can complete an open PreciRoute.' };
  }
  if (!reason?.trim()) return { success: false, error: 'A completion reason is required.' };
  if (request.approvalSteps.slice(0, -1).some(step => step.status !== 'Approved'
    && request.workflowConfig.stages.find(stage => stage.id === step.stageId)?.mustSign)) {
    return { success: false, error: 'A required signature is still outstanding.' };
  }
  if (request.approvalSteps.slice(0, -1).some(step => step.status !== 'Approved' && step.status !== 'Bypassed')
    && !canCompleteWithOutstandingSteps(request, actingUser.id)) {
    return { success: false, error: 'This signer can sign but cannot complete the route with outstanding signatures.' };
  }
  const final = request.approvalSteps.at(-1)!;
  const signed = final.status === 'Approved' ? { success: true, updatedRequest: request } : approveRequestStage({ request, actingUser, signatureDataUrl });
  if (!signed.success || !signed.updatedRequest) return signed;
  if (!signed.updatedRequest.approvalSteps.at(-1)?.signatureDataUrl) return { success: false, error: 'The final approver must sign before completing.' };
  const now = new Date().toISOString();
  const bypassed = request.approvalSteps.slice(0, -1).filter(step => step.status !== 'Approved' && step.status !== 'Bypassed');
  const updatedRequest: RequestRecord = { ...signed.updatedRequest, status: 'Approved', updatedAt: now, currentApproverId: undefined, currentApproverName: undefined,
    approvalSteps: signed.updatedRequest.approvalSteps.map(step => step.status === 'Approved' || step.status === 'Bypassed' ? step : { ...step, status: 'Bypassed', actionDate: now, comments: `Bypassed by final approver: ${reason.trim()}`, signatureDataUrl: undefined }),
    approvalHistory: [...signed.updatedRequest.approvalHistory, { id: crypto.randomUUID(), stepNumber: request.approvalSteps.length, actionByUserId: actingUser.id, actionByName: actingUser.name, actionByRole: actingUser.role, action: 'Route Completed', dateTime: now, version: request.documentVersion, comments: `${reason.trim()}. Bypassed: ${bypassed.map(step => step.assignedUserName).join(', ') || 'None'}` }] };
  return { success: true, updatedRequest };
}

export function directorOverrideApprove(params: {
  request: RequestRecord;
  directorUser: UserProfile;
  reason: string;
}): { success: boolean; error?: string; updatedRequest?: RequestRecord } {
  const { request, directorUser, reason } = params;
  if (request.requesterId === directorUser.id) {
    return { success: false, error: 'Directors cannot override their own requests.' };
  }

  // 1. Director Override must fail when allowDirectorOverride is false
  if (!request.workflowConfig?.allowDirectorOverride) {
    return { success: false, error: 'Director Override is disabled by workflow policy.' };
  }

  // 2. Director Override must fail when the request is already Approved, Rejected, or Returned
  if (request.status !== 'Pending Approval') {
    return {
      success: false,
      error: `Director Override cannot be executed on a request in '${request.status}' state.`,
    };
  }

  // 3. Require the correct actor (role must be Director)
  if (directorUser.role !== 'Director') {
    return { success: false, error: 'Only an authorized Director can execute an override.' };
  }

  // 4. Require non-empty reason
  if (!reason || !reason.trim()) {
    return { success: false, error: 'A mandatory justification reason is required for Director Override.' };
  }

  // 5. Require valid company context
  if (!canUserAccessCompany(directorUser, request.companyId)) {
    return { success: false, error: 'Unauthorized: Director does not have access to this company entity.' };
  }

  // 6. Explicitly confirmed signer identity
  if (!directorUser.name?.trim()) {
    return { success: false, error: 'Signer identity is required for Director Override.' };
  }

  const now = new Date().toISOString();

  const updatedSteps = request.approvalSteps.map((step, idx) => {
    if (idx < request.currentStageIndex) {
      return step;
    }
    if (step.assignedRole === 'Director' || idx === request.approvalSteps.length - 1) {
      return {
        ...step,
        status: 'Approved' as const,
        actionDate: now,
        comments: `Approved via Director Override: ${reason.trim()}`,
        signatureDataUrl: directorUser.signatureDataUrl,
      };
    }
    return {
      ...step,
      status: 'Bypassed' as const,
      actionDate: now,
      comments: `Bypassed by Director Override`,
    };
  });

  const newHistoryItem: ApprovalHistoryItem = {
    id: `hist-${Date.now()}-${request.approvalHistory.length + 1}`,
    stepNumber: request.currentStageIndex + 1,
    actionByUserId: directorUser.id,
    actionByName: directorUser.name,
    actionByRole: directorUser.role,
    action: 'Director Override',
    dateTime: now,
    comments: `Director Override: ${reason.trim()}`,
    version: request.documentVersion,
  };

  const updatedFormData: AdminWorkFormData = {
    ...request.formData,
    approvalAuthoritySignatureName: directorUser.name,
    approvalAuthoritySignatureDate: now,
    approvalAuthoritySignatureDataUrl: directorUser.signatureDataUrl,
  };

  const updatedRequest: RequestRecord = {
    ...request,
    updatedAt: now,
    status: 'Approved',
    currentApproverId: undefined,
    currentApproverName: undefined,
    approvalSteps: updatedSteps,
    approvalHistory: [...request.approvalHistory, newHistoryItem],
    formData: updatedFormData,
  };

  return { success: true, updatedRequest };
}
