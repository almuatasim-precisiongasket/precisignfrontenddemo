import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftCoordinator } from './draftCoordinator';
import { ApiError } from './apiTypes';
import type { DraftState, SubmitInput, VersionedRequest } from './apiTypes';
import type { CompanyId } from '../types/index';

function fixture() {
  const states = new Map<CompanyId, DraftState>();
  let calls = 0;
  const repository = {
    async readPrivateDraft(company: CompanyId) { return structuredClone(states.get(company) || { revision:0, data:null }); },
    async writePrivateDraft(company: CompanyId, revision: number, data: any) {
      calls++;
      if ((states.get(company)?.revision ?? 0) !== revision) throw new ApiError(409,'stale');
      const next = { revision:revision+1, data:structuredClone(data) }; states.set(company,next); return next;
    },
    async clearPrivateDraft(company: CompanyId, revision: number) {
      if ((states.get(company)?.revision ?? 0) !== revision) throw new ApiError(409,'stale');
      const next = { revision:revision+1, data:null }; states.set(company,next); return next;
    },
    async submit(input: SubmitInput): Promise<VersionedRequest> {
      assert.equal(input.expectedDraftRevision,states.get(input.companyId)?.revision);
      states.set(input.companyId,{revision:input.expectedDraftRevision!+1,data:null});
      return { id:'test-request',revision:1 } as VersionedRequest;
    },
  };
  return { states, repository, count:() => calls };
}

test('draft writes serialize per company and another company can load during a delayed save', async () => {
  const f = fixture(); const coordinator = new DraftCoordinator(f.repository);
  await coordinator.load('PEW','user');
  let finish!: () => void;
  const original=f.repository.writePrivateDraft;
  let began!: () => void; const started=new Promise<void>(resolve=>began=resolve);
  f.repository.writePrivateDraft=async (...args) => { began(); await new Promise<void>(resolve=>finish=resolve); return original(...args); };
  const pending=coordinator.save('PEW','user',{workDescription:'PEW entries'});
  await started;
  assert.equal(await coordinator.load('ICCL','user'),null);
  finish(); await pending;
  assert.equal((await coordinator.load('PEW','user'))?.workDescription,'PEW entries');
  f.repository.writePrivateDraft=original;
  await Promise.all([coordinator.save('PEW','user',{workDescription:'one'}),coordinator.save('PEW','user',{workDescription:'two'})]);
  assert.equal(f.states.get('PEW')!.data!.workDescription,'two');
  assert.equal(f.states.get('PEW')!.revision,2); // Queued intermediate snapshot is coalesced.
});

test('failed initial load prevents writes; failed save preserves edits and needs explicit retry', async () => {
  const f=fixture(); const coordinator=new DraftCoordinator(f.repository);
  const read=f.repository.readPrivateDraft;
  f.repository.readPrivateDraft=async()=>{throw new ApiError(0,'offline');};
  await assert.rejects(coordinator.load('PEW','user'));
  await assert.rejects(coordinator.save('PEW','user',{workDescription:'unsaved'}));
  assert.equal(f.count(),0);
  f.repository.readPrivateDraft=read;
  await coordinator.load('PEW','user');
  const write=f.repository.writePrivateDraft;
  f.repository.writePrivateDraft=async()=>{throw new ApiError(500,'failed');};
  await assert.rejects(coordinator.save('PEW','user',{workDescription:'Keep this'}));
  assert.equal((await coordinator.load('PEW','user'))?.workDescription,'Keep this');
  f.repository.writePrivateDraft=write;
  await assert.rejects(coordinator.save('PEW','user',{workDescription:'Still local'}));
  await coordinator.save('PEW','user',{workDescription:'Retry latest'},true);
  assert.equal(f.states.get('PEW')!.data!.workDescription,'Retry latest');
});

test('a second browser conflict never rebases or overwrites the newer server draft', async () => {
  const f=fixture(); const first=new DraftCoordinator(f.repository), second=new DraftCoordinator(f.repository);
  await Promise.all([first.load('PEW','user'),second.load('PEW','user')]);
  await first.save('PEW','user',{workDescription:'Server winner'});
  await assert.rejects(second.save('PEW','user',{workDescription:'Local edits'}), (error:ApiError)=>error.status===409);
  const calls=f.count();
  await assert.rejects(second.save('PEW','user',{workDescription:'More local edits'},true));
  assert.equal(f.count(),calls);
  assert.equal((await second.load('PEW','user'))?.workDescription,'More local edits');
  assert.equal(f.states.get('PEW')!.data!.workDescription,'Server winner');
  assert.equal((await second.load('PEW','user',true))?.workDescription,'Server winner');
});

test('submission flushes latest data and suppresses concurrent saves and double submission', async () => {
  const f=fixture(); const coordinator=new DraftCoordinator(f.repository);
  await coordinator.load('PEW','user');
  let finish!: () => void; let began!: () => void; const started=new Promise<void>(resolve=>began=resolve);
  const submit=f.repository.submit;
  f.repository.submit=async input=>{began(); await new Promise<void>(resolve=>finish=resolve); return submit(input);};
  const input={companyId:'PEW',formType:'Admin Work Request',formData:{workDescription:'latest'},signatureDataUrl:'mark'} as SubmitInput;
  const pending=coordinator.submit('PEW','user',input);
  await started;
  await assert.rejects(coordinator.submit('PEW','user',input));
  await assert.rejects(coordinator.save('PEW','user',{workDescription:'stale callback'}));
  assert.equal(f.states.get('PEW')!.data!.workDescription,'latest');
  finish(); await pending;
  assert.equal(await coordinator.load('PEW','user'),null);
  assert.deepEqual(f.states.get('PEW'),{revision:2,data:null});
});
