/* Command palette, shortcut help, focus mode and page export. Runs after the editor scripts and reads their globals. */
interface PaletteItem { id:string; label:string; group:'files'|'actions'; hint?:string; run:()=>void; }
let focusMode = false;
let layoutBeforeFocus:string|null = null;

function paletteWorkspace() { return globalThis.Workspace; }
function setLayoutDirect(layout:string) {
  UI.html('workspaceMain').dataset.layout = layout;
  UI.select('layoutSelect').value = layout;
}
function chooseLayout(layout:'split'|'editor'|'preview') {
  const w = paletteWorkspace(); if (!w) return;
  w.state.layout = layout; setLayoutDirect(layout); w.persist();
}

function paletteActions():PaletteItem[] {
  const w = paletteWorkspace();
  const click = (id:string) => () => UI.html(id).click();
  const items:Array<[string,string,()=>void,string?]> = [
    ['cmd.newFile', 'new', () => { if (w) w.run(() => w.newFile(true)); }, 'Ctrl+N'],
    ['cmd.explorer', 'explorer', () => { if (w) w.sidebar(!w.state.sidebar); }],
    ['cmd.theme', 'theme', () => toggleTheme()],
    ['cmd.layoutSplit', 'ls', () => chooseLayout('split')],
    ['cmd.layoutEditor', 'le', () => chooseLayout('editor')],
    ['cmd.layoutPreview', 'lp', () => chooseLayout('preview')],
    ['cmd.focus', 'focus', () => toggleFocus(), 'Ctrl+.'],
    ['cmd.outline', 'outline', () => toggleOutline()],
    ['cmd.sync', 'sync', () => toggleSync()],
    ['cmd.wrap', 'wrap', () => toggleWrap()],
    ['cmd.find', 'find', () => toggleSearch(), 'Ctrl+F'],
    ['cmd.download', 'download', () => exportMarkdown(), 'Ctrl+S'],
    ['cmd.copyHtml', 'copy', () => copyHTML()],
    ['cmd.exportHtml', 'html', () => exportHtmlPage()],
    ['cmd.print', 'print', () => printPreview()],
    ['cmd.exportWorkspace', 'exp', click('exportWorkspace')],
    ['cmd.importWorkspace', 'imp', click('importWorkspace')],
    ['cmd.selectMode', 'select', () => { if (w) { w.sidebar(true); w.setSelectMode(true); } }],
    ['cmd.openMd', 'open', click('markdownOpen')],
    ['cmd.insertImage', 'image', click('imageFile')],
    ['cmd.shortcuts', 'keys', () => openShortcuts(), 'Ctrl+/'],
  ];
  return items.map(([key, id, run, hint]) => ({ id, label: Content.t(key), group: 'actions' as const, hint, run }));
}
function paletteFiles():PaletteItem[] {
  const w = paletteWorkspace(); if (!w) return [];
  const folders = new Map<string,string>(w.snapshot.folders.map(f => [f.id, f.name] as [string,string]));
  return w.snapshot.documents.map(d => ({ id: 'file-' + d.id, label: d.name, group: 'files' as const,
    hint: folders.get(d.folderId) || '', run: () => w.activate(d.id, true) }));
}
/** Subsequence match with a bonus for prefix and word starts. Returns -1 when the query is not contained. */
function paletteScore(label:string, query:string):number {
  if (!query) return 0;
  const text = label.toLowerCase(), q = query.toLowerCase();
  const at = text.indexOf(q); if (at >= 0) return 100 - at + (at === 0 ? 20 : 0);
  let position = 0, score = 0;
  for (const char of q) { const next = text.indexOf(char, position); if (next < 0) return -1; score += next === position ? 3 : 1; position = next + 1; }
  return score;
}

