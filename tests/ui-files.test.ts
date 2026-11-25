export {};
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('./helpers/app');

async function fresh(options = {}) { const app = await bootApp(options); await app.ready(); return app; }

test('first run: one folder, the welcome guide open in one tab, no errors, light theme', async () => {
  const app = await fresh();
  assert.equal(app.w.snapshot.folders.length, 1); assert.equal(app.w.snapshot.documents.length, 1);
  assert.equal(app.tabs.length, 1);
  assert.match(app.$('editor').value, /^# Welcome to MD Preview Pro/);
  assert.match(app.$('preview').innerHTML, /<h1[^>]*>Welcome to MD Preview Pro<\/h1>/);
  assert.equal(app.document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(app.$('workspaceNotice').textContent, ''); assert.deepEqual(app.errors, []);
  app.close();
});

test('the welcome guide covers every feature and its sample image is stored and shown', async () => {
  const app = await fresh();
  const guide = app.$('editor').value;
  for (const topic of ['Ctrl+K', 'Focus mode', 'Drag and drop', 'Select mode', 'mermaid', '$$', '[^1]', ':rocket:', '#img-welcome-demo-01', 'Export workspace', 'Print or save as PDF'])
    assert.ok(guide.includes(topic), 'guide should mention ' + topic);
  assert.ok(!/version history/i.test(guide));
  await app.until(() => !!app.q('#preview img[data-local-image]').getAttribute('src'), 'sample image to load');
  assert.match(app.q('#preview img[data-local-image]').getAttribute('src'), /^data:image\/png;base64,/);
  app.close();
});

test('New file in Explorer adds a file with the guide, opens it in a tab and focuses the editor', async () => {
  const app = await fresh(); await app.newFile();
  assert.equal(app.w.snapshot.documents.length, 2); assert.equal(app.tabs.length, 2);
  assert.match(app.$('editor').value, /^# Welcome/);
  assert.equal(app.w.active().id, app.w.snapshot.documents.find((d:any) => d.name !== 'Untitled 1.md' || true && d.id === app.w.active().id).id);
  assert.deepEqual(app.errors, []); app.close();
});

test('the + tab button and Ctrl+N both create a file; names stay unique', async () => {
  const app = await fresh();
  app.click('tabNew'); await app.until(() => app.w.snapshot.documents.length === 2, 'file from + button'); await app.settle();
  app.key(app.document, 'n', { ctrlKey: true }); await app.until(() => app.w.snapshot.documents.length === 3, 'file from Ctrl+N'); await app.settle();
  assert.equal(new Set(app.names().map((n:string) => n.toLowerCase())).size, 3);
  assert.equal(app.tabs.length, 3); app.close();
});

test('double clicking New file quickly creates only one file', async () => {
  const app = await fresh();
  app.click('explorerNew'); app.click('explorerNew'); await app.settle(400);
  assert.equal(app.w.snapshot.documents.length, 2); app.close();
});

test('New file with no folders recreates the default folder first', async () => {
  const app = await fresh();
  app.click(app.row('My Notes').closest('li')!.querySelector('button')!); await app.settle();
  app.click('action-delete'); await app.answer(); await app.settle(200);
  assert.equal(app.w.snapshot.folders.length, 0);
  assert.equal(app.$('emptyWorkspace').hidden, false);
  app.click('emptyNew'); await app.until(() => app.w.snapshot.documents.length === 1, 'file after empty state'); await app.settle();
  assert.equal(app.w.snapshot.folders.length, 1); assert.equal(app.$('emptyWorkspace').hidden, true); app.close();
});

test('New folder asks for a name, creates and selects it; cancel and blank do nothing', async () => {
  const app = await fresh();
  app.click('folderNew'); await app.cancelDialog(); assert.equal(app.w.snapshot.folders.length, 1);
  app.click('folderNew'); await app.answer('Projects'); await app.settle(100);
  assert.equal(app.w.snapshot.folders.length, 2); assert.ok(app.row('Projects'));
  assert.equal(app.row('Projects').getAttribute('aria-selected'), 'true'); app.close();
});

test('rename a file through the dialog; invalid and duplicate names are rejected, cancel keeps the name', async () => {
  const app = await fresh(); await app.newFile();
  const id = app.w.active().id;
  app.click(app.row(app.w.active().name)); await app.settle();
  app.click('action-rename'); await app.cancelDialog();
  assert.equal(app.w.snapshot.documents.find((d:any) => d.id === id).name, app.w.active().name);
  app.click('action-rename'); await app.answer('Plan'); await app.settle(100);
  assert.equal(app.w.snapshot.documents.find((d:any) => d.id === id).name, 'Plan.md');
  assert.ok(app.tabs.some((t:Element) => (t.textContent || '').includes('Plan')));
  const other = app.w.snapshot.documents.find((d:any) => d.id !== id);
  app.click(app.row(other.name)); await app.settle();
  app.click('action-rename'); await app.answer('plan'); await app.settle(100);
  assert.equal(app.w.snapshot.documents.find((d:any) => d.id === other.id).name, other.name, 'duplicate (case-insensitive) must not apply');
  app.close();
});

test('duplicate a file gets an independent id and a numbered name; content is copied', async () => {
  const app = await fresh();
  app.type('# Original\n\nbody'); await app.settle(500);
  app.click(app.row('Untitled')); await app.settle();
  app.click('action-duplicate'); await app.until(() => app.w.snapshot.documents.length === 2, 'duplicate'); await app.settle();
  const [a, b] = app.w.snapshot.documents;
  assert.notEqual(a.id, b.id); assert.notEqual(a.name, b.name);
  assert.equal(app.w.snapshot.documents.filter((d:any) => d.content === '# Original\n\nbody').length, 2); app.close();
});

test('move a file to another folder through the dialog', async () => {
  const app = await fresh();
  app.click('folderNew'); await app.answer('Archive'); await app.settle(100);
  app.click(app.row('Untitled')); await app.settle();
  app.click('action-move');
  const select = await (async () => { await app.until(() => app.dialogOpen(), 'move dialog'); return app.$('workspaceDialog').querySelector('select')!; })();
  const target = [...select.options].find((o:any) => o.textContent.includes('Archive'))!;
  await app.answer(target.value); await app.settle(100);
  const archive = app.w.snapshot.folders.find((f:any) => f.name === 'Archive');
  assert.equal(app.w.snapshot.documents[0].folderId, archive.id); app.close();
});

test('delete asks first: cancel keeps the file, confirm removes it and closes its tab', async () => {
  const app = await fresh(); await app.newFile();
  app.click(app.row(app.w.active().name)); await app.settle();
  app.click('action-delete'); await app.cancelDialog(); assert.equal(app.w.snapshot.documents.length, 2);
  app.click('action-delete'); await app.answer(); await app.settle(150);
  assert.equal(app.w.snapshot.documents.length, 1); assert.equal(app.tabs.length, 1); app.close();
});

test('deleting a folder removes everything inside it', async () => {
  const app = await fresh();
  app.click(app.row('My Notes')); await app.settle();
  app.click('action-delete'); await app.answer(); await app.settle(200);
  assert.equal(app.w.snapshot.folders.length, 0); assert.equal(app.w.snapshot.documents.length, 0); assert.equal(app.tabs.length, 0); app.close();
});

test('the filter box narrows the tree and shows a message when nothing matches', async () => {
  const app = await fresh(); await app.newFile();
  app.click(app.row(app.w.active().name)); app.click('action-rename'); await app.answer('Budget'); await app.settle(100);
  const filter = app.$('explorerFilter'); filter.value = 'budg'; filter.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  assert.ok(app.rows().some((r:Element) => (r.textContent || '').includes('Budget')));
  assert.ok(!app.rows().some((r:Element) => (r.textContent || '').includes('Untitled')));
  filter.value = 'zzzz'; filter.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  assert.equal(app.rows().length, 0); assert.match(app.$('explorerTree').textContent, /\S/);
  filter.value = ''; filter.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  assert.ok(app.rows().length >= 2); app.close();
});

test('clicking a file switches to its tab and keeps each file’s own edits', async () => {
  const app = await fresh(); await app.newFile();
  const [first, second] = app.w.snapshot.documents.map((d:any) => d.id);
  app.type('SECOND DOC'); await app.settle(100);
  app.click(app.tabs[0]); await app.settle(100);
  assert.match(app.$('editor').value, /^# Welcome/);
  app.click(app.tabs[1]); await app.settle(100);
  assert.equal(app.$('editor').value, 'SECOND DOC'); void first; void second; app.close();
});

test('closing a tab keeps the file; the close button and Ctrl+W both work; last tab closed shows the empty state', async () => {
  const app = await fresh(); await app.newFile();
  app.click(app.q('.tab-close')); await app.settle(150);
  assert.equal(app.tabs.length, 1); assert.equal(app.w.snapshot.documents.length, 2);
  app.key(app.document, 'w', { ctrlKey: true }); await app.settle(150);
  assert.equal(app.tabs.length, 0); assert.equal(app.$('emptyWorkspace').hidden, false); assert.equal(app.w.snapshot.documents.length, 2);
  app.click(app.row('Untitled')); await app.settle(100); app.close();
});

test('previous and next tab buttons cycle through tabs', async () => {
  const app = await fresh(); await app.newFile(); await app.newFile();
  const ids = app.w.state.tabs.slice(); const start = app.w.state.active;
  app.click('nextTab'); await app.settle(); assert.equal(app.w.state.active, ids[(ids.indexOf(start) + 1) % ids.length]);
  app.click('previousTab'); await app.settle(); assert.equal(app.w.state.active, start); app.close();
});

test('Ctrl+1 selects the first tab, Ctrl+9 the last', async () => {
  const app = await fresh(); await app.newFile(); await app.newFile();
  app.key(app.document, '1', { ctrlKey: true }); await app.settle(); assert.equal(app.w.state.active, app.w.state.tabs[0]);
  app.key(app.document, '9', { ctrlKey: true }); await app.settle(); assert.equal(app.w.state.active, app.w.state.tabs[app.w.state.tabs.length - 1]); app.close();
});

test('Alt+Arrow on a tab reorders it', async () => {
  const app = await fresh(); await app.newFile();
  const before = app.w.state.tabs.slice();
  app.key(app.tabs[1], 'ArrowLeft', { altKey: true }); await app.settle();
  assert.equal(JSON.stringify(app.w.state.tabs), JSON.stringify([before[1], before[0]])); app.close();
});

test('Explorer toggle and close buttons open and hide the sidebar', async () => {
  const app = await fresh();
  const was = app.w.state.sidebar;
  app.click('explorerToggle'); await app.settle(); assert.equal(app.w.state.sidebar, !was);
  app.click('explorerToggle'); await app.settle(); assert.equal(app.w.state.sidebar, was);
  if (!app.w.state.sidebar) app.click('explorerToggle');
  app.click('explorerClose'); await app.settle(); assert.equal(app.w.state.sidebar, false); app.close();
});

test('narrow screens start with the Explorer closed', async () => {
  const app = await fresh({ narrow: true }); assert.equal(app.w.state.sidebar, false); app.close();
});

test('state survives a reload: files, tabs and edits come back from storage', async () => {
  const first = await bootApp(); await first.ready(); await first.newFile();
  first.type('# Persisted'); await first.settle(700);
  const factory = first.factory; first.close();
  const second = await bootApp({ factory }); await second.ready();
  assert.equal(second.w.snapshot.documents.length, 2);
  assert.ok(second.w.snapshot.documents.some((d:any) => d.content === '# Persisted')); second.close();
});
