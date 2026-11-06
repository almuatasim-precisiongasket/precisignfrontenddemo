import { RequestRecord, ApprovalStepState, ApprovalHistoryItem } from '../types/index';

export type MilestoneType = 'requester' | 'approval_stage';

export type MilestoneStatus =
  | 'submitted'
  | 'completed'
  | 'current'
  | 'waiting'
  | 'returned'
  | 'rejected'
  | 'bypassed';

export interface JourneyMilestone {
  id: string;
  type: MilestoneType;
  participantId: string;
  participantName: string;
  participantRole: string;
  participantDepartment?: string;
  participantInitials: string;
  avatarColor: string;
  stageIndex: number; // 0 for requester, 1..N for approval stages
  stageNumberLabel: string; // "Requester" or "Stage 1", "Stage 2"
  stageName: string; // "Initiation & Submission", "GM Approval", etc.
  status: MilestoneStatus;
  statusLabel: string; // e.g. "Submitted & Signed", "Approved & Signed", "Awaiting Approval"
  isCurrentActionRequired: boolean;
  isAssignedToCurrentUser: boolean;
  signatureStatus: 'signed' | 'pending_signature' | 'not_required';
  signatureDate?: string;
  comments?: string;
  documentVersion?: number;
  isFinalApproval?: boolean;
}

export interface ApprovalStageCounts {
  totalStages: number; // Pure managerial approval stages (excludes requester submission)
  completedStages: number;
  pendingStages: number;
  percentage: number;
  summaryText: string; // e.g. "1 of 2 approval stages completed"
}

export type ResponsibilityVariant =
  | 'action_needed'
  | 'waiting'
  | 'returned'
  | 'rejected'
  | 'completed'
  | 'draft';

export interface CurrentResponsibility {
  headline: string; // e.g. "Action required from you" or "Waiting for Shekar — General Manager"
  subtext: string;
  variant: ResponsibilityVariant;
  responsiblePersonName?: string;
  responsiblePersonRole?: string;
  responsiblePersonInitials?: string;
  responsiblePersonAvatarColor?: string;
  isCurrentUserResponsible: boolean;
}

export interface ApprovalJourneyViewModel {
  requestId: string;
  formType: string;
  documentVersion: number;
  workflowVersion: number;
  status: RequestRecord['status'];
  milestones: JourneyMilestone[];
  stageCounts: ApprovalStageCounts;
  responsibility: CurrentResponsibility;
  lifecycleEvents: ApprovalHistoryItem[];
}

/**
 * Derives user initials from a full name (e.g., "Afzal Kazi" -> "AK")
 */
export function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic avatar color based on name string
 */
