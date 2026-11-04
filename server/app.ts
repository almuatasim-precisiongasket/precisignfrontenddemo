import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { readRoutes } from './reads';
import { requestRoutes } from './requestRoutes';
import { workflowRoutes } from './workflows';
import { draftRoutes } from './drafts';
import { ownSignature, profileRoutes } from './profile';
import { createSession, hashPassword, normalizeEmail, safeProfile, sessionUser, tokenHash, verifyPassword, sessionLifetime } from './auth';

export interface ServerConfig { origin: string; secureCookies: boolean; now?: () => number; loginLimit?: number; }
export async function createApp(db: DatabaseSync, config: ServerConfig) {
  const origin = new URL(config.origin).origin;
  if (config.secureCookies && !origin.startsWith('https://')) throw new Error('Secure mode requires an HTTPS origin.');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '18mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  const now = config.now ?? Date.now;
  const attempts = new Map<string, { count: number; until: number }>();
  const dummyHash = await hashPassword('non-account-placeholder-password');
  const cookie = (value: string, maxAge: number) => `precisign_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.secureCookies ? '; Secure' : ''}`;
  const token = (raw?: string) => {
    const matches = raw?.split(';').map(item => item.trim()).filter(item => item.startsWith('precisign_session=')) ?? [];
    return matches.length === 1 ? matches[0].slice('precisign_session='.length) : undefined;
  };
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.get('Origin') !== origin || req.get('Sec-Fetch-Site') === 'cross-site')) {
      res.status(403).json({ error: 'Cross-origin request rejected.' }); return;
    }
    next();
  });
  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const time = now();
      for (const [key, entry] of attempts) if (entry.until <= time) attempts.delete(key);
      const ip = req.ip || 'unknown';
      if (!attempts.has(ip) && attempts.size >= 10000) { res.status(429).json({ error: 'Too many login attempts. Try again later.' }); return; }
      const entry = attempts.get(ip) ?? { count: 0, until: time + 15 * 60 * 1000 };
      if (entry.count >= (config.loginLimit ?? 10)) { res.status(429).json({ error: 'Too many login attempts. Try again later.' }); return; }
      entry.count++; attempts.set(ip, entry);
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 1024) { res.status(401).json({ error: 'Invalid email or password.' }); return; }
      const row = db.prepare('SELECT * FROM users WHERE email=?').get(normalizeEmail(email));
      const valid = await verifyPassword(password, row ? String(row.password_hash) : dummyHash);
      if (!row || !valid) { res.status(401).json({ error: 'Invalid email or password.' }); return; }
      const previous = token(req.get('Cookie'));
      if (previous) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(previous));
      const session = createSession(db, String(row.id), now());
      res.setHeader('Set-Cookie', cookie(session, sessionLifetime / 1000));
      res.json({ user: safeProfile(row) });
    } catch (error) { next(error); }
  });
  app.use('/api', (req, res, next) => {
    const user = sessionUser(db, token(req.get('Cookie')), now());
    if (!user) { res.status(401).json({ error: 'Authentication required.' }); return; }
    // A shared browser cookie may switch accounts in another tab. Never apply old editor data to that account.
    if (req.get('X-PreciSign-User') && req.get('X-PreciSign-User') !== user.id) { res.status(401).json({ error: 'Session identity changed.' }); return; }
    res.locals.user = user; next();
  });
  app.get('/api/auth/me', (_req, res) => { res.json({ user: { ...res.locals.user, ...ownSignature(db, res.locals.user.id) } }); });
  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token(req.get('Cookie'))!));
    res.setHeader('Set-Cookie', cookie('', 0)); res.status(204).end();
  });
  app.use('/api', readRoutes(db));
  app.use('/api', requestRoutes(db));
  app.use('/api', draftRoutes(db));
  app.use('/api', profileRoutes(db));
  app.use('/api', workflowRoutes(db));
  app.use((_req, res) => { res.status(404).json({ error: 'Not found.' }); });
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = [400,403,404,409,413].includes(error.status!) ? error.status! : 500;
    res.status(status).json({ error: status === 500 ? 'Could not complete request.' : status === 400 ? 'Invalid request data or missing workflow.' : status === 403 ? 'Action not permitted.' : status === 404 ? 'Request or action not found.' : status === 409 ? 'Request changed. Refresh and review again.' : 'Request is too large.' });
  });
  return app;
}
