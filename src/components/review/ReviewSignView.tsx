import React, { useState, useRef } from 'react';
import { canAdministerWorkflows } from '../../utils/workflowAdministration';
import { canCompleteWithOutstandingSteps, configuredReplacementIds, usesConfiguredBackups } from '../../utils/routeReplacement';
import { canUserAccessCompany } from '../../utils/companyAccess';
import { needsProcessingAction } from '../../utils/routeProcessing';
import { useApp } from '../../context/AppContext';
import { AdminWorkFormData, AttachmentItem } from '../../types/index';
import { RequestDocument } from '../document/RequestDocument';
import { RouteProcessingPanel } from './RouteProcessingPanel';
import { FinanceHoldPanel } from './FinanceHoldPanel';
import { FinancialCorrectionFields } from './FinancialCorrectionFields';
import { SignatureModal } from '../modals/SignatureModal';
import { DocuSignProgressBanner } from './DocuSignProgressBanner';
import { ApprovalJourneyPanel } from '../journey/ApprovalJourneyPanel';
import {
  FileText,
  Clock,
  Printer,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  Send,
  Eye,
  ShieldAlert,
  Paperclip,
  RotateCcw,
  History,
  Check,
  AlertCircle,
  ShieldCheck,
  Building2,
  Download,
} from 'lucide-react';

