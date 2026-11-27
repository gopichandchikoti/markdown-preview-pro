export {};
import { test, expect } from '@playwright/test';
test('existing formatting, search, outline, statistics, sanitized HTML, code copy and Markdown download stay scoped', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  const editor = page.getByRole('textbox', { name: 'Markdown source', exact: true });
  await editor.fill('# Existing features\n\nSelected text\n\n```md\n- [ ] Fenced task\n```\n\n- [ ] Real task\n\n![Remote](https://tracking.example/x.png)');
  await editor.evaluate((e:HTMLTextAreaElement) => { const start = e.value.indexOf('Selected text'); e.setSelectionRange(start, start + 13); });
  await page.keyboard.press('Control+b');
  await expect(page.locator('#preview strong').filter({ hasText: /^Selected text$/ })).toHaveText('Selected text');
  await page.keyboard.press('Control+f'); await page.getByRole('textbox', { name: 'Find in document' }).fill('Real');
  await expect(page.locator('#searchCount')).toHaveText('1 found'); await page.keyboard.press('Escape');
  await expect(editor).toBeFocused();
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(page.locator('#outlineContent button')).toHaveText('Existing features');
  await expect(page.locator('#statWords')).toContainText('words');
  await page.locator('#preview input[type=checkbox]').check();
  await expect(editor).toHaveValue(/\[x\] Real task/); await expect(editor).toHaveValue(/\[ \] Fenced task/);
  await page.evaluate(() => { window.copied = []; Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (value:string) => window.copied.push(value) }, configurable: true }); });
  await page.getByRole('button', { name: 'Copy HTML', exact: true }).click();
  const copied = await page.evaluate(() => window.copied[0]);
  expect(copied).toContain('<strong>Selected text</strong>'); expect(copied).not.toMatch(/\s(?:src|onerror|onclick)=/);
  await page.locator('#preview .copy-btn').click(); expect(await page.evaluate(() => window.copied[1])).toBe('- [ ] Fenced task');
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download .md', exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe('Untitled 1.md');
  await expect(page.locator('#saveStatus')).toHaveText('Saved');
});
