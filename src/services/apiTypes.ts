import type { AdminWorkDraft, AdminWorkFormData, AttachmentItem, Company, CompanyId, RequestRecord, UserProfile, WorkflowConfig } from '../types/index';
import type { ProcessingCommand } from '../utils/routeProcessing';
import type { SignerChoices } from '../utils/signingSelection';

export type VersionedRequest = RequestRecord & { revision: number };
export const API_CONTRACT_VERSION = 1 as const;
export const SUBMITTABLE_FORMS = ['Admin Work Request', 'Administrative & Payment Request', 'IT Request', 'Cash Voucher', 'Expense Claim', 'R&D Initiative'] as const;
export type SubmittableForm = typeof SUBMITTABLE_FORMS[number];
export interface BootstrapData { user: UserProfile; companies: Company[]; users: UserProfile[]; workflows: WorkflowConfig[]; }
export interface SubmitInput {
  signerChoices?: SignerChoices;
  expectedDraftRevision?: number;
  expectedWorkflowVersion?: number;
  companyId: CompanyId;
  formType: SubmittableForm;
  formData: Pick<AdminWorkFormData, 'dateOfRequest' | 'department' | 'priority' | 'workDescription' | 'documents' | 'administrativePayment' | 'itRequest' | 'cashVoucher' | 'expenseClaim' | 'rnd'>;
  signatureDataUrl: string;
  attachments?: AttachmentItem[];
  comment?: string;
}
export interface ApprovalInput { expectedRevision: number; signatureDataUrl: string; comment?: string; }
export interface ReasonInput { expectedRevision: number; reason: string; }
export interface ResubmitInput extends Omit<SubmitInput, 'companyId' | 'formType' | 'comment' | 'expectedDraftRevision' | 'expectedWorkflowVersion' | 'signerChoices'> { expectedRevision: number; changeNote?: string; }
export interface DraftState { revision: number; data: AdminWorkDraft | null; }
export interface PrivateDraftRepository {
  readPrivateDraft(company: CompanyId): Promise<DraftState>;
  writePrivateDraft(company: CompanyId, expectedRevision: number, data: AdminWorkDraft): Promise<DraftState>;
  clearPrivateDraft(company: CompanyId, expectedRevision: number): Promise<DraftState>;
}
export interface OverrideInput extends ReasonInput { signatureDataUrl: string; }
export interface RequestActions {
  saveRndEvaluation(id: string, input: { expectedRevision: number; evaluation: import('../types').RndFormData }): Promise<VersionedRequest>;
  recordProcessing(id: string, input: { expectedRevision: number; action: ProcessingCommand; note: string; signatureDataUrl?: string; attachment?: AttachmentItem }): Promise<VersionedRequest>;
  replaceSigner(id: string, input: ReasonInput & { stageId: string; newUserId: string }): Promise<VersionedRequest>;
  acceptReplacement(id: string, input: { expectedRevision: number; accept: boolean }): Promise<VersionedRequest>;
  submit(input: SubmitInput): Promise<VersionedRequest>;
  approve(id: string, input: ApprovalInput): Promise<VersionedRequest>;
  returnForCorrection(id: string, input: ReasonInput): Promise<VersionedRequest>;
  reject(id: string, input: ReasonInput): Promise<VersionedRequest>;
  resubmit(id: string, input: ResubmitInput): Promise<VersionedRequest>;
  cancel(id: string, input: ReasonInput): Promise<VersionedRequest>;
  override(id: string, input: OverrideInput): Promise<VersionedRequest>;
}
export const errorCodes: Record<number, string> = { 400: 'INVALID_DATA', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'STALE_REVISION', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED', 500: 'PERSISTENCE_FAILURE' };
export class ApiError extends Error {
  constructor(public status: number, message: string, public code = errorCodes[status] || 'API_ERROR') { super(message); this.name = 'ApiError'; }
}
