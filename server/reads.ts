import { Router, type Request } from 'express';
import type { AsyncDatabase } from './asyncDatabase';
import type { DatabaseSync } from 'node:sqlite';
import type { Company, CompanyId, RequestRecord, UserProfile } from '../src/types';
import { canUserAccessCompany } from '../src/utils/companyAccess';
import { canReadPreciRoute } from '../src/utils/routeAccess';
import { currentCompanyDisplay } from '../src/utils/companyDisplay';
import { safeProfile, sessionUser, sessionUserAsync } from './auth';
import { renderDocumentPdf } from './documentPdf';
import { ownSignature, ownSignatureAsync } from './profile';

const companies: CompanyId[] = ['PEW', 'ICCL', 'FSG'];

export function readRoutes(db: DatabaseSync | AsyncDatabase, origin: string, sessionToken: (request: Request) => string | undefined) {
  const router = Router();
  const query = async (sql: string, args: string[] = []) => 'prepare' in db
    ? db.prepare(sql).all(...args) : (await db.execute(sql, args)).rows;
  router.get('/bootstrap', async (_req, res, next) => {
    try {
      const user = res.locals.user as UserProfile;
      const allowed = companies.filter(id => canUserAccessCompany(user, id));
      const placeholders = allowed.map(() => '?').join(',');
      const companyRows = allowed.length ? (await query(`SELECT id,name,logo_data_url FROM companies LEFT JOIN company_logos ON company_id=id WHERE id IN (${placeholders})`, allowed)) : [];
      const companyList: Company[] = companyRows.map(row => currentCompanyDisplay({
        id: row.id as CompanyId, code: String(row.id), name: String(row.name),
        logoDataUrl: (row.logo_data_url as string | null) ?? undefined,
        fullName: `${row.id} - ${row.name}`, groupName: 'PRECISION ENGINEERING GROUP',
      }));
      const users = allowed.length ? (await query('SELECT id,email,name,role,department,company_id,allowed_companies,group_admin,company_grants,role_override,is_super_admin FROM account_profiles WHERE COALESCE(is_disabled,0)=0'))
        .map(safeProfile).filter(candidate => allowed.some(id => canUserAccessCompany(candidate, id))) : [];
      const workflows = allowed.length ? (await query(`SELECT config FROM workflows WHERE company_id IN (${placeholders})`, allowed)).map(row => JSON.parse(String(row.config))) : [];
      res.json({ user: { ...user, ...('prepare' in db ? ownSignature(db, user.id) : await ownSignatureAsync(db, user.id)) }, companies: companyList, users, workflows });
    } catch (error) { next(error); }
  });
  router.get('/requests', async (req, res, next) => {
    try {
      const scope = req.query.scope;
      if (scope !== undefined && (typeof scope !== 'string' || !['PEG', ...companies].includes(scope))) {
        res.status(400).json({ error: 'Invalid viewing scope.' }); return;
      }
      const user = res.locals.user as UserProfile;
      const allowed = companies.filter(id => canUserAccessCompany(user, id) && (!scope || scope === 'PEG' || scope === id));
      if (!allowed.length) { res.json([]); return; }
      const rows = (await query(`SELECT record,revision FROM requests WHERE company_id IN (${allowed.map(() => '?').join(',')}) ORDER BY id`, allowed));
      res.json(rows.map(row => ({ ...JSON.parse(String(row.record)), revision: Number(row.revision) })).filter(record => canReadPreciRoute(user, record)));
    } catch (error) { next(error); }
  });
  async function readableRequest(id: string, user: UserProfile) {
    const row = (await query('SELECT record,revision FROM requests WHERE id=?', [id]))[0];
    if (!row) return undefined;
    const record = JSON.parse(String(row.record)) as RequestRecord;
    if (!canUserAccessCompany(user, record.companyId) || !canReadPreciRoute(user, record)) return undefined;
    return { ...record, revision: Number(row.revision) };
  }
  router.get('/requests/:id', async (req, res, next) => {
    try {
      const record = await readableRequest(req.params.id, res.locals.user);
      if (!record) { res.status(404).json({ error: 'Request not found.' }); return; }
      res.json(record);
    } catch (error) { next(error); }
  });
  attachDocumentPdfRoute(router, origin, sessionToken, readableRequest, token => 'prepare' in db ? sessionUser(db, token) : sessionUserAsync(db, token));
  return router;
}

function attachDocumentPdfRoute(
  router: ReturnType<typeof Router>,
  origin: string,
  sessionToken: (request: Request) => string | undefined,
  readableRequest: (id: string, user: UserProfile) => (RequestRecord & { revision: unknown }) | undefined | Promise<(RequestRecord & { revision: unknown }) | undefined>,
  lookupSession: (token: string) => UserProfile | null | Promise<UserProfile | null>,
) {
  let renderingPdf = false;
  router.post('/requests/:id/document-pdf', async (req, res, next) => {
    let record;
    try { record = await readableRequest(req.params.id, res.locals.user); } catch (error) { next(error); return; }
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
      const currentUser = await lookupSession(token);
      const current = currentUser && await readableRequest(record.id, currentUser);
      if (!current || currentUser.id !== res.locals.user.id) { res.status(404).json({ error: 'Request not found.' }); return; }
      if (current.revision !== record.revision) { res.status(409).json({ error: 'Request changed. Refresh before downloading.' }); return; }
      res.type('application/pdf').send(pdf);
    } catch (error) {
      next(error);
    } finally {
      renderingPdf = false;
    }
  });
}
