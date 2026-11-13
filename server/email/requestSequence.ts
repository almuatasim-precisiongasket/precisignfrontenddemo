import type { DatabaseSync } from 'node:sqlite';
import type { AsyncQueryConnection } from '../asyncDatabase';

export function formTypeToPrefix(formType: string): string {
  switch (formType) {
    case 'Administrative & Payment Request':
      return 'AP';
    case 'Admin Work Request':
      return 'AW';
    case 'IT Request':
      return 'IT';
    case 'R&D Initiative':
      return 'RD';
    case 'Cash Voucher':
      return 'CV';
    case 'Expense Claim':
      return 'EC';
    default:
      return 'AW';
  }
}

export function formatSequenceReference(companyId: string, formCode: string, year: number, seq: number): string {
  const padded = String(seq).padStart(4, '0');
  return `${companyId}-${formCode}-${year}-${padded}`;
}

const ALLOCATE_SEQUENCE_SQL = `
INSERT INTO request_counters (company_id, form_code, year, last_seq)
VALUES (?, ?, ?, 1)
ON CONFLICT(company_id, form_code, year)
DO UPDATE SET last_seq = last_seq + 1;
`;

const GET_SEQUENCE_SQL = `
SELECT last_seq FROM request_counters
WHERE company_id = ? AND form_code = ? AND year = ?;
`;

/**
 * Allocates the next sequential counter for a request scoped by company, form code, and year in a sync SQLite transaction.
 * Generates references like ICCL-AP-2026-0001.
 */
export function allocateSequenceSync(
  db: DatabaseSync,
  companyId: string,
  formCode: string,
  year: number = new Date().getFullYear()
): string {
  db.prepare(ALLOCATE_SEQUENCE_SQL).run(companyId, formCode, year);
  const row = db.prepare(GET_SEQUENCE_SQL).get(companyId, formCode, year) as { last_seq: number } | undefined;
  const seq = row?.last_seq ?? 1;
  return formatSequenceReference(companyId, formCode, year, seq);
}

/**
 * Allocates the next sequential counter for a request scoped by company, form code, and year in an async Turso/libSQL transaction.
 */
export async function allocateSequenceAsync(
  connection: AsyncQueryConnection,
  companyId: string,
  formCode: string,
  year: number = new Date().getFullYear()
): Promise<string> {
  await connection.execute(ALLOCATE_SEQUENCE_SQL, [companyId, formCode, year]);
  const res = await connection.execute(GET_SEQUENCE_SQL, [companyId, formCode, year]);
  const seq = Number((res.rows[0] as any)?.last_seq ?? 1);
  return formatSequenceReference(companyId, formCode, year, seq);
}

/**
 * Resolves the short display reference for a request.
 * Prioritizes request.displayId, recognizes existing 4-digit sequential IDs (e.g. PEW-AW-2026-0018),
 * and safely falls back to request.id for legacy or unsequenced records.
 */
export function getRequestDisplayReference(request: { id: string; displayId?: string }): string {
  if (request.displayId && request.displayId.trim()) {
    return request.displayId.trim();
  }
  return request.id;
}

