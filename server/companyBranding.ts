import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { currentCompanyDisplay } from '../src/utils/companyDisplay';
import type { Company, CompanyId } from '../src/types';
import { transaction } from './db';
import { bytes, fail, fields, RequestError } from './requestValidation';
import type { AsyncDatabase } from './asyncDatabase';

export function companyBrandingRoutes(db: DatabaseSync | AsyncDatabase) {
  const router = Router();
  const path = '/admin/company-branding';
  router.use(path, (_req, res, next) => {
    if (!res.locals.user.isSuperAdmin) { next(new RequestError(403, 'Administrator required.')); return; }
    next();
  });
  router.get(path, async (_req, res, next) => {
    try {
    const sql = `SELECT id,name,logo_data_url FROM companies LEFT JOIN company_logos ON company_id=id ORDER BY id`;
    const companies = 'prepare' in db ? db.prepare(sql).all() : (await db.execute(sql)).rows;
    res.json(companies.map(row => currentCompanyDisplay({
      id: row.id as CompanyId, code: String(row.id), name: String(row.name),
      fullName: `${row.id} - ${row.name}`, groupName: 'PRECISION ENGINEERING GROUP',
      logoDataUrl: (row.logo_data_url as string | null) ?? undefined,
    } satisfies Company)));
    } catch (error) { next(error); }
  });
  router.put(`${path}/:companyId`, async (req, res, next) => {
    try {
      const id = req.params.companyId;
      if (!['PEW', 'ICCL', 'FSG'].includes(id)) fail('Choose a legal company.');
      fields(req.body, ['logoDataUrl']);
      let logo: string | null = null;
      if (req.body.logoDataUrl !== null) {
        const input = await bytes(req.body.logoDataUrl, true);
        const image = await sharp(input).rotate().resize(384, 384, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        logo = `data:image/png;base64,${image.toString('base64')}`;
      }
      const remove = 'DELETE FROM company_logos WHERE company_id=?';
      const upsert = `INSERT INTO company_logos (company_id,logo_data_url) VALUES (?,?)
          ON CONFLICT(company_id) DO UPDATE SET logo_data_url=excluded.logo_data_url`;
      if ('prepare' in db) transaction(db, () => {
        if (!res.locals.requireCurrentUser().isSuperAdmin) throw new RequestError(403, 'Administrator required.');
        if (logo === null) db.prepare(remove).run(id);
        else db.prepare(upsert).run(id, logo);
      });
      else await db.transaction(async tx => {
        const actor = await res.locals.requireCurrentUserAsync(tx);
        if (!actor.isSuperAdmin) throw new RequestError(403, 'Administrator required.');
        if (logo === null) await tx.execute(remove, [id]);
        else await tx.execute(upsert, [id, logo]);
      });
      res.json({ logoDataUrl: logo });
    } catch (error) { next(error); }
  });
  return router;
}
