import type { AttachmentItem, RequestRecord, UserProfile } from '../types';
import { canUserAccessCompany } from './companyAccess';

export type ProcessingAction = 'itWork' | 'payment' | 'adminWork' | 'expenseSettlement' | 'cashPayout' | 'cashReceipt' | 'cashReceiptWaiver';
export const financeHoldActions = ['hold', 'evidence', 'resume', 'correction'] as const;
export type ProcessingCommand = ProcessingAction | typeof financeHoldActions[number];
export const processingLabels: Record<ProcessingAction, string> = {
  itWork: 'IT work completed',
  payment: 'Payment recorded',
  adminWork: 'Admin work completed',
  expenseSettlement: 'Expense settled',
  cashPayout: 'Cash paid out',
  cashReceipt: 'Receipt acknowledged',
  cashReceiptWaiver: 'Receiver acknowledgment waived',
};

export function pendingProcessing(request: RequestRecord): ProcessingAction | undefined {
  if (request.status !== 'Approved') return;
  if (request.formType === 'Cash Voucher' && request.formData.cashVoucher) {
    if (!request.processing?.cashPayout) return 'cashPayout';
    if (request.formData.cashVoucher.recipientUserId && !request.processing?.cashReceipt && !request.processing?.cashReceiptWaiver) return 'cashReceipt';
  }
  if (request.formType === 'IT Request' && request.formData.itRequest && !request.processing?.itWork) return 'itWork';
  if (request.formType === 'Expense Claim' && request.formData.expenseClaim && !request.processing?.expenseSettlement) return 'expenseSettlement';
  if (request.formType === 'Administrative & Payment Request' && request.formData.administrativePayment) {
    if (request.formData.administrativePayment.payment && !request.processing?.payment) return 'payment';
    if (!request.processing?.adminWork) return 'adminWork';
  }
}

export function canRecordProcessing(request: RequestRecord, actor: UserProfile, action: ProcessingAction) {
  if (!canUserAccessCompany(actor, request.companyId)) return false;
  const pending = pendingProcessing(request);
  if (action === 'cashReceiptWaiver') {
    const approver = request.approvalSteps.at(-1);
    return pending === 'cashReceipt' && request.workflowConfig.allowCashReceiptWaiver === true
      && approver?.status === 'Approved' && approver.assignedUserId === actor.id;
  }
  if (pending !== action) return false;
  if ((action === 'payment' || action === 'expenseSettlement') && isFinanceHeld(request)) return false;
  if (action === 'cashReceipt') return request.formData.cashVoucher?.recipientUserId === actor.id;
  const isAdmin = action === 'adminWork' || (action === 'cashPayout' && request.formData.cashVoucher?.source === 'Admin petty cash');
  const role = action === 'itWork' ? 'IT' : isAdmin ? 'Admin' : 'Finance';
  return actor.role === role && request.workflowConfig.processingUserIds?.includes(actor.id) === true;
}

export function isFinanceHeld(request: RequestRecord) {
  return [...(request.financeHoldHistory ?? [])].reverse().find(event => event.documentVersion === request.documentVersion && event.action !== 'evidence')?.action === 'hold';
}

export function canRecordFinanceHold(request: RequestRecord, actor: UserProfile, action: typeof financeHoldActions[number]) {
  const pending = pendingProcessing(request);
  if ((pending !== 'payment' && pending !== 'expenseSettlement') || !canUserAccessCompany(actor, request.companyId)) return false;
  const held = isFinanceHeld(request);
  if (action === 'evidence') return held && actor.id === request.requesterId;
  const assignedFinance = actor.role === 'Finance' && request.workflowConfig.processingUserIds?.includes(actor.id) === true;
  return assignedFinance && (action === 'hold' ? !held : held);
}

export function needsProcessingAction(request: RequestRecord, actor: UserProfile) {
  const step = pendingProcessing(request);
  return (!!step && canRecordProcessing(request, actor, step)) || canRecordFinanceHold(request, actor, 'evidence') || canRecordFinanceHold(request, actor, 'resume');
}

export function processingRequiresSignature(action: ProcessingCommand) {
  return action === 'cashPayout' || action === 'cashReceipt' || action === 'cashReceiptWaiver' || action === 'expenseSettlement';
}

export function recordProcessing(request: RequestRecord, actor: UserProfile, action: ProcessingCommand, note: string, signatureDataUrl?: string, attachment?: AttachmentItem) {
  if (typeof note !== 'string' || !note.trim() || note.length > 2000) return { success: false, error: 'Enter a note of up to 2,000 characters.' };
  const at = new Date().toISOString();
  if (action === 'hold' || action === 'evidence' || action === 'resume' || action === 'correction') {
    if (!canRecordFinanceHold(request, actor, action)) return { success: false, error: 'This finance action is unavailable to you.' };
    if (action === 'evidence' && !attachment) return { success: false, error: 'Attach the requested evidence.' };
    if (action !== 'evidence' && attachment) return { success: false, error: 'Attachments are only accepted as follow-up evidence.' };
    const history = request.financeHoldHistory ?? [];
    const total = history.reduce((size, entry) => size + (entry.attachment?.sizeBytes ?? 0), attachment?.sizeBytes ?? 0);
    if (total > 10 * 1024 * 1024) return { success: false, error: 'Follow-up evidence exceeds 10 MiB.' };
    return { success: true, updatedRequest: {
      ...request, updatedAt: at,
      ...(action === 'correction' && {
        status: 'Returned for Correction' as const,
        currentApproverId: undefined,
        currentApproverName: undefined,
        versionSnapshots: request.versionSnapshots.map(snapshot => snapshot.version === request.documentVersion
          ? { ...snapshot, formData: structuredClone(request.formData) } : snapshot),
        approvalHistory: [...request.approvalHistory, {
          id: crypto.randomUUID(), stepNumber: 0, actionByUserId: actor.id, actionByName: actor.name,
          actionByRole: actor.role, action: 'Returned for Correction' as const,
          dateTime: at, comments: note.trim(), version: request.documentVersion,
        }],
      }),
      financeHoldHistory: [...history, { action, documentVersion: request.documentVersion, byUserId: actor.id, byName: actor.name, at, note: note.trim(), attachment }],
    } };
  }
  if (!canRecordProcessing(request, actor, action) || attachment) return { success: false, error: 'This processing step is unavailable to you.' };
  if (processingRequiresSignature(action) && !signatureDataUrl?.trim()) return { success: false, error: 'Confirm a signature before continuing.' };
  return { success: true, updatedRequest: {
    ...request,
    updatedAt: at,
    processing: {
      ...request.processing,
      [action]: { byUserId: actor.id, byName: actor.name, at, note: note.trim(), signatureDataUrl: processingRequiresSignature(action) ? signatureDataUrl : undefined },
    },
  } };
}
