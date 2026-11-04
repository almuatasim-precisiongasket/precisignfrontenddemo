import test from 'node:test';
import assert from 'node:assert';
import {
  filterRequestsByScopeAndUser,
  canUserAccessCompany,
  validateOriginatingCompany,
} from './companyAccess';
import {
  UserProfile,
  RequestRecord,
  CompanyId,
  PARENT_ORGANIZATION_ID,
} from '../types/index';
import { INITIAL_REQUESTS, INITIAL_USERS, INITIAL_WORKFLOWS } from '../data/seedData';
import { createNewRequestRecord, approveRequestStage } from './workflowEngine';

test('Scenario 12: Group View vs Individual Company View filtering', () => {
  const director = INITIAL_USERS.find((u) => u.id === 'user-afzal')!; // Director has group access

  // Group View ('PEG') returns all requests across group
  const groupRequests = filterRequestsByScopeAndUser(INITIAL_REQUESTS, PARENT_ORGANIZATION_ID, director);
  assert.strictEqual(groupRequests.length, INITIAL_REQUESTS.length);
  assert.ok(groupRequests.some((r) => r.companyId === 'PEW'));
  assert.ok(groupRequests.some((r) => r.companyId === 'ICCL'));

  // Individual Company View ('PEW') returns only PEW requests
  const pewRequests = filterRequestsByScopeAndUser(INITIAL_REQUESTS, 'PEW', director);
  assert.ok(pewRequests.every((r) => r.companyId === 'PEW'));
  assert.strictEqual(pewRequests.length, INITIAL_REQUESTS.filter((r) => r.companyId === 'PEW').length);
});

test('Scenario 13: Unauthorized company filtering in Group View', () => {
  // Single-company user without group admin role
  const singleCompanyUser: UserProfile = {
    id: 'user-single',
    name: 'Single Company Worker',
    email: 'worker@pew.com',
    role: 'Admin',
    department: 'Admin',
    initials: 'SW',
    avatarColor: '#10b981',
    companyId: 'PEW',
    allowedCompanyIds: ['PEW'],
    isGroupAdmin: false,
  };

  // Even when selecting Group View ('PEG'), single company worker only sees authorized PEW requests
  const filteredInGroup = filterRequestsByScopeAndUser(INITIAL_REQUESTS, PARENT_ORGANIZATION_ID, singleCompanyUser);
  assert.ok(filteredInGroup.every((r) => r.companyId === 'PEW'));
  assert.strictEqual(filteredInGroup.some((r) => r.companyId === 'ICCL'), false);
});

test('Scenario 14: Group View request creation requires explicit originating subsidiary', () => {
  // Creating in Group View ('PEG') without target company fails
  const missingValidation = validateOriginatingCompany(PARENT_ORGANIZATION_ID, undefined, 'PEW');
  assert.strictEqual(missingValidation.isValid, false);
  assert.ok(missingValidation.error?.includes('originating subsidiary company'));

  // Creating in Group View ('PEG') with explicit subsidiary company succeeds
  const validValidation = validateOriginatingCompany(PARENT_ORGANIZATION_ID, 'ICCL', 'PEW');
  assert.strictEqual(validValidation.isValid, true);
  assert.strictEqual(validValidation.companyId, 'ICCL');

  // Creating in Individual Company View defaults to company scope
  const companyValidation = validateOriginatingCompany('FSG', undefined, 'PEW');
  assert.strictEqual(companyValidation.isValid, true);
  assert.strictEqual(companyValidation.companyId, 'FSG');
});

test('Scenario 15: Cross-company Director/GM authorization for approval actions in Group View', () => {
  const director = INITIAL_USERS.find((u) => u.id === 'user-afzal')!; // Director
  const icclRequest = INITIAL_REQUESTS.find((r) => r.companyId === 'ICCL')!; // ICCL request

  assert.strictEqual(canUserAccessCompany(director, 'ICCL'), true);

  // Director approves ICCL request from Group View
  const result = approveRequestStage({
    request: icclRequest,
    actingUser: director,
    comment: 'Approved cross-company from Group View',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.updatedRequest?.status, 'Approved');
});
