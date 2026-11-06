import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openDatabase } from './db';
import { provisionUser, createSession } from './auth';
import { createApp } from './app';
import { INITIAL_WORKFLOWS, INITIAL_REQUESTS } from '../src/data/seedData';

test('attachment limits, authorization, rollback and restart preserve request history', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'precisign-actions-'));
  const path = join(dir, 'test.sqlite'); let db = openDatabase(path);
  const ids: string[] = [];
  for (const [i, role] of ['Admin', 'General Manager', 'Director', 'HR'].entries()) ids.push(await provisionUser(db, { email: `boundary${i}@example.test`, name: `Boundary ${i}`, department: 'Test', companyId: i === 3 ? 'ICCL' : 'PEW', role: role as any }, 'Synthetic-test-password-123'));
  const workflow = { ...INITIAL_WORKFLOWS[0], stages: INITIAL_WORKFLOWS[0].stages.map((s, i) => ({ ...s, assignedUserId: ids[i + 1] })) };
  db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW', 'Admin Work Request', 1, JSON.stringify(workflow));
  const cookies = ids.map(id => `precisign_session=${createSession(db, id)}`);
  let app = await createApp(db, { origin: 'http://localhost:3000', secureCookies: false });
  let server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  let base = `http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const call = (url: string, actor: number, body?: unknown) => fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'http://localhost:3000', Cookie: cookies[actor], 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const mark = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
  const pdf = (size: number) => 'data:application/pdf;base64,' + Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(size - 5, 65)]).toString('base64');
  const file = (dataUrl: string, name = 'original.pdf') => ({ name, dataUrl });
  const f = INITIAL_REQUESTS[0].formData;
  const formData = { dateOfRequest: f.dateOfRequest, department: 'Test', priority: 'Medium', workDescription: 'Boundary request', documents: f.documents };
  const input = { companyId: 'PEW', formType: 'Admin Work Request', formData, signatureDataUrl: mark };
  try {
    assert.equal((await call('/requests/unknown/toString', 0, { expectedRevision: 1 })).status, 404);
    // Parser boundary: exactly 18 MiB reaches validation; one byte more is rejected by Express.
    const rawRequest = (length: number) => {
      const prefix = '{"padding":"'; const suffix = '"}';
      return fetch(base + '/requests', { method:'POST', headers:{ Origin:'http://localhost:3000', Cookie:cookies[0], 'Content-Type':'application/json' }, body:prefix + 'x'.repeat(length-prefix.length-suffix.length) + suffix });
    };
    assert.equal((await rawRequest(18*1024*1024)).status,400);
    assert.equal((await rawRequest(18*1024*1024+1)).status,413);
    for (const bad of [Buffer.from(mark.split(',')[1],'base64').subarray(0,30), Buffer.from([255,216,255,224,0,16])]) {
      const mime = bad[0] === 255 ? 'image/jpeg' : 'image/png';
      assert.equal((await call('/requests',0,{...input,signatureDataUrl:`data:${mime};base64,${bad.toString('base64')}`})).status,400);
    }
    const jpeg = 'data:image/jpeg;base64,' + (await sharp({create:{width:2,height:2,channels:3,background:'#123456'}}).jpeg().toBuffer()).toString('base64');
    assert.equal((await call('/requests',0,{...input,signatureDataUrl:jpeg})).status,201);
    assert.equal((await call('/requests',0,{...input,attachments:[file(pdf(40))]})).status,400);
    const malformedPdf='data:application/pdf;base64,'+Buffer.from('%PDF-1.7\n1 0 obj\ninvalid\n%%EOF').toString('base64');
    assert.equal((await call('/requests',0,{...input,attachments:[file(malformedPdf)]})).status,400);
    const oversizedMark='data:image/png;base64,'+Buffer.alloc(2*1024*1024+1).toString('base64');
    assert.equal((await call('/requests',0,{...input,signatureDataUrl:oversizedMark})).status,400);
    for (const key of ['requesterId','approvalHistory','approvalSteps','documentVersion','workflowConfig','revision']) {
      assert.equal((await call('/requests',0,{...input,[key]:'tampered'})).status,400);
    }
    // Database-trigger failures prove no partial row/history/version writes are committed.
    const count = () => db.prepare('SELECT count(*) AS n FROM requests').get()!.n;
    db.prepare('INSERT INTO drafts VALUES (?,?,?,?,?)').run(ids[0],'PEW','Admin Work Request',1,JSON.stringify({workDescription:'Keep draft',attachments:[]}));
    const savedDraft=db.prepare('SELECT * FROM drafts').get();
    const beforeInsert = count();
    db.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON requests BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    assert.equal((await call('/requests',0,input)).status,500); assert.equal(count(),beforeInsert);
    assert.deepEqual(db.prepare('SELECT * FROM drafts').get(),savedDraft);
    db.exec('DROP TRIGGER fail_insert');
    const originalConfig = JSON.stringify(workflow);
    db.prepare('DELETE FROM workflows').run();
    assert.equal((await call('/requests',0,input)).status,400);
    db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW','Admin Work Request',1,originalConfig);
    assert.equal((await call('/requests', 3, input)).status, 403);
    assert.equal((await call('/requests', 0, {...input, formData:{...formData, requesterId:ids[1]}})).status, 400);
    assert.equal((await call('/requests', 0, {...input, signatureDataUrl:'data:image/png;base64,AAAA'})).status, 400);
    assert.equal((await call('/requests', 0, {...input, attachments:[file('data:application/pdf;base64,AAAA')]})).status, 400);
    assert.equal((await call('/requests', 0, {...input, attachments:[file(pdf(5*1024*1024+1))]})).status, 400);
    assert.equal((await call('/requests', 0, {...input, attachments:[file(pdf(5*1024*1024)), file(pdf(5*1024*1024)), file(pdf(6))]})).status, 400);
    assert.equal((await call('/requests', 0, {...input, attachments:Array.from({length:21}, () => file(pdf(6)))})).status, 400);
    assert.equal((await call('/requests', 0, {...input, formData:{...formData, workDescription:'x'.repeat(20001)}})).status, 400);
    const makePdf = async (title: string) => {
      const doc = await PDFDocument.create(); doc.addPage(); doc.setTitle(title);
      return 'data:application/pdf;base64,' + Buffer.from(await doc.save()).toString('base64');
    };
    const original = await makePdf('original'); const replacement = await makePdf('replacement');
    // Valid padded PDFs exercise total decoded byte limit rather than failing on structure.
    const padded = (size: number) => {
      const bytes=Buffer.from(original.split(',')[1],'base64');
      const end=bytes.lastIndexOf('%%EOF');
      const padding=Buffer.from('\n%'+'A'.repeat(size-bytes.length-3)+'\n');
      return 'data:application/pdf;base64,'+Buffer.concat([bytes.subarray(0,end),padding,bytes.subarray(end)]).toString('base64');
    };
    assert.equal((await call('/requests',0,{...input,attachments:[file(padded(5*1024*1024)),file(padded(5*1024*1024)),file(original)]})).status,400);
    assert.equal((await call('/requests',0,{...input,attachments:[file(padded(5*1024*1024)),file(padded(5*1024*1024))]})).status,201);
    const response = await call('/requests', 0, {...input, attachments:[file(original)]}); assert.equal(response.status, 201);
    const created = await response.json(); const route = `/requests/${created.id}`;
    assert.equal((await call(route, 3)).status, 404);
    assert.equal((await call(route+'/approve', 3, {expectedRevision:1, signatureDataUrl:mark})).status, 404);
    assert.equal((await call(route+'/return', 0, {expectedRevision:1, reason:'No authority'})).status, 403);
    assert.equal((await call(route+'/return', 1, {expectedRevision:1, reason:' '})).status, 400);
    db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON requests BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    assert.equal((await call(route+'/approve', 1, {expectedRevision:1, signatureDataUrl:mark})).status, 500);
    assert.equal((await (await call(route, 0)).json()).revision, 1);
    db.exec('DROP TRIGGER fail_update');
    assert.equal((await call(route+'/return', 1, {expectedRevision:1, reason:'Please correct'})).status, 200);
    assert.equal((await call(route+'/resubmit', 1, {expectedRevision:2, formData, signatureDataUrl:mark})).status, 403);
    assert.equal((await call(route+'/resubmit', 0, {expectedRevision:2, formData:{...formData, companyId:'ICCL'}, signatureDataUrl:mark})).status, 400);
    const beforeCorrection = await (await call(route,0)).json();
    db.exec("CREATE TRIGGER fail_correction BEFORE UPDATE ON requests BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    assert.equal((await call(route+'/resubmit',0,{expectedRevision:2,formData,signatureDataUrl:mark,attachments:[file(replacement)]})).status,500);
    assert.deepEqual(await (await call(route,0)).json(),beforeCorrection);
    assert.deepEqual(db.prepare('SELECT * FROM drafts').get(),savedDraft);
    db.exec('DROP TRIGGER fail_correction');
    for (const action of ['approve','return','reject','override']) {
      assert.equal((await call(route+'/'+action,2,{expectedRevision:2,...(['approve','override'].includes(action)?{signatureDataUrl:mark}:{}),...(action !== 'approve'?{reason:'Not pending'}:{})})).status,403);
    }
    const revised = await (await call(route+'/resubmit', 0, {expectedRevision:2, formData:{...formData,workDescription:'Corrected'}, signatureDataUrl:mark, attachments:[file(replacement,'new.pdf')]})).json();
    assert.equal(revised.attachmentVersions[0].attachments[0].dataUrl, original);
    assert.equal(revised.attachments[0].dataUrl, replacement);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
    db = openDatabase(path); app = await createApp(db, { origin: 'http://localhost:3000', secureCookies:false });
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
    const reopened = await (await call(route, 0)).json();
    assert.equal(reopened.revision,3); assert.equal(reopened.documentVersion,2); assert.equal(reopened.approvalHistory.length,3);
    assert.equal(reopened.attachmentVersions[0].attachments[0].dataUrl,original); assert.equal(reopened.attachments[0].dataUrl,replacement);
    // Each action is checked against current actor, flags and terminal status.
    const matrixRecord = async (config: any = workflow, actor = 0) => {
      db.prepare('UPDATE workflows SET config=?').run(JSON.stringify(config));
      const response=await call('/requests',actor,input); assert.equal(response.status,201); return response.json();
    };
    const disabled = await matrixRecord({...workflow,allowDirectorOverride:false,stages:workflow.stages.map(s=>({...s,canReject:false,canReturnForCorrection:false}))});
    const droute='/requests/'+disabled.id;
    for (const action of ['return','reject']) assert.equal((await call(droute+'/'+action,1,{expectedRevision:1,reason:'Disabled'})).status,403);
    assert.equal((await call(droute+'/override',0,{expectedRevision:1,reason:'Not final',signatureDataUrl:mark})).status,403);
    assert.equal((await call(droute+'/override',1,{expectedRevision:1,reason:'Not Director',signatureDataUrl:mark})).status,403);
    assert.equal((await call(droute+'/approve',2,{expectedRevision:1,signatureDataUrl:mark})).status,200);
    assert.equal((await call(droute+'/reject',2,{expectedRevision:2,reason:'Final approver rejection'})).status,200);
    for (const action of ['approve','return','reject','override','resubmit']) {
      const body: any={expectedRevision:3};
      if (['approve','override','resubmit'].includes(action)) body.signatureDataUrl=mark;
      if (['return','reject','override'].includes(action)) body.reason='Terminal';
      if (action==='resubmit') body.formData=formData;
      assert.equal((await call(droute+'/'+action,action==='resubmit'?0:2,body)).status,403);
    }
    db.prepare('UPDATE workflows SET config=?').run(JSON.stringify({...workflow,preventSelfApproval:false}));
    assert.equal((await call('/requests',2,input)).status,400);
    const own=await matrixRecord({...workflow,preventSelfApproval:false});
    // Preserve defense-in-depth coverage for a pre-existing self-assigned record.
    own.requesterId=ids[2];
    db.prepare('UPDATE requests SET requester_id=?,record=? WHERE id=?').run(ids[2],JSON.stringify(own),own.id);
    assert.equal((await call('/requests/'+own.id+'/override',2,{expectedRevision:1,reason:'Own request',signatureDataUrl:mark})).status,403);
    assert.equal((await call('/requests/'+own.id+'/approve',1,{expectedRevision:1,signatureDataUrl:mark})).status,200);
    assert.equal((await call('/requests/'+own.id+'/approve',2,{expectedRevision:2,signatureDataUrl:mark})).status,403);
    const alternateId=await provisionUser(db,{email:'alternate-director@example.test',name:'Alternate Director',department:'Test',companyId:'PEW',role:'Director'},'Synthetic-test-password-123');
    cookies.push(`precisign_session=${createSession(db,alternateId)}`);
    const overrideCandidate=await matrixRecord();
    assert.equal((await call('/requests/'+overrideCandidate.id+'/override',4,{expectedRevision:1,reason:'Unassigned Director',signatureDataUrl:mark})).status,403);
    const overridden=await (await call('/requests/'+overrideCandidate.id+'/override',2,{expectedRevision:1,reason:'Assigned final approver',signatureDataUrl:mark})).json();
    assert.equal(overridden.status,'Approved');
    assert.equal(overridden.approvalHistory.at(-1).actionByUserId,ids[2]);
    assert.equal(overridden.approvalSteps[0].status,'Bypassed');
    assert.equal(overridden.approvalSteps[0].signatureDataUrl,undefined);
    for (const action of ['approve','return','reject','override','resubmit']) {
      const body: any={expectedRevision:2};
      if (['approve','override','resubmit'].includes(action)) body.signatureDataUrl=mark;
      if (['return','reject','override'].includes(action)) body.reason='Already approved';
      if (action==='resubmit') body.formData=formData;
      assert.equal((await call('/requests/'+overridden.id+'/'+action,action==='resubmit'?0:2,body)).status,403);
    }
    const directorReturn=await matrixRecord({...workflow,stages:workflow.stages.map(s=>({...s,canReturnForCorrection:false}))});
    assert.equal((await call('/requests/'+directorReturn.id+'/return',2,{expectedRevision:1,reason:'Director exception'})).status,200);
    // PreciRoutes early signing, completion-only, failure rollback and cancellation.
    const earlyRoute=await matrixRecord();
    const replaceRoute=await matrixRecord();const rr='/requests/'+replaceRoute.id;
    assert.equal((await call(rr+'/replace',2,{expectedRevision:1,stageId:workflow.stages[1].id,newUserId:alternateId,reason:'Unavailable'})).status,403);
    db.prepare('INSERT INTO route_administrators VALUES (?)').run(ids[2]);
    const proposal=await(await call(rr+'/replace',2,{expectedRevision:1,stageId:workflow.stages[1].id,newUserId:alternateId,reason:'Unavailable'})).json();
    assert.equal(proposal.approvalSteps[1].assignedUserId,ids[2]);
    assert.equal((await call(rr+'/override',4,{expectedRevision:2,reason:'Not accepted',signatureDataUrl:mark})).status,403);
    const accepted=await(await call(rr+'/accept-replacement',4,{expectedRevision:2,accept:true})).json();
    assert.equal(accepted.approvalSteps[1].assignedUserId,alternateId);
    assert.equal(accepted.formerSignerIds.includes(ids[2]),true);
    assert.equal((await call(rr+'/override',2,{expectedRevision:3,reason:'Former signer',signatureDataUrl:mark})).status,403);
    assert.equal((await call(rr+'/override',4,{expectedRevision:3,reason:'Accepted final',signatureDataUrl:mark})).status,200);
    const er='/requests/'+earlyRoute.id;
    const earlyFinal=await (await call(er+'/approve',2,{expectedRevision:1,signatureDataUrl:mark})).json();
    assert.equal(earlyFinal.status,'Pending Approval');
    assert.equal(earlyFinal.approvalSteps[1].status,'Approved');
    assert.equal((await call(er+'/override',2,{expectedRevision:2,reason:''})).status,400);
    db.exec("CREATE TRIGGER completion_fail BEFORE UPDATE ON requests BEGIN SELECT RAISE(ABORT,'completion failed'); END");
    assert.equal((await call(er+'/override',2,{expectedRevision:2,reason:'Close early'})).status,500);
    assert.equal((await (await call(er,2)).json()).revision,2);
    db.exec('DROP TRIGGER completion_fail');
    const completeOnly=await(await call(er+'/override',2,{expectedRevision:2,reason:'Close early'})).json();
    assert.equal(completeOnly.status,'Approved');
    assert.equal(completeOnly.approvalSteps[0].status,'Bypassed');
    assert.equal(completeOnly.approvalHistory.filter((h:any)=>h.action==='Approved').length,1);
    assert.equal((await call(er+'/approve',1,{expectedRevision:2,signatureDataUrl:mark})).status,409);
    const cancellable=await matrixRecord();const cr='/requests/'+cancellable.id;
    assert.equal((await call(cr+'/cancel',1,{expectedRevision:1,reason:'Not owner'})).status,403);
    assert.equal((await call(cr+'/cancel',0,{expectedRevision:1,reason:'No longer needed'})).status,200);
    for(const action of ['approve','return','reject','override','resubmit','cancel']) {
      const payload:any={expectedRevision:2,reason:'Closed'};
      if(['approve','override','resubmit'].includes(action))payload.signatureDataUrl=mark;
      if(action==='resubmit')payload.formData=formData;
      if(action==='approve')delete payload.reason;
      if(action==='resubmit')delete payload.reason;
      assert.equal((await call(cr+'/'+action,action==='resubmit'||action==='cancel'?0:2,payload)).status,403);
    }
    // Wrong-company and missing sessions cannot invoke any mutation.
    for (const action of ['approve','return','reject','override','resubmit']) {
      const body: any={expectedRevision:3};
      if (['approve','override','resubmit'].includes(action)) body.signatureDataUrl=mark;
      if (['return','reject','override'].includes(action)) body.reason='Wrong company';
      if (action==='resubmit') body.formData=formData;
      assert.equal((await call(route+'/'+action,3,body)).status,404);
      const response=await fetch(base+route+'/'+action,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)});
      assert.equal(response.status,401);
    }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); rmSync(dir, { recursive:true, force:true }); }
});