export function getAvatarColor(name: string): string {
  const colors = [
    '#0284c7', // Sky
    '#10b981', // Emerald
    '#8b5cf6', // Violet
    '#f59e0b', // Amber
    '#6366f1', // Indigo
    '#ec4899', // Pink
    '#0d9488', // Teal
    '#365C78', // Steel Blue
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Builds the complete Approval Journey View Model from an existing RequestRecord.
 * Correctly distinguishes participant milestones from managerial approval stages.
 */
export function buildApprovalJourney(
  request: RequestRecord,
  currentUserId?: string
): ApprovalJourneyViewModel {
  const {
    id,
    formType,
    documentVersion,
    workflowVersion,
    status,
    requesterId,
    requesterName,
    requesterRole,
    department,
    createdAt,
    approvalSteps = [],
    approvalHistory = [],
    currentStageIndex = 0,
    currentApproverId,
    currentApproverName,
  } = request;

  // 1. Calculate Managerial Approval Stages (Excluding Requester submission)
  const totalStages = approvalSteps.length;
  const completedStages = approvalSteps.filter(
    (step) => step.status === 'Approved' || step.status === 'Bypassed'
  ).length;
  const pendingStages = Math.max(0, totalStages - completedStages);

  let percentage = 0;
  if (status === 'Approved') {
    percentage = 100;
  } else if (totalStages > 0) {
    percentage = Math.round((completedStages / totalStages) * 100);
  }

  const stageCounts: ApprovalStageCounts = {
    totalStages,
    completedStages,
    pendingStages,
    percentage,
    summaryText:
      status === 'Approved'
        ? `All ${totalStages} approval stages completed`
        : `${completedStages} of ${totalStages} approval stage${totalStages === 1 ? '' : 's'} completed`,
  };

  // 2. Identify Requester Milestone
  const isReturned = status === 'Returned for Correction';
  const isRejected = status === 'Rejected';
  const isApproved = status === 'Approved';

  // Last submission / resubmission history item
  const submissionHistory = [...approvalHistory]
    .reverse()
    .find((h) => h.action === 'Submitted');

  const requesterMilestone: JourneyMilestone = {
    id: `milestone-requester-${id}`,
    type: 'requester',
    participantId: requesterId,
    participantName: requesterName,
    participantRole: requesterRole || 'Requester',
    participantDepartment: department,
    participantInitials: getInitials(requesterName),
    avatarColor: getAvatarColor(requesterName),
    stageIndex: 0,
    stageNumberLabel: 'Requester',
    stageName: documentVersion > 1 ? `Resubmission (v${documentVersion})` : 'Initiation & Submission',
    status: isReturned ? 'returned' : 'submitted',
    statusLabel: isReturned
      ? 'Returned for Correction'
      : documentVersion > 1
      ? `Resubmitted (v${documentVersion})`
      : 'Submitted & Signed',
    isCurrentActionRequired: isReturned,
    isAssignedToCurrentUser: isReturned && currentUserId === requesterId,
    signatureStatus: 'signed',
    signatureDate: submissionHistory?.dateTime || createdAt,
    comments: submissionHistory?.comments,
    documentVersion,
  };

  // 3. Approval Stage Milestones (Execution Order)
  const stageMilestones: JourneyMilestone[] = approvalSteps.map((step, idx) => {
    const isStepApproved = step.status === 'Approved';
    const isStepRejected = step.status === 'Rejected';
    const isStepBypassed = step.status === 'Bypassed';
    const isStepPending = step.status === 'Pending';
    const isCurrentActiveStep =
      status === 'Pending Approval' && idx === currentStageIndex && isStepPending;

    let milestoneStatus: MilestoneStatus = 'waiting';
    let statusLabel = 'Upcoming';
    let signatureStatus: JourneyMilestone['signatureStatus'] = 'not_required';

    if (isStepApproved) {
      milestoneStatus = 'completed';
      statusLabel = 'Approved & Signed';
      signatureStatus = 'signed';
    } else if (isStepBypassed) {
      milestoneStatus = 'bypassed';
      statusLabel = step.comments?.includes('Director Override') ? 'Bypassed (Director Override)' : 'Bypassed by final approver';
      signatureStatus = 'not_required';
    } else if (isStepRejected) {
      milestoneStatus = 'rejected';
      statusLabel = 'Rejected';
      signatureStatus = 'not_required';
    } else if (status === 'Cancelled' || isRejected || isApproved) {
      statusLabel = 'Closed';
    } else if (isStepPending) {
      if (isReturned) {
        milestoneStatus = 'waiting';
        statusLabel = 'Paused (Awaiting Correction)';
      } else {
        milestoneStatus = 'current';
        statusLabel = 'Awaiting Approval';
        signatureStatus = 'pending_signature';
      }
    } else {
      milestoneStatus = 'waiting';
      statusLabel = 'Upcoming';
    }

    // Check history item for remarks
    const matchingHistory = [...approvalHistory]
      .reverse()
      .find(
        (h) =>
          h.version === documentVersion &&
          h.stepNumber === step.stageNumber &&
          (h.action === 'Approved' || h.action === 'Rejected' || h.action === 'Director Override')
      );

    const overrideActor = isStepApproved && step.comments?.startsWith('Approved via Director Override:')
      ? [...approvalHistory].reverse().find((h) => h.version === documentVersion && h.action === 'Director Override')
      : undefined;
    const participantName = overrideActor?.actionByName
      || (isStepApproved ? matchingHistory?.actionByName : undefined)
      || step.assignedUserName?.trim()
      || (isCurrentActiveStep ? currentApproverName?.trim() : undefined)
      || 'Signer name unavailable';

    const isAssignedToUser =
      Boolean(currentUserId) && step.assignedUserId === currentUserId;

    return {
      id: `milestone-stage-${step.stageId || idx}`,
      type: 'approval_stage',
      participantId: overrideActor?.actionByUserId || step.assignedUserId,
      participantName,
      participantRole: overrideActor?.actionByRole || step.assignedRole,
      participantInitials: getInitials(participantName),
      avatarColor: getAvatarColor(participantName),
      stageIndex: idx + 1,
      stageNumberLabel: `Stage ${step.stageNumber || idx + 1}`,
      stageName: step.stageName,
      status: milestoneStatus,
      statusLabel,
      isCurrentActionRequired: isCurrentActiveStep,
      isAssignedToCurrentUser: isCurrentActiveStep && isAssignedToUser,
      signatureStatus,
      signatureDate: step.actionDate || matchingHistory?.dateTime,
      comments: step.comments || matchingHistory?.comments,
      documentVersion: matchingHistory?.version || documentVersion,
      isFinalApproval: idx === approvalSteps.length - 1,
    };
  });

  const milestones: JourneyMilestone[] = [requesterMilestone, ...stageMilestones];

  // 4. Calculate Current Responsibility Banner & Summary
  let responsibility: CurrentResponsibility;

  if (status === 'Cancelled') {
    responsibility = { headline: 'PreciRoute cancelled', subtext: 'The requester closed this route. Collected signatures remain in history.', variant: 'rejected', isCurrentUserResponsible: false };
  } else if (isApproved) {
    responsibility = {
      headline: 'PreciRoute completed',
      subtext: `All ${totalStages} approval stages have been completed.`,
      variant: 'completed',
      isCurrentUserResponsible: false,
    };
  } else if (isRejected) {
    const rejectHistory = [...approvalHistory]
      .reverse()
      .find((h) => h.action === 'Rejected');
    const rejector = rejectHistory?.actionByName || 'Approval Authority';
    const rejectorRole = rejectHistory?.actionByRole || 'Management';

    responsibility = {
      headline: `Request rejected by ${rejector} — ${rejectorRole}`,
      subtext: rejectHistory?.comments
        ? `Reason: "${rejectHistory.comments}"`
        : 'The request was formally rejected and the workflow terminated.',
      variant: 'rejected',
      responsiblePersonName: rejector,
      responsiblePersonRole: rejectorRole,
      responsiblePersonInitials: getInitials(rejector),
      responsiblePersonAvatarColor: getAvatarColor(rejector),
      isCurrentUserResponsible: false,
    };
  } else if (isReturned) {
    const returnHistory = [...approvalHistory]
      .reverse()
      .find((h) => h.action === 'Returned for Correction');
    const returnedBy = returnHistory?.actionByName || 'Approver';
    const isUserTheRequester = currentUserId === requesterId;

    responsibility = {
      headline: isUserTheRequester
        ? 'Action required from you (Correction Requested)'
        : `Returned to ${requesterName} for correction`,
      subtext: returnHistory?.comments
        ? `Feedback from ${returnedBy}: "${returnHistory.comments}"`
        : `The document requires revision from ${requesterName} before workflow can resume.`,
      variant: 'returned',
      responsiblePersonName: requesterName,
      responsiblePersonRole: requesterRole,
      responsiblePersonInitials: getInitials(requesterName),
      responsiblePersonAvatarColor: getAvatarColor(requesterName),
      isCurrentUserResponsible: isUserTheRequester,
    };
  } else {
    // Pending Approval State
    const activeStep = approvalSteps[currentStageIndex];
    const approverName = activeStep?.assignedUserName || currentApproverName || 'Assigned Approver';
    const approverRole = activeStep?.assignedRole || 'Management';
    const approverId = activeStep?.assignedUserId || currentApproverId;
    const isUserTheApprover = Boolean(currentUserId) && currentUserId === approverId;

    responsibility = {
      headline: isUserTheApprover
        ? 'Action required from you'
        : `Waiting for ${approverName} — ${approverRole}`,
      subtext: isUserTheApprover
        ? `You are assigned to Stage ${currentStageIndex + 1} (${activeStep?.stageName || 'Approval'}). Please review the A4 document and sign.`
        : `Awaiting review and signature for Stage ${currentStageIndex + 1} of ${totalStages} (${activeStep?.stageName || 'Approval'}).`,
      variant: isUserTheApprover ? 'action_needed' : 'waiting',
      responsiblePersonName: approverName,
      responsiblePersonRole: approverRole,
      responsiblePersonInitials: getInitials(approverName),
      responsiblePersonAvatarColor: getAvatarColor(approverName),
      isCurrentUserResponsible: isUserTheApprover,
    };
  }

  return {
    requestId: id,
    formType,
    documentVersion,
    workflowVersion,
    status,
    milestones,
    stageCounts,
    responsibility,
    lifecycleEvents: approvalHistory,
  };
}
