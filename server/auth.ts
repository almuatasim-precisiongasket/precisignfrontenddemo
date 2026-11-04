import { randomBytes, randomUUID, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import type { CompanyId, UserProfile, UserRole } from '../src/types/index';

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
  return { id: String(row.id), name, email: String(row.email), role: row.role as UserRole, department: String(row.department), companyId: row.company_id as CompanyId,
    allowedCompanyIds: JSON.parse(String(row.allowed_companies)), isGroupAdmin: row.group_admin === 1, canReplaceFinalApprover: row.route_admin === 1,
    initials: name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase(), avatarColor: '#365C78' };
}
export function createSession(db: DatabaseSync, userId: string, now = Date.now()) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash(token), userId, now + sessionLifetime);
  return token;
}
export function sessionUser(db: DatabaseSync, token: string | undefined, now = Date.now()) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare('SELECT users.*, EXISTS(SELECT 1 FROM route_administrators WHERE user_id=users.id) AS route_admin FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(tokenHash(token), now);
  return row ? safeProfile(row) : null;
}
