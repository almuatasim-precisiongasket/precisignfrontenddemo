import React, { useState, useEffect, useRef } from 'react';
import { ApiError } from '../../services/apiTypes';
import { useApp } from '../../context/AppContext';
import { AdminWorkFormData, PriorityLevel, AttachmentItem, CompanyId } from '../../types/index';
import { AdminWorkRequestDocument } from '../document/AdminWorkRequestDocument';
import { AdministrativePaymentDocument } from '../document/AdministrativePaymentDocument';
import { SignatureModal } from '../modals/SignatureModal';
import { canAdministerWorkflows, resolveConfiguredSigner } from '../../utils/workflowAdministration';
import { applySignerChoices, type SignerChoices as Choices } from '../../utils/signingSelection';
import { SignerChoices } from './SignerChoices';
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
  Paperclip,
  Upload,
  Trash2,
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

  const [priority, setPriority] = useState<PriorityLevel>(
    (draftFormData?.priority as PriorityLevel) || 'Urgent'
  );

  const [workDescription, setWorkDescription] = useState(
    draftFormData?.workDescription ??
      (connected ? '' : 'Attestation of commercial contract with Ministry of Commerce & Chamber of Commerce for the new facility expansion project.')
  );

  const [documents, setDocuments] = useState(
    draftFormData?.documents || {
      onlineDocumentChamber: true,
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
  const savedGeneration = useRef(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'editor' | 'preview'>('editor');

  const resolvedCompany = companies.find((c) => c.id === originatingCompanyId) || selectedCompany;
  const signingWorkflow = workflows.find(workflow => workflow.companyId === originatingCompanyId && workflow.formType === formName);
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
    requesterId: currentUser.id,
    requesterName: currentUser.name,
    department,
    priority,
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setPendingUploads(count => count + files.length);
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const sizeFormatted =
          file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.round(file.size / 1024)} KB`;

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
      reader.onerror = () => { setPendingUploads(count => count - 1); setValidationError(`Could not read ${file.name}. Please select it again.`); };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleClear = async () => {
    if (confirm('Are you sure you want to clear the form entries?')) {
      try {
        if (!combined) await clearDraft();
      } catch (error) {
        setValidationError(`Draft could not be cleared: ${error instanceof Error ? error.message : 'storage error'}`);
        return;
      }
      setWorkDescription('');
      setDocumentDescription('');
      setPayment(undefined);
      setAttachments([]);
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
    }
  };

  const handleTriggerSubmit = () => {
    if (submitting.current || pendingUploads) return;
    setValidationError(null);
    if (!workDescription.trim()) {
      setValidationError('Please enter a work description before submitting.');
      return;
    }
    if (combined) {
      const selection = signingWorkflow && applySignerChoices(signingWorkflow, users, currentUser.id, choices);
      if (!selection || selection.error) {
        setValidationError(selection?.error ?? 'Ask your administrator to configure a signing route for this form.');
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

  const handleConfirmedSubmit = async (signatureDataUrl: string) => {
    if (submitting.current) return;
    submitting.current = true; setSubmittingNow(true);
    const result = await submitNewRequest(
      previewData,
      attachments,
      attachments.length > 0
        ? `Request submitted with ${attachments.length} attachment(s).`
        : 'Official request submitted.',
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
    <div className="request-create p-3.5 sm:p-6 md:p-8 max-w-[1600px] mx-auto space-y-4 sm:space-y-6">
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
            onClick={handleClear}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors enabled:hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365C78] disabled:opacity-60"
          >
            Clear Form
          </button>

          <button
            type="button"
            disabled={submittingNow || pendingUploads > 0 || (combined && !signingWorkflow)}
            onClick={handleTriggerSubmit}
            className="workspace-primary flex min-h-10 items-center gap-2 px-4 py-2 text-sm"
          >
            <Send aria-hidden="true" className="size-4" />
            <span>Sign &amp; Submit Request</span>
          </button>
        </div>
      </div>

      {combined && !signingWorkflow && <div role="status" className="no-print rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        This company needs a signing route before you can submit.
        {canAdministerWorkflows(currentUser) ? <button type="button" className="ml-2 font-semibold underline" onClick={() => setActiveView('workflow-settings')}>Open signing routes</button> : ' Ask a workflow administrator to set one up.'}
      </div>}

      {/* Mobile view toggle */}
      <div className="no-print lg:hidden flex border-b border-[#E2E5E9] bg-white rounded-md p-1 gap-1">
        <button
          onClick={() => setActiveMobileTab('editor')}
          aria-pressed={activeMobileTab === 'editor'}
          className={`flex-1 py-1.5 text-xs font-semibold rounded ${
            activeMobileTab === 'editor'
              ? 'bg-[#365C78] text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Form Editor
        </button>
        <button
          onClick={() => setActiveMobileTab('preview')}
          aria-pressed={activeMobileTab === 'preview'}
          className={`flex-1 py-1.5 text-xs font-semibold rounded ${
            activeMobileTab === 'preview'
              ? 'bg-[#365C78] text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Live A4 Preview
        </button>
      </div>

      {/* Alerts */}
      {draftSaveError && <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 space-y-2"><p>{draftSaveError}</p><button disabled={draftSaving} className="underline mr-3" onClick={retrySave}>Retry draft save</button>{connected && <button className="underline" onClick={() => { if (confirm('Load the server draft and replace the entries shown here?')) reloadDraft(); }}>Load saved draft</button>}</div>}
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

      {combined ? <SignerChoices workflow={signingWorkflow} users={users} requester={currentUser} value={choices} onChange={setChoices} /> : <section className="no-print rounded-lg border border-slate-200 bg-white p-4 text-sm" aria-label="PreciRoute signers">
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Focused Form Editor */}
        <fieldset disabled={submittingNow}
          className={`workspace-panel no-print lg:col-span-6 space-y-6 p-4 sm:p-6 ${
            activeMobileTab === 'preview' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Section 1: Entity & Requester Details */}
          <div className="space-y-4">
            <div className="pb-2 border-b border-[#E2E5E9] flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#192B3C]">
                1. Entity &amp; Requester Details
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>Date of Request</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={dateOfRequest}
                    onChange={(e) => setDateOfRequest(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#E2E5E9] rounded-md focus:outline-none focus:ring-1 focus:ring-[#365C78]"
                  />
                </div>
              </div>

              {/* Department */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>Department</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-[#E2E5E9] rounded-md focus:outline-none focus:ring-1 focus:ring-[#365C78]"
                />
              </div>

              {/* Requester (read-only) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Requester Name</label>
                <input
                  type="text"
                  value={currentUser.name}
                  disabled
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 bg-slate-50 text-slate-600 rounded-md cursor-not-allowed"
                />
              </div>

              {/* Originating Group Company Select */}
              <div className="space-y-1 sm:col-span-2 bg-[#F5F6F8] p-3 rounded-md border border-[#E2E5E9]">
                <label className="text-xs font-bold text-[#192B3C] flex items-center justify-between">
                  <span>Request company *</span>
                  {selectedScope === 'PEG' && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-semibold">
                      Group View Active
                    </span>
                  )}
                </label>
                <select
                  value={originatingCompanyId}
                  onChange={(e) => { setChoices({}); if (connected) selectDraftCompany(e.target.value as CompanyId); else setOriginatingCompanyId(e.target.value as CompanyId); }}
                  className="w-full px-3 py-1.5 text-xs font-semibold text-[#192B3C] border border-[#CBD5E1] rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#365C78]"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Requests created in PreciSign belong to specific legal subsidiary entities.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Priority Selection */}
          <div className="space-y-3">
            <div className="pb-2 border-b border-[#E2E5E9]">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#192B3C]">
                2. Priority &amp; Turnaround Time
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(['Urgent', 'Medium', 'Low'] as PriorityLevel[]).map((level) => {
                const isSelected = priority === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setPriority(level)}
                    className={`p-3 rounded-md border text-left transition-all ${
                      isSelected
                        ? 'border-[#365C78] bg-[#EBF2F7] text-[#192B3C] ring-1 ring-[#365C78]'
                        : 'border-[#E2E5E9] hover:bg-[#F9FAFB] text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">{level}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {level === 'Urgent'
                        ? 'Immediate / < 1 hour'
                        : level === 'Medium'
                        ? 'Within 3 days'
                        : 'Within 7 days'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Work Description */}
          <div className="space-y-2">
            <div className="pb-2 border-b border-[#E2E5E9] flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#192B3C]">
                3. Work Description
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">
                {workDescription.length} characters
              </span>
            </div>

            <textarea
              rows={4}
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              placeholder="State the detailed administrative request, justification, and vendor or authority details..."
              className="w-full px-3 py-2 text-xs border border-[#E2E5E9] rounded-md focus:outline-none focus:ring-1 focus:ring-[#365C78] focus:border-[#365C78] leading-relaxed"
            />
          </div>

          {combined && <section className="space-y-3 border-t border-slate-200 pt-4 text-sm">
            <label className="block">Supporting documents
              <textarea className="mt-1 block w-full rounded border p-2" maxLength={1000} value={documentDescription} onChange={event => setDocumentDescription(event.target.value)} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!payment} onChange={event => setPayment(event.target.checked ? { amount: '', transferMode: 'Bank', purpose: 'Government Payment' } : undefined)} />
              Company payment required
            </label>
            {payment && <>
              <label className="block">Amount (SAR)
                <input inputMode="decimal" className="mt-1 block w-full rounded border p-2" value={payment.amount} onChange={event => setPayment({ ...payment, amount: event.target.value })} />
              </label>
              <label className="block">Mode of transfer
                <select className="mt-1 block w-full rounded border p-2" value={payment.transferMode} onChange={event => setPayment({ ...payment, transferMode: event.target.value as typeof payment.transferMode })}>
                  <option>Bank</option><option>Cash</option><option>Cheque</option>
                </select>
              </label>
              <label className="block">Transfer details (optional)
                <input className="mt-1 block w-full rounded border p-2" maxLength={200} value={payment.transferDetails ?? ''} onChange={event => setPayment({ ...payment, transferDetails: event.target.value || undefined })} />
              </label>
              <label className="block">Purpose
                <select className="mt-1 block w-full rounded border p-2" value={payment.purpose} onChange={event => setPayment({ ...payment, purpose: event.target.value as typeof payment.purpose })}>
                  <option>Government Payment</option><option>Advance Cash</option><option>Other</option>
                </select>
              </label>
              {payment.purpose === 'Other' && <label className="block">Other purpose
                <input className="mt-1 block w-full rounded border p-2" maxLength={500} value={payment.otherPurpose ?? ''} onChange={event => setPayment({ ...payment, otherPurpose: event.target.value })} />
              </label>}
            </>}
          </section>}
          {/* Section 4: Required Documents Checklist (9 Items) */}
          <div className="space-y-3">
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
                <input
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

          {/* Section 5: Supporting Attachments */}
          <div className="space-y-3">
            <div className="pb-2 border-b border-[#E2E5E9] flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#192B3C]">
                5. Attachments ({attachments.length})
              </h2>
            </div>

            <div className="border border-dashed border-[#CBD5E1] rounded-md p-4 text-center hover:bg-[#F9FAFB] transition-colors">
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload-input"
              />
              <label htmlFor="file-upload-input" className="cursor-pointer space-y-1 block">
                <Upload className="w-5 h-5 mx-auto text-[#365C78]" />
                <span className="text-xs font-semibold text-[#365C78] hover:underline block">
                  Click to upload attachments
                </span>
                <span className="text-[10px] text-slate-400 block">PDF, PNG, JPG</span>
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2 rounded bg-[#F5F6F8] border border-[#E2E5E9] text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-medium text-[#192B3C] truncate">{att.name}</span>
                      <span className="text-[10px] text-slate-400">({att.sizeFormatted})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      title="Remove attachment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </fieldset>

        {/* Right Column: Live A4 Document Preview */}
        <div
          className={`lg:col-span-6 space-y-3 ${
            activeMobileTab === 'editor' ? 'hidden lg:block' : 'block'
          }`}
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
              {combined ? <AdministrativePaymentDocument data={previewData} /> : <AdminWorkRequestDocument data={previewData} isPrintMode={false} />}
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
          onConfirm={handleConfirmedSubmit}
        />
      )}
    </div>
  );
};
