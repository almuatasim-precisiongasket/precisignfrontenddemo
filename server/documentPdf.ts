import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { RequestError } from './requestValidation';

export async function renderDocumentPdf(origin: string, requestId: string, version: number, updatedAt: string, token: string) {
  const url = new URL('/document-export', origin);
  url.searchParams.set('request', requestId);
  url.searchParams.set('version', String(version));

  const executablePath = process.env.PRECISIGN_PDF_CHROMIUM;
  const browser = await chromium.launch({
    executablePath,
    channel: !executablePath && !existsSync(chromium.executablePath()) && process.platform === 'win32' ? 'msedge' : undefined,
    timeout: 10000,
  });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addCookies([{ name: 'precisign_session', value: token, url: origin, httpOnly: true }]);
    await context.route('**/*', route => {
      const destination = new URL(route.request().url());
      return destination.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(url.href);
    const ready = page.locator('[data-pdf-ready]');
    await ready.or(page.locator('[data-pdf-error]')).waitFor();
    if (!await ready.count()) throw new RequestError(404, 'Document version unavailable.');
    if (await ready.getAttribute('data-request-updated-at') !== updatedAt) {
      throw new RequestError(409, 'Request changed during export.');
    }
    return await page.pdf({ displayHeaderFooter: false, preferCSSPageSize: true, printBackground: true, tagged: true });
  } finally {
    await browser.close();
  }
}
