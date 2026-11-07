import { useEffect, useRef, useState } from 'react';
export function DraftConfirmDialog({ mode, onClose, onConfirm }: {
  mode: 'clear' | 'reload'; onClose: () => void; onConfirm: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal(); cancel.current?.focus();
    return () => { dialog.current?.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={dialog} className="preci-dialog draft-confirm p-5" aria-labelledby="draft-dialog-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="draft-dialog-title" className="text-lg font-bold">{mode === 'clear' ? 'Clear this form?' : 'Load saved draft?'}</h2>
    <p className="mt-2 text-sm text-workspace-muted">{mode === 'clear' ? 'This clears the current description, payment details and attachments.' : 'The saved draft will replace the entries currently shown here.'}</p>
    {failed && <p role="alert" className="mt-2 text-sm text-rose-700">Could not clear the form. Your entries are still here.</p>}
    <div className="mt-5 flex justify-end gap-2">
      <button ref={cancel} type="button" disabled={busy} className="workspace-control min-h-10 px-4" onClick={onClose}>Cancel</button>
      <button type="button" disabled={busy} className="workspace-primary min-h-10 px-4" onClick={async () => {
        setBusy(true);
        try { if (await onConfirm()) onClose(); else setFailed(true); } finally { setBusy(false); }
      }}>{busy ? 'Working…' : mode === 'clear' ? 'Clear form' : 'Load draft'}</button>
    </div>
  </dialog>;
}
