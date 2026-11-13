import React from 'react';
import { RotateCcw } from 'lucide-react';
import { WorkspaceDialog } from '../common/WorkspaceDialog';

export interface ReturnRequestDialogProps {
  saving: boolean;
  actionReason: string;
  actionError: string | null;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const ReturnRequestDialog: React.FC<ReturnRequestDialogProps> = ({
  saving,
  actionReason,
  actionError,
  onReasonChange,
  onClose,
  onSubmit,
}) => (
  <WorkspaceDialog titleId="return-heading" busy={saving} onClose={onClose} className="max-w-lg p-5">
    <div className="w-full space-y-4">
      <h3 id="return-heading" className="text-sm font-bold text-[#192B3C] flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-amber-600" />
        <span>Return Request for Correction</span>
      </h3>
      <p className="text-xs text-slate-600 leading-relaxed">
        Specify what corrections or additional documents the requester must provide:
      </p>
      {actionError && <p id="return-error" role="alert" className="text-xs text-rose-700">{actionError}</p>}
      <textarea
        data-dialog-focus
        aria-label="Reason for return"
        aria-invalid={Boolean(actionError)}
        aria-describedby={actionError ? 'return-error' : undefined}
        disabled={saving}
        rows={3}
        value={actionReason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="e.g. Please update work description and attach Chamber attestation..."
        className="w-full px-3 py-2 text-xs border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
      />
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="min-h-10 rounded-md px-3 text-xs font-semibold text-slate-700 enabled:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365C78] disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSubmit}
          className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-xs"
        >
          {saving ? 'Saving…' : 'Confirm Return'}
        </button>
      </div>
    </div>
  </WorkspaceDialog>
);

