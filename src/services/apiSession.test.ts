import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiSession } from './apiSession';
import { ApiError } from './apiTypes';

test('restore clears data on unauthorized and never substitutes demo on outage', async () => {
  const repository: any = { getCurrentUser: async () => { throw new ApiError(401, 'expired'); } };
  const session = new ApiSession(repository);
  await session.restore(); assert.equal(session.state.status, 'anonymous');
  repository.getCurrentUser = async () => { throw new ApiError(0, 'offline'); };
  await session.restore(); assert.equal(session.state.status, 'failed');
  assert.equal('bootstrap' in session.state, false);
});
test('late response cannot restore data after session expiration', async () => {
  let finish!: () => void;
  const repository: any = {
    getCurrentUser: () => new Promise<void>(resolve => { finish = resolve; }),
    bootstrap: async () => ({ user: { id: 'synthetic' }, companies: [], users: [], workflows: [] }),
    getRequests: async () => [],
  };
  const session = new ApiSession(repository);
  const pending = session.restore(); session.expired(); finish(); await pending;
  assert.equal(session.state.status, 'anonymous');
});
test('logout clears loaded data even when confirmation fails', async () => {
  const repository: any = {
    getCurrentUser: async () => ({}), bootstrap: async () => ({ user: { id: 'synthetic' } }), getRequests: async () => [],
    logout: async () => { throw new Error('offline'); },
  };
  const session = new ApiSession(repository);
  await session.restore(); assert.equal(session.state.status, 'authenticated');
  await session.logout(); assert.equal(session.state.status, 'failed');
  assert.equal('bootstrap' in session.state, false);
});

test('an old logout response cannot clear a newer authenticated session', async () => {
  let finish!: () => void;
  const repository: any = { logout: () => new Promise<void>(resolve => { finish = resolve; }), getCurrentUser: async () => ({}), bootstrap: async () => ({ user: { id: 'synthetic' } }), getRequests: async () => [] };
  const session = new ApiSession(repository);
  const pending = session.logout();
  await session.restore();
  finish(); await pending;
  assert.equal(session.state.status, 'authenticated');
});
