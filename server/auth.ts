import { randomBytes, randomUUID, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import type { CompanyId, UserProfile, UserRole } from '../src/types/index';
import { transaction } from './db';
import { bytes, fields, RequestError, text } from './requestValidation';
import type { AsyncDatabase, AsyncQueryConnection } from './asyncDatabase';

const scrypt = promisify(derive);
const roles: UserRole[] = ['Admin', 'General Manager', 'Director', 'IT', 'Finance', 'HR', 'Purchase'];
const companies = ['PEW', 'ICCL', 'FSG'];
export const sessionLifetime = 12 * 60 * 60 * 1000;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function hashPassword(password: string) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('Password must contain 12–1024 characters.');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  if (typeof password !== 'string' || password.length > 1024) return false;
  const parts = encoded.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const actual = await scrypt(password, parts[1], 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
}

export async function provisionUser(db: DatabaseSync, input: { email: string; name: string; role: UserRole; department: string; companyId: CompanyId; allowedCompanyIds?: CompanyId[]; isGroupAdmin?: boolean }, password: string) {
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !input.name.trim() || input.name.length > 150 || !input.department.trim() || input.department.length > 150 || !roles.includes(input.role) || !companies.includes(input.companyId) || !Array.isArray(input.allowedCompanyIds ?? []) || (input.allowedCompanyIds ?? []).some(id => !companies.includes(id))) throw new Error('Invalid account details.');
  const hash = await hashPassword(password);
  const id = randomUUID();
  db.prepare('INSERT INTO users (id,email,name,role,department,company_id,allowed_companies,group_admin,password_hash) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, email, input.name.trim(), input.role, input.department.trim(), input.companyId, JSON.stringify(input.allowedCompanyIds ?? []), input.isGroupAdmin ? 1 : 0, hash);
  return id;
}

export function safeProfile(row: Record<string, unknown>): UserProfile {
  const name = String(row.name);
  return { id: String(row.id), name, email: String(row.email), role: (row.role_override ?? row.role) as UserRole, department: String(row.department), companyId: row.company_id as CompanyId,
    allowedCompanyIds: JSON.parse(String(row.allowed_companies)),
    companyGrants: typeof row.company_grants === 'string' ? JSON.parse(row.company_grants) : undefined,
    formGrants: typeof row.form_grants === 'string' ? JSON.parse(row.form_grants) : undefined,
    isSuperAdmin: row.is_super_admin === 1, mustChangePassword: row.must_change_password === 1,
    isGroupAdmin: row.group_admin === 1, canReplaceFinalApprover: row.route_admin === 1,
    initials: name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase(), avatarColor: '#365C78' };
}

export async function registerAccount(db: DatabaseSync | AsyncDatabase, input: unknown) {
  fields(input, ['name', 'email', 'department', 'password', 'signatureDataUrl']);
  const body = input as Record<string, unknown>;
  const name = text(body.name, 150).trim();
  const department = text(body.department, 150).trim();
  const email = normalizeEmail(text(body.email, 254));
  const password = text(body.password, 1024, false);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    throw new RequestError(400, 'Invalid account details.');
  }
  const signature = body.signatureDataUrl;
  if (signature !== undefined) await bytes(signature, true);
  const hash = await hashPassword(password);
  const id = randomUUID();
  if ('prepare' in db) transaction(db, () => {
    // The legacy company column is required by older records. Explicit grants control access.
    const result = db.prepare(`INSERT INTO users (id,email,name,role,department,company_id,password_hash)
      VALUES (?, ?, ?, 'Admin', ?, 'PEW', ?) ON CONFLICT(email) DO NOTHING`).run(id, email, name, department, hash);
    if (result.changes === 0) throw new RequestError(409, 'Account could not be created.');
    db.prepare("INSERT INTO account_access (user_id,role_override) VALUES (?,'Employee')").run(id);
    if (typeof signature === 'string') {
      db.prepare('INSERT INTO user_signatures VALUES (?, ?, ?)').run(id, signature, name);
    }
  });
  else await db.transaction(async tx => {
    const result = await tx.execute(`INSERT INTO users (id,email,name,role,department,company_id,password_hash)
      VALUES (?, ?, ?, 'Admin', ?, 'PEW', ?) ON CONFLICT(email) DO NOTHING`, [id, email, name, department, hash]);
    if (result.rowsAffected === 0) throw new RequestError(409, 'Account could not be created.');
    await tx.execute("INSERT INTO account_access (user_id,role_override) VALUES (?,'Employee')", [id]);
    if (typeof signature === 'string') await tx.execute('INSERT INTO user_signatures VALUES (?, ?, ?)', [id, signature, name]);
  });
}
export function createSession(db: DatabaseSync, userId: string, now = Date.now()) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash(token), userId, now + sessionLifetime);
  return token;
}

