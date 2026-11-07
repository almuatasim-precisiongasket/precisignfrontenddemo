import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from './db';
import {provisionUser,createSession} from './auth';
import {createApp} from './app';
import {INITIAL_WORKFLOWS} from '../src/data/seedData';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

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

test('workflow company grants control settings, participants and saved snapshots', async () => {
 const db = openDatabase(':memory:');
 const people = [
  { name:'Group', role:'Director', grants:['PEW','ICCL','FSG'] },
  { name:'PEW admin', role:'Director', grants:['PEW'] },
  { name:'Signer', role:'Admin', grants:['PEW','ICCL','FSG'] },
  { name:'Backup', role:'Admin', grants:['ICCL','FSG'] },
  { name:'PEW only', role:'Admin', grants:['PEW'] },
  { name:'Account admin', role:'Admin', grants:['PEW','ICCL','FSG'] },
 ];
 const ids:string[] = [];
 for (const [i, person] of people.entries()) {
  const id = await provisionUser(db,{email:`multi${i}@example.test`, name:person.name,role:person.role as any,department:'Test',companyId:'PEW'},'Synthetic-test-password-123');
  ids.push(id); db.prepare('INSERT INTO account_access (user_id,company_grants,is_super_admin) VALUES (?,?,?)').run(id,JSON.stringify(person.grants),i===5?1:0);
 }
 const cookies=ids.map(id=>`precisign_session=${createSession(db,id)}`);
 const origin='http://localhost:3000';
 const app=await createApp(db,{origin,secureCookies:false}); const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
 const make=(companyId:string, backup?:string) => ({...INITIAL_WORKFLOWS[0],id:`wf-${companyId}`,companyId,formType:'IT Request',version:0,processingUserIds:[],stages:[{...INITIAL_WORKFLOWS[0].stages.at(-1),stageNumber:1,assignedUserId:ids[2],assignedRole:'Admin',backupSignerIds:backup?[backup]:[]}]});
 const save=(actor:number,wf:any,expectedVersion=0) => fetch(`${base}/workflows/${wf.companyId}/IT%20Request`,{method:'PUT',headers:{Origin:origin,Cookie:cookies[actor],'Content-Type':'application/json'},body:JSON.stringify({expectedVersion,workflow:wf})});
 try {
  assert.equal((await save(1,make('ICCL',ids[3]))).status,403);
  assert.equal((await save(5,make('ICCL',ids[3]))).status,200);
  db.prepare("UPDATE account_access SET company_grants='[\"PEW\"]' WHERE user_id=?").run(ids[5]);
  assert.equal((await save(5,make('FSG',ids[3]))).status,403);
  db.prepare('DELETE FROM workflows WHERE company_id=? AND form_type=?').run('ICCL','IT Request');
  assert.equal((await save(0,make('ICCL',ids[4]))).status,400);
  assert.equal((await save(0,{...make('ICCL',ids[3]),processingUserIds:[ids[4]]})).status,400);
  assert.equal((await save(0,{...make('ICCL',ids[3]),stages:[{...make('ICCL').stages[0],assignedUserId:ids[4]}]})).status,400);
  assert.equal((await save(0,{...make('ICCL',ids[3]),stages:[{...make('ICCL').stages[0],eligibleSignerIds:[ids[4]]}]})).status,400);
  const first=await(await save(0,make('ICCL',ids[3]))).json(); assert.equal(first.version,1);
  db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run('snapshot','ICCL',ids[2],'Pending Approval',1,JSON.stringify({workflowConfig:first}));
  const updatedResponse=await save(0,make('ICCL'),1); assert.equal(updatedResponse.status,200);
  assert.deepEqual((await updatedResponse.json()).stages[0].backupSignerIds,[]);
  assert.deepEqual(JSON.parse(String(db.prepare("SELECT record FROM requests WHERE id='snapshot'").get()!.record)).workflowConfig.stages[0].backupSignerIds,[ids[3]]);
  assert.equal((await save(0,make('PEW'))).status,200);
  assert.equal((await save(0,make('FSG',ids[3]))).status,200);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});

test('workflow import validates and installs synthetic ICCL and FSG routes', async () => {
 const dir=mkdtempSync(join(tmpdir(),'precisign-import-')); const path=join(dir,'pilot.sqlite'); const db=openDatabase(path);
 try {
  const id=await provisionUser(db,{email:'import@example.test',name:'Import signer',role:'Admin',department:'Test',companyId:'PEW'},'Synthetic-test-password-123');
  db.prepare('INSERT INTO account_access (user_id,company_grants) VALUES (?,?)').run(id,'["ICCL","FSG"]');
  for (const companyId of ['ICCL','FSG']) {
   const wf={...INITIAL_WORKFLOWS[0],id:`import-${companyId}`,companyId,formType:'IT Request',version:0,stages:[{...INITIAL_WORKFLOWS[0].stages.at(-1),stageNumber:1,assignedUserId:id,assignedRole:'Admin'}]};
   const file=join(dir,`${companyId}.json`);writeFileSync(file,JSON.stringify(wf));
   const result=spawnSync(process.execPath,['--import','tsx','server/import-workflow.ts',file],{cwd:process.cwd(),env:{...process.env,DATABASE_PATH:path},encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);
   assert.equal(db.prepare('SELECT version FROM workflows WHERE company_id=? AND form_type=?').get(companyId,'IT Request')!.version,1);
  }
 } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});
