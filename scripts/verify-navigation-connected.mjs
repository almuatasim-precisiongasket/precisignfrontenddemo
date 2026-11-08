// Synthetic browser HTTP fixtures only: never connects to an Express runtime/database.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { createShowcaseDataset } from '../src/data/showcaseData.ts';
const base = 'http://127.0.0.1:3199';
const data = createShowcaseDataset();
const user = structuredClone(data.users.find(u => u.id === 'showcase-user-2'));
const record = structuredClone(data.requests.find(r => r.companyId !== user.companyId && r.status === 'Pending Approval'));
record.revision = 1;
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
try {
 const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(8000);
 let loggedIn = false; let changeRequired = true; let denied = false; let empty = false;
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const profile = { ...user, mustChangePassword: changeRequired, ...(empty ? { companyGrants: [], formGrants: {} } : {}) };
  const respond = (body, status = 200) => route.fulfill({ status, json: body });
  if (path === '/api/auth/login') { loggedIn = true; return respond({ user: profile }); }
  if (path === '/api/auth/change-password') { changeRequired = false; return respond({}); }
  if (path === '/api/auth/me') return respond(loggedIn ? { user: profile } : { error: 'Sign in' }, loggedIn ? 200 : 401);
  if (!loggedIn) return respond({ error: 'Sign in' }, 401);
  if (path === '/api/bootstrap') return respond({ user: profile, companies: empty ? [] : data.companies, users: data.users, workflows: data.workflows });
  if (path === '/api/requests') return respond([]); // Proves detail lookup, not initial-list membership, opens the link.
  if (path.startsWith('/api/requests/')) return respond(denied || empty ? { error: 'Unavailable' } : record, denied || empty ? 403 : 200);
  return respond({ error: 'No synthetic fixture' }, 404);
 });
 const target = base + '/requests/' + encodeURIComponent(record.id);
 await page.goto(target);
 await page.getByLabel('Email', { exact: true }).fill(user.email);
 await page.locator('input[type="password"]').first().fill('Synthetic-only-123456');
 await page.getByRole('button', { name: 'Sign in', exact: true }).click();
 await page.getByRole('heading', { name: 'Choose a new password' }).waitFor();
 await page.getByLabel('Current password', { exact: true }).fill('Synthetic-only-123456');
 await page.getByLabel('New password', { exact: true }).fill('Changed-synthetic-123456');
 await page.getByRole('button', { name: 'Change password', exact: true }).click();
 await page.getByRole('heading', { name: 'Request actions', exact: true }).waitFor();
 assert.equal(page.url(), target);
 assert.ok(await page.getByRole('button').filter({ hasText: data.companies.find(c => c.id === record.companyId).fullName }).count() > 0, 'Company selector follows the linked request');
 await page.reload(); await page.getByRole('heading', { name: 'Request actions', exact: true }).waitFor();
 denied = true; await page.reload(); await page.getByRole('heading', { name: 'Request unavailable', exact: true }).waitFor();
 await page.goto(base + '/document-export?request=' + encodeURIComponent(record.id) + '&version=1');
 await page.locator('[data-pdf-error]').waitFor();
 empty = true; await page.goto(base + '/forms'); await page.getByText('You haven’t been assigned a company yet.', { exact: false }).waitFor();
 assert.deepEqual(errors, []);
 console.log('PASS: connected deep link survives login + required password change; detail lookup works without list entry; 403 renders neutral unavailable; PDF export retains auth failure; zero grants retain empty state. No runtime API or database used.');
} finally { await browser.close(); }
