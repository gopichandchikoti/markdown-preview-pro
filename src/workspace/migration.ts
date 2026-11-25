(function (root) {
  'use strict';
  const M:ModelAPI = typeof module !== 'undefined' && module.exports ? require('./model') : root.WorkspaceModel;
  /** Runs inside the same readwrite transaction as the marker. Legacy bytes are never normalized or removed. */
  function initialize(state:WorkspaceSnapshot, readLegacy:()=>string|null, names:{folder:string;file:string;welcome?:string}) {
    if (state.meta.some(m => m.key === 'initialized')) return;
    if (state.folders.length || state.documents.length) M.fail('invalidData');
    const content = readLegacy(); // null is absent; an empty string is real saved content.
    if (content !== null && typeof content !== 'string') M.fail('invalidData');
    const now = Date.now();
    const folder = { id: M.id(), parentId: null, name: names.folder, createdAt: now, updatedAt: now, sortOrder: 0 };
    const document:WorkspaceDocument = { id: M.id(), folderId: folder.id, name: names.file, titleMode: 'auto',
      content: content === null ? (names.welcome || '') : content, revision: M.id(), createdAt: now, updatedAt: now, sortOrder: 0 };
    state.folders.push(folder); state.documents.push(document);
    state.meta.push({ key: 'initialized', value: { schemaVersion: 1, legacyImported: content !== null,
      defaultFolderId: folder.id, initialDocumentId: document.id } });
    state.meta.push({ key: 'generation', value: 1 });
    return { documentId: document.id, content: document.content };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { initialize };
  else root.WorkspaceMigration = { initialize };
})(globalThis);
