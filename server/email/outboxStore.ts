import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { RequestRecord, UserProfile } from '../../src/types/index';
import type { AsyncQueryConnection } from '../asyncDatabase';
import { pageRouteHref } from '../../src/navigation/pageRoutes';
import { renderEmailContent, renderEmailSubject } from './emailTemplates';
import { getRequestDisplayReference } from './requestSequence';
import type {
  AmountHighlight,
  EmailEventType,
  EmailPayload,
  FormBilingualPreview,
  OutboxInsertItem,
  PreciRouteTrailItem,
  StepSummary,
  SummaryRow,
} from './types';

export type OutboxUser = {
  id: string;
  name: string;
  email: string;
  isDisabled?: boolean;
  notificationEmail?: string;
} & Partial<UserProfile>;

export const ADMINISTRATIVE_PAYMENT_PRINTED_NOTES = [
  'Urgent-Priority requests will be processed within the same hour/immediately.',
  'Medium-Priority requests will be processed within 3 days.',
  'Low-Priority requests will be processed within 7 days.',
  'Payment will be processed in three – Four Working days after submission of request, If Urgent Payment, please mention in the form to process urgently.',
  'Supporting documents must be appropriate otherwise requested will be returned and payment will not be processed, and finance will not be responsible for such delays.',
  'Supporting documents must have company name; vat Number of both the parties',
  'Advance Cash must be closed / Petty cash claim should be submitted within 2 weeks.',
];

export function getAppPortalUrl(requestId: string): string {
  const emailUrl = process.env.PRECISIGN_EMAIL_APP_URL?.trim();
  const appUrl = process.env.PRECISIGN_APP_URL?.trim();
  const appOrigin = process.env.APP_ORIGIN?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  const base = emailUrl || appUrl || appOrigin;

  if (isProduction) {
    if (!base) {
      throw new Error('In production, PRECISIGN_EMAIL_APP_URL, PRECISIGN_APP_URL, or APP_ORIGIN must be set.');
    }
    if (base.includes('localhost') || base.includes('127.0.0.1')) {
      throw new Error(`In production, hosted emails cannot link to local origin: "${base}". Set a public HTTPS application origin.`);
    }
    if (!base.startsWith('https://')) {
      throw new Error(`In production, hosted emails must link to HTTPS origin: "${base}".`);
    }
  }

  const effectiveBase = base || 'http://127.0.0.1:3000';
  const cleanBase = effectiveBase.replace(/\/+$/, '');
  const relativePath = pageRouteHref({ view: 'review-sign', requestId });

  return `${cleanBase}${relativePath}`;
}

export function buildIdempotencyKey(
  eventType: EmailEventType,
  requestId: string,
  docVersion: number,
  revision: number,
  recipientUserId: string
): string {
  return `precisign/${eventType}/${requestId}-v${docVersion}-r${revision}-${recipientUserId}`;
}

export function formatEmailDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

