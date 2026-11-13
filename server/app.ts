import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { readRoutes } from './reads';
import { companyBrandingRoutes } from './companyBranding';
import { accountAdminRoutes } from './accountAdmin';
import { requestRoutes } from './requestRoutes';
import { workflowRoutes } from './workflows';
import { draftRoutes } from './drafts';
import { isDatabaseBusy } from './db';
import { ownSignature, profileRoutes } from './profile';
import { fields, RequestError, text } from './requestValidation';
import { changePassword, changePasswordAsync, hashPassword, registerAccount, resetPassword, resetPasswordAsync, revokeSession, sessionUser, sessionUserAsync, signIn, signInAsync, sessionLifetime, tokenHash } from './auth';
import type { AsyncDatabase, AsyncQueryConnection } from './asyncDatabase';
import { ownSignatureAsync } from './profile';
import { MockEmailTransport, ResendEmailTransport, OutboxProcessor, type IEmailTransport } from './email';

export interface ServerConfig {
  origin: string;
  secureCookies: boolean;
  now?: () => number;
  loginLimit?: number;
  emailTransport?: IEmailTransport;
  outboxProcessor?: OutboxProcessor;
  autoStartWorker?: boolean;
}

const requestErrorMessages: Partial<Record<number, string>> = {
  400: 'Invalid request data or missing workflow.',
  401: 'Authentication required.',
  403: 'Action not permitted.',
  404: 'Request or action not found.',
  409: 'Request changed. Refresh and review again.',
  413: 'Request is too large.',
  415: 'Unsupported request encoding.',
};

