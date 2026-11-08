import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { provisionUser, createSession } from './auth';
import { createApp } from './app';
import { INITIAL_REQUESTS } from '../src/data/seedData';
import { routeDraft } from '../src/utils/routeForms';
import { rndSections, rndGroups, RND_FORM } from '../src/utils/rndFields';
import { validateRnd } from '../src/utils/rndWorkflow';
import type { RequestRecord } from '../src/types';

test('R&D reference inventory and strict evaluation boundary', () => {
  assert.deepEqual(rndSections.map(section => section.id), ['A', 'B', 'C', 'D', 'E', 'F', 'H']);
  assert.equal(rndGroups.length, 19);
  assert.equal(rndSections.reduce((count, section) => count + section.items.length, 0), 55);
  const base = { fields: { inpProbTitle: 'Synthetic challenge', inpQ1: 'A repeatable test problem' }, choices: {}, marketRows: [] };
  assert.equal(validateRnd(base, false), undefined);
  assert.match(validateRnd({ ...base, fields: { ...base.fields, inpHNextAction: 'Injected' } }, false)!, /permission/);
  assert.match(validateRnd({ ...base, choices: { hDecision: ['Validate'] } }, false)!, /permission/);
  assert.match(validateRnd({ ...base, choices: { q3Rec: ['invalid'] } }, false)!, /selection/);
  assert.match(validateRnd({ ...base, fields: { unknown: 'x' } }, false)!, /field/);
});

