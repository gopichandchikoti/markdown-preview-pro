(function (root) {
  'use strict';
  const t:ContentAdapter['t'] = (...args) => root.Content.t(...args);
  const byId = UI.html;
  function session(w:WorkspaceInstance, id = w.state.active):DocumentSession|null {
    const document = w.snapshot.documents.find(d => d.id === id);
    if (!document || !id) return null;
    if (!w.sessions.has(id)) w.sessions.set(id, { document: structuredClone(document), content: document.content,
      start: 0, end: 0, direction: 'none', top: 0, left: 0, previewTop: 0, dirty: false, timer: undefined, saving: null });
    return w.sessions.get(id) || null;
  }
  function capture(w:WorkspaceInstance) {
    const s = session(w); if (!s) return;
    w.activity++;
    Object.assign(s, { start: editor.selectionStart, end: editor.selectionEnd, direction: editor.selectionDirection,
      top: editor.scrollTop, left: editor.scrollLeft, previewTop: preview.scrollTop });
  }
  function restore(w:WorkspaceInstance) {
    clearTimeout(debounceTimer);
    const s = session(w);
    editor.disabled = !s;
    if (!s) { editor.value = ''; preview.replaceChildren(); return; }
    const stored = w.active();
    if (stored && !s.dirty && !s.saving && stored.revision !== s.document.revision) {
      s.document = structuredClone(stored); s.content = stored.content;
    }
    editor.value = s.content; render();
    editor.setSelectionRange(s.start, s.end, s.direction);
    editor.scrollTop = s.top; editor.scrollLeft = s.left; preview.scrollTop = s.previewTop;
    updateCursorPos(); root.WorkspaceTitle?.update(w);
  }
  function changed(w:WorkspaceInstance|undefined) {
    if (!w) { byId('saveStatus').textContent = t('common.failed'); return; }
    const s = session(w); if (!s) return;
    s.content = editor.value; s.dirty = s.content !== s.document.content;
    clearTimeout(s.timer); capture(w);
    const conflict = w.statuses.get(s.document.id) === 'conflict';
    w.statuses.set(s.document.id, conflict ? 'conflict' : s.dirty ? 'dirty' : 'saved'); w.render();
    if (s.dirty && !conflict) s.timer = setTimeout(() => flush(w, s.document.id), 300);
    root.WorkspaceTitle?.schedule(w);
  }
  async function flush(w:WorkspaceInstance, id = w.state.active):Promise<boolean> {
    if (!id) return true;
    const s = w.sessions.get(id); if (!s) return true;
    clearTimeout(s.timer);
    if (s.saving) { if (!await s.saving) return false; return s.dirty ? flush(w, id) : true; }
    if (!s.dirty) return true;
    if (w.statuses.get(id) === 'conflict') return false;
    w.statuses.set(id, 'saving'); w.render();
    w.activity++;
    const content = s.content;
    s.saving = (async ():Promise<boolean> => {
      try {
        const saved = await w.repository.save(id, s.document.revision, content);
        s.document = saved; s.dirty = s.content !== saved.content;
        const index = w.snapshot.documents.findIndex(d => d.id === id);
        if (index >= 0) w.snapshot.documents[index] = saved;
        w.statuses.set(id, s.dirty ? 'dirty' : 'saved'); w.broadcast?.();
        if (![...w.statuses.values()].some(status => ['failed', 'conflict'].includes(status))) w.notice('');
        return true;
      } catch (error) {
        w.statuses.set(id, error instanceof Error && 'code' in error && error.code === 'conflict' ? 'conflict' : 'failed'); w.error(error); return false;
      } finally { s.saving = null; w.activity++; w.render(); }
    })();
    const saved = await s.saving;
    if (saved && s.dirty) return flush(w, id);
    return saved;
  }
  async function flushAll(w:WorkspaceInstance) {
    const results = await Promise.all([...w.sessions.keys()].map(id => flush(w, id)));
    return results.every(Boolean);
  }
  function status(w:WorkspaceInstance) {
    editor.disabled = !w.active() || w.pendingDocument;
    byId('conflictActions').hidden = w.statuses.get(w.state.active || '') !== 'conflict';
    document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(control => {
      if (control.tagName !== 'BUTTON') return;
      control.disabled = (!w.active() || w.pendingDocument) && !['toggleTheme()', 'toggleOutline()', 'toggleSync()', 'toggleWrap()']
        .includes(control.dataset.command || '');
    });
  }
  function start(w:WorkspaceInstance) {
    root.WorkspaceTitle.bind(w); root.WorkspaceShortcuts.bind(w);
    syncScroll = w.state.sync; wordWrap = w.state.wrap; outlineOpen = w.state.outline;
    editor.style.whiteSpace = wordWrap ? 'pre-wrap' : 'pre';
    UI.button('syncBtn').classList.toggle('active', syncScroll);
    UI.button('wrapBtn').classList.toggle('active', wordWrap);
    UI.html('outlinePanel').classList.toggle('open', outlineOpen);
    UI.button('outlineBtn').classList.toggle('active', outlineOpen);
    editorPanel.style.width = w.state.split + '%';
    splitter.setAttribute('aria-valuenow', String(w.state.split));
    UI.select('layoutSelect').value = w.state.layout;
    byId('layoutSelect').onchange = event => { w.state.layout = UI.select('layoutSelect').value === 'editor' ? 'editor' : UI.select('layoutSelect').value === 'preview' ? 'preview' : 'split'; applyLayout(w); w.persist(); };
    applyLayout(w);
    restore(w);
    byId('retryStorage').onclick = () => w.run(() => flushAll(w));
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(w); });
    window.addEventListener('pagehide', () => { capture(w); w.persist(); flushAll(w); });
    window.addEventListener('beforeunload', event => {
      if ([...w.sessions.values()].some(s => s.dirty)) { event.preventDefault(); event.returnValue = ''; }
    });
  }
  function applyLayout(w:WorkspaceInstance) {
    UI.html('workspaceMain').dataset.layout = w.state.layout;
    if (w.state.layout !== 'split') splitter.tabIndex = -1; else splitter.tabIndex = 0;
  }
  function unavailable() {
    editor.disabled = false;
    if (!root.Recovery) {
      let legacy = null;
      try { legacy = localStorage.getItem('md-preview-pro-content'); }
      catch { /* Recovery remains editable when localStorage is also unavailable. */ }
      editor.value = legacy ?? t('guide.welcome'); // Nothing stored to protect: show the guide instead of a blank page.
      root.Recovery = { original: editor.value, legacy };
      window.addEventListener('beforeunload', event => {
        if (!root.Workspace && editor.value !== root.Recovery?.original) {
          event.preventDefault(); event.returnValue = '';
        }
      });
    }
    render();
    byId('retryStorage').onclick = async () => {
      const draft = editor.value;
      const w = await root.WorkspaceController.start();
      if (!w) { editor.value = draft; render(); return; }
      if (draft !== w.active()?.content) {
        const s = session(w); if (s) { s.content = draft; s.dirty = true; restore(w); changed(w); }
      }
      root.Recovery = null;
    };
  }
  root.EditorBridge = { start, session, capture, restore, changed, flush, flushAll, status, unavailable };
})(globalThis);
