export {};
import { test, expect } from '@playwright/test';
const fs = require('node:fs/promises');
for (const width of [320, 768, 1366]) {
  test(`phase 6: ${width}px reflow, reduced motion, keyboard, accessibility scan and screenshot`, async ({ page }, info) => {
    const errors:string[] = []; const violations:string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('reportCSP', (e:string) => violations.push(e));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation',
      e => window.reportCSP(e.violatedDirective)));
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/'); await page.waitForFunction(() => Boolean(globalThis.Workspace));
    await page.locator('#editor').fill('# Workspace\n\n**Local notes**, safely stored.\n\n- [ ] Review backup\n\n## Next steps\n\nWrite something useful.');
    await expect(page.locator('#saveStatus')).toHaveText('Saved');
    await page.locator('#editor').focus(); await page.keyboard.press('Escape'); await page.keyboard.press('Tab');
    await expect(page.locator('#editor')).not.toBeFocused();
    const axe = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
    await page.route('**/axe-test.js', route => route.fulfill({ contentType: 'text/javascript', body: axe }));
    await page.addScriptTag({ url: '/axe-test.js' });
    const results = await page.evaluate(async () => window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }
    }));
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.html) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`workspace-${width}.png`), fullPage: true });
    if (width <= 768) {
      await page.locator('#explorerToggle').click(); await expect(page.locator('#explorerFilter')).toBeFocused();
      await page.keyboard.press('Escape'); await expect(page.locator('#explorerToggle')).toBeFocused();
    }
    await page.getByRole('tab', { selected: true }).focus(); await page.keyboard.press('Delete');
    await expect(page.locator('#emptyNew')).toBeFocused();
    expect(errors).toEqual([]); expect(violations).toEqual([]);
  });
}