test('isolated R&D HTTP lifecycle, evaluation authority, concurrency and signed copies', async () => {
  const db = openDatabase(':memory:'); // No application data directory or runtime database is used.
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(await provisionUser(db, { email: `rnd-${i}@example.test`, name: `R&D Synthetic ${i}`, department: 'Testing', companyId: 'PEW', role: 'Admin' }, 'Synthetic-password-123'));
  const workflow = routeDraft('PEW', RND_FORM);
  workflow.version = 1;
  workflow.stages[0].assignedUserId = ids[1];
  workflow.stages[0].assignedRole = 'Admin';
  db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW', RND_FORM, 1, JSON.stringify(workflow));
  const app = await createApp(db, { origin: 'http://localhost:3000', secureCookies: false });
  const cookies = ids.map(id => `precisign_session=${createSession(db, id)}`);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const post = (path: string, actor: number, body: unknown) => fetch(base + path, { method: 'POST', headers: { Origin: 'http://localhost:3000', Cookie: cookies[actor], 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
  const formData = { dateOfRequest: '2026-11-08', department: 'Testing', priority: 'Medium', workDescription: 'Synthetic R&D challenge', documents: INITIAL_REQUESTS[0].formData.documents,
    rnd: { fields: { inpProbTitle: 'Synthetic R&D challenge', inpQ1: 'Synthetic repetitive issue', inpSubDate: '2026-11-08', inpDept: 'Testing' }, choices: { q3Rec: ['Yes'] }, marketRows: [{ sol: 'Test solution', sup: 'Synthetic supplier', web: 'example.test' }] } };
  const input = { companyId: 'PEW', formType: RND_FORM, expectedWorkflowVersion: 1, signerChoices: { [workflow.stages[0].id]: ids[1] }, formData, signatureDataUrl: signature, attachments: [{ name: 'synthetic.png', dataUrl: signature }] };
  const evaluation = { fields: { inpHNextAction: 'Run an isolated prototype' }, choices: { hDecision: ['Validate'] }, marketRows: [] };
  try {
    db.prepare('INSERT INTO company_logos VALUES (?,?)').run('PEW', signature);
    const created = await post('/requests', 0, input); assert.equal(created.status, 201, await created.clone().text());
    let record: RequestRecord & { revision: number } = await created.json();
    const path = `/requests/${record.id}`;
    assert.equal((await post(path + '/rnd-evaluation', 0, { expectedRevision: 1, evaluation })).status, 403);
    assert.equal((await post(path + '/rnd-evaluation', 2, { expectedRevision: 1, evaluation })).status, 404);
    assert.equal((await post(path + '/override', 1, { expectedRevision: 1, reason: 'Finish', signatureDataUrl: signature })).status, 403);
    const signed = await post(path + '/approve', 1, { expectedRevision: 1, signatureDataUrl: signature });
    assert.equal(signed.status, 200); record = await signed.json();
    assert.equal(record.status, 'Pending Approval'); assert.equal(record.currentApproverId, ids[1]);
    assert.equal(record.rndSignedStates?.length, 1);
    assert.equal(record.rndSignedStates?.[0].signatureDataUrl, signature);
    assert.equal(record.rndSignedStates?.[0].actorId, ids[1]);
    const frozen = JSON.stringify(record.rndSignedStates);
    assert.equal((await post(path + '/approve', 1, { expectedRevision: 2, signatureDataUrl: signature })).status, 403);
    const saves = await Promise.all([post(path + '/rnd-evaluation', 1, { expectedRevision: 2, evaluation }), post(path + '/rnd-evaluation', 1, { expectedRevision: 2, evaluation })]);
    assert.deepEqual(saves.map(response => response.status).sort(), [200, 409]);
    record = await saves.find(response => response.status === 200)!.json();
    assert.equal(JSON.stringify(record.rndSignedStates), frozen);
    assert.equal(record.rndEvaluationHistory?.length, 1);
    assert.equal(record.formData.rndEvaluationUpdatedAfterSigning, true);
    const completed = await post(path + '/override', 1, { expectedRevision: 3, reason: 'Evaluation complete' });
    assert.equal(completed.status, 200, await completed.clone().text());
    record = await completed.json(); assert.equal(record.status, 'Approved');
    assert.equal((await post(path + '/rnd-evaluation', 1, { expectedRevision: 4, evaluation })).status, 403);

    const second = await post('/requests', 0, input); let corrected = await second.json(); const correctionPath = `/requests/${corrected.id}`;
    corrected = await (await post(correctionPath + '/approve', 1, { expectedRevision: 1, signatureDataUrl: signature })).json();
    corrected = await (await post(correctionPath + '/return', 1, { expectedRevision: 2, reason: 'Clarify challenge' })).json();
    corrected = await (await post(correctionPath + '/resubmit', 0, { expectedRevision: 3, formData, signatureDataUrl: signature })).json();
    assert.equal(corrected.documentVersion, 2);
    assert.equal(corrected.versionSnapshots[0].formData.approvalAuthoritySignatureDataUrl, signature);
    assert.equal(corrected.formData.approvalAuthoritySignatureDataUrl, undefined);
    assert.equal(corrected.rndSignedStates[0].version, 1);
    assert.equal(corrected.rndSignedStates[0].stageId, workflow.stages[0].id);
    assert.equal(corrected.attachmentVersions[0].attachments[0].dataUrl, signature);
    assert.equal(corrected.versionSnapshots[0].formData.companyLogoDataUrl, signature);
    const third = await (await post('/requests', 0, input)).json();
    const replacementPath = `/requests/${third.id}`;
    assert.equal((await post(replacementPath + '/replace', 0, { expectedRevision: 1, stageId: workflow.stages[0].id, newUserId: ids[2], reason: 'Synthetic backup test' })).status, 200);
    assert.equal((await post(replacementPath + '/rnd-evaluation', 2, { expectedRevision: 2, evaluation })).status, 403);
    assert.equal((await post(replacementPath + '/accept-replacement', 2, { expectedRevision: 2, accept: true })).status, 200);
    assert.equal((await post(replacementPath + '/rnd-evaluation', 1, { expectedRevision: 3, evaluation })).status, 403);
    assert.equal((await post(replacementPath + '/rnd-evaluation', 2, { expectedRevision: 3, evaluation })).status, 200);
    assert.equal((await post(replacementPath + '/approve', 2, { expectedRevision: 4, signatureDataUrl: signature })).status, 200);
    db.prepare('INSERT INTO account_access (user_id,company_grants,form_grants) VALUES (?,?,?)').run(ids[3], '["PEW"]', '{}');
    assert.equal((await post('/requests', 3, input)).status, 403);
    db.prepare('UPDATE account_access SET form_grants=? WHERE user_id=?').run(JSON.stringify({ PEW: [RND_FORM] }), ids[3]);
    assert.equal((await post('/requests', 3, input)).status, 201);
    assert.equal((await post('/requests', 3, { ...input, companyId: 'ICCL' })).status, 403);
    // Data persisted atomically: rejected/stale actions did not add records or histories.
    const saved = JSON.parse(String(db.prepare('SELECT record FROM requests WHERE id=?').get(record.id)!.record));
    assert.equal(saved.revision, 4); assert.equal(saved.rndSignedStates.length, 1); assert.equal(saved.rndEvaluationHistory.length, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
