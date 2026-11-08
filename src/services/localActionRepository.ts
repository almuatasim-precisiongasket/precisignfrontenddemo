import { saveRndEvaluation, validateRnd } from '../utils/rndWorkflow';
import { proposeSignerReplacement, acceptSignerReplacement } from '../utils/routeReplacement';
import { LocalStoragePreciSignRepository } from './repository';
import { ApiError } from './apiTypes';
import type { ApprovalInput, OverrideInput, ReasonInput, RequestActions, ResubmitInput, SubmitInput, VersionedRequest } from './apiTypes';
import { approveRequestStage, createNewRequestRecord, cancelPreciRoute, completePreciRoute, rejectRequest, resubmitCorrectedRequest, returnRequestForCorrection } from '../utils/workflowEngine';
import type { RequestRecord, UserProfile } from '../types/index';
import { canUserAccessCompany } from '../utils/companyAccess';
import { recordProcessing } from '../utils/routeProcessing';
import { expenseEvidenceError, preservesExpenseReceipts } from '../utils/expenseEvidence';
import { applySignerChoices } from '../utils/signingSelection';

/** Explicit demo adapter. Actor is supplied by demo persona selection, never an API body. */
export class LocalActionRepository extends LocalStoragePreciSignRepository implements RequestActions {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private actorId: string, storage?: Storage) { super(storage); }
  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work); this.queue = result.catch(() => {}); return result;
  }
  private async actor() {
    const user = await this.getUserById(this.actorId);
    if (!user) throw new ApiError(401, 'Demo user not found.');
    return user;
  }
  private requireSignature(signature: string) {
    if (typeof signature !== 'string' || !signature.trim()) throw new ApiError(400, 'Confirm a signature before continuing.');
  }
  submit(input: SubmitInput) {
    return this.serialized(async () => {
      this.requireSignature(input.signatureDataUrl);
      const actor = await this.actor();
      if (input.formType === 'R&D Initiative') { const error = validateRnd(input.formData.rnd, false); if (error) throw new ApiError(400, error); }
      const workflow = await this.getWorkflow(input.companyId, input.formType);
      if (!workflow) throw new ApiError(400, 'Workflow is not configured.');
      if (input.formType !== 'Admin Work Request' && workflow.version !== input.expectedWorkflowVersion) {
        throw new ApiError(409, 'The signing route changed. Review the updated route before sending.');
      }
      const company = await this.getCompanyById(input.companyId);
      const users = await this.getUsers();
      const selection = applySignerChoices(workflow, users, actor.id, input.signerChoices);
      if (!selection.workflow) throw new ApiError(400, selection.error);
      const voucher = input.formData.cashVoucher;
      if (input.formData.expenseClaim) {
        const evidenceError = expenseEvidenceError(input.formData.expenseClaim, input.attachments ?? []);
        if (evidenceError) throw new ApiError(400, evidenceError);
      }
      if (voucher && !users.some(user => user.id === voucher.recipientUserId && user.name === voucher.payee && canUserAccessCompany(user, input.companyId))) {
        throw new ApiError(400, 'Choose an eligible voucher recipient.');
      }
      const record = createNewRequestRecord({ id: `${input.companyId}-AW-${new Date().getFullYear()}-${crypto.randomUUID()}`, formType: input.formType,
        formData: { ...input.formData, companyId: input.companyId, companyName: company!.fullName, companyLogoDataUrl: company?.logoDataUrl, requesterId: actor.id, requesterName: actor.name },
        requester: actor, workflowConfig: selection.workflow, users, attachments: input.attachments, comment: input.comment, signatureDataUrl: input.signatureDataUrl });
      const versioned: VersionedRequest = { ...record, omittedSigningSteps: selection.omittedSigningSteps, revision: 1 }; await this.createRequest(versioned); return versioned;
    });
  }
  private change(id: string, revision: number, compute: (request: RequestRecord, actor: UserProfile) => { success: boolean; error?: string; updatedRequest?: RequestRecord }) {
    return this.serialized(async () => {
      const request = await this.getRequestById(id) as VersionedRequest | null;
      if (!request) throw new ApiError(404, 'Request not found.');
      const actor = await this.actor();
      if (!canUserAccessCompany(actor, request.companyId)) throw new ApiError(404, 'Request not found.');
      if ((request.revision ?? 1) !== revision) throw new ApiError(409, 'Request changed. Refresh and review again.');
      const result = compute(request, actor);
      if (!result.success || !result.updatedRequest) throw new ApiError(403, result.error || 'Action rejected.');
      const updated = { ...result.updatedRequest, revision: revision + 1 };
      if (updated.pendingReplacement && (updated.status !== 'Pending Approval' || ['Approved','Bypassed','Rejected'].includes(updated.approvalSteps.find(step => step.stageId === updated.pendingReplacement!.stageId)?.status || ''))) updated.pendingReplacement = undefined;
      await this.updateRequest(updated); return updated;
    });
  }
  saveRndEvaluation(id: string, input: Parameters<RequestActions['saveRndEvaluation']>[1]) { return this.change(id, input.expectedRevision, (request, actor) => saveRndEvaluation(request, actor, input.evaluation)); }
  approve(id: string, input: ApprovalInput) { return this.change(id, input.expectedRevision, (request, actor) => { this.requireSignature(input.signatureDataUrl); return approveRequestStage({ request, actingUser: actor, ...input }); }); }
  returnForCorrection(id: string, input: ReasonInput) { return this.change(id, input.expectedRevision, (request, actor) => returnRequestForCorrection({ request, actingUser: actor, reason: input.reason })); }
  reject(id: string, input: ReasonInput) { return this.change(id, input.expectedRevision, (request, actor) => rejectRequest({ request, actingUser: actor, reason: input.reason })); }
  resubmit(id: string, input: ResubmitInput) {
    return this.change(id, input.expectedRevision, (request, actor) => {
      this.requireSignature(input.signatureDataUrl);
      if (request.formData.expenseClaim && input.attachments && !preservesExpenseReceipts(request.formData.expenseClaim, request.attachments, input.attachments)) {
        throw new ApiError(400, 'Receipt links must be preserved when resubmitting this claim.');
      }
      if (input.formData.expenseClaim) {
        const evidenceError = expenseEvidenceError(input.formData.expenseClaim, input.attachments ?? request.attachments);
        if (evidenceError) throw new ApiError(400, evidenceError);
      }
      const result = resubmitCorrectedRequest({ request, actingUser: actor, updatedFormData: { ...request.formData, ...input.formData }, ...input });
      if (result.updatedRequest) {
        result.updatedRequest.attachmentVersions = [
          ...(request.attachmentVersions ?? []),
          { version: request.documentVersion, attachments: request.attachments },
        ];
      }
      return result;
    });
  }
  async replaceSigner(id: string, input: ReasonInput & { stageId: string; newUserId: string }) { const target = await this.getUserById(input.newUserId); if (!target) throw new ApiError(400,'User not found.'); return this.change(id,input.expectedRevision,(request,actor) => proposeSignerReplacement(request,actor,target,input.stageId,input.reason)); }
  acceptReplacement(id: string, input: { expectedRevision: number; accept: boolean }) { return this.change(id,input.expectedRevision,(request,actor) => acceptSignerReplacement(request,actor,input.accept)); }
  cancel(id: string, input: ReasonInput) { return this.change(id, input.expectedRevision, (request, actingUser) => cancelPreciRoute({ request, actingUser, reason: input.reason })); }
  recordProcessing(id: string, input: Parameters<RequestActions['recordProcessing']>[1]) {
    return this.change(id, input.expectedRevision, (request, actor) => recordProcessing(request, actor, input.action, input.note, input.signatureDataUrl, input.attachment));
  }
  override(id: string, input: OverrideInput) { return this.change(id, input.expectedRevision, (request, actor) => { return completePreciRoute({ request, actingUser: actor, signatureDataUrl: input.signatureDataUrl, reason: input.reason }); }); }
}
