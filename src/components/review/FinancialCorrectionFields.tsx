import type { AdminWorkFormData, AttachmentItem } from '../../types';

const control = 'mt-1 block w-full rounded border px-3 py-1.5';

export function FinancialCorrectionFields({ data, attachments, onChange }: {
  data: AdminWorkFormData;
  attachments: AttachmentItem[];
  onChange: (data: AdminWorkFormData) => void;
}) {
  const administrative = data.administrativePayment;
  if (administrative) {
    const payment = administrative.payment;
    const update = (changes: Partial<typeof administrative>) => onChange({ ...data, administrativePayment: { ...administrative, ...changes } });
    return (
      <fieldset className="space-y-2">
        <legend className="font-semibold">Payment details</legend>
        <label className="block">Supporting documents<textarea className={control} maxLength={1000} value={administrative.documentDescription} onChange={event => update({ documentDescription: event.target.value })} /></label>
        <label><input type="checkbox" checked={!!payment} onChange={event => update({ payment: event.target.checked ? { amount: '', transferMode: 'Bank', purpose: 'Government Payment' } : undefined })} /> Company payment required</label>
        {payment && <>
          <label className="block">Amount (SAR)<input className={control} inputMode="decimal" value={payment.amount} onChange={event => update({ payment: { ...payment, amount: event.target.value } })} /></label>
          <label className="block">Mode of transfer<select className={control} value={payment.transferMode} onChange={event => update({ payment: { ...payment, transferMode: event.target.value as typeof payment.transferMode } })}>
            <option>Bank</option><option>Cash</option><option>Cheque</option>
          </select></label>
          <label className="block">Purpose<select className={control} value={payment.purpose} onChange={event => update({ payment: { ...payment, purpose: event.target.value as typeof payment.purpose } })}>
            <option>Government Payment</option><option>Advance Cash</option><option>Other</option>
          </select></label>
          {payment.purpose === 'Other' && <label className="block">Other purpose<input className={control} maxLength={500} value={payment.otherPurpose ?? ''} onChange={event => update({ payment: { ...payment, otherPurpose: event.target.value } })} /></label>}
          <label className="block">Transfer details (optional)<input className={control} maxLength={200} value={payment.transferDetails ?? ''} onChange={event => update({ payment: { ...payment, transferDetails: event.target.value || undefined } })} /></label>
        </>}
      </fieldset>
    );
  }

  const claim = data.expenseClaim;
  if (!claim) return null;
  const update = (changes: Partial<typeof claim>) => onChange({ ...data, expenseClaim: { ...claim, ...changes } });
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Claim details</legend>
      <label className="block">Designation<input className={control} maxLength={150} value={claim.designation} onChange={event => update({ designation: event.target.value })} /></label>
      <label className="block">Project<input className={control} maxLength={200} value={claim.project} onChange={event => update({ project: event.target.value })} /></label>
      {claim.lines.map((line, index) => {
        const changeLine = (changes: Partial<typeof line>) => update({ lines: claim.lines.map((entry, i) => i === index ? { ...entry, ...changes } : entry) });
        return <fieldset className="space-y-2 rounded border p-2" key={index}>
          <legend>Expense {index + 1}</legend>
          <label className="block">Date<input className={control} type="date" value={line.date} onChange={event => changeLine({ date: event.target.value })} /></label>
          <label className="block">Particulars<input className={control} maxLength={1000} value={line.particulars} onChange={event => changeLine({ particulars: event.target.value })} /></label>
          <label className="block">Amount (SAR)<input className={control} inputMode="decimal" value={line.amount} onChange={event => changeLine({ amount: event.target.value })} /></label>
          <label className="block">Receipt<select className={control} value={line.receiptIndex ?? ''} onChange={event => changeLine(event.target.value ? { receiptIndex: Number(event.target.value), noBillReason: undefined } : { receiptIndex: undefined })}>
            <option value="">No receipt selected</option>
            {attachments.map((file, i) => <option key={file.id} value={i}>{file.name}</option>)}
          </select></label>
          {line.receiptIndex === undefined && <label className="block">No bill reason<input className={control} maxLength={500} value={line.noBillReason ?? ''} onChange={event => changeLine({ noBillReason: event.target.value || undefined })} /></label>}
          {claim.lines.length > 1 && <button type="button" className="text-rose-700" onClick={() => update({ lines: claim.lines.filter((_, i) => i !== index) })}>Remove expense {index + 1}</button>}
        </fieldset>;
      })}
      <button type="button" className="font-semibold text-[#365C78]" disabled={claim.lines.length >= 20} onClick={() => update({ lines: [...claim.lines, { date: '', particulars: '', amount: '' }] })}>+ Add expense</button>
    </fieldset>
  );
}
