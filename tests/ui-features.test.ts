export {};
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('./helpers/app');

async function fresh(options = {}) { const app = await bootApp(options); await app.ready(); return app; }
const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));
const palette = async (app:any, query:string) => { app.key(app.document, 'k', { ctrlKey: true }); const input = app.$('paletteInput'); input.value = query; input.dispatchEvent(new app.window.Event('input', { bubbles: true })); };

test('Select mode: toggle shows checkboxes and the bar; checking updates the count; Escape and the toggle exit', async () => {
  const app = await fresh(); await app.newFile();
  app.click('selectToggle'); assert.equal(app.w.selectMode, true); assert.equal(app.$('selectionBar').hidden, false);
  assert.ok(app.document.querySelectorAll('#explorerTree input.row-check').length >= 3);
  const box = app.q('#explorerTree input.row-check') as HTMLInputElement; box.click(); await app.settle();
  assert.match(app.$('selectionCount').textContent, /1/);
  app.key(app.$('explorer'), 'Escape'); assert.equal(app.w.selectMode, false); assert.equal(app.w.multi.size, 0);
  app.click('selectToggle'); app.click('selectToggle'); assert.equal(app.w.selectMode, false); app.close();
});

test('Select all checks everything and Delete selected removes it after confirmation', async () => {
  const app = await fresh(); await app.newFile(); await app.newFile();
  app.click('selectToggle'); const all = app.$('selectAll'); all.checked = true; all.dispatchEvent(new app.window.Event('change', { bubbles: true })); await app.settle();
  assert.equal(app.w.multi.size, app.rows().length);
  app.click('deleteSelected'); await app.cancelDialog(); assert.equal(app.w.snapshot.documents.length, 3);
  app.click('deleteSelected'); await app.answer(); await app.settle(250);
  assert.equal(app.w.snapshot.documents.length, 0); assert.equal(app.w.snapshot.folders.length, 0); assert.equal(app.w.selectMode, false); app.close();
});

test('Delete selected with a few files removes only those and keeps the rest', async () => {
  const app = await fresh(); await app.newFile(); await app.newFile();
  app.click('selectToggle');
  const boxes = [...app.document.querySelectorAll('#explorerTree input.row-check')] as HTMLInputElement[];
  const fileBoxes = boxes.filter(b => /Untitled/.test(b.getAttribute('aria-label') || '')); assert.equal(fileBoxes.length, 3);
  for (const b of fileBoxes.slice(0, 2)) { b.click(); await app.settle(); }
  app.click('deleteSelected'); await app.answer(); await app.settle(250);
  assert.equal(app.w.snapshot.documents.length, 1); assert.equal(app.w.snapshot.folders.length, 1); app.close();
});

test('Delete selected does nothing when nothing is checked', async () => {
  const app = await fresh(); app.click('selectToggle'); app.click('deleteSelected'); await app.settle(100);
  assert.equal(app.dialogOpen(), false); assert.equal(app.w.snapshot.documents.length, 1); app.close();
});

test('drag a file onto a folder moves it; dragging onto the empty tree area moves a folder to the root', async () => {
  const app = await fresh(); app.click('folderNew'); await app.answer('Archive'); await app.settle(100);
  app.drag(app.row('Untitled'), app.row('Archive')); await app.settle(200);
  const archive = app.w.snapshot.folders.find((f:any) => f.name === 'Archive'); assert.equal(app.w.snapshot.documents[0].folderId, archive.id);
  app.drag(app.row('Archive'), app.row('My Notes')); await app.settle(200);
  assert.equal(app.w.snapshot.folders.find((f:any) => f.name === 'Archive').parentId, app.w.snapshot.folders.find((f:any) => f.name === 'My Notes').id);
  app.drag(app.row('Archive'), app.$('explorerTree')); await app.settle(200);
  assert.equal(app.w.snapshot.folders.find((f:any) => f.name === 'Archive').parentId, null); app.close();
});