export function buildDynamicSummary(
  request: RequestRecord & { revision?: number; emailNote?: string },
  displayId: string
): SummaryRow[] {
  const fd = (request.formData as any) || {};
  const ap = fd.administrativePayment;
  const payment = ap?.payment;
  const rows: SummaryRow[] = [];

  // Always show core fields: Company, Form, Reference, Requester/Claimant, Submission Date
  const companyVal = fd.companyName || (request as any).companyName || request.companyId;
  rows.push({ label: 'Company', value: companyVal });
  rows.push({ label: 'Form', value: request.formType });
  rows.push({ label: 'Reference', value: displayId, isMonospace: true });

  const formLower = (request.formType || '').toLowerCase();
  const isExpense = formLower.includes('expense') || formLower.includes('claim');
  const requesterVal = fd.requesterName || request.requesterName || fd.claimant || '—';
  rows.push({ label: isExpense ? 'Claimant' : 'Requester', value: requesterVal });

  const subDate = formatEmailDate(request.createdAt || fd.dateOfRequest);
  if (subDate) {
    rows.push({ label: 'Submission Date', value: subDate });
  }

  // Dynamic form-specific fields
  if (formLower.includes('administrative & payment') || formLower.includes('payment')) {
    if (fd.department) rows.push({ label: 'Department', value: fd.department });
    if (fd.priority) rows.push({ label: 'Priority', value: fd.priority, isPriorityPill: true });
    if (fd.workDescription) rows.push({ label: 'Work', value: fd.workDescription });
    if (payment?.amount) rows.push({ label: 'Amount', value: `${payment.amount} SAR`, isAmount: true });
    if (payment?.purpose) {
      const p = payment.purpose === 'Other' ? (payment.otherPurpose || 'Other') : payment.purpose;
      if (p) rows.push({ label: 'Purpose', value: p });
    }
  } else if (formLower.includes('it request') || formLower.includes('it')) {
    if (fd.department) rows.push({ label: 'Department', value: fd.department });
    const reqType = fd.itRequest?.requestType || fd.requestType;
    if (reqType) rows.push({ label: 'Request Type', value: reqType });
    if (fd.priority) rows.push({ label: 'Priority', value: fd.priority, isPriorityPill: true });
    const desc = fd.workDescription || fd.description;
    if (desc) rows.push({ label: 'Description', value: desc });
  } else if (formLower.includes('cash voucher') || formLower.includes('voucher')) {
    const payee = fd.cashVoucher?.payee || fd.payee || fd.payeeName;
    if (payee) rows.push({ label: 'Payee', value: payee });
    const amountVal = fd.cashVoucher?.amount || fd.amount;
    if (amountVal) rows.push({ label: 'Amount', value: `${amountVal} SAR`, isAmount: true });
    const purpose = fd.workDescription || fd.purpose || fd.cashVoucher?.purpose;
    if (purpose) rows.push({ label: 'Purpose', value: purpose });
  } else if (isExpense) {
    const project = fd.expenseClaim?.project || fd.project || fd.projectName;
    if (project) rows.push({ label: 'Project', value: project });

    const lines = fd.expenseClaim?.lines || fd.expenseItems;
    let totalClaimed = fd.totalAmount || fd.amount;
    if (!totalClaimed && Array.isArray(lines) && lines.length > 0) {
      const sumCents = lines.reduce((acc: number, line: any) => {
        const amt = parseFloat(line.amount) || 0;
        return acc + Math.round(amt * 100);
      }, 0);
      totalClaimed = (sumCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    if (totalClaimed) rows.push({ label: 'Total Claimed', value: `${totalClaimed} SAR`, isAmount: true });
    if (Array.isArray(lines) && lines.length > 0) {
      rows.push({ label: 'Expense Lines', value: `${lines.length} line${lines.length === 1 ? '' : 's'}` });
    }
  } else {
    if (fd.department) rows.push({ label: 'Department', value: fd.department });
    if (fd.priority) rows.push({ label: 'Priority', value: fd.priority, isPriorityPill: true });
    if (fd.workDescription || fd.description) rows.push({ label: 'Description', value: fd.workDescription || fd.description });
  }

  return rows;
}

export function buildAmountHighlight(request: RequestRecord): AmountHighlight | undefined {
  const fd = (request.formData as any) || {};
  const ap = fd.administrativePayment;
  const payment = ap?.payment;

  if (payment?.amount) {
    return {
      label: 'Payment Amount',
      amount: String(payment.amount),
      currency: 'SAR',
    };
  }

  const voucherAmount = fd.cashVoucher?.amount || fd.amount;
  if (voucherAmount) {
    return {
      label: 'Voucher Amount',
      amount: String(voucherAmount),
      currency: 'SAR',
    };
  }

  const lines = fd.expenseClaim?.lines || fd.expenseItems;
  if (Array.isArray(lines) && lines.length > 0) {
    const sumCents = lines.reduce((acc: number, l: any) => {
      const amt = parseFloat(l.amount) || 0;
      return acc + Math.round(amt * 100);
    }, 0);
    const total = (sumCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return {
      label: 'Total Claimed',
      amount: total,
      currency: 'SAR',
    };
  }

  if (fd.totalAmount) {
    return {
      label: 'Total Claimed',
      amount: String(fd.totalAmount),
      currency: 'SAR',
    };
  }

  return undefined;
}

export function buildPreciRouteTrail(
  request: RequestRecord & { emailNote?: string },
  emailNote?: string
): PreciRouteTrailItem[] {
  const trail: PreciRouteTrailItem[] = [];
  const note = emailNote || request.emailNote || (request.formData as any)?.emailNote;

  // 1. Requester Node
  const reqName = request.requesterName || 'Requester';
  trail.push({
    name: reqName,
    roleTag: 'Requester',
    action: 'Submitted',
    initial: reqName.trim()[0]?.toUpperCase() || 'R',
    avatarBg: '#CCFBF1',
    avatarColor: '#0F766E',
    comment: note?.trim() ? note.trim() : undefined,
    timestamp: formatEmailDate(request.createdAt),
  });

  // 2. Signer Nodes from approvalHistory
  const history = request.approvalHistory || [];
  let signerIndex = 1;

  for (const h of history) {
    // Skip initial submission or evaluation update events because the Requester node is already added above
    if (
      h.stepNumber === 0 ||
      (h.action as string) === 'Submitted' ||
      (h.action as string) === 'Evaluation Updated'
    ) {
      continue;
    }

    const action = h.action === 'Approved' ? 'Signed' : h.action;
    const name = h.actionByName || h.actionByRole || `Signer ${signerIndex}`;
    const initial = name.trim()[0]?.toUpperCase() || 'S';
    const roleTag = h.stepNumber ? `Signer ${h.stepNumber}` : (signerIndex === 1 ? 'Signer 1' : `Signer ${signerIndex}`);
    // Never leak confidential bypass/override reasons into external emails
    const isBypassOrOverride =
      h.action === 'Director Override' ||
      h.action === 'Route Completed' ||
      (h as any).action === 'Bypassed' ||
      Boolean((h as any).reason) ||
      (h.comments || '').toLowerCase().includes('bypassed');
    const comment = isBypassOrOverride ? undefined : (h.comments || '').trim();
    const dateVal = h.dateTime || (h as any).timestamp;

    trail.push({
      name,
      roleTag,
      action,
      initial,
      avatarBg: '#E0E7FF',
      avatarColor: '#4338CA',
      comment: comment ? comment : undefined,
      timestamp: formatEmailDate(dateVal),
    });

    signerIndex++;
  }

  return trail;
}

export function buildAdministrativePaymentPreview(
  request: RequestRecord & { revision?: number; emailNote?: string },
  displayId: string
): FormBilingualPreview {
  const fd = request.formData;
  const ap = fd.administrativePayment;
  const payment = ap?.payment;
  const companyName = (fd as any)?.companyName || (request as any).companyName || request.companyId;

  // Resolve signer steps safely:
  const stages = request.workflowConfig?.stages || [];
  const finalStageId = stages.find(s => s.isFinalApproval)?.id;
  const approverStep = request.approvalSteps.find(s => s.stageId === finalStageId) || request.approvalSteps.at(-1);

  // Department head step only exists if there is an intermediate, non-final step in the route.
  const deptStep = request.approvalSteps.length > 1
    ? request.approvalSteps.slice(0, -1).find(s => {
        const stageConfig = stages.find(stg => stg.id === s.stageId);
        return (
          s.stageName?.toLowerCase().includes('department') ||
          s.stageName?.toLowerCase().includes('head') ||
          (stageConfig as any)?.documentSlot === 'department-head'
        );
      }) ?? (request.approvalSteps.length > 1 ? request.approvalSteps[0] : undefined)
    : undefined;

  const isDeptSigned = Boolean(
    ap?.departmentHeadSignature?.name ||
    (deptStep && deptStep.status === 'Approved')
  );
  const deptName = ap?.departmentHeadSignature?.name || deptStep?.assignedUserName || '';
  const deptStatus = isDeptSigned ? 'Signed' : (deptStep && deptStep.status === 'Pending' ? 'Pending' : '');

  const isApproverSigned = Boolean(
    fd.approvalAuthoritySignatureName ||
    (approverStep && approverStep.status === 'Approved')
  );
  const approverName = fd.approvalAuthoritySignatureName || approverStep?.assignedUserName || '';
  const approverStatus = isApproverSigned ? 'Signed' : (approverStep && approverStep.status === 'Pending' ? 'Pending' : '');

  return {
    displayId,
    companyId: request.companyId,
    companyName,
    companyNameArabic: '', // Do not invent an Arabic company name
    formTitleEnglish: 'Administrative & Payment Request Form',
    formTitleArabic: 'نموذج طلب إداري ودفع',
    dateOfRequest: fd.dateOfRequest || '',
    department: fd.department || '',
    requesterName: fd.requesterName || request.requesterName || '',
    documentsDescription: ap?.documentDescription || (fd.documents ? 'Attached' : ''),
    priority: fd.priority || 'Medium',
    workDescription: fd.workDescription || '',
    adminUseOnly: {
      status: fd.adminUseOnly?.status || '',
      completionDate: fd.adminUseOnly?.completionDate || '',
      completedByName: fd.adminUseOnly?.completedByName || '',
    },
    payment: {
      amount: payment?.amount ? `${payment.amount} SAR` : '',
      transferMode: payment?.transferMode || '',
      transferDetails: payment?.transferDetails,
      purpose: payment?.purpose === 'Other' ? (payment.otherPurpose || 'Other') : (payment?.purpose || ''),
    },
    signatures: {
      requester: {
        english: 'Requester Signature',
        arabic: 'توقيع صاحب الطلب',
        name: fd.requesterSignatureName || request.requesterName,
        status: 'Signed',
      },
      departmentHead: {
        english: 'Department Head Signature',
        arabic: 'توقيع رئيس القسم',
        name: deptStep ? deptName : '',
        status: deptStep ? deptStatus : '',
      },
      approver: {
        english: 'Approver Signature',
        arabic: 'توقيع المخول بالاعتماد',
        name: approverStep ? approverName : '',
        status: approverStep ? approverStatus : '',
      },
    },
    notes: ADMINISTRATIVE_PAYMENT_PRINTED_NOTES,
  };
}

export function createOutboxItem(
  eventType: EmailEventType,
  request: RequestRecord & { revision?: number; emailNote?: string },
  recipient: { id: string; name: string; email: string },
  nowMs: number,
  extra?: Partial<EmailPayload>
): OutboxInsertItem {
  const portalUrl = getAppPortalUrl(request.id);
  const displayId = getRequestDisplayReference(request);
  const emailNote = extra?.emailNote || request.emailNote || (request.formData as any)?.emailNote;

  const dynamicSummary = buildDynamicSummary(request, displayId);
  const amountHighlight = buildAmountHighlight(request);
  const precirouteTrail = buildPreciRouteTrail(request, emailNote);

  // Compute stage badge
  const totalStages = request.approvalSteps?.length || 0;
  const currentStageIndex = typeof request.currentStageIndex === 'number' ? request.currentStageIndex : 0;
  let stageBadge: string | undefined = undefined;

  if (eventType === 'ACTION_REQUIRED') {
    stageBadge = totalStages > 0 ? `STAGE ${currentStageIndex + 1} OF ${totalStages}` : 'ACTION REQUIRED';
  } else if (eventType === 'ROUTE_COMPLETED') {
    stageBadge = 'COMPLETED';
  } else if (eventType === 'REQUEST_SUBMITTED') {
    stageBadge = 'SUBMITTED';
  }

  // Newly queued events use the compact dynamicSummary; stop generating and storing
  // the unused full-form preview (including payment transfer details) in new outbox items.
  const formPreview = extra?.formPreview;

  const payload: EmailPayload = {
    companyId: request.companyId,
    companyName: (request.formData as any)?.companyName || request.companyId,
    formType: request.formType,
    requestId: request.id,
    displayId,
    emailNote,
    amountHighlight,
    dynamicSummary,
    precirouteTrail,
    stageBadge,
    stageNumber: currentStageIndex + 1,
    totalStages,
    formPreview,
    requesterName: request.requesterName,
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    portalUrl,
    ...extra,
  };

  const subject = renderEmailSubject(eventType, payload);
  const revision = (request as any).revision ?? 1;
  const idempotencyKey = buildIdempotencyKey(
    eventType,
    request.id,
    request.documentVersion,
    revision,
    recipient.id
  );

  return {
    id: randomUUID(),
    requestId: request.id,
    eventType,
    recipientUserId: recipient.id,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    subject,
    payload,
    idempotencyKey,
    nowMs,
  };
}

export function buildSubmissionEmails(
  request: RequestRecord & { revision?: number; emailNote?: string },
  requester: OutboxUser,
  allUsers: OutboxUser[],
  nowMs: number = Date.now(),
  emailNote?: string
): OutboxInsertItem[] {
  const items: OutboxInsertItem[] = [];
  const note = emailNote || request.emailNote;
  const userMap = new Map<string, OutboxUser>();
  for (const u of allUsers) {
    if (!u.isDisabled) userMap.set(u.id, u);
  }

  // 1. Requester confirmation
  const reqEmail = requester.notificationEmail || requester.email;
  if (reqEmail && !requester.isDisabled) {
    items.push(
      createOutboxItem('REQUEST_SUBMITTED', request, {
        id: requester.id,
        name: requester.name,
        email: reqEmail,
      }, nowMs, {
        emailNote: note,
      })
    );
  }

  // 2. Active Stage (First Signer)
  const firstStep = request.approvalSteps[0];
  if (firstStep && firstStep.assignedUserId && firstStep.status === 'Pending') {
    const firstUser = userMap.get(firstStep.assignedUserId) ?? (
      firstStep.assignedUserId === requester.id ? requester : undefined
    );
    const firstEmail = firstUser?.notificationEmail || firstUser?.email;
    if (firstUser && firstEmail && !firstUser.isDisabled) {
      items.push(
        createOutboxItem('ACTION_REQUIRED', request, {
          id: firstUser.id,
          name: firstUser.name,
          email: firstEmail,
        }, nowMs, {
          stageName: firstStep.stageName,
          emailNote: note,
        })
      );
    }
  }

  // 3. All assigned upcoming signers
  const finalIdx = request.approvalSteps.length - 1;
  for (let i = 1; i < request.approvalSteps.length; i++) {
    const step = request.approvalSteps[i];
    if (!step.assignedUserId) continue;
    const user = userMap.get(step.assignedUserId);
    const userEmail = user?.notificationEmail || user?.email;
    if (!user || !userEmail || user.isDisabled) continue;

    const isFinal = (step as any).isFinalApproval === true || i === finalIdx;
    const eventType: EmailEventType = isFinal ? 'UPCOMING_FINAL_APPROVER_NOTICE' : 'UPCOMING_SIGNER_NOTICE';

    items.push(
      createOutboxItem(eventType, request, {
        id: user.id,
        name: user.name,
        email: userEmail,
      }, nowMs, {
        stageName: step.stageName,
        isFinalApprover: isFinal,
        emailNote: note,
      })
    );
  }

  return items;
}

export function buildNextActionEmail(
  previousRecord: RequestRecord | undefined,
  record: RequestRecord,
  getUser: (userId: string) => OutboxUser | undefined,
  nowMs: number = Date.now()
): OutboxInsertItem | undefined {
  // If the pending approver didn't change (e.g. final approver signed early, intermediate was already pending), do not send duplicate
  if (previousRecord && previousRecord.currentApproverId === record.currentApproverId) {
    return undefined;
  }

  const currentStep = record.approvalSteps.find(s => s.status === 'Pending') || record.approvalSteps[record.currentStageIndex];
  if (!currentStep || !currentStep.assignedUserId) return undefined;

  const user = getUser(currentStep.assignedUserId);
  if (!user || user.isDisabled) return undefined;
  const email = user.notificationEmail || user.email;
  if (!email) return undefined;

  return createOutboxItem('ACTION_REQUIRED', record, {
    id: user.id,
    name: user.name,
    email,
  }, nowMs, {
    stageName: currentStep.stageName,
    stageNumber: currentStep.stageNumber,
  });
}

export function buildCompletionEmail(
  record: RequestRecord,
  getUser: (userId: string) => OutboxUser | undefined,
  nowMs: number = Date.now()
): OutboxInsertItem | undefined {
  const requester = getUser(record.requesterId);
  if (!requester || requester.isDisabled) return undefined;
  const email = requester.notificationEmail || requester.email;
  if (!email) return undefined;

  const stepsSummary: StepSummary[] = record.approvalSteps.map(s => ({
    stageName: s.stageName,
    assignedUserName: s.assignedUserName,
    status: s.status === 'Approved' ? 'Signed' : (s.status as any),
    actionDate: s.actionDate,
  }));

  return createOutboxItem('ROUTE_COMPLETED', record, {
    id: requester.id,
    name: requester.name,
    email,
  }, nowMs, {
    completionSummary: {
      completedDate: formatEmailDate(new Date().toISOString()),
      steps: stepsSummary,
    },
  });
}

export function buildReplacementActionEmail(
  record: RequestRecord,
  targetUser: OutboxUser,
  nowMs: number = Date.now()
): OutboxInsertItem | undefined {
  if (targetUser.isDisabled) return undefined;
  const email = targetUser.notificationEmail || targetUser.email;
  if (!email) return undefined;

  const activeStep = record.approvalSteps[record.currentStageIndex];

  return createOutboxItem('ACTION_REQUIRED', record, {
    id: targetUser.id,
    name: targetUser.name,
    email,
  }, nowMs, {
    stageName: activeStep?.stageName,
  });
}

export type NotificationPlan =
  | { kind: 'completion'; userId: string }
  | { kind: 'nextAction'; userId: string }
  | { kind: 'replacement'; userId: string }
  | null;

export function planTransitionNotification(
  action: string,
  record: RequestRecord,
  previousRecord: RequestRecord,
  actorId: string,
  body: { newUserId?: string; accept?: boolean }
): NotificationPlan {
  if (action === 'approve' || action === 'override') {
    if (record.status === 'Approved') {
      return { kind: 'completion', userId: record.requesterId };
    }
    if (record.status === 'Pending Approval' && record.currentApproverId) {
      if (!previousRecord || previousRecord.currentApproverId !== record.currentApproverId) {
        return { kind: 'nextAction', userId: record.currentApproverId };
      }
    }
  } else if (action === 'replace' || action === 'accept-replacement') {
    if (record.status === 'Pending Approval' && record.currentApproverId) {
      const targetId = action === 'replace' ? body.newUserId : actorId;
      if (body.accept !== false && targetId && record.currentApproverId === targetId) {
        return { kind: 'replacement', userId: targetId };
      }
    }
  }
  return null;
}

export function buildNotificationFromPlan(
  plan: NotificationPlan,
  user: OutboxUser | undefined,
  record: RequestRecord,
  previousRecord: RequestRecord,
  nowMs: number = Date.now()
): OutboxInsertItem | undefined {
  if (!plan || !user) return undefined;
  if (plan.kind === 'completion') {
    return buildCompletionEmail(record, () => user, nowMs);
  }
  if (plan.kind === 'nextAction') {
    return buildNextActionEmail(previousRecord, record, () => user, nowMs);
  }
  if (plan.kind === 'replacement') {
    return buildReplacementActionEmail(record, user, nowMs);
  }
  return undefined;
}

export function enqueueOutboxSync(
  db: DatabaseSync,
  items: OutboxInsertItem[]
): void {
  if (!items.length) return;
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO email_outbox (
      id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
      subject, payload_json, idempotency_key, status, attempts, max_attempts,
      created_at, next_attempt_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 3, ?, ?)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.requestId,
      item.eventType,
      item.recipientUserId,
      item.recipientEmail,
      item.recipientName,
      item.subject,
      JSON.stringify(item.payload),
      item.idempotencyKey,
      item.nowMs,
      item.nowMs
    );
  }
}

export async function enqueueOutboxAsync(
  tx: any,
  items: OutboxInsertItem[]
): Promise<void> {
  if (!items.length) return;
  const sql = `
    INSERT OR IGNORE INTO email_outbox (
      id, request_id, event_type, recipient_user_id, recipient_email, recipient_name,
      subject, payload_json, idempotency_key, status, attempts, max_attempts,
      created_at, next_attempt_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 3, ?, ?)
  `;

  for (const item of items) {
    await tx.execute(sql, [
      item.id,
      item.requestId,
      item.eventType,
      item.recipientUserId,
      item.recipientEmail,
      item.recipientName,
      item.subject,
      JSON.stringify(item.payload),
      item.idempotencyKey,
      item.nowMs,
      item.nowMs,
    ]);
  }
}
