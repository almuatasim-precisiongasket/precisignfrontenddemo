import { DatabaseSync } from 'node:sqlite';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CompanyId, UserRole, WorkflowConfig } from '../src/types';
import { openDatabase, transaction } from './db';
import { validateWorkflow } from './workflows';

const companies: CompanyId[] = ['PEW', 'ICCL', 'FSG'];
const forms = ['Administrative & Payment Request', 'IT Request', 'Cash Voucher', 'Expense Claim'] as const;
const people = ['pilot-shekhar', 'pilot-afzal', 'pilot-farida', 'pilot-anzar'];

export function seedPilotWorkflows(path: string) {
  if (!isAbsolute(path)) throw new Error('Use an absolute path to a synthetic pilot database.');
  const existing = new DatabaseSync(path, { readOnly: true });
  try {
    if (!existing.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='pilot_identities'").get()) {
      throw new Error('Only databases created by the pilot bootstrap are supported.');
    }
  } finally { existing.close(); }

  const db = openDatabase(path);
  try {
    return transaction(db, () => {
      const roles = new Map(db.prepare('SELECT users.id, users.role FROM users JOIN pilot_identities ON user_id=users.id')
        .all().map(row => [String(row.id), row.role as UserRole]));
      if (people.some(id => !roles.has(id))) throw new Error('Synthetic pilot roster is incomplete.');
      const find = db.prepare('SELECT 1 FROM workflows WHERE company_id=? AND form_type=?');
      const insert = db.prepare('INSERT INTO workflows (company_id,form_type,version,config) VALUES (?,?,?,?)');
      let created = 0;
      for (const companyId of companies) {
        for (const formType of forms) {
          if (find.get(companyId, formType)) continue;
          const twoSteps = formType === 'Administrative & Payment Request' || formType === 'Expense Claim';
          const signerIds = twoSteps ? ['pilot-shekhar', 'pilot-afzal'] : ['pilot-afzal'];
          const config: WorkflowConfig = {
            id: `synthetic-${companyId}-${formType.toLowerCase().replace(/[^a-z]+/g, '-')}`,
            companyId, formType, version: 1,
            preventSelfApproval: true, allowDirectorOverride: false, reminderDays: 2, escalationDays: 5,
            rejectionBehavior: 'archive', returnBehavior: 'restart_workflow',
            processingUserIds: [],
            stages: signerIds.map((id, index) => {
              const final = index === signerIds.length - 1;
              return {
                id: `step-${index + 1}`, stageNumber: index + 1,
                name: final ? 'Final approval' : 'Department review',
                assignedUserId: id, assignedRole: roles.get(id)!,
                isFinalApproval: final, mapsToDocumentSignature: final,
                canReject: true, canReturnForCorrection: true,
                requiredOnSubmit: true,
                backupSignerIds: companyId === 'ICCL' && formType === 'IT Request' ? ['pilot-farida'] : [],
              };
            }),
          };
          const validated = validateWorkflow(db, config);
          insert.run(companyId, formType, validated.version, JSON.stringify(validated));
          created++;
        }
      }
      return created;
    });
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [path] = process.argv.slice(2);
  if (!path || process.argv.length !== 3) throw new Error('Usage: seed-pilot-workflows <absolute database path>');
  console.log(`Created ${seedPilotWorkflows(path)} synthetic signing routes. Existing routes and grants were preserved.`);
}
