import React from 'react';
import { Download, Paperclip } from 'lucide-react';
import type { AttachmentItem } from '../../types';

export function ReviewSupportingFiles({ attachments, onDownload }: {
  attachments: AttachmentItem[] | undefined;
  onDownload: (attachment: AttachmentItem) => void;
}) {
  return (
    <section aria-label="Supporting files" className="workspace-panel overflow-hidden">
      <header className="flex items-center gap-2 border-b border-workspace-line px-4 py-3">
        <Paperclip aria-hidden="true" className="size-4 shrink-0 text-workspace-teal" />
        <h3 className="text-sm font-bold">
          Supporting files{attachments && <span className="ms-1 font-normal text-workspace-muted">({attachments.length})</span>}
        </h3>
      </header>
      {!attachments?.length ? (
        <p className="px-4 py-3 text-xs text-workspace-muted">
          {attachments ? 'No attachments uploaded for this request.' : 'Attachments for this version are unavailable.'}
        </p>
      ) : (
        <ul aria-label="Attachments" className="max-h-56 divide-y divide-workspace-line overflow-y-auto overscroll-contain px-4">
          {attachments.map(file => (
            <li key={file.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold [overflow-wrap:anywhere]">{file.name}</p>
                <p className="mt-0.5 text-[11px] text-workspace-muted">{file.sizeFormatted}</p>
              </div>
              <button
                type="button"
                aria-label={`Download ${file.name}`}
                title="Download attachment"
                onClick={() => onDownload(file)}
                className="workspace-control grid size-10 shrink-0 place-items-center"
              >
                <Download aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
