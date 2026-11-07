import type { RequestRecord } from '../../types';
import { signingProgress, SigningSteps } from '../journey/RouteProgress';

export function RequestJourneySummary({ request, userId, onHistory }: {
  request: RequestRecord; userId: string; onHistory: () => void;
}) {
  const { headline, detail, progress, milestones } = signingProgress(request, userId);
  return <section className="route-peek" aria-label={`Signing summary for ${request.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <p className="text-sm font-semibold [overflow-wrap:anywhere]">{headline}</p>
        <p className="text-xs text-workspace-muted">{progress}{detail && ` · ${detail}`}</p>
      </div>
      <button type="button" className="preci-link min-h-9 text-xs" onClick={onHistory}>Signing history</button>
    </div>
    <SigningSteps steps={milestones} />
  </section>;
}
