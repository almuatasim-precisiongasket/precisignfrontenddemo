import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import express from 'express';
import { chromium, type Browser } from 'playwright-core';
import type { Server } from 'node:http';
import { openAsyncDatabase, migrateAsyncDatabase, type AsyncDatabase } from '../server/asyncDatabase';
import { createApp } from '../server/app';
import { hashPassword, tokenHash } from '../server/auth';
import { initRemoteTursoTestDb, inspectPdfContent } from '../server/tursoTestSafety';
import type { RequestRecord, WorkflowConfig } from '../src/types';
import { INITIAL_WORKFLOWS } from '../src/data/seedData';

async function main() {
  const db: AsyncDatabase = await initRemoteTursoTestDb('Browser Walkthrough');

  const runId = randomUUID().slice(0, 8);
  const tempOutDir = mkdtempSync(join(tmpdir(), `precisign-walkthrough-build-${runId}-`));
  const createdUserIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdWorkflowTypes: string[] = [];

  let server: Server | undefined;
  let browser: Browser | undefined;

  try {
    // 1. Build frontend in connected API mode into a unique temporary directory
    console.log(`Building frontend in connected mode (VITE_DATA_MODE=api) into ${tempOutDir}...`);
    execFileSync(
      process.execPath,
      ['node_modules/vite/bin/vite.js', 'build', '--outDir', tempOutDir],
      {
        env: { ...process.env, VITE_DATA_MODE: 'api' },
        stdio: 'pipe',
      }
    );

    const password = 'Synthetic-walkthrough-123';
    const passwordHash = await hashPassword(password);

    const addUser = async (options: { name: string; email: string; role: string; companyId: string; isSuperAdmin?: boolean }) => {
      const id = `wb-${runId}-${createdUserIds.length}`;
      await db.execute(
        'INSERT INTO users (id, email, name, role, department, company_id, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, options.email, options.name, options.role, 'Walkthrough', options.companyId, passwordHash]
      );
      await db.execute(
        'INSERT INTO account_access (user_id, company_grants, form_grants, is_super_admin, is_disabled) VALUES (?, ?, ?, ?, 0)',
        [
          id,
          JSON.stringify([options.companyId]),
          JSON.stringify({ [options.companyId]: ['Administrative & Payment Request', 'IT Request', 'Admin Work Request'] }),
          options.isSuperAdmin ? 1 : 0,
        ]
      );
      createdUserIds.push(id);
      return id;
    };

    const adminEmail = `admin-${runId}@example.test`;
    const requesterEmail = `req-${runId}@example.test`;
    const approverEmail = `appr-${runId}@example.test`;
    const unauthEmail = `unauth-${runId}@example.test`;

    const adminId = await addUser({ name: 'Admin Walkthrough', email: adminEmail, role: 'Director', companyId: 'PEW', isSuperAdmin: true });
    const requesterId = await addUser({ name: 'Requester Walkthrough', email: requesterEmail, role: 'Admin', companyId: 'PEW' });
    const approverId = await addUser({ name: 'Approver Walkthrough', email: approverEmail, role: 'Director', companyId: 'PEW' });
    const unauthId = await addUser({ name: 'Foreign Walkthrough', email: unauthEmail, role: 'Admin', companyId: 'FSG' });

    // Verify shared workflow key is not occupied before writing
    const existingWf = await db.execute('SELECT 1 FROM workflows WHERE company_id=? AND form_type=?', ['PEW', 'Admin Work Request']);
    if (existingWf.rows.length > 0) {
      throw new Error('Shared workflow key (PEW, Admin Work Request) is already occupied. Refusing to overwrite.');
    }

    const wfInput: WorkflowConfig = {
      ...INITIAL_WORKFLOWS[0],
      id: `wf-pew-admin-${runId}`,
      companyId: 'PEW',
      formType: 'Admin Work Request',
      version: 1,
      stages: [
        {
          id: `stage-final-${runId}`,
          stageNumber: 1,
          name: 'Final Approval',
          assignedUserId: approverId,
          assignedRole: 'Director',
          isFinalApproval: true,
          canReject: true,
          canReturnForCorrection: true,
          mapsToDocumentSignature: true,
        },
      ],
    };

    await db.execute(
      'INSERT INTO workflows (company_id, form_type, version, config) VALUES (?, ?, ?, ?)',
      ['PEW', 'Admin Work Request', 1, JSON.stringify(wfInput)]
    );
    createdWorkflowTypes.push('Admin Work Request');

    // Start Express with temporary static frontend + API on Turso
    const site = express();
    server = site.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    const origin = `http://127.0.0.1:${port}`;

    const apiApp = await createApp(db, { origin, secureCookies: false });
    site.use('/api', (req, res, next) => { req.url = '/api' + req.url; apiApp(req, res, next); });
    site.use(express.static(tempOutDir));
    site.get('*', (_req, res) => res.sendFile(join(tempOutDir, 'index.html')));

    console.log(`[Browser Walkthrough] App running at ${origin}`);

    const executablePath = process.env.PRECISIGN_PDF_CHROMIUM;
    browser = await chromium.launch({
      executablePath,
      channel: !executablePath && !existsSync(chromium.executablePath()) && process.platform === 'win32' ? 'msedge' : undefined,
      headless: true,
      timeout: 25000,
    });

    const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';

    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    page.on('console', msg => console.log('[Browser Console]:', msg.text()));
    page.on('pageerror', err => console.error('[Browser PageError]:', err));
    page.on('response', res => {
      if (res.status() >= 400) console.log('[Browser Response Error]:', res.status(), res.url());
    });

    // 1. Browser: Super Admin sign-in
    console.log('1. [Browser] Navigating to login...');
    await page.goto(`${origin}/`);
    await page.waitForSelector('input[type="email"]');

    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForSelector('text=Overview', { timeout: 15000 });
    console.log('2. [Browser] Super Admin signed in successfully.');

    // 2. API: Super Admin grants access to requester
    console.log('3. [API] Verifying and updating account grants for requester...');
    const adminCookies = await page.context().cookies();
    const adminSessionCookie = adminCookies.find(c => c.name === 'precisign_session');
    if (!adminSessionCookie) throw new Error('Missing precisign_session cookie after login.');
    const adminCookie = `precisign_session=${adminSessionCookie.value}`;

    const grantsRes = await fetch(`${origin}/api/admin/accounts/${requesterId}/grants`, {
      method: 'PUT',
      headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyIds: ['PEW'],
        formsByCompany: { PEW: ['Admin Work Request'] },
      }),
    });
    if (grantsRes.status !== 204 && grantsRes.status !== 200) throw new Error(`Failed to grant access: ${grantsRes.status}`);
    console.log('4. [API] Account grants assigned.');

    // 3. Browser: Sign out and sign in as Requester
    console.log('5. [Browser] Signing out and signing in as Requester...');
    await page.context().clearCookies();
    await page.goto(`${origin}/`);
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', requesterEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForSelector('text=Overview', { timeout: 15000 });
    console.log('6. [Browser] Requester signed in.');

    const reqCookies = await page.context().cookies();
    const reqSessionCookie = reqCookies.find(c => c.name === 'precisign_session');
    const reqCookie = `precisign_session=${reqSessionCookie!.value}`;

    // 4. API: Save draft and submit request with attachment
    console.log('7. [API] Submitting synthetic request with PNG attachment...');
    const submitRes = await fetch(`${origin}/api/requests`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: reqCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedWorkflowVersion: 1,
        companyId: 'PEW',
        formType: 'Admin Work Request',
        formData: {
          dateOfRequest: '2026-11-10',
          department: 'Walkthrough Engineering',
          priority: 'Urgent',
          workDescription: 'End-to-end browser walkthrough with synthetic attachment',
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
        },
        signatureDataUrl: signature,
        attachments: [
          {
            name: 'evidence.png',
            dataUrl: signature,
            sizeBytes: 85,
            mimeType: 'image/png',
          },
        ],
      }),
    });

    if (submitRes.status !== 201) {
      const errBody = await submitRes.text();
      throw new Error(`Failed to submit request: ${submitRes.status} ${errBody}`);
    }
    const createdRequest = (await submitRes.json()) as RequestRecord & { revision: number };
    createdRequestIds.push(createdRequest.id);
    console.log(`8. [API] Created request ID: ${createdRequest.id}`);

    // 5. Browser: Open request review page
    console.log(`9. [Browser] Opening request ${createdRequest.id}...`);
    await page.goto(`${origin}/requests/${encodeURIComponent(createdRequest.id)}`);
    try {
      await page.waitForSelector('text=End-to-end browser walkthrough with synthetic attachment', { timeout: 15000 });
    } catch (e) {
      console.log('Current page URL:', page.url());
      console.log('Current page text:', await page.evaluate(() => document.body.innerText));
      throw e;
    }
    console.log('10. [Browser] Request loaded on review page.');

    // 6. Access Control: Unauthorized user receives 404 / 403
    console.log('11. [API] Verifying denied actions for unauthorized user...');
    const unauthSessionToken = randomBytes(32).toString('hex');
    await db.execute('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
      tokenHash(unauthSessionToken),
      unauthId,
      Date.now() + 3600000,
    ]);
    const unauthCookie = `precisign_session=${unauthSessionToken}`;

    const deniedRead = await fetch(`${origin}/api/requests/${createdRequest.id}`, {
      headers: { Cookie: unauthCookie },
    });
    if (deniedRead.status !== 404 && deniedRead.status !== 403) {
      throw new Error(`Expected unauthorized request read to be 404/403, got ${deniedRead.status}`);
    }

    const deniedApprove = await fetch(`${origin}/api/requests/${createdRequest.id}/approve`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: unauthCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1, signatureDataUrl: signature, comment: 'Illegal approval' }),
    });
    if (deniedApprove.status !== 404 && deniedApprove.status !== 403) {
      throw new Error(`Expected unauthorized approve action to be 404/403, got ${deniedApprove.status}`);
    }

    const deniedPdf = await fetch(`${origin}/api/requests/${encodeURIComponent(createdRequest.id)}/document-pdf`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: unauthCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, updatedAt: createdRequest.updatedAt }),
    });
    if (deniedPdf.status !== 404 && deniedPdf.status !== 403) {
      throw new Error(`Expected unauthorized PDF download to be 404/403, got ${deniedPdf.status}`);
    }
    console.log('12. [API] Denied actions safely blocked (404/not permitted).');

    // 7. Approver signs and approves request
    console.log('13. [API] Approver signing and approving request...');
    const apprSessionToken = randomBytes(32).toString('hex');
    await db.execute('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
      tokenHash(apprSessionToken),
      approverId,
      Date.now() + 3600000,
    ]);
    const apprCookie = `precisign_session=${apprSessionToken}`;

    const approveRes = await fetch(`${origin}/api/requests/${createdRequest.id}/approve`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: apprCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1, signatureDataUrl: signature, comment: 'Walkthrough approved' }),
    });
    if (approveRes.status !== 200) throw new Error(`Approval failed: ${approveRes.status}`);
    const approvedRequest = (await approveRes.json()) as RequestRecord;
    console.log(`14. [API] Request approved. Status: ${approvedRequest.status}`);

    // 8. Retrieve Request and Download PDF
    console.log('15. [Browser & API] Downloading PDF document...');
    const pdfRes = await fetch(`${origin}/api/requests/${encodeURIComponent(createdRequest.id)}/document-pdf`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: apprCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, updatedAt: approvedRequest.updatedAt }),
    });
    if (pdfRes.status !== 200) throw new Error(`PDF download failed: ${pdfRes.status}`);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());

    // Deep PDF inspection
    const pdfInspection = inspectPdfContent(pdfBuf);
    if (!pdfInspection.hasPdfHeader) throw new Error('Invalid PDF magic bytes.');
    if (!pdfInspection.hasSignatureImage) throw new Error('PDF missing embedded signature image.');
    if (!pdfInspection.compactText.includes('WalkthroughEngineering')) {
      throw new Error('PDF content missing expected department text.');
    }
    console.log(`16. [Browser & API] PDF generated, inspected, and validated (${pdfBuf.length} bytes, images: ${pdfInspection.imageCount}).`);

    console.log('=== Walkthrough Completed Successfully! ===');
  } finally {
    try {
      if (browser) await browser.close();
    } catch (err) {
      console.error('Failed to close browser:', err);
    }
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>(resolve => server!.close(() => resolve()));
      }
    } catch (err) {
      console.error('Failed to close server:', err);
    }
    try {
      rmSync(tempOutDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to remove temp build dir ${tempOutDir}:`, err);
    }

    // Clean up synthetic test records from Turso
    console.log('Cleaning up synthetic walkthrough records in Turso...');
    try {
      await db.transaction(async tx => {
        for (const reqId of createdRequestIds) await tx.execute('DELETE FROM requests WHERE id=?', [reqId]);
        for (const type of createdWorkflowTypes) await tx.execute('DELETE FROM workflows WHERE company_id=? AND form_type=?', ['PEW', type]);
        for (const uId of createdUserIds) {
          await tx.execute('DELETE FROM sessions WHERE user_id=?', [uId]);
          await tx.execute('DELETE FROM password_resets WHERE user_id=?', [uId]);
          await tx.execute('DELETE FROM user_signatures WHERE user_id=?', [uId]);
          await tx.execute('DELETE FROM drafts WHERE user_id=?', [uId]);
          await tx.execute('DELETE FROM account_access WHERE user_id=?', [uId]);
          await tx.execute('DELETE FROM users WHERE id=?', [uId]);
        }
      });
      console.log('Cleanup complete.');
    } catch (cleanupErr) {
      console.error('Walkthrough cleanup failed in Turso:', cleanupErr);
      throw cleanupErr;
    } finally {
      db.close();
    }
  }
}

main().catch(err => {
  console.error('Walkthrough error:', err);
  process.exit(1);
});
