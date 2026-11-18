function setTheme(theme:string) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  UI.html('lightOption').classList.toggle('active', theme === 'light');
  UI.html('darkOption').classList.toggle('active', theme === 'dark');
  try { localStorage.setItem('md-preview-theme', theme); }
  catch { globalThis.Workspace?.notice(Content.t('common.error')); }
}

function toggleTheme() {
  setTheme(currentTheme === 'light' ? 'dark' : 'light');
}

function initTheme() {
  try {
    const saved = localStorage.getItem('md-preview-theme');
    if (saved && ['light', 'dark'].includes(saved)) { setTheme(saved); return; }
  } catch { /* System theme is available when preferences cannot be read. */ }
  // Check system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    setTheme('dark');
  } else {
    setTheme('light');
  }
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let savedTheme = null;
  try { savedTheme = localStorage.getItem('md-preview-theme'); } catch { /* Storage can be denied. */ }
  if (!savedTheme) {
    setTheme(e.matches ? 'dark' : 'light');
  }
});

editor.addEventListener('scroll', () => {
  if (!syncScroll) return;
  const pct = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
  preview.scrollTop = pct * (preview.scrollHeight - preview.clientHeight);
});

function toggleSync() {
  syncScroll = !syncScroll;
  UI.button('syncBtn').classList.toggle('active', syncScroll);
  saveLayout();
}

// ══════════════════════════════════════════════
// Word wrap
// ══════════════════════════════════════════════
function toggleWrap() {
  wordWrap = !wordWrap;
  editor.style.whiteSpace = wordWrap ? 'pre-wrap' : 'pre';
  editor.style.overflowX = wordWrap ? 'hidden' : 'auto';
  UI.button('wrapBtn').classList.toggle('active', wordWrap);
  saveLayout();
}

// ══════════════════════════════════════════════
// Outline
// ══════════════════════════════════════════════
function toggleOutline() {
  outlineOpen = !outlineOpen;
  UI.html('outlinePanel').classList.toggle('open', outlineOpen);
  UI.button('outlineBtn').classList.toggle('active', outlineOpen);
  saveLayout();
}

const splitter = UI.html('splitter');
const editorPanel = UI.html('editorPanel');
let dragging = false;

splitter.addEventListener('mousedown', (e) => {
  dragging = true;
  splitter.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const container = editorPanel.parentElement;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  // Allow shrinking down to 5% (very narrow) and up to 85%
  editorPanel.style.width = Math.min(85, Math.max(5, pct)) + '%';
});

document.addEventListener('mouseup', () => {
  if (dragging) {
    dragging = false;
    splitter.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveLayout();
  }
});

// Double-click splitter to reset to 38%
splitter.addEventListener('dblclick', () => {
  editorPanel.style.width = '38%';
  saveLayout();
});

const themeToggle = UI.html('themeToggle');
themeToggle.setAttribute('role', 'button');
themeToggle.tabIndex = 0;
themeToggle.setAttribute('aria-label', Content.t('editor.theme'));
themeToggle.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleTheme(); }
});
splitter.tabIndex = 0;
splitter.setAttribute('role', 'separator');
function splitterOrientation() {
  splitter.setAttribute('aria-orientation', matchMedia('(max-width: 768px)').matches ? 'horizontal' : 'vertical');
}
splitterOrientation();
matchMedia('(max-width: 768px)').addEventListener('change', splitterOrientation);
splitter.setAttribute('aria-label', Content.t('editor.resize'));
splitter.setAttribute('aria-valuemin', '5');
splitter.setAttribute('aria-valuemax', '85');
splitter.setAttribute('aria-valuenow', '38');
splitter.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
  event.preventDefault();
  const width = parseFloat(editorPanel.style.width) || 38;
  editorPanel.style.width = (event.key === 'Home' ? 38 : Math.min(85, Math.max(5,
    width + (event.key === 'ArrowRight' ? 5 : -5)))) + '%';
  saveLayout();
});
function saveLayout() {
  splitter.setAttribute('aria-valuenow', String(parseFloat(editorPanel.style.width) || 38));
  const w = globalThis.Workspace; if (!w) return;
  Object.assign(w.state, { sync: syncScroll, wrap: wordWrap, outline: outlineOpen,
    split: parseFloat(editorPanel.style.width) || 38 }); w.persist();
}
