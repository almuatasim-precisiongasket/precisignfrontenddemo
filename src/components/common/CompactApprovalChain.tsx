import React from 'react';
import { RequestRecord } from '../../types/index';
import { buildApprovalJourney, JourneyMilestone } from '../../utils/approvalJourney';
import { Check, RotateCcw, XCircle, PenLine, ShieldCheck, ChevronRight } from 'lucide-react';

interface CompactApprovalChainProps {
  request: RequestRecord;
  currentUserId?: string;
  onOpenDetail?: (request: RequestRecord) => void;
  maxVisible?: number;
  compact?: boolean;
  showProgressText?: boolean;
}

export const CompactApprovalChain: React.FC<CompactApprovalChainProps> = ({
  request,
  currentUserId,
  onOpenDetail,
  maxVisible = 3,
  compact = false,
  showProgressText = true,
}) => {
  const journey = buildApprovalJourney(request, currentUserId);
  const { milestones, responsibility } = journey;

  const visibleMilestones = milestones.slice(0, maxVisible);
  const currentMilestone = milestones.find(milestone => milestone.status === 'current');
  if (currentMilestone && visibleMilestones.length > 0 && !visibleMilestones.includes(currentMilestone)) {
    visibleMilestones[visibleMilestones.length - 1] = currentMilestone;
  }
  const overflowCount = milestones.length - visibleMilestones.length;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenDetail) {
      onOpenDetail(request);
    }
  };

  const getMilestoneIcon = (milestone: JourneyMilestone) => {
    switch (milestone.status) {
      case 'completed':
      case 'submitted':
        return <Check className="size-3.5 stroke-2" />;
      case 'returned':
        return <RotateCcw className="size-3.5 stroke-2" />;
      case 'rejected':
        return <XCircle className="size-3.5 stroke-2" />;
      case 'bypassed':
        return <ShieldCheck className="size-3.5 stroke-2" />;
      case 'current':
        return <PenLine className="size-3.5 stroke-2" />;
      default:
        return <span className="text-[9px] font-semibold">{milestone.participantInitials}</span>;
    }
  };

  const getMilestoneStyle = (milestone: JourneyMilestone) => {
    switch (milestone.status) {
      case 'completed':
      case 'submitted':
        return compact ? 'border-emerald-700 bg-emerald-700 text-white' : 'bg-workspace-tint text-workspace-teal border-teal-200';
      case 'returned':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'bypassed':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'current':
        if (compact) return 'border-blue-700 bg-blue-700 text-white ring-2 ring-blue-200';
        return milestone.isAssignedToCurrentUser
          ? 'bg-workspace-teal text-white border-workspace-teal ring-2 ring-teal-200 ring-offset-1'
          : 'bg-workspace-steel text-white border-workspace-steel';
      case 'waiting':
      default:
        return 'bg-white text-slate-600 border-slate-300';
    }
  };

  const signed = request.approvalSteps.filter(step => step.status === 'Approved').length;
  const bypassed = request.approvalSteps.filter(step => step.status === 'Bypassed').length;
  const label = (m: JourneyMilestone) => m.status === 'submitted' ? 'Submitted' : m.status === 'completed' ? 'Signed' : m.status === 'bypassed' ? 'Bypassed' : m.status === 'current' ? (compact ? 'Awaiting' : 'Awaiting sign') : m.status === 'returned' ? 'Correction' : m.status === 'rejected' ? 'Rejected' : m.statusLabel === 'Closed' ? 'Closed' : 'Waiting';
  return <button type="button" onClick={handleClick}
    aria-label={`Approval Journey for ${request.id}: ${milestones.map(m => `${m.participantName}: ${m.statusLabel}`).join('; ')}. Open full journey.`}
    className={`workspace-control group w-full max-w-96 text-left ${compact ? "min-w-52 border-transparent bg-transparent px-0.5 py-1" : "min-w-60 p-2.5"}`}>
    <span className="flex items-start">
      {visibleMilestones.map((m, i) => {
        const next = visibleMilestones[i + 1];
        const hasGap = next && milestones.indexOf(next) - milestones.indexOf(m) > 1;
        const signedLink = !hasGap && (m.status === 'submitted' || m.status === 'completed');
        return <span key={m.id} aria-current={m.status === 'current' ? 'step' : undefined} title={`${m.participantName} · ${m.participantRole} · ${m.statusLabel}`} className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center">
          {next && <span aria-hidden="true" className={`absolute border-t ${compact ? "left-[calc(50%+10px)] top-2.5 w-[calc(100%-20px)]" : "left-[calc(50%+17px)] top-3.5 w-[calc(100%-34px)]"} ${compact && signedLink ? "border-emerald-500" : "border-slate-300"} ${hasGap ? 'border-dashed' : ''}`} />}
          <span aria-hidden="true" className={`flex items-center justify-center rounded-full border ${compact ? "size-5" : "size-7"} ${getMilestoneStyle(m)}`}>{getMilestoneIcon(m)}</span>
          <span className={`max-w-full font-semibold leading-tight text-workspace-ink [overflow-wrap:anywhere] ${compact ? "mt-1 text-[11px]" : "mt-1.5 text-xs"}`}>{m.participantName}</span>
          <span className={`mt-0.5 text-[11px] leading-tight ${m.status === 'current' ? 'font-semibold text-workspace-steel' : 'text-slate-600'}`}>{label(m)}</span>
        </span>;
      })}
    </span>
    {compact && overflowCount > 0 && <span className="mt-1 block text-center text-[11px] font-semibold text-workspace-steel">+{overflowCount} more · View journey</span>}
    {!compact && showProgressText && (
      <span className="mt-2 block border-t border-workspace-line pt-1.5 text-[11px] text-workspace-muted">
        {request.status === 'Pending Approval' && responsibility.responsiblePersonName && (
          <span className="mb-1 block font-semibold text-workspace-ink">{currentMilestone?.isAssignedToCurrentUser ? 'Your signature is next' : `Waiting for ${responsibility.responsiblePersonName}`}</span>
        )}
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span>{signed}/{request.approvalSteps.length} approvals signed{bypassed ? ` · ${bypassed} bypassed` : ''}</span>
          <span className="inline-flex items-center gap-1 font-semibold text-workspace-steel">{overflowCount ? `+${overflowCount} more · ` : ''}View journey <ChevronRight aria-hidden="true" className="size-3" /></span>
        </span>
      </span>
    )}
  </button>;
};
