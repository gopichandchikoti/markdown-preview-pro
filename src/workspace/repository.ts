(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const M:ModelAPI = node ? require('./model') : root.WorkspaceModel;
  const DB:DatabaseAPI = node ? require('./db') : root.WorkspaceDB;
  const migration:typeof WorkspaceMigration = node ? require('./migration') : root.WorkspaceMigration;
  const security:Pick<SecurityAdapter,'validDocument'> = node ? require('../security') : root.MarkdownSecurity;
  class Repository {
    db:IDBDatabase;
    constructor(db:IDBDatabase) { this.db = db; }
    async initialize(readLegacy:()=>string|null, names = { folder: M.text('workspace.defaultFolder'), file: M.text('workspace.defaultFile'), welcome: M.text('guide.welcome') }) {
      const imported = await DB.transact(this.db, 'readwrite', s => {
        const result = migration.initialize(s, readLegacy, names); M.validateTree(s); return result;
      });
      const snapshot = await this.snapshot();
      if (imported && !snapshot.documents.some(d => d.id === imported.documentId && d.content === imported.content))
        M.fail('migrationFailed');
      return snapshot;
    }
    snapshot() {
      return DB.transact(this.db, 'readonly', s => { M.validateTree(s); return s; });
    }
    change<T>(transform:(state:WorkspaceSnapshot)=>T):Promise<T> {
      return DB.transact(this.db, 'readwrite', s => {
        M.validateTree(s);
        const result = transform(s);
        M.validateTree(s);
        const generation = s.meta.find(m => m.key === 'generation');
        if (!generation || !Number.isSafeInteger(generation.value)) M.fail('invalidData');
        if (generation) generation.value++;
        return result;
      });
    }
    createFolder(parentId:string|null, name:string) {
      return this.change(s => {
        const now = Date.now();
        const folder = { id: M.id(), parentId, name: M.normalizeName(name),
          createdAt: now, updatedAt: now, sortOrder: now };
        s.folders.push(folder); return folder;
      });
    }
    createDocument(folderId:string, content = '', name?:string) {
      return this.change(s => {
        if (!security.validDocument(content)) M.fail('documentLimit');
        const now = Date.now();
        const document:WorkspaceDocument = { id: M.id(), folderId, name: name ? M.normalizeName(name, true) :
          M.untitled(s.documents, folderId), titleMode: name ? 'manual' : 'auto', content,
        revision: M.id(), createdAt: now, updatedAt: now, sortOrder: now };
        s.documents.push(document); return document;
      });
    }
    /** Imported files commit together; collision naming runs inside the same transaction. */
    importDocuments(folderId:string|null, documents:ReadonlyArray<MarkdownImport>) {
      return this.change(s => {
        if (!documents.length || documents.length > M.MAX_IMPORT_FILES) return M.fail('markdownBytes');
        const now = Date.now();
        if (!folderId) {
          let folder = s.folders.find(f => f.parentId === null && f.name === M.text('workspace.defaultFolder'));
          if (!folder) { folder = { id:M.id(), parentId:null, name:M.text('workspace.defaultFolder'),
            createdAt:now, updatedAt:now, sortOrder:now }; s.folders.push(folder); }
          folderId = folder.id;
        }
        const imported:WorkspaceDocument[] = [];
        for (const input of documents) {
          if (!security.validDocument(input.content)) return M.fail('documentLimit');
          const name = M.uniqueName(s.documents, 'folderId', folderId, M.normalizeName(input.name, true));
          const document:WorkspaceDocument = { id:M.id(), folderId, name, content:input.content, titleMode:'manual',
            revision:M.id(), createdAt:now, updatedAt:now, sortOrder:now };
          s.documents.push(document); imported.push(document);
        }
        return imported;
      });
    }
    /** Compare-and-swap: a stale editor can never overwrite another window's revision. */
    save(id:string, expectedRevision:string, content:string) {
      return this.change(s => {
        if (!security.validDocument(content)) M.fail('documentLimit');
        const doc = s.documents.find(d => d.id === id);
        if (!doc || doc.revision !== expectedRevision) M.fail('conflict');
        Object.assign(doc, { content, revision: M.id(), updatedAt: Date.now() });
        return doc;
      });
    }
    rename(kind:'documents',id:string,name:string,revision:string):Promise<WorkspaceDocument>;
    rename(kind:'folders',id:string,name:string,revision?:string):Promise<WorkspaceFolder>;
    rename(kind:EntityKind,id:string,name:string,revision?:string):Promise<WorkspaceFolder|WorkspaceDocument>;
    rename(kind:EntityKind, id:string, name:string, expectedRevision?:string) {
      return this.change(s => {
        const record = s[kind].find(r => r.id === id);
        if (!record) M.fail('missing');
        if ('folderId' in record && record.revision !== expectedRevision) M.fail('conflict');
        record.name = M.normalizeName(name, kind === 'documents');
        record.updatedAt = Date.now();
        if ('folderId' in record) { record.titleMode = 'manual'; record.revision = M.id(); }
        return record;
      });
    }
    move(kind:'documents',id:string,parentId:string,revision:string):Promise<WorkspaceDocument>;
    move(kind:EntityKind,id:string,parentId:string|null,revision?:string):Promise<WorkspaceFolder|WorkspaceDocument>;
    move(kind:EntityKind, id:string, parentId:string|null, expectedRevision?:string) {
      return this.change(s => {
        const record = s[kind].find(r => r.id === id);
        if (!record) M.fail('missing');
        if ('folderId' in record && record.revision !== expectedRevision) M.fail('conflict');
        if ('folderId' in record) { if (!parentId) M.fail('invalidParent'); record.folderId = parentId; }
        else record.parentId = parentId;
        record.updatedAt = Date.now();
        if ('folderId' in record) record.revision = M.id();
        return record;
      });
    }
    duplicate(id:string) {
      return this.change(s => {
        const original = s.documents.find(d => d.id === id);
        if (!original) M.fail('missing');
        const copy:WorkspaceDocument = { ...original, id: M.id(), revision: M.id(), titleMode: 'manual', createdAt: Date.now(),
          updatedAt: Date.now(), sortOrder: Date.now(), name: M.uniqueName(s.documents, 'folderId',
            original.folderId, original.name) };
        s.documents.push(copy); return copy;
      });
    }
    duplicateFolder(id:string) {
      return this.change(s => {
        const original = s.folders.find(folder => folder.id === id);
        if (!original) return M.fail('missing');
        const owned = new Set([id]);
        for (let depth = 0; depth < M.MAX_DEPTH; depth++)
          for (const folder of s.folders) if (folder.parentId && owned.has(folder.parentId)) owned.add(folder.id);
        const folders = s.folders.filter(folder => owned.has(folder.id));
        const documents = s.documents.filter(document => owned.has(document.folderId));
        const ids = new Map(folders.map(folder => [folder.id, M.id()]));
        const mapped = (source:string):string => {
          const target = ids.get(source); if (!target) return M.fail('invalidParent'); return target;
        };
        const name = M.uniqueName(s.folders, 'parentId', original.parentId, original.name);
        const now = Date.now();
        const copies = folders.map(folder => ({ ...folder, id:mapped(folder.id),
          parentId:folder.id === id ? folder.parentId : mapped(folder.parentId || ''),
          name:folder.id === id ? name : folder.name, createdAt:now, updatedAt:now, sortOrder:now }));
        s.folders.push(...copies);
        s.documents.push(...documents.map(document => ({ ...document, id:M.id(), folderId:mapped(document.folderId),
          revision:M.id(), createdAt:now, updatedAt:now, sortOrder:now })));
        const copy = copies.find(folder => folder.id === mapped(id));
        if (!copy) return M.fail('missing'); return copy;
      });
    }
    remove(kind:EntityKind, id:string, expectedGeneration:number) {
      return this.change(s => {
        if (M.generation(s) !== expectedGeneration) M.fail('conflict');
        if (kind === 'documents') { s.documents = s.documents.filter(d => d.id !== id); return; }
        const removed = new Set([id]);
        for (let depth = 0; depth < M.MAX_DEPTH; depth++)
          for (const f of s.folders) if (f.parentId && removed.has(f.parentId)) removed.add(f.id);
        s.folders = s.folders.filter(f => !removed.has(f.id));
        s.documents = s.documents.filter(d => !removed.has(d.folderId));
      });
    }
    removeMany(items:ReadonlyArray<{kind:EntityKind;id:string}>, expectedGeneration:number) {
      return this.change(s => {
        if (M.generation(s) !== expectedGeneration) M.fail('conflict');
        const removed = new Set(items.filter(i => i.kind === 'folders').map(i => i.id));
        for (let depth = 0; depth < M.MAX_DEPTH; depth++)
          for (const f of s.folders) if (f.parentId && removed.has(f.parentId)) removed.add(f.id);
        const files = new Set(items.filter(i => i.kind === 'documents').map(i => i.id));
        s.folders = s.folders.filter(f => !removed.has(f.id));
        s.documents = s.documents.filter(d => !files.has(d.id) && !removed.has(d.folderId));
      });
    }
    close() { this.db.close(); }
  }
  if (node) module.exports = { Repository };
  else root.WorkspaceRepository = { Repository };
})(globalThis);
