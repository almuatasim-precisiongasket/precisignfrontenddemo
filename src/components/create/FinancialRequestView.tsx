import { checkSupportingFiles, SupportingFiles } from './SupportingFiles';
import { EditorInput, EditorTextarea, EditorSelect } from './RequestEditorControls';
import { EditorViewToggle } from './EditorViewToggle';
import { useFieldErrors } from './useFieldErrors';
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
const control = 'workspace-control mt-1 block min-h-10 w-full px-3 py-2';
const blankDocuments = {
  onlineDocumentChamber: false, physicalDocumentChamber: false, companyDocumentAjeer: false,
  employeeSalaryCertificate: false, permanentEmploymentVisa: false, workVisitVisa: false,
  businessVisitVisa: false, agencyWakala: false, others: false, othersDescription: '',
};

export function FinancialRequestView({ form, onBack }: { form: FinancialForm; onBack: () => void }) {
  const { currentUser, selectedScope, companies, workflows, users, submitNewRequest, openReviewRequest } = useApp();
  const [view, setView] = useState<'editor' | 'preview'>('editor');
  const validation = useFieldErrors();
  const [companyId, setCompanyId] = useState<CompanyId | ''>(selectedScope === 'PEG' ? '' : selectedScope);
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [voucher, setVoucher] = useState<NonNullable<AdminWorkFormData['cashVoucher']>>({ payee: '', amount: '', amountInWords: '', source: 'Admin petty cash' });
  const [claim, setClaim] = useState<NonNullable<AdminWorkFormData['expenseClaim']>>({ designation: '', project: '', lines: [{ date, particulars: '', amount: '' }] });
  const [purpose, setPurpose] = useState('');
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [reading, setReading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const isVoucher = form === 'Cash Voucher';
  const eligibleCompanies = companies.filter(company => canUserStartForm(currentUser, company.id, form));
  const company = eligibleCompanies.find(item => item.id === companyId);
  const eligibleRecipients = company ? users.filter(user => canUserAccessCompany(user, company.id)) : [];
  const route = workflows.find(item => item.companyId === company?.id && item.formType === form && item.stages.length > 0);
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
    setView('editor');
    const rules: [string, boolean, string][] = [
      ['company', !!company, 'Select a legal company.'], ['date', !!date, 'Choose a date.'],
      ...(isVoucher ? [
        ['payee', eligibleRecipients.some(user => user.id === voucher.recipientUserId), 'Choose the person receiving cash.'],
        ['amount', validAmount(voucher.amount), 'Enter a positive amount with up to two decimal places.'],
        ['words', !!voucher.amountInWords.trim(), 'Enter the amount in words.'],
        ['purpose', !!purpose.trim(), 'Describe the purpose.'],
      ] as [string, boolean, string][] : [
        ['designation', !!claim.designation.trim(), 'Enter your designation.'],
        ['project', !!claim.project.trim(), 'Enter the project.'],
        ...claim.lines.flatMap((line, index): [string, boolean, string][] => [
          ['date-' + index, !!line.date, 'Choose an expense date.'],
          ['particulars-' + index, !!line.particulars.trim(), 'Describe the expense.'],
          ['amount-' + index, validAmount(line.amount), 'Enter a positive amount.'],
          ['receipt-' + index, line.receiptIndex !== undefined || !!line.noBillReason?.trim(), 'Select a receipt or enter a no-bill reason.'],
        ]),
      ] as [string, boolean, string][]),
    ];
    if (!validation.validate(rules)) return;
    const selection = route && applySignerChoices(route, users, currentUser.id, choices);
    if (!company || !selection || selection.error) {
      setError('');
      requestAnimationFrame(() => document.getElementById('signer-review')?.focus());
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
    const issue = checkSupportingFiles(selected, attachments, 10);
    setAttachmentError(issue ?? '');
    if (issue) return;
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
      setAttachmentError('One of the receipts could not be opened.');
    } finally {
      setReading(false);
    }
  }

  return (
    <div data-editor-view={view} className="request-editor mx-auto max-w-7xl space-y-4 p-5">
      <header className="no-print flex flex-wrap items-center justify-between gap-3">
        <div><button type="button" className="text-sm font-semibold text-[#365C78]" onClick={onBack}>← Back to forms</button><h1 className="text-2xl font-semibold tracking-tight text-workspace-ink">{form}</h1></div>
        <button type="button" className="rounded border bg-white px-4 py-2 text-sm" onClick={() => window.print()}>Print / Save as PDF</button>
      </header>
      <EditorViewToggle value={view} onChange={setView} />
      <div className="editor-columns it-request-layout">
        <section className="editor-fields no-print workspace-panel space-y-4 p-4 text-sm sm:p-5">
          <div><RequestCompanyField fieldProps={validation.props("company")} form={form} value={companyId} onChange={selectedScope === 'PEG' ? next => {
            setCompanyId(next);
            setChoices({});
            setVoucher(previous => ({ ...previous, payee: '', recipientUserId: undefined }));
            setError('');
          } : undefined} />{validation.message("company")}</div>
          <label className="block">Date<EditorInput className={control} type="date" {...validation.props("date")} value={date} onChange={event => setDate(event.target.value)} />{validation.message("date")}</label>
          {isVoucher ? <>
            <label className="block">Payee<EditorSelect className={control} {...validation.props("payee")} value={voucher.recipientUserId ?? ''} onChange={event => {
              const recipient = eligibleRecipients.find(user => user.id === event.target.value);
              setVoucher({ ...voucher, payee: recipient?.name ?? '', recipientUserId: recipient?.id });
            }}>
              <option value="">Select the person receiving the cash</option>
              {eligibleRecipients.map(user => <option value={user.id} key={user.id}>{user.name}</option>)}
            </EditorSelect>{validation.message("payee")}</label>
            <label className="block">Amount (SAR)<EditorInput className={control} inputMode="decimal" {...validation.props("amount")} value={voucher.amount} onChange={e => setVoucher({ ...voucher, amount: e.target.value })} />{validation.message("amount")}</label>
            <label className="block">Amount in words<EditorInput className={control} maxLength={250} {...validation.props("words")} value={voucher.amountInWords} onChange={e => setVoucher({ ...voucher, amountInWords: e.target.value })} />{validation.message("words")}</label>
            <label className="block">Cash source<EditorSelect className={control} value={voucher.source} onChange={e => setVoucher({ ...voucher, source: e.target.value as typeof voucher.source })}><option>Admin petty cash</option><option>Accounts cash</option></EditorSelect></label>
            <label className="block">Purpose<EditorTextarea className={control} maxLength={20000} {...validation.props("purpose")} value={purpose} onChange={e => setPurpose(e.target.value)} />{validation.message("purpose")}</label>
          </> : <>
            <label className="block">Designation<EditorInput className={control} maxLength={150} {...validation.props("designation")} value={claim.designation} onChange={e => setClaim({ ...claim, designation: e.target.value })} />{validation.message("designation")}</label>
            <label className="block">Project<EditorInput className={control} maxLength={200} {...validation.props("project")} value={claim.project} onChange={e => setClaim({ ...claim, project: e.target.value })} />{validation.message("project")}</label>
            {claim.lines.map((line, index) => {
              const update = (changes: Partial<typeof line>) => setClaim({ ...claim, lines: claim.lines.map((item, i) => i === index ? { ...item, ...changes } : item) });
              return <fieldset key={index} className="space-y-2 rounded border p-3">
                <legend className="font-semibold">Expense {index + 1}</legend>
                <label className="block">Expense date<EditorInput className={control} type="date" {...validation.props("date-" + index)} value={line.date} onChange={e => update({ date: e.target.value })} />{validation.message("date-" + index)}</label>
                <label className="block">Particulars<EditorInput className={control} maxLength={1000} {...validation.props("particulars-" + index)} value={line.particulars} onChange={e => update({ particulars: e.target.value })} />{validation.message("particulars-" + index)}</label>
                <label className="block">Amount (SAR)<EditorInput className={control} inputMode="decimal" {...validation.props("amount-" + index)} value={line.amount} onChange={e => update({ amount: e.target.value })} />{validation.message("amount-" + index)}</label>
                <label className="block">Receipt
                  <EditorSelect className={control} {...validation.props("receipt-" + index)} value={line.receiptIndex ?? ''} onChange={event => {
                    const value = event.target.value;
                    update(value === '' ? { receiptIndex: undefined } : { receiptIndex: Number(value), noBillReason: undefined });
                  }}>
                    <option value="">Select an uploaded receipt</option>
                    {attachments.map((file, receiptIndex) => <option key={file.id} value={receiptIndex}>{receiptIndex + 1}. {file.name}</option>)}
                  </EditorSelect>{validation.message("receipt-" + index)}
                </label>
                {line.receiptIndex === undefined && <label className="block">No bill reason, if applicable<EditorInput className={control} maxLength={500} value={line.noBillReason ?? ''} onChange={e => update({ noBillReason: e.target.value || undefined })} /></label>}
                {claim.lines.length > 1 && <button type="button" className="text-rose-700" onClick={() => setClaim({ ...claim, lines: claim.lines.filter((_, i) => i !== index) })}>Remove expense {index + 1}</button>}
              </fieldset>;
            })}
            <button type="button" className="font-semibold text-[#365C78]" disabled={claim.lines.length >= 20} onClick={() => setClaim({ ...claim, lines: [...claim.lines, { date, particulars: '', amount: '' }] })}>+ Add expense</button>
            <SupportingFiles title="Receipts" files={attachments} maxFiles={10} busy={reading} error={attachmentError}
              onSelect={files => { void addFiles(files); }} onRemove={index => { removeReceipt(index); setAttachmentError(''); }} numbered />
          </>}
          <div className="space-y-1 border-t pt-3">
            <SignerChoices form={form} workflow={route} companySelected={!!company} users={users} requester={currentUser} value={choices} onChange={setChoices} />
            {error && <p role="alert" className="text-rose-700">{error}</p>}
            <button type="button" className="workspace-primary mt-2 min-h-10 px-4 py-2" onClick={review} disabled={reading}>{reading ? 'Reading receipts…' : 'Sign & send'}</button>
          </div>
        </section>
        <div className="editor-preview printable-area min-w-0"><h2 className="workspace-panel no-print mb-2 px-3 py-2 text-sm font-bold">Live document preview</h2><FinancialRequestDocument data={data} attachments={attachments} /></div>
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
