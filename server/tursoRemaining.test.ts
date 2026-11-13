import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import express from 'express';
import { chromium, type Browser } from 'playwright-core';
import { openDatabase } from './db';
import { openAsyncDatabase, migrateAsyncDatabase, type AsyncDatabase } from './asyncDatabase';
import { createApp } from './app';
import { hashPassword, tokenHash, createSession, provisionUser } from './auth';
import { initRemoteTursoTestDb, inspectPdfContent } from './tursoTestSafety';
import type { CompanyId, RequestRecord, WorkflowConfig } from '../src/types/index';
import { INITIAL_WORKFLOWS } from '../src/data/seedData';

test('Turso expanded coverage: workflows, drafts, signatures, resets, branding, and PDFs', async () => {
  const url = process.env.PRECISIGN_TURSO_TEST_URL;
  let remote: AsyncDatabase | undefined;
  if (url) {
    remote = await initRemoteTursoTestDb('tursoRemaining test');
  }
  const local = remote ? undefined : openDatabase(':memory:');
  const db = remote ?? local!;

  const runId = randomUUID().slice(0, 8);
  const createdUserIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdWorkflowTypes: string[] = [];
  let createdPewLogoFixture = false;

  let tempOutDir: string | undefined;
  let server: Server | undefined;
  let browser: Browser | undefined;

  const runSql = async (sql: string, ...args: (string | number)[]) => {
    return remote ? (await remote.execute(sql, args)).rows : local!.prepare(sql).all(...args);
  };

  try {
    // 0. Build connected-mode frontend into temporary directory for PDF export
    tempOutDir = mkdtempSync(join(tmpdir(), `precisign-remaining-build-${runId}-`));
    execFileSync(
      process.execPath,
      ['node_modules/vite/bin/vite.js', 'build', '--outDir', tempOutDir],
      {
        env: { ...process.env, VITE_DATA_MODE: 'api' },
        stdio: 'pipe',
      }
    );

    const addUser = async (options: { name: string; email: string; role: string; companyId: CompanyId; isSuperAdmin?: boolean }) => {
      const id = `u-${runId}-${createdUserIds.length}`;
      if (local) {
        await provisionUser(local, { name: options.name, email: options.email, role: options.role as any, department: 'Test', companyId: options.companyId }, 'Synthetic-pass-123');
        local.prepare('UPDATE users SET id=? WHERE email=?').run(id, options.email);
        local.prepare('INSERT INTO account_access (user_id, company_grants, form_grants, is_super_admin, is_disabled) VALUES (?, ?, ?, ?, 0)').run(
          id,
          JSON.stringify([options.companyId]),
          JSON.stringify({ [options.companyId]: ['Administrative & Payment Request', 'IT Request', 'Admin Work Request'] }),
          options.isSuperAdmin ? 1 : 0,
        );
      } else {
        const hash = await hashPassword('Synthetic-pass-123');
        await remote!.execute(
          'INSERT INTO users (id, email, name, role, department, company_id, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, options.email, options.name, options.role, 'Test', options.companyId, hash],
        );
        await remote!.execute(
          'INSERT INTO account_access (user_id, company_grants, form_grants, is_super_admin, is_disabled) VALUES (?, ?, ?, ?, 0)',
          [
            id,
            JSON.stringify([options.companyId]),
            JSON.stringify({ [options.companyId]: ['Administrative & Payment Request', 'IT Request', 'Admin Work Request'] }),
            options.isSuperAdmin ? 1 : 0,
          ],
        );
      }
      createdUserIds.push(id);
      return id;
    };

    const createTokenForUser = async (id: string) => {
      if (local) {
        return createSession(local, id);
      }
      const token = randomBytes(32).toString('hex');
      await remote!.execute('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
        tokenHash(token),
        id,
        Date.now() + 3600000,
      ]);
      return token;
    };

    // Create accounts with distinct identities and roles
    const superAdminId = await addUser({ name: 'Super Admin', email: `admin-${runId}@example.test`, role: 'Director', companyId: 'PEW', isSuperAdmin: true });
    const requesterId = await addUser({ name: 'Synthetic Requester', email: `req-${runId}@example.test`, role: 'Admin', companyId: 'PEW' });
    const approver1Id = await addUser({ name: 'Initial Approver', email: `appr1-${runId}@example.test`, role: 'Director', companyId: 'PEW' });
    const approver2Id = await addUser({ name: 'Final Approver', email: `appr2-${runId}@example.test`, role: 'Director', companyId: 'PEW' });
    const unauthorizedId = await addUser({ name: 'Foreign User', email: `foreign-${runId}@example.test`, role: 'Admin', companyId: 'FSG' });

    // Start HTTP server that serves both API and temporary static frontend (for PDF renderer)
    const site = express();
    server = site.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    const origin = `http://127.0.0.1:${port}`;
    const base = `${origin}/api`;

    const apiApp = await createApp(db, { origin, secureCookies: false });
    site.use('/api', (req, res, next) => { req.url = '/api' + req.url; apiApp(req, res, next); });
    site.use(express.static(tempOutDir));
    site.get('*', (_req, res) => res.sendFile(join(tempOutDir!, 'index.html')));

    const adminCookie = `precisign_session=${await createTokenForUser(superAdminId)}`;
    const requesterCookie = `precisign_session=${await createTokenForUser(requesterId)}`;
    const approver1Cookie = `precisign_session=${await createTokenForUser(approver1Id)}`;
    const approver2Cookie = `precisign_session=${await createTokenForUser(approver2Id)}`;
    const unauthorizedCookie = `precisign_session=${await createTokenForUser(unauthorizedId)}`;

    // Distinct synthetic signatures (requester vs approver)
    const requesterSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
    const approver1Signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWP4z8DwH4QZYAwAR8oH+Xm0fdIAAAAASUVORK5CYII=';
    const brandLogoSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // -------------------------------------------------------------
    // 1. Workflow administration & competing updates
    // -------------------------------------------------------------
    // Assert shared workflow key is not occupied before writing
    const existingWf = await runSql('SELECT 1 FROM workflows WHERE company_id=? AND form_type=?', 'PEW', 'Admin Work Request');
    if (existingWf.length > 0) {
      throw new Error('Shared workflow key (PEW, Admin Work Request) is already occupied. Refusing to overwrite.');
    }

    const wfInput: WorkflowConfig = {
      ...INITIAL_WORKFLOWS[0],
      id: `wf-pew-admin-${runId}`,
      companyId: 'PEW',
      formType: 'Admin Work Request',
      version: 0,
      stages: [
        {
          id: `stage-final-${runId}`,
          stageNumber: 1,
          name: 'Final Approval',
          assignedUserId: approver2Id,
          assignedRole: 'Director',
          isFinalApproval: true,
          canReject: true,
          canReturnForCorrection: true,
          mapsToDocumentSignature: true,
        },
      ],
    };
    createdWorkflowTypes.push('Admin Work Request');

    // Non-admin save should fail 403
    const forbiddenSave = await fetch(`${base}/workflows/PEW/Admin%20Work%20Request`, {
      method: 'PUT',
      headers: { Origin: origin, Cookie: requesterCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 0, workflow: wfInput }),
    });
    assert.equal(forbiddenSave.status, 403);

    // Initial valid save by super admin
    const firstSave = await fetch(`${base}/workflows/PEW/Admin%20Work%20Request`, {
      method: 'PUT',
      headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 0, workflow: wfInput }),
    });
    assert.equal(firstSave.status, 200);
    const savedWf = await firstSave.json();
    assert.equal(savedWf.version, 1);

    // Competing update: two concurrent requests with expectedVersion: 1
    const [c1, c2] = await Promise.all([
      fetch(`${base}/workflows/PEW/Admin%20Work%20Request`, {
        method: 'PUT',
        headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 1, workflow: { ...wfInput, reminderDays: 5 } }),
      }),
      fetch(`${base}/workflows/PEW/Admin%20Work%20Request`, {
        method: 'PUT',
        headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 1, workflow: { ...wfInput, reminderDays: 7 } }),
      }),
    ]);
    assert.deepEqual([c1.status, c2.status].sort(), [200, 409]);

    // -------------------------------------------------------------
    // 2. Draft save, optimistic concurrency, and atomic cleanup on submit
    // -------------------------------------------------------------
    const draftUrl = `${base}/drafts/PEW/Admin%20Work%20Request`;
    const draftPayload = {
      dateOfRequest: '2026-11-10',
      department: 'Engineering',
      priority: 'Medium',
      workDescription: 'Draft test note',
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
      companyId: 'PEW',
      attachments: [],
    };

    // Save draft revision 0 -> 1
    const draftRes1 = await fetch(draftUrl, {
      method: 'PUT',
      headers: { Origin: origin, Cookie: requesterCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, data: draftPayload }),
    });
    assert.equal(draftRes1.status, 200);
    const savedDraft1 = await draftRes1.json();
    assert.equal(savedDraft1.revision, 1);

    // Competing draft write with stale expectedRevision: 0 should 409
    const staleDraft = await fetch(draftUrl, {
      method: 'PUT',
      headers: { Origin: origin, Cookie: requesterCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, data: { ...draftPayload, workDescription: 'Stale write' } }),
    });
    assert.equal(staleDraft.status, 409);

    // Another user cannot access requester's draft
    const otherUserDraft = await fetch(draftUrl, {
      headers: { Cookie: approver1Cookie },
    });
    assert.equal(otherUserDraft.status, 200);
    assert.deepEqual(await otherUserDraft.json(), { revision: 0, data: null });

    // Submit request with expectedDraftRevision: 1 -> should atomically persist request and clean up draft
    const formData = {
      dateOfRequest: '2026-11-10',
      department: 'Engineering',
      priority: 'Medium' as const,
      workDescription: 'Official test request',
      documents: draftPayload.documents,
    };
    const submitRes = await fetch(`${base}/requests`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: requesterCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: 'PEW',
        formType: 'Admin Work Request',
        formData,
        signatureDataUrl: requesterSignature,
        expectedDraftRevision: 1,
      }),
    });
    assert.equal(submitRes.status, 201);
    const submittedReq = (await submitRes.json()) as RequestRecord & { revision: number };
    createdRequestIds.push(submittedReq.id);
    assert.equal(submittedReq.status, 'Pending Approval');
    assert.equal(submittedReq.documentVersion, 1);
    assert.equal(submittedReq.revision, 1);

    // Verify draft was cleaned up
    const draftAfterSubmit = await (await fetch(draftUrl, { headers: { Cookie: requesterCookie } })).json();
    assert.equal(draftAfterSubmit.data, null);
    assert.equal(draftAfterSubmit.revision, 2);

    // -------------------------------------------------------------
    // 3. Signature profile updates
    // -------------------------------------------------------------
    // Mismatched style text rejected
    const badSig = await fetch(`${base}/me/signature`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: requesterCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureDataUrl: requesterSignature, signatureStyleText: 'Wrong Name' }),
    });
    assert.equal(badSig.status, 400);

    // Correct signature update
    const goodSig = await fetch(`${base}/me/signature`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: requesterCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureDataUrl: requesterSignature, signatureStyleText: 'Synthetic Requester' }),
    });
    assert.equal(goodSig.status, 200);
    const meSig = await (await fetch(`${base}/auth/me`, { headers: { Cookie: requesterCookie } })).json();
    assert.equal(meSig.user.signatureDataUrl, requesterSignature);
    assert.equal(meSig.user.signatureStyleText, 'Synthetic Requester');

    // -------------------------------------------------------------
    // 4. Account recovery and reset links
    // -------------------------------------------------------------
    const resetLinkRes = await fetch(`${base}/admin/accounts/${requesterId}/reset-link`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
    });
    assert.equal(resetLinkRes.status, 200);
    const { link } = await resetLinkRes.json();
    const tokenMatch = link.match(/#reset=([a-f0-9]+)/);
    assert.ok(tokenMatch, 'Reset link must contain reset token');
    const resetToken = tokenMatch[1];

    // Reset password
    const resetRes = await fetch(`${base}/auth/reset-password`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword: 'New-synthetic-pass-456' }),
    });
    assert.equal(resetRes.status, 204);

    // Old password fails
    const oldLogin = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `req-${runId}@example.test`, password: 'Synthetic-pass-123' }),
    });
    assert.equal(oldLogin.status, 401);

    // New password succeeds
    const newLogin = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `req-${runId}@example.test`, password: 'New-synthetic-pass-456' }),
    });
    assert.equal(newLogin.status, 200);
    const updatedRequesterCookie = newLogin.headers.get('set-cookie')!.split(';')[0];

    // -------------------------------------------------------------
    // 5. Company branding: Reject pre-existing row, register cleanup ONLY on creation
    // -------------------------------------------------------------
    // Reject any pre-existing PEW logo row, including one with an empty logo
    const existingLogoRow = await runSql('SELECT 1 FROM company_logos WHERE company_id=?', 'PEW');
    if (existingLogoRow.length > 0) {
      throw new Error('Shared company branding key (PEW) is already occupied. Refusing to overwrite.');
    }

    // Non-admin rejected 403
    const nonAdminBrand = await fetch(`${base}/admin/company-branding/PEW`, {
      method: 'PUT',
      headers: { Origin: origin, Cookie: updatedRequesterCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ logoDataUrl: brandLogoSignature }),
    });
    assert.equal(nonAdminBrand.status, 403);

    // Super-admin updates logo
    const adminBrand = await fetch(`${base}/admin/company-branding/PEW`, {
      method: 'PUT',
      headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ logoDataUrl: brandLogoSignature }),
    });
    assert.equal(adminBrand.status, 200);
    createdPewLogoFixture = true; // Register cleanup ONLY after successful fixture creation

    const brandData = await adminBrand.json();
    assert.ok(brandData.logoDataUrl?.startsWith('data:image/png;base64,'));

    // Verify GET reflects branding
    const brandsList = await (await fetch(`${base}/admin/company-branding`, { headers: { Cookie: adminCookie } })).json();
    const pewBrand = brandsList.find((c: any) => c.id === 'PEW');
    assert.ok(pewBrand?.logoDataUrl);

    // Delete logo
    const deleteBrand = await fetch(`${base}/admin/company-branding/PEW`, {
      method: 'PUT',
      headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ logoDataUrl: null }),
    });
    assert.equal(deleteBrand.status, 200);

    // -------------------------------------------------------------
    // 6. Historical Approval Signature in PDF and Browser View
    // Reusing the multi-stage scenario in historicalRendering.test.ts:
    // Administrative & Payment Request: 2 stages (Stage 1 Dept Head -> Stage 2 Final)
    // -------------------------------------------------------------
    const existingPayWf = await runSql('SELECT 1 FROM workflows WHERE company_id=? AND form_type=?', 'PEW', 'Administrative & Payment Request');
    if (existingPayWf.length > 0) {
      throw new Error('Shared workflow key (PEW, Administrative & Payment Request) is already occupied. Refusing to overwrite.');
    }

    const payWfConfig: WorkflowConfig = {
      ...INITIAL_WORKFLOWS[0],
      id: `wf-pew-pay-${runId}`,
      companyId: 'PEW',
      formType: 'Administrative & Payment Request',
      version: 1,
      stages: [
        {
          id: `stage-dept-${runId}`,
          stageNumber: 1,
          name: 'Department Head Approval',
          assignedUserId: approver1Id,
          assignedRole: 'Director',
          isFinalApproval: false,
          requiredOnSubmit: true,
          canReject: true,
          canReturnForCorrection: true,
          mapsToDocumentSignature: false,
        },
        {
          id: `stage-final-${runId}`,
          stageNumber: 2,
          name: 'Final Authority Approval',
          assignedUserId: approver2Id,
          assignedRole: 'Director',
          isFinalApproval: true,
          canReject: true,
          canReturnForCorrection: true,
          mapsToDocumentSignature: true,
        },
      ],
    };

    if (remote) {
      await remote.execute(
        'INSERT INTO workflows (company_id, form_type, version, config) VALUES (?, ?, ?, ?)',
        ['PEW', 'Administrative & Payment Request', 1, JSON.stringify(payWfConfig)]
      );
    } else {
      local!.prepare('INSERT INTO workflows (company_id, form_type, version, config) VALUES (?, ?, ?, ?)').run(
        'PEW', 'Administrative & Payment Request', 1, JSON.stringify(payWfConfig)
      );
    }
    createdWorkflowTypes.push('Administrative & Payment Request');

    // 6a. Requester submits Version 1 with distinct requesterSignature
    const payFormData = {
      dateOfRequest: '2026-11-10',
      department: 'Engineering',
      priority: 'Urgent' as const,
      workDescription: 'Original historical work description v1',
      administrativePayment: {
        documentDescription: 'Original attachment context v1',
      },
      documents: draftPayload.documents,
    };

    const submitPayRes = await fetch(`${base}/requests`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: updatedRequesterCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedWorkflowVersion: 1,
        companyId: 'PEW',
        formType: 'Administrative & Payment Request',
        formData: payFormData,
        signatureDataUrl: requesterSignature,
        signerChoices: {
          [payWfConfig.stages[0].id]: approver1Id,
          [payWfConfig.stages[1].id]: approver2Id,
        },
      }),
    });
    if (submitPayRes.status !== 201) {
      console.error('submitPayRes failed:', submitPayRes.status, await submitPayRes.text());
    }
    assert.equal(submitPayRes.status, 201);
    const payReq = (await submitPayRes.json()) as RequestRecord & { revision: number };
    createdRequestIds.push(payReq.id);
    assert.equal(payReq.status, 'Pending Approval');
    assert.equal(payReq.documentVersion, 1);
    assert.equal(payReq.currentApproverId, approver1Id);

    const payReqPath = `${base}/requests/${payReq.id}`;
    const payPdfUrl = `${payReqPath}/document-pdf`;

    // 6b. Stage 1 Approval by Initial Approver (Department Head)
    const stage1Res = await fetch(`${payReqPath}/approve`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: approver1Cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1, signatureDataUrl: approver1Signature, comment: 'Stage 1 department approval' }),
    });
    assert.equal(stage1Res.status, 200);
    const afterStage1 = (await stage1Res.json()) as RequestRecord;
    assert.equal(afterStage1.status, 'Pending Approval');
    assert.equal(afterStage1.currentApproverId, approver2Id);
    assert.equal(afterStage1.formData.administrativePayment?.departmentHeadSignature?.dataUrl, approver1Signature);
    assert.equal(afterStage1.formData.administrativePayment?.departmentHeadSignature?.name, 'Initial Approver');

    // 6c. Return for Correction by Final Approver (authorized later step) -> Freezes Version 1 with approval signature
    const returnPayRes = await fetch(`${payReqPath}/return`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: approver2Cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, reason: 'Please update work description and resubmit' }),
    });
    assert.equal(returnPayRes.status, 200);
    const returnedPay = (await returnPayRes.json()) as RequestRecord;
    assert.equal(returnedPay.status, 'Returned for Correction');
    assert.equal(returnedPay.documentVersion, 1);

    // 6d. Requester resubmits as Version 2 with new description -> Resets active approval, preserves Version 1
    const resubmitPayRes = await fetch(`${payReqPath}/resubmit`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: updatedRequesterCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 3,
        formData: { ...payFormData, workDescription: 'Corrected work description for version 2' },
        signatureDataUrl: requesterSignature,
        changeNote: 'Updated description per feedback',
        attachments: [],
      }),
    });
    assert.equal(resubmitPayRes.status, 200);
    const resubmittedPay = (await resubmitPayRes.json()) as RequestRecord;
    assert.equal(resubmittedPay.status, 'Pending Approval');
    assert.equal(resubmittedPay.documentVersion, 2);
    assert.equal(resubmittedPay.versionSnapshots?.length, 2);
    assert.equal(resubmittedPay.versionSnapshots[0].version, 1);
    assert.equal(resubmittedPay.versionSnapshots[1].version, 2);
    // In Version 2, department head signature is reset (no carried-over approval in active slots)
    assert.equal(resubmittedPay.formData.administrativePayment?.departmentHeadSignature?.dataUrl, undefined);

    // 6e. Launch Chromium for connected export verification
    const executablePath = process.env.PRECISIGN_PDF_CHROMIUM;
    try {
      browser = await chromium.launch({
        executablePath,
        channel: !executablePath && !existsSync(chromium.executablePath()) && process.platform === 'win32' ? 'msedge' : undefined,
        headless: true,
        timeout: 25000,
      });
    } catch (launchErr: any) {
      console.error('Chromium launch failed. PDF verification blocked:', launchErr);
      throw new Error(`PDF verification blocked: Chromium is unavailable (${launchErr?.message})`);
    }

    const browserContext = await browser.newContext();
    const adminSessionToken = adminCookie.replace('precisign_session=', '');
    await browserContext.addCookies([{ name: 'precisign_session', value: adminSessionToken, url: origin }]);
    const page = await browserContext.newPage();

    // 6f. Inspect Historical Version 1 in Connected Browser View
    await page.goto(`${origin}/document-export?request=${payReq.id}&version=1`);
    await page.locator('[data-pdf-ready]').waitFor({ timeout: 25000 });

    // Assert Version 1 content
    await page.getByText('Original historical work description v1', { exact: true }).waitFor();
    assert.equal(await page.getByText('Corrected work description for version 2', { exact: true }).count(), 0);
    assert.ok(await page.getByText('Initial Approver', { exact: true }).count());

    // Assert exact signature data in historical render slots
    const renderedImages = await page.locator('img').evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src));
    assert.ok(
      renderedImages.includes(requesterSignature),
      'Version 1 must preserve exact requester signature in its slot'
    );
    assert.ok(
      renderedImages.includes(approver1Signature),
      'Version 1 must preserve exact approver signature in its slot'
    );

    // 6g. Inspect Corrected Version 2 in Connected Browser View
    await page.goto(`${origin}/document-export?request=${payReq.id}&version=2`);
    await page.locator('[data-pdf-ready]').waitFor({ timeout: 25000 });

    // Assert Version 2 content and absence of carried-over approval
    await page.getByText('Corrected work description for version 2', { exact: true }).waitFor();
    assert.equal(await page.getByText('Original historical work description v1', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Initial Approver', { exact: true }).count(), 0);

    const v2RenderedImages = await page.locator('img').evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src));
    assert.ok(v2RenderedImages.includes(requesterSignature), 'Version 2 must contain requester signature');
    assert.ok(!v2RenderedImages.includes(approver1Signature), 'Version 2 must NOT carry over approver signature');

    // 6h. Unauthorized user receives 404 for historical and current PDF downloads
    const unauthV1Pdf = await fetch(payPdfUrl, {
      method: 'POST',
      headers: { Origin: origin, Cookie: unauthorizedCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, updatedAt: resubmittedPay.updatedAt }),
    });
    assert.equal(unauthV1Pdf.status, 404, 'Unauthorized user must be denied Version 1 PDF download');

    const unauthV2Pdf = await fetch(payPdfUrl, {
      method: 'POST',
      headers: { Origin: origin, Cookie: unauthorizedCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, updatedAt: resubmittedPay.updatedAt }),
    });
    assert.equal(unauthV2Pdf.status, 404, 'Unauthorized user must be denied Version 2 PDF download');

    // 6i. Stale updatedAt receives 409
    const stalePdf = await fetch(payPdfUrl, {
      method: 'POST',
      headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, updatedAt: 'stale-timestamp' }),
    });
    assert.equal(stalePdf.status, 409);

    // 6j. Invalid document version receives 404
    const badVersionPdf = await fetch(payPdfUrl, {
      method: 'POST',
      headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 99, updatedAt: resubmittedPay.updatedAt }),
    });
    assert.equal(badVersionPdf.status, 404);

    // 6k. Authorized download of historical Version 1 PDF
    const v1PdfRes = await fetch(payPdfUrl, {
      method: 'POST',
      headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, updatedAt: resubmittedPay.updatedAt }),
    });
    assert.equal(v1PdfRes.status, 200);
    assert.equal(v1PdfRes.headers.get('content-type'), 'application/pdf');
    const v1PdfBuffer = Buffer.from(await v1PdfRes.arrayBuffer());
    assert.ok(v1PdfBuffer.length > 1000, 'Version 1 PDF buffer must be non-empty');

    const v1Inspection = inspectPdfContent(v1PdfBuffer);
    assert.ok(v1Inspection.hasPdfHeader, 'Version 1 PDF must have %PDF header');
    assert.ok(v1Inspection.hasSignatureImage, 'Version 1 PDF must have signature images');
    assert.ok(
      v1Inspection.compactText.includes('Originalhistoricalworkdescriptionv1'),
      'Version 1 PDF must include original work description'
    );
    assert.ok(
      !v1Inspection.compactText.includes('Correctedworkdescriptionforversion2'),
      'Version 1 PDF must not include subsequent Version 2 description'
    );
    assert.ok(
      v1Inspection.compactText.includes('InitialApprover'),
      'Version 1 PDF must include Initial Approver in approval slot'
    );

    // 6l. Authorized download of current Version 2 PDF
    const v2PdfRes = await fetch(payPdfUrl, {
      method: 'POST',
      headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, updatedAt: resubmittedPay.updatedAt }),
    });
    assert.equal(v2PdfRes.status, 200);
    assert.equal(v2PdfRes.headers.get('content-type'), 'application/pdf');
    const v2PdfBuffer = Buffer.from(await v2PdfRes.arrayBuffer());
    assert.ok(v2PdfBuffer.length > 1000, 'Version 2 PDF buffer must be non-empty');

    const v2Inspection = inspectPdfContent(v2PdfBuffer);
    assert.ok(v2Inspection.hasPdfHeader, 'Version 2 PDF must have %PDF header');
    assert.ok(
      v2Inspection.compactText.includes('Correctedworkdescriptionforversion2'),
      'Version 2 PDF must include updated work description'
    );
    assert.ok(
      !v2Inspection.compactText.includes('Originalhistoricalworkdescriptionv1'),
      'Version 2 PDF must not include Version 1 description'
    );
    assert.ok(
      !v2Inspection.compactText.includes('InitialApprover'),
      'Version 2 PDF must not carry over Initial Approver signature text'
    );
    // Version 2 has 1 fewer signature image than Version 1 (approval signature was reset)
    assert.equal(
      v2Inspection.imageCount,
      v1Inspection.imageCount - 1,
      'Version 2 PDF must contain exactly 1 fewer image than Version 1 (approver signature omitted)'
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.error('Failed to close browser in tursoRemaining test:', err);
      }
    }

    if (server) {
      try {
        server.closeAllConnections();
        await new Promise<void>(resolve => server!.close(() => resolve()));
      } catch (err) {
        console.error('Failed to close server in tursoRemaining test:', err);
      }
    }

    if (tempOutDir) {
      try {
        rmSync(tempOutDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to remove temp build dir ${tempOutDir}:`, err);
      }
    }

    // Clean up all fixtures created by this test run
    try {
      if (remote) {
        await remote.transaction(async tx => {
          for (const reqId of createdRequestIds) {
            await tx.execute('DELETE FROM requests WHERE id=?', [reqId]);
          }
          for (const type of createdWorkflowTypes) {
            await tx.execute('DELETE FROM workflows WHERE company_id=? AND form_type=?', ['PEW', type]);
          }
          // Delete PEW logo ONLY if successfully created by this test
          if (createdPewLogoFixture) {
            await tx.execute('DELETE FROM company_logos WHERE company_id=?', ['PEW']);
          }
          for (const uId of createdUserIds) {
            await tx.execute('DELETE FROM sessions WHERE user_id=?', [uId]);
            await tx.execute('DELETE FROM password_resets WHERE user_id=?', [uId]);
            await tx.execute('DELETE FROM user_signatures WHERE user_id=?', [uId]);
            await tx.execute('DELETE FROM drafts WHERE user_id=?', [uId]);
            await tx.execute('DELETE FROM account_access WHERE user_id=?', [uId]);
            await tx.execute('DELETE FROM users WHERE id=?', [uId]);
          }
        });
      }
    } catch (cleanupErr) {
      console.error('Fixture cleanup failed in tursoRemaining test:', cleanupErr);
      throw cleanupErr;
    } finally {
      db.close();
    }
  }
});
