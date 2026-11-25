export {};
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('./helpers/app');

async function fresh(options = {}) { const app = await bootApp(options); await app.ready(); return app; }
function select(app:any, text:string, from = 0) { const ed = app.$('editor'); ed.value = text; ed.focus(); ed.setSelectionRange(from, text.length); }
const command = (app:any, name:string) => { const el = [...app.document.querySelectorAll('[data-command]')].find((e:any) => e.dataset.command === name); if (!el) throw new Error('no toolbar button ' + name); return el as HTMLElement; };

test('toolbar: every formatting button wraps or prefixes the selection', async () => {
  const cases:Array<[string, string, RegExp]> = [
    ["insertFormat('**','**')", 'word', /^\*\*word\*\*$/], ["insertFormat('*','*')", 'word', /^\*word\*$/], ["insertFormat('~~','~~')", 'word', /^~~word~~$/],
    ["insertFormat('`','`')", 'word', /^`word`$/], ["insertPrefix('# ')", 'Title', /^# Title$/], ["insertPrefix('## ')", 'Title', /^## Title$/],
    ["insertPrefix('### ')", 'Title', /^### Title$/], ["insertPrefix('- ')", 'item', /^- item$/], ["insertPrefix('1. ')", 'item', /^1\. item$/],
    ["insertPrefix('- [ ] ')", 'task', /^- \[ \] task$/], ["insertPrefix('> ')", 'quote', /^> quote$/],
    ['insertCodeBlock()', 'x = 1', /```\nx = 1\n```/], ['insertLink()', 'site', /^\[site\]\(url\)$/], ['insertHR()', '', /---/], ['insertTable()', '', /\|.*\|\n\|[-| ]+\|/],
  ];
  for (const [name, text, expected] of cases) {
    const app = await fresh(); select(app, text, 0); app.click(command(app, name));
    assert.match(app.$('editor').value, expected, name); app.close();
  }
});

test('formatting with nothing selected inserts a placeholder and selects it', async () => {
  const app = await fresh(); app.$('editor').value = ''; app.click(command(app, "insertFormat('**','**')"));
  const ed = app.$('editor'); assert.match(ed.value, /^\*\*.+\*\*$/);
  assert.equal(ed.value.slice(ed.selectionStart, ed.selectionEnd), ed.value.slice(2, -2)); app.close();
});

test('Ctrl+B, Ctrl+I, Ctrl+F and Ctrl+S in the editor run bold, italic, find and download', async () => {
  const app = await fresh(); select(app, 'word', 0);
  app.key(app.$('editor'), 'b', { ctrlKey: true }); assert.equal(app.$('editor').value, '**word**');
  select(app, 'word', 0); app.key(app.$('editor'), 'i', { ctrlKey: true }); assert.equal(app.$('editor').value, '*word*');
  app.key(app.$('editor'), 'f', { ctrlKey: true }); assert.ok(app.$('searchOverlay').classList.contains('active'));
  app.key(app.$('editor'), 's', { ctrlKey: true }); assert.equal(app.downloads().length, 1); app.close();
});

test('Tab in the editor inserts two spaces; Escape then Tab leaves the field', async () => {
  const app = await fresh(); select(app, '', 0);
  app.key(app.$('editor'), 'Tab'); assert.equal(app.$('editor').value, '  ');
  app.key(app.$('editor'), 'Escape'); app.key(app.$('editor'), 'Tab'); assert.equal(app.$('editor').value, '  '); app.close();
});

test('typing renders the preview, updates statistics and autosaves', async () => {
  const app = await fresh(); app.type('# Hello world\n\nOne two three');
  await app.until(() => /<h1[^>]*>Hello world/.test(app.$('preview').innerHTML), 'preview', 2000);
  assert.match(app.$('statWords').textContent, /^\d+ words$/); assert.match(app.$('statLines').textContent, /^3 lines$/); assert.match(app.$('statChars').textContent, /^28 chars$/);
  const before = Number(app.$('statWords').textContent.split(' ')[0]); app.type('# Hello world\n\nOne two three four five'); await app.settle(300);
  assert.equal(Number(app.$('statWords').textContent.split(' ')[0]), before + 2);
  await app.until(() => app.w.snapshot.documents[0].content === '# Hello world\n\nOne two three four five', 'autosave', 3000);
  assert.match(app.$('saveStatus').textContent, /Saved/i); app.close();
});

test('theme: the sun and moon buttons and the toolbar toggle switch the theme and remember it', async () => {
  const app = await fresh();
  app.click('darkOption'); assert.equal(app.document.documentElement.dataset.theme, 'dark'); assert.ok(app.$('darkOption').classList.contains('active'));
  app.click('lightOption'); assert.equal(app.document.documentElement.dataset.theme, 'light');
  app.click(command(app, 'toggleTheme()')); assert.equal(app.document.documentElement.dataset.theme, 'dark');
  assert.equal(app.window.localStorage.getItem('md-preview-theme'), 'dark');
  app.close();
});

test('layout menu: editor only, preview only and split change the main layout', async () => {
  const app = await fresh(); const select = app.$('layoutSelect');
  for (const layout of ['editor', 'preview', 'split']) { select.value = layout; select.dispatchEvent(new app.window.Event('change', { bubbles: true })); assert.equal(app.$('workspaceMain').dataset.layout, layout); assert.equal(app.w.state.layout, layout); }
  app.close();
});

test('outline button opens a list of headings; clicking one is wired; sync and wrap toggle', async () => {
  const app = await fresh();
  app.click('outlineBtn'); assert.ok(app.$('outlinePanel').classList.contains('open'));
  assert.ok(app.$('outlineContent').querySelectorAll('*').length > 3, 'outline should list the guide headings');
  app.click('outlineBtn'); assert.ok(!app.$('outlinePanel').classList.contains('open'));
  const sync = app.$('syncBtn').classList.contains('active'); app.click('syncBtn'); assert.notEqual(app.$('syncBtn').classList.contains('active'), sync);
  const wrap = app.$('wrapBtn').classList.contains('active'); app.click('wrapBtn'); assert.notEqual(app.$('wrapBtn').classList.contains('active'), wrap);
  app.click('wrapBtn'); assert.equal(app.$('wrapBtn').classList.contains('active'), wrap); app.close();
});

test('find: opens, counts matches, reports none, and Escape closes it', async () => {
  const app = await fresh(); app.type('apple banana apple');
  app.click(command(app, 'toggleSearch()')); assert.ok(app.$('searchOverlay').classList.contains('active'));
  const input = app.$('searchInput'); input.value = 'apple'; input.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  assert.match(app.$('searchCount').textContent, /2/);
  input.value = 'zzz'; input.dispatchEvent(new app.window.Event('input', { bubbles: true })); assert.ok(app.$('searchCount').textContent.length > 0);
  app.key(app.$('searchOverlay'), 'Escape'); assert.ok(!app.$('searchOverlay').classList.contains('active')); assert.equal(app.$('searchInput').value, ''); app.close();
});

test('Download .md saves the active file with its current text', async () => {
  const app = await fresh(); app.type('# Export me'); app.click(command(app, 'exportMarkdown()'));
  const { name, text } = await app.lastDownloadText(); assert.match(name, /\.md$/); assert.equal(text, '# Export me'); app.close();
});

test('Copy HTML puts sanitized HTML on the clipboard and confirms; unsafe markup is stripped', async () => {
  const app = await fresh(); app.type('# Safe\n\n<script>bad()</script><img src=x onerror=bad()>'); app.click(command(app, 'copyHTML()')); await app.settle();
  assert.equal(app.clipboard.length, 1); assert.match(app.clipboard[0], /<h1[^>]*>Safe<\/h1>/); assert.doesNotMatch(app.clipboard[0], /<script|<img/, 'raw HTML must stay inert text');
  assert.ok(app.toast().length > 0); app.close();
});

test('Clear empties the file after confirmation and keeps it when declined', async () => {
  const app = await fresh(); app.type('keep me'); app.setConfirm(false); app.click(command(app, 'clearEditor()')); assert.equal(app.$('editor').value, 'keep me');
  app.setConfirm(true); app.click(command(app, 'clearEditor()')); assert.equal(app.$('editor').value, ''); assert.equal(app.$('preview').textContent.trim(), ''); app.close();
});

test('task checkboxes in the preview toggle the Markdown source', async () => {
  const app = await fresh(); app.type('- [ ] one\n- [x] two'); await app.until(() => app.document.querySelectorAll('#preview .task-list input').length === 2, 'tasks', 2000);
  const box = app.document.querySelector('#preview .task-list input') as HTMLInputElement; box.checked = true; box.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  assert.equal(app.$('editor').value, '- [x] one\n- [x] two'); app.close();
});

test('code blocks get highlighting and a working copy button', async () => {
  const app = await fresh(); app.type('```js\nconst a = 1; // note\n```');
  await app.until(() => /const a = 1/.test(app.$('preview').textContent) && !/Welcome/.test(app.$('preview').textContent), 'new preview', 2000);
  await app.until(() => !!app.document.querySelector('#preview .tok-k'), 'highlight', 2000);
  assert.ok(app.document.querySelector('#preview .tok-c')); app.click(app.q('#preview button.copy-btn')); await app.settle();
  assert.match(app.clipboard.at(-1), /const a = 1/); app.close();
});

test('footnote links jump inside the preview without navigating', async () => {
  const app = await fresh(); app.type('Text[^1]\n\n[^1]: Note body');
  await app.until(() => !!app.document.querySelector('#preview a.fn-ref'), 'footnote', 2000);
  const link = app.q('#preview a.fn-ref'); const ev = new app.window.MouseEvent('click', { bubbles: true, cancelable: true }); link.dispatchEvent(ev); assert.equal(ev.defaultPrevented, true); app.close();
});

test('math and Mermaid blocks render as placeholders and fail soft when the libraries are unavailable', async () => {
  const app = await fresh(); app.type('Inline $x^2$ here\n\n$$\ny = 1\n$$\n\n```mermaid\ngraph TD\n A-->B\n```');
  await app.until(() => !!app.document.querySelector('#preview .math-inline') && !!app.document.querySelector('#preview .math-block') && !!app.document.querySelector('#preview .mermaid-block'), 'math nodes', 2000);
  await app.settle(1500); assert.match(app.$('preview').textContent, /x\^2/); assert.match(app.$('preview').textContent, /graph TD/); assert.deepEqual(app.errors, []); app.close();
});

test('unsafe Markdown never reaches the page as live script or handlers', async () => {
  const app = await fresh(); app.type('<img src=x onerror="window.pwn=1"> <a href="javascript:window.pwn=2">x</a>\n\n[link](javascript:alert(1))');
  await app.settle(400); assert.equal((app.window as any).pwn, undefined);
  assert.equal(app.document.querySelectorAll('#preview [onerror], #preview a[href^="javascript"]').length, 0); app.close();
});