let paletteReturn:Element|null = null;
let paletteMatches:PaletteItem[] = [];
let paletteActive = 0;
function renderPalette() {
  const query = UI.input('paletteInput').value.trim();
  const all = [...paletteFiles(), ...paletteActions()];
  paletteMatches = all.map(item => ({ item, score: paletteScore(item.label, query) })).filter(r => r.score >= 0)
    .sort((a, b) => b.score - a.score || (a.item.group === b.item.group ? 0 : a.item.group === 'files' ? -1 : 1)).slice(0, 30).map(r => r.item);
  paletteActive = Math.min(paletteActive, Math.max(0, paletteMatches.length - 1));
  const list = UI.html('paletteList'); list.replaceChildren();
  if (!paletteMatches.length) {
    const empty = document.createElement('li'); empty.className = 'palette-empty'; empty.setAttribute('role', 'presentation');
    empty.textContent = Content.t('palette.empty'); list.append(empty);
  }
  let lastGroup = '';
  paletteMatches.forEach((item, index) => {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      const head = document.createElement('li'); head.className = 'palette-group'; head.setAttribute('role', 'presentation');
      head.textContent = Content.t(item.group === 'files' ? 'palette.files' : 'palette.actions'); list.append(head);
    }
    const row = document.createElement('li'); row.id = 'palette-opt-' + index; row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === paletteActive)); row.className = 'palette-item';
    const name = document.createElement('span'); name.textContent = item.label; row.append(name);
    if (item.hint) { const hint = document.createElement('kbd'); hint.textContent = item.hint; row.append(hint); }
    row.addEventListener('mousemove', () => { if (paletteActive !== index) { paletteActive = index; markPalette(); } });
    row.addEventListener('click', () => runPalette(index));
    list.append(row);
  });
  UI.input('paletteInput').setAttribute('aria-activedescendant', paletteMatches.length ? 'palette-opt-' + paletteActive : '');
}
function markPalette() {
  UI.html('paletteList').querySelectorAll('[role=option]').forEach((row, index) => row.setAttribute('aria-selected', String(index === paletteActive)));
  const row = document.getElementById('palette-opt-' + paletteActive);
  row?.scrollIntoView({ block: 'nearest' });
  UI.input('paletteInput').setAttribute('aria-activedescendant', paletteMatches.length ? 'palette-opt-' + paletteActive : '');
}
function runPalette(index:number) {
  const item = paletteMatches[index]; if (!item) return;
  closePalette(false); item.run();
}
function openPalette() {
  const dialog = UI.dialog('paletteDialog');
  if (dialog.open || UI.dialog('workspaceDialog').open) return;
  paletteReturn = document.activeElement; paletteActive = 0; UI.input('paletteInput').value = '';
  renderPalette(); dialog.showModal(); UI.input('paletteInput').focus();
}
function closePalette(restore = true) {
  const dialog = UI.dialog('paletteDialog'); if (dialog.open) dialog.close();
  if (restore && paletteReturn instanceof HTMLElement) paletteReturn.focus();
}

function openShortcuts() {
  const dialog = UI.dialog('shortcutsDialog');
  if (dialog.open) return;
  const body = UI.html('shortcutsList'); body.replaceChildren();
  const rows:Array<[string,string]> = [['Ctrl+K','shortcuts.palette'], ['Ctrl+/','shortcuts.help'], ['Ctrl+N','shortcuts.newFile'],
    ['Ctrl+W','shortcuts.closeTab'], ['Ctrl+Tab','shortcuts.nextTab'], ['Ctrl+1 … 9','shortcuts.tabNumber'], ['Ctrl+B','shortcuts.bold'],
    ['Ctrl+I','shortcuts.italic'], ['Ctrl+S','shortcuts.download'], ['Ctrl+F','shortcuts.find'], ['Ctrl+.','shortcuts.focus'],
    [Content.t('shortcuts.keyEsc'), 'shortcuts.leave']];
  for (const [keys, label] of rows) {
    const dt = document.createElement('dt'); const kbd = document.createElement('kbd'); kbd.textContent = keys; dt.append(kbd);
    const dd = document.createElement('dd'); dd.textContent = Content.t(label); body.append(dt, dd);
  }
  dialog.showModal(); UI.button('shortcutsClose').focus();
}

function toggleFocus(on = !focusMode) {
  const w = paletteWorkspace(); if (!w || on === focusMode) return;
  focusMode = on;
  document.body.classList.toggle('focus-mode', on);
  UI.html('focusBar').hidden = !on;
  if (on) { layoutBeforeFocus = w.state.layout; setLayoutDirect('editor'); setFocusSide('editor'); editor.focus(); }
  else { setLayoutDirect(layoutBeforeFocus || w.state.layout); UI.button('explorerToggle').focus(); }
  showToast(Content.t(on ? 'focus.on' : 'focus.off'));
}
function setFocusSide(side:'editor'|'preview') {
  setLayoutDirect(side);
  UI.button('focusWrite').setAttribute('aria-pressed', String(side === 'editor'));
  UI.button('focusRead').setAttribute('aria-pressed', String(side === 'preview'));
}

