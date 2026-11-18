/* Shared domain contract; no DOM or storage side effects. */
(function (root) {
  'use strict';
  const MAX_ITEMS = 10000;
  const MAX_DEPTH = 64;
  const MAX_IMPORT_FILES = 32;
  const id = () => root.crypto.randomUUID();
  const copy:Record<string,string>|null = typeof module !== 'undefined' && module.exports ?
    require('../../public/markdown-preview-pro.model.json').locales.en : null;
  const text = (key:string, values:Record<string,string|number> = {}) => root.Content ? root.Content.t(key, values) :
    (copy || {})[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  class WorkspaceError extends Error {
    code:string;
    constructor(code:string) { super(code); this.name = 'WorkspaceError'; this.code = code; }
  }
  const fail = (code:string):never => { throw new WorkspaceError(code); };
  function normalizeName(value:string, file = false):string {
    if (typeof value !== 'string') return fail('invalidName');
    let name = value.normalize('NFC').trim().replace(/[. ]+$/g, '');
    if (file) name = name.replace(/(?:\.md)+$/i, '') + '.md';
    if (!name || name === '.md' || name.length > 100 || /[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name === '.' || name === '..')
      return fail('invalidName');
    return name;
  }
  function uniqueName<T extends {id:string;name:string}>(records:T[], parentKey:keyof T, parentId:string|null, desired:string, exclude?:string):string {
    const used = new Set(records.filter(r => r[parentKey] === parentId && r.id !== exclude)
      .map(r => r.name.toLowerCase()));
    if (!used.has(desired.toLowerCase())) return desired;
    const extension = parentKey === 'folderId' ? '.md' : '';
    const stem = extension ? desired.slice(0, -3) : desired;
    for (let i = 2; i <= MAX_ITEMS + 1; i++) {
      const candidate = stem.slice(0, 85) + ' (' + i + ')' + extension;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
    return fail('itemLimit');
  }
  function untitled(documents:WorkspaceDocument[], folderId:string):string {
    const names = new Set(documents.filter(d => d.folderId === folderId).map(d => d.name.toLowerCase()));
    for (let i = 1; i <= MAX_ITEMS + 1; i++) {
      const name = text('workspace.untitled', { number: i });
      if (!names.has(name.toLowerCase())) return name;
    }
    return fail('itemLimit');
  }
  function validateTree({ folders, documents, meta }:{folders:WorkspaceFolder[];documents:WorkspaceDocument[];meta?:MetadataRecord[]}):true {
    if (!Array.isArray(folders) || !Array.isArray(documents) || folders.length + documents.length > MAX_ITEMS)
      return fail('itemLimit');
    const all = [...folders, ...documents];
    for (const folder of folders) if (!folder || typeof folder !== 'object' ||
        !Object.hasOwn(folder, 'parentId') || Object.hasOwn(folder, 'folderId')) return fail('invalidData');
    for (const document of documents) if (!document || typeof document !== 'object' ||
        !Object.hasOwn(document, 'folderId') || Object.hasOwn(document, 'parentId')) return fail('invalidData');
    if (meta !== undefined && (all.length || meta.length)) {
      const marker = meta.find(m => m.key === 'initialized')?.value;
      const generation = meta.find(m => m.key === 'generation')?.value;
      if (!marker || marker.schemaVersion !== 1 || typeof marker.legacyImported !== 'boolean' ||
          typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 1 || generation >= Number.MAX_SAFE_INTEGER)
        return fail('invalidData');
    }
    const ids = new Set();
    for (const r of all) {
      if (!r || typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(r.id) || ids.has(r.id))
        return fail('invalidData');
      ids.add(r.id);
      if (![r.createdAt, r.updatedAt, r.sortOrder].every(n => Number.isSafeInteger(n) && n >= 0))
        return fail('invalidData');
    }
    const byId = new Map(folders.map(f => [f.id, f]));
    const names = new Set();
    for (const r of all) {
      const file = 'folderId' in r;
      const parent = 'folderId' in r ? r.folderId : r.parentId;
      if ((file && (!parent || !byId.has(parent))) || (!file && parent !== null && !byId.has(parent)))
        return fail('invalidParent');
      if (normalizeName(r.name, file) !== r.name) return fail('invalidName');
      const key = JSON.stringify([file, parent, r.name.toLowerCase()]);
      if (names.has(key)) return fail('duplicateName');
      names.add(key);
      if (file && (typeof r.content !== 'string' || !['auto', 'manual'].includes(r.titleMode) ||
          typeof r.revision !== 'string' || !r.revision || r.revision.length > 80)) return fail('invalidData');
    }
    for (const folder of folders) {
      const seen = new Set([folder.id]);
      let parent = folder.parentId;
      while (parent !== null) {
        if (seen.has(parent) || seen.size >= MAX_DEPTH) return fail('folderCycle');
        seen.add(parent); parent = byId.get(parent)?.parentId ?? null;
      }
    }
    return true;
  }
  function generation(state:WorkspaceSnapshot):number {
    const value = state.meta.find(m => m.key === 'generation')?.value;
    if (typeof value !== 'number') return fail('invalidData');
    return value;
  }
  function marker(state:WorkspaceSnapshot):InitializationMarker {
    const value = state.meta.find(m => m.key === 'initialized')?.value;
    if (!value) return fail('invalidData');
    return value;
  }
  const api = { MAX_ITEMS, MAX_DEPTH, MAX_IMPORT_FILES, id, fail, text, generation, marker,
    WorkspaceError, normalizeName, uniqueName, untitled, validateTree };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorkspaceModel = api;
})(globalThis);
