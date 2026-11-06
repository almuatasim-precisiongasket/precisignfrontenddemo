export type CompanyId = 'PEW' | 'ICCL' | 'FSG';
export const PARENT_ORGANIZATION_ID = 'PEG' as const;
export type ViewingScope = typeof PARENT_ORGANIZATION_ID | CompanyId;

export interface Company {
  id: CompanyId;
  code: string;
  name: string;
  fullName: string;
  groupName: string;
}

export interface Organization {
  id: typeof PARENT_ORGANIZATION_ID;
  name: string;
  fullName: string;
  subsidiaries: Company[];
}

export interface UserCompanyAccess {
  userId: string;
  allowedCompanyIds: CompanyId[];
  isGroupAdmin?: boolean;
}

export type UserRole = 'Admin' | 'General Manager' | 'Director' | 'IT' | 'Finance' | 'HR' | 'Purchase';

export interface UserProfile {
  canReplaceFinalApprover?: boolean;
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  initials: string;
  avatarColor: string;
  companyId: CompanyId;
  allowedCompanyIds?: CompanyId[];
  isGroupAdmin?: boolean;
  signatureDataUrl?: string;
  signatureStyleText?: string;
}

export type RequestStatus = 
  | 'Draft' 
  | 'Pending Approval' 
  | 'Returned for Correction' 
  | 'Rejected' 
  | 'Cancelled'
  | 'Approved';

export type PriorityLevel = 'Urgent' | 'Medium' | 'Low';

export interface AdminWorkFormChecklist {
  onlineDocumentChamber: boolean;
  physicalDocumentChamber: boolean;
  companyDocumentAjeer: boolean;
  employeeSalaryCertificate: boolean;
  permanentEmploymentVisa: boolean;
  workVisitVisa: boolean;
  businessVisitVisa: boolean;
  agencyWakala: boolean;
  others: boolean;
  othersDescription: string;
}

export interface AdministrativePaymentDetails {
  documentDescription: string;
  payment?: {
    amount: string;
    transferMode: 'Bank' | 'Cash' | 'Cheque';
    transferDetails?: string;
    purpose: 'Government Payment' | 'Advance Cash' | 'Other';
    otherPurpose?: string;
  };
  departmentHeadSignature?: { name: string; dataUrl: string };
}

export interface AdminWorkFormData {
  dateOfRequest: string;
  companyId: CompanyId;
  companyName: string;
  requesterId: string;
  requesterName: string;
  department: string;
  priority: PriorityLevel;
  workDescription: string;
  documents: AdminWorkFormChecklist;
  administrativePayment?: AdministrativePaymentDetails;
  itRequest?: { requestType: string; justification: string };
  cashVoucher?: { payee: string; recipientUserId?: string; amount: string; amountInWords: string; source: 'Admin petty cash' | 'Accounts cash' };
  expenseClaim?: { designation: string; project: string; lines: { date: string; particulars: string; amount: string; noBillReason?: string; receiptIndex?: number }[]; departmentHeadSignature?: { name: string; dataUrl: string } };
  // Signatures on paper document
  requesterSignatureName?: string;
  requesterSignatureDate?: string;
  requesterSignatureDataUrl?: string;
  approvalAuthoritySignatureName?: string;
  approvalAuthoritySignatureDate?: string;
  approvalAuthoritySignatureDataUrl?: string;
  // Admin team section (for completion info)
  adminUseOnly?: {
    status?: 'Completed' | 'Pending';
    completionDate?: string;
    completedByName?: string;
    portalLabourOffice?: boolean;
    portalMuqeem?: boolean;
    portalQiwa?: boolean;
    portalGosi?: boolean;
  };
}

