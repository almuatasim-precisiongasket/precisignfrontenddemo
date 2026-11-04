import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiPreciSignRepository } from './apiRepository';
import { ApiError } from './apiTypes';
import { LocalActionRepository } from './localActionRepository';

test('API errors preserve status and never fall back to demo', async () => {
  for (const status of [400, 401, 403, 404, 409, 413, 500]) {
    const repo = new ApiPreciSignRepository(async () => new Response(JSON.stringify({ error: 'rejected' }), { status }));
    await assert.rejects(repo.getRequests(), (error: ApiError) => error.status === status);
  }
  const network = new ApiPreciSignRepository(async () => { throw new Error('offline'); });
  await assert.rejects(network.getRequests(), (error: ApiError) => error.code === 'NETWORK_ERROR');
});
test('malformed success responses and raw mutations are rejected', async () => {
  for (const body of ['not-json', '{}', '[{}]']) {
    const repo = new ApiPreciSignRepository(async () => new Response(body));
    await assert.rejects(repo.getRequests(), (error: ApiError) => error.code === 'INVALID_RESPONSE');
  }
  let called = false;
  const repo = new ApiPreciSignRepository(async () => { called = true; return new Response('{}'); });
  await assert.rejects(repo.updateRequest({} as any));
  await assert.rejects(repo.createRequest({} as any));
  assert.equal(called, false);
});
test('approval transports only action intent and revision with same-origin credentials', async () => {
  let sent: RequestInit | undefined;
  let path = '';
  const repo = new ApiPreciSignRepository(async (url, init) => {
    path = url; sent = init;
    return new Response(JSON.stringify({ id: 'r', revision: 2, companyId: 'PEW', formData: {}, approvalHistory: [] }));
  });
  const input = { expectedRevision: 1, signatureDataUrl: 'data:image/png;base64,test' };
  assert.equal((await repo.approve('a/b', input)).revision, 2);
  assert.equal(path, '/api/requests/a%2Fb/approve');
  assert.deepEqual(JSON.parse(String(sent?.body)), input);
  assert.equal(sent?.credentials, 'same-origin');
});

test('demo action adapter preserves lifecycle and rejects stale writes and missing signature', async () => {
  const values = new Map<string, string>();
  const storage: Storage = { get length() { return values.size; }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
  const requester = new LocalActionRepository('user-anzar', storage);
  const sample = (await requester.getRequests('PEW'))[0].formData;
  const input = { companyId: 'PEW' as const, formType: 'Admin Work Request' as const, formData: sample, signatureDataUrl: 'data:image/png;base64,test' };
  await assert.rejects(requester.submit({ ...input, signatureDataUrl: '' }));
  const created = await requester.submit(input);
  assert.equal(created.revision, 1);
  const gm = new LocalActionRepository('user-shekar', storage);
  const approved = await gm.approve(created.id, { expectedRevision: 1, signatureDataUrl: input.signatureDataUrl });
  assert.equal(approved.revision, 2);
  assert.equal(approved.currentApproverId, 'user-afzal');
  await assert.rejects(gm.approve(created.id, { expectedRevision: 1, signatureDataUrl: input.signatureDataUrl }), (error: ApiError) => error.status === 409);
  const before = await gm.getRequestById(created.id);
  storage.setItem = () => { throw new Error('storage full'); };
  const director = new LocalActionRepository('user-afzal', storage);
  await assert.rejects(director.approve(created.id, { expectedRevision: 2, signatureDataUrl: input.signatureDataUrl }), /storage full/);
  assert.deepEqual(await gm.getRequestById(created.id), before);
});


test('private draft transport carries expected revision and pins the signed-in editor identity', async () => {
  const user={id:'synthetic-editor',name:'Editor',email:'editor@example.test',companyId:'PEW',role:'Admin'};
  const calls: {url:string;init?:RequestInit}[]=[];
  const repository=new ApiPreciSignRepository(async(url,init)=>{
    calls.push({url,init});
    if(url==='/api/bootstrap') return new Response(JSON.stringify({user,users:[],companies:[],workflows:[]}));
    return new Response(JSON.stringify({revision:3,data:null}));
  });
  await repository.bootstrap();
  await repository.writePrivateDraft('PEW',2,{workDescription:'Draft'});
  assert.equal(calls[1].url,'/api/drafts/PEW/Admin%20Work%20Request');
  assert.equal((calls[1].init!.headers as Record<string,string>)['X-PreciSign-User'],'synthetic-editor');
  assert.deepEqual(JSON.parse(String(calls[1].init!.body)),{expectedRevision:2,data:{workDescription:'Draft'}});
  await repository.clearPrivateDraft('PEW',3);
  assert.equal(calls[2].init!.method,'DELETE');
  const malformed=new ApiPreciSignRepository(async()=>new Response('{"revision":"3","data":null}'));
  await assert.rejects(malformed.readPrivateDraft('PEW'),(error:ApiError)=>error.code==='INVALID_RESPONSE');
});


test('explicit login changes repository actor binding for the next account', async () => {
  const user={id:'new-user',name:'New User',email:'new@example.test',companyId:'PEW',role:'Admin'};
  let bound:unknown;
  const repository=new ApiPreciSignRepository(async(url,init)=>{
    if(url==='/api/auth/login') return new Response(JSON.stringify({user}));
    bound=(init?.headers as Record<string,string>)['X-PreciSign-User'];
    return new Response(JSON.stringify({user,users:[],companies:[],workflows:[]}));
  });
  await repository.login(user.email,'synthetic-password'); await repository.bootstrap();
  assert.equal(bound,'new-user');
});


test('signature profile transport is self-only and sends no user identity in the body', async()=>{
 const user={id:'self',name:'Self',email:'self@example.test',role:'Admin',companyId:'PEW'};let sent:RequestInit|undefined;let path='';
 const repo=new ApiPreciSignRepository(async(url,init)=>{path=url;sent=init;return new Response(JSON.stringify(url==='/api/auth/login'?{user}:user));});
 await repo.login(user.email,'synthetic');
 await assert.rejects(repo.updateUserSignature('someone-else','mark','Self'),(error:ApiError)=>error.status===403);
 await repo.updateUserSignature('self','mark','Self');
 assert.equal(path,'/api/me/signature');assert.equal(sent!.method,'PATCH');
 assert.deepEqual(JSON.parse(String(sent!.body)),{signatureDataUrl:'mark',signatureStyleText:'Self'});
});
