import 'dotenv/config';
import { openDatabase } from './db';
const [command,userId] = process.argv.slice(2);
if (!['grant','revoke'].includes(command) || !userId) throw new Error('Usage: tsx server/route-admin.ts grant|revoke USER_ID');
const db = openDatabase(process.env.DATABASE_PATH || 'data/precisign.sqlite');
try {
  if (!db.prepare('SELECT id FROM users WHERE id=?').get(userId)) throw new Error('User not found.');
  if (command === 'grant') db.prepare('INSERT OR IGNORE INTO route_administrators VALUES (?)').run(userId);
  else db.prepare('DELETE FROM route_administrators WHERE user_id=?').run(userId);
  console.log('Explicit final-approver replacement permission updated.');
} finally { db.close(); }
