import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { provisionUser, createSession } from './auth';
import { createApp } from './app';
import { ownSignature } from './profile';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('signature profile is owner-only, private, validated and independent of request snapshots', async()=>{
 const db=openDatabase(':memory:'); const ids=[];
 for(let i=0;i<2;i++) ids.push(await provisionUser(db,{email:`sig${i}@example.test`,name:`Signer ${i}`,role:'Admin',companyId:'PEW',department:'Test'},'Synthetic-test-password-123'));
 const cookies=ids.map(id=>`precisign_session=${createSession(db,id)}`);
 const app=await createApp(db,{origin:'http://localhost:3000',secureCookies:false});const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
 const call=(path:string,actor=0,body?:unknown)=>fetch(base+path,{method:body?'PATCH':'GET',headers:{Origin:'http://localhost:3000',Cookie:cookies[actor]||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const signatureDataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
 const input={signatureDataUrl,signatureStyleText:'Signer 0'};
 try{
  db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run('snapshot','PEW',ids[0],'Approved',1,JSON.stringify({signatureDataUrl:'original mark'}));
  assert.equal((await call('/me/signature',3,input)).status,401);
  assert.equal((await call('/me/signature',0,{...input,userId:ids[1]})).status,400);
  assert.equal((await call('/me/signature',0,{...input,signatureDataUrl:'data:image/png;base64,AAAA'})).status,400);
  assert.equal((await call('/me/signature',1,input)).status,400);
  assert.equal((await call('/me/signature',0,input)).status,200);
  assert.equal((await (await call('/auth/me')).json()).user.signatureDataUrl,signatureDataUrl);
  const bootstrap=await (await call('/bootstrap',1)).json();
  assert.equal(bootstrap.user.signatureDataUrl,undefined);assert.equal(bootstrap.users.some((u:any)=>u.signatureDataUrl),false);
  assert.equal(JSON.parse(String(db.prepare("SELECT record FROM requests WHERE id='snapshot'").get()!.record)).signatureDataUrl,'original mark');
  db.exec("CREATE TRIGGER sig_fail BEFORE UPDATE ON user_signatures BEGIN SELECT RAISE(ABORT,'failed'); END");
  assert.equal((await call('/me/signature',0,input)).status,500);
  assert.equal((await (await call('/auth/me')).json()).user.signatureDataUrl,signatureDataUrl);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});


test('version-one database migration preserves users and saved signature survives reopen', async()=>{
 const dir=mkdtempSync(join(tmpdir(),'precisign-profile-'));const path=join(dir,'test.sqlite');let db=openDatabase(path);
 try {
  const id=await provisionUser(db,{email:'migration@example.test',name:'Migration',role:'Admin',companyId:'PEW',department:'Test'},'Synthetic-test-password-123');
  db.exec('DROP TABLE user_signatures; PRAGMA user_version=1'); db.close();db=openDatabase(path);
  assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,4);
  assert.equal(db.prepare('SELECT id FROM users').get()!.id,id);
  db.prepare('INSERT INTO user_signatures VALUES (?,?,?)').run(id,'stored-test-mark','Migration');db.close();db=openDatabase(path);
  assert.equal(ownSignature(db,id).signatureDataUrl,'stored-test-mark');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
