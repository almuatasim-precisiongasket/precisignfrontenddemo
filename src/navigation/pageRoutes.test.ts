import test from 'node:test';
import assert from 'node:assert/strict';
import { pagePaths, formPaths, parsePageRoute, pageRouteHref } from './pageRoutes';
test('major page definitions round-trip through the central route table', () => {
 for (const [view, path] of Object.entries(pagePaths)) assert.deepEqual(parsePageRoute(path), { view });
 for (const [formType] of Object.entries(formPaths)) assert.deepEqual(parsePageRoute(pageRouteHref({ view: 'create-request', formType })), { view: 'create-request', formType });
});
test('entry aliases and existing rnd links remain supported, including trailing slash', () => {
 assert.equal(parsePageRoute('/').view, 'dashboard'); assert.equal(parsePageRoute('/settings').view, 'user-profile');
 assert.deepEqual(parsePageRoute('/rnd/'), { view: 'create-request', formType: 'R&D Initiative' });
});
test('request identifiers are encoded once and cannot inject other routes', () => {
 const requestId = 'PEW-R&D-123 with space';
 assert.deepEqual(parsePageRoute(pageRouteHref({ view: 'review-sign', requestId })), { view: 'review-sign', requestId });
 for (const path of ['/requests/%E0%A4%A', '/requests/%2F', '/requests/%5C', '/requests/%00']) assert.equal(parsePageRoute(path).view, 'not-found');
});
test('list filters survive URL round-trip and invalid filters use all', () => {
 for (const filter of ['pending','my','all','approved'] as const) assert.deepEqual(parsePageRoute(pageRouteHref({ view: 'requests', filter })), { view: 'requests', filter });
 assert.equal(parsePageRoute('/requests?filter=bogus').filter, 'all');
});
test('unknown routes do not silently become the dashboard', () => {
 for (const path of ['/unknown', '/forms/unknown/new', '/settings/unknown']) assert.equal(parsePageRoute(path).view, 'not-found');
});
test('password reset hashes do not collide with page routing', () => {
 assert.deepEqual(parsePageRoute('/requests/PEW-123#reset=synthetic-token'), { view: 'review-sign', requestId: 'PEW-123' });
});
