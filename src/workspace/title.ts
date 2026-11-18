(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const M:ModelAPI = node ? require('./model') : root.WorkspaceModel;
  function clean(text:string):string|null {
    if (/<[^>]*>|(?:https?:\/\/|www\.)/i.test(text)) return null;
    const value = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s*)?|\d+\.\s+)/, '')
      .replace(/[`*_~#]/g, '').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, ' ')
      .replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 80).trim();
    if (!/[\p{L}\p{N}]{2}/u.test(value) || /^(untitled(?: \d+)?|text|test|todo|heading|hello|code here)$/i.test(value))
      return null;
    try { return M.normalizeName(value, true); } catch { return null; }
  }
  /** Deterministic, offline suggestion. Headings take priority over prose; code never supplies names. */
  function suggest(content:string):string|null {
    const lines = [];
    let fence:string|null = null;
    for (const line of content.split(/\r?\n/).slice(0, 10000)) {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        continue;
      }
      if (!fence) lines.push(line);
    }
    for (const line of lines) if (/^\s{0,3}#{1,6}\s+/.test(line)) { const name = clean(line); if (name) return name; }
    for (let i = 1; i < lines.length; i++) if (/^\s*(?:=+|-+)\s*$/.test(lines[i])) {
      const name = clean(lines[i - 1]); if (name) return name;
    }
    for (const line of lines) {
      if (/^\s{4}|^\s*[|<]/.test(line)) continue;
      const name = clean(line.split(/\s+/).slice(0, 12).join(' ')); if (name) return name;
    }
    return null;
  }
  if (node) { module.exports = { suggest }; return; }
  const t:ContentAdapter['t'] = (...args) => root.Content.t(...args);
  const byId = UI.html;
  function update(w:WorkspaceInstance) {
    const s = root.EditorBridge.session(w); const doc = s?.document;
    const desired = s && doc?.titleMode === 'auto' ? suggest(s.content) : null;
    const name = desired && doc ? M.uniqueName(w.snapshot.documents, 'folderId', doc.folderId, desired, doc.id) : null;
    s && (s.suggestion = name);
    byId('titleSuggestion').hidden = !name && !s?.revertName;
    byId('suggestedName').textContent = name ? t('title.suggestion', { name }) : '';
    byId('acceptTitle').hidden = !name; byId('dismissTitle').hidden = !name;
    byId('revertTitle').hidden = !s?.revertName;
  }
  let timer:ReturnType<typeof setTimeout>;
  function schedule(w:WorkspaceInstance) { clearTimeout(timer); timer = setTimeout(() => update(w), 800); }
  function bind(w:WorkspaceInstance) {
    async function rename(name:string, revert:boolean) {
      const doc = w.active(); if (!doc || !await root.EditorBridge.flush(w)) return;
      const s = root.EditorBridge.session(w); if (!s) return; const previous = s.document.name;
      const saved = await w.repository.rename('documents', doc.id, name, s.document.revision);
      s.document = saved; s.revertName = revert ? previous : null;
      await w.refresh(); update(w); w.broadcast?.();
    }
    byId('acceptTitle').onclick = () => w.run(() => {
      const name = root.EditorBridge.session(w)?.suggestion; if (name) return rename(name,true);
    });
    byId('dismissTitle').onclick = () => w.run(() => {
      const doc = w.active(); if (doc) return rename(doc.name,false);
    });
    byId('revertTitle').onclick = () => w.run(() => {
      const doc = w.active(); const name = root.EditorBridge.session(w)?.revertName;
      if (doc && name) return rename(M.uniqueName(w.snapshot.documents,'folderId',doc.folderId,name,doc.id),false);
    });
  }
  root.WorkspaceTitle = { update, schedule, bind };
})(globalThis);
