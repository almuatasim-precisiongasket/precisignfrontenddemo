import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, fchmodSync, openSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth';
import { openDatabase, transaction } from './db';

const roster = [
  ['pilot-muatasim', 'Muatasim', 'muatasim@test.com', 1],
  ['pilot-afzal', 'Afzal Kazi', 'afzalkazi@test.com', 0],
  ['pilot-shekhar', 'Shekhar', 'shekhar@test.com', 0],
  ['pilot-farida', 'Farida', 'farida@test.com', 0],
  ['pilot-anzar', 'Anzar', 'anzar@test.com', 0],
  ['pilot-taqvi', 'Taqvi', 'taqvi@test.com', 0],
] as const;

/** Bootstrap only a new database or one marked by this tool. Never reset an existing account. */
export async function bootstrapPilot(databasePath: string, credentialsPath: string) {
  if (!isAbsolute(databasePath) || !isAbsolute(credentialsPath)) throw new Error('Use absolute database and credential paths.');
  const database = resolve(databasePath);
  const credentials = resolve(credentialsPath);
  if (database === credentials) throw new Error('Use separate database and credential paths.');
  if (!existsSync(dirname(database)) || !existsSync(dirname(credentials))) throw new Error('Parent directories must already exist.');
  const repositoryRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const credentialDirectory = realpathSync(dirname(credentials));
  const inRepository = relative(repositoryRoot, credentialDirectory);
  if (!inRepository || (inRepository !== '..' && !inRepository.startsWith(`..${sep}`) && !isAbsolute(inRepository))) {
    throw new Error('Credentials must be stored outside the repository.');
  }
  if (existsSync(database)) {
    const existing = new DatabaseSync(database, { readOnly: true });
    try {
      const marker = existing.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='pilot_identities'").get();
      if (!marker) throw new Error('Refusing to modify a database that is not marked as a pilot.');
      const rows = existing.prepare('SELECT user_id FROM pilot_identities').all();
      if (rows.length !== roster.length || roster.some(([id]) => !rows.some(row => row.user_id === id))) {
        throw new Error('Pilot identity mapping is incomplete; inspect it before retrying.');
      }
      return { created: false };
    } finally { existing.close(); }
  }
  if (existsSync(credentials)) throw new Error('Credential file already exists.');

  const accounts = await Promise.all(roster.map(async ([id, name, email, superAdmin]) => {
    const password = `PreciSign-${randomBytes(5).toString('hex')}`;
    return { id, name, email, superAdmin, password, hash: await hashPassword(password) };
  }));

  const descriptor = openSync(credentials, 'wx', 0o600);
  let completed = false;
  try {
    if (process.platform === 'win32') {
      const identity = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
      const sid = identity.match(/S-1-(?:\d+-)+\d+/)?.[0];
      if (!sid) throw new Error('Could not determine the current Windows user SID.');
      execFileSync('icacls.exe', [credentials, '/inheritance:r', '/grant:r', `*${sid}:(F)`], { stdio: 'ignore' });
    } else {
      fchmodSync(descriptor, 0o600);
    }
    writeFileSync(descriptor, JSON.stringify(accounts.map(({ name, email, password }) => ({ name, email, password })), null, 2), 'utf8');
    // Reserve a new database atomically; another process must not be overwritten.
    const databaseDescriptor = openSync(database, 'wx', 0o600);
    closeSync(databaseDescriptor);
    const db = openDatabase(database);
    try {
      transaction(db, () => {
        db.exec('CREATE TABLE pilot_identities (user_id TEXT PRIMARY KEY REFERENCES users(id))');
        for (const account of accounts) {
          db.prepare("INSERT INTO users (id,email,name,role,department,company_id,password_hash) VALUES (?,?,?,'Admin','Pilot','PEW',?)")
            .run(account.id, account.email, account.name, account.hash);
          db.prepare("INSERT INTO account_access (user_id,company_grants,is_super_admin,must_change_password) VALUES (?, '[\"PEW\",\"ICCL\",\"FSG\"]', ?, 1)")
            .run(account.id, account.superAdmin);
          db.prepare('INSERT INTO pilot_identities VALUES (?)').run(account.id);
        }
      });
    } finally { db.close(); }
    completed = true;
    return { created: true };
  } finally {
    closeSync(descriptor);
    if (!completed) rmSync(credentials, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [database, credentials] = process.argv.slice(2);
  if (!database || !credentials || process.argv.length !== 4) throw new Error('Usage: bootstrap-pilot <absolute database path> <absolute credentials path>');
  const result = await bootstrapPilot(database, credentials);
  console.log(result.created ? 'Pilot accounts created. Credentials saved to the specified local file.' : 'Pilot accounts already exist; nothing changed.');
}
