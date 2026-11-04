import React from 'react';
import { RequestRecord } from '../../types/index';
import { buildApprovalJourney, JourneyMilestone } from '../../utils/approvalJourney';
import {
  Check,
  RotateCcw,
  XCircle,
  ShieldCheck,
  Clock,
  PenTool,
  ArrowDown,
  Sparkles,
} from 'lucide-react';

interface DocuSignProgressBannerProps {
  request: RequestRecord;
  currentUserId?: string;
  isAssignedApprover: boolean;
  onSignClick: () => void;
  onScrollToSignature?: () => void;
}

export const DocuSignProgressBanner: React.FC<DocuSignProgressBannerProps> = ({
  request,
  currentUserId,
  isAssignedApprover,
  onSignClick,
  onScrollToSignature,
}) => {
  const journey = buildApprovalJourney(request, currentUserId);
  const { milestones, stageCounts, responsibility } = journey;

  return (
    <div className="bg-white border border-[#E2E5E9] rounded-lg p-3.5 shadow-xs space-y-3">
      {/* Top Bar: Responsibility Headline & Stage Progress Percentage */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar / Indicator of Responsible Party */}
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
              responsibility.variant === 'action_needed'
                ? 'bg-[#365C78] ring-2 ring-[#365C78]/30 ring-offset-1'
                : responsibility.variant === 'returned'
                ? 'bg-amber-500 ring-2 ring-amber-200'
                : responsibility.variant === 'rejected'
                ? 'bg-rose-600'
                : responsibility.variant === 'completed'
                ? 'bg-emerald-600'
                : 'bg-slate-600'
            }`}
          >
            {responsibility.responsiblePersonInitials || 'PS'}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-[#192B3C] truncate">
                {responsibility.headline}
              </h2>
              {responsibility.variant === 'action_needed' && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                  Pending Your Signature
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              {stageCounts.summaryText} · {request.formType} (v{request.documentVersion}.0)
            </p>
          </div>
        </div>

        {/* Action Button: One-click Guided Sign Tag if User is Approver */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 w-full sm:w-auto">
          {/* Completion Badge - visible across mobile and desktop */}
          <div className="flex items-center gap-1 px-2.5 py-1 bg-[#F5F6F8] border border-[#CBD5E1] rounded-md font-mono text-[11px] sm:text-xs font-bold text-[#365C78]">
            <span>{stageCounts.percentage}% Complete</span>
          </div>

          {isAssignedApprover && (
            <button
              onClick={onSignClick}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#365C78] hover:bg-[#2A4A62] text-white rounded-md text-xs font-bold shadow-xs transition-transform active:scale-95 animate-pulse shrink-0"
              title="Click to sign"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Sign Document Here</span>
            </button>
          )}
        </div>
      </div>

      {/* DocuSign-Style Stepper Chain */}
      <div className="pt-2 border-t border-[#E2E5E9]/70 overflow-x-auto pb-1.5 touch-pan-x">
        <div className="flex items-center min-w-[500px] justify-between gap-1">
          {milestones.map((m, idx) => {
            const isLast = idx === milestones.length - 1;

            return (
              <React.Fragment key={m.id}>
                <div
                  className={`flex items-center gap-2 p-1.5 rounded-md transition-colors ${
                    m.isCurrentActionRequired
                      ? 'bg-[#EBF2F7] border border-[#C2D5E3]'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Avatar Node */}
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0 ${
                      m.status === 'completed' || m.status === 'submitted'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : m.status === 'returned'
                        ? 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-200'
                        : m.status === 'rejected'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : m.status === 'bypassed'
                        ? 'bg-slate-300 text-slate-700 border-slate-400'
                        : m.isCurrentActionRequired
                        ? 'bg-[#365C78] text-white border-[#192B3C] ring-2 ring-[#365C78]/30'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    {m.status === 'completed' || m.status === 'submitted' ? (
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    ) : m.status === 'returned' ? (
                      <RotateCcw className="w-3 h-3" />
                    ) : m.status === 'rejected' ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : (
                      <span>{idx === 0 ? 'R' : idx}</span>
                    )}
                  </div>

                  {/* Participant Name & Status */}
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-[#192B3C] truncate leading-tight">
                      {m.participantName}
                    </div>
                    <div
                      className={`text-[10px] truncate leading-tight ${
                        m.status === 'completed' || m.status === 'submitted'
                          ? 'text-emerald-700 font-semibold'
                          : m.status === 'returned'
                          ? 'text-amber-800 font-semibold'
                          : m.status === 'rejected'
                          ? 'text-rose-700 font-semibold'
                          : m.isCurrentActionRequired
                          ? 'text-[#365C78] font-bold'
                          : 'text-slate-400'
                      }`}
                    >
                      {m.statusLabel}
                    </div>
                  </div>
                </div>

                {/* Connecting Line Between Steps */}
                {!isLast && (
                  <div
                    className={`flex-1 h-[2px] mx-1 transition-colors ${
                      m.status === 'completed' || m.status === 'submitted'
                        ? 'bg-emerald-500'
                        : m.status === 'returned'
                        ? 'bg-amber-400'
                        : 'bg-slate-200'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
