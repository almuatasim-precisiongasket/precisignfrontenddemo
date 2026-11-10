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

/** Opens a local libSQL file or a remote Turso database. Schema setup is separate. */
export function openAsyncDatabase(url: string, authToken?: string): AsyncDatabase {
  const client: Client = createClient({ url, authToken });
  return {
    execute: (sql, args = []) => client.execute({ sql, args }),
    async transaction(work) {
      const transaction = await client.transaction('write');
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
