import type { RequestRecord } from '../../types';
import { buildApprovalJourney, type JourneyMilestone } from '../../utils/approvalJourney';
import { canCompleteWithOutstandingSteps } from '../../utils/routeReplacement';

export function outstandingSigners(request: RequestRecord) {
  return request.approvalSteps.slice(0, -1).filter(step => step.status !== 'Approved' && step.status !== 'Bypassed');
}

export function canOfferEarlyCompletion(request: RequestRecord, userId: string) {
  const outstanding = outstandingSigners(request);
  return request.status === 'Pending Approval' && request.requesterId !== userId
    && outstanding.length > 0 && canCompleteWithOutstandingSteps(request, userId)
    && !outstanding.some(step => request.workflowConfig.stages.find(stage => stage.id === step.stageId)?.mustSign);
}

export function signingProgress(request: RequestRecord, userId?: string) {
  const journey = buildApprovalJourney(request, userId);
  const final = request.approvalSteps.at(-1);
  const current = journey.milestones.find(step => step.isCurrentActionRequired);
  const signed = request.approvalSteps.filter(step => step.status === 'Approved').length;
  const skipped = request.approvalSteps.filter(step => step.status === 'Bypassed').length;
  const progress = `${signed} of ${request.approvalSteps.length} approvers signed${skipped ? ` · ${skipped} bypassed` : ''}`;
  let headline = journey.responsibility.headline;
  let detail = '';

  if (request.status === 'Approved') headline = 'Signing complete';
  if (request.status === 'Returned for Correction' && request.requesterId === userId) headline = 'Please update and resend this request';
  if (request.status === 'Pending Approval') {
    const name = current?.participantName ?? request.currentApproverName;
    const waiting = name ? `Waiting for ${name}` : 'Waiting for a signer';
    headline = current?.isAssignedToCurrentUser ? 'Your signature is next' : waiting;
    if (userId && request.pendingReplacement?.newUserId === userId) {
      headline = 'Respond to the final approver assignment';
      detail = `${waiting}. The current assignment stays in place until you accept.`;
    } else if (userId && final?.assignedUserId === userId) {
      if (final.status === 'Approved') {
        headline = 'You’ve signed';
        detail = `${waiting}.`;
      } else if (!current?.isAssignedToCurrentUser) {
        headline = 'You can sign now as final approver';
        detail = name ? `${name} is next in the signing order.` : `${waiting}.`;
      }
    }
  }
  return { ...journey, headline, detail, progress };
}

export function signingStepLabel(step: JourneyMilestone) {
  switch (step.status) {
    case 'submitted': return 'Signed on submission';
    case 'completed': return 'Signed';
    case 'current': return step.isAssignedToCurrentUser ? 'Your turn' : 'Awaiting signature';
    case 'bypassed': return 'Bypassed';
    case 'returned': return 'Corrections requested';
    default: return step.statusLabel;
  }
}

export function SigningSteps({ steps, details = false }: { steps: JourneyMilestone[]; details?: boolean }) {
  return <ol className={details ? 'divide-y divide-workspace-line' : 'route-peek-signers'} aria-label="Signing steps">
    {steps.map(step => <li key={step.id} aria-current={step.isCurrentActionRequired ? 'step' : undefined}
      className={details ? 'py-2.5' : 'route-step-chip'}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span aria-hidden="true" className={`route-dot route-dot-${step.status}`} />
        <strong className="min-w-0 [overflow-wrap:anywhere]">{step.participantName}</strong>
        {details && <span className="text-workspace-muted">{step.type === 'requester' ? 'Requester' : step.isFinalApproval ? 'Final approver' : step.stageName}</span>}
        <span className={step.isCurrentActionRequired ? 'font-semibold text-workspace-teal' : 'text-workspace-muted'}>{signingStepLabel(step)}</span>
      </div>
      {details && (step.comments || step.signatureDate) && <details className="ml-4 mt-1 text-xs text-workspace-muted">
        <summary className="preci-link w-fit cursor-pointer py-1">{step.comments ? 'Note and time' : 'Time recorded'}</summary>
        {step.signatureDate && <time dateTime={step.signatureDate}>{new Date(step.signatureDate).toLocaleString('en-GB')}</time>}
        {step.comments && <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{step.comments}</p>}
      </details>}
    </li>)}
  </ol>;
}
