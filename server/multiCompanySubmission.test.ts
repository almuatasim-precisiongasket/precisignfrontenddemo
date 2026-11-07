import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapPilot } from './bootstrap-pilot';
import { seedPilotWorkflows } from './seed-pilot-workflows';
import { openDatabase } from './db';
import { createApp } from './app';
import { createSession } from './auth';
import { INITIAL_REQUESTS } from '../src/data/seedData';
import { needsMyAction } from '../src/utils/actionQueue';
import type { RequestRecord } from '../src/types';

test('synthetic pilot submits all four forms across three legal companies', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'precisign-multi-'));
  const path = join(directory, 'pilot.sqlite');
  try {
    await bootstrapPilot(path, join(directory, 'credentials.json'));
    assert.equal(seedPilotWorkflows(path), 12);
    const db = openDatabase(path);
    try {
      assert.equal(db.prepare("SELECT count(*) AS n FROM account_access WHERE form_grants='{}'").get()?.n, 6);
      const edited = db.prepare("SELECT config FROM workflows WHERE company_id='PEW' AND form_type='IT Request'").get()!;
      db.prepare("UPDATE workflows SET version=2, config=? WHERE company_id='PEW' AND form_type='IT Request'")
        .run(JSON.stringify({ ...JSON.parse(String(edited.config)), version: 2 }));
      assert.equal(seedPilotWorkflows(path), 0);
      assert.equal(db.prepare("SELECT version FROM workflows WHERE company_id='PEW' AND form_type='IT Request'").get()?.version, 2);
      const grants = { PEW: ['Administrative & Payment Request', 'Admin Work Request'], ICCL: ['IT Request'], FSG: ['Cash Voucher', 'Expense Claim'] };
      db.prepare("UPDATE account_access SET must_change_password=0 WHERE user_id IN ('pilot-farida','pilot-afzal','pilot-muatasim')").run();
      db.prepare("UPDATE account_access SET form_grants=? WHERE user_id='pilot-muatasim'").run(JSON.stringify(grants));
      db.prepare("UPDATE account_access SET form_grants=? WHERE user_id='pilot-farida'").run(JSON.stringify({ FSG: ['Expense Claim'] }));
      db.prepare("INSERT INTO route_administrators VALUES ('pilot-muatasim')").run();
      const actors = ['pilot-muatasim', 'pilot-farida', 'pilot-afzal'];
      const tokens = new Map(actors.map(id => [id, createSession(db, id)]));
      const origin = 'http://localhost:3000';
      const app = await createApp(db, { origin, secureCookies: false });
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const root = `http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
      const call = (route: string, actor = actors[0], body?: unknown, method = body ? 'POST' : 'GET') => fetch(root + route, {
        method, headers: { Origin: origin, Cookie: `precisign_session=${tokens.get(actor)}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const input = {
        expectedWorkflowVersion: 1,
        signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=',
        formData: { dateOfRequest: '2026-11-06', department: 'Pilot', priority: 'Medium', workDescription: 'Synthetic test', documents: INITIAL_REQUESTS[0].formData.documents },
      };
      const create = (companyId: string, formType: string, details: object, actor = actors[0]) => {
        const row = db.prepare('SELECT config FROM workflows WHERE company_id=? AND form_type=?').get(companyId, formType);
        const stages = row && formType !== 'Admin Work Request' ? JSON.parse(String(row.config)).stages : [];
        const signerChoices = stages.length ? Object.fromEntries(stages.map((stage: { id: string; assignedUserId: string }) => [stage.id, stage.assignedUserId])) : undefined;
        return call('/requests', actor, { ...input, companyId, formType, signerChoices, formData: { ...input.formData, ...details } });
      };
      const records = [];
      try {
        assert.equal((await create('PEG', 'IT Request', {})).status, 400);
        assert.equal((await create('PEW', 'IT Request', {})).status, 403);
        assert.equal((await create('PEW', 'Admin Work Request', {})).status, 400);
        const branding = '/admin/company-branding';
        const saveLogo = (companyId: string, logoDataUrl: string | null, actor = actors[0]) =>
          call(`${branding}/${companyId}`, actor, { logoDataUrl }, 'PUT');
        assert.equal((await call(branding, actors[1])).status, 403);
        assert.equal((await saveLogo('PEW', input.signatureDataUrl, actors[1])).status, 403);
        assert.equal((await saveLogo('PEG', input.signatureDataUrl)).status, 400);
        assert.equal((await saveLogo('ICCL', 'data:image/png;base64,AAAA')).status, 400);
        const saved = await saveLogo('ICCL', input.signatureDataUrl);
        assert.equal(saved.status, 200);
        const { logoDataUrl } = await saved.json();
        assert.match(logoDataUrl, /^data:image\/png;base64,/);
        const companyList = await (await call('/bootstrap')).json();
        assert.equal(companyList.companies.find((company: { id: string }) => company.id === 'ICCL').logoDataUrl, logoDataUrl);
        for (const [companyId, formType, prefix, details] of [
          ['PEW', 'Administrative & Payment Request', 'AP', { administrativePayment: { documentDescription: 'Synthetic' } }],
          ['ICCL', 'IT Request', 'IT', { itRequest: { requestType: 'Equipment', justification: 'Synthetic' } }],
          ['FSG', 'Cash Voucher', 'CV', { cashVoucher: { payee: 'Taqvi', recipientUserId: 'pilot-taqvi', amount: '5', amountInWords: 'Five', source: 'Accounts cash' } }],
          ['FSG', 'Expense Claim', 'EC', { expenseClaim: { designation: 'Analyst', project: 'Synthetic', lines: [{ date: '2026-11-06', particulars: 'Taxi', amount: '5', noBillReason: 'No receipt issued' }] } }],
        ] as const) {
          const response = await create(companyId, formType, details, formType === 'Expense Claim' ? actors[1] : actors[0]);
          assert.equal(response.status, 201, response.status === 201 ? '' : await response.text());
          const record = await response.json();
          assert.ok(record.id.startsWith(`${companyId}-${prefix}-`));
          assert.equal(record.companyId, companyId);
          assert.ok(record.formData.companyName.startsWith(`${companyId} - `));
          assert.equal(record.workflowConfig.companyId, companyId);
          assert.equal(record.workflowConfig.version, 1);
          assert.deepEqual(record.approvalSteps.map((step: { assignedUserId: string }) => step.assignedUserId),
            prefix === 'AP' || prefix === 'EC' ? ['pilot-shekhar', 'pilot-afzal'] : ['pilot-afzal']);
          assert.equal(record.formData.companyLogoDataUrl, companyId === 'ICCL' ? logoDataUrl : undefined);
          assert.equal(record.versionSnapshots[0].formData.companyLogoDataUrl, record.formData.companyLogoDataUrl);
          records.push(record);
        }
        const requesterGroup: RequestRecord[] = await (await call('/requests?scope=PEG')).json();
        assert.equal(requesterGroup.filter(record => record.requesterId === actors[0]).length, 3);
        const signerGroup: RequestRecord[] = await (await call('/requests?scope=PEG', actors[2])).json();
        assert.equal(signerGroup.filter(record => needsMyAction(record, actors[2])).length, 4);
        const signerFsg: RequestRecord[] = await (await call('/requests?scope=FSG', actors[2])).json();
        assert.deepEqual(signerFsg.map(record => record.id).sort(), records.slice(2).map(record => record.id).sort());
        const it = records[1];
        const faridaGroup: RequestRecord[] = await (await call('/requests?scope=PEG', actors[1])).json();
        assert.deepEqual(faridaGroup.map(record => record.id), [records[3].id]);
        assert.equal(records[3].requesterId, actors[1]);
        assert.equal(needsMyAction(it, actors[1]), false);
        const replacement = await call(`/requests/${it.id}/replace`, actors[0], {
          expectedRevision: 1, stageId: it.approvalSteps[0].stageId, newUserId: actors[1], reason: 'Synthetic handoff',
        });
        assert.equal(replacement.status, 200);
        assert.equal(needsMyAction(await replacement.json(), actors[1]), true);

        const newImage = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#107365' } }).png().toBuffer();
        const updated = await saveLogo('ICCL', `data:image/png;base64,${newImage.toString('base64')}`);
        assert.equal(updated.status, 200);
        const updatedLogo = (await updated.json()).logoDataUrl;
        assert.notEqual(updatedLogo, logoDataUrl);
        const withNewLogo = await create('ICCL', 'IT Request', { itRequest: { requestType: 'Equipment', justification: 'Synthetic' } });
        assert.equal(withNewLogo.status, 201);
        assert.equal((await withNewLogo.json()).formData.companyLogoDataUrl, updatedLogo);
        assert.equal((await saveLogo('ICCL', null)).status, 200);
        const historical = await (await call(`/requests/${it.id}`)).json();
        assert.equal(historical.formData.companyLogoDataUrl, logoDataUrl);
        assert.equal(historical.versionSnapshots[0].formData.companyLogoDataUrl, logoDataUrl);
        const next = await create('ICCL', 'IT Request', { itRequest: { requestType: 'Equipment', justification: 'Synthetic' } });
        assert.equal(next.status, 201);
        assert.equal((await next.json()).formData.companyLogoDataUrl, undefined);
      } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    } finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
