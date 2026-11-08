import test from 'node:test';
import assert from 'node:assert/strict';
import { createShowcaseDataset } from './showcaseData';
import { LocalStoragePreciSignRepository } from '../services/repository';
import { LocalActionRepository } from '../services/localActionRepository';
import { ShowcaseAdministration } from '../services/showcaseAdministration';
import { canUserStartForm } from '../utils/companyAccess';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

test('showcase has five working forms, all company routes and only fictional people', () => {
  const data = createShowcaseDataset();
  assert.equal(data.workflows.length, 15);
  assert.equal(data.requests.length, 15);
  assert.deepEqual([...new Set(data.requests.map(record => record.formType))].sort(), ['Administrative & Payment Request', 'Cash Voucher', 'Expense Claim', 'IT Request', 'R&D Initiative']);
  assert.ok(data.users.every(user => user.email.endsWith('@example.test')));
  assert.ok(data.requests.every(record => record.attachments[0].dataUrl?.startsWith('data:image/png;base64,')));
  assert.ok(data.requests.some(record => record.status === 'Returned for Correction'));
  assert.ok(data.requests.some(record => record.approvalSteps.some(step => step.status === 'Bypassed')));
  assert.ok(data.requests.some(record => record.pendingReplacement));
  assert.equal(data.users.find(user => user.id === data.session.userId)?.role, 'Director');
  assert.equal(data.session.companyId, 'PEG');
  assert.ok(Buffer.byteLength(JSON.stringify(data)) < 2 * 1024 * 1024, 'Fixtures should fit comfortably in browser storage.');
});

test('showcase storage, actions and reset never overwrite regular demo data', async () => {
  const storage = new MemoryStorage(); const data = createShowcaseDataset();
  storage.setItem('precisign_repo_requests_v2', '[{"id":"existing-local-record"}]');
  const repo = new LocalStoragePreciSignRepository(storage, data);
  const pending = data.requests.find(record => record.formType === 'Administrative & Payment Request')!;
  const actor = data.users.find(user => user.id === data.session.userId)!;
  const actions = new LocalActionRepository(actor.id, storage, data);
  const approved = await actions.approve(pending.id, { expectedRevision: 1, signatureDataUrl: actor.signatureDataUrl! });
  assert.equal(approved.status, 'Approved');
  assert.equal((await repo.getRequestById(pending.id))?.status, 'Approved');
  assert.equal(pending.status, 'Pending Approval', 'Seed objects remain unchanged.');
  assert.equal(storage.getItem('precisign_repo_requests_v2'), '[{"id":"existing-local-record"}]');
  await repo.saveDraft('PEW', actor.id, 'Admin Work Request', { workDescription: 'Disposable demo draft' });
  await repo.resetToSeedData();
  assert.equal((await repo.getRequestById(pending.id))?.status, 'Pending Approval');
  assert.equal(await repo.getDraft('PEW', actor.id, 'Admin Work Request'), null);
  assert.deepEqual(await repo.getDemoSession(), data.session);
  assert.equal(storage.getItem('precisign_repo_requests_v2'), '[{"id":"existing-local-record"}]');
  const otherVisitor = new LocalStoragePreciSignRepository(new MemoryStorage(), createShowcaseDataset());
  assert.equal((await otherVisitor.getRequestById(pending.id))?.status, 'Pending Approval');
});

test('showcase admin simulation enforces its persona and preserves signed branding', async () => {
  const data = createShowcaseDataset(); const storage = new MemoryStorage();
  const admin = data.users.find(user => user.isSuperAdmin)!;
  const target = data.users[0];
  const repo = new ShowcaseAdministration(admin.id, storage, data);
  const outsider = new ShowcaseAdministration(target.id, storage, data);
  await assert.rejects(() => outsider.listAccounts(), /administrator/);
  await assert.rejects(() => repo.updateAccount(admin.id, { isDisabled: true }), /enabled/);
  await repo.updateGrants(target.id, ['PEW'], { PEW: ['IT Request'] });
  const limited = (await repo.getUserById(target.id))!;
  assert.ok(canUserStartForm(limited, 'PEW', 'IT Request'));
  assert.equal(canUserStartForm(limited, 'PEW', 'R&D Initiative'), false);
  assert.equal(canUserStartForm(limited, 'ICCL', 'IT Request'), false);
  const actor = new LocalActionRepository(target.id, storage, data);
  const sample = data.requests[0];
  await assert.rejects(() => actor.submit({ companyId: 'PEW', formType: 'Administrative & Payment Request', formData: sample.formData, signatureDataUrl: target.signatureDataUrl!, expectedWorkflowVersion: 1 }), /access denied/);
  await repo.updateAccount(target.id, { isDisabled: true });
  assert.equal(await repo.getUserById(target.id), null);
  assert.equal((await repo.listAccounts()).find(user => user.id === target.id)?.isDisabled, true);
  await repo.updateAccount(target.id, { isDisabled: false });
  assert.deepEqual((await repo.getUserById(target.id))?.companyGrants, []);
  const before = JSON.stringify((await repo.getRequests())[0].formData);
  await repo.updateCompanyLogo('PEW', admin.signatureDataUrl!);
  assert.equal(JSON.stringify((await repo.getRequests())[0].formData), before);
  await assert.rejects(() => repo.createResetLink(target.id), /not passwords/);
});
