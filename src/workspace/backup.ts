(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const M:ModelAPI = node ? require('./model') : root.WorkspaceModel;
  const JSONParser:typeof StrictJSON = node ? require('../json') : root.StrictJSON;
  const MAX_BYTES = 32 * 1024 * 1024;
  function isRecord(value:unknown):value is Record<string,unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function validate(value:unknown):BackupData {
    if (!isRecord(value) || value.format !== 'md-preview-pro' || value.version !== 1 ||
        !isRecord(value.metadata) || value.metadata.schemaVersion !== 1 ||
        !Array.isArray(value.folders) || !Array.isArray(value.documents)) return M.fail('backupLimit');
    const records = { folders:value.folders, documents:value.documents };
    M.validateTree(records);
    // The record validator above checks every field before this typed boundary copies the contract.
    return { format:'md-preview-pro', version:1, metadata:{schemaVersion:1},
      folders:records.folders.map((r:WorkspaceFolder) => ({ id:r.id, parentId:r.parentId, name:r.name,
        createdAt:r.createdAt, updatedAt:r.updatedAt, sortOrder:r.sortOrder })),
      documents:records.documents.map((r:WorkspaceDocument) => ({ id:r.id,folderId:r.folderId,name:r.name,
        titleMode:r.titleMode,content:r.content,revision:r.revision,createdAt:r.createdAt,
        updatedAt:r.updatedAt,sortOrder:r.sortOrder })) };
  }
  function decode(bytes:Uint8Array):BackupData {
    if (bytes.byteLength > MAX_BYTES) M.fail('backupLimit');
    try { return validate(JSONParser.parseJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
    catch (error) { if (error instanceof Error && 'code' in error) throw error; return M.fail('backupLimit'); }
  }
  async function readBackup(file:Pick<Blob,'size'|'stream'>):Promise<Uint8Array> {
    if (file.size > MAX_BYTES) return M.fail('backupLimit');
    const reader = file.stream().getReader();
    const chunks:Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > MAX_BYTES - size || chunks.length >= 65536) return M.fail('backupLimit');
        if (value.byteLength) { size += value.byteLength; chunks.push(value); }
      }
    } catch (error) {
      try { await reader.cancel(); } catch { /* Preserve the original import failure. */ }
      throw error;
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  function encode(snapshot:Pick<WorkspaceSnapshot,'folders'|'documents'>):BackupData {
    return { format: 'md-preview-pro', version: 1, metadata: { schemaVersion: 1 },
      folders: structuredClone(snapshot.folders), documents: structuredClone(snapshot.documents) };
  }
  function apply(state:WorkspaceSnapshot, backup:BackupData, mode:string, expectedGeneration:number) {
    if (!['merge', 'replace'].includes(mode)) M.fail('invalidData');
    if (M.generation(state) !== expectedGeneration) M.fail('conflict');
    const validated = validate(backup);
    const folders = structuredClone(validated.folders); const documents = structuredClone(validated.documents);
    if (mode === 'replace') { state.folders = folders; state.documents = documents; }
    else {
      const ids = new Map(folders.map(f => [f.id, M.id()]));
      const mapped = (id:string):string => { const value = ids.get(id); if (!value) return M.fail('invalidParent'); return value; };
      for (const f of folders) {
        f.id = mapped(f.id); f.parentId = f.parentId === null ? null : mapped(f.parentId);
        f.name = M.uniqueName(state.folders, 'parentId', f.parentId, f.name); state.folders.push(f);
      }
      for (const d of documents) {
        d.id = M.id(); d.folderId = mapped(d.folderId); state.documents.push(d);
      }
    }
    // A restore invalidates outstanding editors even when backup revisions match an older workspace.
    for (const d of documents) d.revision = M.id();
    const marker = M.marker(state);
    marker.defaultFolderId = state.folders[0]?.id || null;
    marker.initialDocumentId = state.documents[0]?.id || null;
    M.validateTree(state);
  }
  if (node) { module.exports = { MAX_BYTES, validate, decode, readBackup, encode, apply }; return; }
  const t:ContentAdapter['t'] = (...args) => root.Content.t(...args);
  const byId = UI.html;
  function download(value:string, name:string, type = 'application/json') {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([value], { type })); link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  async function exportWorkspace() {
    const w = root.Workspace;
    try {
      if (!w && root.RawRecovery) {
        download(JSON.stringify({ format: 'md-preview-pro-recovery', version: 1,
          snapshot: root.RawRecovery, activeContent: UI.area('editor').value,
          legacyContent: root.Recovery?.legacy }, null, 2), t('backup.raw')); return;
      }
      let snapshot:Pick<WorkspaceSnapshot,'folders'|'documents'>;
      if (w) {
        root.EditorBridge.capture(w);
        try { snapshot = await w.repository.snapshot(); } catch { snapshot = structuredClone(w.snapshot); }
        for (const s of w.sessions.values()) if (s.dirty) {
          let folder = snapshot.folders.find(f => f.id === s.document.folderId)?.id || snapshot.folders[0]?.id;
          if (!folder) { const now = Date.now(); folder = M.id(); snapshot.folders.push({ id: folder,
            parentId: null, name: t('workspace.defaultFolder'), createdAt: now, updatedAt: now, sortOrder: 0 }); }
          snapshot.documents.push({ ...s.document, id: M.id(), folderId: folder, content: s.content,
            name: M.uniqueName(snapshot.documents, 'folderId', folder, s.document.name), revision: M.id() });
        }
      } else {
        const now = Date.now(); const folder = M.id();
        snapshot = { folders: [{ id: folder, parentId: null, name: t('workspace.defaultFolder'),
          createdAt: now, updatedAt: now, sortOrder: 0 }], documents: [{ id: M.id(), folderId: folder,
          name: t('workspace.defaultFile'), content: UI.area('editor').value, titleMode: 'manual', revision: M.id(),
          createdAt: now, updatedAt: now, sortOrder: 0 }] };
        const legacy = root.Recovery?.legacy;
        if (typeof legacy === 'string' && legacy !== snapshot.documents[0].content)
          snapshot.documents.push({ ...snapshot.documents[0], id: M.id(), content: legacy,
            name: M.uniqueName(snapshot.documents, 'folderId', folder, t('workspace.defaultFile')) });
      }
      const backup = validate(encode(snapshot));
      const serialized = JSON.stringify(backup, null, 2);
      download(serialized, t('backup.filename'));
      w?.notice(t(new TextEncoder().encode(serialized).byteLength > MAX_BYTES ? 'backup.large' : 'backup.exported'));
    } catch (error) {
      const recovery = { format: 'md-preview-pro-recovery', version: 1, snapshot: w?.snapshot,
        drafts: w ? [...w.sessions.values()].map(s => ({ document: s.document, content: s.content })) : [],
        activeContent: UI.area('editor').value };
      download(JSON.stringify(recovery, null, 2), t('backup.raw')); w?.error(error);
    }
  }
  function bind() {
    byId('exportWorkspace').onclick = exportWorkspace;
    byId('importWorkspace').onclick = () => byId('backupFile').click();
    byId('backupFile').onchange = async event => {
      const file = UI.input('backupFile').files?.[0]; UI.input('backupFile').value = '';
      if (!file) return;
      const w = root.Workspace;
      if (!w) { byId('workspaceNotice').textContent = t('common.unavailable'); return; }
      await w.run(async () => {
        if (file.size > MAX_BYTES) M.fail('backupLimit');
        const backup = decode(await readBackup(file));
        if (!await root.EditorBridge.flushAll(w)) M.fail('drafts');
        await w.refresh(); const generation = w.generation();
        const mode = await root.WorkspaceDialog.ask({ title: t('backup.import'), label: t('backup.mode'),
          message: t('backup.preview', { folders: backup.folders.length, documents: backup.documents.length }),
          choices: [{ value: 'merge', label: t('backup.merge') }, { value: 'replace', label: t('backup.replace') }] });
        if (typeof mode !== 'string') return;
        if ([...w.sessions.values()].some(s => s.dirty)) M.fail('drafts');
        await w.repository.change(s => apply(s, backup, mode, generation));
        w.sessions.clear(); w.statuses.clear(); await w.refresh();
        root.EditorBridge.restore(w); w.persist(); w.notice(t('backup.done')); w.broadcast?.();
      });
    };
    byId('persistentStorage').onclick = async () => {
      const answer = await root.WorkspaceDialog.ask({ title: t('storage.persist'), message: t('storage.persistHelp') });
      if (!answer) return;
      let granted = false;
      try { granted = Boolean(await navigator.storage?.persist?.()); } catch { granted = false; }
      byId('workspaceNotice').textContent = t(granted ? 'storage.granted' : 'storage.denied');
    };
  }
  root.WorkspaceBackup = { MAX_BYTES, validate, decode, readBackup, encode, apply, bind, exportWorkspace, download };
})(globalThis);
