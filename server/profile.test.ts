import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { provisionUser, createSession, sessionLifetime } from './auth';
import { createApp } from './app';
import { ownSignature } from './profile';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

test('signature profile is owner-only, private, validated and independent of request snapshots', async()=>{
 const db=openDatabase(':memory:'); const ids=[];
 for(let i=0;i<2;i++) ids.push(await provisionUser(db,{email:`sig${i}@example.test`,name:`Signer ${i}`,role:'Admin',companyId:'PEW',department:'Test'},'Synthetic-test-password-123'));
 const issuedAt = Date.now();
 const cookies=ids.map(id=>`precisign_session=${createSession(db,id,issuedAt)}`);
 let checksBeforeExpiry = Infinity;
 const now = () => checksBeforeExpiry-- > 0 ? issuedAt : issuedAt + sessionLifetime;
 const app=await createApp(db,{origin:'http://localhost:3000',secureCookies:false,now});const server=app.listen(0,'127.0.0.1');await once(server,'listening');
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
  db.exec('DROP TRIGGER sig_fail');
  checksBeforeExpiry = 1;
  assert.equal((await call('/me/signature',0,input)).status,401);
  assert.equal(ownSignature(db, ids[0]).signatureDataUrl, signatureDataUrl);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});

test('disabling an account after authentication prevents an in-flight signature write', async () => {
  const db = openDatabase(':memory:');
  const id = await provisionUser(db, { email: 'revoked@example.test', name: 'Revoked User', role: 'Admin', companyId: 'PEW', department: 'Test' }, 'Synthetic-test-password-123');
  db.prepare('INSERT INTO account_access (user_id) VALUES (?)').run(id);
  const token = createSession(db, id);
  const origin = 'http://localhost:3000';
  let armed = true;
  let revokeDone!: () => void;
  const revoked = new Promise<void>(resolve => { revokeDone = resolve; });
  const now = () => {
    if (armed) {
      armed = false;
      setImmediate(() => {
        db.prepare('UPDATE account_access SET is_disabled=1 WHERE user_id=?').run(id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
        revokeDone();
      });
    }
    return Date.now();
  };
  const app = await createApp(db, { origin, secureCookies: false, now });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const image = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#112233' } }).png().toBuffer();
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/me/signature`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: `precisign_session=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureDataUrl: `data:image/png;base64,${image.toString('base64')}`, signatureStyleText: 'Revoked User' }),
    });
    await revoked;
    assert.equal(response.status, 401);
    assert.deepEqual(ownSignature(db, id), {});
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  }
});


test('version-one database migration preserves users and saved signature survives reopen', async()=>{
 const dir=mkdtempSync(join(tmpdir(),'precisign-profile-'));const path=join(dir,'test.sqlite');let db=openDatabase(path);
 try {
  const id=await provisionUser(db,{email:'migration@example.test',name:'Migration',role:'Admin',companyId:'PEW',department:'Test'},'Synthetic-test-password-123');
  db.exec('DROP TABLE password_resets; DROP VIEW account_profiles; DROP TABLE account_access; DROP TABLE user_signatures; PRAGMA user_version=1'); db.close();db=openDatabase(path);
  assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,8);
  assert.equal(db.prepare('SELECT id FROM users').get()!.id,id);
  db.prepare('INSERT INTO user_signatures VALUES (?,?,?)').run(id,'stored-test-mark','Migration');db.close();db=openDatabase(path);
  assert.equal(ownSignature(db,id).signatureDataUrl,'stored-test-mark');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
