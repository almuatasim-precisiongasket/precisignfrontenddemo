import { checkSupportingFiles, SupportingFiles } from './SupportingFiles';
import { canUserStartForm } from '../../utils/companyAccess';
import { EditorInput, EditorTextarea, EditorSelect } from './RequestEditorControls';
import { EditorViewToggle } from './EditorViewToggle';
import { DraftConfirmDialog } from './DraftConfirmDialog';
import { useFieldErrors } from './useFieldErrors';
import React, { useState, useEffect, useRef } from 'react';
import { ApiError } from '../../services/apiTypes';
import { useApp, useUnsavedWork } from '../../context/AppContext';
import { AdminWorkFormData, PriorityLevel, AttachmentItem, CompanyId } from '../../types/index';
import { AdminWorkRequestDocument } from '../document/AdminWorkRequestDocument';
import { AdministrativePaymentDocument } from '../document/AdministrativePaymentDocument';
import { SignatureModal } from '../modals/SignatureModal';
import { canAdministerWorkflows, resolveConfiguredSigner } from '../../utils/workflowAdministration';
import { applySignerChoices, type SignerChoices as Choices } from '../../utils/signingSelection';
import { SignerChoices } from './SignerChoices';
import { RequestCompanyField } from './RequestCompanyField';
import {
  FileText,
  Printer,
  Maximize2,
  Minimize2,
  Save,
  RotateCcw,
  Send,
  Calendar,
  AlertCircle,
  CheckCircle,
  Upload,
  ZoomIn,
  ZoomOut,
  Eye,
  Check,
} from 'lucide-react';

