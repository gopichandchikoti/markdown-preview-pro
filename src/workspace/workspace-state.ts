(function (root) {
  'use strict';
  const KEY = 'md-preview-pro-workspace-ui';
  function read(storage?:Pick<Storage,'getItem'>):unknown {
    try {
      storage ||= root.localStorage;
      const value = JSON.parse(storage.getItem(KEY) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }
  function reconcile(input:unknown, snapshot:Pick<WorkspaceSnapshot,'folders'|'documents'>):WorkspaceView {
    const value:Record<string,unknown> = input && typeof input === 'object' ? Object.fromEntries(Object.entries(input)) : {};
    const docs = new Set(snapshot.documents.map(d => d.id));
    const folders = new Set(snapshot.folders.map(f => f.id));
    const tabs = Array.isArray(value.tabs) ? [...new Set(value.tabs.filter((id:unknown):id is string => typeof id === 'string' && docs.has(id)))].slice(0, 10000) :
      snapshot.documents.slice(0, 1).map(d => d.id);
    if ((Array.isArray(value.tabs) && value.tabs.length) && !tabs.length && snapshot.documents.length) tabs.push(snapshot.documents[0].id);
    return { tabs, active: typeof value.active === 'string' && tabs.includes(value.active) ? value.active : tabs[0] || null,
      selectedFolder: typeof value.selectedFolder === 'string' && folders.has(value.selectedFolder) ? value.selectedFolder : snapshot.folders[0]?.id || null,
      expanded: Array.isArray(value.expanded) ? value.expanded.filter((id:unknown):id is string => typeof id === 'string' && folders.has(id)) : [...folders],
      sidebar: value.sidebar !== false, layout: value.layout === 'split' || value.layout === 'editor' || value.layout === 'preview' ? value.layout : 'split',
      split: typeof value.split === 'number' && Number.isFinite(value.split) ? Math.min(85, Math.max(15, value.split)) : 38,
      sync: value.sync !== false, wrap: value.wrap !== false, outline: value.outline === true };
  }
  function write(value:WorkspaceView, storage?:Pick<Storage,'setItem'>) {
    try { (storage || root.localStorage).setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
  }
  const api = { read, reconcile, write };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorkspaceState = api;
})(globalThis);
