(function (root) {
  'use strict';
  const t:ContentAdapter['t'] = (...args) => root.Content.t(...args);
  const byId = UI.html;
  function start(w:WorkspaceInstance) {
    let channel:BroadcastChannel|null = null;
    let refreshing = false;
    let again = false;
    let stopped = false;
    const refresh = async () => {
      if (stopped || w.pendingDocument) return;
      if (refreshing) { again = true; return; }
      if ([...w.sessions.values()].some(s => s.saving)) return;
      refreshing = true; const activity = w.activity;
      try {
        const snapshot = await w.repository.snapshot();
        if (activity !== w.activity || [...w.sessions.values()].some(s => s.saving)) return;
        if (root.WorkspaceModel.generation(snapshot) === w.generation()) return;
        root.EditorBridge.capture(w);
        for (const [id, s] of w.sessions) {
          const remote = snapshot.documents.find(d => d.id === id);
          if (s.dirty && remote?.revision !== s.document.revision) {
            clearTimeout(s.timer); w.statuses.set(id, 'conflict');
            if (!remote) snapshot.documents.push({ ...s.document, content: s.content });
          }
        }
        w.snapshot = snapshot;
        w.state = root.WorkspaceState.reconcile(w.state, snapshot);
        root.EditorBridge.restore(w); w.render();
      } catch (error) { w.error(error); }
      finally {
        refreshing = false;
        if (again) { again = false; queueMicrotask(refresh); }
      }
    };
    try {
      if (root.BroadcastChannel) { channel = new BroadcastChannel('md-preview-pro-workspace');
        channel.onmessage = refresh; }
    } catch { channel = null; /* IDB polling and focus refresh remain available. */ }
    w.broadcast = () => { try { channel?.postMessage({ version: 1 }); } catch { /* Polling remains available. */ } };
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 2000);
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    window.addEventListener('pagehide', () => { stopped = true; clearInterval(timer); channel?.close(); });
    window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
    byId('keepLocal').onclick = () => w.run(async () => {
      const s = root.EditorBridge.session(w); if (!s) return; const oldId = s.document.id;
      let snapshot = await w.repository.snapshot();
      let folder = snapshot.folders.find(f => f.id === s.document.folderId)?.id || snapshot.folders[0]?.id;
      if (!folder) { folder = (await w.repository.createFolder(null, t('workspace.defaultFolder'))).id;
        snapshot = await w.repository.snapshot(); }
      const name = root.WorkspaceModel.uniqueName(snapshot.documents, 'folderId', folder,
        root.WorkspaceModel.normalizeName(s.document.name.slice(0, -3).slice(0, 60) + ' ' + t('recovery.suffix'), true));
      const recovered = await w.repository.createDocument(folder, s.content, name);
      w.sessions.delete(oldId); w.statuses.delete(oldId);
      w.state.tabs = w.state.tabs.map(id => id === oldId ? recovered.id : id);
      w.state.active = recovered.id;
      await w.refresh(); w.activate(recovered.id); w.notice(''); w.broadcast?.();
    });
    byId('reloadRemote').onclick = () => w.run(async () => {
      if (!await root.WorkspaceDialog.ask({ title: t('conflict.reload'), message: t('conflict.reloadConfirm') })) return;
      const id = w.state.active; if (id) { w.sessions.delete(id); w.statuses.delete(id); }
      await w.refresh(); root.EditorBridge.restore(w); w.notice('');
    });
    w.refreshExternal = refresh;
  }
  root.WorkspaceSync = { start };
})(globalThis);