export const CreateRequestView: React.FC = () => {
  const {
    currentUser,
    readOnly: connected,
    draftCompanyId,
    selectDraftCompany,
    reloadDraft,
    companies,
    selectedScope,
    selectedCompany,
    workflows,
    users,
    draftFormData: savedDraft,
    selectedRequestFormType,
    saveDraft,
    clearDraft,
    submitNewRequest,
    setActiveView,
    openReviewRequest,
  } = useApp();
  const combined = selectedRequestFormType === 'Administrative & Payment Request';
  const formName = combined ? 'Administrative & Payment Request' : 'Admin Work Request';
  const validation = useFieldErrors();
  const [draftDialog, setDraftDialog] = useState<'clear' | 'reload' | null>(null);
  const [choices, setChoices] = useState<Choices>({});
  const draftFormData = combined ? null : savedDraft;
  const [documentDescription, setDocumentDescription] = useState('');
  const [payment, setPayment] = useState<NonNullable<NonNullable<AdminWorkFormData['administrativePayment']>['payment']>>();

  const [originatingCompanyId, setOriginatingCompanyId] = useState<CompanyId>(() => {
    if (connected && draftCompanyId) return draftCompanyId;
    if (draftFormData?.companyId) return draftFormData.companyId;
    if (selectedScope && selectedScope !== 'PEG') {
      return selectedScope as CompanyId;
    }
    return currentUser.companyId || 'PEW';
  });

  const [dateOfRequest, setDateOfRequest] = useState(() => {
    return (
      draftFormData?.dateOfRequest ??
      new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    );
  });

  const [department, setDepartment] = useState(
    draftFormData?.department ?? (currentUser.department || 'Administration')
  );

  const [priority, setPriority] = useState<PriorityLevel | undefined>(
    draftFormData?.priority ?? (combined ? undefined : 'Urgent')
  );

  const [workDescription, setWorkDescription] = useState(
    draftFormData?.workDescription ??
      (connected ? '' : 'Attestation of commercial contract with Ministry of Commerce & Chamber of Commerce for the new facility expansion project.')
  );

  const [documents, setDocuments] = useState(
    draftFormData?.documents || {
      onlineDocumentChamber: !combined,
      physicalDocumentChamber: false,
      companyDocumentAjeer: false,
      employeeSalaryCertificate: false,
      permanentEmploymentVisa: false,
      workVisitVisa: false,
      businessVisitVisa: false,
      agencyWakala: false,
      others: false,
      othersDescription: '',
    }
  );

  const [attachments, setAttachments] = useState<AttachmentItem[]>(draftFormData?.attachments || []);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const submitting = useRef(false);
  const [submittingNow, setSubmittingNow] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [attachmentError, setAttachmentError] = useState('');
  const savedGeneration = useRef(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'editor' | 'preview'>('editor');

  useUnsavedWork(JSON.stringify({ originatingCompanyId, dateOfRequest, department, priority, workDescription, documents, documentDescription, payment, choices, pendingUploads, attachments: attachments.map(file => file.id) }));

  const resolvedCompany = companies.find((c) => c.id === originatingCompanyId) || selectedCompany;
  const signingWorkflow = workflows.find(workflow => workflow.companyId === originatingCompanyId && workflow.formType === formName && workflow.stages.length > 0);
  const canStartSelectedCompany = companies.some(company => company.id === originatingCompanyId && canUserStartForm(currentUser, company.id, formName));
  const signingSteps = signingWorkflow?.stages ?? [];

  const draftData = () => ({ dateOfRequest, department, priority, workDescription, documents, companyId: originatingCompanyId, attachments });
  const reportDraftError = (error: unknown) => {
    setLastSavedTime(null);
    setDraftSaveError(error instanceof ApiError && error.status === 409
      ? 'Your draft changed in another tab. Your entries are kept here. Load the saved draft to review the other version before editing again.'
      : `Draft not saved: ${error instanceof Error ? error.message : 'storage error'}. Your entries are kept here.`);
  };
  // Each edit is queued for its own user/company key. No timer can fire after switching editors.
  useEffect(() => {
    if (combined) return;
    const generation = ++savedGeneration.current;
    let active = true;
    setLastSavedTime(null); setDraftSaving(true);
    void saveDraft(draftData()).then(() => {
      if (active && generation === savedGeneration.current) {
        setDraftSaveError(null);
        setLastSavedTime(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }));
      }
    }).catch(error => { if (active && generation === savedGeneration.current) reportDraftError(error); })
      .finally(() => { if (active && generation === savedGeneration.current) setDraftSaving(false); });
    return () => { active = false; };
  }, [combined, dateOfRequest, department, priority, workDescription, documents, originatingCompanyId, attachments]);

  const retrySave = async () => {
    setDraftSaving(true);
    try { await saveDraft(draftData(), true); setDraftSaveError(null); setLastSavedTime(new Date().toLocaleTimeString()); }
    catch (error) { reportDraftError(error); }
    finally { setDraftSaving(false); }
  };

  // Preview form data
  const previewData: AdminWorkFormData = {
    dateOfRequest,
    companyId: resolvedCompany.id,
    companyName: resolvedCompany.fullName,
    companyLogoDataUrl: resolvedCompany.logoDataUrl,
    requesterId: currentUser.id,
    requesterName: currentUser.name,
    department,
    priority: priority ?? 'Urgent',
    workDescription,
    documents,
    administrativePayment: combined ? { documentDescription, payment } : undefined,
    requesterSignatureName: undefined,
    requesterSignatureDataUrl: undefined,
    approvalAuthoritySignatureName: undefined,
    approvalAuthoritySignatureDataUrl: undefined,
  };

  const handleDocumentToggle = (key: keyof typeof documents) => {
    setDocuments((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleFileUpload = (files: FileList) => {
    const selected = Array.from(files);
    const issue = checkSupportingFiles(selected, attachments, 20);
    setAttachmentError(issue ?? '');
    if (issue) return;

    setPendingUploads(count => count + selected.length);
    selected.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const sizeFormatted =
          file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.ceil(file.size / 1024)} KB`;

        const newAtt: AttachmentItem = {
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          sizeBytes: file.size,
          sizeFormatted,
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl,
        };

        setAttachments((prev) => [...prev, newAtt]);
        setPendingUploads(count => count - 1);
      };
      reader.onerror = () => { setPendingUploads(count => count - 1); setAttachmentError(`Could not read ${file.name}. Please select it again.`); };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleClear = async () => {
    {
      try {
        if (!combined) await clearDraft();
      } catch (error) {
        setValidationError(`Draft could not be cleared: ${error instanceof Error ? error.message : 'storage error'}`);
        return false;
      }
      setWorkDescription('');
      setDocumentDescription('');
      setPayment(undefined);
      setAttachments([]);
      if (combined) setPriority(undefined);
      setDocuments({
        onlineDocumentChamber: false,
        physicalDocumentChamber: false,
        companyDocumentAjeer: false,
        employeeSalaryCertificate: false,
        permanentEmploymentVisa: false,
        workVisitVisa: false,
        businessVisitVisa: false,
        agencyWakala: false,
        others: false,
        othersDescription: '',
      });
      setFeedbackSuccess('Draft cleared.');
      setTimeout(() => setFeedbackSuccess(null), 3000);
      return true;
    }
  };

  const handleTriggerSubmit = () => {
    if (submitting.current || pendingUploads) return;
    setValidationError(null);
    setActiveMobileTab('editor');
    if (combined && !validation.validate([
      ['company', canStartSelectedCompany, 'Choose a company where you can start this form.'],
      ['date', !!dateOfRequest, 'Choose a date.'],
      ['department', !!department.trim(), 'Enter your department.'],
      ['priority', !!priority, 'Choose a priority.'],
      ['description', !!workDescription.trim(), 'Describe the work.'],
      ['amount', !payment || (/^\d{1,9}(\.\d{1,2})?$/.test(payment.amount) && Number(payment.amount) > 0), 'Enter a positive SAR amount.'],
      ['other', !payment || payment.purpose !== 'Other' || !!payment.otherPurpose?.trim(), 'Describe the payment purpose.'],
    ])) return;
    if (!priority) {
      setValidationError('Choose a priority before submitting.');
      return;
    }
    if (!workDescription.trim()) {
      setValidationError('Please enter a work description before submitting.');
      return;
    }
    if (combined) {
      const selection = signingWorkflow && applySignerChoices(signingWorkflow, users, currentUser.id, choices);
      if (!selection || selection.error) {
        requestAnimationFrame(() => document.getElementById('signer-review')?.focus());
        return;
      }
    }
    if (payment && (!/^\d{1,9}(\.\d{1,2})?$/.test(payment.amount) || Number(payment.amount) <= 0 || (payment.purpose === 'Other' && !payment.otherPurpose?.trim()))) {
      setValidationError('Enter a positive SAR amount and describe the purpose if you selected Other.');
      return;
    }
    // Open signature confirmation modal
    setSignatureModalOpen(true);
  };

  const handleConfirmedSubmit = async (signatureDataUrl: string, note?: string) => {
    if (submitting.current) return;
    submitting.current = true; setSubmittingNow(true);
    const result = await submitNewRequest(
      previewData,
      attachments,
      note,
      signatureDataUrl,
      combined ? choices : undefined
    );
    if (result.success && result.newId) {
      setFeedbackSuccess(`Request ${result.newId} created and submitted successfully.`);
      openReviewRequest(result.newId);
    } else {
      submitting.current = false; setSubmittingNow(false);
      if (result.routeChanged) { setSignatureModalOpen(false); setChoices({}); }
      setValidationError(result.error || 'Failed to submit request.');
    }
    return result;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div data-editor-view={activeMobileTab} className="request-editor request-create p-3.5 sm:p-6 md:p-8 max-w-[1600px] mx-auto space-y-4 sm:space-y-6">
      {draftDialog && <DraftConfirmDialog mode={draftDialog} onClose={() => setDraftDialog(null)} onConfirm={async () => {
        if (draftDialog === 'reload') { reloadDraft(); return true; }
        return await handleClear() ?? false;
      }} />}
      {/* Top Header & Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E2E5E9]">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <button
              onClick={() => setActiveView('dashboard')}
              className="hover:text-[#365C78] transition-colors"
            >
              Dashboard
            </button>
            <span>/</span>
            <span className="text-slate-400">Request Creation</span>
            <span>/</span>
            <span className="text-[#192B3C] font-semibold">{formName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#EBF2F7] text-[#365C78] flex items-center justify-center border border-[#C2D5E3]">
              <FileText aria-hidden="true" className="size-4" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#192B3C] tracking-tight">
                Create {formName}
              </h1>
              <p className="text-xs text-slate-500">
                {combined ? 'Request administrative work and add payment details when needed. Entries stay here until you leave.' : 'Official bilingual administrative request form (PR#21-001FA) with live A4 preview.'}
              </p>
            </div>
          </div>
        </div>

        {/* Status Actions: Auto-save status + Save Draft + Submit */}
        <div className="flex flex-wrap items-center gap-2">
          {draftSaving && <span role="status" className="text-[11px] text-slate-500">Saving draft…</span>}
          {lastSavedTime && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 mr-2">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Draft saved at {lastSavedTime}</span>
            </div>
          )}

          <button
            type="button"
            disabled={submittingNow || draftSaving}
            onClick={() => setDraftDialog('clear')}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors enabled:hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365C78] disabled:opacity-60"
          >
            Clear Form
          </button>

          <button
            type="button"
            disabled={submittingNow || pendingUploads > 0}
            onClick={handleTriggerSubmit}
            className="workspace-primary flex min-h-10 items-center gap-2 px-4 py-2 text-sm"
          >
            <Send aria-hidden="true" className="size-4" />
            <span>Sign &amp; Submit Request</span>
          </button>
        </div>
      </div>

      <EditorViewToggle value={activeMobileTab} onChange={setActiveMobileTab} />

      {/* Alerts */}
      {draftSaveError && <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 space-y-2"><p>{draftSaveError}</p><button disabled={draftSaving} className="underline mr-3" onClick={retrySave}>Retry draft save</button>{connected && <button className="underline" onClick={() => setDraftDialog('reload')}>Load saved draft</button>}</div>}
      {validationError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{validationError}</span>
        </div>
      )}

      {feedbackSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{feedbackSuccess}</span>
        </div>
      )}

      {!combined && <section className="no-print rounded-lg border border-slate-200 bg-white p-4 text-sm" aria-label="PreciRoute signers">
        <h2 className="font-bold text-[#192B3C]">Review signers</h2>
        <ol className="mt-2 space-y-2">
          <li><strong>{currentUser.name}</strong> · Requester (you)</li>
          {signingSteps.map((stage, index) => {
            const signer = resolveConfiguredSigner(stage, users, originatingCompanyId);
            return <li key={stage.id}><strong>{signer?.name ?? 'Signer not configured'}</strong> · {index === signingSteps.length - 1 ? 'Final approver' : stage.name}</li>;
          })}
        </ol>
        <p className="mt-2 text-xs text-slate-600">{signingSteps.length ? 'You sign as requester when you send.' : 'No approval route is configured for this company.'}</p>
      </section>}
      {/* Split-Screen: Left Editor (50%) + Right Live A4 Preview (50%) */}
      <div className="editor-columns items-start">
        {/* Left Column: Focused Form Editor */}
        <fieldset disabled={submittingNow}
          className="editor-fields workspace-panel no-print space-y-6 p-4 sm:p-6"
        >
          {/* Section 1: Entity & Requester Details */}
          <div className="space-y-4">
            <div className="pb-2 border-b border-[#E2E5E9] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-workspace-ink">
                Request details
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1">
                <label htmlFor={combined ? validation.props("date").id : "request-date"} className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                  <span>Date of Request</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <EditorInput
                    id="request-date" {...(combined ? validation.props("date") : {})}
                    type="text"
                    value={dateOfRequest}
                    onChange={(e) => setDateOfRequest(e.target.value)}
                    className="workspace-control min-h-10 w-full pl-9 pr-3 text-sm"
                  />{combined && validation.message("date")}
                </div>
              </div>

              {/* Department */}
              <div className="space-y-1">
                <label htmlFor={combined ? validation.props("department").id : "request-department"} className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                  <span>Department</span>
                  <span className="text-rose-500">*</span>
                </label>
                <EditorInput
                  id="request-department" {...(combined ? validation.props("department") : {})}
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="workspace-control min-h-10 w-full px-3 text-sm"
                />{combined && validation.message("department")}
              </div>

              {/* Requester (read-only) */}
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-700">Requester name</p>
                <p className="rounded-lg bg-workspace px-3 py-2 text-sm text-workspace-ink">{currentUser.name}</p>
              </div>

              <div className="sm:col-span-2">
                <RequestCompanyField fieldProps={combined ? validation.props("company") : undefined} form={formName} value={originatingCompanyId} onChange={!connected || selectedScope === 'PEG' ? next => {
                  setChoices({});
                  if (connected && !combined) selectDraftCompany(next);
                  else setOriginatingCompanyId(next);
                } : undefined} />
                {combined && validation.message("company")}
              </div>
            </div>
          </div>

          {/* Section 2: Priority Selection */}
          <div className="space-y-3">
            <div className="pb-2 border-b border-[#E2E5E9]">
              <h2 id="request-priority" className="text-sm font-semibold text-workspace-ink">
                Priority
              </h2>
            </div>

            <div role="group" tabIndex={-1} aria-labelledby="request-priority" {...(combined ? validation.props("priority") : {})} className="grid grid-cols-3 gap-2">
              {(['Urgent', 'Medium', 'Low'] as PriorityLevel[]).map((level) => {
                const isSelected = priority === level;
                return (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setPriority(level)}
                    className={`workspace-control min-h-10 px-2 text-center text-sm font-semibold ${
                      isSelected
                        ? 'border-workspace-teal bg-workspace-tint text-workspace-teal'
                        : 'text-slate-700'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {validation.message("priority")}

          {/* Section 3: Work Description */}
          <div className="space-y-2">
            <div className="pb-2 border-b border-[#E2E5E9] flex items-center justify-between">
              <label htmlFor={combined ? validation.props("description").id : "request-work-description"} className="text-sm font-semibold text-workspace-ink">Work description</label>
            </div>

            <EditorTextarea
              id="request-work-description" {...(combined ? validation.props("description") : {})}
              rows={4}
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              placeholder="Describe the work you’re requesting."
              className="workspace-control w-full px-3 py-2 text-sm leading-relaxed"
            />{combined && validation.message("description")}
          </div>

          {combined && <section className="space-y-3 border-t border-slate-200 pt-4 text-sm">
            <label className="block font-semibold">Documents
              <EditorTextarea className="workspace-control mt-1 block w-full p-2 font-normal" placeholder="List the supporting documents, if any." maxLength={1000} value={documentDescription} onChange={event => setDocumentDescription(event.target.value)} />
            </label>
            <label className="editor-option">
              <input type="checkbox" checked={!!payment} onChange={event => setPayment(event.target.checked ? { amount: '', transferMode: 'Bank', purpose: 'Government Payment' } : undefined)} />
              Company payment required
            </label>
            {payment && <div data-slot="payment-fields" className="space-y-3 p-3">
              <label className="block">Amount (SAR)
                <EditorInput inputMode="decimal" className="mt-1 block w-full rounded border p-2" {...(combined ? validation.props("amount") : {})} value={payment.amount} onChange={event => setPayment({ ...payment, amount: event.target.value })} />{combined && validation.message("amount")}
              </label>
              <label className="block">Mode of transfer
                <EditorSelect className="mt-1 block w-full rounded border p-2" value={payment.transferMode} onChange={event => setPayment({ ...payment, transferMode: event.target.value as typeof payment.transferMode })}>
                  <option>Bank</option><option>Cash</option><option>Cheque</option>
                </EditorSelect>
              </label>
              <label className="block">Transfer details (optional)
                <EditorInput className="mt-1 block w-full rounded border p-2" maxLength={200} value={payment.transferDetails ?? ''} onChange={event => setPayment({ ...payment, transferDetails: event.target.value || undefined })} />
              </label>
              <label className="block">Purpose
                <EditorSelect className="mt-1 block w-full rounded border p-2" value={payment.purpose} onChange={event => setPayment({ ...payment, purpose: event.target.value as typeof payment.purpose })}>
                  <option>Government Payment</option><option>Advance Cash</option><option>Other</option>
                </EditorSelect>
              </label>
              {payment.purpose === 'Other' && <label className="block">Other purpose
                <EditorInput className="mt-1 block w-full rounded border p-2" maxLength={500} {...(combined ? validation.props("other") : {})} value={payment.otherPurpose ?? ''} onChange={event => setPayment({ ...payment, otherPurpose: event.target.value })} />{combined && validation.message("other")}
              </label>}
            </div>}
          </section>}
          {/* Section 4: Required Documents Checklist (9 Items) */}
          {!combined && <div className="space-y-3">
            <div className="pb-2 border-b border-[#E2E5E9] flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#192B3C]">
                4. Required Documents Checklist
              </h2>
              <span className="text-[11px] text-slate-400">Official PR#21-001FA Checklist</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                { key: 'onlineDocumentChamber', en: '1. Online Document Chamber' },
                { key: 'physicalDocumentChamber', en: '2. Physical Document Chamber' },
                { key: 'companyDocumentAjeer', en: '3. Company document Ajeer' },
                { key: 'employeeSalaryCertificate', en: '4. Employee Salary Certificate' },
                { key: 'permanentEmploymentVisa', en: '5. Permanent Employment Visa' },
                { key: 'workVisitVisa', en: '6. Work Visit Visa' },
                { key: 'businessVisitVisa', en: '7. Business Visit Visa' },
                { key: 'agencyWakala', en: '8. Agency Wakala' },
              ].map(({ key, en }) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-2.5 rounded border border-[#E2E5E9] hover:bg-[#F9FAFB] cursor-pointer"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-medium text-slate-800 text-xs truncate">{en}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(documents[key as keyof typeof documents])}
                    onChange={() => handleDocumentToggle(key as keyof typeof documents)}
                    className="rounded text-[#365C78] focus:ring-[#365C78] w-4 h-4 cursor-pointer"
                  />
                </label>
              ))}
            </div>

            {/* Item 9: Others */}
            <div className="p-2.5 rounded border border-[#E2E5E9] space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-slate-800">9. Others</span>
                <input
                  type="checkbox"
                  checked={documents.others}
                  onChange={() => handleDocumentToggle('others')}
                  className="rounded text-[#365C78] focus:ring-[#365C78] w-4 h-4 cursor-pointer"
                />
              </label>
              {documents.others && (
                <EditorInput
                  type="text"
                  placeholder="Specify other required documentation or letters..."
                  value={documents.othersDescription}
                  onChange={(e) =>
                    setDocuments((prev) => ({ ...prev, othersDescription: e.target.value }))
                  }
                  className="w-full px-2.5 py-1 text-xs border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
                />
              )}
            </div>
          </div>

          }
          <SupportingFiles title="Attachments" files={attachments} maxFiles={20} busy={pendingUploads > 0}
            error={attachmentError} onSelect={handleFileUpload} onRemove={index => {
              handleRemoveAttachment(attachments[index].id);
              setAttachmentError('');
            }} />
          {combined && <SignerChoices form="Administrative & Payment Request" workflow={signingWorkflow} companySelected={canStartSelectedCompany} users={users} requester={currentUser} value={choices} onChange={setChoices} />}
        </fieldset>

        {/* Right Column: Live A4 Document Preview */}
        <div
          className="editor-preview space-y-3"
        >
          {/* Document Preview Toolbar */}
          <div className="workspace-panel no-print sticky top-16 z-10 flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#192B3C] flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#365C78]" />
                <span>Live A4 Preview</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                190mm × 277mm
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(75, z - 10))}
                className="p-1 rounded text-slate-500 hover:bg-slate-100"
                title="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-slate-600 tabular-nums px-1">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                className="p-1 rounded text-slate-500 hover:bg-slate-100"
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={handlePrint}
                className="p-1 rounded text-slate-600 hover:bg-slate-100 flex items-center gap-1 text-xs"
                title="Print official document"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Print</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1 rounded text-slate-500 hover:bg-slate-100"
                title={isFullscreen ? 'Exit full screen' : 'Expand full screen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Printable / Preview Area with zoom scale */}
          <div
            className={`printable-area overflow-auto rounded-lg bg-slate-200/80 p-2 sm:p-4 border border-[#E2E5E9] flex items-start justify-center ${
              isFullscreen ? 'fixed inset-2 sm:inset-4 z-50 bg-slate-900/80 p-4 sm:p-8' : ''
            }`}
          >
            <div
              style={{
                zoom: zoomLevel / 100,
              }}
              className="w-full flex justify-center"
            >
              {combined ? <AdministrativePaymentDocument data={{ ...previewData, priority }} /> : <AdminWorkRequestDocument data={previewData} isPrintMode={false} />}
            </div>
          </div>
        </div>
      </div>

      {/* Signature Confirmation Modal */}
      {(
        <SignatureModal
          isOpen={signatureModalOpen}
          onClose={() => setSignatureModalOpen(false)}
          user={currentUser}
          title={`Sign & Submit ${formName}`}
          confirmLabel="Apply Signature & Submit"
          noteLabel="Note to signers"
          onConfirm={handleConfirmedSubmit}
        />
      )}
    </div>
  );
};
