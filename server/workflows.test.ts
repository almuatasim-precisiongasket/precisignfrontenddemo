import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from './db';
import {provisionUser,createSession} from './auth';
import {createApp} from './app';
import {INITIAL_WORKFLOWS} from '../src/data/seedData';

test('workflow administration validates authority, approvers, revisions and immutable request snapshots',async()=>{
 const db=openDatabase(':memory:');const ids:string[]=[];
 for(const [i,role] of ['Admin','General Manager','Director'].entries())ids.push(await provisionUser(db,{email:`wf${i}@example.test`,name:`Workflow ${i}`,role:role as any,department:'Test',companyId:'PEW'},'Synthetic-test-password-123'));
 const cookies=ids.map(id=>`precisign_session=${createSession(db,id)}`);
 const app=await createApp(db,{origin:'http://localhost:3000',secureCookies:false});const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
 const wf={...INITIAL_WORKFLOWS[0],version:0,stages:INITIAL_WORKFLOWS[0].stages.map((s,i)=>({...s,assignedUserId:ids[i+1]}))};
 const save=(actor:number,workflow:any=wf,expectedVersion=0)=>fetch(base+'/workflows/PEW/Admin%20Work%20Request',{method:'PUT',headers:{Origin:'http://localhost:3000',Cookie:cookies[actor],'Content-Type':'application/json'},body:JSON.stringify({expectedVersion,workflow})});
 try{
  for(const actor of [0,1])assert.equal((await save(actor)).status,403);
  assert.equal((await save(2,{...wf,stages:[]})).status,400);
  assert.equal((await save(2,{...wf,formType:'Payment Request'})).status,400);
  assert.equal((await save(2,{...wf,stages:wf.stages.map(s=>({...s,assignedUserId:'missing'}))})).status,400);
  const first=await(await save(2)).json();assert.equal(first.version,1);
  db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run('snapshot','PEW',ids[0],'Pending Approval',1,JSON.stringify({workflowConfig:first}));
  const concurrent=await Promise.all([save(2,{...wf,reminderDays:3},1),save(2,{...wf,reminderDays:4},1)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  assert.equal(JSON.parse(String(db.prepare("SELECT record FROM requests WHERE id='snapshot'").get()!.record)).workflowConfig.version,1);
  await provisionUser(db,{email:'duplicate@example.test',name:'Another GM',role:'General Manager',department:'Test',companyId:'PEW'},'Synthetic-test-password-123');
  assert.equal((await save(2,{...wf,stages:wf.stages.map(s=>({...s,assignedUserId:undefined}))},2)).status,400);
  const groupId=await provisionUser(db,{email:'group@example.test',name:'Group Admin',role:'HR',department:'Test',companyId:'PEW',isGroupAdmin:true},'Synthetic-test-password-123');
  cookies.push(`precisign_session=${createSession(db,groupId)}`);
  assert.equal((await save(3,wf,2)).status,200);
  db.exec("CREATE TRIGGER wf_fail BEFORE UPDATE ON workflows BEGIN SELECT RAISE(ABORT,'failed'); END");
  assert.equal((await save(2,wf,3)).status,500);assert.equal(db.prepare('SELECT version FROM workflows').get()!.version,3);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
