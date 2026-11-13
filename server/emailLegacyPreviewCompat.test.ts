import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createOutboxItem, buildAdministrativePaymentPreview } from './email/outboxStore';
import { renderEmailContent } from './email/emailTemplates';
import type { RequestRecord } from '../src/types/index';
import type { EmailPayload } from './email/types';

test('Task 6 — Stop storing unused full-form preview while preserving legacy readability', async (t) => {
  const recipient = { id: 'u-1', name: 'Approver Person', email: 'approver@example.test' };

  const request: RequestRecord = {
    id: `PEW-AP-2026-${randomUUID()}`,
    displayId: 'PEW-AP-2026-0001',
    formType: 'Administrative & Payment Request',
    companyId: 'PEW',
    title: 'Supplies',
    requesterId: 'u-req',
    requesterName: 'Requester Person',
    requesterRole: 'Admin',
    department: 'Operations',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    status: 'Pending Approval',
    currentStageIndex: 0,
    currentApproverId: 'u-1',
    currentApproverName: 'Approver Person',
    workflowVersion: 1,
    documentVersion: 1,
    workflowConfig: { id: 'wf1', companyId: 'PEW', formType: 'Administrative & Payment Request', version: 1, stages: [] } as any,
    approvalSteps: [{ stageId: 's1', stageNumber: 1, stageName: 'Stage 1', assignedUserId: 'u-1', assignedUserName: 'Approver Person', assignedRole: 'Director', status: 'Pending' }],
    approvalHistory: [],
    attachments: [],
    formData: {
      dateOfRequest: '10 Nov 2026',
      companyId: 'PEW',
      companyName: 'Precision Engineering Works',
      requesterId: 'u-req',
      requesterName: 'Requester Person',
      department: 'Operations',
      priority: 'Medium',
      workDescription: 'Workshop overhaul',
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
        documentDescription: 'Quotation',
        payment: {
          amount: '12500',
          transferMode: 'Bank',
          transferDetails: 'SA9988776655443322110000',
          purpose: 'Government Payment',
        },
      },
    },
    versionSnapshots: [],
  };

  await t.test('1. Newly queued message does not generate or store formPreview', () => {
    const item = createOutboxItem('ACTION_REQUIRED', request, recipient, Date.now());

    assert.equal(item.payload.formPreview, undefined, 'formPreview must not be generated/stored for newly queued messages');
    assert.ok(item.payload.dynamicSummary, 'dynamicSummary must be present');
    assert.ok(item.payload.amountHighlight, 'amountHighlight must be present');

    // Rendered output uses compact summary and does not leak transfer details
    const rendered = renderEmailContent('ACTION_REQUIRED', item.payload);
    assert.ok(rendered.html.includes('Request summary'));
    assert.ok(rendered.html.includes('12500'));
    assert.ok(!rendered.html.includes('SA9988776655443322110000'));
    assert.ok(!rendered.text.includes('SA9988776655443322110000'));
  });

  await t.test('2. Legacy payload containing formPreview (and no dynamicSummary) still renders full table', () => {
    const legacyPreview = buildAdministrativePaymentPreview(request, 'PEW-AP-2026-0001');

    const legacyPayload: EmailPayload = {
      companyId: 'PEW',
      companyName: 'Precision Engineering Works',
      formType: 'Administrative & Payment Request',
      requestId: request.id,
      displayId: 'PEW-AP-2026-0001',
      requesterName: 'Requester Person',
      recipientName: 'Approver Person',
      recipientEmail: 'approver@example.test',
      portalUrl: 'https://app.precisign.com/requests/PEW-AP-2026-0001',
      // Legacy message has formPreview, but lacks dynamicSummary
      formPreview: legacyPreview,
    };

    const rendered = renderEmailContent('ACTION_REQUIRED', legacyPayload);

    // Legacy table headers rendered
    assert.ok(rendered.html.includes('form-table'));
    assert.ok(rendered.html.includes('Administrative &amp; Payment Request Form') || rendered.html.includes('Administrative & Payment Request Form'));
    assert.ok(rendered.html.includes('نموذج طلب إداري ودفع'));
    assert.ok(rendered.text.includes('Administrative & Payment Request Form'));
  });
});

