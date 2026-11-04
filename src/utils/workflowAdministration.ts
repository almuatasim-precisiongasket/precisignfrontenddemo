import type { UserProfile } from '../types/index';

export const canAdministerWorkflows = (user: UserProfile) => user.role === 'Director' || user.isGroupAdmin === true;
