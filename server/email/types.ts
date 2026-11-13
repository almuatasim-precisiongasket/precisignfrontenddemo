export type DeliveryMode = 'disabled' | 'sandbox' | 'live';

export type EmailEventType =
  | 'REQUEST_SUBMITTED'
  | 'ACTION_REQUIRED'
  | 'UPCOMING_FINAL_APPROVER_NOTICE'
  | 'UPCOMING_SIGNER_NOTICE'
  | 'ROUTE_COMPLETED';

export type OutboxStatus =
  | 'pending'
  | 'processing'
  | 'accepted'
  | 'delivered'
  | 'failed'
  | 'failed_unconfirmed';

export interface StepSummary {
  stageName: string;
  assignedUserName: string;
  status: 'Signed' | 'Bypassed' | 'Pending';
  actionDate?: string;
}

export interface FormBilingualPreview {
  displayId: string;
  companyId: string;
  companyName: string;
  companyNameArabic?: string;
  formTitleEnglish: string;
  formTitleArabic: string;
  dateOfRequest: string;
  department: string;
  requesterName: string;
  documentsDescription: string;
  priority: string;
  workDescription: string;
  adminUseOnly: {
    status: string;
    completionDate: string;
    completedByName: string;
  };
  payment: {
    amount: string;
    transferMode: string;
    transferDetails?: string;
    purpose: string;
  };
  signatures: {
    requester: { english: string; arabic: string; name?: string; status: string };
    departmentHead: { english: string; arabic: string; name?: string; status: string };
    approver: { english: string; arabic: string; name?: string; status: string };
  };
  notes: string[] | {
    english: string[];
    arabic?: string[];
  };
}

export interface SummaryRow {
  label: string;
  value: string;
  isMonospace?: boolean;
  isPriorityPill?: boolean;
  priorityLevel?: 'Urgent' | 'Medium' | 'Low' | string;
  isAmount?: boolean;
}

export interface AmountHighlight {
  label: string;
  amount: string;
  currency: string;
}

export interface PreciRouteTrailItem {
  name: string;
  roleTag: string;
  action: string;
  initial: string;
  avatarBg: string;
  avatarColor: string;
  comment?: string;
  timestamp?: string;
}

export interface EmailPayload {
  companyId: string;
  companyName: string;
  formType: string;
  requestId: string;
  displayId?: string;
  requesterName: string;
  recipientName: string;
  recipientEmail: string;
  portalUrl: string;
  stageName?: string;
  stageNumber?: number;
  totalStages?: number;
  stageBadge?: string;
  isFinalApprover?: boolean;
  emailNote?: string;
  amountHighlight?: AmountHighlight;
  dynamicSummary?: SummaryRow[];
  precirouteTrail?: PreciRouteTrailItem[];
  formPreview?: FormBilingualPreview;
  completionSummary?: {
    completedDate: string;
    steps: StepSummary[];
  };
}

export interface OutboxRecord {
  id: string;
  request_id: string;
  event_type: EmailEventType;
  recipient_user_id: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  payload_json: string;
  idempotency_key: string;
  status: OutboxStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  lease_token: string | null;
  lease_expires_at: number | null;
  next_attempt_at: number;
  created_at: number;
  first_attempt_at: number | null;
  last_attempt_at: number | null;
  accepted_at: number | null;
  delivered_at: number | null;
  provider_message_id: string | null;
  resend_id?: string | null;
  response_json: string | null;
}

export interface OutboxInsertItem {
  id: string;
  requestId: string;
  eventType: EmailEventType;
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  payload: EmailPayload;
  idempotencyKey: string;
  nowMs: number;
}

export interface EmailSendOptions {
  from?: string;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey: string;
}

export interface EmailSendResult {
  accepted: boolean;
  delivered: boolean;
  resendId?: string;
  error?: string;
  retryable?: boolean;
  uncertain?: boolean;
}

export interface IEmailTransport {
  send(options: EmailSendOptions): Promise<EmailSendResult>;
}
