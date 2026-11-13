import React from 'react';
import { WorkspaceDialog } from '../common/WorkspaceDialog';

export interface CompleteRouteDialogProps {
  saving: boolean;
  completionLabel: string;
  outstanding: { stageId: string; stageName: string; assignedUserName: string }[];
  actionReason: string;
  actionError: string | null;
  finalAlreadySigned: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const CompleteRouteDialog: React.FC<CompleteRouteDialogProps> = ({
  saving,
  completionLabel,
  outstanding,
  actionReason,
  actionError,
  finalAlreadySigned,
  onReasonChange,
  onClose,
  onSubmit,
}) => (
  <WorkspaceDialog titleId="route-completion-title" busy={saving} onClose={onClose} className="max-w-md p-5">
    <div className="w-full space-y-3">
      <h2 id="route-completion-title" className="text-base font-bold">{completionLabel}</h2>
      <p className="text-sm text-workspace-muted">This finishes signing. The following signers will be recorded as bypassed:</p>
      <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
        {outstanding.map(step => <li key={step.stageId}>{step.assignedUserName} · {step.stageName}</li>)}
      </ul>
      <label htmlFor="route-completion-reason" className="block text-sm font-semibold">Reason for bypassing (required)</label>
      <textarea
        id="route-completion-reason"
        data-dialog-focus
        disabled={saving}
        rows={3}
        value={actionReason}
        aria-invalid={!!actionError}
        aria-describedby={actionError ? 'route-completion-error' : undefined}
        onChange={event => onReasonChange(event.target.value)}
        className="workspace-control w-full p-2 text-sm"
      />
      {actionError && <p id="route-completion-error" role="alert" className="text-sm text-rose-700">{actionError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} className="workspace-control min-h-10 px-3 text-sm" onClick={onClose}>Cancel</button>
        <button type="button" disabled={saving} className="workspace-primary min-h-10 px-3 text-sm" onClick={onSubmit}>
          {saving ? 'Saving…' : finalAlreadySigned ? 'Complete request' : 'Continue to signature'}
        </button>
      </div>
    </div>
  </WorkspaceDialog>
);

