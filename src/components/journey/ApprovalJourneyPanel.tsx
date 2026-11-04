import React, { useState } from 'react';
import { RequestRecord } from '../../types/index';
import { buildApprovalJourney, JourneyMilestone } from '../../utils/approvalJourney';
import {
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
  ShieldCheck,
  Check,
  AlertCircle,
  FileCheck,
  ExternalLink,
  Info,
  Calendar,
  MessageSquare,
  User,
  History,
  Layers,
} from 'lucide-react';

interface ApprovalJourneyPanelProps {
  request: RequestRecord;
  currentUserId?: string;
  onOpenDocument?: (requestId: string) => void;
  showDocumentButton?: boolean;
  compact?: boolean;
}

export const ApprovalJourneyPanel: React.FC<ApprovalJourneyPanelProps> = ({
  request,
  currentUserId,
  onOpenDocument,
  showDocumentButton = false,
  compact = false,
}) => {
  const [activeTab, setActiveTab] = useState<'journey' | 'history'>('journey');
  const journey = buildApprovalJourney(request, currentUserId);
  const { milestones, stageCounts, responsibility, lifecycleEvents } = journey;

  const getStatusBadge = (milestone: JourneyMilestone) => {
    switch (milestone.status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Check className="w-3 h-3 text-emerald-600" />
            <span>Approved &amp; Signed</span>
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
            <Check className="w-3 h-3 text-slate-600" />
            <span>{milestone.statusLabel}</span>
          </span>
        );
      case 'returned':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
            <RotateCcw className="w-3 h-3 text-amber-600" />
            <span>Returned for Correction</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>Rejected</span>
          </span>
        );
      case 'bypassed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            <ShieldCheck className="w-3 h-3 text-slate-500" />
            <span>Director Override</span>
          </span>
        );
      case 'current':
        return (
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              milestone.isAssignedToCurrentUser
                ? 'bg-[#365C78] text-white border-[#192B3C] shadow-2xs'
                : 'bg-sky-50 text-sky-800 border-sky-200'
            }`}
          >
            <Clock className={`w-3 h-3 ${milestone.isAssignedToCurrentUser ? 'text-sky-200' : 'text-sky-600'}`} />
            <span>{milestone.isAssignedToCurrentUser ? 'Action Required from You' : 'Awaiting Approval'}</span>
          </span>
        );
      case 'waiting':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">
            <span>Upcoming</span>
          </span>
        );
    }
  };

  const getNodeVisual = (milestone: JourneyMilestone) => {
    switch (milestone.status) {
      case 'completed':
      case 'submitted':
        return 'bg-emerald-600 text-white border-emerald-600';
      case 'returned':
        return 'bg-amber-500 text-white border-amber-500 ring-4 ring-amber-100';
      case 'rejected':
        return 'bg-rose-600 text-white border-rose-600';
      case 'bypassed':
        return 'bg-slate-300 text-slate-700 border-slate-400';
      case 'current':
        return milestone.isAssignedToCurrentUser
          ? 'bg-[#365C78] text-white border-[#192B3C] ring-4 ring-[#365C78]/25'
          : 'bg-[#365C78] text-white border-[#365C78] ring-4 ring-sky-100';
      case 'waiting':
      default:
        return 'bg-slate-100 text-slate-400 border-slate-200';
    }
  };

  return (
    <div className="space-y-4 text-[#192B3C]">
      {/* 1. Prominent Current Responsibility Banner */}
      <div
        className={`rounded-lg border p-4 transition-all shadow-xs ${
          responsibility.variant === 'action_needed'
            ? 'bg-sky-50/80 border-[#365C78]/40 ring-1 ring-[#365C78]/20'
            : responsibility.variant === 'returned'
            ? 'bg-amber-50/90 border-amber-300'
            : responsibility.variant === 'rejected'
            ? 'bg-rose-50 border-rose-200'
            : responsibility.variant === 'completed'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-white border-[#E2E5E9]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  responsibility.variant === 'action_needed'
                    ? 'bg-[#365C78] text-white'
                    : responsibility.variant === 'returned'
                    ? 'bg-amber-600 text-white'
                    : responsibility.variant === 'rejected'
                    ? 'bg-rose-600 text-white'
                    : responsibility.variant === 'completed'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {responsibility.variant === 'action_needed'
                  ? 'Your Action Required'
                  : responsibility.variant === 'returned'
                  ? 'Correction Required'
                  : responsibility.variant === 'rejected'
                  ? 'Workflow Terminated'
                  : responsibility.variant === 'completed'
                  ? 'Completed'
                  : 'Current Step'}
              </span>

              <span className="text-[11px] text-slate-500 font-mono">
                Stage {Math.min(stageCounts.completedStages + 1, stageCounts.totalStages)} of{' '}
                {stageCounts.totalStages}
              </span>
            </div>

            <h3 className="text-sm font-bold text-[#192B3C] leading-snug">
              {responsibility.headline}
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
              {responsibility.subtext}
            </p>
          </div>

          {showDocumentButton && onOpenDocument && (
            <button
              onClick={() => onOpenDocument(request.id)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#365C78] hover:bg-[#2A4A62] text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
            >
              <span>Open Document</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Linear Progress Bar */}
        <div className="mt-4 pt-3 border-t border-slate-200/60 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-700">{stageCounts.summaryText}</span>
            <span className="font-mono font-bold text-[#365C78] tabular-nums">
              {stageCounts.percentage}%
            </span>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                responsibility.variant === 'completed'
                  ? 'bg-emerald-600'
                  : responsibility.variant === 'returned'
                  ? 'bg-amber-500'
                  : responsibility.variant === 'rejected'
                  ? 'bg-rose-500'
                  : 'bg-[#365C78]'
              }`}
              style={{ width: `${stageCounts.percentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Structured Tab Switcher: Approval Journey vs Raw History */}
      <div className="bg-white border border-[#E2E5E9] rounded-lg overflow-hidden shadow-xs">
        <div className="flex border-b border-[#E2E5E9] bg-[#F9FAFB] text-xs">
          <button
            onClick={() => setActiveTab('journey')}
            className={`flex-1 py-2.5 font-semibold text-center flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'journey'
                ? 'bg-white text-[#192B3C] border-b-2 border-[#365C78]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Approval Journey ({milestones.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2.5 font-semibold text-center flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'history'
                ? 'bg-white text-[#192B3C] border-b-2 border-[#365C78]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit History ({lifecycleEvents.length})</span>
          </button>
        </div>

        {/* Tab 1: Structured Execution-Order Approval Journey */}
        {activeTab === 'journey' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between text-[11px] text-slate-500 pb-1 border-b border-[#E2E5E9]">
              <span className="font-semibold text-slate-700">Chronological Route &amp; Milestones</span>
              <span className="font-mono text-[10px]">Wf v{journey.workflowVersion}</span>
            </div>

            <div className="relative space-y-5 pt-1">
              {milestones.map((m, idx) => {
                const isLast = idx === milestones.length - 1;

                return (
                  <div key={m.id} className="relative flex items-start gap-3">
                    {/* Vertical Connector Line */}
                    {!isLast && (
                      <div
                        className={`absolute left-3.5 top-8 bottom--4 w-0.5 transition-colors ${
                          m.status === 'completed' || m.status === 'submitted'
                            ? 'bg-emerald-500'
                            : m.status === 'returned'
                            ? 'bg-amber-400'
                            : 'bg-slate-200'
                        }`}
                      />
                    )}

                    {/* Step Icon Node */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 border transition-all ${getNodeVisual(
                        m
                      )}`}
                    >
                      {m.status === 'completed' || m.status === 'submitted' ? (
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      ) : m.status === 'returned' ? (
                        <RotateCcw className="w-3.5 h-3.5" />
                      ) : m.status === 'rejected' ? (
                        <XCircle className="w-4 h-4" />
                      ) : m.status === 'bypassed' ? (
                        <ShieldCheck className="w-4 h-4" />
                      ) : (
                        <span className="text-[10px] font-mono">{idx === 0 ? 'R' : idx}</span>
                      )}
                    </div>

                    {/* Milestone Content Details */}
                    <div className="flex-1 min-w-0 bg-[#F9FAFB] border border-[#E2E5E9] rounded-md p-3 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-xs text-[#192B3C] truncate">
                            {m.participantName}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            · {m.participantRole}
                          </span>
                        </div>
                        {getStatusBadge(m)}
                      </div>

                      <div className="text-[11px] text-slate-600 flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{m.stageName}</span>
                        {m.stageNumberLabel && (
                          <span className="text-[10px] text-slate-400">({m.stageNumberLabel})</span>
                        )}
                        {m.documentVersion && m.documentVersion > 1 && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 text-slate-700 font-mono">
                            v{m.documentVersion}
                          </span>
                        )}
                      </div>

                      {/* Signature & Timing Info */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 pt-0.5">
                        {m.signatureStatus === 'signed' && (
                          <span className="flex items-center gap-1 text-emerald-700 font-medium">
                            <FileCheck className="w-3 h-3 text-emerald-600" />
                            <span>Signature recorded</span>
                          </span>
                        )}
                        {m.signatureStatus === 'pending_signature' && (
                          <span className="flex items-center gap-1 text-sky-700 font-medium">
                            <Clock className="w-3 h-3 text-sky-600" />
                            <span>Signature Pending</span>
                          </span>
                        )}
                        {m.signatureDate && (
                          <span className="font-mono text-slate-400">
                            {new Date(m.signatureDate).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>

                      {/* Remarks or Feedback */}
                      {m.comments && (
                        <div className="text-[11px] text-slate-700 italic bg-white p-2 rounded border border-[#E2E5E9] mt-1.5">
                          "{m.comments}"
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Raw Audit Lifecycle History */}
        {activeTab === 'history' && (
          <div className="p-4 space-y-3">
            <div className="text-[11px] text-slate-500 pb-1 border-b border-[#E2E5E9]">
              Immutable audit log of all document actions and version transitions.
            </div>

            <div className="space-y-2.5">
              {lifecycleEvents.map((ev, index) => (
                <div
                  key={ev.id || index}
                  className="p-2.5 bg-[#F9FAFB] border border-[#E2E5E9] rounded-md text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#192B3C]">
                      {ev.actionByName}{' '}
                      <span className="text-[10px] text-slate-500 font-normal">
                        ({ev.actionByRole})
                      </span>
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        ev.action === 'Approved'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : ev.action === 'Returned for Correction'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : ev.action === 'Rejected'
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {ev.action}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>Version {ev.version || 1}</span>
                    <span>
                      {new Date(ev.dateTime).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {ev.comments && (
                    <div className="text-[11px] text-slate-600 bg-white p-1.5 rounded border border-[#E2E5E9] italic">
                      "{ev.comments}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
