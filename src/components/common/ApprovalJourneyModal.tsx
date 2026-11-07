import React, { useEffect, useRef } from 'react';
import { RequestRecord } from '../../types/index';
import { signingProgress } from '../journey/RouteProgress';
import { ApprovalJourneyPanel } from '../journey/ApprovalJourneyPanel';
import { X, ExternalLink } from 'lucide-react';

interface ApprovalJourneyModalProps {
  request: RequestRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDocument: (requestId: string) => void;
  currentUserId?: string;
}

export const ApprovalJourneyModal: React.FC<ApprovalJourneyModalProps> = ({
  request,
  isOpen,
  onClose,
  onOpenDocument,
  currentUserId,
}) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!isOpen || !request) return;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); if (trigger?.isConnected) trigger.focus(); };
  }, [isOpen, request?.id]);
  if (!isOpen || !request) return null;
  const { headline, progress } = signingProgress(request, currentUserId);

  return (
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }}
      aria-modal="true"
      aria-labelledby="approval-journey-modal-title"
      className="preci-dialog journey-dialog"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-lg shadow-xl border border-[#CBD5E1] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-[#E2E5E9] flex flex-wrap items-center justify-between gap-2 bg-[#F8FAFC]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-all font-mono font-bold text-sm text-[#192B3C]">
                {request.id}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#EBF2F7] text-[#365C78] border border-[#C2D5E3]">
                {request.companyId}
              </span>
              {request.documentVersion > 1 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                  v{request.documentVersion}.0
                </span>
              )}
            </div>
            <h2 id="approval-journey-modal-title" className="text-xs text-slate-600 truncate mt-0.5 max-w-md">
              {request.formType} · {request.formData.workDescription}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenDocument(request.id);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#365C78] hover:bg-[#2A4A62] text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
            >
              <span>Open request</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close approval journey modal"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Scrollable Journey */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <p className="px-1 text-xs text-workspace-muted"><strong className="text-workspace-ink">{headline}</strong> · {progress}</p>
          <ApprovalJourneyPanel
            request={request}
            currentUserId={currentUserId}
          />
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#E2E5E9] bg-[#F8FAFC] flex items-center justify-between text-xs text-slate-500">
          <span>Created on {new Date(request.createdAt).toLocaleDateString('en-GB')} by {request.requesterName}</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-white border border-[#CBD5E1] hover:bg-slate-50 rounded-md font-medium text-slate-700 shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
};
