import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { AttachmentItem, RequestRecord } from '../../types';
import { canRecordFinanceHold, isFinanceHeld, financeHoldActions } from '../../utils/routeProcessing';

export function FinanceHoldPanel({ request }: { request: RequestRecord }) {
  const { currentUser, recordRouteProcessing } = useApp();
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const held = isFinanceHeld(request);
  const history = request.financeHoldHistory ?? [];
  const action = (['evidence', 'resume', 'hold'] as const).find(command => canRecordFinanceHold(request, currentUser, command));
  if (!history.length && !action) return null;

  async function save(command: typeof financeHoldActions[number]) {
    setBusy(true);
    setError('');
    try {
      let attachment: AttachmentItem | undefined;
      if (command === 'evidence') {
        if (!file || !file.size || file.size > 5 * 1024 * 1024 || !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) {
          setError('Choose a PDF, PNG or JPEG file up to 5 MB.');
          return;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        attachment = { id: crypto.randomUUID(), name: file.name, sizeBytes: file.size, sizeFormatted: `${Math.ceil(file.size / 1024)} KB`,
          uploadedAt: new Date().toISOString(), uploadedBy: currentUser.name, mimeType: file.type, dataUrl };
      }
      const result = await recordRouteProcessing(request.id, command, note, undefined, attachment);
      if (!result.success) setError(result.error ?? 'Could not save the update.');
      else { setNote(''); setFile(undefined); }
    } catch {
      setError('Could not read the attachment or save the update.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace-panel space-y-3 p-4 text-sm">
      <h3 className="font-bold">{held ? 'On hold with Finance' : 'Finance review'}</h3>
      {history.map((entry, index) => (
        <div key={index} className="border-b pb-2">
          <p className="font-semibold">{entry.action === 'hold' ? 'Put on hold' : entry.action === 'resume' ? 'Processing resumed' : entry.action === 'correction' ? 'Correction and new signatures requested' : 'Evidence added'}</p>
          <p className="text-xs text-slate-600">{entry.byName} · Version {entry.documentVersion} · {new Date(entry.at).toLocaleString()}</p>
          <p className="whitespace-pre-wrap break-words">{entry.note}</p>
          {entry.attachment?.dataUrl && <a className="font-medium text-[#365C78] underline" href={entry.attachment.dataUrl} download={entry.attachment.name}>{entry.attachment.name}</a>}
        </div>
      ))}
      {action && <form key={action} className="space-y-2" onSubmit={event => { event.preventDefault(); void save(action); }}>
        <label className="block">{action === 'hold' ? 'Reason for hold' : action === 'resume' ? 'Reason for this update' : 'Evidence note'}
          <textarea className="mt-1 block w-full rounded border p-2" required maxLength={2000} value={note} onChange={event => setNote(event.target.value)} />
        </label>
        {action === 'evidence' && <label className="block">Follow-up evidence
          <input className="block w-full" type="file" required accept="application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0])} />
        </label>}
        <button className="rounded border px-3 py-2 font-semibold" disabled={busy || !note.trim()}>
          {action === 'hold' ? 'Put on hold' : action === 'resume' ? 'Resume processing' : 'Send evidence'}
        </button>
        {action === 'resume' && canRecordFinanceHold(request, currentUser, 'correction') && (
          <button type="button" className="ml-2 rounded border px-3 py-2 font-semibold" disabled={busy || !note.trim()}
            onClick={() => void save('correction')}>Request correction and new signatures</button>
        )}
      </form>}
      {error && <p role="alert" className="text-rose-700">{error}</p>}
    </section>
  );
}
