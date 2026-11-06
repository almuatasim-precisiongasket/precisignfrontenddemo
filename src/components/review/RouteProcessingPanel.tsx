import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { RequestRecord } from '../../types';
import { canRecordProcessing, isFinanceHeld, pendingProcessing, processingLabels, processingRequiresSignature, type ProcessingAction } from '../../utils/routeProcessing';
import { SignatureModal } from '../modals/SignatureModal';

const waitingLabels: Record<ProcessingAction, string> = {
  itWork: 'With IT',
  payment: 'With Accounts',
  adminWork: 'With Admin',
  expenseSettlement: 'With Finance',
  cashPayout: 'Waiting for cash payout',
  cashReceipt: 'Waiting for receiver acknowledgment',
  cashReceiptWaiver: 'Waiting for receiver acknowledgment',
};
const noteLabels: Record<ProcessingAction, string> = {
  itWork: 'IT Remarks',
  payment: 'Payment reference',
  adminWork: 'Completion note',
  expenseSettlement: 'Settlement reference',
  cashPayout: 'Payout reference or note',
  cashReceipt: 'Acknowledgment note',
  cashReceiptWaiver: 'Reason for waiving acknowledgment',
};

export function RouteProcessingPanel({ request }: { request: RequestRecord }) {
  const { currentUser, recordRouteProcessing } = useApp();
  const [note, setNote] = useState('');
  const [waiverReason, setWaiverReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState<ProcessingAction>();
  const action = pendingProcessing(request);
  const canWaive = canRecordProcessing(request, currentUser, 'cashReceiptWaiver');
  const completed = (Object.keys(processingLabels) as ProcessingAction[]).filter(key => request.processing?.[key]);
  if (!action && !completed.length) return null;

  async function save(step: ProcessingAction, signature?: string) {
    setBusy(true);
    setError('');
    try {
      const result = await recordRouteProcessing(request.id, step, step === 'cashReceiptWaiver' ? waiverReason : note, signature);
      if (result.success) { setNote(''); setWaiverReason(''); }
      else setError(result.error ?? 'Could not save this update.');
      return result;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border bg-white p-4 text-sm">
      <h3 className="text-sm font-semibold text-[#192B3C]">After signing</h3>
      {completed.map(key => {
        const entry = request.processing![key]!;
        return <div key={key} className="border-b pb-2">
          <p className="font-semibold">{processingLabels[key]}</p>
          <p className="text-xs text-slate-600">{entry.byName} · {new Date(entry.at).toLocaleString()}</p>
          <p className="whitespace-pre-wrap break-words">{entry.note}</p>
        </div>;
      })}
      {action && <p className="rounded-md border border-[#C2D5E3] bg-[#EBF2F7] px-3 py-2 text-xs font-semibold text-[#192B3C]">{isFinanceHeld(request) ? 'Processing on hold' : waitingLabels[action]}</p>}
      {action && canRecordProcessing(request, currentUser, action) && (
        <form onSubmit={event => {
          event.preventDefault();
          if (processingRequiresSignature(action)) setSigning(action);
          else void save(action);
        }} className="space-y-2">
          <label className="block">{noteLabels[action]}
            <textarea className="mt-1 block w-full rounded border p-2" maxLength={2000} required value={note} onChange={event => setNote(event.target.value)} />
          </label>
          <button className="min-h-10 rounded-md bg-[#192B3C] px-3 py-2 font-semibold text-white transition-colors enabled:hover:bg-[#2A4A62] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365C78] disabled:opacity-60" disabled={busy || !note.trim()}>{busy ? 'Saving…' : processingLabels[action]}</button>
        </form>
      )}
      {canWaive && <form onSubmit={event => { event.preventDefault(); setSigning('cashReceiptWaiver'); }} className="space-y-2">
        <label className="block">Reason for waiving acknowledgment
          <textarea className="mt-1 block w-full rounded border p-2" maxLength={2000} required value={waiverReason} onChange={event => setWaiverReason(event.target.value)} />
        </label>
        <button className="rounded border px-3 py-2 font-semibold" disabled={busy || !waiverReason.trim()}>Waive acknowledgment</button>
      </form>}
      {signing && <SignatureModal isOpen onClose={() => setSigning(undefined)} title={processingLabels[signing]} user={currentUser} confirmLabel="Sign & record" onConfirm={signature => save(signing, signature)} />}
      {error && <p role="alert" className="text-rose-700">{error}</p>}
    </section>
  );
}
