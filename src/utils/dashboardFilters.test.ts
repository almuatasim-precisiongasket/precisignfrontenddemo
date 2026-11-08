import test from 'node:test';
import assert from 'node:assert/strict';
import type { RequestRecord } from '../types';
import { filterDashboardRequests as filter } from './dashboardFilters';
const records = [
  { id: 'B', companyId: 'PEW', formType: 'IT Request', requesterName: 'Anzar', title: 'Laptop', status: 'Pending Approval', currentApproverName: 'Afzal', createdAt: '2026-01-02', formData: { priority: 'Low', workDescription: 'Network access' } },
  { id: 'A', companyId: 'ICCL', formType: 'Expense Claim', requesterName: 'Farida', title: 'Travel', status: 'Approved', createdAt: '2026-01-01', formData: { priority: 'Urgent', workDescription: 'Dammam visit' } },
  { id: 'C', companyId: 'FSG', formType: 'IT Request', requesterName: 'Shanid', title: 'Printer', status: 'Returned for Correction', createdAt: '2026-01-02', formData: { priority: 'Low', workDescription: 'Workshop printing' } },
] as RequestRecord[];
for (const r of records) { Object.freeze(r.formData); Object.freeze(r); } Object.freeze(records);
const input: Parameters<typeof filter>[0] = { internalTab: 'all', companyRequests: records, pendingForMeRequests: [records[0]], myRequests: [records[2]], returnedRequests: [records[2]], approvedRequests: [records[1]], searchQuery: '', sortBy: 'date-desc', formFilter: 'ALL', statusFilter: 'ALL' };
const ids = (overrides = {}) => filter({ ...input, ...overrides }).map(r => r.id);
test('default, empty results, stable date sorting and immutable inputs', () => {
  assert.deepEqual(ids(), ['B', 'C', 'A']); assert.deepEqual(ids({ companyRequests: [] }), []);
  assert.deepEqual(ids({ sortBy: 'date-asc' }), ['A', 'B', 'C']);
  assert.deepEqual(records.map(r => r.id), ['B', 'A', 'C']);
  assert.notEqual(filter(input), records);
});
test('search covers each supported field with case and whitespace semantics', () => {
  for (const text of ['B', 'laptop', 'ANZAR', 'network', 'afzal']) assert.deepEqual(ids({ searchQuery: text }), ['B']);
  assert.deepEqual(ids({ searchQuery: 'expense claim' }), ['A']);
  assert.deepEqual(ids({ searchQuery: '   ' }), ['B', 'C', 'A']);
  assert.deepEqual(ids({ searchQuery: ' laptop ' }), []);
  assert.deepEqual(ids({ searchQuery: 'absent' }), []);
});
test('form, status and combined filtering preserve supplied company scope', () => {
  assert.deepEqual(ids({ formFilter: 'IT Request' }), ['B', 'C']);
  assert.deepEqual(ids({ statusFilter: 'Approved' }), ['A']);
  assert.deepEqual(ids({ formFilter: 'IT Request', statusFilter: 'Returned for Correction', searchQuery: 'printing' }), ['C']);
  assert.deepEqual(ids({ companyRequests: [records[1]] }), ['A']);
});
test('every dashboard tab consumes its existing precomputed list', () => {
  for (const [tab, expected] of [['pending', ['B']], ['my', ['C']], ['returned', ['C']], ['approved', ['A']]] as const) assert.deepEqual(ids({ internalTab: tab }), expected);
});
test('priority ties stay stable and ID sorting is unchanged', () => {
  assert.deepEqual(ids({ sortBy: 'priority' }), ['A', 'B', 'C']);
  assert.deepEqual(ids({ sortBy: 'id' }), ['A', 'B', 'C']);
});
