import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path: string) {
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version > 3) { db.close(); throw new Error('Database schema is newer than this application.'); }
  if (version === 0) {
    try {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE companies (id TEXT PRIMARY KEY CHECK(id IN ('PEW','ICCL','FSG')), name TEXT NOT NULL);
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
        CREATE TABLE drafts (user_id TEXT NOT NULL REFERENCES users(id), company_id TEXT NOT NULL REFERENCES companies(id), form_type TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0), data TEXT NOT NULL, PRIMARY KEY(user_id,company_id,form_type));
        PRAGMA user_version = 1; COMMIT;`);
    } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (version < 2) {
    try { db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE user_signatures (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, signature_data_url TEXT NOT NULL, signature_style_text TEXT NOT NULL);
      PRAGMA user_version = 2; COMMIT;`); }
    catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (version < 3) {
    try { db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS route_administrators (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE);
      PRAGMA user_version = 3; COMMIT;`); }
    catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); db.close(); throw error; }
  }
  return db;
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
