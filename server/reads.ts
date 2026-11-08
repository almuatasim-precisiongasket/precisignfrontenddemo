import { currentCompanyDisplay } from '../src/utils/companyDisplay';
import { canReadPreciRoute } from '../src/utils/routeAccess';
import { Router, type Request } from 'express';
import { ownSignature } from './profile';
import type { DatabaseSync } from 'node:sqlite';
import type { Company, CompanyId, RequestRecord, UserProfile } from '../src/types/index';
import { canUserAccessCompany } from '../src/utils/companyAccess';
import { safeProfile, sessionUser } from './auth';
import { renderDocumentPdf } from './documentPdf';

const ids: CompanyId[] = ['PEW', 'ICCL', 'FSG'];
export function readRoutes(db: DatabaseSync, origin: string, sessionToken: (request: Request) => string | undefined) {
  const router = Router();
  let renderingPdf = false;
  router.get('/bootstrap', (_req, res) => {
    const user = res.locals.user as UserProfile;
    const allowed = ids.filter(id => canUserAccessCompany(user, id));
    const placeholders = allowed.map(() => '?').join(',');
    const rows = allowed.length ? db.prepare(`SELECT id,name,logo_data_url FROM companies LEFT JOIN company_logos ON company_id=id WHERE id IN (${placeholders})`).all(...allowed) : [];
    const companies: Company[] = rows.map(row => ({ id: row.id as CompanyId, code: String(row.id), name: String(row.name), logoDataUrl: (row.logo_data_url as string | null) ?? undefined, fullName: `${row.id} - ${row.name}`, groupName: 'PRECISION ENGINEERING GROUP' })).map(currentCompanyDisplay);
    const users = allowed.length ? db.prepare('SELECT id,email,name,role,department,company_id,allowed_companies,group_admin,company_grants,role_override,is_super_admin FROM account_profiles WHERE COALESCE(is_disabled,0)=0').all()
      .map(safeProfile).filter(candidate => allowed.some(id => canUserAccessCompany(candidate, id))) : [];
    const workflows = allowed.length ? db.prepare(`SELECT config FROM workflows WHERE company_id IN (${placeholders})`).all(...allowed).map(row => JSON.parse(String(row.config))) : [];
    res.json({ user: { ...user, ...ownSignature(db, user.id) }, companies, users, workflows });
  });
  router.get('/requests', (req, res) => {
    const scope = req.query.scope;
    if (scope !== undefined && (typeof scope !== 'string' || !['PEG', ...ids].includes(scope))) { res.status(400).json({ error: 'Invalid viewing scope.' }); return; }
    const allowed = ids.filter(id => canUserAccessCompany(res.locals.user, id) && (!scope || scope === 'PEG' || scope === id));
    const rows = allowed.length ? db.prepare(`SELECT record,revision FROM requests WHERE company_id IN (${allowed.map(() => '?').join(',')}) ORDER BY id`).all(...allowed) : [];
    res.json(rows.map(row => ({ ...JSON.parse(String(row.record)), revision: row.revision })).filter(record => canReadPreciRoute(res.locals.user, record)));
  });
  function readableRequest(id: string, user: UserProfile) {
    const row = db.prepare('SELECT record,revision FROM requests WHERE id=?').get(id);
    if (!row) return undefined;
    const record = JSON.parse(String(row.record)) as RequestRecord;
    if (!canUserAccessCompany(user, record.companyId) || !canReadPreciRoute(user, record)) return undefined;
    return { ...record, revision: row.revision };
  }
  router.get('/requests/:id', (req, res) => {
    const record = readableRequest(req.params.id, res.locals.user);
    if (!record) { res.status(404).json({ error: 'Request not found.' }); return; }
    res.json(record);
  });
  router.post('/requests/:id/document-pdf', async (req, res, next) => {
    const record = readableRequest(req.params.id, res.locals.user);
    const token = sessionToken(req);
    if (!record || !token) { res.status(404).json({ error: 'Request not found.' }); return; }
    const { version, updatedAt } = req.body ?? {};
    if (!['Admin Work Request', 'Administrative & Payment Request', 'IT Request', 'Cash Voucher', 'Expense Claim', 'R&D Initiative'].includes(record.formType)
      || !Number.isSafeInteger(version) || (version !== record.documentVersion && !(record.versionSnapshots ?? []).some(item => item.version === version))) {
      res.status(404).json({ error: 'Document version unavailable.' }); return;
    }
    if (record.updatedAt !== updatedAt) { res.status(409).json({ error: 'Request changed. Refresh before downloading.' }); return; }
    if (renderingPdf) { res.status(503).json({ error: 'Another PDF is being generated. Try again shortly.' }); return; }
    renderingPdf = true;
    try {
      const pdf = await renderDocumentPdf(origin, record.id, version, updatedAt, token);
      const currentUser = sessionUser(db, token);
      const current = currentUser && readableRequest(record.id, currentUser);
      if (!current || currentUser.id !== res.locals.user.id) { res.status(404).json({ error: 'Request not found.' }); return; }
      if (current.revision !== record.revision) { res.status(409).json({ error: 'Request changed. Refresh before downloading.' }); return; }
      res.type('application/pdf').send(pdf);
    } catch (error) {
      next(error);
    } finally {
      renderingPdf = false;
    }
  });
  return router;
}
