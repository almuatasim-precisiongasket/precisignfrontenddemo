import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { normalizeEmail, tokenHash } from './auth';
import { transaction } from './db';
import { fields, RequestError, text } from './requestValidation';

const companies = ['PEW', 'ICCL', 'FSG'];
const forms = ['Administrative & Payment Request', 'IT Request', 'Cash Voucher', 'Expense Claim', 'Admin Work Request'];

export function accountAdminRoutes(db: DatabaseSync, origin: string, now: () => number) {
  const router = Router();
  router.use('/admin/accounts', (_req, res, next) => {
    if (!res.locals.user.isSuperAdmin) { next(new RequestError(403, 'Administrator required.')); return; }
    next();
  });
  router.get('/admin/accounts', (_req, res) => {
    const accounts = db.prepare(`SELECT id,name,email,department,COALESCE(role_override,role) AS effective_role,company_grants,form_grants,is_super_admin,is_disabled
      FROM account_profiles ORDER BY name COLLATE NOCASE, id`).all();
    res.json(accounts.map(row => ({
      id: row.id, name: row.name, email: row.email, department: row.department, role: row.effective_role,
      companyGrants: typeof row.company_grants === 'string' ? JSON.parse(row.company_grants) : null,
      formGrants: typeof row.form_grants === 'string' ? JSON.parse(row.form_grants) : null,
      isSuperAdmin: row.is_super_admin === 1,
      isDisabled: row.is_disabled === 1,
    })));
  });
  router.patch('/admin/accounts/:id', (req, res, next) => {
    try {
      fields(req.body, ['email', 'isDisabled', 'role']);
      const { email, isDisabled, role } = req.body;
      if (role !== undefined && !['Employee', 'Admin', 'IT', 'Finance'].includes(role)) throw new RequestError(400, 'Invalid staff role.');
      if (email === undefined && isDisabled === undefined && role === undefined) throw new RequestError(400, 'No change requested.');
      if (isDisabled !== undefined && typeof isDisabled !== 'boolean') throw new RequestError(400, 'Invalid account status.');
      const normalizedEmail = email === undefined ? undefined : normalizeEmail(text(email, 254));
      if (normalizedEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new RequestError(400, 'Invalid email.');
      transaction(db, () => {
        const actor = res.locals.requireCurrentUser();
        if (!actor.isSuperAdmin) throw new RequestError(403, 'Administrator required.');
        const target = db.prepare('SELECT id,email,is_super_admin,is_disabled,COALESCE(role_override,role) AS effective_role FROM account_profiles WHERE id=?').get(req.params.id);
        if (!target) throw new RequestError(404, 'Account not found.');
        if (target.is_disabled === null) throw new RequestError(409, 'Legacy account access requires migration.');
        if (role !== undefined && role !== target.effective_role) {
          if (['Director', 'General Manager'].includes(String(target.effective_role))) throw new RequestError(403, 'Leadership roles cannot be changed here.');
          db.prepare('UPDATE users SET role=? WHERE id=?').run(role === 'Employee' ? 'Admin' : role, target.id!);
          db.prepare('UPDATE account_access SET role_override=? WHERE user_id=?').run(role === 'Employee' ? 'Employee' : null, target.id!);
        }
        if (isDisabled === true && target.is_super_admin === 1 && target.is_disabled !== 1) {
          const active = db.prepare('SELECT count(*) AS count FROM account_access WHERE is_super_admin=1 AND is_disabled=0').get()!;
          if (Number(active.count) <= 1) throw new RequestError(409, 'At least one active administrator is required.');
        }
        if (normalizedEmail !== undefined && normalizedEmail !== target.email) {
          const duplicate = db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(normalizedEmail, target.id!);
          if (duplicate) throw new RequestError(409, 'Email is already in use.');
          db.prepare('UPDATE users SET email=? WHERE id=?').run(normalizedEmail, target.id!);
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id!);
          db.prepare('DELETE FROM password_resets WHERE user_id=?').run(target.id!);
        }
        if (isDisabled !== undefined && Number(isDisabled) !== target.is_disabled) {
          if (isDisabled) {
            db.prepare("UPDATE account_access SET is_disabled=1,company_grants='[]',form_grants='{}' WHERE user_id=?").run(target.id!);
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id!);
            db.prepare('DELETE FROM password_resets WHERE user_id=?').run(target.id!);
          } else {
            db.prepare("UPDATE account_access SET is_disabled=0,company_grants='[]',form_grants='{}' WHERE user_id=?").run(target.id!);
          }
        }
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  router.post('/admin/accounts/:id/reset-link', (req, res, next) => {
    try {
      const token = randomBytes(32).toString('hex');
      transaction(db, () => {
        if (!res.locals.requireCurrentUser().isSuperAdmin) throw new RequestError(403, 'Administrator required.');
        const target = db.prepare('SELECT id,is_disabled FROM account_profiles WHERE id=?').get(req.params.id);
        if (!target) throw new RequestError(404, 'Account not found.');
        if (target.is_disabled === 1) throw new RequestError(409, 'Account is disabled.');
        db.prepare(`INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES (?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash, expires_at=excluded.expires_at`)
          .run(target.id!, tokenHash(token), now() + 30 * 60 * 1000);
      });
      res.json({ link: `${origin}/#reset=${token}` });
    } catch (error) { next(error); }
  });
  router.put('/admin/accounts/:id/grants', (req, res, next) => {
    try {
      fields(req.body, ['companyIds', 'formsByCompany']);
      const { companyIds, formsByCompany } = req.body;
      if (!Array.isArray(companyIds) || companyIds.some(id => !companies.includes(id)) || new Set(companyIds).size !== companyIds.length ||
        !formsByCompany || typeof formsByCompany !== 'object' || Array.isArray(formsByCompany)) throw new RequestError(400, 'Invalid grants.');
      for (const [company, allowed] of Object.entries(formsByCompany)) {
        if (!companyIds.includes(company) || !Array.isArray(allowed) || allowed.some(form => !forms.includes(form)) || new Set(allowed).size !== allowed.length) throw new RequestError(400, 'Invalid grants.');
      }
      transaction(db, () => {
        if (!res.locals.requireCurrentUser().isSuperAdmin) throw new RequestError(403, 'Administrator required.');
        const target = db.prepare('SELECT id,is_disabled FROM account_profiles WHERE id=?').get(req.params.id);
        if (!target) throw new RequestError(404, 'Account not found.');
        if (target.is_disabled === null || target.is_disabled === 1) throw new RequestError(409, 'Account cannot receive grants.');
        db.prepare('UPDATE account_access SET company_grants=?,form_grants=? WHERE user_id=?')
          .run(JSON.stringify(companyIds), JSON.stringify(formsByCompany), target.id!);
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  return router;
}
