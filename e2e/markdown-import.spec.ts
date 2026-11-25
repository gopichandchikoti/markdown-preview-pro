import { test, expect, type Page } from '@playwright/test';

async function dropMarkdown(page:Page, name:string, content:string) {
  const dataTransfer = await page.evaluateHandle(({ name, content }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], name, { type:'text/markdown' }));
    return transfer;
  }, { name, content });
  try { await page.dispatchEvent('body', 'drop', { dataTransfer }); }
  finally { await dataTransfer.dispose(); }
}

test('dropped Markdown opens a persistent filename-owned tab with safe preview and retains the current note', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  const original = await page.evaluate(() => Workspace.state.active);
  await page.locator('#editor').fill('Keep my existing draft');
  await dropMarkdown(page, 'Shared notes.md', '# Shared title\n\n**Imported content**\n\n- [ ] Review');
  await expect(page.getByRole('tab', { name:'Shared notes.md', exact:true })).toBeVisible();
  await expect(page.locator('#editor')).toHaveValue('# Shared title\n\n**Imported content**\n\n- [ ] Review');
  await expect(page.locator('#preview h1')).toHaveText('Shared title');
  await expect(page.locator('#preview strong')).toHaveText('Imported content');
  expect(await page.evaluate(id => Workspace.sessions.get(id || '')?.content, original))
    .toBe('Keep my existing draft');
  await page.evaluate(() => EditorBridge.flushAll(Workspace));
  await page.reload(); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  await expect(page.getByRole('tab', { selected:true })).toHaveText('Shared notes.md');
  await expect(page.locator('#preview h1')).toHaveText('Shared title');
  await expect(page.locator('#acceptTitle')).toBeHidden();
});
test('picker imports multiple files into the selected folder and resolves repeated names without replacement', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  const destination = await page.evaluate(async () => {
    const folder = await Workspace.repository.createFolder(Workspace.snapshot.folders[0].id, 'Imported notes');
    await Workspace.refresh(); Workspace.select({ kind:'folders', id:folder.id }); return folder.id;
  });
  await page.locator('#markdownOpen').focus();
  const chooser = page.waitForEvent('filechooser'); await page.keyboard.press('Enter');
  await (await chooser).setFiles([{name:'Meeting.md',mimeType:'text/plain',buffer:Buffer.from('# Agenda')},
    {name:'Empty.md',mimeType:'',buffer:Buffer.from('')}]);
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('tab',{selected:true})).toHaveText('Empty.md');
  await dropMarkdown(page,'Meeting.md','# Another meeting');
  await expect(page.getByRole('tab',{selected:true})).toHaveText('Meeting (2).md');
  expect(await page.evaluate(id => Workspace.snapshot.documents.filter(d => d.folderId === id)
    .map(d => ({name:d.name,content:d.content})).sort((a,b) => a.name.localeCompare(b.name)),destination))
    .toEqual([{name:'Empty.md',content:''},{name:'Meeting (2).md',content:'# Another meeting'},
      {name:'Meeting.md',content:'# Agenda'}]);
});

