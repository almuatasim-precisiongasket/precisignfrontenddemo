import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { CompanyId, AdminWorkDraft } from '../src/types/index';
import { canUserAccessCompany, canUserStartForm } from '../src/utils/companyAccess';
import { transaction } from './db';
import { RequestError, fields, form, attachments } from './requestValidation';
import type { AsyncDatabase, AsyncQueryConnection } from './asyncDatabase';

export function draftRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new RequestError(400, 'Invalid draft revision.');
  return Number(value);
}

export function readDraft(db: DatabaseSync, userId: string, companyId: string) {
  const row = db.prepare('SELECT revision,data FROM drafts WHERE user_id=? AND company_id=? AND form_type=?').get(userId, companyId, 'Admin Work Request');
  return row ? { revision: Number(row.revision), data: JSON.parse(String(row.data)) as AdminWorkDraft | null } : { revision: 0, data: null };
}

// Called inside the caller's transaction. A tombstone prevents stale writes after clear/submit.
export function writeDraft(db: DatabaseSync, userId: string, companyId: string, expectedRevision: number, data: AdminWorkDraft | null) {
  const current = readDraft(db, userId, companyId);
  if (current.revision !== expectedRevision) throw new RequestError(409, 'Draft changed in another session.');
  const revision = current.revision + 1;
  db.prepare('INSERT INTO drafts VALUES (?,?,?,?,?) ON CONFLICT(user_id,company_id,form_type) DO UPDATE SET revision=excluded.revision,data=excluded.data')
    .run(userId, companyId, 'Admin Work Request', revision, JSON.stringify(data));
  return { revision, data };
}

export async function readDraftAsync(db: AsyncQueryConnection, userId: string, companyId: string) {
  const row = (await db.execute('SELECT revision,data FROM drafts WHERE user_id=? AND company_id=? AND form_type=?', [userId, companyId, 'Admin Work Request'])).rows[0];
  return row ? { revision: Number(row.revision), data: JSON.parse(String(row.data)) as AdminWorkDraft | null } : { revision: 0, data: null };
}

export async function writeDraftAsync(tx: AsyncQueryConnection, userId: string, companyId: string, expectedRevision: number, data: AdminWorkDraft | null) {
  const current = await readDraftAsync(tx, userId, companyId);
  if (current.revision !== expectedRevision) throw new RequestError(409, 'Draft changed in another session.');
  const revision = current.revision + 1;
  await tx.execute('INSERT INTO drafts VALUES (?,?,?,?,?) ON CONFLICT(user_id,company_id,form_type) DO UPDATE SET revision=excluded.revision,data=excluded.data',
    [userId, companyId, 'Admin Work Request', revision, JSON.stringify(data)]);
  return { revision, data };
}

export function draftRoutes(db: DatabaseSync | AsyncDatabase) {
  const router = Router();
  router.use('/drafts/:companyId/:formType', (req, res, next) => {
    const { companyId, formType } = req.params;
    if (!['PEW','ICCL','FSG'].includes(companyId) || formType !== 'Admin Work Request') { next(new RequestError(400, 'Invalid draft key.')); return; }
    if (!canUserAccessCompany(res.locals.user, companyId as CompanyId)) { next(new RequestError(403, 'Company access denied.')); return; }
    if (!canUserStartForm(res.locals.user, companyId as CompanyId, formType)) { next(new RequestError(403, 'Form access denied.')); return; }
    next();
  });
  router.get('/drafts/:companyId/:formType', async (req, res, next) => {
    try {
      res.json('prepare' in db ? readDraft(db, res.locals.user.id, req.params.companyId)
        : await readDraftAsync(db, res.locals.user.id, req.params.companyId));
    } catch (error) { next(error); }
  });
  router.put('/drafts/:companyId/:formType', async (req, res, next) => {
    try {
      fields(req.body, ['expectedRevision','data']);
      const expected = draftRevision(req.body.expectedRevision);
      const data = req.body.data;
      fields(data, ['dateOfRequest','department','priority','workDescription','documents','companyId','attachments']);
      if (data.companyId !== undefined && data.companyId !== req.params.companyId) throw new RequestError(400, 'Company mismatch.');
      const { attachments: files, companyId: _companyId, ...editable } = data;
      form(editable, true);
      const validated = { ...editable, companyId: req.params.companyId as CompanyId, attachments: await attachments(files, res.locals.user.name) };
      res.json('prepare' in db ? transaction(db, () => {
        const actor = res.locals.requireCurrentUser();
        if (!canUserAccessCompany(actor, req.params.companyId as CompanyId)) throw new RequestError(403, 'Company access denied.');
        if (!canUserStartForm(actor, req.params.companyId as CompanyId, req.params.formType)) throw new RequestError(403, 'Form access denied.');
        return writeDraft(db, actor.id, req.params.companyId, expected, validated);
      }) : await db.transaction(async tx => {
        const actor = await res.locals.requireCurrentUserAsync(tx);
        if (!canUserStartForm(actor, req.params.companyId as CompanyId, req.params.formType)) throw new RequestError(403, 'Form access denied.');
        return writeDraftAsync(tx, actor.id, req.params.companyId, expected, validated);
      }));
    } catch (error) { next(error); }
  });
  router.delete('/drafts/:companyId/:formType', async (req, res, next) => {
    try {
      fields(req.body, ['expectedRevision']);
      const expected = draftRevision(req.body.expectedRevision);
      res.json('prepare' in db ? transaction(db, () => writeDraft(db, res.locals.user.id, req.params.companyId, expected, null))
        : await db.transaction(async tx => {
          const actor = await res.locals.requireCurrentUserAsync(tx);
          if (!canUserStartForm(actor, req.params.companyId as CompanyId, req.params.formType)) throw new RequestError(403, 'Form access denied.');
          return writeDraftAsync(tx, actor.id, req.params.companyId, expected, null);
        }));
    } catch (error) { next(error); }
  });
  return router;
}
