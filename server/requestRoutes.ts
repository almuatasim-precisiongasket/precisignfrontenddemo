import { canReadPreciRoute } from '../src/utils/routeAccess';
import { proposeSignerReplacement, acceptSignerReplacement } from '../src/utils/routeReplacement';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './db';
import { draftRevision, writeDraft } from './drafts';
import { RequestError, fail, fields, text, bytes, attachments, form } from './requestValidation';
import { safeProfile } from './auth';
import { canUserAccessCompany } from '../src/utils/companyAccess';
import { createNewRequestRecord, approveRequestStage, returnRequestForCorrection, rejectRequest, resubmitCorrectedRequest, completePreciRoute, cancelPreciRoute } from '../src/utils/workflowEngine';
import type { AdminWorkFormData, AttachmentItem, RequestRecord, WorkflowConfig } from '../src/types/index';


export function requestRoutes(db: DatabaseSync) {
  const router = Router();
  router.post('/requests', async (req, res, next) => {
    try {
      const body = req.body; fields(body, ['companyId','formType','formData','attachments','comment','signatureDataUrl','expectedDraftRevision']);
      const expectedDraft = body.expectedDraftRevision === undefined ? undefined : draftRevision(body.expectedDraftRevision);
      if (body.companyId !== 'PEW' || body.formType !== 'Admin Work Request') fail('Only the configured PEW Admin pilot is enabled.');
      const actor = res.locals.user;
      if (!canUserAccessCompany(actor, body.companyId)) throw new RequestError(403, 'Company access denied.');
      const data = form(body.formData); await bytes(body.signatureDataUrl, true);
      if (body.comment !== undefined) text(body.comment, 2000, false);
      const files = await attachments(body.attachments, actor.name);
      const record = transaction(db, () => {
        const row = db.prepare('SELECT config FROM workflows WHERE company_id=? AND form_type=?').get(body.companyId, body.formType);
        if (!row) fail('No workflow is configured for this company.');
        const workflow = JSON.parse(String(row!.config)) as WorkflowConfig;
        const company = db.prepare('SELECT name FROM companies WHERE id=?').get(body.companyId)!;
        const users = db.prepare('SELECT * FROM users').all().map(safeProfile);
        if (workflow.stages.some(stage => stage.assignedUserId === actor.id || (!stage.assignedUserId && users.some(user => user.id === actor.id && user.role === stage.assignedRole)))) {
          fail('The requester cannot also be an approver.');
        }
        if (!workflow.stages.length || workflow.stages.some((stage,index) => stage.isFinalApproval !== (index === workflow.stages.length - 1))) fail('Invalid final approver designation.');
        const result = { ...createNewRequestRecord({ id: `PEW-AW-${new Date().getFullYear()}-${randomUUID()}`, formType: body.formType, formData: { ...data, companyId: body.companyId, companyName: `PEW - ${company.name}`, requesterId: actor.id, requesterName: actor.name }, requester: actor, workflowConfig: workflow, users, attachments: files, comment: body.comment, signatureDataUrl: body.signatureDataUrl }), revision: 1 };
        db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)').run(result.id, result.companyId, actor.id, result.status, 1, JSON.stringify(result));
        if (expectedDraft !== undefined) writeDraft(db, actor.id, result.companyId, expectedDraft, null);
        return result;
      });
      res.status(201).json(record);
    } catch (error) { next(error); }
  });
  router.post('/requests/:id/:action', async (req, res, next) => {
    try {
      const action = req.params.action; const body = req.body; const actor = res.locals.user;
      const allowed: Record<string,string[]> = { replace: ['expectedRevision','stageId','newUserId','reason'], 'accept-replacement': ['expectedRevision','accept'], cancel: ['expectedRevision','reason'], approve: ['expectedRevision','comment','signatureDataUrl'], return: ['expectedRevision','reason'], reject: ['expectedRevision','reason'], resubmit: ['expectedRevision','formData','attachments','changeNote','signatureDataUrl'], override: ['expectedRevision','reason','signatureDataUrl'] };
      if (!allowed[action]) throw new RequestError(404, 'Action not found.');
      fields(body, allowed[action]);
      if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) fail('Invalid revision.');
      if (['approve','resubmit'].includes(action) || (action === 'override' && body.signatureDataUrl)) await bytes(body.signatureDataUrl, true);
      if (['return','reject','override','cancel','replace'].includes(action)) text(body.reason, 2000);
      if (body.comment !== undefined) text(body.comment, 2000, false);
      if (body.changeNote !== undefined) text(body.changeNote, 2000, false);
      if (action === 'replace') { text(body.stageId,150); text(body.newUserId,150); }
      if (action === 'accept-replacement' && typeof body.accept !== 'boolean') fail('Acceptance required.');
      const revised = action === 'resubmit' ? form(body.formData) : undefined;
      const files = action === 'resubmit' && body.attachments !== undefined ? await attachments(body.attachments, actor.name) : undefined;
      const updated = transaction(db, () => {
        const row = db.prepare('SELECT * FROM requests WHERE id=?').get(req.params.id);
        if (!row || !canUserAccessCompany(actor, row.company_id as any)) throw new RequestError(404, 'Request not found.');
        const request = JSON.parse(String(row.record)) as RequestRecord & { attachmentVersions?: { version: number; attachments: AttachmentItem[] }[] };
        if (!canReadPreciRoute(actor,request)) throw new RequestError(404,'Request not found.');
        if (row.revision !== body.expectedRevision) throw new RequestError(409, 'Request changed. Refresh and review again.');
        const targetRow = action === 'replace' ? db.prepare('SELECT * FROM users WHERE id=?').get(body.newUserId) : undefined;
        if (action === 'replace' && !targetRow) fail('Replacement user not found.');
        const result = action === 'replace' ? proposeSignerReplacement(request,actor,safeProfile(targetRow!),body.stageId,body.reason)
          : action === 'accept-replacement' ? acceptSignerReplacement(request,actor,body.accept)
          : action === 'cancel' ? cancelPreciRoute({ request, actingUser: actor, reason: body.reason }) : action === 'approve' ? approveRequestStage({ request, actingUser: actor, comment: body.comment, signatureDataUrl: body.signatureDataUrl })
          : action === 'return' ? returnRequestForCorrection({ request, actingUser: actor, reason: body.reason })
          : action === 'reject' ? rejectRequest({ request, actingUser: actor, reason: body.reason })
          : action === 'override' ? completePreciRoute({ request, actingUser: actor, signatureDataUrl: body.signatureDataUrl, reason: body.reason })
          : resubmitCorrectedRequest({ request, actingUser: actor, updatedFormData: { ...request.formData, ...revised }, attachments: files, changeNote: body.changeNote, signatureDataUrl: body.signatureDataUrl });
        if (!result.success || !result.updatedRequest) throw new RequestError(403, result.error || 'Action rejected.');
        const record = { ...result.updatedRequest, revision: Number(row.revision) + 1,
          attachmentVersions: action === 'resubmit' ? [...(request.attachmentVersions || []), { version: request.documentVersion, attachments: request.attachments }] : request.attachmentVersions };
        if (record.pendingReplacement && (record.status !== 'Pending Approval' || ['Approved','Bypassed','Rejected'].includes(record.approvalSteps.find(step => step.stageId === record.pendingReplacement!.stageId)?.status || ''))) record.pendingReplacement = undefined;
        db.prepare('UPDATE requests SET status=?,revision=?,record=? WHERE id=? AND revision=?').run(record.status, record.revision, JSON.stringify(record), request.id, body.expectedRevision);
        return record;
      });
      res.json(updated);
    } catch (error) { next(error); }
  });
  return router;
}
