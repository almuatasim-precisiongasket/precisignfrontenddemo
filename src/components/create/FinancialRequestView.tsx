import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { AdminWorkFormData, AttachmentItem, CompanyId } from '../../types';
import { canUserAccessCompany, canUserStartForm } from '../../utils/companyAccess';
import { applySignerChoices, type SignerChoices as Choices } from '../../utils/signingSelection';
import { SignerChoices } from './SignerChoices';
import { FinancialRequestDocument } from '../document/FinancialRequestDocument';
import { SignatureModal } from '../modals/SignatureModal';
import { RequestCompanyField } from './RequestCompanyField';
import { expenseEvidenceError } from '../../utils/expenseEvidence';

type FinancialForm = 'Cash Voucher' | 'Expense Claim';
const control = 'mt-1 block w-full rounded border border-slate-300 p-2';
const blankDocuments = {
  onlineDocumentChamber: false, physicalDocumentChamber: false, companyDocumentAjeer: false,
  employeeSalaryCertificate: false, permanentEmploymentVisa: false, workVisitVisa: false,
  businessVisitVisa: false, agencyWakala: false, others: false, othersDescription: '',
};

export function FinancialRequestView({ form, onBack }: { form: FinancialForm; onBack: () => void }) {
  const { currentUser, selectedScope, companies, workflows, users, submitNewRequest, openReviewRequest } = useApp();
  const [companyId, setCompanyId] = useState<CompanyId | ''>(selectedScope === 'PEG' ? '' : selectedScope);
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [voucher, setVoucher] = useState<NonNullable<AdminWorkFormData['cashVoucher']>>({ payee: '', amount: '', amountInWords: '', source: 'Admin petty cash' });
  const [claim, setClaim] = useState<NonNullable<AdminWorkFormData['expenseClaim']>>({ designation: '', project: '', lines: [{ date, particulars: '', amount: '' }] });
  const [purpose, setPurpose] = useState('');
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [reading, setReading] = useState(false);
  const isVoucher = form === 'Cash Voucher';
  const eligibleCompanies = companies.filter(company => canUserStartForm(currentUser, company.id, form));
  const company = eligibleCompanies.find(item => item.id === companyId);
  const eligibleRecipients = company ? users.filter(user => canUserAccessCompany(user, company.id)) : [];
  const route = workflows.find(item => item.companyId === company?.id && item.formType === form);
  const [choices, setChoices] = useState<Choices>({});
  const data: AdminWorkFormData = {
    companyId: company?.id ?? currentUser.companyId, companyName: company?.fullName ?? '', companyLogoDataUrl: company?.logoDataUrl,
    dateOfRequest: date, requesterName: currentUser.name, requesterId: currentUser.id,
    department: currentUser.department || 'Administration', priority: 'Medium', documents: blankDocuments,
    workDescription: isVoucher ? purpose : claim.lines[0]?.particulars ?? '',
    cashVoucher: isVoucher ? voucher : undefined, expenseClaim: isVoucher ? undefined : claim,
  };

  function review() {
    const validAmount = (amount: string) => /^\d{1,9}(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
    const evidenceError = isVoucher ? undefined : expenseEvidenceError(claim, attachments);
    const valid = isVoucher
      ? eligibleRecipients.some(user => user.id === voucher.recipientUserId) && voucher.amountInWords.trim() && purpose.trim() && validAmount(voucher.amount)
      : claim.designation.trim() && claim.project.trim() && claim.lines.every(line => line.date && line.particulars.trim() && validAmount(line.amount));
    const selection = route && applySignerChoices(route, users, currentUser.id, choices);
    if (!company || !selection || selection.error) {
      setError(company ? '' : 'Select a legal company before sending.');
    } else if (!date || !valid) {
      setError('Complete the form and enter positive amounts with up to two decimal places.');
    } else if (evidenceError) {
      setError(evidenceError);
    } else {
      setError('');
      setSigning(true);
    }
  }

  function removeReceipt(index: number) {
    setAttachments(previous => previous.filter((_, position) => position !== index));
    setClaim(previous => ({
      ...previous,
      lines: previous.lines.map(line => {
        if (line.receiptIndex === undefined || line.receiptIndex < index) return line;
        return { ...line, receiptIndex: line.receiptIndex === index ? undefined : line.receiptIndex - 1 };
      }),
    }));
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (attachments.length + selected.length > 10 || selected.some(file => file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'application/pdf'].includes(file.type))) {
      setError('Choose up to 10 PDF, PNG or JPEG files, each 5 MB or smaller.');
      return;
    }
    setReading(true);
    try {
      const added = await Promise.all(selected.map(file => new Promise<AttachmentItem>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve({
          id: crypto.randomUUID(), name: file.name, sizeBytes: file.size, sizeFormatted: `${Math.ceil(file.size / 1024)} KB`,
          uploadedAt: new Date().toISOString(), uploadedBy: currentUser.name, mimeType: file.type, dataUrl: String(reader.result),
        });
        reader.readAsDataURL(file);
      })));
      setAttachments([...attachments, ...added]);
      setError('');
    } catch {
      setError('One of the receipts could not be opened.');
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-5">
      <header className="no-print flex flex-wrap items-center justify-between gap-3">
        <div><button type="button" className="text-sm font-semibold text-[#365C78]" onClick={onBack}>← Back to forms</button><h1 className="text-2xl font-semibold tracking-tight text-workspace-ink">{form}</h1></div>
        <button type="button" className="rounded border bg-white px-4 py-2 text-sm" onClick={() => window.print()}>Print / Save as PDF</button>
      </header>
      <div className="it-request-layout grid gap-5 xl:grid-cols-2">
        <section className="no-print workspace-panel space-y-4 p-4 text-sm sm:p-5">
          <RequestCompanyField form={form} value={companyId} onChange={selectedScope === 'PEG' ? next => {
            setCompanyId(next);
            setChoices({});
            setVoucher(previous => ({ ...previous, payee: '', recipientUserId: undefined }));
            setError('');
          } : undefined} />
          <label className="block">Date<input className={control} type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
          {isVoucher ? <>
            <label className="block">Payee<select className={control} value={voucher.recipientUserId ?? ''} onChange={event => {
              const recipient = eligibleRecipients.find(user => user.id === event.target.value);
              setVoucher({ ...voucher, payee: recipient?.name ?? '', recipientUserId: recipient?.id });
            }}>
              <option value="">Select the person receiving the cash</option>
              {eligibleRecipients.map(user => <option value={user.id} key={user.id}>{user.name}</option>)}
            </select></label>
            <label className="block">Amount (SAR)<input className={control} inputMode="decimal" value={voucher.amount} onChange={e => setVoucher({ ...voucher, amount: e.target.value })} /></label>
            <label className="block">Amount in words<input className={control} maxLength={250} value={voucher.amountInWords} onChange={e => setVoucher({ ...voucher, amountInWords: e.target.value })} /></label>
            <label className="block">Cash source<select className={control} value={voucher.source} onChange={e => setVoucher({ ...voucher, source: e.target.value as typeof voucher.source })}><option>Admin petty cash</option><option>Accounts cash</option></select></label>
            <label className="block">Purpose<textarea className={control} maxLength={20000} value={purpose} onChange={e => setPurpose(e.target.value)} /></label>
          </> : <>
            <label className="block">Designation<input className={control} maxLength={150} value={claim.designation} onChange={e => setClaim({ ...claim, designation: e.target.value })} /></label>
            <label className="block">Project<input className={control} maxLength={200} value={claim.project} onChange={e => setClaim({ ...claim, project: e.target.value })} /></label>
            {claim.lines.map((line, index) => {
              const update = (changes: Partial<typeof line>) => setClaim({ ...claim, lines: claim.lines.map((item, i) => i === index ? { ...item, ...changes } : item) });
              return <fieldset key={index} className="space-y-2 rounded border p-3">
                <legend className="font-semibold">Expense {index + 1}</legend>
                <label className="block">Expense date<input className={control} type="date" value={line.date} onChange={e => update({ date: e.target.value })} /></label>
                <label className="block">Particulars<input className={control} maxLength={1000} value={line.particulars} onChange={e => update({ particulars: e.target.value })} /></label>
                <label className="block">Amount (SAR)<input className={control} inputMode="decimal" value={line.amount} onChange={e => update({ amount: e.target.value })} /></label>
                <label className="block">Receipt
                  <select className={control} value={line.receiptIndex ?? ''} onChange={event => {
                    const value = event.target.value;
                    update(value === '' ? { receiptIndex: undefined } : { receiptIndex: Number(value), noBillReason: undefined });
                  }}>
                    <option value="">Select an uploaded receipt</option>
                    {attachments.map((file, receiptIndex) => <option key={file.id} value={receiptIndex}>{receiptIndex + 1}. {file.name}</option>)}
                  </select>
                </label>
                {line.receiptIndex === undefined && <label className="block">No bill reason, if applicable<input className={control} maxLength={500} value={line.noBillReason ?? ''} onChange={e => update({ noBillReason: e.target.value || undefined })} /></label>}
                {claim.lines.length > 1 && <button type="button" className="text-rose-700" onClick={() => setClaim({ ...claim, lines: claim.lines.filter((_, i) => i !== index) })}>Remove expense {index + 1}</button>}
              </fieldset>;
            })}
            <button type="button" className="font-semibold text-[#365C78]" disabled={claim.lines.length >= 20} onClick={() => setClaim({ ...claim, lines: [...claim.lines, { date, particulars: '', amount: '' }] })}>+ Add expense</button>
            <label className="block">Receipts<input type="file" multiple accept="application/pdf,image/png,image/jpeg" disabled={reading} className={control} onChange={event => { void addFiles(event.target.files); event.target.value = ''; }} /></label>
            {attachments.map((file, index) => <p key={file.id}>{index + 1}. {file.name} <button type="button" disabled={reading} className="text-rose-700" onClick={() => removeReceipt(index)}>Remove</button></p>)}
          </>}
          <div className="space-y-1 border-t pt-3">
            <SignerChoices form={form} workflow={route} users={users} requester={currentUser} value={choices} onChange={setChoices} />
            {error && <p role="alert" className="text-rose-700">{error}</p>}
            <button type="button" className="workspace-primary mt-2 min-h-10 px-4 py-2" onClick={review} disabled={reading}>{reading ? 'Reading receipts…' : 'Sign & send'}</button>
          </div>
        </section>
        <div className="printable-area min-w-0"><FinancialRequestDocument data={data} attachments={attachments} /></div>
      </div>
      {signing && <SignatureModal isOpen onClose={() => setSigning(false)} title={`Sign ${form}`} user={currentUser} confirmLabel="Sign & send" noteLabel="Note to signers" onConfirm={async (signature, note) => {
        const result = await submitNewRequest(data, attachments, note, signature, choices);
        if (result.success && result.newId) openReviewRequest(result.newId);
        if (result.routeChanged) { setSigning(false); setChoices({}); setError(result.error ?? 'Review the updated route.'); }
        return result;
      }} />}
    </div>
  );
}