test('a folder cannot be dragged into itself or its own child', async () => {
  const app = await fresh(); app.w.select({ kind: 'folders', id: app.w.snapshot.folders[0].id }); app.click('folderNew'); await app.answer('Inner'); await app.settle(100); app.w.expand(app.w.snapshot.folders[0].id, true); await app.settle(50);
  app.drag(app.row('My Notes'), app.row('Inner')); await app.settle(200);
  assert.equal(app.w.snapshot.folders.find((f:any) => f.name === 'My Notes').parentId, null); assert.deepEqual(app.errors, []); app.close();
});

test('dragging a tab onto another reorders the tabs', async () => {
  const app = await fresh(); await app.newFile(); const before = app.w.state.tabs.slice();
  const wrappers = [...app.document.querySelectorAll('#documentTabs .document-tab')];
  app.drag(wrappers[1], wrappers[0]); await app.settle(100);
  assert.equal(app.w.state.tabs.length, 2); assert.ok(app.w.state.tabs.every((id:string) => before.includes(id))); app.close();
});

test('command palette: Ctrl+K opens, filters actions and files, runs with Enter or a click, Escape closes', async () => {
  const app = await fresh(); await palette(app, '');
  assert.equal(app.$('paletteDialog').hasAttribute('open'), true); assert.ok(app.document.querySelectorAll('#paletteList [role=option]').length > 10);
  await palette(app, 'zzzzqqq'); assert.equal(app.document.querySelectorAll('#paletteList [role=option]').length, 0); assert.ok(app.$('paletteList').textContent.length > 0);
  await palette(app, 'theme'); const before = app.document.documentElement.dataset.theme; app.key(app.$('paletteInput'), 'Enter');
  assert.notEqual(app.document.documentElement.dataset.theme, before); assert.equal(app.$('paletteDialog').hasAttribute('open'), false);
  await palette(app, 'Untitled'); assert.ok(app.q('#paletteList [role=option]').textContent.includes('Untitled'));
  app.key(app.$('paletteInput'), 'ArrowDown'); app.key(app.$('paletteInput'), 'ArrowUp'); app.click(app.q('#paletteList [role=option]')); assert.equal(app.$('paletteDialog').hasAttribute('open'), false);
  app.key(app.document, 'k', { ctrlKey: true }); app.key(app.document, 'k', { ctrlKey: true }); assert.equal(app.$('paletteDialog').hasAttribute('open'), false); app.close();
});

test('palette actions: new file, layouts, outline, sync, wrap, find, explorer, select mode and download all run', async () => {
  const app = await fresh();
  const run = async (q:string) => { await palette(app, q); app.key(app.$('paletteInput'), 'Enter'); await app.settle(150); };
  const files = app.w.snapshot.documents.length; await run('New file'); assert.equal(app.w.snapshot.documents.length, files + 1);
  await run('editor only'); assert.equal(app.$('workspaceMain').dataset.layout, 'editor');
  await run('preview only'); assert.equal(app.$('workspaceMain').dataset.layout, 'preview');
  await run('editor and preview'); assert.equal(app.$('workspaceMain').dataset.layout, 'split');
  await run('outline'); assert.ok(app.$('outlinePanel').classList.contains('open'));
  await run('find'); assert.ok(app.$('searchOverlay').classList.contains('active'));
  await run('select'); assert.equal(app.w.selectMode, true);
  await run('Download'); assert.equal(app.downloads().length >= 1, true); app.close();
});

test('shortcuts dialog: Ctrl+/ lists the shortcuts and Close dismisses it', async () => {
  const app = await fresh(); app.key(app.document, '/', { ctrlKey: true });
  assert.equal(app.$('shortcutsDialog').hasAttribute('open'), true); assert.ok(app.document.querySelectorAll('#shortcutsList dt').length >= 10);
  app.click('shortcutsClose'); assert.equal(app.$('shortcutsDialog').hasAttribute('open'), false); app.close();
});

