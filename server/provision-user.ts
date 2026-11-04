import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { openDatabase } from './db';
import { provisionUser } from './auth';
import type { CompanyId, UserRole } from '../src/types/index';

if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run provisioning in an interactive terminal.');
const prompt = createInterface({ input: stdin, output: stdout });
const details = {
  email: await prompt.question('Email: '), name: await prompt.question('Name: '),
  department: await prompt.question('Department: '),
  companyId: await prompt.question('Company (PEW/ICCL/FSG): ') as CompanyId,
  role: await prompt.question('Role (Admin/General Manager/Director/IT/Finance/HR/Purchase): ') as UserRole,
};
prompt.close();
function secret(label: string): Promise<string> {
  stdout.write(label); stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  return new Promise((resolveSecret, reject) => {
    let value = '';
    const done = () => { stdin.off('data', read); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    const read = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') { done(); reject(new Error('Cancelled.')); return; }
        if (char === '\r' || char === '\n') { done(); resolveSecret(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ' && value.length < 1024) value += char;
      }
    };
    stdin.on('data', read);
  });
}
const password = await secret('Password (hidden): ');
if (password !== await secret('Confirm password (hidden): ')) throw new Error('Passwords do not match.');
const path = resolve(process.env.DATABASE_PATH || 'data/precisign.sqlite');
mkdirSync(dirname(path), { recursive: true });
const db = openDatabase(path);
try { await provisionUser(db, details, password); console.log('Account created.'); }
catch { console.error('Account could not be created. Check details and unique email.'); process.exitCode = 1; }
finally { db.close(); }
