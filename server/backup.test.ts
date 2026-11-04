import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from './db';
import {copyDatabase} from './backup';
test('online backup and separate restore preserve data and revoke sessions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'precisign-backup-'));const source=join(dir,'source.sqlite');const db=openDatabase(source);
 try{
 db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)').run('u','test@example.test','Test','Admin','Test','PEW','[]',0,'test-hash');
 db.prepare('INSERT INTO route_administrators VALUES (?)').run('u');
 db.prepare('INSERT INTO user_signatures VALUES (?,?,?)').run('u','saved-mark','Test');
 db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW','Admin Work Request',1,'{"version":1}');
 db.prepare('INSERT INTO sessions VALUES (?,?,?)').run('hashed-token','u',Date.now()+100000);
 db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run('r','PEW','u','Approved',2,JSON.stringify({history:['submitted','approved'],signature:'original'}));
 db.prepare('INSERT INTO drafts VALUES (?,?,?,?,?)').run('u','PEW','Admin Work Request',1,'{"description":"draft"}');
 const backup=join(dir,'backup.sqlite');
 const pending=copyDatabase(source,backup);
 db.prepare("UPDATE requests SET revision=3 WHERE id='r'").run();
 await pending;
 const restored=join(dir,'restored.sqlite');await copyDatabase(backup,restored,true);
 const target=openDatabase(restored);try{assert.equal(target.prepare('SELECT user_id FROM route_administrators').get()!.user_id,'u');assert.equal(target.prepare('SELECT count(*) AS n FROM sessions').get()!.n,0);assert.ok([2,3].includes(Number(target.prepare('SELECT revision FROM requests').get()!.revision)));assert.equal(target.prepare('SELECT signature_data_url FROM user_signatures').get()!.signature_data_url,'saved-mark');assert.equal(target.prepare('SELECT version FROM workflows').get()!.version,1);assert.equal(target.prepare('SELECT data FROM drafts').get()!.data,'{"description":"draft"}');}finally{target.close();}
 assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get()!.n,1);
 await assert.rejects(copyDatabase(source,source));await assert.rejects(copyDatabase(source,backup));
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
