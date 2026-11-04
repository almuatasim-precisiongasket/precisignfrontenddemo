import { currentCompanyDisplay } from '../src/utils/companyDisplay';
import { canReadPreciRoute } from '../src/utils/routeAccess';
import { Router } from 'express';
import { ownSignature } from './profile';
import type { DatabaseSync } from 'node:sqlite';
import type { Company, CompanyId, UserProfile } from '../src/types/index';
import { canUserAccessCompany } from '../src/utils/companyAccess';
import { safeProfile } from './auth';

const ids: CompanyId[] = ['PEW', 'ICCL', 'FSG'];
export function readRoutes(db: DatabaseSync) {
  const router = Router();
  router.get('/bootstrap', (_req, res) => {
    const user = res.locals.user as UserProfile;
    const allowed = ids.filter(id => canUserAccessCompany(user, id));
    const placeholders = allowed.map(() => '?').join(',');
    const rows = allowed.length ? db.prepare(`SELECT id,name FROM companies WHERE id IN (${placeholders})`).all(...allowed) : [];
    const companies: Company[] = rows.map(row => ({ id: row.id as CompanyId, code: String(row.id), name: String(row.name), fullName: `${row.id} - ${row.name}`, groupName: 'PRECISION ENGINEERING GROUP' })).map(currentCompanyDisplay);
    const users = db.prepare('SELECT id,email,name,role,department,company_id,allowed_companies,group_admin FROM users').all()
      .map(safeProfile).filter(candidate => allowed.some(id => canUserAccessCompany(candidate, id)));
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
  router.get('/requests/:id', (req, res) => {
    const allowed = ids.filter(id => canUserAccessCompany(res.locals.user, id));
    const row = allowed.length ? db.prepare(`SELECT record,revision FROM requests WHERE id=? AND company_id IN (${allowed.map(() => '?').join(',')})`).get(req.params.id, ...allowed) : undefined;
    if (!row || !canReadPreciRoute(res.locals.user, JSON.parse(String(row.record)))) { res.status(404).json({ error: 'Request not found.' }); return; }
    res.json({ ...JSON.parse(String(row.record)), revision: row.revision });
  });
  return router;
}
