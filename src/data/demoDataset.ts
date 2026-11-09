import { isShowcaseBuild } from '../config/demo';
import { INITIAL_COMPANIES, INITIAL_USERS, INITIAL_WORKFLOWS, INITIAL_REQUESTS } from './seedData';
import { createShowcaseDataset, type DemoDataset } from './showcaseData';

export const activeDemoDataset: DemoDataset = isShowcaseBuild ? createShowcaseDataset() : {
  companies: INITIAL_COMPANIES, users: INITIAL_USERS, workflows: INITIAL_WORKFLOWS, requests: INITIAL_REQUESTS,
  session: { companyId: 'PEW', userId: 'user-afzal' },
};
