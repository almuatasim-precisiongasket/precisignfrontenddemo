import { DatabaseSync } from 'node:sqlite';

export const schemaVersion = 11;

function readSchemaVersion(db: DatabaseSync) {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version > schemaVersion) throw new Error('Database schema is newer than this application.');
  return version;
}

export function openDatabase(path: string) {
  const db = new DatabaseSync(path, { timeout: 5000 });
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    if (readSchemaVersion(db) < schemaVersion) {
      // Re-read under the write lock in case another process upgraded first.
      transaction(db, () => migrate(db, readSchemaVersion(db)));
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function migrate(db: Pick<DatabaseSync, 'exec'>, version: number) {
  if (version === 0) {
    db.exec(`CREATE TABLE companies (id TEXT PRIMARY KEY CHECK(id IN ('PEW','ICCL','FSG')), name TEXT NOT NULL);
        INSERT INTO companies VALUES ('PEW','Precision Engineering Works'),('ICCL','Industrial Chemical & Contracting Ltd'),('FSG','Flexi Seal Gasket Co.');
        CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('Admin','General Manager','Director','IT','Finance','HR','Purchase')),
          department TEXT NOT NULL, company_id TEXT NOT NULL REFERENCES companies(id),
          allowed_companies TEXT NOT NULL DEFAULT '[]', group_admin INTEGER NOT NULL DEFAULT 0 CHECK(group_admin IN (0,1)), password_hash TEXT NOT NULL);
        CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
        CREATE INDEX sessions_expiry ON sessions(expires_at);
        CREATE TABLE workflows (company_id TEXT NOT NULL REFERENCES companies(id), form_type TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0), config TEXT NOT NULL, PRIMARY KEY(company_id,form_type));
        CREATE TABLE requests (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), requester_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0), record TEXT NOT NULL);
        CREATE INDEX requests_company ON requests(company_id);
        CREATE TABLE drafts (user_id TEXT NOT NULL REFERENCES users(id), company_id TEXT NOT NULL REFERENCES companies(id), form_type TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0), data TEXT NOT NULL, PRIMARY KEY(user_id,company_id,form_type));`);
  }
  if (version < 2) {
    db.exec(`CREATE TABLE user_signatures (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, signature_data_url TEXT NOT NULL, signature_style_text TEXT NOT NULL);`);
  }
  if (version < 3) {
    db.exec(`CREATE TABLE IF NOT EXISTS route_administrators (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE);`);
  }
  if (version < 4) {
    db.exec("UPDATE companies SET name='Insturmental Control Co Ltd' WHERE id='ICCL';");
  }
  if (version < 5) {
    db.exec(`CREATE TABLE IF NOT EXISTS account_access (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      company_grants TEXT NOT NULL DEFAULT '[]'
    );
    CREATE VIEW IF NOT EXISTS account_profiles AS
      SELECT users.*, account_access.company_grants
      FROM users LEFT JOIN account_access ON account_access.user_id = users.id;`);
  }
  if (version < 6) {
    db.exec(`ALTER TABLE account_access ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_super_admin IN (0,1));
      ALTER TABLE account_access ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0 CHECK(is_disabled IN (0,1));
      ALTER TABLE account_access ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1));
      ALTER TABLE account_access ADD COLUMN form_grants TEXT NOT NULL DEFAULT '{}';
      DROP VIEW account_profiles;
      CREATE VIEW account_profiles AS SELECT users.*, account_access.company_grants, account_access.form_grants,
        account_access.is_super_admin, account_access.is_disabled, account_access.must_change_password
        FROM users LEFT JOIN account_access ON account_access.user_id=users.id;`);
  }
  if (version < 7) {
    db.exec(`CREATE TABLE password_resets (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL);`);
  }
  if (version < 8) {
    db.exec(`CREATE TABLE IF NOT EXISTS company_logos (
      company_id TEXT PRIMARY KEY REFERENCES companies(id),
      logo_data_url TEXT NOT NULL
    );`);
  }
  if (version < 9) {
    db.exec(`ALTER TABLE account_access ADD COLUMN role_override TEXT CHECK(role_override = 'Employee');
      DROP VIEW account_profiles;
      CREATE VIEW account_profiles AS SELECT users.*, account_access.company_grants, account_access.form_grants,
        account_access.is_super_admin, account_access.is_disabled, account_access.must_change_password, account_access.role_override
        FROM users LEFT JOIN account_access ON account_access.user_id=users.id;`);
  }
  if (version < 10) {
    db.exec(`CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'accepted', 'delivered', 'failed', 'failed_unconfirmed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_error TEXT,
      lease_token TEXT,
      lease_expires_at INTEGER,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      first_attempt_at INTEGER,
      last_attempt_at INTEGER,
      accepted_at INTEGER,
      delivered_at INTEGER,
      resend_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_email_outbox_poll ON email_outbox(status, next_attempt_at, lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_email_outbox_request ON email_outbox(request_id);
    ALTER TABLE account_access ADD COLUMN notification_email TEXT;
    DROP VIEW account_profiles;
    CREATE VIEW account_profiles AS SELECT users.*, account_access.company_grants, account_access.form_grants,
      account_access.is_super_admin, account_access.is_disabled, account_access.must_change_password, account_access.role_override,
      COALESCE(account_access.notification_email, users.email) AS notification_email
      FROM users LEFT JOIN account_access ON account_access.user_id=users.id;`);
  }
  if (version < 11) {
    db.exec(`CREATE TABLE IF NOT EXISTS request_counters (
      company_id TEXT NOT NULL,
      form_code TEXT NOT NULL,
      year INTEGER NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, form_code, year)
    );`);
  }
  if (version < schemaVersion) db.exec(`PRAGMA user_version = ${schemaVersion};`);
}

/** Produce the same ordered migration statements for an async database. */
export function migrationStatements(version: number): string[] {
  if (!Number.isInteger(version) || version < 0 || version > schemaVersion) {
    throw new Error('Invalid database schema version.');
  }
  const statements: string[] = [];
  migrate({ exec(sql: string) { statements.push(...sql.split(';').map(part => part.trim()).filter(Boolean)); } }, version);
  return statements;
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export function isDatabaseBusy(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error)) return false;
  if (typeof error.code === 'string' && /^SQLITE_BUSY(?:_|$)/.test(error.code)) return true;
  // Extended SQLite result codes store the primary code in the low byte.
  return error.code === 'ERR_SQLITE_ERROR'
    && 'errcode' in error && typeof error.errcode === 'number' && (error.errcode & 0xff) === 5;
}
