// PreciSign Turso test environment guard
// Requires PRECISIGN_TURSO_TEST_URL and PRECISIGN_TURSO_TEST_TOKEN.
// Rejects all fallback to application environment variables (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN).
// Refuses to run if PRECISIGN_TURSO_TEST_URL matches TURSO_DATABASE_URL under any equivalent spelling.
// Verifies target database via a read-only preflight before any test file executes.

import { createClient } from '@libsql/client';

export function normalizeDatabaseIdentity(rawUrl) {
  if (!rawUrl) return '';
  let str = rawUrl.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(str)) {
    str = `https://${str}`;
  }
  const parsed = new URL(str);
  const protocol = parsed.protocol.toLowerCase();
  const normalizedProtocol = (protocol === 'libsql:' || protocol === 'wss:' || protocol === 'https:')
    ? 'https:'
    : (protocol === 'ws:' || protocol === 'http:')
      ? 'http:'
      : protocol;
  const hostname = parsed.hostname.toLowerCase();
  let port = parsed.port;
  if ((normalizedProtocol === 'https:' && port === '443') || (normalizedProtocol === 'http:' && port === '80')) {
    port = '';
  }
  let pathname = parsed.pathname.replace(/\/+$/, '');
  return `${normalizedProtocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
}

export function assertDisposableTursoTestEnv() {
  const testUrl = process.env.PRECISIGN_TURSO_TEST_URL;
  const testToken = process.env.PRECISIGN_TURSO_TEST_TOKEN;
  const appUrl = process.env.TURSO_DATABASE_URL;

  if (!testUrl || !testToken) {
    throw new Error(
      'Set PRECISIGN_TURSO_TEST_URL and PRECISIGN_TURSO_TEST_TOKEN to run the Turso API tests. Fallback to application database credentials is not permitted.'
    );
  }

  if (appUrl && normalizeDatabaseIdentity(testUrl) === normalizeDatabaseIdentity(appUrl)) {
    throw new Error(
      'PRECISIGN_TURSO_TEST_URL matches configured application database (TURSO_DATABASE_URL). Refusing to run tests against the application database.'
    );
  }

  try {
    const parsed = new URL(testUrl.replace(/^libsql:/, 'https:'));
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('test') && !host.includes('disposable') && !host.includes('tmp')) {
      throw new Error(
        `The test database target (${host}) does not clearly indicate a disposable test database. Hostname must contain "test", "disposable", or "tmp".`
      );
    }
  } catch (err) {
    if (err.message && err.message.includes('disposable test database')) throw err;
    throw new Error(`Invalid test database URL format: ${err.message}`);
  }

  return { testUrl, testToken };
}

// 1. Validate environment configuration
const { testUrl, testToken } = assertDisposableTursoTestEnv();

// 2. Perform top-level read-only preflight check against target database
const client = createClient({ url: testUrl, authToken: testToken });

async function execWithRetry(sql) {
  try {
    return await client.execute(sql);
  } catch (err) {
    if (
      err?.code === 'UND_ERR_SOCKET' ||
      (err?.cause && (err.cause.code === 'UND_ERR_SOCKET' || err.cause.message?.includes('other side closed'))) ||
      (err?.message && err.message.includes('fetch failed'))
    ) {
      await new Promise(r => setTimeout(r, 200));
      return await client.execute(sql);
    }
    throw err;
  }
}

try {
  const tablesRes = await execWithRetry("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const tables = new Set(tablesRes.rows.map(r => String(r.name)));

  if (tables.has('users')) {
    const res = await execWithRetry('SELECT COUNT(*) as c FROM users');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(`[requireTursoTestEnv] Target database contains ${count} pre-existing account(s) in 'users'. Refusing to run.`);
    }
  }

  if (tables.has('workflows')) {
    const res = await execWithRetry('SELECT COUNT(*) as c FROM workflows');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(`[requireTursoTestEnv] Target database contains ${count} pre-existing workflow(s) in 'workflows'. Refusing to run.`);
    }
  }

  if (tables.has('requests')) {
    const res = await execWithRetry('SELECT COUNT(*) as c FROM requests');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(`[requireTursoTestEnv] Target database contains ${count} pre-existing request(s) in 'requests'. Refusing to run.`);
    }
  }

  if (tables.has('company_logos')) {
    const res = await execWithRetry('SELECT COUNT(*) as c FROM company_logos');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(`[requireTursoTestEnv] Target database contains ${count} pre-existing logo row(s) in 'company_logos'. Refusing to run.`);
    }
  }

  if (tables.has('drafts')) {
    const res = await execWithRetry('SELECT COUNT(*) as c FROM drafts');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(`[requireTursoTestEnv] Target database contains ${count} pre-existing draft(s) in 'drafts'. Refusing to run.`);
    }
  }
} finally {
  client.close();
}
