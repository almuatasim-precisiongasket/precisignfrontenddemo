import zlib from 'node:zlib';
import { openAsyncDatabase, migrateAsyncDatabase, type AsyncDatabase } from './asyncDatabase';

/**
 * Normalizes a database URL / connection string into a canonical representation
 * so equivalent spellings (scheme, hostname casing, default ports, trailing slashes)
 * cannot bypass safety checks.
 */
export function normalizeDatabaseIdentity(rawUrl: string): string {
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

/**
 * Asserts that PRECISIGN_TURSO_TEST_URL and PRECISIGN_TURSO_TEST_TOKEN are provided,
 * that they do not match TURSO_DATABASE_URL under any equivalent spelling,
 * and that the target hostname indicates a disposable database.
 */
export function assertDisposableTursoTestEnv(): { testUrl: string; testToken: string } {
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
  } catch (err: any) {
    if (err.message && err.message.includes('disposable test database')) throw err;
    throw new Error(`Invalid test database URL format: ${err?.message}`);
  }

  return { testUrl, testToken };
}

/**
 * Strictly read-only preflight check.
 * Inspects sqlite_master and verifies that the target contains no pre-existing
 * accounts, requests, workflows, or company branding rows (including empty logo rows).
 * Never modifies or empties an existing database.
 */
export async function assertDisposableTargetClean(db: AsyncDatabase, contextName = 'Turso test') {
  const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const tableNames = new Set(tables.rows.map(r => String(r.name)));

  // 1. Accounts
  if (tableNames.has('users')) {
    const res = await db.execute('SELECT COUNT(*) as c FROM users');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(
        `[${contextName}] Cannot establish that the target database is disposable/clean: found ${count} pre-existing account(s) in 'users'. Refusing to write to a populated database.`
      );
    }
  }

  // 2. Workflows
  if (tableNames.has('workflows')) {
    const res = await db.execute('SELECT COUNT(*) as c FROM workflows');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(
        `[${contextName}] Cannot establish that the target database is disposable/clean: found ${count} pre-existing workflow(s) in 'workflows'. Refusing to write to a populated database.`
      );
    }
  }

  // 3. Requests
  if (tableNames.has('requests')) {
    const res = await db.execute('SELECT COUNT(*) as c FROM requests');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(
        `[${contextName}] Cannot establish that the target database is disposable/clean: found ${count} pre-existing request(s) in 'requests'. Refusing to write to a populated database.`
      );
    }
  }

  // 4. Company branding (reject any pre-existing row, including empty logos)
  if (tableNames.has('company_logos')) {
    const res = await db.execute('SELECT COUNT(*) as c FROM company_logos');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(
        `[${contextName}] Cannot establish that the target database is disposable/clean: found ${count} pre-existing logo row(s) in 'company_logos'. Refusing to write to a populated database.`
      );
    }
  }

  // 5. Drafts
  if (tableNames.has('drafts')) {
    const res = await db.execute('SELECT COUNT(*) as c FROM drafts');
    const count = Number(res.rows[0]?.c ?? 0);
    if (count > 0) {
      throw new Error(
        `[${contextName}] Cannot establish that the target database is disposable/clean: found ${count} pre-existing draft(s) in 'drafts'. Refusing to write to a populated database.`
      );
    }
  }
}

/**
 * Initializes remote Turso connection safely for a test or script.
 * 1. Enforces credentials, URL normalization against application DB, and disposable hint.
 * 2. Connects to the database.
 * 3. Executes read-only cleanliness preflight BEFORE any write.
 * 4. Executes schema migration ONLY if preflight succeeds.
 * If preflight fails, halts before migration or any fixture writes.
 */
export async function initRemoteTursoTestDb(contextName: string): Promise<AsyncDatabase> {
  const { testUrl, testToken } = assertDisposableTursoTestEnv();
  const db = openAsyncDatabase(testUrl, testToken);

  // Read-only preflight BEFORE migration or any write
  await assertDisposableTargetClean(db, contextName);

  // Migrate schema only after target is established clean
  await migrateAsyncDatabase(db);
  return db;
}

