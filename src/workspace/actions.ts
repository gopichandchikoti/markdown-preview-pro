(function (root) {
  'use strict';
  const t:ContentAdapter['t'] = (...args) => root.Content.t(...args);
  const ask = (options:DialogOptions) => root.WorkspaceDialog.ask(options);
  const byId = UI.html;
  async function operation(w:WorkspaceInstance, action:string) {
    const selected = w.selected;
    const record = w.snapshot[selected.kind].find(r => r.id === selected.id);
    if (!record) return;
    if (selected.kind === 'documents' && root.EditorBridge && !await root.EditorBridge.flush(w, record.id)) return;
    const current = w.snapshot[selected.kind].find(r => r.id === selected.id); if (!current) return;
    if (action === 'rename') {
      const name = await ask({ title: t('workspace.rename'), label: t('workspace.fileName'), value: current.name });
      if (typeof name !== 'string') return;
      const renamed = await w.repository.rename(selected.kind, current.id, name, 'revision' in current ? current.revision : undefined);
      const session = w.sessions.get(current.id); if (session && 'folderId' in renamed) session.document = renamed;
    }
    if (action === 'move') {
      const choices = w.snapshot.folders.map(f => ({ value: f.id, label: path(w, f.id) }));
      if (selected.kind === 'folders') choices.unshift({ value: '', label: t('workspace.root') });
      const destination = await ask({ title: t('workspace.move'), label: t('workspace.destination'), choices });
      if (typeof destination !== 'string') return;
      const moved = await w.repository.move(selected.kind, current.id, destination || null, 'revision' in current ? current.revision : undefined);
      const session = w.sessions.get(current.id); if (session && 'folderId' in moved) session.document = moved;
    }
    if (action === 'duplicate') {
      if (selected.kind === 'folders') {
        const copy = await w.repository.duplicateFolder(current.id); await w.refresh();
        w.select({ kind:'folders', id:copy.id }); w.expand(copy.id, true);
      } else {
        const copy = await w.repository.duplicate(current.id); await w.refresh(); w.activate(copy.id);
      }
    }
    if (action === 'delete') {
      if (root.EditorBridge && !await root.EditorBridge.flushAll(w)) return;
      await w.refresh(); const generation = w.generation();
      if (!await ask({ title: t('workspace.delete'), message: t('workspace.deleteConfirm', { name: current.name }) })) return;
      await w.repository.remove(selected.kind, current.id, generation);
      for (const [id, session] of w.sessions) if (!session.dirty) w.sessions.delete(id);
    }
    await w.refresh(); root.EditorBridge?.restore(w); w.persist(); w.broadcast?.();
  }
  function path(w:WorkspaceInstance, id:string|null) {
    const names = [];
    while (id) { const f = w.snapshot.folders.find(f => f.id === id); if (!f) break;
      names.unshift(f.name); id = f.parentId; }
    return names.join(' / ');
  }
  function bind(w:WorkspaceInstance) {
    byId('tabNew').onclick = () => w.run(() => w.newFile(true));
    for (const id of ['explorerNew', 'emptyNew']) byId(id).onclick = () => w.run(() => w.newFile());
    byId('folderNew').onclick = () => w.run(async () => {
      const name = await ask({ title: t('workspace.newFolder'), label: t('workspace.folderName') });
      if (typeof name !== 'string') return;
      const folder = await w.repository.createFolder(w.state.selectedFolder, name);
      await w.refresh(); w.select({ kind: 'folders', id: folder.id }); w.expand(folder.id, true); w.broadcast?.();
    });
    for (const action of ['rename', 'move', 'duplicate', 'delete'])
      byId('action-' + action).onclick = () => w.run(() => operation(w, action));
    byId('explorerFilter').oninput = event => { w.query = UI.input('explorerFilter').value; w.render(); };
    byId('explorerToggle').onclick = () => w.sidebar();
    byId('explorerClose').onclick = () => { w.sidebar(false); byId('explorerToggle').focus(); };
    byId('explorer').addEventListener('keydown', event => {
      if (event.key === 'Escape') { w.sidebar(false); byId('explorerToggle').focus(); }
    });
    root.WorkspaceExplorer.keyboard(byId('explorerTree'), id => w.expand(id, true), id => w.expand(id, false), id => {
      const kind = w.snapshot.folders.some(f => f.id === id) ? 'folders' : 'documents'; w.select({ kind, id });
    });
    byId('previousTab').onclick = () => cycle(w, -1); byId('nextTab').onclick = () => cycle(w, 1);
  }
  function cycle(w:WorkspaceInstance, direction:number) {
    if (!w.state.tabs.length) return false;
    w.activate(w.state.tabs[(w.state.tabs.indexOf(w.state.active || '') + direction + w.state.tabs.length) %
      w.state.tabs.length], true); return true;
  }
  root.WorkspaceActions = { bind, cycle, path };
})(globalThis);
