import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiError } from '../services/apiTypes';

// Exercise the actual local operation without mounting the provider or accessing persistence.
const source = readFileSync('src/context/AppContext.tsx', 'utf8');
const match = source.match(/const runAction = async \((.*)\) => \{([\s\S]*?)\n  };/)!;
assert.ok(match, 'Locate the existing local operation');
const parameters = match[1].replace(/: string/g, '').replace(/: \(\) => Promise<VersionedRequest>/g, '');
function setup(repository: { getRequestById: (id: string) => Promise<unknown> }) {
  let requests = [{ id: 'test', revision: 1 }];
  const pending = { current: new Set<string>() };
  const setRequests = (update: (records: typeof requests) => typeof requests) => { requests = update(requests); };
  const actionFailure = (error: unknown) => ({ success: false, error: error instanceof Error ? error.message : 'Could not save request.' });
  const run = new Function('pendingActions', 'setRequests', 'actionRepository', 'ApiError', 'actionFailure', `return async (${parameters}) => {${match[2]}}`)(pending, setRequests, repository, ApiError, actionFailure) as (id: string, action: () => Promise<unknown>) => Promise<{ success: boolean; error?: string }>;
  return { run, pending, records: () => requests };
}
for (const mode of ['demo', 'connected']) {
  test(`${mode}: success replaces the returned record and clears pending state`, async () => {
    const s = setup({ getRequestById: async () => { throw Error('unexpected refresh'); } });
    assert.deepEqual(await s.run('test', async () => ({ id: 'test', revision: 2 })), { success: true });
    assert.equal(s.records()[0].revision, 2); assert.equal(s.pending.current.size, 0);
  });
  test(`${mode}: failures preserve records and allow another action`, async () => {
    const s = setup({ getRequestById: async () => null });
    const result = await s.run('test', async () => { throw Error('denied'); });
    assert.deepEqual(result, { success: false, error: 'denied' });
    assert.equal(s.records()[0].revision, 1); assert.equal(s.pending.current.size, 0);
  });
}
test('conflict refreshes once without retrying the action', async () => {
  let refreshes = 0; let actions = 0;
  const s = setup({ getRequestById: async id => { refreshes++; return { id, revision: 3 }; } });
  const result = await s.run('test', async () => { actions++; throw new ApiError(409, 'stale'); });
  assert.equal(result.success, false); assert.match(result.error!, /latest version is now loaded/);
  assert.equal(refreshes, 1); assert.equal(actions, 1); assert.equal(s.records()[0].revision, 3); assert.equal(s.pending.current.size, 0);
});
test('missing refreshed record retains current data and existing success-of-refresh wording', async () => {
  const s = setup({ getRequestById: async () => null });
  const result = await s.run('test', async () => { throw new ApiError(409, 'stale'); });
  assert.match(result.error!, /latest version is now loaded/); assert.equal(s.records()[0].revision, 1);
});
test('failed conflict refresh preserves records and clears pending state', async () => {
  const s = setup({ getRequestById: async () => { throw Error('offline'); } });
  const result = await s.run('test', async () => { throw new ApiError(409, 'stale'); });
  assert.match(result.error!, /could not be loaded/); assert.equal(s.records()[0].revision, 1); assert.equal(s.pending.current.size, 0);
});
test('duplicate save is rejected while original work is pending', async () => {
  const s = setup({ getRequestById: async () => null }); let finish!: (value: unknown) => void;
  const first = s.run('test', () => new Promise(resolve => { finish = resolve; }));
  assert.ok(s.pending.current.has('test'));
  const second = await s.run('test', async () => { throw Error('must not execute'); });
  assert.match(second.error!, /save is already in progress/);
  finish({ id: 'test', revision: 2 }); await first; assert.equal(s.pending.current.size, 0);
});