test('pending import locks editing, refuses overlapping drops and restores the original draft on completion', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  const original = await page.evaluate(() => Workspace.state.active);
  await page.locator('#editor').fill('Keep the original');
  await expect(page.locator('#saveStatus')).toHaveText('Saved');
  await page.evaluate(() => {
    const commit = Workspace.repository.importDocuments.bind(Workspace.repository);
    Workspace.repository.importDocuments = async (...args:Parameters<RepositoryAdapter['importDocuments']>) => {
      await new Promise<void>(resolve => { window.releaseDocumentCreation = resolve; });
      return commit(...args);
    };
  });
  await dropMarkdown(page,'Slow.md','# Waited safely');
  await expect(page.locator('#editor')).toBeDisabled();
  await expect(page.locator('#markdownOpen')).toBeDisabled();
  await expect(page.locator('#saveStatus')).toHaveText('Opening Markdown files…');
  await dropMarkdown(page,'Overlapping.md','Should be refused');
  await expect(page.locator('#workspaceNotice')).toContainText('Wait for the current document operation');
  await page.evaluate(() => window.releaseDocumentCreation());
  await expect(page.getByRole('tab',{selected:true})).toHaveText('Slow.md');
  await expect(page.locator('#editor')).toBeEnabled();
  await expect(page.locator('#editor')).toBeFocused();
  expect(await page.evaluate(id => Workspace.snapshot.documents.find(d => d.id === id)?.content,original))
    .toBe('Keep the original');
  await expect(page.getByRole('tab',{name:'Overlapping.md'})).toHaveCount(0);
});
test('invalid, oversized and unreadable file batches leave all workspace records untouched', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  const before = await page.evaluate(async () => JSON.stringify(await Workspace.repository.snapshot()));
  await page.locator('#markdownFiles').setInputFiles([
    {name:'Good.md',mimeType:'text/plain',buffer:Buffer.from('# Good')},
    {name:'Wrong.txt',mimeType:'text/markdown',buffer:Buffer.from('not a Markdown extension')}]);
  await expect(page.locator('#workspaceNotice')).toContainText('Choose .md files only');
  await page.locator('#markdownFiles').setInputFiles({name:'Big.md',mimeType:'text/markdown',buffer:Buffer.alloc(800001)});
  await expect(page.locator('#workspaceNotice')).toContainText('800,000 bytes');
  await page.locator('#markdownFiles').setInputFiles({name:'Bad.md',mimeType:'text/markdown',buffer:Buffer.from([255])});
  await expect(page.locator('#workspaceNotice')).toContainText('not valid UTF-8');
  expect(await page.evaluate(async () => JSON.stringify(await Workspace.repository.snapshot()))).toBe(before);
  await expect(page.locator('#editor')).toBeEnabled();
  await expect(page.getByRole('tab')).toHaveCount(1);
});
test('dropped Markdown keeps sanitizer and per-image consent, and ordinary text drops keep native behavior', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  const requests:string[] = [];
  await page.route('https://tracking.example/**', route => route.fulfill({status:200,body:''}));
  page.on('request',request => { if(request.url().startsWith('https://tracking.example/')) requests.push(request.url()); });
  await dropMarkdown(page,'Untrusted.md','# Safe heading\n\n![Remote](https://tracking.example/pixel)\n\n' +
    '[Bad](javascript:alert%281%29)\n\n![Injected](x" onerror="window.hacked=true)\n\n<script>window.hacked=true</script>');
  await expect(page.locator('#preview h1')).toHaveText('Safe heading');
  expect(requests).toEqual([]);
  await expect(page.locator('#preview [onclick], #preview [onerror], #preview a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  const handled = await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.setData('text/plain','ordinary text');
    const event = new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true});
    document.body.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(handled).toBe(false);
  await page.getByRole('button',{name:'Load remote image: tracking.example'}).click();
  await expect.poll(() => requests.length).toBe(1);
});
test('drag feedback clears on leave, drops work at 320px, and storage errors never claim a successful import', async ({ page }) => {
  await page.setViewportSize({width:320,height:850});
  await page.goto('/'); await page.waitForFunction(() => Boolean(globalThis.Workspace));
  const transfer = await page.evaluateHandle(() => { const data = new DataTransfer();
    data.items.add(new File(['# Narrow'],'Narrow.md')); return data; });
  await page.dispatchEvent('body','dragenter',{dataTransfer:transfer});
  await expect(page.locator('#markdownDropHint')).toBeVisible();
  await page.dispatchEvent('body','dragleave',{dataTransfer:transfer});
  await expect(page.locator('#markdownDropHint')).toBeHidden(); await transfer.dispose();
  await dropMarkdown(page,'Narrow.md','# Narrow');
  await expect(page.locator('#preview h1')).toHaveText('Narrow');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { Workspace.repository.importDocuments = async () => {
    throw new DOMException('quota','QuotaExceededError'); }; });
  await dropMarkdown(page,'Failed.md','# Not saved');
  await expect(page.locator('#workspaceNotice')).toContainText("That didn't work. Your edits are still here; try again.");
  await expect(page.getByRole('tab',{name:'Failed.md'})).toHaveCount(0);
  await expect(page.locator('#editor')).toHaveValue('# Narrow');
  await expect(page.locator('#editor')).toBeEnabled();
});
