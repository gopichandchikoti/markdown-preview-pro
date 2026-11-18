export {};
import { test, expect } from '@playwright/test';

test('renders safely, blocks tracking images until consent and keeps formatting and tasks functional', async ({ page }) => {
  const errors:string[] = [];
  const remoteRequests:string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const baseURL = test.info().project.use.baseURL || 'http://127.0.0.1:4175';
  page.on('request', request => { if (!request.url().startsWith(baseURL)) remoteRequests.push(request.url()); });
  await page.route('https://tracking.example/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: '' }));
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.fill('# Safe heading\n\n**Bold**\n\n- [ ] Task one\n\n```js\nconst safe = true;\n```\n\n' +
    '[bad](javascript:alert%281%29)\n\n![Track](https://tracking.example/pixel.png)\n\n' +
    '![XSS](x" class="copy-btn" onerror="window.hacked=true)');
  await expect(page.locator('#preview h1')).toHaveText('Safe heading');
  await expect(page.locator('#preview strong')).toHaveText('Bold');
  expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  await page.locator('#preview img[alt="XSS"]').click({ force: true });
  await expect(page.locator('#preview [onerror], #preview [onclick], #preview a[href^="javascript:"]')).toHaveCount(0);
  expect(remoteRequests).toEqual([]);
  await page.getByRole('button', { name: 'Load remote image: tracking.example' }).click();
  await expect.poll(() => remoteRequests.length).toBe(1);
  await page.locator('#preview input[type=checkbox]').check();
  await expect(editor).toHaveValue(/\[x\] Task one/);
  await expect(page.locator('#saveStatus')).toHaveText('Saved');
  await page.reload();
  await expect(editor).toHaveValue(/\[x\] Task one/);
  await editor.fill('');
  await expect(page.locator('#saveStatus')).toHaveText('Saved');
  await page.reload();
  await expect(editor).toHaveValue('');
  expect(errors).toEqual([]);
});

test('supports keyboard controls and narrow layout without script policy violations', async ({ page }) => {
  const violations:string[] = [];
  await page.exposeFunction('policyViolation', (directive:string) => violations.push(directive));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.policyViolation(event.violatedDirective)));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const theme = page.getByRole('button', { name: 'Toggle light or dark theme' });
  await theme.focus();
  const before = await page.locator('html').getAttribute('data-theme');
  await page.keyboard.press('Enter');
  expect(await page.locator('html').getAttribute('data-theme')).not.toBe(before);
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Narrow\n\n- [ ] Item');
  await expect(page.locator('#preview h1')).toHaveText('Narrow');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(violations).toEqual([]);
});
