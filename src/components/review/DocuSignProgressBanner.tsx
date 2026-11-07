import { PenLine } from 'lucide-react';
import type { RequestRecord } from '../../types';
import { signingProgress, SigningSteps } from '../journey/RouteProgress';

export function DocuSignProgressBanner({ request, currentUserId, actionLabel, onAction }: {
  request: RequestRecord;
  currentUserId: string;
  actionLabel?: string;
  onAction: () => void;
}) {
  const { headline, detail, progress, milestones } = signingProgress(request, currentUserId);
  return <section className="workspace-panel border-l-4 border-l-workspace-teal p-3.5" aria-label="Signing progress">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-bold [overflow-wrap:anywhere]">{headline}</h2>
        <p className="mt-0.5 text-xs text-workspace-muted">{progress}{detail && ` · ${detail}`}</p>
      </div>
      {actionLabel && <button type="button" onClick={onAction} className="workspace-primary inline-flex min-h-10 items-center gap-2 px-3 text-xs">
        <PenLine aria-hidden="true" className="size-4" />{actionLabel}
      </button>}
    </div>
    <SigningSteps steps={milestones} />
  </section>;
}
