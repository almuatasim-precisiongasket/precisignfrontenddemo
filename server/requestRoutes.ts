import { saveRndEvaluation } from '../src/utils/rndWorkflow';
import { canReadPreciRoute } from '../src/utils/routeAccess';
import { proposeSignerReplacement, acceptSignerReplacement } from '../src/utils/routeReplacement';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './db';
import type { AsyncDatabase } from './asyncDatabase';
import { draftRevision, writeDraft, writeDraftAsync } from './drafts';
import { RequestError, fail, fields, text, bytes, attachments, form } from './requestValidation';
import { safeProfile } from './auth';
import { canUserAccessCompany, canUserStartForm } from '../src/utils/companyAccess';
import { createNewRequestRecord, approveRequestStage, returnRequestForCorrection, rejectRequest, resubmitCorrectedRequest, completePreciRoute, cancelPreciRoute } from '../src/utils/workflowEngine';
import type { AdminWorkFormData, AttachmentItem, CompanyId, RequestRecord, UserProfile, WorkflowConfig } from '../src/types/index';
import { SUBMITTABLE_FORMS } from '../src/services/apiTypes';
import { recordProcessing, processingLabels, processingRequiresSignature, financeHoldActions } from '../src/utils/routeProcessing';
import { expenseEvidenceError, preservesExpenseReceipts } from '../src/utils/expenseEvidence';
import { applySignerChoices } from '../src/utils/signingSelection';


