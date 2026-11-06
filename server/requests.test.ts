import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from './db';
import { provisionUser, createSession } from './auth';
import { createApp } from './app';
import { INITIAL_WORKFLOWS, INITIAL_REQUESTS } from '../src/data/seedData';
import type { RequestRecord } from '../src/types';

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
    record = await (await post(path+'/resubmit',0,{expectedRevision:3,formData:{...formData,workDescription:'Revised'},signatureDataUrl:signature,attachments:[],changeNote:'  '})).json();
    assert.equal(record.approvalHistory.at(-1).comments, 'Resubmitted Version 2');
    assert.equal(record.versionSnapshots.at(-1).changeNote, 'Version 2 corrections');
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

    const combinedType = 'Administrative & Payment Request';
    for (const role of ['IT', 'Finance', 'HR'] as const) {
      const id = await provisionUser(db, { email: `processing-${role}@example.test`, name: `Assigned ${role}`, department: role, companyId: 'PEW', role }, 'Synthetic-password-123');
      ids.push(id);
      cookies.push(`precisign_session=${createSession(db, id)}`);
    }
    const combinedWorkflow = { ...workflow, formType: combinedType, version: 1, processingUserIds: [ids[0], ids[4]],
      stages: workflow.stages.map(stage => stage.isFinalApproval ? { ...stage,
        backupSignerIds: [ids[3], ids[5]], backupCompletionUserIds: [ids[5]],
      } : stage),
    };
    db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW', combinedType, 1, JSON.stringify(combinedWorkflow));
    const optionalInput = { ...input, formType: combinedType, expectedWorkflowVersion: 1,
      formData: { ...formData, administrativePayment: { documentDescription: '' } }, signerChoices: {} };
    const finalId = combinedWorkflow.stages[1].id;
    assert.equal((await post('/requests', 0, { ...optionalInput, signerChoices: { [finalId]: null } })).status, 400);
    assert.equal((await post('/requests', 0, { ...optionalInput, signerChoices: { [finalId]: ids[4] } })).status, 400);
    const withSecondaries = (secondaryIds: string[]) => ({ ...optionalInput,
      signerChoices: { [finalId]: { primaryId: ids[2], secondaryIds } },
    });
    for (const invalid of [[ids[4]], [ids[3], ids[3]], [ids[2]], [ids[0]]]) {
      assert.equal((await post('/requests', 0, withSecondaries(invalid))).status, 400);
    }
    const alternateResponse = await post('/requests', 0, withSecondaries([ids[3], ids[5]]));
    assert.equal(alternateResponse.status, 201);
    const alternateRecord: RequestRecord = await alternateResponse.json();
    assert.deepEqual(alternateRecord.workflowConfig.stages.at(-1)?.backupSignerIds, [ids[3], ids[5]]);
    assert.deepEqual(alternateRecord.approvalSteps.map(step => step.assignedUserId), [ids[2]]);
    for (const backup of [3, 5]) {
      assert.equal((await post(`/requests/${alternateRecord.id}/approve`, backup, { expectedRevision: 1, signatureDataUrl: signature })).status, 404);
    }
    const subsetResponse = await post('/requests', 0, withSecondaries([ids[3]]));
    assert.equal(subsetResponse.status, 201);
    assert.deepEqual((await subsetResponse.json()).workflowConfig.stages.at(-1).backupCompletionUserIds, []);
    const optional = await post('/requests', 0, { ...optionalInput, signerChoices: undefined });
    assert.equal(optional.status, 201);
    const optionalRecord = await optional.json();
    assert.equal(optionalRecord.approvalSteps.length, 1);
    assert.equal(optionalRecord.currentApproverId, ids[2]);
    assert.deepEqual(optionalRecord.omittedSigningSteps, [combinedWorkflow.stages[0].name]);
    const paymentDetails = { documentDescription: 'Invoice', payment: { amount: '500.00', transferMode: 'Bank', purpose: 'Government Payment', transferDetails: 'Invoice reference 123' } };
    const originalPaymentForm = { ...formData, administrativePayment: paymentDetails };
    const oversizedDetails = { ...paymentDetails, payment: { ...paymentDetails.payment, transferDetails: 'x'.repeat(201) } };
    assert.equal((await post('/requests', 0, { ...optionalInput, formData: { ...formData, administrativePayment: oversizedDetails } })).status, 400);
    const initialPayment = await post('/requests', 0, { ...optionalInput, formData: originalPaymentForm });
    assert.equal(initialPayment.status, 201);
    const initialPaymentRecord = await initialPayment.json();
    assert.equal(initialPaymentRecord.formData.administrativePayment.payment.transferDetails, 'Invoice reference 123');
    const paymentPath = `/requests/${initialPaymentRecord.id}`;
    assert.equal((await post(paymentPath + '/approve', 2, { expectedRevision: 1, signatureDataUrl: signature })).status, 200);
    assert.equal((await post(paymentPath + '/process', 4, { expectedRevision: 2, action: 'hold', note: 'Amount needs checking' })).status, 200);
    assert.equal((await post(paymentPath + '/process', 0, { expectedRevision: 3, action: 'correction', note: 'Adjust amount' })).status, 403);
    const correction = await post(paymentPath + '/process', 4, { expectedRevision: 3, action: 'correction', note: 'Adjust amount' });
    assert.equal(correction.status, 200);
    assert.equal((await correction.json()).status, 'Returned for Correction');
    const updatedPayment = await post(paymentPath + '/resubmit', 0, {
      expectedRevision: 4, signatureDataUrl: signature,
      formData: { ...originalPaymentForm, administrativePayment: { ...paymentDetails, payment: { ...paymentDetails.payment, amount: '450.00', transferDetails: 'Invoice reference 124' } } },
    });
    assert.equal(updatedPayment.status, 200);
    const updatedRequest = await updatedPayment.json();
    assert.equal(updatedRequest.formData.administrativePayment.payment.amount, '450.00');
    assert.equal(updatedRequest.formData.administrativePayment.payment.transferDetails, 'Invoice reference 124');
    assert.equal(updatedRequest.formData.approvalAuthoritySignatureDataUrl, undefined);
    assert.equal(updatedRequest.versionSnapshots[0].formData.administrativePayment.payment.amount, '500.00');
    assert.equal(updatedRequest.versionSnapshots[0].formData.administrativePayment.payment.transferDetails, 'Invoice reference 123');
    assert.equal(updatedRequest.versionSnapshots[0].formData.approvalAuthoritySignatureDataUrl, signature);
    assert.equal((await post(paymentPath + '/process', 4, { expectedRevision: 5, action: 'payment', note: 'Too early' })).status, 403);
    assert.equal((await post(paymentPath + '/approve', 2, { expectedRevision: 5, signatureDataUrl: signature })).status, 200);
    assert.equal((await post(paymentPath + '/process', 4, { expectedRevision: 6, action: 'payment', note: 'Corrected amount paid' })).status, 200);
    for (const payment of [undefined, { amount: '500.00', transferMode: 'Bank', purpose: 'Government Payment' }]) {
      const combined = {
        ...input,
        formType: combinedType,
        expectedWorkflowVersion: 1,
        signerChoices: { [combinedWorkflow.stages[0].id]: ids[1] },
        formData: { ...formData, administrativePayment: { documentDescription: 'Supporting letter', payment } },
      };
      assert.equal((await post('/requests', 0, { ...combined, expectedWorkflowVersion: 0 })).status, 409);
      const created = await post('/requests', 0, combined);
      assert.equal(created.status, 201);
      const submitted = await created.json();
      assert.equal(submitted.formData.requesterSignatureDataUrl, signature);
      assert.deepEqual(submitted.formData.administrativePayment.payment, payment);
      const combinedPath = `/requests/${submitted.id}/approve`;
      const firstSigner = await post(combinedPath, 1, { expectedRevision: 1, signatureDataUrl: signature });
      assert.equal(firstSigner.status, 200);
      assert.equal((await firstSigner.json()).formData.administrativePayment.departmentHeadSignature.dataUrl, signature);
      const finalSigner = await post(combinedPath, 2, { expectedRevision: 2, signatureDataUrl: signature });
      assert.equal(finalSigner.status, 200);
      const signed = await finalSigner.json();
      assert.equal(signed.status, 'Approved');
      assert.equal(signed.formData.approvalAuthoritySignatureDataUrl, signature);
      const process = `/requests/${submitted.id}/process`;
      let revision = 3;
      if (payment) {
        assert.equal((await post(process, 0, { expectedRevision: revision, action: 'adminWork', note: 'Finished' })).status, 403);
        const hold = { expectedRevision: revision, action: 'hold', note: 'Need supporting invoice' };
        assert.equal((await post(process, 0, hold)).status, 403);
        assert.equal((await post(process, 4, hold)).status, 200);
        revision++;
        assert.equal((await post(process, 4, { expectedRevision: revision, action: 'payment', note: 'Cannot pay yet' })).status, 403);
        const evidence = { expectedRevision: revision, action: 'evidence', note: 'Requested invoice', attachment: { id: 'invoice', name: 'invoice.png', dataUrl: signature } };
        assert.equal((await post(process, 4, evidence)).status, 403);
        const evidenceResult = await post(process, 0, evidence);
        assert.equal(evidenceResult.status, 200);
        const evidenceRecord = await evidenceResult.json();
        assert.equal(evidenceRecord.financeHoldHistory[1].attachment.name, 'invoice.png');
        assert.deepEqual(evidenceRecord.formData, signed.formData);
        assert.deepEqual(evidenceRecord.attachments, signed.attachments);
        revision++;
        assert.equal((await post(process, 4, { expectedRevision: revision++, action: 'resume', note: 'Invoice checked' })).status, 200);
        const paid = await post(process, 4, { expectedRevision: revision++, action: 'payment', note: 'Payment reference 123' });
        assert.equal(paid.status, 200);
        assert.equal((await paid.json()).processing.payment.byUserId, ids[4]);
      }
      const completed = await post(process, 0, { expectedRevision: revision, action: 'adminWork', note: 'Documents delivered' });
      assert.equal(completed.status, 200);
      assert.equal((await completed.json()).processing.adminWork.byUserId, ids[0]);
    }
    const itWorkflow = { ...workflow, formType: 'IT Request', version: 1, processingUserIds: [ids[3]], stages: [{ ...workflow.stages[1], stageNumber: 1 }] };
    db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW', 'IT Request', 1, JSON.stringify(itWorkflow));
    const itRequest = { requestType: 'Network access', justification: 'Project handover' };
    const itInput = { ...input, formType: 'IT Request', expectedWorkflowVersion: 1, formData: { ...formData, itRequest } };
    assert.equal((await post('/requests', 0, { ...itInput, formData: { ...itInput.formData, itRequest: { ...itRequest, remarks: 'Forged' } } })).status, 400);
    const itCreated = await post('/requests', 0, itInput);
    assert.equal(itCreated.status, 201);
    const itRecord = await itCreated.json();
    const itPath = `/requests/${itRecord.id}`;
    assert.equal(itRecord.formData.requesterSignatureDataUrl, signature);
    assert.equal((await post(itPath + '/approve', 1, { expectedRevision: 1, signatureDataUrl: signature })).status, 403);
    assert.equal((await post(itPath + '/return', 2, { expectedRevision: 1, reason: 'Specify the network' })).status, 200);
    const revisedIt = { ...itInput.formData, itRequest: { ...itRequest, justification: 'Project VLAN handover' } };
    assert.equal((await post(itPath + '/resubmit', 0, { expectedRevision: 2, formData: revisedIt, signatureDataUrl: signature })).status, 200);
    const itSigned = await post(itPath + '/approve', 2, { expectedRevision: 3, signatureDataUrl: signature });
    assert.equal(itSigned.status, 200);
    const finalIt = await itSigned.json();
    assert.equal(finalIt.formData.approvalAuthoritySignatureDataUrl, signature);
    assert.deepEqual(finalIt.versionSnapshots[0].formData.itRequest, itRequest);
    assert.deepEqual(finalIt.formData.itRequest, revisedIt.itRequest);
    assert.equal((await post(itPath + '/process', 2, { expectedRevision: 4, action: 'itWork', note: 'Configured' })).status, 403);
    const processedIt = await post(itPath + '/process', 3, { expectedRevision: 4, action: 'itWork', note: 'Configured' });
    assert.equal(processedIt.status, 200);
    const itAfterProcessing = await processedIt.json();
    assert.equal(itAfterProcessing.processing.itWork.note, 'Configured');
    assert.deepEqual(itAfterProcessing.formData, finalIt.formData);
    assert.equal((await post(itPath + '/process', 3, { expectedRevision: 5, action: 'itWork', note: 'Duplicate' })).status, 403);
    const financialForms = [
      { type: 'Cash Voucher', data: { cashVoucher: { payee: 'Assigned HR', recipientUserId: ids[5], amount: '100.50', amountInWords: 'One hundred riyals and fifty halalas', source: 'Admin petty cash' } } },
      { type: 'Expense Claim', data: { expenseClaim: { designation: 'Analyst', project: 'Test project', lines: [{ date: '2026-11-05', particulars: 'Taxi', amount: '25.50', noBillReason: 'Driver did not issue a receipt' }] } } },
    ];
    for (const { type, data } of financialForms) {
      const config = { ...itWorkflow, formType: type, processingUserIds: [ids[0], ids[4]] };
      db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run('PEW', type, 1, JSON.stringify(config));
      const response = await post('/requests', 0, { ...input, formType: type, expectedWorkflowVersion: 1, formData: { ...formData, ...data } });
      assert.equal(response.status, 201);
      const financial = await response.json();
      const approvePath = `/requests/${financial.id}/approve`;
      assert.equal((await post(approvePath, 1, { expectedRevision: 1, signatureDataUrl: signature })).status, 403);
      const approvedResponse = await post(approvePath, 2, { expectedRevision: 1, signatureDataUrl: signature });
      assert.equal(approvedResponse.status, 200);
      const approved = await approvedResponse.json();
      assert.equal(approved.formData.approvalAuthoritySignatureDataUrl, signature);
      for (const [key, value] of Object.entries(data)) assert.deepEqual(approved.formData[key], value);
      if (type === 'Cash Voucher') {
        const voucherPath = `/requests/${financial.id}`;
        const process = voucherPath + '/process';
        const getAsRecipient = () => fetch(base + voucherPath, { headers: { Cookie: cookies[5] } });
        assert.equal((await getAsRecipient()).status, 404);
        const payout = { expectedRevision: 2, action: 'cashPayout', note: 'Cash handed over', signatureDataUrl: signature };
        assert.equal((await post(process, 4, payout)).status, 403);
        assert.equal((await post(process, 0, { ...payout, signatureDataUrl: undefined })).status, 400);
        const paid = await post(process, 0, payout);
        assert.equal(paid.status, 200);
        assert.equal((await paid.json()).processing.cashPayout.byUserId, ids[0]);
        assert.equal((await getAsRecipient()).status, 200);
        const receipt = { expectedRevision: 3, action: 'cashReceipt', note: 'Cash received', signatureDataUrl: signature };
        const waiver = { expectedRevision: 3, action: 'cashReceiptWaiver', note: 'Documented exception', signatureDataUrl: signature };
        assert.equal((await post(process, 2, waiver)).status, 403);
        assert.equal((await post(process, 0, receipt)).status, 403);
        const acknowledged = await post(process, 5, receipt);
        assert.equal(acknowledged.status, 200);
        const acknowledgedVoucher = await acknowledged.json();
        assert.equal(acknowledgedVoucher.processing.cashReceipt.signatureDataUrl, signature);
        assert.deepEqual(acknowledgedVoucher.formData, approved.formData);
        db.prepare('UPDATE workflows SET config=? WHERE company_id=? AND form_type=?')
          .run(JSON.stringify({ ...config, allowCashReceiptWaiver: true }), 'PEW', type);
        const exception = await (await post('/requests', 0, { ...input, formType: type, expectedWorkflowVersion: 1, formData: { ...formData, ...data } })).json();
        const exceptionPath = `/requests/${exception.id}`;
        assert.equal((await post(exceptionPath + '/approve', 2, { expectedRevision: 1, signatureDataUrl: signature })).status, 200);
        assert.equal((await post(exceptionPath + '/process', 2, { ...waiver, expectedRevision: 2 })).status, 403);
        assert.equal((await post(exceptionPath + '/process', 0, payout)).status, 200);
        assert.equal((await post(exceptionPath + '/process', 0, waiver)).status, 403);
        const waived = await post(exceptionPath + '/process', 2, waiver);
        assert.equal(waived.status, 200);
        assert.equal((await waived.json()).processing.cashReceiptWaiver.byUserId, ids[2]);
        assert.equal((await post(exceptionPath + '/process', 5, { ...receipt, expectedRevision: 4 })).status, 403);
      } else {
        const settlement = { expectedRevision: 2, action: 'expenseSettlement', note: 'Reimbursed', signatureDataUrl: signature };
        const process = `/requests/${financial.id}/process`;
        assert.equal((await post(process, 0, settlement)).status, 403);
        const settled = await post(process, 4, settlement);
        assert.equal(settled.status, 200);
        assert.equal((await settled.json()).processing.expenseSettlement.signatureDataUrl, signature);
      }
    }
    const receipt = { id: 'receipt', name: 'taxi.png', dataUrl: signature };
    const receiptLine = { date: '2026-11-05', particulars: 'Taxi', amount: '25.50', receiptIndex: 0 };
    const claimData = { ...formData, expenseClaim: { designation: 'Analyst', project: 'Project', lines: [receiptLine] } };
    const receiptClaim = { ...input, formType: 'Expense Claim', expectedWorkflowVersion: 1, formData: claimData, attachments: [receipt] };
    const unlinked = { ...claimData, expenseClaim: { ...claimData.expenseClaim, lines: [receiptLine, { ...receiptLine, receiptIndex: undefined }] } };
    assert.equal((await post('/requests', 0, { ...receiptClaim, formData: unlinked })).status, 400);
    assert.equal((await post('/requests', 0, { ...receiptClaim, attachments: [] })).status, 400);
    const linked = await post('/requests', 0, receiptClaim);
    assert.equal(linked.status, 201);
    const linkedClaim = await linked.json();
    assert.equal(linkedClaim.attachments[linkedClaim.formData.expenseClaim.lines[0].receiptIndex].name, 'taxi.png');
    const linkedPath = `/requests/${linkedClaim.id}`;
    assert.equal((await post(linkedPath + '/return', 2, { expectedRevision: 1, reason: 'More detail' })).status, 200);
    assert.equal((await post(linkedPath + '/resubmit', 0, { expectedRevision: 2, formData, signatureDataUrl: signature, attachments: [] })).status, 400);
    assert.equal((await post(linkedPath + '/resubmit', 0, { expectedRevision: 2, formData, signatureDataUrl: signature, attachments: [receipt] })).status, 200);
  } finally {server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
