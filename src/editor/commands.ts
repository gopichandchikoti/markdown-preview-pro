function insertFormat(before:string, after:string) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.substring(start, end);
  const text = selected || Content.t('editor.text');
  editor.setRangeText(before + text + after, start, end, 'select');
  editor.focus();
  if (!selected) {
    editor.selectionStart = start + before.length;
    editor.selectionEnd = start + before.length + text.length;
  }
  debouncedRender(); saveContent();
}

function insertPrefix(prefix:string) {
  const start = editor.selectionStart;
  const val = editor.value;
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  editor.setRangeText(prefix, lineStart, lineStart, 'end');
  editor.focus();
  debouncedRender(); saveContent();
}

function insertCodeBlock() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.substring(start, end) || Content.t('editor.code');
  editor.setRangeText('\n```\n' + selected + '\n```\n', start, end, 'end');
  editor.focus();
  debouncedRender(); saveContent();
}

function insertTable() {
  const tpl = Content.t('editor.table');
  const pos = editor.selectionStart;
  editor.setRangeText(tpl, pos, pos, 'end');
  editor.focus();
  debouncedRender(); saveContent();
}

function insertLink() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.substring(start, end) || Content.t('editor.link');
  editor.setRangeText('[' + selected + '](url)', start, end, 'end');
  editor.focus();
  debouncedRender(); saveContent();
}

function insertHR() {
  const pos = editor.selectionStart;
  editor.setRangeText('\n---\n', pos, pos, 'end');
  editor.focus();
  debouncedRender(); saveContent();
}

function toggleSearch() {
  const overlay = UI.html('searchOverlay');
  overlay.classList.toggle('active');
  if (overlay.classList.contains('active')) {
    UI.input('searchInput').focus();
  } else {
    UI.input('searchInput').value = '';
    UI.html('searchCount').textContent = '';
    editor.focus();
  }
}

function findInEditor() {
  const query = UI.input('searchInput').value;
  if (!query) { UI.html('searchCount').textContent = ''; return; }
  const text = editor.value;
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = text.match(regex);
  UI.html('searchCount').textContent = matches ? Content.t('editor.found', { count: matches.length }) : Content.t('editor.noMatches');
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx >= 0) {
    editor.focus();
    editor.setSelectionRange(idx, idx + query.length);
  }
}

// ══════════════════════════════════════════════
// Copy code
// ══════════════════════════════════════════════
function copyCode(btn:HTMLButtonElement) {
  const code = btn.parentElement?.querySelector('code')?.textContent;
  if (code === undefined || code === null) return;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = Content.t('editor.copied');
    setTimeout(() => btn.textContent = Content.t('editor.copy'), 1500);
  }).catch(() => showToast(Content.t('editor.clipboardError')));
}

// ══════════════════════════════════════════════
// Task toggle
// ══════════════════════════════════════════════
function toggleTask(checkbox:HTMLInputElement) {
  const text = editor.value;
  const tasks = [];
  let offset = 0; let fenced = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const task = !fenced && line.match(/^(\s*[-*]\s+\[)([ xX])(\]\s+.*)/);
    if (task) { task.index = offset; tasks.push(task); }
    offset += line.length + 1;
  }
  const allCbs = preview.querySelectorAll('.task-list input[type="checkbox"]');
  const idx = [...allCbs].indexOf(checkbox);
  if (idx >= 0 && tasks[idx]) {
    const match = tasks[idx];
    const newState = checkbox.checked ? 'x' : ' ';
    const before = text.substring(0, match.index);
    const after = text.substring((match.index || 0) + match[0].length);
    editor.value = before + match[1] + newState + match[3] + after;
    debouncedRender(); saveContent();
  }
}

// ══════════════════════════════════════════════
// Export / Copy / Clear
// ══════════════════════════════════════════════
function exportMarkdown() {
  const w = globalThis.Workspace;
  const content = w ? globalThis.EditorBridge.session(w)?.content ?? editor.value : editor.value;
  const blob = new Blob([content], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = globalThis.Workspace?.active()?.name || Content.t('workspace.defaultFile');
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(a.download);
}

function copyHTML() {
  if (!MarkdownSecurity.validDocument(editor.value)) { showToast(Content.t('editor.limit')); return; }
  const holder = document.createElement('div');
  holder.append(MarkdownSecurity.sanitize(parseMD(editor.value)));
  navigator.clipboard.writeText(holder.innerHTML).then(() => showToast(Content.t('editor.htmlCopied')))
    .catch(() => showToast(Content.t('editor.clipboardError')));
}

function clearEditor() {
  if (editor.value && !confirm(Content.t('editor.clearConfirm'))) return;
  editor.value = '';
  render(); saveContent();
}

function showToast(msg:string) {
  const t = UI.html('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}
