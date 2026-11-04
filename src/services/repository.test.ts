import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStoragePreciSignRepository } from './repository';
import { RequestRecord } from '../types/index';

// In-memory mock storage implementation conforming to standard Web Storage API
class MockStorage implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

test('reset clears drafts using the injected storage', async () => {
  const storage = new MockStorage();
  const repo = new LocalStoragePreciSignRepository(storage);
  await repo.saveDraft('PEW', 'employee', 'Admin Work Request', { workDescription: 'draft' });
  await repo.resetToSeedData();
  assert.equal(await repo.getDraft('PEW', 'employee', 'Admin Work Request'), null);
});

test('draft save reports storage write failures', async () => {
  const storage = new MockStorage();
  storage.setItem = () => { throw new Error('storage full'); };
  const repo = new LocalStoragePreciSignRepository(storage);
  await assert.rejects(repo.saveDraft('PEW', 'employee', 'Admin Work Request', { workDescription: 'draft' }), /storage full/);
});

test('draft read errors and corrupt drafts do not silently become an empty draft', async () => {
  const storage = new MockStorage();
  const repo = new LocalStoragePreciSignRepository(storage);
  await repo.saveDraft('PEW', 'employee', 'Admin Work Request', { workDescription: 'important' });
  const read = storage.getItem.bind(storage);
  storage.getItem = () => { throw new Error('read failed'); };
  await assert.rejects(repo.getDraft('PEW', 'employee', 'Admin Work Request'), /read failed/);
  storage.getItem = read;
  assert.equal((await repo.getDraft('PEW', 'employee', 'Admin Work Request'))?.workDescription, 'important');
  storage.setItem('precisign_repo_draft_v2_PEW_employee_Admin Work Request', '{bad json');
  await assert.rejects(repo.getDraft('PEW', 'employee', 'Admin Work Request'), SyntaxError);
});

test('LocalStoragePreciSignRepository provides default seed data on initialization', async () => {
  const mock = new MockStorage();
  const repo = new LocalStoragePreciSignRepository(mock);

  const companies = await repo.getCompanies();
  assert.equal(companies.length, 3);
  assert.equal(companies[0].id, 'PEW');

  const users = await repo.getUsers();
  assert.ok(users.length >= 7);
  assert.ok(users.some((u) => u.name === 'Anzar'));
  assert.ok(users.some((u) => u.name === 'Shekar'));
  assert.ok(users.some((u) => u.name === 'Afzal Kazi'));

  const workflows = await repo.getWorkflows('PEW');
  assert.ok(workflows.length >= 2);
});

test('LocalStoragePreciSignRepository creates and retrieves requests with company isolation', async () => {
  const mock = new MockStorage();
  const repo = new LocalStoragePreciSignRepository(mock);

  const pewRequestsBefore = await repo.getRequests('PEW');
  const icclRequestsBefore = await repo.getRequests('ICCL');

  const initialPewCount = pewRequestsBefore.length;
  const initialIcclCount = icclRequestsBefore.length;

  // Create an ICCL request
  const dummyRequest: RequestRecord = {
    ...pewRequestsBefore[0],
    id: 'ICCL-AW-2026-TEST',
    companyId: 'ICCL',
    title: 'Test isolation request',
  };

  await repo.createRequest(dummyRequest);

  const pewAfter = await repo.getRequests('PEW');
  const icclAfter = await repo.getRequests('ICCL');

  assert.equal(pewAfter.length, initialPewCount); // Unchanged
  assert.equal(icclAfter.length, initialIcclCount + 1); // Increased by 1

  const fetched = await repo.getRequestById('ICCL-AW-2026-TEST');
  assert.equal(fetched?.title, 'Test isolation request');
});

test('LocalStoragePreciSignRepository updates user signatures safely', async () => {
  const mock = new MockStorage();
  const repo = new LocalStoragePreciSignRepository(mock);

  const user = await repo.getUserById('user-anzar');
  assert.ok(user);

  await repo.updateUserSignature('user-anzar', 'data:image/png;base64,mockSig', 'Anzar Styled');

  const updated = await repo.getUserById('user-anzar');
  assert.equal(updated?.signatureDataUrl, 'data:image/png;base64,mockSig');
  assert.equal(updated?.signatureStyleText, 'Anzar Styled');
});

test('LocalStoragePreciSignRepository scopes drafts by company, user, and form type', async () => {
  const mock = new MockStorage();
  const repo = new LocalStoragePreciSignRepository(mock);

  // Anzar saves draft
  await repo.saveDraft('PEW', 'user-anzar', 'Admin Work Request', {
    workDescription: 'Anzar draft renovation details',
  });

  // Anzar gets his draft
  const anzarDraft = await repo.getDraft('PEW', 'user-anzar', 'Admin Work Request');
  assert.equal(anzarDraft?.workDescription, 'Anzar draft renovation details');

  // Shekar switches in - must NOT see Anzar's draft
  const shekarDraft = await repo.getDraft('PEW', 'user-shekar', 'Admin Work Request');
  assert.equal(shekarDraft, null);

  // Clearing Anzar's draft
  await repo.clearDraft('PEW', 'user-anzar', 'Admin Work Request');
  const cleared = await repo.getDraft('PEW', 'user-anzar', 'Admin Work Request');
  assert.equal(cleared, null);
});