export const ReviewSignView: React.FC = () => {
  const {
    selectedRequestId,
    companyRequests,
    currentUser,
    approveRequest,
    returnRequest,
    rejectRequestAction,
    directorOverrideAction,
    cancelRoute,
    replaceSigner,
    acceptReplacement,
    readLatestRoute,
    downloadDocumentPdf,
    users,
    resubmitRequest,
    setActiveView,
    selectedCompany,
  } = useApp();

  // Find active request
  const request = companyRequests.find((r) => r.id === selectedRequestId);

  const [selectedVersion, setSelectedVersion] = useState<number>(request ? request.documentVersion : 1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureAction, setSignatureAction] = useState<'approve' | 'resubmit' | 'override'>('approve');
  const [actionModal, setActionModal] = useState<'return' | 'reject' | 'cancel' | 'override' | 'resubmit' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [replacementStage, setReplacementStage] = useState('');
  const [replacementUser, setReplacementUser] = useState('');
  const [replacementReason, setReplacementReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const savingReason = useRef(false);
  const signingRecordTime = useRef<string | null>(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'actions' | 'timeline' | 'attachments'>('actions');
  const [mobileViewTab, setMobileViewTab] = useState<'document' | 'sidebar'>(() => {
    const canCorrect = request?.status === 'Returned for Correction' && request.requesterId === currentUser.id;
    const canRespond = request?.status === 'Pending Approval' && request.pendingReplacement?.newUserId === currentUser.id;
    return request && (canCorrect || canRespond || needsProcessingAction(request, currentUser)) ? 'sidebar' : 'document';
  });

  // Full correction form state if resubmitting
  const [correctedForm, setCorrectedForm] = useState<AdminWorkFormData>(request ? request.formData : ({} as any));
  const [correctedAttachments, setCorrectedAttachments] = useState<AttachmentItem[]>(request?.attachments || []);
  const [resubmitChangeNote, setResubmitChangeNote] = useState('');

  if (!request) {
    return (
      <div className="p-12 text-center space-y-4">
        <div className="text-slate-500 text-sm">The selected request is unavailable in the current company view.</div>
        <button
          onClick={() => setActiveView('dashboard')}
          className="px-4 py-2 bg-[#365C78] text-white rounded-md text-xs font-semibold"
        >
          Back to requests
        </button>
      </div>
    );
  }

  const financialRequest = (request.formType === 'Cash Voucher' && !!request.formData.cashVoucher)
    || (request.formType === 'Expense Claim' && !!request.formData.expenseClaim);
  if (request.formType !== 'Admin Work Request' && request.formType !== 'Administrative & Payment Request' && !(request.formType === 'IT Request' && request.formData.itRequest) && !financialRequest) {
    return (
      <div className="p-12 text-center space-y-4">
        <div className="text-slate-500 text-sm">The {request.formType} document is not available for review yet.</div>
        <button onClick={() => setActiveView('dashboard')} className="px-4 py-2 bg-[#365C78] text-white rounded-md text-xs font-semibold">
          Back to requests
        </button>
      </div>
    );
  }

  // Active form data according to selected version
  const activeFormData =
    selectedVersion === request.documentVersion
      ? request.formData
      : request.versionSnapshots.find((v) => v.version === selectedVersion)?.formData || request.formData;
  const visibleAttachments = selectedVersion === request.documentVersion
    ? request.attachments
    : request.attachmentVersions?.find(snapshot => snapshot.version === selectedVersion)?.attachments;
  const submission = request.approvalHistory.find(event => event.action === 'Submitted' && event.version === selectedVersion);
  const submissionNote = submission?.comments?.replace(/^Resubmitted: /, '').trim();
  const showSubmissionNote = submissionNote && !/^(Request submitted\.|Official request submitted\.|Request submitted with \d+ attachment\(s\)\.|Resubmitted Version \d+)$/.test(submissionNote);

  const currentStep = request.approvalSteps[request.currentStageIndex];
  const isAssignedApprover =
    request.status === 'Pending Approval' && currentStep?.assignedUserId === currentUser.id;
  const isRequester = request.requesterId === currentUser.id;
  const isDirector = currentUser.role === 'Director';
  const isFinalApprover = request.approvalSteps.at(-1)?.assignedUserId === currentUser.id;
  const finalAlreadySigned = request.approvalSteps.at(-1)?.status === 'Approved';
  const isReturned = request.status === 'Returned for Correction';
  const canSign = request.status === 'Pending Approval' && !isRequester && (isAssignedApprover || (isFinalApprover && !finalAlreadySigned));
  const configuredBackups = usesConfiguredBackups(request);
  const replacementCandidates = replacementStage ? users.filter(user =>
    user.id !== request.requesterId && canUserAccessCompany(user, request.companyId) &&
    !request.approvalSteps.some(step => step.assignedUserId === user.id) &&
    (!configuredBackups || configuredReplacementIds(request, replacementStage).includes(user.id))
  ) : [];
  const replaceableSteps = request.approvalSteps.filter((step, index) =>
    !['Approved', 'Bypassed', 'Rejected'].includes(step.status) &&
    (index !== request.approvalSteps.length - 1 || currentUser.canReplaceFinalApprover)
  );
  const canOverride = request.status === 'Pending Approval' && isFinalApprover && !isRequester
    && canCompleteWithOutstandingSteps(request, currentUser.id);

  const handleCopyId = () => {
    navigator.clipboard?.writeText(request.id);
    setActionSuccess('Request ID copied to clipboard');
    setTimeout(() => setActionSuccess(null), 2500);
  };

  const handleDownloadPdf = async () => {
    if (!downloadDocumentPdf || downloadingPdf) return;
    setDownloadingPdf(true);
    setActionError(null);
    try {
      const pdf = await downloadDocumentPdf(request.id, selectedVersion, request.updatedAt);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${request.id}-v${selectedVersion}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not download PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadAttachment = async (att: any) => {
    try {
      const latest = await readLatestRoute(request.id);
      if (!latest) throw new Error('Route unavailable.');
      const files = selectedVersion === latest.documentVersion ? latest.attachments : latest.attachmentVersions?.find(v => v.version === selectedVersion)?.attachments;
      const authorized = files?.find(file => file.id === att.id);
      if (!authorized) throw new Error('Attachment unavailable in this version.');
      att = authorized;
    } catch { setActionError('Could not verify current access to this attachment.'); return; }
    if (att.dataUrl) {
      const a = document.createElement('a');
      a.href = att.dataUrl;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setActionSuccess(`Downloaded ${att.name}`);
      setTimeout(() => setActionSuccess(null), 3000);
    } else {
      setActionSuccess(`Reference attachment: ${att.name} (${att.sizeFormatted})`);
      setTimeout(() => setActionSuccess(null), 3000);
    }
  };

  const handleApproveClick = () => {
    setActionError(null);
    if (!canSign) {
      setActionError(`Unauthorized: Stage is assigned to ${currentStep?.assignedUserName}.`);
      return;
    }
    setSignatureAction('approve');
    signingRecordTime.current = request.updatedAt; setSignatureModalOpen(true);
  };

  const handleConfirmedApproval = async (signatureDataUrl: string, note?: string) => {
    const result = await approveRequest(request.id, note, signatureDataUrl);
    if (result.success) {
      setActionSuccess('Request stage approved and signature recorded.');
      setTimeout(() => setActionSuccess(null), 3500);
    } else {
      setActionError(result.error || 'Failed to approve request');
    }
    return result;
  };

  const handleReturnSubmit = async () => {
    if (savingReason.current) return;
    if (!actionReason.trim()) {
      setActionError('Reason is required to return document for correction.');
      return;
    }
    savingReason.current = true; setSaving(true); setActionError(null);
    const result = await returnRequest(request.id, actionReason.trim());
    savingReason.current = false; setSaving(false);
    if (result.success) {
      setActionModal(null);
      setActionReason('');
      setActionSuccess('Request returned to requester for correction.');
      setTimeout(() => setActionSuccess(null), 3500);
    } else {
      setActionError(result.error || 'Failed to return request');
    }
  };

  const handleRejectSubmit = async () => {
    if (savingReason.current) return;
    if (!actionReason.trim()) {
      setActionError('Reason is required to reject request.');
      return;
    }
    savingReason.current = true; setSaving(true); setActionError(null);
    const result = await (actionModal === 'cancel' ? cancelRoute : rejectRequestAction)(request.id, actionReason.trim());
    savingReason.current = false; setSaving(false);
    if (result.success) {
      setActionModal(null);
      setActionReason('');
      setActionSuccess(actionModal === 'cancel' ? 'PreciRoute cancelled.' : 'Request formally rejected and archived.');
      setTimeout(() => setActionSuccess(null), 3500);
    } else {
      setActionError(result.error || 'Failed to reject request');
    }
  };

  const handleDirectorOverrideSubmit = async (signatureDataUrl: string) => {
    if (savingReason.current) return { success: false, error: "Save already in progress." };
    if (!actionReason.trim()) {
      setActionError('A reason is required to bypass outstanding signers.');
      return;
    }
    savingReason.current = true; setSaving(true);
    const result = await directorOverrideAction(request.id, actionReason.trim(), signatureDataUrl);
    savingReason.current = false; setSaving(false);
    if (result.success) {
      setActionModal(null);
      setActionReason('');
      setActionSuccess('PreciRoute completed by the final approver.');
      setTimeout(() => setActionSuccess(null), 3500);
    } else {
      setActionError(result.error || 'Route completion failed');
    }
    return result;
  };

  const handleResubmitSubmit = async (signatureDataUrl: string) => {
    const result = await resubmitRequest(
      request.id,
      correctedForm,
      resubmitChangeNote.trim(),
      signatureDataUrl,
      correctedAttachments
    );
    if (result.success) {
      setActionModal(null);
      setActionSuccess('Corrected document resubmitted. Workflow restarted at Stage 1.');
      setSelectedVersion(request.documentVersion + 1);
      setTimeout(() => setActionSuccess(null), 3500);
    } else {
      setActionError(result.error || 'Resubmission failed');
    }
    return result;
  };

  return (
    <div className="request-review p-3 sm:p-4 md:p-6 max-w-[1680px] mx-auto space-y-3 sm:space-y-4">
      {/* Top Breadcrumb & Metadata Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E5E9] no-print">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            onClick={() => setActiveView('dashboard')}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 border border-[#CBD5E1] bg-white hover:bg-[#F5F6F8] text-slate-700 rounded-md text-xs font-semibold transition-colors shadow-xs shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Inbox</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-[#192B3C]">{request.id}</span>
              <button
                onClick={handleCopyId}
                className="text-slate-400 hover:text-[#365C78]"
                title="Copy Request ID"
              >
                <Copy className="w-3 h-3" />
              </button>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  request.status === 'Approved'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : request.status === 'Returned for Correction'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : request.status === 'Rejected'
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-sky-50 text-sky-800 border-sky-200'
                }`}
              >
                {request.status === 'Approved' ? 'Signing completed' : request.status}
              </span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">
              <span>{request.formType}{request.formType === 'Admin Work Request' && ' (PR#21-001FA)'}</span>
              <span className="mx-1.5">·</span>
              <span>Submitted by {request.requesterName} ({request.department})</span>
            </div>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="lg:hidden flex border border-[#E2E5E9] bg-white rounded-md p-0.5 text-xs w-full sm:w-auto">
          <button
            onClick={() => setMobileViewTab('document')}
            aria-pressed={mobileViewTab === 'document'}
            className={`flex-1 sm:flex-none px-3 py-1.5 font-semibold rounded transition-colors ${
              mobileViewTab === 'document' ? 'bg-[#365C78] text-white shadow-xs' : 'text-slate-600'
            }`}
          >
            Document View
          </button>
          <button
            onClick={() => setMobileViewTab('sidebar')}
            aria-pressed={mobileViewTab === 'sidebar'}
            className={`flex-1 sm:flex-none px-3 py-1.5 font-semibold rounded transition-colors ${
              mobileViewTab === 'sidebar' ? 'bg-[#365C78] text-white shadow-xs' : 'text-slate-600'
            }`}
          >
            Approval Controls
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {actionError && !actionModal && (
        <div className="no-print p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-xs text-rose-600 font-bold">
            ✕
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="no-print p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-xs text-emerald-600 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* DocuSign-Style Recipient Tracking & Stepper Banner */}
      <div className="no-print">
        <DocuSignProgressBanner
          request={request}
          currentUserId={currentUser.id}
          isAssignedApprover={canSign}
          onSignClick={handleApproveClick}
        />
      </div>

      {showSubmissionNote && <section aria-label="Note to signers" className="no-print rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Note to signers</h2>
        <p className="mt-1 text-xs text-slate-600">{submission?.actionByName} · Version {selectedVersion}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{submissionNote}</p>
      </section>}

      {/* Split Layout: 62% Document Focus + 38% Approval Controls on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ================= LEFT: ORIGINAL A4 DOCUMENT (62%) ================= */}
        <div
          className={`lg:col-span-7 xl:col-span-8 space-y-3 ${
            mobileViewTab === 'sidebar' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Document Controls Strip: Version Tabs + Zoom + Fullscreen + Print */}
          <div className="workspace-panel no-print sticky top-16 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            {/* Version Switcher */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium text-[11px]">Version:</span>
              <button
                onClick={() => setSelectedVersion(1)}
                className={`px-2 py-0.5 rounded text-xs font-mono font-semibold transition-colors ${
                  selectedVersion === 1
                    ? 'bg-[#192B3C] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                v1.0 {request.documentVersion === 1 ? '(Current)' : '(Original)'}
              </button>
              {[...new Set([...request.versionSnapshots.map(snapshot => snapshot.version), request.documentVersion])].filter(version => version > 1).sort((a, b) => a - b).map(version => (
                <button
                  key={version}
                  onClick={() => setSelectedVersion(version)}
                  className={`px-2 py-0.5 rounded text-xs font-mono font-semibold transition-colors ${
                    selectedVersion === version
                      ? 'bg-[#192B3C] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  v{version}.0 {version === request.documentVersion ? '(Current)' : ''}
                </button>
              ))}
            </div>

            {/* Display tools */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 border border-[#E2E5E9] rounded px-1.5 py-0.5 bg-slate-50">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                  className="p-1 rounded text-slate-500 hover:bg-slate-200"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono font-semibold text-slate-600 px-1 tabular-nums">
                  {zoomLevel}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                  className="p-1 rounded text-slate-500 hover:bg-slate-200"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={async () => { try { const latest = await readLatestRoute(request.id); if (!latest || latest.updatedAt !== request.updatedAt) { setActionError('The route changed. Reload and review before printing.'); return; } window.print(); } catch { setActionError('Could not verify current access before printing.'); } }}
                className="flex items-center gap-1 px-2.5 py-1 border border-[#CBD5E1] bg-white hover:bg-slate-50 rounded text-xs font-medium text-slate-700 shadow-xs"
                title="Print Official A4 Document"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Print</span>
              </button>
              {downloadDocumentPdf && <button type="button" onClick={handleDownloadPdf} disabled={downloadingPdf}
                className="flex items-center gap-1 px-2.5 py-1 border border-[#CBD5E1] bg-white hover:bg-slate-50 rounded text-xs font-medium text-slate-700 shadow-xs disabled:opacity-50">
                <Download className="w-3.5 h-3.5" />
                <span>{downloadingPdf ? 'Preparing PDF…' : 'Download PDF'}</span>
              </button>}

              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 border border-[#CBD5E1] bg-white hover:bg-slate-50 rounded text-slate-600 shadow-xs"
                title={isFullscreen ? 'Exit Full Screen' : 'Expand Full Screen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Document Render Container */}
          <div
            className={`printable-area overflow-auto rounded-lg bg-slate-200/80 p-2 sm:p-4 border border-[#E2E5E9] flex items-start justify-center ${
              isFullscreen ? 'fixed inset-2 z-50 bg-slate-900/90 p-4 sm:p-8 max-h-none' : ''
            }`}
          >
            {isFullscreen && (
              <button
                onClick={() => setIsFullscreen(false)}
                className="fixed top-4 right-4 z-50 px-3 py-1.5 bg-[#192B3C] text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-lg"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Close Full Screen</span>
              </button>
            )}

            <div
              style={{
                zoom: zoomLevel / 100,
              }}
              className="document-preview-page w-full flex items-start justify-center"
            >
              <RequestDocument
                formType={request.formType}
                data={activeFormData}
                attachments={visibleAttachments}
                processing={selectedVersion === request.documentVersion ? request.processing : undefined}
              />
            </div>
          </div>
        </div>

        {/* ================= RIGHT: APPROVAL & AUDIT CONTROLS (38%) ================= */}
        <div
          className={`lg:col-span-5 xl:col-span-4 space-y-4 no-print ${
            mobileViewTab === 'document' ? 'hidden lg:block' : 'block'
          }`}
        >
          <RouteProcessingPanel key={request.id} request={request} />
          <FinanceHoldPanel key={`finance-${request.id}`} request={request} />
          {!!request.omittedSigningSteps?.length && <p className="rounded border bg-white p-3 text-xs">Signatures not requested: {request.omittedSigningSteps.join(', ')}</p>}
          {/* 1. Primary Approval Action Box */}
          <div className="workspace-panel space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#192B3C]">
                  Workflow Action
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Current Stage: <span className="font-semibold text-slate-800">{currentStep?.stageName || 'Completed'}</span>
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                Stage {request.currentStageIndex + 1} of {request.approvalSteps.length}
              </span>
            </div>

            {/* Authorization Scenarios */}
            {request.status === 'Approved' ? (
              <div className="p-3 bg-emerald-50 rounded-md border border-emerald-200 text-xs text-emerald-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Document Fully Approved &amp; Archived</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  The request has completed its approval workflow.
                </p>
              </div>
            ) : request.status === 'Cancelled' ? (<div className="p-3 border rounded text-xs">PreciRoute cancelled. No further signing is allowed.</div>) : request.status === 'Rejected' ? (
              <div className="p-3 bg-rose-50 rounded-md border border-rose-200 text-xs text-rose-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>Request Formally Rejected</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  This document has been rejected and closed in the workflow register.
                </p>
              </div>
            ) : isReturned ? (
              <div className="p-3.5 bg-amber-50 rounded-md border border-amber-200 text-xs text-amber-900 space-y-3">
                <div className="flex items-center gap-1.5 font-bold">
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                  <span>Returned for Requester Correction</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {[...request.approvalHistory].reverse().find((h) => h.action === 'Returned for Correction')?.comments
                    ? `Feedback: "${[...request.approvalHistory].reverse().find((h) => h.action === 'Returned for Correction')?.comments}"`
                    : 'The approver requested corrections on this document.'}
                </p>
                {isRequester ? (
                  <button
                    onClick={() => {
                      setActionModal('resubmit');
                    }}
                    className="workspace-primary min-h-10 w-full px-3 py-2 text-xs"
                  >
                    Edit &amp; Resubmit Corrected Document
                  </button>
                ) : (
                  <div className="text-[10px] text-amber-700 italic">
                    Awaiting resubmission by original requester ({request.requesterName}).
                  </div>
                )}
              </div>
            ) : (canSign || canOverride) ? (
              /* ACTIVE ASSIGNED APPROVER ACTIONS */
              <div className="space-y-3">
                <div className="space-y-2 pt-1">
                  {/* Approve & Sign Button */}
                  <button
                    onClick={handleApproveClick}
                    disabled={!canSign}
                    className="workspace-primary flex min-h-10 w-full items-center justify-center gap-2 px-4 text-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>Sign</span>
                  </button>

                  {canOverride && <button onClick={() => setActionModal('override')} className="workspace-control min-h-10 w-full px-3 text-xs font-semibold">{finalAlreadySigned ? 'Complete Route' : 'Sign & Complete'}</button>}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Return for Correction Button */}
                    <button
                      onClick={() => { setActionError(null); setActionReason(''); setActionModal('return'); }}
                      disabled={!isFinalApprover && !request.workflowConfig.stages[request.currentStageIndex]?.canReturnForCorrection}
                      className="py-2 px-3 border border-amber-300 bg-amber-50/60 hover:bg-amber-100/60 text-amber-800 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Return</span>
                    </button>

                    {/* Reject Button */}
                    <button
                      onClick={() => setActionModal('reject')}
                      disabled={!isFinalApprover && !request.workflowConfig.stages[request.currentStageIndex]?.canReject}
                      className="py-2 px-3 border border-rose-300 bg-rose-50/60 hover:bg-rose-100/60 text-rose-800 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* READ-ONLY / UNAUTHORIZED SCENARIO */
              <div className="p-3 bg-slate-50 rounded-md border border-[#E2E5E9] text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">Read-Only Mode</div>
                <p className="text-[11px] leading-relaxed">
                  Stage {request.currentStageIndex + 1} is assigned to{' '}
                  <strong className="text-slate-900">{currentStep?.assignedUserName}</strong> ({currentStep?.assignedRole}).
                  Only the assigned approver may approve this stage. The assigned final approver may sign early or complete this route.
                </p>
              </div>
            )}
          </div>

          {isRequester && ['Pending Approval','Returned for Correction'].includes(request.status) && <button className="w-full py-2 border rounded text-xs" onClick={() => setActionModal('cancel')}>Cancel PreciRoute</button>}
          {request.status === 'Approved' && <button className="w-full py-2 border rounded text-xs" onClick={async () => {
            let latest; try { latest = await readLatestRoute(request.id); } catch { setActionError('Could not verify access to the route summary.'); return; }
            if (!latest || latest.status !== 'Approved') { setActionError('Completed route unavailable.'); return; }
            const record = latest;
            const lines = ['PreciRoute Summary', record.id, `Company: ${record.companyId}`, `Document version: ${record.documentVersion}`, `Status: Completed`, '', ...record.approvalSteps.map(step => `${step.stageName}: ${step.assignedUserName} — ${step.status} — ${step.actionDate || ''}`), '', 'History', ...record.approvalHistory.map(event => `${event.dateTime} | v${event.version} | ${event.actionByName} | ${event.action} | ${event.comments || ''}`)];
            const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
            const link = document.createElement('a'); link.href = url; link.download = `${record.id}-route-summary.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>Download Route Summary</button>}
          {request.status === 'Pending Approval' && request.pendingReplacement?.newUserId === currentUser.id && <div className="workspace-panel space-y-3 p-4 text-sm">
            <p>You are proposed as final approver. Accepting transfers final signing and early-completion authority to you.</p>
            {[true,false].map(accept => <button key={String(accept)} disabled={saving} className="p-2 border rounded mr-2" onClick={async () => { setSaving(true); const result = await acceptReplacement(request.id,accept); setSaving(false); if (!result.success) setActionError(result.error || 'Could not respond.'); }}>{accept ? 'Accept Assignment' : 'Decline'}</button>)}
          </div>}
          {request.status === 'Pending Approval' && (currentUser.canReplaceFinalApprover || (!configuredBackups && canAdministerWorkflows(currentUser))) && <div className="workspace-panel space-y-3 p-4 text-sm">
            <h3 className="font-semibold">Replace an unsigned signer</h3>
            {request.pendingReplacement ? <p>Final replacement awaiting acceptance. The original signer remains assigned.</p> : replaceableSteps.length === 0 ? <p className="text-workspace-muted">No unsigned stages are available to you. Replacing the final approver requires separate permission.</p> : <>
              <p className="text-workspace-muted">{configuredBackups ? "Choose a configured backup or restore the primary signer. The change takes effect immediately." : "Intermediate replacements take effect immediately. A proposed final approver must accept before the assignment changes."}</p>
              <label className="block">Signer to replace<select required className="workspace-control mt-1 block min-h-10 w-full px-2" value={replacementStage} onChange={e => { setReplacementStage(e.target.value); setReplacementUser(''); }}><option value="">Select stage</option>{replaceableSteps.map(step => <option key={step.stageId} value={step.stageId}>{step.stageName} — {step.assignedUserName}</option>)}</select></label>
              <label className="block">{configuredBackups ? 'Backup or primary signer' : 'Proposed replacement'}<select required disabled={replacementCandidates.length === 0} className="workspace-control mt-1 block min-h-10 w-full px-2" value={replacementUser} onChange={e => setReplacementUser(e.target.value)}><option value="">Select user</option>{replacementCandidates.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
              {replacementStage && replacementCandidates.length === 0 && <p role="status" className="text-workspace-muted">No eligible replacements are available for this signer.</p>}
              <label className="block">Reason (required)<textarea required className="workspace-control mt-1 block w-full p-2" value={replacementReason} onChange={e => setReplacementReason(e.target.value)} /></label>
              <button disabled={saving || !replacementStage || !replacementCandidates.some(user => user.id === replacementUser) || !replacementReason.trim()} className="workspace-control min-h-10 px-3 font-semibold" onClick={async () => { setSaving(true); const result = await replaceSigner(request.id,replacementStage,replacementUser,replacementReason); setSaving(false); if(result.success){ setReplacementReason(''); setReplacementStage(''); setReplacementUser(''); } else setActionError(result.error || 'Replacement failed.'); }}>{configuredBackups ? 'Activate signer' : 'Replace Signer'}</button>
            </>}
          </div>}
          {/* 2. Detailed Approval Journey & Audit Log */}
          <ApprovalJourneyPanel
            request={request}
            currentUserId={currentUser.id}
          />

          {/* 3. Supporting Document Attachments */}
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
        </div>
      </div>

      {/* Action Modal: Return for Correction */}
      {actionModal === 'return' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg border border-[#E2E5E9] shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#192B3C] flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <span>Return Request for Correction</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Specify what corrections or additional documents the requester must provide:
            </p>
            {actionError && <p id="return-error" role="alert" className="text-xs text-rose-700">{actionError}</p>}
            <textarea
              aria-label="Reason for return"
              aria-invalid={Boolean(actionError)}
              aria-describedby={actionError ? "return-error" : undefined}
              disabled={saving}
              rows={3}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="e.g. Please update work description and attach Chamber attestation..."
              className="w-full px-3 py-2 text-xs border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={saving}
                onClick={() => { setActionError(null); setActionModal(null); }}
                className="min-h-10 rounded-md px-3 text-xs font-semibold text-slate-700 enabled:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365C78] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={handleReturnSubmit}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-xs"
              >
                {saving ? 'Saving…' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal: Reject Request */}
      {(actionModal === 'reject' || actionModal === 'cancel') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg border border-[#E2E5E9] shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-rose-700 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>{actionModal === 'cancel' ? 'Cancel PreciRoute' : 'Reject Request Form'}</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Provide a reason. This action closes the PreciRoute and preserves its document and signing history:
            </p>
            {actionError && <p role="alert" className="text-xs text-rose-700">{actionError}</p>}
            <textarea
              disabled={saving}
              rows={3}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="e.g. Outside of departmental budget scope / not approved by management..."
              className="w-full px-3 py-2 text-xs border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={saving}
                onClick={() => setActionModal(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={handleRejectSubmit}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-xs"
              >
                {saving ? 'Saving…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal: Director Override */}
      {actionModal === 'override' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg border border-[#E2E5E9] shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#192B3C] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#365C78]" />
              <span>Confirm PreciRoute Completion</span>
            </h3>
            <div className="p-3 bg-amber-50 rounded border border-amber-200 text-xs text-amber-900 leading-relaxed">
              The route will close. Outstanding signers will be bypassed: {request.approvalSteps.slice(0, -1).filter(step => step.status !== 'Approved' && step.status !== 'Bypassed').map(step => step.assignedUserName).join(', ') || 'None'}.
            </div>
            {actionError && <p role="alert" className="text-xs text-rose-700">{actionError}</p>}
            <textarea
              disabled={saving}
              rows={2}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Reason for completing this route (required)..."
              className="w-full px-3 py-2 text-xs border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={saving}
                onClick={() => setActionModal(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => { if (!actionReason.trim()) { setActionError('A reason is required to bypass outstanding signers.'); return; } if (finalAlreadySigned) { void handleDirectorOverrideSubmit(''); } else { setSignatureAction('override'); signingRecordTime.current = request.updatedAt; setSignatureModalOpen(true); } }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#192B3C] hover:bg-[#12202D] rounded shadow-xs"
              >
                {finalAlreadySigned ? 'Complete Route' : 'Sign & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal: Resubmit Request */}
      {actionModal === 'resubmit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="correction-heading" className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-lg border border-[#E2E5E9] shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="border-b border-[#E2E5E9] pb-3">
              <h3 id="correction-heading" className="text-base font-semibold text-[#192B3C]">
                Revise &amp; Resubmit Request (Version {request.documentVersion + 1})
              </h3>
              <p className="text-xs text-slate-500">
                Make the requested changes and sign the new version. It goes back to the first approver.
              </p>
            </div>

            {actionError && <p role="alert" className="text-xs text-rose-700">{actionError}</p>}
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <label>Date of request
                  <input className="w-full px-3 py-1.5 border rounded" value={correctedForm.dateOfRequest} onChange={(e) => setCorrectedForm((prev) => ({ ...prev, dateOfRequest: e.target.value }))} />
                </label>
                <label>Department
                  <input className="w-full px-3 py-1.5 border rounded" value={correctedForm.department} onChange={(e) => setCorrectedForm((prev) => ({ ...prev, department: e.target.value }))} />
                </label>
                <label>Priority
                  <select className="w-full px-3 py-1.5 border rounded" value={correctedForm.priority} onChange={(e) => setCorrectedForm((prev) => ({ ...prev, priority: e.target.value as AdminWorkFormData['priority'] }))}>
                    <option>Urgent</option><option>Medium</option><option>Low</option>
                  </select>
                </label>
              </div>
              {correctedForm.administrativePayment || correctedForm.expenseClaim
                ? <FinancialCorrectionFields data={correctedForm} attachments={correctedAttachments} onChange={setCorrectedForm} />
                : request.formType === 'IT Request' ? (
                <fieldset className="space-y-2">
                  <legend className="font-semibold">IT request details</legend>
                  <label className="block">Type of request
                    <input maxLength={150} className="w-full rounded border px-3 py-1.5" value={correctedForm.itRequest?.requestType ?? ''}
                      onChange={event => setCorrectedForm({ ...correctedForm, itRequest: { requestType: event.target.value, justification: correctedForm.itRequest?.justification ?? '' } })} />
                  </label>
                  <label className="block">Business justification
                    <textarea maxLength={10000} className="w-full rounded border px-3 py-1.5" value={correctedForm.itRequest?.justification ?? ''}
                      onChange={event => setCorrectedForm({ ...correctedForm, itRequest: { requestType: correctedForm.itRequest?.requestType ?? '', justification: event.target.value } })} />
                  </label>
                </fieldset>
              ) : <fieldset className="space-y-1">
                <legend className="font-semibold">Documents</legend>
                {([
                  ['onlineDocumentChamber', 'Online Document Chamber'], ['physicalDocumentChamber', 'Physical Document Chamber'],
                  ['companyDocumentAjeer', 'Company document Ajeer'], ['employeeSalaryCertificate', 'Employee Salary Certificate'],
                  ['permanentEmploymentVisa', 'Permanent Employment Visa'], ['workVisitVisa', 'Work Visit Visa'],
                  ['businessVisitVisa', 'Business Visit Visa'], ['agencyWakala', 'Agency Wakala'], ['others', 'Others'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex gap-2 items-center">
                    <input type="checkbox" checked={correctedForm.documents[key]} onChange={(e) => setCorrectedForm((prev) => ({ ...prev, documents: { ...prev.documents, [key]: e.target.checked } }))} />{label}
                  </label>
                ))}
                {correctedForm.documents.others && <input aria-label="Other documents" className="w-full px-3 py-1.5 border rounded" value={correctedForm.documents.othersDescription} onChange={(e) => setCorrectedForm((prev) => ({ ...prev, documents: { ...prev.documents, othersDescription: e.target.value } }))} />}
              </fieldset>}
              <div className="space-y-1">
                <label className="font-semibold">Attachments <input type="file" multiple onChange={(event) => {
                  Array.from(event.target.files || []).forEach((file) => {
                    const reader = new FileReader();
                    reader.onload = () => setCorrectedAttachments((prev) => [...prev, {
                      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, sizeBytes: file.size,
                      sizeFormatted: `${Math.ceil(file.size / 1024)} KB`, uploadedAt: new Date().toISOString(), uploadedBy: currentUser.name,
                      mimeType: file.type || 'application/octet-stream', dataUrl: String(reader.result),
                    }]);
                    reader.readAsDataURL(file);
                  });
                  event.target.value = '';
                }} /></label>
                {correctedAttachments.map((attachment, index) => {
                  const preservesReceiptOrder = [request.formData.expenseClaim, correctedForm.expenseClaim]
                    .some(claim => claim?.lines.some(line => line.receiptIndex !== undefined && line.receiptIndex >= index));
                  return <div key={attachment.id} className="flex justify-between">
                    <span>{attachment.name}</span>
                    {preservesReceiptOrder ? <span className="text-slate-500">Kept for receipt links</span>
                      : <button type="button" onClick={() => setCorrectedAttachments(prev => prev.filter(item => item.id !== attachment.id))}>Remove</button>}
                  </div>;
                })}
              </div>
              <div>
                <label htmlFor="corrected-work-description" className="block font-semibold text-slate-700 mb-1">
                  Updated work description
                </label>
                <textarea
                  id="corrected-work-description"
                  rows={3}
                  value={correctedForm.workDescription}
                  onChange={(e) =>
                    setCorrectedForm((prev) => ({ ...prev, workDescription: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
                />
              </div>

              <div>
                <label htmlFor="resubmit-change-note" className="block font-semibold text-slate-700 mb-1">
                  What changed? (optional)
                </label>
                <input
                  id="resubmit-change-note"
                  type="text"
                  maxLength={2000}
                  value={resubmitChangeNote}
                  onChange={(e) => setResubmitChangeNote(e.target.value)}
                  placeholder="Summarize the changes you made"
                  aria-describedby="resubmit-change-note-help"
                  className="w-full px-3 py-1.5 border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
                />
                <p id="resubmit-change-note-help" className="mt-1 text-slate-600">Your note will appear in the request history.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E5E9]">
              <button
                disabled={saving}
                onClick={() => setActionModal(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={() => { setSignatureAction('resubmit'); signingRecordTime.current = request.updatedAt; setSignatureModalOpen(true); }}
                className="min-h-10 rounded-md bg-[#192B3C] px-4 text-xs font-semibold text-white enabled:hover:bg-[#2A4A62] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365C78] disabled:opacity-60"
              >
                Review &amp; sign revision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Confirmation Modal */}
      {(
        <SignatureModal
          isOpen={signatureModalOpen}
          onClose={() => setSignatureModalOpen(false)}
          user={currentUser}
          title={signatureAction === 'resubmit' ? 'Sign Corrected Document' : signatureAction === 'override' ? 'Sign & Complete PreciRoute' : 'Sign & Approve Document'}
          confirmLabel="Apply Signature & Save"
          noteLabel={signatureAction === 'approve' ? 'Signing remark' : undefined}
          onConfirm={(signature, note) => { if (signingRecordTime.current !== request.updatedAt) return Promise.resolve({ success: false, error: 'The route changed. Close this dialog and review the current document before signing again.' }); return signatureAction === 'resubmit' ? handleResubmitSubmit(signature) : signatureAction === 'override' ? handleDirectorOverrideSubmit(signature) : handleConfirmedApproval(signature, note); }}
        />
      )}

    </div>
  );
};
