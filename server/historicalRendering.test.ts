import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright-core';
import { openDatabase } from './db';
import { provisionUser, createSession } from './auth';
import { createApp } from './app';
import { createNewRequestRecord, approveRequestStage, returnRequestForCorrection, resubmitCorrectedRequest } from '../src/utils/workflowEngine';
import { INITIAL_REQUESTS, INITIAL_WORKFLOWS } from '../src/data/seedData';
import { PDFDocument } from 'pdf-lib';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('isolated historical browser view and real PDF preserve version signatures and branding', async()=>{
 const db=openDatabase(':memory:'); const users: import('../src/types').UserProfile[]=[];
 for (const [i,role] of ['Admin','General Manager','Director','HR'].entries()) {
  const id=await provisionUser(db,{email:`render${i}@example.test`,name:`Synthetic ${i}`,department:'Test',companyId:i===3?'FSG':'PEW',role:role as any},'Synthetic-password-123');
  users.push({id,name:`Synthetic ${i}`,email:`render${i}@example.test`,role:role as any,department:'Test',companyId:i===3?'FSG':'PEW',initials:'S',avatarColor:'#123456'} as any);
 }
 const sig='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
 const wf={...INITIAL_WORKFLOWS[0],formType:'Administrative & Payment Request' as const,stages:INITIAL_WORKFLOWS[0].stages.map((s,i)=>({...s,assignedUserId:users[i+1].id}))};
 let r=createNewRequestRecord({id:'synthetic-render',formType:wf.formType,requester:users[0],users,workflowConfig:wf,signatureDataUrl:sig,formData:{...INITIAL_REQUESTS[0].formData,requesterId:users[0].id,requesterName:users[0].name,companyName:'Original synthetic branding',companyLogoDataUrl:sig,workDescription:'Original synthetic content',administrativePayment:{documentDescription:'Original attachment context'}}});
 r={...r,attachments:[{id:'old-file',name:'original.png',sizeBytes:2,sizeFormatted:'2 B',uploadedAt:'test',uploadedBy:'test',mimeType:'image/png',dataUrl:sig}]};
 r=approveRequestStage({request:r,actingUser:users[1],signatureDataUrl:sig}).updatedRequest!;
 r=returnRequestForCorrection({request:r,actingUser:users[2],reason:'Synthetic correction'}).updatedRequest!;
 r=resubmitCorrectedRequest({request:r,actingUser:users[0],updatedFormData:{...r.formData,workDescription:'Version two content',companyName:'Changed synthetic branding',companyLogoDataUrl:undefined},signatureDataUrl:sig}).updatedRequest!;
 db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(r.id,'PEW',users[0].id,r.status,4,JSON.stringify({...r,revision:4}));
 db.prepare('INSERT INTO user_signatures VALUES (?,?,?)').run(users[1].id,'changed-profile-signature',users[1].name);
 db.prepare('INSERT INTO company_logos VALUES (?,?)').run('PEW','changed-company-logo');
 const outer=express(); const server=outer.listen(0,'127.0.0.1'); await once(server,'listening'); const origin=`http://127.0.0.1:${(server.address() as any).port}`;
 const api=await createApp(db,{origin,secureCookies:false}); outer.use('/api',(req,res,next)=>{req.url='/api'+req.url;api(req,res,next);});
 process.env.VITE_DATA_MODE='api';
 const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'}); outer.use(vite.middlewares);
 const token=createSession(db,users[0].id); const foreign=createSession(db,users[3].id);
 const browser=await chromium.launch({channel:'msedge'}); const artifacts=mkdtempSync(join(tmpdir(),'precisign-render-'));
 try {
  const context=await browser.newContext(); await context.addCookies([{name:'precisign_session',value:token,url:origin}]); const page=await context.newPage();
  await page.goto(origin+'/document-export?request='+r.id+'&version=1'); await page.locator('[data-pdf-ready]').waitFor();
  await page.getByText('Original synthetic content',{exact:true}).waitFor(); assert.equal(await page.getByText('Version two content',{exact:true}).count(),0);
  assert.ok(await page.getByText('Original synthetic branding',{exact:true}).count());
  const images=await page.locator('img').evaluateAll(imgs=>imgs.map(img=>(img as HTMLImageElement).src)); assert.ok(images.filter(src=>src===sig).length>=3,'Requester, approver and logo images must be preserved');
  const resolved=await page.evaluate(async(id)=>{
   const modulePath='/src/components/document/RequestDocument.tsx';
   const {getRequestDocumentVersion}=await import(/* @vite-ignore */ modulePath);
   const record=await (await fetch('/api/requests/'+id)).json();
   const historical=getRequestDocumentVersion(record,1);
   const statuses=['returned','rejected','completed','superseded'].map(disposition=>{
    const copy=structuredClone(record); copy.frozenVersionPresentations.at(-1).disposition=disposition;
    return getRequestDocumentVersion(copy,1).historicalStatus;
   });
   return {attachment:historical.attachments[0].name,status:historical.historicalStatus,statuses};
  },r.id);
  assert.equal(resolved.attachment,'original.png'); assert.equal(resolved.status,'Returned for correction');
  assert.deepEqual(resolved.statuses,['Returned for correction','Rejected','Signing completed','Superseded']);
  await page.screenshot({path:join(artifacts,'historical.png'),fullPage:true});
  const pdfResponse=await fetch(origin+'/api/requests/'+r.id+'/document-pdf',{method:'POST',headers:{Origin:origin,Cookie:`precisign_session=${token}`,'Content-Type':'application/json'},body:JSON.stringify({version:1,updatedAt:r.updatedAt})});
  assert.equal(pdfResponse.status,200,await pdfResponse.clone().text()); const pdf=Buffer.from(await pdfResponse.arrayBuffer()); writeFileSync(join(artifacts,'historical.pdf'),pdf); assert.ok((await PDFDocument.load(pdf)).getPageCount()>0);
  const denied=await fetch(origin+'/api/requests/'+r.id+'/document-pdf',{method:'POST',headers:{Origin:origin,Cookie:`precisign_session=${foreign}`,'Content-Type':'application/json'},body:JSON.stringify({version:1,updatedAt:r.updatedAt})}); assert.equal(denied.status,404);
  await page.goto(origin+'/document-export?request='+r.id+'&version=2'); await page.locator('[data-pdf-ready]').waitFor(); await page.getByText('Version two content',{exact:true}).waitFor();
  console.log('Synthetic rendering artifacts: '+artifacts);
 } finally {await browser.close();await vite.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