export async function createApp(db: DatabaseSync | AsyncDatabase, config: ServerConfig) {
  const origin = new URL(config.origin).origin;
  if (config.secureCookies && !origin.startsWith('https://')) throw new Error('Secure mode requires an HTTPS origin.');
  const app = express();
  app.disable('x-powered-by');
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
  const limitAuthAttempts = (login: boolean): express.RequestHandler => (req, res, next) => {
    const time = now();
    for (const [key, entry] of attempts) if (entry.until <= time) attempts.delete(key);
    const key = `${req.path}:${req.ip || 'unknown'}`;
    const entry = attempts.get(key) ?? { count: 0, until: time + 15 * 60 * 1000 };
    if ((!attempts.has(key) && attempts.size >= 10000) || entry.count >= (config.loginLimit ?? 10)) {
      res.status(429).json({ error: 'Too many attempts. Try again later.' });
      return;
    }
    entry.count++;
    attempts.set(key, entry);
    // Successful sign-ins must not exhaust the shared office IP's failure budget.
    if (login) {
      res.on('finish', () => {
        if (res.statusCode === 200 && attempts.get(key) === entry) entry.count = Math.max(0, entry.count - 1);
      });
    }
    next();
  };
  app.post('/api/auth/signup', limitAuthAttempts(false), express.json({ limit: '3mb' }), async (req, res, next) => {
    try {
      await registerAccount(db, req.body);
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.post('/api/auth/login', express.json({ limit: '16kb' }), limitAuthAttempts(true), async (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 1024) { res.status(401).json({ error: 'Invalid email or password.' }); return; }
      const session = await ('prepare' in db ? signIn(db, email, password, dummyHash, token(req.get('Cookie')), now) : signInAsync(db, email, password, dummyHash, token(req.get('Cookie')), now));
      if (!session) { res.status(401).json({ error: 'Invalid email or password.' }); return; }
      res.setHeader('Set-Cookie', cookie(session.token, sessionLifetime / 1000));
      res.json({ user: session.user });
    } catch (error) { next(error); }
  });
  app.post('/api/auth/reset-password', limitAuthAttempts(false), express.json({ limit: '16kb' }), async (req, res, next) => {
    try {
      fields(req.body, ['token', 'newPassword']);
      if ('prepare' in db) await resetPassword(db, text(req.body.token, 64, false), text(req.body.newPassword, 1024, false), now);
      else await resetPasswordAsync(db, text(req.body.token, 64, false), text(req.body.newPassword, 1024, false), now);
      res.setHeader('Set-Cookie', cookie('', 0));
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.use('/api', async (req, res, next) => {
    try {
    const sessionToken = token(req.get('Cookie'));
    const user = 'prepare' in db ? sessionUser(db, sessionToken, now()) : await sessionUserAsync(db, sessionToken, now());
    if (!user) { res.status(401).json({ error: 'Authentication required.' }); return; }
    // A shared browser cookie may switch accounts in another tab. Never apply old editor data to that account.
    if (req.get('X-PreciSign-User') && req.get('X-PreciSign-User') !== user.id) { res.status(401).json({ error: 'Session identity changed.' }); return; }
    if (user.mustChangePassword && !((req.method === 'GET' && req.path === '/auth/me') || (req.method === 'POST' && ['/auth/logout', '/auth/change-password'].includes(req.path)))) {
      res.status(403).json({ error: 'Change your password to continue.' }); return;
    }
    res.locals.user = user;
    if ('prepare' in db) res.locals.requireCurrentUser = () => {
      const current = sessionUser(db, sessionToken, now());
      if (!current || current.id !== user.id) throw new RequestError(401, 'Authentication required.');
      return current;
    };
    else res.locals.requireCurrentUserAsync = async (tx: AsyncQueryConnection) => {
      const current = await sessionUserAsync(tx, sessionToken, now());
      if (!current || current.id !== user.id) throw new RequestError(401, 'Authentication required.');
      return current;
    };
    next();
    } catch (error) { next(error); }
  });
  // Only authenticated routes need the larger limit for signatures and attachments.
  app.use('/api', express.json({ limit: '18mb' }));
  app.get('/api/auth/me', async (_req, res, next) => { try { const signature = 'prepare' in db ? ownSignature(db, res.locals.user.id) : await ownSignatureAsync(db, res.locals.user.id); res.json({ user: { ...res.locals.user, ...signature } }); } catch (error) { next(error); } });
  app.post('/api/auth/change-password', async (req, res, next) => {
    try {
      fields(req.body, ['currentPassword', 'newPassword']);
      const currentPassword = text(req.body.currentPassword, 1024, false);
      const newPassword = text(req.body.newPassword, 1024, false);
      if ('prepare' in db) await changePassword(db, res.locals.user.id, currentPassword, newPassword, res.locals.requireCurrentUser);
      else await changePasswordAsync(db, res.locals.user.id, currentPassword, newPassword, res.locals.requireCurrentUserAsync);
      res.setHeader('Set-Cookie', cookie('', 0));
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.post('/api/auth/logout', async (req, res, next) => {
    try { if ('prepare' in db) revokeSession(db, token(req.get('Cookie'))!);
    else await db.execute('DELETE FROM sessions WHERE token_hash=?', [tokenHash(token(req.get('Cookie'))!)]);
    res.setHeader('Set-Cookie', cookie('', 0)); res.status(204).end();
    } catch (error) { next(error); }
  });
  app.use('/api', readRoutes(db, origin, req => token(req.get('Cookie'))));
  app.use('/api', profileRoutes(db));
  app.use('/api', accountAdminRoutes(db, origin, now));
  app.use('/api', workflowRoutes(db));
  app.use('/api', draftRoutes(db));
  app.use('/api', companyBrandingRoutes(db));
  const transport = config.emailTransport ?? (process.env.NODE_ENV === 'test' && !process.env.PRECISIGN_EMAIL_MODE
    ? new MockEmailTransport()
    : new ResendEmailTransport());
  const outboxProcessor = config.outboxProcessor ?? new OutboxProcessor(db, transport, { now });
  (app as any).outboxProcessor = outboxProcessor;
  if (config.autoStartWorker) {
    outboxProcessor.start();
  }
  app.use('/api', requestRoutes(db, outboxProcessor, now));
  app.use((_req, res) => { res.status(404).json({ error: 'Not found.' }); });
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) { next(error); return; }
    if (isDatabaseBusy(error)) {
      res.setHeader('Retry-After', '1');
      res.status(503).json({ error: 'Storage is temporarily busy. Try again shortly.' });
      return;
    }
    const status = typeof error.status === 'number' ? error.status : 500;
    const message = requestErrorMessages[status];
    res.status(message ? status : 500).json({ error: message ?? 'Could not complete request.' });
  });
  return app;
}