export function inspectPdfContent(pdfBuffer: Buffer): {
  hasPdfHeader: boolean;
  hasSignatureImage: boolean;
  imageCount: number;
  text: string;
  compactText: string;
} {
  const latin1 = pdfBuffer.toString('latin1');
  const hasPdfHeader = latin1.startsWith('%PDF-');

  // Check embedded signature image (/Subtype /Image)
  const imageMatches = latin1.match(/\/Subtype\s*\/Image/g);
  const imageCount = imageMatches ? imageMatches.length : 0;
  const hasSignatureImage = imageCount > 0;

  // Map font objects to ToUnicode stream objects
  const fontResMatch = latin1.match(/\/Font\s*<<([\s\S]*?)>>/);
  const fontNameToObj = new Map<string, number>();
  if (fontResMatch) {
    const fRegex = /\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g;
    let m;
    while ((m = fRegex.exec(fontResMatch[1])) !== null) {
      fontNameToObj.set(m[1], parseInt(m[2], 10));
    }
  }

  const fontToCmapObj = new Map<string, number>();
  for (const [fontName, objNum] of fontNameToObj.entries()) {
    const objRegex = new RegExp(`(?:^|\\D)${objNum}\\s+0\\s+obj[\\s\\S]*?\\/ToUnicode\\s+(\\d+)\\s+0\\s+R`);
    const m = latin1.match(objRegex);
    if (m) {
      fontToCmapObj.set(fontName, parseInt(m[1], 10));
    }
  }

  // Parse streams by object number
  const objStreams = new Map<number, string>();
  const objectRegex = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  let oMatch;
  while ((oMatch = objectRegex.exec(latin1)) !== null) {
    const objNum = parseInt(oMatch[1], 10);
    const body = oMatch[2];
    const sMatch = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
    if (sMatch) {
      const rawData = Buffer.from(sMatch[1], 'latin1');
      try {
        objStreams.set(objNum, zlib.inflateSync(rawData).toString('utf-8'));
      } catch {
        objStreams.set(objNum, sMatch[1]);
      }
    }
  }

  // Build CMap for each font
  const fontCmaps = new Map<string, Map<string, string>>();
  for (const [fontName, objNum] of fontToCmapObj.entries()) {
    const cmapStream = objStreams.get(objNum);
    if (!cmapStream) continue;
    const cmap = new Map<string, string>();
    for (const bfMatch of cmapStream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      const bfcharRegex = /<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g;
      let m;
      while ((m = bfcharRegex.exec(bfMatch[1])) !== null) {
        cmap.set(m[1].toUpperCase().padStart(4, '0'), String.fromCodePoint(parseInt(m[2], 16)));
      }
    }
    for (const bfrMatch of cmapStream.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      const bfrangeRegex = /<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g;
      let m;
      while ((m = bfrangeRegex.exec(bfrMatch[1])) !== null) {
        const start = parseInt(m[1], 16);
        const end = parseInt(m[2], 16);
        let target = parseInt(m[3], 16);
        for (let code = start; code <= end; code++, target++) {
          cmap.set(code.toString(16).toUpperCase().padStart(4, '0'), String.fromCodePoint(target));
        }
      }
    }
    fontCmaps.set(fontName, cmap);
  }

  // Decode text from content streams
  let fullText = '';
  for (const streamContent of objStreams.values()) {
    if (!streamContent.includes('BT') || (!streamContent.includes('Tj') && !streamContent.includes('TJ'))) {
      continue;
    }
    let currentFont = '';
    const tokenRegex = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
    let tMatch;
    while ((tMatch = tokenRegex.exec(streamContent)) !== null) {
      if (tMatch[1]) {
        currentFont = tMatch[1];
      } else if (tMatch[2]) {
        const hex = tMatch[2];
        const cmap = fontCmaps.get(currentFont);
        for (let j = 0; j < hex.length; j += 4) {
          const code = hex.slice(j, j + 4).toUpperCase();
          fullText += (cmap && cmap.get(code)) || '';
        }
        fullText += ' ';
      } else if (tMatch[3]) {
        const arrayContent = tMatch[3];
        const hexInArrayRegex = /<([0-9A-Fa-f]+)>/g;
        const cmap = fontCmaps.get(currentFont);
        let hMatch;
        while ((hMatch = hexInArrayRegex.exec(arrayContent)) !== null) {
          const hex = hMatch[1];
          for (let j = 0; j < hex.length; j += 4) {
            const code = hex.slice(j, j + 4).toUpperCase();
            fullText += (cmap && cmap.get(code)) || '';
          }
        }
        fullText += ' ';
      }
    }
  }

  const text = fullText.replace(/\s+/g, ' ').trim();
  const compactText = fullText.replace(/\s+/g, '');
  return { hasPdfHeader, hasSignatureImage, imageCount, text, compactText };
}
