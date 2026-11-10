import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_USERS, INITIAL_WORKFLOWS, INITIAL_REQUESTS } from '../data/seedData';
import { createNewRequestRecord, approveRequestStage, returnRequestForCorrection, resubmitCorrectedRequest } from './workflowEngine';
import type { RequestRecord } from '../types';
import { captureApproval, freezeVersion } from './historicalEvidence';
const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';
function scenario() {
  const [requester, reviewer, final] = structuredClone(INITIAL_USERS);
  let record = createNewRequestRecord({id:'synthetic-evidence', formType:'Admin Work Request', formData:structuredClone(INITIAL_REQUESTS[0].formData), requester, workflowConfig:structuredClone(INITIAL_WORKFLOWS[0]), users:[requester,reviewer,final], signatureDataUrl:signature});
  const approved = approveRequestStage({request:record,actingUser:reviewer,signatureDataUrl:signature});
  assert.ok(approved.success, approved.error); record=approved.updatedRequest!;
  const returned=returnRequestForCorrection({request:record,actingUser:final,reason:'Synthetic correction'});
  assert.ok(returned.success,returned.error);
  const revised=resubmitCorrectedRequest({request:returned.updatedRequest!,actingUser:requester,updatedFormData:structuredClone(record.formData),signatureDataUrl:signature});
  assert.ok(revised.success,revised.error);
  return {record:revised.updatedRequest!,reviewer};
}
test('legacy request JSON remains readable without optional evidence fields',()=>{
  const legacy=JSON.parse(JSON.stringify(INITIAL_REQUESTS[0])) as RequestRecord;
  assert.equal(legacy.approvalEvidence,undefined);
  assert.ok(legacy.formData); assert.ok(legacy.approvalHistory.length);
});
test('approval evidence preserves exact image, actor, step and version after resubmission',()=>{
  const {record,reviewer}=scenario();
  const evidence=record.approvalEvidence?.find(e=>e.actorId===reviewer.id && e.documentVersion===1);
  assert.ok(evidence,'Missing version 1 approval evidence after resubmission');
  assert.equal(evidence.signatureDataUrl,signature);
  assert.equal(evidence.actorName,reviewer.name);
  assert.equal(evidence.stepId,record.approvalSteps[0].stageId);
  assert.equal(evidence.decision,'approved'); assert.ok(evidence.recordedAt);
  const state=record.signedDocumentStates?.find(s=>s.id===evidence.documentStateId);
  assert.ok(state,'Missing referenced pre-approval state'); assert.equal(state.documentVersion,1);
});
test('outgoing version freezes signed presentation before clearing active signatures',()=>{
  const {record}=scenario();
  const frozen=record.frozenVersionPresentations?.find(v=>v.documentVersion===1);
  assert.ok(frozen,'Missing frozen version 1 presentation');
  assert.equal(frozen.approvalSteps[0].signatureDataUrl,signature);
  assert.equal(frozen.disposition,'returned');
  assert.equal(record.documentVersion,2); assert.equal(record.approvalSteps[0].signatureDataUrl,undefined);
});

test('captured content, branding and attachment bytes are independent of later edits',()=>{
  const {record,reviewer}=scenario();
  record.formData.companyLogoDataUrl=signature;
  record.attachments=[{id:'synthetic-file',name:'test.png',sizeBytes:1,sizeFormatted:'1 B',uploadedAt:'synthetic',uploadedBy:'synthetic',mimeType:'image/png',dataUrl:signature}];
  const captured=captureApproval(record,record,reviewer,record.approvalSteps[0],signature,'2026-11-07T00:00:00.000Z');
  const state=captured.signedDocumentStates!.at(-1)!;
  const files=captured.versionAttachmentSets!.find(set=>set.id===state.attachmentSetId)!;
  const frozen=freezeVersion(captured,'rejected');
  record.formData.workDescription='Changed'; record.formData.companyLogoDataUrl='changed';
  record.attachments[0].dataUrl='changed'; reviewer.signatureDataUrl='changed';
  assert.notEqual(state.formData.workDescription,'Changed');
  assert.equal(state.formData.companyLogoDataUrl,signature);
  assert.equal(files.attachments[0].dataUrl,signature);
  assert.equal(captured.approvalEvidence!.at(-1)!.signatureDataUrl,signature);
  assert.equal(frozen.frozenVersionPresentations!.at(-1)!.disposition,'rejected');
  assert.notEqual(frozen.frozenVersionPresentations!.at(-1)!.formData.workDescription,'Changed');
});