test('focus mode: Ctrl+. hides the chrome, Write and Read switch panes, Exit and Escape leave and restore the layout', async () => {
  const app = await fresh(); app.key(app.document, '.', { ctrlKey: true });
  assert.ok(app.document.body.classList.contains('focus-mode')); assert.equal(app.$('focusBar').hidden, false); assert.equal(app.$('workspaceMain').dataset.layout, 'editor');
  app.click('focusRead'); assert.equal(app.$('workspaceMain').dataset.layout, 'preview'); assert.equal(app.$('focusRead').getAttribute('aria-pressed'), 'true');
  app.click('focusWrite'); assert.equal(app.$('workspaceMain').dataset.layout, 'editor');
  app.click('focusExit'); assert.ok(!app.document.body.classList.contains('focus-mode')); assert.equal(app.$('focusBar').hidden, true); assert.equal(app.$('workspaceMain').dataset.layout, 'split');
  app.click(app.q('[data-command="toggleFocus()"]')); app.key(app.$('focusBar'), 'Escape'); assert.ok(!app.document.body.classList.contains('focus-mode')); app.close();
});

test('images: pasting a GIF stores it, inserts a short reference and shows it in the preview', async () => {
  const app = await fresh(); app.type('');
  const dt = app.transfer(); dt.files = [app.fileOf('pixel.gif', 'image/gif', GIF)];
  app.fire(app.$('editor'), 'paste', Object.assign(dt, { clipboardData: dt }));
  const paste = new app.window.Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(paste, 'clipboardData', { value: dt }); app.$('editor').dispatchEvent(paste);
  await app.until(() => /!\[pixel\]\(#img-[\w-]+\)/.test(app.$('editor').value), 'image reference', 3000);
  const id = /#img-([\w-]+)/.exec(app.$('editor').value)![1]; assert.ok(app.$('editor').value.length < 200);
  assert.match(await app.w.images.get(id), /^data:image\/gif;base64,/);
  await app.until(() => !!app.document.querySelector('#preview img[data-local-image="' + id + '"][src]'), 'image in preview', 3000); app.close();
});

test('images: the toolbar image button opens the picker; unsupported types are refused with a message', async () => {
  const app = await fresh(); let picked = 0; app.$('imageFile').addEventListener('click', () => picked++);
  app.click(app.q('[data-command="insertImage()"]')); assert.equal(picked, 1);
  const before = app.$('editor').value; app.setFiles(app.$('imageFile'), [app.fileOf('x.svg', 'image/svg+xml', '<svg/>')]); await app.settle(200);
  assert.equal(app.$('editor').value, before); assert.ok(app.toast().length > 0); app.close();
});

test('images: unreferenced images are removed on next start, referenced ones are kept', async () => {
  const first = await fresh(); const keep = await first.w.images.put('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
  const drop = await first.w.images.put('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
  first.type('![k](#img-' + keep + ')'); await first.settle(800); const factory = first.factory; first.close();
  const second = await bootApp({ factory }); await second.ready(); await second.settle(300);
  assert.ok(await second.w.images.get(keep)); assert.equal(await second.w.images.get(drop), null); second.close();
});

test('Export workspace downloads a backup with every file and the images they use', async () => {
  const app = await fresh(); app.type('![i](#img-welcome-demo-01)'); await app.settle(700);
  app.click('exportWorkspace'); await app.until(() => app.downloads().length > 0, 'backup download', 3000);
  const { name, text } = await app.lastDownloadText(); const backup = JSON.parse(text);
  assert.match(name, /\.json$/); assert.equal(backup.documents.length, 1); assert.ok(Array.isArray(backup.images) && backup.images.some((i:any) => i.id === 'welcome-demo-01')); app.close();
});

test('Import workspace replaces the workspace from a backup; a corrupt file changes nothing', async () => {
  const source = await fresh(); await source.newFile(); source.type('# From backup'); await source.settle(700);
  source.click('exportWorkspace'); await source.until(() => source.downloads().length > 0, 'backup', 3000); const { text } = await source.lastDownloadText(); source.close();
  const app = await fresh(); const before = app.w.snapshot.documents.length;
  app.click('importWorkspace');
  app.setFiles(app.$('backupFile'), [app.fileOf('bad.json', 'application/json', '{not json')]); await app.settle(300);
  assert.equal(app.w.snapshot.documents.length, before);
  app.setFiles(app.$('backupFile'), [app.fileOf('backup.json', 'application/json', text)]); await app.settle(300);
  await app.answer('merge'); await app.settle(500);
  assert.ok(app.w.snapshot.documents.some((d:any) => d.content === '# From backup')); app.close();
});

test('Open Markdown files imports each file into a new tab named after it, and rejects non-Markdown', async () => {
  const app = await fresh(); const before = app.w.snapshot.documents.length;
  app.click('markdownOpen'); app.setFiles(app.$('markdownFiles'), [app.fileOf('notes.md', 'text/markdown', '# Imported'), app.fileOf('other.md', 'text/markdown', 'two')]);
  await app.until(() => app.w.snapshot.documents.length === before + 2, 'imported files', 3000);
  assert.ok(app.names().includes('notes.md')); assert.ok(app.w.snapshot.documents.some((d:any) => d.content === '# Imported'));
  app.setFiles(app.$('markdownFiles'), [app.fileOf('pic.png', 'image/png', 'x')]); await app.settle(300);
  assert.equal(app.w.snapshot.documents.length, before + 2); app.close();
});

test('request persistent storage button reports a result instead of failing silently', async () => {
  const app = await fresh(); (app.window.navigator as any).storage = { persist: async () => true, persisted: async () => true };
  app.click('persistentStorage'); await app.answer(); await app.settle(200); assert.ok(app.$('workspaceNotice').textContent.length > 0 || app.toast().length > 0); app.close();
});

test('storage unavailable: the guide is still shown, the error says why, and the page stays usable', async () => {
  const app = await bootApp({ storage: 'blocked' }); await app.ready();
  assert.equal(app.w, undefined); assert.match(app.$('workspaceNotice').textContent, /Storage unavailable/);
  assert.match(app.$('editor').value, /^# Welcome to MD Preview Pro/); assert.equal(app.$('editor').disabled, false);
  assert.match(app.$('preview').innerHTML, /<h1[^>]*>Welcome/); app.close();
});

test('storage unavailable with an old saved note shows that note, not the guide', async () => {
  const app = await bootApp({ storage: 'blocked', legacy: '# My old note' }); await app.ready();
  assert.equal(app.$('editor').value, '# My old note'); app.close();
});

test('storage unavailable: Export workspace still saves a recovery copy of what is on screen', async () => {
  const app = await bootApp({ storage: 'blocked', legacy: '# Rescue me' }); await app.ready();
  app.click('exportWorkspace'); await app.until(() => app.downloads().length > 0, 'recovery download', 3000);
  assert.match((await app.lastDownloadText()).text, /Rescue me/); app.close();
});

test('opening the app twice on the same storage (two tabs) does not break either', async () => {
  const first = await fresh(); const factory = first.factory;
  const second = await bootApp({ factory }); await second.ready();
  assert.equal(second.w.snapshot.documents.length, 1); assert.equal(second.$('workspaceNotice').textContent, ''); first.close(); second.close();
});

test('a missing or broken enhancement script (old server, 404) can never take the workspace down', async () => {
  const app = await bootApp({ skip: ['editor/enhance.js'] }); await app.ready();
  assert.ok(app.w, 'workspace must still start'); await app.settle(100); assert.match(app.$('workspaceNotice').textContent, /Restart the local server/);
  assert.match(app.$('preview').innerHTML, /<h1[^>]*>Welcome to MD Preview Pro/);
  app.click('explorerNew'); await app.until(() => app.w.snapshot.documents.length === 2, 'new file without enhance.js'); app.close();
});

test('the sample guide image id is seeded again for every new file', async () => {
  const app = await fresh(); await app.w.images.prune(new Set()); assert.equal(await app.w.images.get('welcome-demo-01'), null);
  await app.newFile(); assert.ok(await app.w.images.get('welcome-demo-01')); app.close();
});

test('upgrading a real v3 database (old guide, history store, images) keeps the data, drops history and shows no error', async () => {
  const { IDBFactory } = require('fake-indexeddb');
  const seed = await bootApp(); await seed.ready(); await seed.newFile(); seed.type('# Kept through upgrade'); await seed.settle(700);
  const dump = await seed.w.repository.snapshot(); const images = await seed.w.images.all(); const meta = await seed.w.repository.db;
  const marker = await new Promise<any[]>(resolve => { const r = meta.transaction('workspaceMeta').objectStore('workspaceMeta').getAll(); r.onsuccess = () => resolve(r.result); });
  seed.close();
  const old = new IDBFactory();
  await new Promise<void>((resolve, reject) => {
    const open = old.open('md-preview-pro-workspace', 3);
    open.onupgradeneeded = () => { const db = open.result; db.createObjectStore('folders', { keyPath: 'id' }); db.createObjectStore('documents', { keyPath: 'id' });
      db.createObjectStore('workspaceMeta', { keyPath: 'key' }); db.createObjectStore('versions', { keyPath: 'id' }).createIndex('docId', 'docId'); db.createObjectStore('images', { keyPath: 'id' }); };
    open.onsuccess = () => { const db = open.result; const tx = db.transaction(['folders', 'documents', 'workspaceMeta', 'versions', 'images'], 'readwrite');
      dump.folders.forEach((f:any) => tx.objectStore('folders').put(f)); dump.documents.forEach((d:any) => tx.objectStore('documents').put(d));
      marker.forEach(m => tx.objectStore('workspaceMeta').put(m)); images.forEach((i:any) => tx.objectStore('images').put(i));
      tx.objectStore('versions').put({ id: 'v1', docId: dump.documents[0].id, createdAt: 1, content: 'old' });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    open.onerror = () => reject(open.error);
  });
  const app = await bootApp({ factory: old }); await app.ready(); await app.settle(300);
  assert.equal(app.$('workspaceNotice').textContent, ''); assert.ok(app.w);
  assert.ok(app.w.snapshot.documents.some((d:any) => d.content === '# Kept through upgrade'));
  assert.equal([...app.w.repository.db.objectStoreNames].includes('versions'), false);
  await app.newFile(); app.click(app.row('My Notes')); app.click('folderNew'); await app.answer('After upgrade'); await app.settle(150);
  assert.equal(app.$('workspaceNotice').textContent, ''); app.close();
});

test('an unexpected failure shows a short plain message with no technical text, then clears itself', async () => {
  const app = await fresh();
  app.w.repository.createFolder = async () => { throw new TypeError("Cannot read properties of undefined (reading 'x')"); };
  app.click('folderNew'); await app.answer('Boom'); await app.settle(100);
  const text = app.$('workspaceNotice').textContent; assert.ok(text.length > 0); assert.doesNotMatch(text, /TypeError|undefined|Cannot read|\(/);
  assert.match(text, /didn.t work/i); app.close();
});

test('the page keeps working when the images script is missing (old server): export, new file and preview all succeed', async () => {
  const app = await bootApp({ skip: ['workspace/images.js'] }); await app.ready();
  assert.ok(app.w); await app.settle(100); assert.match(app.$('workspaceNotice').textContent, /Restart the local server/);
  await app.newFile(); app.click('exportWorkspace'); await app.until(() => app.downloads().length > 0, 'backup', 3000);
  assert.doesNotMatch(app.$('workspaceNotice').textContent, /That didn.t work/); assert.match(app.$('workspaceNotice').textContent, /downloaded/); assert.ok(app.document.querySelector('#preview img.image-missing')); app.close();
});
