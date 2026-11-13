import { createClient, type Client, type InArgs, type ResultSet } from '@libsql/client';
import { migrationStatements, schemaVersion } from './db';

/** A transaction callback must use its supplied connection for every query. */
export interface AsyncQueryConnection {
  execute(sql: string, args?: InArgs): Promise<ResultSet>;
}

export interface AsyncDatabase extends AsyncQueryConnection {
  transaction<T>(work: (connection: AsyncQueryConnection) => Promise<T>): Promise<T>;
  close(): void;
}

/** Safe PRAGMA commands that perform read-only schema/data introspection. */
const READ_ONLY_INTROSPECTION_PRAGMAS = new Set([
  'table_info',
  'table_xinfo',
  'index_list',
  'index_info',
  'index_xinfo',
  'foreign_key_list',
  'foreign_key_check',
  'quick_check',
  'integrity_check',
]);

/** Safe PRAGMA commands that read scalar/schema metadata without taking arguments. */
const READ_ONLY_NO_ARG_PRAGMAS = new Set([
  'user_version',
  'schema_version',
  'data_version',
  'application_id',
  'database_list',
  'collation_list',
  'compile_options',
  'table_list',
]);

/**
 * Validates whether a PRAGMA statement is strictly read-only.
 * SQLite allows setter syntax via both `PRAGMA name = value` and `PRAGMA name(value)`.
 * Furthermore, maintenance PRAGMAs (wal_checkpoint, optimize, shrink_memory, incremental_vacuum)
 * perform database writes even when called without arguments.
 * Only explicit read-only introspection and zero-argument metadata PRAGMAs may be retried.
 */
function isReadOnlyPragma(strippedSql: string): boolean {
  const withoutComments = strippedSql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .trim();

  const match = withoutComments.match(/^PRAGMA\s+(?:[a-z0-9_]+\.)?([a-z0-9_]+)(.*)$/i);
  if (!match) return false;

  const pragmaName = match[1].toLowerCase();
  const rest = match[2].trim().replace(/;$/, '').trim();

  // Any assignment syntax (e.g. `PRAGMA user_version = 4`) is a write.
  if (rest.includes('=')) return false;

  // Introspection PRAGMAs can take an optional single identifier, string, or integer argument in parentheses.
  if (READ_ONLY_INTROSPECTION_PRAGMAS.has(pragmaName)) {
    return rest === '' || /^\(\s*(?:'[^']*'|"[^"]*"|[a-z0-9_]+)\s*\)$/i.test(rest);
  }

  // Pure metadata PRAGMAs must take no arguments; `PRAGMA user_version(2)` is setter syntax in SQLite.
  if (READ_ONLY_NO_ARG_PRAGMAS.has(pragmaName)) {
    return rest === '';
  }

  return false;
}

/**
 * Determines whether a database statement is safe to automatically retry on transient connection drops.
 * Only read-only queries (SELECT, EXPLAIN, and strictly read-only PRAGMAs) may be retried.
 * Statements whose repeat is unsafe (INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, writable PRAGMAs, etc.)
 * must NEVER be retried, because the server may have already committed the write before the connection dropped.
 */
export function isSafeToRetry(sql: string): boolean {
  if (typeof sql !== 'string') return false;
  const stripped = sql.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s+)*/g, '');
  if (/^PRAGMA\b/i.test(stripped)) {
    return isReadOnlyPragma(stripped);
  }
  if (!/^(SELECT|EXPLAIN)\b/i.test(stripped)) {
    return false;
  }
  return !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA|VACUUM)\b/i.test(stripped);
}

/** Opens a local libSQL file or a remote Turso database. Schema setup is separate. */
export function openAsyncDatabase(url: string, authToken?: string, clientOverride?: Client): AsyncDatabase {
  const client: Client = clientOverride ?? createClient({ url, authToken });

  const execWithRetry = async (sql: string, args: InArgs = []): Promise<ResultSet> => {
    if (!isSafeToRetry(sql)) {
      return await client.execute({ sql, args });
    }
    try {
      return await client.execute({ sql, args });
    } catch (err: any) {
      if (
        err?.code === 'UND_ERR_SOCKET' ||
        (err?.cause && (err.cause.code === 'UND_ERR_SOCKET' || err.cause.message?.includes('other side closed'))) ||
        (err?.message && err.message.includes('fetch failed'))
      ) {
        await new Promise(r => setTimeout(r, 200));
        return await client.execute({ sql, args });
      }
      throw err;
    }
  };

  return {
    execute: execWithRetry,
    async transaction(work) {
      let transaction;
      try {
        transaction = await client.transaction('write');
      } catch (err: any) {
        if (
          err?.code === 'UND_ERR_SOCKET' ||
          (err?.cause && (err.cause.code === 'UND_ERR_SOCKET' || err.cause.message?.includes('other side closed'))) ||
          (err?.message && err.message.includes('fetch failed'))
        ) {
          await new Promise(r => setTimeout(r, 200));
          transaction = await client.transaction('write');
        } else {
          throw err;
        }
      }

      try {
        const result = await work({ execute: (sql, args = []) => transaction.execute({ sql, args }) });
        await transaction.commit();
        return result;
      } catch (error) {
        if (!transaction.closed) {
          try { await transaction.rollback(); }
          catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Database transaction rollback failed.'); }
        }
        throw error;
      } finally {
        transaction.close();
      }
    },
    close: () => client.close(),
  };
}

/** Migrate under a write transaction and re-read the version after acquiring it. */
export async function migrateAsyncDatabase(db: AsyncDatabase): Promise<void> {
  await db.transaction(async connection => {
    await connection.execute('CREATE TABLE IF NOT EXISTS precisign_schema_version (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL)');
    await connection.execute(`CREATE TABLE IF NOT EXISTS request_counters (
      company_id TEXT NOT NULL,
      form_code TEXT NOT NULL,
      year INTEGER NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, form_code, year)
    )`);
    const stored = await connection.execute('SELECT version FROM precisign_schema_version WHERE id=1');
    const legacy = stored.rows.length ? null : await connection.execute('PRAGMA user_version');
    const version = Number(stored.rows[0]?.version ?? legacy?.rows[0]?.user_version);
    const statements = migrationStatements(version);
    for (const statement of statements) {
      if (!/^PRAGMA user_version\s*=/i.test(statement)) await connection.execute(statement);
    }
    if (statements.length) await connection.execute('INSERT INTO precisign_schema_version (id,version) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version', [schemaVersion]);
  });
}
