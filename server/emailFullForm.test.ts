import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, transaction } from '../server/db';
import {
  allocateSequenceSync,
  allocateSequenceAsync,
  formatSequenceReference,
  getRequestDisplayReference,
  formTypeToPrefix,
} from './email/requestSequence';
import { renderEmailContent, renderEmailSubject, escapeHtml } from './email/emailTemplates';
import { createOutboxItem, buildSubmissionEmails } from './email/outboxStore';
import type { EmailPayload, FormBilingualPreview } from './email/types';
import type { RequestRecord, UserProfile } from '../src/types/index';
import { resubmitCorrectedRequest } from '../src/utils/workflowEngine';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

test('1. Sequence counter: scoped by company, form code, and year (SQLite & Turso compatibility)', async (t) => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE request_counters (
      company_id TEXT NOT NULL,
      form_code TEXT NOT NULL,
      year INTEGER NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, form_code, year)
    );
  `);

  // Sync SQLite allocation
  const iccl1 = allocateSequenceSync(db, 'ICCL', 'AP', 2026);
  assert.equal(iccl1, 'ICCL-AP-2026-0001');

  const iccl2 = allocateSequenceSync(db, 'ICCL', 'AP', 2026);
  assert.equal(iccl2, 'ICCL-AP-2026-0002');

  // Scoped by company
  const pew1 = allocateSequenceSync(db, 'PEW', 'AP', 2026);
  assert.equal(pew1, 'PEW-AP-2026-0001');

  // Scoped by form code
  const icclAw1 = allocateSequenceSync(db, 'ICCL', 'AW', 2026);
  assert.equal(icclAw1, 'ICCL-AW-2026-0001');

  // Scoped by year
  const iccl2027 = allocateSequenceSync(db, 'ICCL', 'AP', 2027);
  assert.equal(iccl2027, 'ICCL-AP-2027-0001');

  // Async connection (Turso compatibility mock)
  const mockTursoConnection: any = {
    async execute(sql: string, args: any = []) {
      if (sql.trim().toUpperCase().startsWith('INSERT')) {
        db.prepare(sql).run(...(args as any));
        return { rows: [] };
      }
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const row = db.prepare(sql).get(...(args as any));
        return { rows: row ? [row] : [] };
      }
      return { rows: [] };
    },
  };

  const asyncRef = await allocateSequenceAsync(mockTursoConnection, 'ICCL', 'AP', 2026);
  assert.equal(asyncRef, 'ICCL-AP-2026-0003', 'Async allocation increments and returns next sequence');
});

test('2. Sequence reference preservation across correction and legacy fallback', () => {
  // Legacy request without displayId
  const legacyUuidReq = { id: 'PEW-AW-2026-63d0a16d-2ffd-496a-a48d-28ef4ff6b9ba' };
  assert.equal(getRequestDisplayReference(legacyUuidReq), 'PEW-AW-2026-63d0a16d-2ffd-496a-a48d-28ef4ff6b9ba');

  const legacySeedReq = { id: 'PEW-AW-2026-0018' };
  assert.equal(getRequestDisplayReference(legacySeedReq), 'PEW-AW-2026-0018');

  // Sequenced request with displayId
  const sequencedReq: RequestRecord = {
    id: 'ICCL-AP-2026-random-uuid-1234',
    displayId: 'ICCL-AP-2026-0001',
    emailNote: 'Please process urgently',
    formType: 'Administrative & Payment Request',
    companyId: 'ICCL',
    title: 'Shelf repair',
    requesterId: 'user-anzar',
    requesterName: 'Anzar',
    requesterRole: 'Employee',
    department: 'Operations',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'Returned for Correction',
    currentStageIndex: 0,
    workflowVersion: 1,
    documentVersion: 1,
    workflowConfig: {
      id: 'wf-1',
      companyId: 'ICCL',
      formType: 'Administrative & Payment Request',
      version: 1,
      stages: [
        { id: 's1', stageNumber: 1, name: 'Dept Head Review', assignedUserId: 'user-shekhar', isFinalApproval: false, canReject: true, canReturnForCorrection: true, mapsToDocumentSignature: true },
        { id: 's2', stageNumber: 2, name: 'Director Approval', assignedUserId: 'user-afzal', isFinalApproval: true, canReject: true, canReturnForCorrection: true, mapsToDocumentSignature: true },
      ],
    } as any,
    approvalSteps: [
      { stageId: 's1', stageNumber: 1, stageName: 'Dept Head Review', assignedUserId: 'user-shekhar', assignedUserName: 'Shekhar', assignedRole: 'Manager', status: 'Pending' },
      { stageId: 's2', stageNumber: 2, stageName: 'Director Approval', assignedUserId: 'user-afzal', assignedUserName: 'Afzal', assignedRole: 'Director', status: 'Waiting' },
    ],
    approvalHistory: [],
    attachments: [],
    formData: {
      dateOfRequest: '2026-11-12',
      companyId: 'ICCL',
      companyName: 'ICCL · Instrumental Control Co Ltd',
      requesterId: 'user-anzar',
      requesterName: 'Anzar',
      department: 'Operations',
      priority: 'Medium',
      workDescription: 'Replace worn workshop shelving',
      documents: {} as any,
      administrativePayment: {
        documentDescription: 'Quotation provided',
        payment: { amount: '3500', transferMode: 'Bank', purpose: 'Government Payment' },
      },
    },
    versionSnapshots: [],
  };

  assert.equal(getRequestDisplayReference(sequencedReq), 'ICCL-AP-2026-0001');

  // Resubmit correction
  const actingUser: UserProfile = {
    id: 'user-anzar',
    name: 'Anzar',
    email: 'anzar@example.test',
    role: 'Employee',
    department: 'Operations',
    companyId: 'ICCL',
    avatarColor: '#10243a',
    initials: 'AZ',
  };

  const resubmitResult = resubmitCorrectedRequest({
    request: sequencedReq,
    actingUser,
    updatedFormData: {
      ...sequencedReq.formData,
      workDescription: 'Updated: Replace worn workshop shelving and reinforcement',
    },
    changeNote: 'Added reinforcement',
  });

  assert.equal(resubmitResult.success, true);
  const corrected = resubmitResult.updatedRequest!;
  assert.equal(corrected.documentVersion, 2);
  assert.equal(corrected.id, 'ICCL-AP-2026-random-uuid-1234', 'Preserves existing request ID');
  assert.equal(corrected.displayId, 'ICCL-AP-2026-0001', 'Preserves short display reference across corrections');
  assert.equal(corrected.emailNote, 'Please process urgently', 'Preserves email note across corrections');
});

test('3. Full bilingual inline form rendering, notes, logo fallback, and escaping', () => {
  const payload: EmailPayload = {
    companyId: 'ICCL',
    companyName: 'ICCL · Instrumental Control Co Ltd',
    formType: 'Administrative & Payment Request',
    requestId: 'ICCL-AP-2026-uuid-9999',
    displayId: 'ICCL-AP-2026-0001',
    requesterName: 'Anzar <script>alert(1)</script>',
    recipientName: 'Shekhar',
    recipientEmail: 'shekhar@example.test',
    portalUrl: 'http://localhost:5173/requests/ICCL-AP-2026-uuid-9999',
    stageName: 'Department Head Review',
    emailNote: 'Please review before the next workshop shift. <img src=x onerror=alert(1)>',
    formPreview: {
      displayId: 'ICCL-AP-2026-0001',
      companyId: 'ICCL',
      companyName: 'ICCL · Instrumental Control Co Ltd',
      companyNameArabic: '',
      formTitleEnglish: 'Administrative & Payment Request Form',
      formTitleArabic: 'نموذج طلب إداري ودفع',
      dateOfRequest: '08 Nov 2026',
      department: 'Operations',
      requesterName: 'Anzar',
      documentsDescription: 'Supplier quotation provided.',
      priority: 'Medium',
      workDescription: 'Replace worn workshop shelving.',
      adminUseOnly: {
        status: '',
        completionDate: '',
        completedByName: '',
      },
      payment: {
        amount: '3,500 SAR',
        transferMode: 'Bank',
        purpose: 'Workshop shelving replacement.',
      },
      signatures: {
        requester: { english: 'Requester Signature', arabic: 'توقيع صاحب الطلب', name: 'Anzar', status: 'Signed' },
        departmentHead: { english: 'Department Head Signature', arabic: 'توقيع رئيس القسم', name: 'Shekhar', status: 'Pending' },
        approver: { english: 'Approver Signature', arabic: 'توقيع المخول بالاعتماد', name: 'Afzal Kazi', status: 'Waiting' },
      },
      notes: [
        'Urgent-Priority requests will be processed within the same hour/immediately.',
        'Medium-Priority requests will be processed within 3 days.',
        'Low-Priority requests will be processed within 7 days.',
        'Payment will be processed in three – Four Working days after submission of request, If Urgent Payment, please mention in the form to process urgently.',
        'Supporting documents must be appropriate otherwise requested will be returned and payment will not be processed, and finance will not be responsible for such delays.',
        'Supporting documents must have company name; vat Number of both the parties',
        'Advance Cash must be closed / Petty cash claim should be submitted within 2 weeks.',
      ],
    },
  };

  // Test action required (Assigned Signer)
  const signerEmail = renderEmailContent('ACTION_REQUIRED', payload);
  const signerSubject = renderEmailSubject('ACTION_REQUIRED', payload);

  assert.equal(signerSubject, 'Signature needed · Administrative & Payment Request · ICCL-AP-2026-0001');

  // Verify Header & Logo Fallback
  assert.ok(signerEmail.html.includes('background-color: #0A1E35'), 'Navy header present');
  assert.ok(signerEmail.html.includes('PreciSign</span>'), 'PreciSign visible as text even if images are blocked');

  // Verify Badge & Headline
  assert.ok(signerEmail.html.includes('ACTION REQUIRED'));
  assert.ok(signerEmail.html.includes('Your signature is needed'));
  assert.ok(signerEmail.html.includes('Hi Shekhar, Anzar &lt;script&gt;alert(1)&lt;/script&gt; submitted this request for your review.'));

  // Verify Bilingual Form Inline Card
  assert.ok(signerEmail.html.includes('ICCL · Instrumental Control Co Ltd'));
  assert.ok(signerEmail.html.includes('Administrative &amp; Payment Request Form'));
  assert.ok(signerEmail.html.includes('نموذج طلب إداري ودفع'));
  assert.ok(signerEmail.html.includes('Date of Request'));
  assert.ok(signerEmail.html.includes('تاريخ الطلب'));
  assert.ok(signerEmail.html.includes('08 Nov 2026'));
  assert.ok(signerEmail.html.includes('Department'));
  assert.ok(signerEmail.html.includes('القسم'));
  assert.ok(signerEmail.html.includes('Operations'));
  assert.ok(signerEmail.html.includes('Name of the Requester'));
  assert.ok(signerEmail.html.includes('اسم صاحب الطلب'));
  assert.ok(signerEmail.html.includes('Supplier quotation provided.'));
  assert.ok(signerEmail.html.includes('Priority'));
  assert.ok(signerEmail.html.includes('الأهمية'));
  assert.ok(signerEmail.html.includes('Medium'));
  assert.ok(signerEmail.html.includes('Work Description'));
  assert.ok(signerEmail.html.includes('وصف الطلب'));
  assert.ok(signerEmail.html.includes('Replace worn workshop shelving.'));

  // Verify Admin & Payment Sections
  assert.ok(signerEmail.html.includes('Administrative Team Use Only'));
  assert.ok(signerEmail.html.includes('Payment Section'));
  assert.ok(signerEmail.html.includes('قسم الدفع'));
  assert.ok(signerEmail.html.includes('3,500 SAR'));
  assert.ok(signerEmail.html.includes('Bank'));
  assert.ok(signerEmail.html.includes('Workshop shelving replacement.'));

  // Verify Signatures
  assert.ok(signerEmail.html.includes('Requester Signature'));
  assert.ok(signerEmail.html.includes('توقيع صاحب الطلب'));
  assert.ok(signerEmail.html.includes('Anzar'));
  assert.ok(signerEmail.html.includes('(Signed)'));
  assert.ok(signerEmail.html.includes('Department Head Signature'));
  assert.ok(signerEmail.html.includes('توقيع رئيس القسم'));
  assert.ok(signerEmail.html.includes('Approver Signature'));
  assert.ok(signerEmail.html.includes('توقيع المخول بالاعتماد'));
  assert.ok(!signerEmail.html.includes('data:image/'), 'No raw signature image bytes embedded in email');

  // Verify Printed Notes (exact from official renderer)
  assert.ok(signerEmail.html.includes('Urgent-Priority requests will be processed within the same hour/immediately.'));
  assert.ok(signerEmail.html.includes('Advance Cash must be closed / Petty cash claim should be submitted within 2 weeks.'));

  // Verify Note from Requester
  assert.ok(signerEmail.html.includes('Note from Anzar &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(signerEmail.html.includes('Please review before the next workshop shift. &lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!signerEmail.html.includes('<script>'));

  // Verify Teal Action Button & Local-only link labelling
  assert.ok(signerEmail.html.includes('Review &amp; sign'), 'Assigned signer sees Review & sign');
  assert.ok(signerEmail.html.includes('background-color: #0D9488'), 'Teal button color');
  assert.ok(signerEmail.html.includes('Local-only link: opens only on the computer running PreciSign'));

  // Test requester submission confirmation
  const reqEmail = renderEmailContent('REQUEST_SUBMITTED', payload);
  const reqSubject = renderEmailSubject('REQUEST_SUBMITTED', payload);
  assert.equal(reqSubject, 'Request submitted · Administrative & Payment Request · ICCL-AP-2026-0001');
  assert.ok(reqEmail.html.includes('View submitted form'), 'Requester sees View submitted form');

  // Verify plain text fallback
  assert.ok(signerEmail.text.includes('ICCL · Instrumental Control Co Ltd'));
  assert.ok(signerEmail.text.includes('3,500 SAR'));
  assert.ok(signerEmail.text.includes('Action: Review & sign'));
  assert.ok(signerEmail.text.includes('Note from Anzar'));
});

test('4. Outbox payload freezing: captured preview is immutable against later request edits', () => {
  const req: RequestRecord = {
    id: 'ICCL-AP-2026-freeze-test',
    displayId: 'ICCL-AP-2026-0042',
    emailNote: 'Initial note for email',
    formType: 'Administrative & Payment Request',
    companyId: 'ICCL',
    title: 'Piping work',
    requesterId: 'user-1',
    requesterName: 'Anzar',
    requesterRole: 'Employee',
    department: 'Maintenance',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'Pending Approval',
    currentStageIndex: 0,
    workflowVersion: 1,
    documentVersion: 1,
    workflowConfig: {
      id: 'wf-1', companyId: 'ICCL', formType: 'Administrative & Payment Request', version: 1, stages: [
        { id: 's1', stageNumber: 1, name: 'Head', assignedUserId: 'user-2', isFinalApproval: true, canReject: true, canReturnForCorrection: true, mapsToDocumentSignature: true },
      ],
    } as any,
    approvalSteps: [
      { stageId: 's1', stageNumber: 1, stageName: 'Department Head', assignedUserId: 'user-2', assignedUserName: 'Shekhar', assignedRole: 'Manager', status: 'Pending' },
    ],
    approvalHistory: [],
    attachments: [],
    formData: {
      dateOfRequest: '2026-11-12',
      companyId: 'ICCL',
      companyName: 'ICCL · Instrumental Control Co Ltd',
      requesterId: 'user-1',
      requesterName: 'Anzar',
      department: 'Maintenance',
      priority: 'Urgent',
      workDescription: 'Frozen work description version 1',
      documents: {} as any,
      administrativePayment: {
        documentDescription: 'Initial quote',
        payment: { amount: '5000', transferMode: 'Bank', purpose: 'Advance Cash' },
      },
    },
    versionSnapshots: [],
  };

  const recipient = { id: 'user-2', name: 'Shekhar', email: 'shekhar@example.test' };
  const item = createOutboxItem('ACTION_REQUIRED', req, recipient, Date.now());

  assert.ok(item.payload.formPreview);
  assert.equal(item.payload.formPreview.workDescription, 'Frozen work description version 1');
  assert.equal(item.payload.formPreview.payment.amount, '5000 SAR');
  assert.equal(item.payload.emailNote, 'Initial note for email');

  // Now mutate req extensively
  req.formData.workDescription = 'Mutated work description version 2';
  req.formData.administrativePayment!.payment!.amount = '99999';
  req.emailNote = 'Mutated note';

  // The queued payload must remain 100% frozen and untouched
  assert.equal(item.payload.formPreview.workDescription, 'Frozen work description version 1');
  assert.equal(item.payload.formPreview.payment.amount, '5000 SAR');
  assert.equal(item.payload.emailNote, 'Initial note for email');
});

test('5. Generate desktop (600px) and phone (360px) HTML preview files', () => {
  const payload: EmailPayload = {
    companyId: 'ICCL',
    companyName: 'ICCL · Instrumental Control Co Ltd',
    formType: 'Administrative & Payment Request',
    requestId: 'ICCL-AP-2026-synthetic-demo',
    displayId: 'ICCL-AP-2026-0001',
    requesterName: 'Anzar',
    recipientName: 'Shekhar',
    recipientEmail: 'shekhar@example.test',
    portalUrl: 'http://localhost:5173/requests/ICCL-AP-2026-synthetic-demo',
    stageName: 'Department Head Signature',
    emailNote: 'Please review before the next workshop shift.',
    formPreview: {
      displayId: 'ICCL-AP-2026-0001',
      companyId: 'ICCL',
      companyName: 'ICCL · Instrumental Control Co Ltd',
      companyNameArabic: 'شركة التحكم الآلي المحدودة',
      formTitleEnglish: 'Administrative & Payment Request Form',
      formTitleArabic: 'نموذج طلب إداري ودفع',
      dateOfRequest: '08 Nov 2026',
      department: 'Operations',
      requesterName: 'Anzar',
      documentsDescription: 'Supplier quotation provided.',
      priority: 'Medium',
      workDescription: 'Replace worn workshop shelving.',
      adminUseOnly: {
        status: '',
        completionDate: '',
        completedByName: '',
      },
      payment: {
        amount: '3,500 SAR',
        transferMode: 'Bank',
        purpose: 'Workshop shelving replacement.',
      },
      signatures: {
        requester: { english: 'Requester Signature', arabic: 'توقيع مقدم الطلب', name: 'Anzar', status: 'Signed' },
        departmentHead: { english: 'Department Head Signature', arabic: 'توقيع رئيس القسم', name: 'Shekhar', status: 'Pending' },
        approver: { english: 'Approver Signature', arabic: 'توقيع المعتمد', name: 'Afzal Kazi', status: 'Waiting' },
      },
      notes: {
        english: [
          'Complete the administrative section after the work is finished.',
          'Ensure the payment details are verified before approval.',
          'Attach supporting documents as required (e.g., quotation, delivery note, etc.).',
        ],
        arabic: [
          'يُستكمل القسم الإداري بعد الانتهاء من العمل.',
          'التأكد من صحة تفاصيل الدفع قبل الاعتماد.',
          'إرفاق المستندات الداعمة المطلوبة (مثل عرض السعر، إشعار التسليم، إلخ).',
        ],
      },
    },
  };

  const { html } = renderEmailContent('ACTION_REQUIRED', payload);

  // Desktop view HTML (wrapped in standard 600px viewport preview container)
  const desktopHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PreciSign Email Preview - Desktop (600px)</title>
  <style>
    body { background-color: #E2E8F0; margin: 0; padding: 40px 10px; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; }
    .preview-header { margin-bottom: 16px; color: #1E293B; font-weight: bold; font-size: 14px; }
    .viewport-frame { width: 600px; max-width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.15); border-radius: 8px; overflow: hidden; }
  </style>
</head>
<body>
  <div class="preview-header">Desktop Preview (600px viewport) — Subject: Signature needed · Administrative &amp; Payment Request · ICCL-AP-2026-0001</div>
  <div class="viewport-frame">
    ${html}
  </div>
</body>
</html>
  `.trim();

  // Phone view HTML (wrapped in standard 360px mobile viewport preview container)
  const phoneHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PreciSign Email Preview - Phone (360px)</title>
  <style>
    body { background-color: #E2E8F0; margin: 0; padding: 20px 10px; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; }
    .preview-header { margin-bottom: 12px; color: #1E293B; font-weight: bold; font-size: 13px; text-align: center; }
    .viewport-frame { width: 360px; max-width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.2); border-radius: 20px; overflow: hidden; border: 8px solid #0F172A; }
  </style>
</head>
<body>
  <div class="preview-header">Phone Preview (360px viewport) — Mobile Layout</div>
  <div class="viewport-frame">
    ${html}
  </div>
</body>
</html>
  `.trim();

  const previewDir = join(process.cwd(), 'docs', 'email-previews');
  mkdirSync(previewDir, { recursive: true });

  const desktopPath = join(previewDir, 'action-needed-desktop-preview.html');
  const phonePath = join(previewDir, 'action-needed-phone-preview.html');
  const rawEmailPath = join(previewDir, 'action-needed-email-raw.html');

  writeFileSync(desktopPath, desktopHtml, 'utf-8');
  writeFileSync(phonePath, phoneHtml, 'utf-8');
  writeFileSync(rawEmailPath, html, 'utf-8');

  assert.ok(html.length > 500);
});

test('6. Review findings verification: signature mapping, company name, notes, and blank department head', () => {
  // Case A: Single approver route (No department-head step in workflow)
  const singleApproverReq: RequestRecord = {
    id: 'ICCL-AP-2026-single-approver',
    displayId: 'ICCL-AP-2026-0005',
    formType: 'Administrative & Payment Request',
    companyId: 'ICCL',
    title: 'Single Approver Test',
    requesterId: 'u-anzar',
    requesterName: 'Anzar',
    requesterRole: 'Admin',
    department: 'Operations',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'Pending Approval',
    currentStageIndex: 0,
    workflowVersion: 1,
    documentVersion: 1,
    workflowConfig: {
      id: 'wf-single', companyId: 'ICCL', formType: 'Administrative & Payment Request', version: 1, stages: [
        { id: 'stg-final', stageNumber: 1, name: 'Approver Signature', assignedUserId: 'u-afzal', isFinalApproval: true, canReject: true, canReturnForCorrection: true, mapsToDocumentSignature: true },
      ],
    } as any,
    approvalSteps: [
      { stageId: 'stg-final', stageNumber: 1, stageName: 'Approver Signature', assignedUserId: 'u-afzal', assignedUserName: 'Afzal Kazi', assignedRole: 'Director', status: 'Pending' },
    ],
    approvalHistory: [],
    attachments: [],
    formData: {
      dateOfRequest: '2026-11-12',
      companyId: 'ICCL',
      companyName: 'ICCL · Captured Subsidiary Name Ltd',
      requesterId: 'u-anzar',
      requesterName: 'Anzar',
      requesterSignatureName: 'Anzar',
      department: 'Operations',
      priority: 'Medium',
      workDescription: 'Single approver maintenance',
      documents: {} as any,
      administrativePayment: {
        documentDescription: 'Docs',
        payment: { amount: '1200', transferMode: 'Bank', purpose: 'Other', otherPurpose: 'Filters' },
      },
    },
    versionSnapshots: [],
  };

  const recipient = { id: 'u-afzal', name: 'Afzal Kazi', email: 'afzal@example.test' };
  const outboxItem = createOutboxItem('ACTION_REQUIRED', singleApproverReq, recipient, Date.now());
  const preview = outboxItem.payload.formPreview!;
  assert.ok(preview);

  // 1. Finding 2: Missing department-head step MUST leave that space blank
  assert.equal(preview.signatures.departmentHead.name, '', 'Department head space is blank');
  assert.equal(preview.signatures.departmentHead.status, '', 'Department head status is blank');

  // 2. Finding 2: Never duplicate the final approver into department head space
  assert.notEqual(preview.signatures.departmentHead.name, preview.signatures.approver.name);
  assert.equal(preview.signatures.approver.name, 'Afzal Kazi');
  assert.equal(preview.signatures.approver.status, 'Pending'); // Not signed yet!

  // 3. Finding 2: Never show an unsigned person as signed
  assert.notEqual(preview.signatures.approver.status, 'Signed');

  // 4. Finding 3: Company name is captured from submitted request, no invented Arabic company name
  assert.equal(preview.companyName, 'ICCL · Captured Subsidiary Name Ltd');
  assert.equal(preview.companyNameArabic, '');

  // 5. Finding 1: Exact printed notes from official Administrative & Payment Request renderer
  assert.ok(Array.isArray(preview.notes));
  assert.equal(preview.notes.length, 7);
  assert.equal(preview.notes[0], 'Urgent-Priority requests will be processed within the same hour/immediately.');
  assert.equal(preview.notes[6], 'Advance Cash must be closed / Petty cash claim should be submitted within 2 weeks.');

  // Verify HTML rendering: bilingual table includes notes, modern summary omits them
  const renderedBilingual = renderEmailContent('ACTION_REQUIRED', { ...outboxItem.payload, dynamicSummary: undefined });
  assert.ok(renderedBilingual.html.includes('ICCL · Captured Subsidiary Name Ltd'));
  assert.ok(renderedBilingual.html.includes('Notes:'));
  assert.ok(renderedBilingual.html.includes('Urgent-Priority requests will be processed within the same hour/immediately.'));

  const modernRendered = renderEmailContent('ACTION_REQUIRED', outboxItem.payload);
  assert.ok(modernRendered.html.includes('ICCL · Captured Subsidiary Name Ltd'));
  assert.ok(!modernRendered.html.includes('Urgent-Priority requests will be processed'), 'Modern email template omits paper-form policy notes');
});
