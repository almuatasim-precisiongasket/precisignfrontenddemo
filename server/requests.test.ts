import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { provisionUser, createSession } from './auth';
import { createApp } from './app';
import { INITIAL_WORKFLOWS, INITIAL_REQUESTS } from '../src/data/seedData';

test('HTTP lifecycle enforces signatures, stages, revisions and correction history', async () => {
  const db = openDatabase(':memory:');
  const ids: string[] = [];
  for (const [i, role] of ['Admin','General Manager','Director'].entries()) ids.push(await provisionUser(db, { email: `lifecycle${i}@example.test`, name: `Synthetic ${i}`, department: 'Test', companyId: 'PEW', role: role as any }, 'Synthetic-password-123'));
  const workflow = { ...INITIAL_WORKFLOWS[0], stages: INITIAL_WORKFLOWS[0].stages.map((stage, i) => ({ ...stage, assignedUserId: ids[i+1] })) };
  db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW','Admin Work Request',1,JSON.stringify(workflow));
  const cookies = ids.map(id => `precisign_session=${createSession(db,id)}`);
  const app = await createApp(db,{origin:'http://localhost:3000',secureCookies:false});
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const post = (path: string, actor: number, body: unknown) => fetch(base+path,{method:'POST',headers:{Origin:'http://localhost:3000',Cookie:cookies[actor],'Content-Type':'application/json'},body:JSON.stringify(body)});
  const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
  const f = INITIAL_REQUESTS[0].formData;
  const formData = {dateOfRequest:f.dateOfRequest,department:'Test',priority:'Medium',workDescription:'Synthetic request',documents:f.documents};
  const input = {companyId:'PEW',formType:'Admin Work Request',formData,signatureDataUrl:signature};
  try {
    assert.equal((await post('/requests',0,{...input,status:'Approved'})).status,400);
    assert.equal((await post('/requests',0,{...input,signatureDataUrl:''})).status,400);
    const createdResponse = await post('/requests',0,input); assert.equal(createdResponse.status,201);
    let record = await createdResponse.json(); const path = `/requests/${record.id}`;
    assert.equal(record.requesterId,ids[0]); assert.equal(record.revision,1);
    assert.equal((await post(path+'/approve',0,{expectedRevision:1,signatureDataUrl:signature})).status,403);
    const concurrent = await Promise.all([post(path+'/approve',1,{expectedRevision:1,signatureDataUrl:signature}),post(path+'/approve',1,{expectedRevision:1,signatureDataUrl:signature})]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    record = await (await post(path+'/return',2,{expectedRevision:2,reason:'Correct detail'})).json();
    assert.equal(record.status,'Returned for Correction');
    assert.equal((await post(path+'/resubmit',1,{expectedRevision:3,formData,signatureDataUrl:signature})).status,403);
    record = await (await post(path+'/resubmit',0,{expectedRevision:3,formData:{...formData,workDescription:'Revised'},signatureDataUrl:signature,attachments:[]})).json();
    assert.equal(record.documentVersion,2); assert.equal(record.currentStageIndex,0); assert.equal(record.attachmentVersions[0].version,1);
    assert.equal(record.versionSnapshots[0].formData.workDescription,'Synthetic request');
    record = await (await post(path+'/approve',1,{expectedRevision:4,signatureDataUrl:signature})).json();
    record = await (await post(path+'/approve',2,{expectedRevision:5,signatureDataUrl:signature})).json();
    assert.equal(record.status,'Approved'); assert.equal(record.revision,6);
    assert.equal((await post(path+'/reject',2,{expectedRevision:6,reason:'no'})).status,403);
    const another = await (await post('/requests',0,input)).json();
    const overridden = await (await post(`/requests/${another.id}/override`,2,{expectedRevision:1,reason:'Urgent',signatureDataUrl:signature})).json();
    assert.equal(overridden.status,'Approved'); assert.equal(overridden.approvalSteps[0].status,'Bypassed');
    const rejected = await (await post('/requests',0,input)).json();
    assert.equal((await post(`/requests/${rejected.id}/reject`,2,{expectedRevision:1,reason:'Not required'})).status,200);
  } finally {server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
