/** Build-only replacement for legacy demo fixtures. No original employee data is bundled. */
import type { UserProfile, WorkflowConfig, RequestRecord } from '../types';
export { INITIAL_COMPANIES } from './companies';
export const INITIAL_USERS: UserProfile[] = [];
export const INITIAL_WORKFLOWS: WorkflowConfig[] = [];
export const INITIAL_REQUESTS: RequestRecord[] = [];
