import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INITIAL_REQUESTS, INITIAL_WORKFLOWS } from '../src/data/seedData';
import { openDatabase } from './db';
import { provisionUser, createSession } from './auth';
import { createApp } from './app';

test('private drafts validate keys, revisions, tombstones and failed writes', async () => {
  const db = openDatabase(':memory:');
  const cookies: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await provisionUser(db, { email:`draft${i}@example.test`, name:`Draft ${i}`, department:'Test', role:i===2?'Director':'Admin', companyId:'PEW' }, 'Synthetic-test-password-123');
    cookies.push(`precisign_session=${createSession(db,id)}`);
  }
  const app = await createApp(db,{origin:'http://localhost:3000',secureCookies:false});
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/drafts/`;
  const call=(method:string, actor=0, body?:unknown, company='PEW', form='Admin Work Request') => fetch(base+company+'/'+encodeURIComponent(form),{method,headers:{Origin:'http://localhost:3000',Cookie:cookies[actor] ?? '', 'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  try {
    assert.deepEqual(await (await call('GET')).json(),{revision:0,data:null});
    assert.equal((await fetch(base+'PEW/'+encodeURIComponent('Admin Work Request'),{headers:{Cookie:cookies[0], 'X-PreciSign-User':'different-tab-user'}})).status,401);
    for (const company of ['PEG','wrong']) assert.equal((await call('GET',0,undefined,company)).status,400);
    assert.equal((await call('GET',0,undefined,'ICCL')).status,403);
    assert.equal((await call('GET',0,undefined,'PEW','Payment Request')).status,400);
    assert.equal((await call('GET',5)).status,401);
    assert.equal((await call('PUT',0,{expectedRevision:0,data:{requesterId:'someone'}})).status,400);
    assert.equal((await call('PUT',0,{expectedRevision:0,data:{companyId:'ICCL'}})).status,400);
    assert.equal((await call('PUT',0,{expectedRevision:0,data:{attachments:[{name:'bad',dataUrl:'data:image/png;base64,AAAA'}]}})).status,400);
    const saved=await (await call('PUT',0,{expectedRevision:0,data:{workDescription:'',department:'',companyId:'PEW'}})).json();
    assert.equal(saved.revision,1); assert.equal(saved.data.workDescription,'');
    assert.deepEqual(await (await call('GET',1)).json(),{revision:0,data:null});
    const concurrent=await Promise.all([call('PUT',0,{expectedRevision:1,data:{workDescription:'first'}}),call('PUT',0,{expectedRevision:1,data:{workDescription:'second'}})]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    const before=await (await call('GET')).json();
    db.exec("CREATE TRIGGER fail_draft BEFORE UPDATE ON drafts BEGIN SELECT RAISE(ABORT,'failure'); END");
    assert.equal((await call('PUT',0,{expectedRevision:2,data:{workDescription:'lost'}})).status,500);
    assert.deepEqual(await (await call('GET')).json(),before);
    db.exec('DROP TRIGGER fail_draft');
    assert.equal((await call('DELETE',0,{expectedRevision:1})).status,409);
    assert.deepEqual(await (await call('DELETE',0,{expectedRevision:2})).json(),{revision:3,data:null});
    assert.equal((await call('PUT',0,{expectedRevision:0,data:{workDescription:'delayed'}})).status,409);
    assert.equal((await call('PUT',0,{expectedRevision:2,data:{workDescription:'delayed'}})).status,409);
    assert.equal((await call('PUT',0,{expectedRevision:3,data:{workDescription:'new'}})).status,200);
    assert.equal((await call('PUT',2,{expectedRevision:0,data:{workDescription:'ICCL private'}},'ICCL')).status,200);
    assert.deepEqual(await (await call('GET',2)).json(),{revision:0,data:null});
    assert.equal((await (await call('GET',2,undefined,'ICCL')).json()).data.workDescription,'ICCL private');
  } finally {server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); db.close();}
});


test('submit and draft cleanup commit together and persist across server/database restart', async () => {
  const directory=mkdtempSync(join(tmpdir(),'precisign-draft-'));
  const path=join(directory,'test.sqlite'); let db=openDatabase(path);
  const ids:string[]=[];
  for (const [i,role] of ['Admin','General Manager','Director'].entries()) ids.push(await provisionUser(db,{email:`atomic${i}@example.test`,name:`Atomic ${i}`,department:'Test',companyId:'PEW',role:role as any},'Synthetic-test-password-123'));
  const config={...INITIAL_WORKFLOWS[0],stages:INITIAL_WORKFLOWS[0].stages.map((s,i)=>({...s,assignedUserId:ids[i+1]}))};
  db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW','Admin Work Request',1,JSON.stringify(config));
  const cookie=`precisign_session=${createSession(db,ids[0])}`;
  const start=async()=>{const app=await createApp(db,{origin:'http://localhost:3000',secureCookies:false});const server=app.listen(0,'127.0.0.1');await once(server,'listening');return server;};
  let server=await start();
  const call=(method:string,path:string,body?:unknown)=>fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api`+path,{method,headers:{Origin:'http://localhost:3000',Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const draftPath='/drafts/PEW/'+encodeURIComponent('Admin Work Request');
  const f=INITIAL_REQUESTS[0].formData;
  const formData={dateOfRequest:f.dateOfRequest,department:'Test',priority:'Medium',workDescription:'Atomic submission',documents:f.documents};
  const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
  const attachments=[{id:'client-id',name:'proof.png',dataUrl:signature}];
  const input={companyId:'PEW',formType:'Admin Work Request',formData,attachments,signatureDataUrl:signature,expectedDraftRevision:1};
  try {
    const saved=await call('PUT',draftPath,{expectedRevision:0,data:{...formData,attachments}});
    assert.equal(saved.status,200);
    const original=await saved.json();
    assert.equal(original.data.attachments[0].dataUrl,signature);
    // A concurrent edit makes the old submit stale and must leave both tables untouched.
    assert.equal((await call('PUT',draftPath,{expectedRevision:1,data:{...formData,workDescription:'Newer draft',attachments}})).status,200);
    assert.equal((await call('POST','/requests',input)).status,409);
    assert.equal(db.prepare('SELECT count(*) AS n FROM requests').get()!.n,0);
    const newer=await (await call('GET',draftPath)).json();
    db.exec("CREATE TRIGGER fail_cleanup BEFORE UPDATE ON drafts BEGIN SELECT RAISE(ABORT,'synthetic cleanup failure'); END");
    assert.equal((await call('POST','/requests',{...input,expectedDraftRevision:2})).status,500);
    assert.equal(db.prepare('SELECT count(*) AS n FROM requests').get()!.n,0);
    assert.deepEqual(await (await call('GET',draftPath)).json(),newer);
    db.exec('DROP TRIGGER fail_cleanup');
    // A malformed request cannot clear a valid draft.
    assert.equal((await call('POST','/requests',{...input,expectedDraftRevision:2,signatureDataUrl:''})).status,400);
    assert.deepEqual(await (await call('GET',draftPath)).json(),newer);
    const submitted=await call('POST','/requests',{...input,expectedDraftRevision:2});
    assert.equal(submitted.status,201); const record=await submitted.json();
    assert.deepEqual(await (await call('GET',draftPath)).json(),{revision:3,data:null});
    assert.equal((await call('PUT',draftPath,{expectedRevision:2,data:formData})).status,409);
    // Retain another private draft, then reopen both application and database.
    assert.equal((await call('PUT',draftPath,{expectedRevision:3,data:{...formData,attachments}})).status,200);
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();db=openDatabase(path);server=await start();
    const restored=await (await call('GET',draftPath)).json();
    assert.equal(restored.revision,4);assert.equal(restored.data.attachments[0].dataUrl,signature);
    assert.equal((await (await call('GET','/requests/'+record.id)).json()).attachments[0].dataUrl,signature);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();rmSync(directory,{recursive:true,force:true});}
});
