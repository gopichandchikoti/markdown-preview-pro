(function (root) {
  'use strict';
  const t:ContentAdapter['t'] = (...args) => root.Content.t(...args);
  const byId = UI.html;
  class Controller implements WorkspaceInstance {
    repository:RepositoryAdapter; snapshot:WorkspaceSnapshot; state:WorkspaceView; selected:SelectionRef;
    statuses:Map<string,SaveStatus>; sessions:Map<string,DocumentSession>; query:string; activity:number;
    pendingDocument = false;
    pendingLabel = 'workspace.creating';
    multi = new Set<string>(); selectMode = false; anchor:string|null = null;
    broadcast?:()=>void; refreshExternal?:()=>Promise<void>; images:ImageAdapter|null = null;

    constructor(repository:RepositoryAdapter, snapshot:WorkspaceSnapshot) {
      this.repository = repository; this.snapshot = snapshot;
      try { this.images = new root.WorkspaceImages.ImageStore(repository.db);
        void this.images.prune(root.WorkspaceImages.referencedIds(snapshot.documents)); }
      catch { this.images = null; }
      this.state = root.WorkspaceState.reconcile(root.WorkspaceState.read(), snapshot);
      this.selected = { kind: 'folders', id: this.state.selectedFolder };
      this.statuses = new Map(); this.sessions = new Map(); this.query = ''; this.activity = 0;
      if (matchMedia('(max-width: 768px)').matches) this.state.sidebar = false;
    }
    active() { return this.snapshot.documents.find(d => d.id === this.state.active); }
    generation() { return root.WorkspaceModel.generation(this.snapshot); }
    destination(tab = false) {
      return (this.selected?.kind === 'folders' && this.selected.id) || (tab && this.active()?.folderId) ||
        this.state.selectedFolder || this.snapshot.folders[0]?.id;
    }
    persist() { if (!root.WorkspaceState.write(this.state)) this.notice(t('common.error')); }
    notice(message:string) {
      const area = byId('workspaceNotice'); area.textContent = message;
      setTimeout(() => { if (area.textContent === message) area.textContent = ''; }, 6000); // Messages are transient; storage failures set the text directly and stay.
    }
    error(error:unknown) {
      const key = 'error.' + (error instanceof Error && 'code' in error ? error.code : '');
      const known = Object.hasOwn(root.ContentModel.locales.en, key);
      if (!known) console.error('Workspace operation failed', error);
      this.notice(t(known ? key : 'common.error'));
    }
    async run(action:()=>Promise<unknown>|unknown) {
      this.activity++;
      try { await action(); return true; } catch (error) { this.error(error); return false; }
      finally { this.activity++; }
    }
    async refresh() {
      const snapshot = await this.repository.snapshot(); this.snapshot = snapshot;
      for (const id of this.multi) if (!snapshot.folders.some(f => f.id === id) && !snapshot.documents.some(d => d.id === id)) this.multi.delete(id);
      const valid = root.WorkspaceState.reconcile(this.state, snapshot);
      for (const [id, session] of this.sessions) if (session.dirty && !snapshot.documents.some(d => d.id === id)) {
        snapshot.documents.push({ ...session.document, content: session.content });
        if (this.state.tabs.includes(id)) valid.tabs.push(id);
        if (this.state.active === id) valid.active = id;
        this.statuses.set(id, 'conflict');
      }
      this.state = valid; this.render();
      if (this.selected && !snapshot[this.selected.kind].some(r => r.id === this.selected.id)) {
        this.selected = { kind: 'folders', id: this.state.selectedFolder }; this.render();
      }
    }
    activate(id:string, focus = false) {
      if (!this.snapshot.documents.some(d => d.id === id)) return;
      root.EditorBridge?.capture(this);
      if (!this.state.tabs.includes(id)) this.state.tabs.push(id);
      this.state.active = id; this.selected = { kind: 'documents', id };
      const active = this.active(); if (!active) return;
      this.state.selectedFolder = active.folderId;
      this.state.expanded = [...new Set([...this.state.expanded, active.folderId])];
      root.EditorBridge?.restore(this); this.render(); this.persist();
      const tab = byId('documentTabs').querySelector<HTMLButtonElement>(`[data-id="${id}"]`);
      tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (focus) tab?.focus();
      if (matchMedia('(max-width: 768px)').matches) this.sidebar(false);
    }
    async close(id:string) {
      if (root.EditorBridge && !await root.EditorBridge.flush(this, id)) return;
      root.EditorBridge?.capture(this);
      const index = this.state.tabs.indexOf(id);
      this.state.tabs = this.state.tabs.filter(tab => tab !== id);
      if (this.state.active === id) this.state.active = this.state.tabs[Math.min(index, this.state.tabs.length - 1)] || null;
      root.EditorBridge?.restore(this); this.render(); this.persist();
      if (this.state.active) byId('documentTabs').querySelector<HTMLButtonElement>(`[data-id="${this.state.active}"]`)?.focus();
      else byId('emptyNew').focus();
    }
    async newFile(tab = false) {
      if (this.pendingDocument) return;
      root.EditorBridge.capture(this);
      this.pendingLabel = 'workspace.creating';
      this.pendingDocument = true; this.render();
      try {
        let folder = this.destination(tab);
        if (!folder) { const f = await this.repository.createFolder(null, t('workspace.defaultFolder'));
          folder = f.id; await this.refresh(); }
        if (!folder) return;
        await seedGuideImage(this.repository);
        const doc = await this.repository.createDocument(folder, t('guide.welcome'));
        await this.refresh(); this.activate(doc.id); this.broadcast?.();
      } finally { this.pendingDocument = false; this.render(); byId('editor').focus(); }
    }
    select(selection:SelectionRef) {
      this.selected = selection;
      if (selection.kind === 'folders') this.state.selectedFolder = selection.id;
      this.render(); this.persist();
    }
    expand(id:string, force?:boolean) {
      const expanded = new Set(this.state.expanded);
      if (force === true || (force !== false && !expanded.has(id))) expanded.add(id); else expanded.delete(id);
      this.state.expanded = [...expanded]; this.render(); this.persist();
    }
    reorderTab(id:string, target:string, after:boolean) {
      const rest = this.state.tabs.filter(tab => tab !== id); const at = rest.indexOf(target);
      if (at < 0 || !this.state.tabs.includes(id)) return;
      rest.splice(at + (after ? 1 : 0), 0, id); this.state.tabs = rest; this.render(); this.persist();
      byId('tab-' + id)?.focus({ preventScroll: true });
    }
    kindOf(id:string):EntityKind { return this.snapshot.folders.some(f => f.id === id) ? 'folders' : 'documents'; }
    visibleIds() { return [...byId('explorerTree').querySelectorAll<HTMLElement>('[role=treeitem]')].map(e => e.dataset.id || '').filter(Boolean); }
    check(id:string, range = false) {
      const ids = this.visibleIds();
      if (range && this.anchor && ids.includes(this.anchor) && ids.includes(id)) {
        const a = ids.indexOf(this.anchor), b = ids.indexOf(id);
        for (const v of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) this.multi.add(v);
      } else { if (this.multi.has(id)) this.multi.delete(id); else this.multi.add(id); this.anchor = id; }
      this.render();
    }
    checkAll(on:boolean) { for (const id of this.visibleIds()) { if (on) this.multi.add(id); else this.multi.delete(id); } this.render(); }
    setSelectMode(on:boolean) { this.selectMode = on; if (!on) { this.multi.clear(); this.anchor = null; } this.render(); }
    sidebar(visible = !this.state.sidebar) {
      this.state.sidebar = visible; this.render(); this.persist();
      if (visible) byId('explorerFilter').focus();
    }
    render() {
      root.WorkspaceTabs.renderTabs({ container: byId('documentTabs'), documents: this.snapshot.documents, state: this.state,
        statuses: this.statuses, activate: (id, focus) => this.activate(id, focus), close: id => this.run(() => this.close(id)),
        reorder: (id, target, after) => this.reorderTab(id, target, after) });
      root.WorkspaceExplorer.renderExplorer({ container: byId('explorerTree'), snapshot: this.snapshot,
        state: this.state, selected: this.selected, query: this.query,
        mode: this.selectMode, checked: this.multi, check: (id, range) => this.check(id, range), move: (id, destination) => this.run(() => root.WorkspaceActions.moveItem(this, id, destination)),
        select: selected => this.select(selected), open: id => this.activate(id), expand: id => this.expand(id) });
      byId('workspaceShell').classList.toggle('sidebar-hidden', !this.state.sidebar);
      byId('explorerToggle').setAttribute('aria-expanded', String(this.state.sidebar));
      UI.html('workspaceMain').inert = this.state.sidebar && matchMedia('(max-width: 768px)').matches;
      byId('explorer').inert = !this.state.sidebar;
      byId('emptyWorkspace').hidden = Boolean(this.active()); byId('documentPanel').hidden = !this.active();
      if (this.active()) byId('documentPanel').setAttribute('aria-labelledby', 'tab-' + this.state.active);
      for (const name of ['rename', 'move', 'delete', 'duplicate'])
        UI.button('action-' + name).disabled = !this.selected?.id;
      byId('action-duplicate').textContent = t(this.selected.kind === 'folders' ?
        'workspace.duplicateFolder' : 'workspace.duplicate');
      byId('selectionName').textContent = this.snapshot[this.selected?.kind || 'folders']
        .find(r => r.id === this.selected?.id)?.name || t('workspace.select');
      const ids = this.visibleIds(), picked = ids.filter(id => this.multi.has(id)).length, master = UI.input('selectAll');
      byId('explorer').classList.toggle('select-mode', this.selectMode); byId('selectionBar').hidden = !this.selectMode;
      UI.button('selectToggle').textContent = t(this.selectMode ? 'workspace.selectDone' : 'workspace.selectMode');
      UI.button('selectToggle').setAttribute('aria-pressed', String(this.selectMode));
      master.checked = ids.length > 0 && picked === ids.length; master.indeterminate = picked > 0 && picked < ids.length; master.disabled = !ids.length;
      byId('selectionCount').textContent = t('workspace.selectedCount', { count: this.multi.size });
      UI.button('deleteSelected').disabled = !this.multi.size;
      UI.button('markdownOpen').disabled = this.pendingDocument;
      byId('saveStatus').textContent = t(this.pendingDocument ? this.pendingLabel :
        'common.' + (this.statuses.get(this.state.active || '') || 'saved'));
      root.EditorBridge?.status(this);
    }
  }
  /** The welcome guide shows a sample image; store it once, under a fixed id, whenever a guide copy exists. */
  async function seedGuideImage(repository:RepositoryAdapter, snapshot?:WorkspaceSnapshot) {
    try {
      const id = 'welcome-demo-01';
      if (snapshot && !snapshot.documents.some(d => d.content.includes('#img-' + id))) return;
      const store = new root.WorkspaceImages.ImageStore(repository.db);
      if (!(await store.get(id))) await store.put(t('guide.demoImage'), id);
    } catch { /* The sample image is optional; the guide still renders without it. */ }
  }
  async function start() {
    byId('saveStatus').textContent = t('common.loading');
    let database;
    try {
      database = await root.WorkspaceDB.openDatabase();
      const repository = new root.WorkspaceRepository.Repository(database);
      const snapshot = await repository.initialize(() => localStorage.getItem('md-preview-pro-content'),
        { folder: t('workspace.defaultFolder'), file: t('workspace.defaultFile'), welcome: t('guide.welcome') });
      await seedGuideImage(repository, snapshot);
      root.Workspace = new Controller(repository, snapshot); root.WorkspaceActions.bind(root.Workspace);
      root.EditorBridge?.start(root.Workspace); root.Workspace.render(); root.WorkspaceSync?.start(root.Workspace);
      matchMedia('(max-width: 768px)').addEventListener('change', () => {
        if (matchMedia('(max-width: 768px)').matches) root.Workspace.state.sidebar = false;
        root.Workspace.render();
      });
      return root.Workspace;
    } catch (error) {
      if (database) {
        try { root.RawRecovery = await root.WorkspaceDB.transact(database, 'readonly', state => state); }
        catch { root.RawRecovery = null; }
        database.close();
      }
      byId('saveStatus').textContent = t('common.failed'); byId('workspaceNotice').textContent = t('common.unavailable');
      console.error('Workspace storage failed', error);
      root.EditorBridge?.unavailable();
      return null;
    }
  }
  root.WorkspaceController = { start, Controller };
})(globalThis);
