import type { Company } from '../types/index';
export const ICCL_DISPLAY_NAME = 'Insturmental Control Co Ltd';
/** Current company metadata only; document snapshots keep their recorded wording. */
export function currentCompanyDisplay(company: Company): Company {
  return company.id === 'ICCL' ? { ...company, name: ICCL_DISPLAY_NAME, fullName: `ICCL - ${ICCL_DISPLAY_NAME}` } : company;
}
