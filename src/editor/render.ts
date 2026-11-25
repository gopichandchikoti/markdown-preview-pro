function render() {
  updateStats(); updateCursorPos();
  if (!MarkdownSecurity.validDocument(editor.value)) {
    preview.textContent = Content.t('editor.previewLimit');
    updateOutline(); return;
  }
  preview.replaceChildren(MarkdownSecurity.sanitize(parseMD(editor.value)));
  preview.querySelectorAll<HTMLImageElement>('img[data-remote-src]').forEach(image => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = Content.t('editor.remoteImage', { host: new URL(image.dataset.remoteSrc || '').host });
    button.addEventListener('click', () => {
      const url = MarkdownSecurity.safeUrl(image.dataset.remoteSrc, true);
      if (url) image.src = url;
      button.remove();
    });
    image.after(button);
  });
  updateStats();
  updateOutline();
  try { enhancePreview(preview); } catch { /* Math, diagrams and stored images are optional; the text preview must never fail with them. */ }
}

function debouncedRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 60);
}

// ══════════════════════════════════════════════
// Stats
// ══════════════════════════════════════════════
function updateStats() {
  const text = editor.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const lineCount = text.split('\n').length;
  const readMin = Math.max(1, Math.round(words / 200));
  UI.html('statWords').textContent = Content.t('editor.words.' + new Intl.PluralRules(Content.locale).select(words), { count: words });
  UI.html('statChars').textContent = Content.t('editor.chars.' + new Intl.PluralRules(Content.locale).select(chars), { count: chars });
  UI.html('statLines').textContent = Content.t('editor.lines.' + new Intl.PluralRules(Content.locale).select(lineCount), { count: lineCount });
  UI.html('statReadTime').textContent = Content.t('editor.readTime', { count: readMin });
}

// ══════════════════════════════════════════════
// Cursor
// ══════════════════════════════════════════════
editor.addEventListener('click', updateCursorPos);
editor.addEventListener('keyup', updateCursorPos);
function updateCursorPos() {
  const pos = editor.selectionStart;
  const before = editor.value.substring(0, pos);
  const ln = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  UI.html('cursorPos').textContent = Content.t('editor.cursor', { line: ln, column: col });
}

function updateOutline() {
  const headings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const container = UI.html('outlineContent');
  container.innerHTML = '';
  if (!headings.length) {
    container.textContent = Content.t('editor.noHeadings');
    return;
  }
  headings.forEach(h => {
    const level = parseInt(h.tagName[1]);
    const div = document.createElement('button');
    div.className = 'outline-item';
    div.style.paddingLeft = ((level - 1) * 12 + 8) + 'px';
    div.textContent = h.textContent;
    div.type = 'button';
    div.onclick = () => h.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    container.appendChild(div);
  });
}
