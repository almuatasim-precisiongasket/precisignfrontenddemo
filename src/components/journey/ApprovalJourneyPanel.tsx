import { useState } from 'react';
import type { RequestRecord } from '../../types';
import { signingProgress, SigningSteps } from './RouteProgress';

export function ApprovalJourneyPanel({ request, currentUserId }: {
  request: RequestRecord;
  currentUserId?: string;
}) {
  const [view, setView] = useState<'signers' | 'history'>('signers');
  const { milestones, lifecycleEvents } = signingProgress(request, currentUserId);

  return <section className="workspace-panel min-w-0 overflow-hidden" aria-label="Signing and request history">
    <div role="group" aria-label="Request information" className="flex flex-wrap gap-1 border-b border-workspace-line bg-workspace p-1.5">
      {(['signers', 'history'] as const).map(option => <button key={option} type="button" aria-pressed={view === option}
        onClick={() => setView(option)} className={`min-h-10 flex-1 rounded-md px-2 text-xs font-semibold ${view === option ? 'workspace-primary' : 'workspace-control'}`}>
        {option === 'signers' ? `Signing steps (${milestones.length})` : `History (${lifecycleEvents.length})`}
      </button>)}
    </div>
    <div className="px-3 py-1">
      {view === 'signers' ? <SigningSteps steps={milestones} details /> : <ol aria-label="Request history" className="divide-y divide-workspace-line">
        {lifecycleEvents.map(event => <li key={event.id} className="space-y-1.5 py-2.5 text-xs">
          <p><strong>{event.action}</strong> · {event.actionByName} <span className="text-workspace-muted">({event.actionByRole})</span></p>
          <p className="text-workspace-muted">Version {event.version || 1} · <time dateTime={event.dateTime}>{new Date(event.dateTime).toLocaleString('en-GB')}</time></p>
          {event.comments && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{event.comments}</p>}
        </li>)}
      </ol>}
      {view === 'history' && !lifecycleEvents.length && <p className="py-3 text-sm text-workspace-muted">No history has been recorded yet.</p>}
    </div>
  </section>;
}
