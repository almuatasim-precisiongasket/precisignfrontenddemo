import 'dotenv/config';
import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, linkSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function copyDatabase(source: string, destination: string, restore = false) {
  const from = resolve(source), to = resolve(destination);
  if (from === to || !existsSync(from) || existsSync(to)) throw new Error('Source must exist and destination must be a new separate file.');
  mkdirSync(dirname(to), {recursive:true});
  const temporary = `${to}.${crypto.randomUUID()}.partial`;
  const db = new DatabaseSync(from, {readOnly:true});
  try { await backup(db, temporary); } finally { db.close(); }
  const copied = new DatabaseSync(temporary);
  try {
    if (copied.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
    if (restore) copied.exec('DELETE FROM sessions');
  } finally { copied.close(); }
  if (existsSync(to)) throw new Error('Destination already exists.');
  // Publishing must fail atomically if another process created the destination.
  linkSync(temporary,to);
  unlinkSync(temporary);
  return to;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const restore = process.argv[2] === 'restore';
  const source = restore ? process.argv[3] : process.env.DATABASE_PATH || 'data/precisign.sqlite';
  const destination = restore ? process.argv[4] : resolve(process.env.BACKUP_DIRECTORY || 'backups', `precisign-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}.sqlite`);
  if (!source || !destination) throw new Error('Usage: npm run restore -- source.sqlite NEW-destination.sqlite');
  console.log(await copyDatabase(source,destination,restore));
}
