import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  buildDynamicSummary,
  buildAmountHighlight,
  createOutboxItem,
} from './email/outboxStore';
import { renderEmailContent } from './email/emailTemplates';
import type { RequestRecord } from '../src/types/index';

test('Task 1 — All 4 forms generate correct summaries and amount highlights in HTML and Plain Text', async (t) => {
  const recipient = { id: 'u-approver', name: 'Approver Person', email: 'approver@example.test' };

  await t.test('1. Administrative & Payment Request renders correctly with all fields', () => {
    const request: RequestRecord = {
      id: `PEW-AP-2026-${randomUUID()}`,
      displayId: 'PEW-AP-2026-0001',
      formType: 'Administrative & Payment Request',
      companyId: 'PEW',
      title: 'Workshop Supplies',
      requesterId: 'u-requester',
      requesterName: 'Anzar Requester',
      requesterRole: 'Admin',
      department: 'Operations',
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
      status: 'Pending Approval',
      currentStageIndex: 0,
      currentApproverId: 'u-approver',
      currentApproverName: 'Approver Person',
      workflowVersion: 1,
      documentVersion: 1,
      workflowConfig: { id: 'wf1', companyId: 'PEW', formType: 'Administrative & Payment Request', version: 1, stages: [] } as any,
      approvalSteps: [],
      approvalHistory: [],
      attachments: [],
      formData: {
        dateOfRequest: '10 Nov 2026',
        companyId: 'PEW',
        companyName: 'Precision Engineering Works',
        requesterId: 'u-requester',
        requesterName: 'Anzar Requester',
        department: 'Operations',
        priority: 'Medium',
        workDescription: 'Workshop equipment repair',
        documents: {
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
        },
        administrativePayment: {
          documentDescription: 'Quotation enclosed',
          payment: {
            amount: '5000',
            transferMode: 'Bank',
            transferDetails: 'SA1234567890123456789012',
            purpose: 'Other',
            otherPurpose: 'Replace lathe bearings',
          },
        },
      },
      versionSnapshots: [],
    };

    const summary = buildDynamicSummary(request, 'PEW-AP-2026-0001');
    const amountHighlight = buildAmountHighlight(request);

    assert.equal(amountHighlight?.label, 'Payment Amount');
    assert.equal(amountHighlight?.amount, '5000');
    assert.equal(amountHighlight?.currency, 'SAR');

    const summaryMap = new Map(summary.map(r => [r.label, r.value]));
    assert.equal(summaryMap.get('Company'), 'Precision Engineering Works');
    assert.equal(summaryMap.get('Form'), 'Administrative & Payment Request');
    assert.equal(summaryMap.get('Reference'), 'PEW-AP-2026-0001');
    assert.equal(summaryMap.get('Requester'), 'Anzar Requester');
    assert.equal(summaryMap.get('Department'), 'Operations');
    assert.equal(summaryMap.get('Priority'), 'Medium');
    assert.equal(summaryMap.get('Work'), 'Workshop equipment repair');
    assert.equal(summaryMap.get('Amount'), '5000 SAR');
    assert.equal(summaryMap.get('Purpose'), 'Replace lathe bearings');

    const outboxItem = createOutboxItem('ACTION_REQUIRED', request, recipient, Date.now());
    const rendered = renderEmailContent('ACTION_REQUIRED', outboxItem.payload);

    assert.ok(rendered.html.includes('Precision Engineering Works'));
    assert.ok(rendered.html.includes('Workshop equipment repair'));
    assert.ok(rendered.html.includes('5000'));
    // Bank account details must NOT leak into the email
    assert.ok(!rendered.html.includes('SA1234567890123456789012'));
    assert.ok(!rendered.text.includes('SA1234567890123456789012'));
  });

  await t.test('2. IT Request reads from nested itRequest and omits justification', () => {
    const request: RequestRecord = {
      id: `ICCL-IT-2026-${randomUUID()}`,
      displayId: 'ICCL-IT-2026-0042',
      formType: 'IT Request',
      companyId: 'ICCL',
      title: 'Dev Laptop Upgrade',
      requesterId: 'u-tariq',
      requesterName: 'Tariq Al-Harbi',
      requesterRole: 'Senior Engineer',
      department: 'Engineering',
      createdAt: '2026-11-12T08:00:00.000Z',
      updatedAt: '2026-11-12T08:00:00.000Z',
      status: 'Pending Approval',
      currentStageIndex: 0,
      currentApproverId: 'u-approver',
      currentApproverName: 'Approver Person',
      workflowVersion: 1,
      documentVersion: 1,
      workflowConfig: { id: 'wf-it', companyId: 'ICCL', formType: 'IT Request', version: 1, stages: [] } as any,
      approvalSteps: [],
      approvalHistory: [],
      attachments: [],
      formData: {
        dateOfRequest: '12 Nov 2026',
        companyId: 'ICCL',
        companyName: 'International Contracting Co.',
        requesterId: 'u-tariq',
        requesterName: 'Tariq Al-Harbi',
        department: 'Engineering',
        priority: 'Urgent',
        workDescription: 'Developer laptop replacement and Docker team license',
        documents: {
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
        },
        itRequest: {
          requestType: 'Hardware & Licenses',
          justification: 'CONFIDENTIAL: Internal budget code #9921 for R&D expansion only.',
        },
      },
      versionSnapshots: [],
    };

    const summary = buildDynamicSummary(request, 'ICCL-IT-2026-0042');
    const summaryMap = new Map(summary.map(r => [r.label, r.value]));

    assert.equal(summaryMap.get('Department'), 'Engineering');
    assert.equal(summaryMap.get('Request Type'), 'Hardware & Licenses');
    assert.equal(summaryMap.get('Priority'), 'Urgent');
    assert.equal(summaryMap.get('Description'), 'Developer laptop replacement and Docker team license');
    // Justification should NOT be in the summary
    assert.equal(summaryMap.has('Justification'), false);

    const outboxItem = createOutboxItem('ACTION_REQUIRED', request, recipient, Date.now());
    const rendered = renderEmailContent('ACTION_REQUIRED', outboxItem.payload);

    assert.ok(rendered.html.includes('Hardware &amp; Licenses') || rendered.html.includes('Hardware & Licenses'));
    assert.ok(rendered.html.includes('Engineering'));
    assert.ok(rendered.html.includes('Developer laptop replacement'));
    assert.ok(!rendered.html.includes('CONFIDENTIAL: Internal budget code'));
    assert.ok(!rendered.text.includes('CONFIDENTIAL: Internal budget code'));
  });

  await t.test('3. Cash Voucher reads payee, amount, and purpose correctly', () => {
    const request: RequestRecord = {
      id: `ICCL-CV-2026-${randomUUID()}`,
      displayId: 'ICCL-CV-2026-0010',
      formType: 'Cash Voucher',
      companyId: 'ICCL',
      title: 'Tender Courier',
      requesterId: 'u-salem',
      requesterName: 'Salem Mansoor',
      requesterRole: 'Coordinator',
      department: 'Administration',
      createdAt: '2026-11-11T11:00:00.000Z',
      updatedAt: '2026-11-11T11:00:00.000Z',
      status: 'Pending Approval',
      currentStageIndex: 0,
      currentApproverId: 'u-approver',
      currentApproverName: 'Approver Person',
      workflowVersion: 1,
      documentVersion: 1,
      workflowConfig: { id: 'wf-cv', companyId: 'ICCL', formType: 'Cash Voucher', version: 1, stages: [] } as any,
      approvalSteps: [],
      approvalHistory: [],
      attachments: [],
      formData: {
        dateOfRequest: '11 Nov 2026',
        companyId: 'ICCL',
        companyName: 'International Contracting Co.',
        requesterId: 'u-salem',
        requesterName: 'Salem Mansoor',
        department: 'Administration',
        priority: 'Medium',
        workDescription: 'Urgent customs clearance fee and courier',
        documents: {
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
        },
        cashVoucher: {
          payee: 'Al-Madina Express Courier',
          recipientUserId: 'u-salem',
          amount: '850',
          amountInWords: 'Eight Hundred Fifty Saudi Riyals',
          source: 'Admin petty cash',
        },
      },
      versionSnapshots: [],
    };

    const summary = buildDynamicSummary(request, 'ICCL-CV-2026-0010');
    const amountHighlight = buildAmountHighlight(request);

    assert.equal(amountHighlight?.label, 'Voucher Amount');
    assert.equal(amountHighlight?.amount, '850');
    assert.equal(amountHighlight?.currency, 'SAR');

    const summaryMap = new Map(summary.map(r => [r.label, r.value]));
    assert.equal(summaryMap.get('Payee'), 'Al-Madina Express Courier');
    assert.equal(summaryMap.get('Amount'), '850 SAR');
    assert.equal(summaryMap.get('Purpose'), 'Urgent customs clearance fee and courier');

    const outboxItem = createOutboxItem('ACTION_REQUIRED', request, recipient, Date.now());
    const rendered = renderEmailContent('ACTION_REQUIRED', outboxItem.payload);

    assert.ok(rendered.html.includes('Al-Madina Express Courier'));
    assert.ok(rendered.html.includes('850'));
    assert.ok(rendered.text.includes('Payee: Al-Madina Express Courier'));
    assert.ok(rendered.text.includes('Amount: 850 SAR'));
    assert.ok(rendered.text.includes('Purpose: Urgent customs clearance fee and courier'));
  });

  await t.test('4. Expense Claim reads claimant, project, line count, and computes total claimed', () => {
    const request: RequestRecord = {
      id: `ICCL-EC-2026-${randomUUID()}`,
      displayId: 'ICCL-EC-2026-0088',
      formType: 'Expense Claim',
      companyId: 'ICCL',
      title: 'Site Visit Audit',
      requesterId: 'u-fahad',
      requesterName: 'Fahad Al-Otaibi',
      requesterRole: 'Field Engineer',
      department: 'Projects',
      createdAt: '2026-11-10T14:00:00.000Z',
      updatedAt: '2026-11-10T14:00:00.000Z',
      status: 'Pending Approval',
      currentStageIndex: 0,
      currentApproverId: 'u-approver',
      currentApproverName: 'Approver Person',
      workflowVersion: 1,
      documentVersion: 1,
      workflowConfig: { id: 'wf-ec', companyId: 'ICCL', formType: 'Expense Claim', version: 1, stages: [] } as any,
      approvalSteps: [],
      approvalHistory: [],
      attachments: [],
      formData: {
        dateOfRequest: '10 Nov 2026',
        companyId: 'ICCL',
        companyName: 'International Contracting Co.',
        requesterId: 'u-fahad',
        requesterName: 'Fahad Al-Otaibi',
        department: 'Projects',
        priority: 'Medium',
        workDescription: 'Site accommodation and travel expenses',
        documents: {
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
        },
        expenseClaim: {
          designation: 'Field Engineer',
          project: 'EP-204 Substation Audit',
          lines: [
            { date: '2026-11-06', particulars: 'SECRET HOTEL RECEIPT DETAILS', amount: '1800' },
            { date: '2026-11-07', particulars: 'Train tickets', amount: '650' },
            { date: '2026-11-08', particulars: 'Vehicle rental', amount: '800' },
          ],
        },
      },
      versionSnapshots: [],
    };

    const summary = buildDynamicSummary(request, 'ICCL-EC-2026-0088');
    const amountHighlight = buildAmountHighlight(request);

    assert.equal(amountHighlight?.label, 'Total Claimed');
    assert.equal(amountHighlight?.amount, '3,250'); // 1800 + 650 + 800
    assert.equal(amountHighlight?.currency, 'SAR');

    const summaryMap = new Map(summary.map(r => [r.label, r.value]));
    assert.equal(summaryMap.get('Claimant'), 'Fahad Al-Otaibi');
    assert.equal(summaryMap.get('Project'), 'EP-204 Substation Audit');
    assert.equal(summaryMap.get('Total Claimed'), '3,250 SAR');
    assert.equal(summaryMap.get('Expense Lines'), '3 lines');

    const outboxItem = createOutboxItem('ACTION_REQUIRED', request, recipient, Date.now());
    const rendered = renderEmailContent('ACTION_REQUIRED', outboxItem.payload);

    assert.ok(rendered.html.includes('Fahad Al-Otaibi'));
    assert.ok(rendered.html.includes('EP-204 Substation Audit'));
    assert.ok(rendered.html.includes('3 lines'));
    assert.ok(rendered.html.includes('3,250'));
    // Individual expense item particulars must stay inside PreciSign
    assert.ok(!rendered.html.includes('SECRET HOTEL RECEIPT DETAILS'));
    assert.ok(!rendered.text.includes('SECRET HOTEL RECEIPT DETAILS'));
  });

  await t.test('5. Expense Claim omits project row when project is empty', () => {
    const request: RequestRecord = {
      id: `ICCL-EC-2026-${randomUUID()}`,
      displayId: 'ICCL-EC-2026-0089',
      formType: 'Expense Claim',
      companyId: 'ICCL',
      title: 'General Claim',
      requesterId: 'u-fahad',
      requesterName: 'Fahad Al-Otaibi',
      requesterRole: 'Field Engineer',
      department: 'Projects',
      createdAt: '2026-11-10T14:00:00.000Z',
      updatedAt: '2026-11-10T14:00:00.000Z',
      status: 'Pending Approval',
      currentStageIndex: 0,
      currentApproverId: 'u-approver',
      currentApproverName: 'Approver Person',
      workflowVersion: 1,
      documentVersion: 1,
      workflowConfig: { id: 'wf-ec', companyId: 'ICCL', formType: 'Expense Claim', version: 1, stages: [] } as any,
      approvalSteps: [],
      approvalHistory: [],
      attachments: [],
      formData: {
        dateOfRequest: '10 Nov 2026',
        companyId: 'ICCL',
        companyName: 'ICCL',
        requesterId: 'u-fahad',
        requesterName: 'Fahad Al-Otaibi',
        department: 'Projects',
        priority: 'Medium',
        workDescription: 'General claim',
        documents: {
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
        },
        expenseClaim: {
          designation: 'Engineer',
          project: '', // Empty optional field
          lines: [{ date: '2026-11-06', particulars: 'Office supply', amount: '120' }],
        },
      },
      versionSnapshots: [],
    };

    const summary = buildDynamicSummary(request, 'ICCL-EC-2026-0089');
    const summaryMap = new Map(summary.map(r => [r.label, r.value]));
    assert.equal(summaryMap.has('Project'), false, 'Empty project must be omitted');
  });
});