export async function signIn(db: DatabaseSync, email: string, password: string, dummyHash: string, previousToken: string | undefined, now: () => number) {
  const credentials = db.prepare('SELECT id, password_hash FROM users WHERE email=?').get(normalizeEmail(email));
  const valid = await verifyPassword(password, credentials ? String(credentials.password_hash) : dummyHash);
  if (!credentials || !valid) return null;

  return transaction(db, () => {
    // Password verification yields. Recheck credentials before creating a session.
    const current = db.prepare('SELECT id FROM account_profiles WHERE id=? AND email=? AND password_hash=? AND COALESCE(is_disabled,0)=0')
      .get(credentials.id!, normalizeEmail(email), credentials.password_hash!);
    if (!current) return null;

    const issuedAt = now();
    if (previousToken) revokeSession(db, previousToken);
    const token = createSession(db, String(current.id), issuedAt);
    const user = sessionUser(db, token, issuedAt);
    if (!user) throw new Error('New session could not be loaded.');
    return { token, user };
  });
}

export function revokeSession(db: DatabaseSync, token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
}
const sessionUserSql = 'SELECT profile.*, EXISTS(SELECT 1 FROM route_administrators WHERE user_id=profile.id) AS route_admin FROM sessions JOIN account_profiles profile ON profile.id=sessions.user_id WHERE token_hash=? AND expires_at>? AND COALESCE(profile.is_disabled,0)=0';

export function sessionUser(db: DatabaseSync, token: string | undefined, now = Date.now()) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare(sessionUserSql).get(tokenHash(token), now);
  return row ? safeProfile(row) : null;
}

export async function sessionUserAsync(db: AsyncQueryConnection, token: string | undefined, now = Date.now()) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await db.execute(sessionUserSql, [tokenHash(token), now]);
  return result.rows[0] ? safeProfile(result.rows[0]) : null;
}

export async function signInAsync(db: AsyncDatabase, email: string, password: string, dummyHash: string, previousToken: string | undefined, now: () => number) {
  const credentials = (await db.execute('SELECT id, password_hash FROM users WHERE email=?', [normalizeEmail(email)])).rows[0];
  const valid = await verifyPassword(password, credentials ? String(credentials.password_hash) : dummyHash);
  if (!credentials || !valid) return null;
  return db.transaction(async tx => {
    const current = (await tx.execute('SELECT id FROM account_profiles WHERE id=? AND email=? AND password_hash=? AND COALESCE(is_disabled,0)=0',
      [String(credentials.id), normalizeEmail(email), String(credentials.password_hash)])).rows[0];
    if (!current) return null;
    const issuedAt = now();
    if (previousToken) await tx.execute('DELETE FROM sessions WHERE token_hash=?', [tokenHash(previousToken)]);
    await tx.execute('DELETE FROM sessions WHERE expires_at <= ?', [issuedAt]);
    const token = randomBytes(32).toString('hex');
    await tx.execute('INSERT INTO sessions VALUES (?,?,?)', [tokenHash(token), String(current.id), issuedAt + sessionLifetime]);
    const user = await sessionUserAsync(tx, token, issuedAt);
    if (!user) throw new Error('New session could not be loaded.');
    return { token, user };
  });
}