export function requestRoutes(db: DatabaseSync | AsyncDatabase) {
  const router = Router();
  router.post('/requests', async (req, res, next) => {
    try {
      const body = req.body; fields(body, ['companyId','formType','formData','attachments','comment','signatureDataUrl','expectedDraftRevision','expectedWorkflowVersion','signerChoices']);
      const expectedDraft = body.expectedDraftRevision === undefined ? undefined : draftRevision(body.expectedDraftRevision);
      const combined = body.formType === 'Administrative & Payment Request';
      const it = body.formType === 'IT Request';
      const financial = body.formType === 'Cash Voucher' ? 'cashVoucher' : body.formType === 'Expense Claim' ? 'expenseClaim' : undefined;
      const legacy = body.formType === 'Admin Work Request';
      if (!['PEW', 'ICCL', 'FSG'].includes(body.companyId) || !SUBMITTABLE_FORMS.includes(body.formType)) fail('Choose a legal company and a supported form.');
      const companyId = body.companyId as CompanyId;
      if (!legacy && expectedDraft !== undefined) fail('This draft revision belongs to the legacy form.');
      const actor = res.locals.user;
      if (!canUserStartForm(actor, companyId, body.formType)) throw new RequestError(403, 'Company or form access denied.');
      const data = form(body.formData, false, combined, it, financial, body.formType === 'R&D Initiative'); await bytes(body.signatureDataUrl, true);
      if (body.comment !== undefined) text(body.comment, 2000, false);
      const files = await attachments(body.attachments, actor.name);
      if (data.expenseClaim) {
        const evidenceError = expenseEvidenceError(data.expenseClaim, files);
        if (evidenceError) fail(evidenceError);
      }
      const workflowSql = 'SELECT config FROM workflows WHERE company_id=? AND form_type=?';
      const companySql = 'SELECT name,logo_data_url FROM companies LEFT JOIN company_logos ON company_id=id WHERE id=?';
      const usersSql = 'SELECT * FROM account_profiles WHERE COALESCE(is_disabled,0)=0';
      const insertSql = 'INSERT INTO requests VALUES (?,?,?,?,?,?)';
      function buildRecord(actor: UserProfile, row: Record<string, unknown> | undefined, company: Record<string, unknown> | undefined, users: UserProfile[]) {
        if (!company) fail('Company not found.');
        if (!canUserStartForm(actor, companyId, body.formType)) throw new RequestError(403, 'Company or form access denied.');
        if (!row) fail('No workflow is configured for this company.');
        let workflow = JSON.parse(String(row!.config)) as WorkflowConfig;
        if (!legacy && workflow.version !== body.expectedWorkflowVersion) throw new RequestError(409, 'The signing route changed. Review the updated route before sending.');
        if (legacy && body.signerChoices !== undefined) fail('Signer selection is unavailable on the legacy form.');
        const selection = applySignerChoices(workflow, users, actor.id, body.signerChoices);
        if (!selection.workflow) throw new RequestError(400, selection.error);
        workflow = selection.workflow;
        if (workflow.stages.some(stage => stage.assignedUserId && !users.some(user => user.id === stage.assignedUserId && canUserAccessCompany(user, companyId)))) fail('A configured signer is unavailable.');
        if (data.cashVoucher) {
          const recipient = users.find(user => user.id === data.cashVoucher?.recipientUserId);
          if (!recipient || !canUserAccessCompany(recipient, companyId) || recipient.name !== data.cashVoucher.payee) fail('Choose an eligible voucher recipient.');
        }
        if (workflow.stages.some(stage => stage.assignedUserId === actor.id || (!stage.assignedUserId && users.some(user => user.id === actor.id && user.role === stage.assignedRole)))) {
          fail('The requester cannot also be an approver.');
        }
        if (!workflow.stages.length || workflow.stages.some((stage,index) => stage.isFinalApproval !== (index === workflow.stages.length - 1))) fail('Invalid final approver designation.');
        const prefix = body.formType === 'R&D Initiative' ? 'RD' : it ? 'IT' : combined ? 'AP' : financial === 'cashVoucher' ? 'CV' : financial === 'expenseClaim' ? 'EC' : 'AW';
        const result = {
          ...createNewRequestRecord({
            id: `${companyId}-${prefix}-${new Date().getFullYear()}-${randomUUID()}`,
            formType: body.formType,
            formData: { ...data, companyId, companyName: `${companyId} - ${company!.name}`, companyLogoDataUrl: legacy ? undefined : (company!.logo_data_url as string | null) ?? undefined, requesterId: actor.id, requesterName: actor.name },
            requester: actor, workflowConfig: workflow, users, attachments: files, comment: body.comment, signatureDataUrl: body.signatureDataUrl,
          }),
          omittedSigningSteps: selection.omittedSigningSteps, revision: 1,
        };
        return result;
      }
      const record = 'prepare' in db ? transaction(db, () => {
        const actor = res.locals.requireCurrentUser();
        const result = buildRecord(actor, db.prepare(workflowSql).get(companyId, body.formType),
          db.prepare(companySql).get(companyId), db.prepare(usersSql).all().map(safeProfile));
        db.prepare(insertSql).run(result.id, result.companyId, actor.id, result.status, 1, JSON.stringify(result));
        if (expectedDraft !== undefined) writeDraft(db, actor.id, result.companyId, expectedDraft, null);
        return result;
      }) : await db.transaction(async tx => {
        const actor = await res.locals.requireCurrentUserAsync(tx);
        const workflow = (await tx.execute(workflowSql, [companyId, body.formType])).rows[0];
        const company = (await tx.execute(companySql, [companyId])).rows[0];
        const users = (await tx.execute(usersSql)).rows.map(safeProfile);
        const result = buildRecord(actor, workflow, company, users);
        await tx.execute(insertSql, [result.id, result.companyId, actor.id, result.status, 1, JSON.stringify(result)]);
        if (expectedDraft !== undefined) await writeDraftAsync(tx, actor.id, result.companyId, expectedDraft, null);
        return result;
      });
      res.status(201).json(record);
    } catch (error) { next(error); }
  });
  router.post('/requests/:id/:action', async (req, res, next) => {
    try {
      const action = req.params.action; const body = req.body; const actor = res.locals.user;
      const allowed: Record<string,string[]> = { replace: ['expectedRevision','stageId','newUserId','reason'], 'accept-replacement': ['expectedRevision','accept'], cancel: ['expectedRevision','reason'], approve: ['expectedRevision','comment','signatureDataUrl'], return: ['expectedRevision','reason'], reject: ['expectedRevision','reason'], resubmit: ['expectedRevision','formData','attachments','changeNote','signatureDataUrl'], override: ['expectedRevision','reason','signatureDataUrl'] };
      allowed['rnd-evaluation'] = ['expectedRevision', 'evaluation'];
      allowed.process = ['expectedRevision', 'action', 'note', 'signatureDataUrl', 'attachment'];
      if (!Object.hasOwn(allowed, action)) throw new RequestError(404, 'Action not found.');
      fields(body, allowed[action]);
      if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) fail('Invalid revision.');
      if (action === 'process') {
        if (typeof body.action !== 'string' || (!Object.hasOwn(processingLabels, body.action) && !financeHoldActions.some(action => action === body.action))) fail('Invalid processing action.');
        text(body.note, 2000);
        if (processingRequiresSignature(body.action)) await bytes(body.signatureDataUrl, true);
      }
      if (['approve','resubmit'].includes(action) || (action === 'override' && body.signatureDataUrl)) await bytes(body.signatureDataUrl, true);
      if (['return','reject','override','cancel','replace'].includes(action)) text(body.reason, 2000);
      if (body.comment !== undefined) text(body.comment, 2000, false);
      if (body.changeNote !== undefined) text(body.changeNote, 2000, false);
      if (action === 'replace') { text(body.stageId,150); text(body.newUserId,150); }
      if (action === 'accept-replacement' && typeof body.accept !== 'boolean') fail('Acceptance required.');
      const files = action === 'resubmit' && body.attachments !== undefined ? await attachments(body.attachments, actor.name) : undefined;
      const evidence = action === 'process' && body.attachment !== undefined ? (await attachments([body.attachment], actor.name))[0] : undefined;
      const lookup = 'SELECT * FROM requests WHERE id=?';
      const replacement = 'SELECT * FROM account_profiles WHERE id=? AND COALESCE(is_disabled,0)=0';
      const update = 'UPDATE requests SET status=?,revision=?,record=? WHERE id=? AND revision=?';
      function nextRecord(actor: UserProfile, row: Record<string, unknown> | undefined, targetRow?: Record<string, unknown>) {
        if (!row || !canUserAccessCompany(actor, row.company_id as any)) throw new RequestError(404, 'Request not found.');
        const request = JSON.parse(String(row.record)) as RequestRecord & { attachmentVersions?: { version: number; attachments: AttachmentItem[] }[] };
        if (!canReadPreciRoute(actor,request)) throw new RequestError(404,'Request not found.');
        if (Number(row.revision) !== body.expectedRevision) throw new RequestError(409, 'Request changed. Refresh and review again.');
        if (action === 'resubmit' && request.formType === 'Expense Claim' && files && request.formData.expenseClaim
          && !preservesExpenseReceipts(request.formData.expenseClaim, request.attachments, files)) {
          fail('Receipt links must be preserved when resubmitting this claim.');
        }
        const revised = action === 'resubmit' ? form(body.formData, false,
          request.formType === 'Administrative & Payment Request' && body.formData?.administrativePayment !== undefined,
          request.formType === 'IT Request',
          request.formType === 'Expense Claim' && body.formData?.expenseClaim !== undefined ? 'expenseClaim' : undefined, request.formType === 'R&D Initiative') : undefined;
        if (revised?.expenseClaim) {
          const error = expenseEvidenceError(revised.expenseClaim, files ?? request.attachments);
          if (error) fail(error);
        }
        if (action === 'replace' && !targetRow) fail('Replacement user not found.');
        const result = action === 'rnd-evaluation' ? saveRndEvaluation(request, actor, body.evaluation) : action === 'process' ? recordProcessing(request, actor, body.action, body.note, body.signatureDataUrl, evidence)
          : action === 'replace' ? proposeSignerReplacement(request,actor,safeProfile(targetRow!),body.stageId,body.reason)
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
        return record;
      }
      function updateArgs(record: ReturnType<typeof nextRecord>) {
        return [record.status, record.revision, JSON.stringify(record), record.id, body.expectedRevision];
      }
      const updated = 'prepare' in db ? transaction(db, () => {
        const actor = res.locals.requireCurrentUser();
        const row = db.prepare(lookup).get(req.params.id);
        const target = action === 'replace' ? db.prepare(replacement).get(body.newUserId) : undefined;
        const record = nextRecord(actor, row, target);
        const saved = db.prepare(update).run(...updateArgs(record));
        if (saved.changes !== 1) throw new RequestError(409, 'Request changed. Refresh and review again.');
        return record;
      }) : await db.transaction(async tx => {
        const actor = await res.locals.requireCurrentUserAsync(tx);
        const row = (await tx.execute(lookup, [req.params.id])).rows[0];
        const target = action === 'replace' ? (await tx.execute(replacement, [body.newUserId])).rows[0] : undefined;
        const record = nextRecord(actor, row, target);
        const saved = await tx.execute(update, updateArgs(record));
        if (saved.rowsAffected !== 1) throw new RequestError(409, 'Request changed. Refresh and review again.');
        return record;
      });
      res.json(updated);
    } catch (error) { next(error); }
  });
  return router;
}