async function exportHtmlPage() {
  if (!MarkdownSecurity.validDocument(editor.value)) { showToast(Content.t('editor.limit')); return; }
  const fragment = MarkdownSecurity.sanitize(parseMD(editor.value));
  fragment.querySelectorAll<HTMLImageElement>('img[data-remote-src]').forEach(image => {
    image.src = image.dataset.remoteSrc || ''; image.removeAttribute('data-remote-src');
  });
  fragment.querySelectorAll('button').forEach(button => button.remove());
  for (const image of fragment.querySelectorAll<HTMLImageElement>('img[data-local-image]')) {
    const data = await globalThis.Workspace?.images?.get(image.dataset.localImage || '').catch(() => null);
    if (data) image.src = data; image.removeAttribute('data-local-image');
  }
  fragment.querySelectorAll<HTMLElement>('.math-inline').forEach(node => { node.textContent = '$' + node.textContent + '$'; });
  fragment.querySelectorAll<HTMLElement>('.math-block').forEach(node => { node.textContent = '$$\n' + node.textContent + '\n$$'; node.style.whiteSpace = 'pre-wrap'; });
  fragment.querySelectorAll<HTMLElement>('.mermaid-block').forEach(node => {
    const cached = diagramCache.get(diagramKey(node.textContent || ''));
    if (cached) node.innerHTML = cached; else { const pre = document.createElement('pre'); pre.textContent = node.textContent; node.replaceChildren(pre); }
  });
  fragment.querySelectorAll('input[type=checkbox]').forEach(box => box.setAttribute('disabled', ''));
  const holder = document.createElement('div'); holder.append(fragment);
  const name = (globalThis.Workspace?.active()?.name || Content.t('export.title')).replace(/\.md$/i, '');
  const style = 'body{font:16px/1.65 system-ui,"Segoe UI",sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#151c26}' +
    'h1,h2,h3{line-height:1.25}h1,h2{border-bottom:1px solid #d9e0e8;padding-bottom:.3em}code{background:#eef1f5;padding:.15em .35em;border-radius:4px}' +
    'pre{background:#eef1f5;padding:14px;border-radius:8px;overflow:auto}pre code{background:none;padding:0}' +
    'blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid #087266;background:#f2f7f6}' +
    'table{border-collapse:collapse}th,td{border:1px solid #d9e0e8;padding:6px 12px}img{max-width:100%}a{color:#087266}';
  const doc = '<!DOCTYPE html>\n<html lang="' + Content.locale + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + name.replace(/[<>&"]/g, '') + '</title><style>' + style + '</style></head><body>' + holder.innerHTML + '</body></html>\n';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
  link.download = name + '.html'; link.click(); URL.revokeObjectURL(link.href);
  showToast(Content.t('export.html'));
}
function printPreview() {
  const main = UI.html('workspaceMain'); const before = main.dataset.layout || 'split';
  main.dataset.layout = 'preview';
  const restore = () => { main.dataset.layout = focusMode ? (UI.button('focusRead').getAttribute('aria-pressed') === 'true' ? 'preview' : 'editor') : before; };
  window.addEventListener('afterprint', restore, { once: true });
  window.print();
}

document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
  const key = event.key.toLowerCase();
  if (key === 'k' && !event.shiftKey) { event.preventDefault(); if (UI.dialog('paletteDialog').open) closePalette(); else openPalette(); }
  else if (key === '/' && !event.shiftKey) { event.preventDefault(); openShortcuts(); }
  else if (key === '.' && !event.shiftKey) { event.preventDefault(); toggleFocus(); }
});
UI.input('paletteInput').addEventListener('input', () => { paletteActive = 0; renderPalette(); });
UI.input('paletteInput').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); if (!paletteMatches.length) return;
    paletteActive = (paletteActive + (event.key === 'ArrowDown' ? 1 : -1) + paletteMatches.length) % paletteMatches.length; markPalette();
  } else if (event.key === 'Enter') { event.preventDefault(); runPalette(paletteActive); }
});
UI.dialog('paletteDialog').addEventListener('click', event => { if (event.target === UI.dialog('paletteDialog')) closePalette(); });
UI.dialog('paletteDialog').addEventListener('close', () => { if (paletteReturn instanceof HTMLElement && document.activeElement === document.body) paletteReturn.focus(); });
UI.button('shortcutsClose').addEventListener('click', () => UI.dialog('shortcutsDialog').close());
UI.button('focusWrite').addEventListener('click', () => setFocusSide('editor'));
UI.button('focusRead').addEventListener('click', () => setFocusSide('preview'));
UI.button('focusExit').addEventListener('click', () => toggleFocus(false));
UI.input('paletteInput').setAttribute('aria-label', Content.t('palette.title'));
UI.input('paletteInput').setAttribute('placeholder', Content.t('palette.placeholder'));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && focusMode && !UI.dialog('paletteDialog').open && !UI.dialog('workspaceDialog').open && event.target !== editor) toggleFocus(false); });
