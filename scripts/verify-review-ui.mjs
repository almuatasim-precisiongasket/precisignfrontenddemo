import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const url = process.env.SHOWCASE_URL || 'http://127.0.0.1:3198/';
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw Error('Use an isolated localhost showcase only.');
const output = join(tmpdir(), 'precisign-review-ui'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
try {
 const context = await browser.newContext({ viewport: { width: 1159, height: 768 }, reducedMotion: 'reduce' });
 const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto(url); await page.getByLabel('Demo employee').selectOption('showcase-user-2');
 const request = await page.evaluate(async () => (await (await import('/src/services/repository.ts')).dataService.getRequests()).find(r => r.formType === 'Administrative & Payment Request' && r.status === 'Pending Approval'));
 assert.ok(request);
 await page.getByLabel('Search all requests').fill(request.id);
 await page.getByRole('button').filter({ hasText: request.id }).first().click();
 const steps = page.getByRole('list', { name: 'Signing steps', exact: true }).locator(':scope > li');
 const boxes = await steps.evaluateAll(nodes => nodes.map(n => ({ top: n.getBoundingClientRect().top, height: n.getBoundingClientRect().height })));
 assert.ok(boxes.every(b => Math.abs(b.top - boxes[0].top) < 2), 'Stepper stays on one row at 1159px');
 assert.equal(await page.getByRole('button', { name: 'Go to signing', exact: true }).count(), 0);
 const remark = page.getByRole('textbox', { name: 'Signer remarks (optional)' });
 await remark.fill('Synthetic UI check: quotation reviewed.');
 await page.screenshot({ path: join(output, 'review-desktop.png'), fullPage: true });
 await page.getByRole('button', { name: 'Approve & sign', exact: true }).click();
 const dialog = page.getByRole('dialog'); await dialog.waitFor();
 assert.equal(await dialog.getByRole('textbox').count(), 0, 'Saved confirmation has no duplicate remarks input');
 await dialog.getByText('Your saved signature', { exact: true }).waitFor();
 await page.screenshot({ path: join(output, 'signature-confirmation.png') });
 await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
 assert.equal(await remark.inputValue(), 'Synthetic UI check: quotation reviewed.');
 await page.setViewportSize({ width: 390, height: 844 });
 await page.getByRole('button', { name: 'Go to actions', exact: true }).click();
 await remark.waitFor({ state: 'visible' });
 assert.ok(await page.locator('#review-document').isVisible(), 'Document remains in stacked narrow layout');
 const width = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
 assert.ok(width.content <= width.viewport, JSON.stringify(width));
 await page.screenshot({ path: join(output, 'review-narrow.png'), fullPage: true });
 await page.getByRole('button', { name: 'Approve & sign', exact: true }).click();
 await dialog.getByRole('button', { name: 'Confirm & sign', exact: true }).click();
 await dialog.waitFor({ state: 'hidden' });
 const saved = await page.evaluate(async id => (await (await import('/src/services/repository.ts')).dataService.getRequests()).find(r => r.id === id), request.id);
 assert.equal(saved.status, 'Approved');
 assert.ok(saved.approvalHistory.some(e => e.comments === 'Synthetic UI check: quotation reviewed.' && e.version === request.documentVersion));
 assert.equal(await remark.count(), 0, 'Completed record exposes no signing input');
 const history = page.getByRole('list', { name: 'Request history', exact: true });
 await history.getByText('Synthetic UI check: quotation reviewed.', { exact: true }).waitFor({ state: 'visible' });
 assert.equal(await history.locator('details, summary').count(), 0, 'Reading remarks requires no disclosure clicks');
 assert.ok((await history.locator(':scope > li').first().innerText()).includes('Synthetic UI check: quotation reviewed.'));

 await page.setViewportSize({ width: 1440, height: 1000 });
 const overview = page.getByRole('heading', { name: 'Request overview', exact: true }).locator('..');
 await overview.getByRole('region', { name: 'Processing', exact: true }).waitFor();
 const [summary] = await Promise.all([
   page.waitForEvent('download'),
   overview.getByRole('button', { name: 'Download route summary', exact: true }).click(),
 ]);
 assert.equal(summary.suggestedFilename(), `${request.id}-route-summary.txt`);
 await page.getByRole('complementary', { name: 'Request details', exact: true }).screenshot({ path: join(output, 'request-details.png') });
 await page.screenshot({ path: join(output, 'review-completed.png'), fullPage: true });
 assert.deepEqual(errors, []);
 console.log(JSON.stringify({ result: 'passed', checks: ['desktop', 'cancel retains remark', 'saved confirmation', 'narrow stacked layout', 'remark persistence with correct version', 'completed overview and route summary download', 'reduced motion'], output, width }));
} finally { await browser.close(); }