export async function changePassword(db: DatabaseSync, userId: string, currentPassword: string, newPassword: string, requireCurrentUser: () => UserProfile) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId);
  if (!row || !(await verifyPassword(currentPassword, String(row.password_hash)))) throw new RequestError(403, 'Invalid credentials.');
  if (newPassword.length < 12 || newPassword.length > 1024) throw new RequestError(400, 'Invalid password.');
  const hash = await hashPassword(newPassword);
  transaction(db, () => {
    requireCurrentUser();
    const result = db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?').run(hash, userId, row.password_hash!);
    if (result.changes !== 1) throw new RequestError(409, 'Credentials changed.');
    db.prepare('UPDATE account_access SET must_change_password=0 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM password_resets WHERE user_id=?').run(userId);
  });
}

export async function changePasswordAsync(db: AsyncDatabase, userId: string, currentPassword: string, newPassword: string, requireCurrentUser: (tx: AsyncQueryConnection) => Promise<UserProfile>) {
  const row = (await db.execute('SELECT password_hash FROM users WHERE id=?', [userId])).rows[0];
  if (!row || !(await verifyPassword(currentPassword, String(row.password_hash)))) throw new RequestError(403, 'Invalid credentials.');
  if (newPassword.length < 12 || newPassword.length > 1024) throw new RequestError(400, 'Invalid password.');
  const hash = await hashPassword(newPassword);
  await db.transaction(async tx => {
    const user = await requireCurrentUser(tx);
    if (user.id !== userId) throw new RequestError(403, 'Invalid credentials.');
    const result = await tx.execute('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?', [hash, userId, String(row.password_hash)]);
    if (result.rowsAffected !== 1) throw new RequestError(409, 'Credentials changed.');
    await tx.execute('UPDATE account_access SET must_change_password=0 WHERE user_id=?', [userId]);
    await tx.execute('DELETE FROM sessions WHERE user_id=?', [userId]);
    await tx.execute('DELETE FROM password_resets WHERE user_id=?', [userId]);
  });
}

export async function resetPassword(db: DatabaseSync, token: string, password: string, now: () => number) {
  const invalid = () => new RequestError(400, 'Reset link is invalid or expired.');
  if (!/^[a-f0-9]{64}$/.test(token)) throw invalid();
  if (password.length < 12 || password.length > 1024) throw new RequestError(400, 'Invalid password.');
  const hash = tokenHash(token);
  const eligible = () => db.prepare(`SELECT r.user_id FROM password_resets r JOIN account_profiles p ON p.id=r.user_id
    WHERE r.token_hash=? AND r.expires_at>? AND COALESCE(p.is_disabled,0)=0`).get(hash, now());
  if (!eligible()) throw invalid();
  const passwordHash = await hashPassword(password);
  transaction(db, () => {
    const row = eligible();
    if (!row) throw invalid();
    db.prepare('DELETE FROM password_resets WHERE token_hash=?').run(hash);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, row.user_id!);
    db.prepare('UPDATE account_access SET must_change_password=0 WHERE user_id=?').run(row.user_id!);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id!);
  });
}

export async function resetPasswordAsync(db: AsyncDatabase, token: string, password: string, now: () => number) {
  const invalid = () => new RequestError(400, 'Reset link is invalid or expired.');
  if (!/^[a-f0-9]{64}$/.test(token)) throw invalid();
  if (password.length < 12 || password.length > 1024) throw new RequestError(400, 'Invalid password.');
  const hash = tokenHash(token);
  const sql = `SELECT r.user_id FROM password_resets r JOIN account_profiles p ON p.id=r.user_id
    WHERE r.token_hash=? AND r.expires_at>? AND COALESCE(p.is_disabled,0)=0`;
  if (!(await db.execute(sql, [hash, now()])).rows[0]) throw invalid();
  const passwordHash = await hashPassword(password);
  await db.transaction(async tx => {
    const row = (await tx.execute(sql, [hash, now()])).rows[0];
    if (!row) throw invalid();
    const userId = String(row.user_id);
    await tx.execute('DELETE FROM password_resets WHERE token_hash=?', [hash]);
    await tx.execute('UPDATE users SET password_hash=? WHERE id=?', [passwordHash, userId]);
    await tx.execute('UPDATE account_access SET must_change_password=0 WHERE user_id=?', [userId]);
    await tx.execute('DELETE FROM sessions WHERE user_id=?', [userId]);
  });
}
