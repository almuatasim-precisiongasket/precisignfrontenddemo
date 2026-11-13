import React from 'react';
import { XCircle } from 'lucide-react';
import { WorkspaceDialog } from '../common/WorkspaceDialog';

export interface CloseRequestDialogProps {
  mode: 'cancel' | 'reject';
  saving: boolean;
  actionReason: string;
  actionError: string | null;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const CloseRequestDialog: React.FC<CloseRequestDialogProps> = ({
  mode,
  saving,
  actionReason,
  actionError,
  onReasonChange,
  onClose,
  onSubmit,
}) => (
  <WorkspaceDialog titleId="close-heading" busy={saving} onClose={onClose} className="max-w-lg p-5">
    <div className="w-full space-y-4">
      <h3 id="close-heading" className="text-sm font-bold text-rose-700 flex items-center gap-2">
        <XCircle className="w-4 h-4 text-rose-600" />
        <span>{mode === 'cancel' ? 'Cancel request' : 'Reject request'}</span>
      </h3>
      <p className="text-xs text-slate-600 leading-relaxed">
        The request will close and its signing history will be kept.
      </p>
      <label htmlFor="close-reason" className="block text-sm font-semibold">Reason (required)</label>
      {actionError && <p id="close-error" role="alert" className="text-xs text-rose-700">{actionError}</p>}
      <textarea
        id="close-reason"
        data-dialog-focus
        aria-invalid={!!actionError}
        aria-describedby={actionError ? 'close-error' : undefined}
        disabled={saving}
        rows={3}
        value={actionReason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="e.g. Outside of departmental budget scope / not approved by management..."
        className="w-full px-3 py-2 text-xs border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-rose-500"
      />
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
        >
          Go back
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSubmit}
          className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-xs"
        >
          {saving ? 'Saving…' : mode === 'cancel' ? 'Cancel request' : 'Reject request'}
        </button>
      </div>
    </div>
  </WorkspaceDialog>
);