export interface WorkflowStageConfig {
  eligibleSignerIds?: string[];
  requiredOnSubmit?: boolean;
  mustSign?: boolean;
  backupSignerIds?: string[];
  backupCompletionUserIds?: string[];
  id: string;
  stageNumber: number;
  name: string;
  assignedRole?: UserRole;
  assignedUserId?: string;
  isFinalApproval: boolean;
  canReject: boolean;
  canReturnForCorrection: boolean;
  mapsToDocumentSignature: boolean; // Maps to Approval Authority Signature box
}

export interface WorkflowConfig {
  allowCashReceiptWaiver?: boolean;
  processingUserIds?: string[];
  id: string;
  formType: string;
  companyId: CompanyId;
  version: number;
  stages: WorkflowStageConfig[];
  preventSelfApproval: boolean;
  allowDirectorOverride: boolean;
  reminderDays: number;
  escalationDays: number;
  rejectionBehavior: 'archive' | 'notify_requester';
  returnBehavior: 'restart_workflow' | 'resume_at_current_stage';
}

export interface ApprovalStepState {
  primarySignerId?: string;
  stageId: string;
  stageNumber: number;
  stageName: string;
  assignedUserId: string;
  assignedUserName: string;
  assignedRole: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Bypassed' | 'Waiting';
  actionDate?: string;
  comments?: string;
  signatureDataUrl?: string;
}

export interface ApprovalHistoryItem {
  id: string;
  stepNumber: number;
  actionByUserId: string;
  actionByName: string;
  actionByRole: string;
  action: 'Submitted' | 'Approved' | 'Returned for Correction' | 'Rejected' | 'Director Override' | 'Route Completed' | 'Cancelled' | 'Signer Replacement Proposed' | 'Signer Replaced' | 'Replacement Declined';
  dateTime: string;
  comments?: string;
  version: number;
}

export interface AttachmentItem {
  id: string;
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  uploadedAt: string;
  uploadedBy: string;
  mimeType: string;
  dataUrl?: string;
}

export interface ProcessingMilestone {
  signatureDataUrl?: string;
  byUserId: string;
  byName: string;
  at: string;
  note: string;
}

export interface RequestRecord {
  financeHoldHistory?: (ProcessingMilestone & {
    action: 'hold' | 'evidence' | 'resume' | 'correction';
    documentVersion: number;
    attachment?: AttachmentItem;
  })[];
  omittedSigningSteps?: string[];
  processing?: { itWork?: ProcessingMilestone; payment?: ProcessingMilestone; adminWork?: ProcessingMilestone; expenseSettlement?: ProcessingMilestone; cashPayout?: ProcessingMilestone; cashReceipt?: ProcessingMilestone; cashReceiptWaiver?: ProcessingMilestone };
  formerSignerIds?: string[];
  pendingReplacement?: { stageId: string; oldUserId: string; newUserId: string; reason: string; proposedBy: string };
  id: string;
  formType: 'Admin Work Request' | 'Administrative & Payment Request' | 'Payment Request' | 'IT Request' | 'Cash Voucher' | 'Expense Claim' | 'IT Asset Allocation' | 'Undertaking Guarantee';
  companyId: CompanyId;
  title: string;
  requesterId: string;
  requesterName: string;
  requesterRole: string;
  department: string;
  createdAt: string;
  updatedAt: string;
  status: RequestStatus;
  currentStageIndex: number; // 0 = First approver stage
  currentApproverId?: string;
  currentApproverName?: string;
  firstApproverName?: string;
  finalApproverName?: string;
  workflowVersion: number;
  documentVersion: number;
  workflowConfig: WorkflowConfig;
  approvalSteps: ApprovalStepState[];
  approvalHistory: ApprovalHistoryItem[];
  attachments: AttachmentItem[];
  attachmentVersions?: { version: number; attachments: AttachmentItem[] }[];
  formData: AdminWorkFormData;
  versionSnapshots: {
    version: number;
    updatedAt: string;
    updatedBy: string;
    formData: AdminWorkFormData;
    changeNote?: string;
  }[];
}

export type AdminWorkDraft = Partial<AdminWorkFormData> & { attachments?: AttachmentItem[] };
