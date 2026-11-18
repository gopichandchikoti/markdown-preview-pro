export {};
import { test, expect } from '@playwright/test';
async function ready(page:import('@playwright/test').Page) {
  await page.goto('/'); await page.waitForFunction(() => Boolean(globalThis.Workspace));
}
test('phase 2: blank initialization, nested Explorer CRUD, tab identity and empty state', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('tab')).toHaveCount(1);
  expect(await page.evaluate(() => Workspace.snapshot.documents[0].content)).toBe('');
  await page.reload(); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  expect(await page.evaluate(() => Workspace.snapshot.documents.length)).toBe(1);
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByLabel('Folder name', { exact: true }).fill('Projects');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: /Projects/ })).toBeVisible();
  await page.locator('#explorerNew').click(); await expect(page.getByRole('tab')).toHaveCount(2);
  const id = await page.evaluate(() => Workspace.state.active);
  await page.locator('#action-rename').click(); await page.getByLabel('File name (.md)').fill('Project');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Project.md', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Workspace.state.active)).toBe(id);
  await page.getByRole('treeitem', { name: /Project\.md/ }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('button', { name: 'Close Project.md', exact: true }).click();
  expect(await page.evaluate(() => Workspace.snapshot.documents.length)).toBe(2);
  await page.getByRole('button', { name: 'Close Untitled 1.md', exact: true }).click();
  await expect(page.locator('#emptyWorkspace')).toBeVisible();
});
test('phase 6: workspace export/replace round trip and malformed import leaves data unchanged', async ({ page }) => {
  await ready(page); await page.locator('#editor').fill('# Backup body\n\nExact bytes');
  await expect(page.locator('#saveStatus')).toHaveText('Saved');
  const saved = await page.evaluate(() => WorkspaceBackup.encode(Workspace.snapshot));
  const download = page.waitForEvent('download'); await page.locator('#exportWorkspace').click();
  const file = await download; expect(file.suggestedFilename()).toBe('md-preview-pro-workspace.json');
  const fs = require('node:fs/promises');
  const bytes = await fs.readFile(await file.path()); expect(JSON.parse(bytes.toString())).toEqual(saved);
  await page.locator('#editor').fill('Replace me'); await expect(page.locator('#saveStatus')).toHaveText('Saved');
  await page.locator('#backupFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: bytes });
  await expect(page.locator('#workspaceDialog')).toBeVisible();
  await page.getByLabel('Import mode').selectOption('replace'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('# Backup body\n\nExact bytes');
  const before = await page.evaluate(() => JSON.stringify(Workspace.snapshot.documents));
  await page.locator('#backupFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"version":2}') });
  await expect(page.locator('#workspaceNotice')).toContainText('Backup must be valid JSON');
  expect(await page.evaluate(() => JSON.stringify(Workspace.snapshot.documents))).toBe(before);
});
for (const [label, legacy] of [['empty', ''], ['normal', '# Legacy\r\n🌱'], ['oversized', 'x'.repeat(200001)]]) {
  test(`phase 6: real IndexedDB migrates ${label} legacy content once and preserves theme`, async ({ page }) => {
    await page.addInitScript(value => { if (!localStorage.getItem('seeded')) {
      localStorage.setItem('md-preview-pro-content', value); localStorage.setItem('md-preview-theme', 'dark');
      localStorage.setItem('seeded', 'yes');
    } }, legacy);
    await ready(page);
    expect(await page.evaluate(() => Workspace.snapshot.documents[0].content)).toBe(legacy);
    expect(await page.evaluate(() => localStorage.getItem('md-preview-pro-content'))).toBe(legacy);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload(); await page.waitForFunction(() => Boolean(globalThis.Workspace));
    expect(await page.evaluate(() => Workspace.snapshot.documents.length)).toBe(1);
    expect(await page.evaluate(() => Workspace.snapshot.documents[0].content)).toBe(legacy);
  });
}
test('phase 6: unavailable IndexedDB preserves legacy and can export a recovery backup', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('md-preview-pro-content', 'Legacy recovery');
    Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  await page.goto('/'); await expect(page.locator('#saveStatus')).toContainText('Save failed');
  await expect(page.locator('#editor')).toHaveValue('Legacy recovery');
  await page.locator('#editor').fill('Edited recovery');
  const download = page.waitForEvent('download'); await page.locator('#exportWorkspace').click();
  const file = await download;
  const backup = JSON.parse(await require('node:fs/promises').readFile(await file.path(), 'utf8'));
  expect(backup.documents[0].content).toBe('Edited recovery');
  expect(await page.evaluate(() => localStorage.getItem('md-preview-pro-content'))).toBe('Legacy recovery');
});
test('phase 5: same-origin windows sync and concurrent edits recover without overwriting remote', async ({ page, context }) => {
  await ready(page);
  const other = await context.newPage(); await ready(other);
  const editor = page.locator('#editor');
  await editor.fill('Remote shared version');
  await expect(page.locator('#saveStatus')).toHaveText('Saved');
  await expect(other.locator('#editor')).toHaveValue('Remote shared version');
  // Freeze the local timer while a second window commits a competing edit.
  await page.evaluate(() => {
    UI.area('editor').value = 'Local competing edits'; EditorBridge.changed(Workspace);
    const s = EditorBridge.session(Workspace); if (s) clearTimeout(s.timer);
  });
  await other.locator('#editor').fill('Remote winner');
  await expect(other.locator('#saveStatus')).toHaveText('Saved');
  await page.evaluate(() => Workspace.refreshExternal?.());
  await expect(page.locator('#saveStatus')).toHaveText(/Conflict/);
  await expect(editor).toHaveValue('Local competing edits');
  await page.getByRole('button', { name: 'Keep local as a recovered file' }).click();
  await expect(page.getByRole('tab', { selected: true })).toHaveText(/Recovered/);
  expect(await page.evaluate(async () => (await Workspace.repository.snapshot()).documents.map(d => d.content).sort()))
    .toEqual(['Local competing edits', 'Remote winner']);
  await other.close();
});
test('phase 5: quota errors retain drafts, block close, and retry only claims Saved after durable success', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    Workspace.realSave = Workspace.repository.save.bind(Workspace.repository);
    Workspace.repository.save = async () => { throw new DOMException('quota', 'QuotaExceededError'); };
  });
  await page.locator('#editor').fill('Precious unsaved draft');
  await expect(page.locator('#saveStatus')).toHaveText(/Save failed/);
  await page.getByRole('button', { name: 'Close Untitled 1.md', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.locator('#editor')).toHaveValue('Precious unsaved draft');
  const downloading = page.waitForEvent('download'); await page.locator('#exportWorkspace').click();
  const backup = JSON.parse(await require('node:fs/promises').readFile(await (await downloading).path(), 'utf8'));
  expect(backup.documents.some((d:WorkspaceDocument) => d.content === 'Precious unsaved draft')).toBe(true);
  await page.evaluate(() => { if (Workspace.realSave) Workspace.repository.save = Workspace.realSave; });
  await page.getByRole('button', { name: 'Retry save / storage' }).click();
  await expect(page.locator('#saveStatus')).toHaveText('Saved');
  await page.reload(); await expect(page.locator('#editor')).toHaveValue('Precious unsaved draft');
});
test('phase 6: file move/duplicate/subtree delete are actionable and keep persistent identities', async ({ page }) => {
  await ready(page); const id = await page.evaluate(() => Workspace.state.active);
  await page.locator('#editor').fill('Move this body'); await expect(page.locator('#saveStatus')).toHaveText('Saved');
  await page.evaluate(async () => {
    const child = await Workspace.repository.createFolder(Workspace.snapshot.folders[0].id, 'Destination');
    await Workspace.refresh(); Workspace.activate(Workspace.state.active || ''); window.destination = child.id;
  });
  await page.locator('#action-move').click(); await page.getByLabel('Destination folder').selectOption(await page.evaluate(() => window.destination));
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Workspace.active()?.folderId)).toBe(await page.evaluate(() => window.destination));
  expect(await page.evaluate(() => Workspace.state.active)).toBe(id);
  await page.locator('#action-duplicate').click(); await expect(page.getByRole('tab')).toHaveCount(2);
  expect(await page.evaluate(() => Workspace.state.active)).not.toBe(id);
  await page.getByRole('treeitem', { name: /Destination/ }).click();
  await page.locator('#action-delete').click(); await expect(page.locator('#workspaceDialog')).toContainText('all nested folders and files');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => Workspace.snapshot.documents.length)).toBe(2);
  await page.locator('#action-delete').click(); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('#emptyWorkspace')).toBeVisible();
  expect(await page.evaluate(async () => (await Workspace.repository.snapshot()).documents.length)).toBe(0);
});
test('phase 6: synchronization refreshes through IndexedDB when BroadcastChannel is unavailable', async ({ page, context }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'BroadcastChannel', {value:undefined}); });
  await ready(page); const other = await context.newPage(); await ready(other);
  await other.locator('#editor').fill('Polling fallback'); await expect(other.locator('#saveStatus')).toHaveText('Saved');
  await expect(page.locator('#editor')).toHaveValue('Polling fallback', { timeout: 10000 }); await other.close();
});
test('phase 4: title suggestions are explicit, collision safe and respect manual ownership; tab keys work', async ({ page }) => {
  await ready(page);
  const editor = page.getByRole('textbox', { name: 'Markdown source', exact: true });
  await editor.fill('# My Project');
  await expect(page.locator('#suggestedName')).toHaveText('Suggested name: My Project.md');
  await page.getByRole('button', { name: 'Use suggested name' }).click();
  await expect(page.getByRole('tab', { name: 'My Project.md', exact: true })).toBeVisible();
  await editor.fill('# Different Project');
  await page.evaluate(() => WorkspaceTitle.update(Workspace));
  await expect(page.locator('#acceptTitle')).toBeHidden();
  await page.locator('#tabNew').click(); await editor.fill('# My Project');
  await expect(page.locator('#suggestedName')).toHaveText('Suggested name: My Project (2).md');
  await page.getByRole('tab', { selected: true }).focus(); await page.keyboard.press('Home');
  await expect(editor).toHaveValue('# Different Project');
  await page.keyboard.press('End'); await expect(editor).toHaveValue('# My Project');
  const result = await page.evaluate(() => {
    const zero = new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(zero);
    const first = new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(first); return [zero.defaultPrevented, first.defaultPrevented];
  });
  expect(result).toEqual([false, true]); await expect(editor).toHaveValue('# Different Project');
});
test('phase 3: 20 documents, 12 ordered tabs, independent content, caret, scroll and tasks', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const w = Workspace; const root = w.snapshot.folders[0].id;
    const a = await w.repository.createFolder(root, 'Level 2');
    const b = await w.repository.createFolder(a.id, 'Level 3');
    for (let i = 1; i < 20; i++) {
      const doc = await w.repository.createDocument([root, a.id, b.id][i % 3], `# File ${i}\n\n- [ ] Task ${i}`);
      if (i < 12) { await w.refresh(); w.activate(doc.id); }
    }
    await w.refresh();
  });
  await expect(page.getByRole('tab')).toHaveCount(12);
  const order = await page.evaluate(() => [...Workspace.state.tabs]);
  const editor = page.getByRole('textbox', { name: 'Markdown source', exact: true });
  await page.evaluate(() => Workspace.activate(Workspace.state.tabs[0]));
  await editor.fill('# Alpha\n\n' + 'long line\n'.repeat(100));
  await editor.evaluate((e:HTMLTextAreaElement) => { e.setSelectionRange(4, 7); e.scrollTop = 150; });
  await page.evaluate(() => Workspace.activate(Workspace.state.tabs[1]));
  await editor.fill('# Beta\n\n- [ ] Task B');
  await page.locator('#preview input[type=checkbox]').check();
  await expect(editor).toHaveValue(/\[x\] Task B/);
  await page.evaluate(() => Workspace.activate(Workspace.state.tabs[0]));
  await expect(editor).toHaveValue(/^# Alpha/);
  expect(await editor.evaluate((e:HTMLTextAreaElement) => [e.selectionStart, e.selectionEnd, e.scrollTop])).toEqual([4, 7, 150]);
  await expect(page.locator('#preview h1')).toHaveText('Alpha');
  await page.evaluate(() => EditorBridge.flushAll(Workspace));
  await page.reload(); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  expect(await page.evaluate(() => Workspace.state.tabs)).toEqual(order);
  expect(await page.evaluate(() => Workspace.snapshot.documents.length)).toBe(20);
  await expect(editor).toHaveValue(/^# Alpha/);
});
