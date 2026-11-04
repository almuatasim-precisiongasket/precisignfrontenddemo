import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';

test('production process serves frontend and API on one loopback port',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'precisign-start-'));
 const reservation=net.createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=(reservation.address() as net.AddressInfo).port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));
 const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,NODE_ENV:'production',VITE_DATA_MODE:'api',APP_ORIGIN:'https://precisign.example.test',API_PORT:String(port),DATABASE_PATH:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
 try{
 await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Startup timed out: '+output)),15000);child.stdout.on('data',()=>{if(output.includes('PreciSign listening')){clearTimeout(timeout);resolve();}});child.on('exit',code=>{clearTimeout(timeout);reject(new Error('Startup exited '+code+': '+output));});});
 const base=`http://127.0.0.1:${port}`;
 assert.equal((await fetch(base+'/api/health')).status,200);
 assert.equal((await fetch(base+'/api/auth/me')).status,401);
 const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/PreciSign/);
 assert.equal((await fetch(base+'/deep-link')).status,200);
 }finally{child.kill();await new Promise<void>(resolve=>child.once('exit',()=>resolve()));rmSync(dir,{recursive:true,force:true});}
});
