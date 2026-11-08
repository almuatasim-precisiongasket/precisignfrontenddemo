import React from 'react';
import { Paperclip, Download } from 'lucide-react';
import type { AttachmentItem } from '../../types';

export function ReviewSupportingFiles({ attachments: visibleAttachments, onDownload: handleDownloadAttachment }: {
  attachments: AttachmentItem[] | undefined;
  onDownload: (attachment: AttachmentItem) => void;
}) {
  return (
          <div className="workspace-panel overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E5E9] bg-[#F9FAFB] flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#192B3C] flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-[#365C78]" />
                <span>Supporting Files ({visibleAttachments?.length ?? 0})</span>
              </h3>
              <span className="text-[10px] text-slate-400">Attachments</span>
            </div>

            <div className="p-4">
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {!visibleAttachments ? (
                  <div className="text-center py-4 text-xs text-slate-400">Attachments for this version are unavailable.</div>
                ) : visibleAttachments.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400">
                    No attachments uploaded for this request.
                  </div>
                ) : (
                  visibleAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-2 rounded border border-[#E2E5E9] bg-[#F5F6F8] text-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-medium text-[#192B3C] truncate">{att.name}</span>
                        <span className="text-[10px] text-slate-400">({att.sizeFormatted})</span>
                      </div>
                      <button
                        onClick={() => handleDownloadAttachment(att)}
                        className="p-1 text-slate-500 hover:text-[#365C78] rounded hover:bg-slate-200"
                        title="Download attachment"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
  );
}
