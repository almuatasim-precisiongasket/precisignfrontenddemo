import { useState } from 'react';
import type { ApprovalHistoryItem, RequestRecord } from '../../types';
import { signingProgress, SigningSteps } from './RouteProgress';

const commentLabels: Partial<Record<ApprovalHistoryItem['action'], string>> = {
  Submitted: 'Submission note',
  Approved: 'Signing remark',
  'Returned for Correction': 'Correction reason',
  Rejected: 'Rejection reason',
  'Route Completed': 'Completion reason',
  Cancelled: 'Cancellation reason',
  'Director Override': 'Override reason',
};

const actionColors: Partial<Record<ApprovalHistoryItem['action'], string>> = {
  Approved: 'bg-emerald-50 text-emerald-800',
  'Route Completed': 'bg-emerald-50 text-emerald-800',
  'Returned for Correction': 'bg-amber-50 text-amber-900',
  Rejected: 'bg-rose-50 text-rose-800',
};

export function ApprovalJourneyPanel({ request, currentUserId, historyOnly = false }: {
  historyOnly?: boolean;
  request: RequestRecord;
  currentUserId?: string;
}) {
  const [view, setView] = useState<'signers' | 'history'>(historyOnly ? 'history' : 'signers');
  const { milestones, lifecycleEvents } = signingProgress(request, currentUserId);

  // Preserve the stored audit order; the review panel presents recent activity first.
  const visibleEvents = historyOnly ? [...lifecycleEvents].reverse() : lifecycleEvents;

  return <section className="workspace-panel min-w-0 overflow-hidden" aria-label="Signing and request history">
    {historyOnly ? <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-workspace-line px-4 py-3">
      <h3 className="text-sm font-bold">History <span className="font-normal text-workspace-muted">({lifecycleEvents.length})</span></h3>
      <p className="text-xs text-workspace-muted">Latest first</p>
    </header> : <div role="group" aria-label="Request information" className="flex flex-wrap gap-1 border-b border-workspace-line bg-workspace p-1.5">
      {(['signers', 'history'] as const).map(option => <button key={option} type="button" aria-pressed={view === option}
        onClick={() => setView(option)} className={`min-h-10 flex-1 rounded-md px-2 text-xs font-semibold ${view === option ? 'workspace-primary' : 'workspace-control'}`}>
        {option === 'signers' ? `Signing steps (${milestones.length})` : `History (${lifecycleEvents.length})`}
      </button>)}
    </div>}
    <div className="px-4 py-3">
      {view === 'signers' ? <SigningSteps steps={milestones} details /> : <ol aria-label="Request history" className="ms-1">
        {visibleEvents.map(event => <li key={event.id} className="relative space-y-1.5 border-s border-workspace-line pb-4 ps-4 text-xs last:border-transparent last:pb-0">
          <span aria-hidden="true" className="absolute -start-[5px] top-1.5 size-2.5 rounded-full border-2 border-white bg-workspace-teal" />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <strong className="text-sm [overflow-wrap:anywhere]">{event.actionByName}</strong>
            <span className={`rounded-md px-2 py-0.5 font-semibold ${actionColors[event.action] ?? 'bg-workspace text-workspace-muted'}`}>{event.action}</span>
          </div>
          <p className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-workspace-muted">
            <span>{event.actionByRole} <span aria-hidden="true">·</span> Version {event.version || 1}</span>
            <time dateTime={event.dateTime}>{new Date(event.dateTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
          </p>
          {event.comments && <div className="rounded-md bg-workspace px-2.5 py-2">
            <p className="mb-1 text-[11px] font-medium text-workspace-muted">{commentLabels[event.action] || 'Note'}</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{event.comments}</p>
          </div>}
        </li>)}
      </ol>}
      {view === 'history' && !lifecycleEvents.length && <p className="py-3 text-sm text-workspace-muted">No history has been recorded yet.</p>}
    </div>
  </section>;
}
