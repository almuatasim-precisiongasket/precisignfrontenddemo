import React from 'react';
import { RequestRecord } from '../../types/index';
import { buildApprovalJourney, JourneyMilestone } from '../../utils/approvalJourney';
import { Check, RotateCcw, XCircle, ArrowRight, CornerDownRight, ShieldCheck, ChevronRight } from 'lucide-react';

interface CompactApprovalChainProps {
  request: RequestRecord;
  currentUserId?: string;
  onOpenDetail?: (request: RequestRecord) => void;
  maxVisible?: number;
  showProgressText?: boolean;
}

export const CompactApprovalChain: React.FC<CompactApprovalChainProps> = ({
  request,
  currentUserId,
  onOpenDetail,
  maxVisible = 3,
  showProgressText = true,
}) => {
  const journey = buildApprovalJourney(request, currentUserId);
  const { milestones, stageCounts, responsibility } = journey;

  // Split milestones for compact overflow display
  const totalMilestones = milestones.length;
  const visibleMilestones = totalMilestones > maxVisible ? milestones.slice(0, maxVisible) : milestones;
  const overflowCount = totalMilestones - visibleMilestones.length;

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
        return <Check className="w-2.5 h-2.5 stroke-[2.5]" />;
      case 'returned':
        return <RotateCcw className="w-2.5 h-2.5 stroke-[2.5]" />;
      case 'rejected':
        return <XCircle className="w-2.5 h-2.5 stroke-[2.5]" />;
      case 'bypassed':
        return <ShieldCheck className="w-2.5 h-2.5 stroke-[2.5]" />;
      case 'current':
        return <span className="w-1.5 h-1.5 rounded-full bg-white" />;
      default:
        return <span className="text-[9px] font-semibold">{milestone.participantInitials}</span>;
    }
  };

  const getMilestoneStyle = (milestone: JourneyMilestone) => {
    switch (milestone.status) {
      case 'completed':
      case 'submitted':
        return 'bg-emerald-600 text-white border-emerald-600 shadow-2xs';
      case 'returned':
        return 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-200';
      case 'rejected':
        return 'bg-rose-600 text-white border-rose-600';
      case 'bypassed':
        return 'bg-slate-400 text-white border-slate-400';
      case 'current':
        return milestone.isAssignedToCurrentUser
          ? 'bg-[#365C78] text-white border-[#192B3C] ring-2 ring-[#365C78]/40 ring-offset-1 font-bold'
          : 'bg-[#365C78] text-white border-[#365C78] ring-2 ring-sky-200';
      case 'waiting':
      default:
        return 'bg-slate-100 text-slate-400 border-slate-200';
    }
  };

  const signed = request.approvalSteps.filter(step => step.status === 'Approved').length;
  const bypassed = request.approvalSteps.filter(step => step.status === 'Bypassed').length;
  const label = (m: JourneyMilestone) => m.status === 'submitted' ? 'Submitted' : m.status === 'completed' ? 'Signed' : m.status === 'bypassed' ? 'Bypassed' : m.status === 'current' ? 'Awaiting sign' : m.status === 'returned' ? 'Correction' : m.status === 'rejected' ? 'Rejected' : m.statusLabel === 'Closed' ? 'Closed' : 'Waiting';
  return <button type="button" onClick={handleClick}
    aria-label={`Approval Journey for ${request.id}: ${milestones.map(m => `${m.participantName}: ${m.statusLabel}`).join('; ')}. Open full journey.`}
    className="group w-full min-w-[250px] max-w-[340px] rounded-lg p-2 -mx-2 text-left transition-colors duration-150 hover:bg-teal-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365C78]">
    <span className="flex items-start">
      {visibleMilestones.map((m,i) => <React.Fragment key={m.id}>
        {i > 0 && <span aria-hidden="true" className="h-px flex-1 min-w-2 bg-slate-200 mt-3.5 mx-1"/>}
        <span title={`${m.participantName} · ${m.participantRole} · ${m.statusLabel}`} className="flex w-[78px] shrink-0 flex-col items-center">
          <span className={`w-7 h-7 rounded-full border flex items-center justify-center ${getMilestoneStyle(m)}`}>{getMilestoneIcon(m)}</span>
          <span className="mt-1.5 max-w-full truncate text-xs font-semibold text-slate-800">{m.participantName}</span>
          <span className="text-[10px] text-slate-500 whitespace-nowrap">{label(m)}</span>
        </span>
      </React.Fragment>)}
    </span>
    {showProgressText && <span className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500"><span>{signed}/{request.approvalSteps.length} approvals signed{bypassed ? ` · ${bypassed} bypassed` : ''}</span><span className="font-medium text-[#365C78]">{overflowCount ? `+${overflowCount} more · ` : ''}View journey →</span></span>}
  </button>;
};
