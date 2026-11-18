(function (root) {
  'use strict';
  const STORES = ['folders', 'documents', 'workspaceMeta'] as const;
  function requestResult<T>(request:IDBRequest<T>):Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function openDatabase(factory:IDBFactory|null = root.indexedDB, name = 'md-preview-pro-workspace'):Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!factory) { reject(new Error('storageUnavailable')); return; }
      const request = factory.open(name, 1);
      let settled = false;
      const timer = setTimeout(() => { settled = true; reject(new Error('storageBlocked')); }, 5000);
      request.onupgradeneeded = () => {
        for (const store of STORES) request.result.createObjectStore(store, { keyPath: store ===
          'workspaceMeta' ? 'key' : 'id' });
      };
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
      request.onblocked = () => { clearTimeout(timer); settled = true; reject(new Error('storageBlocked')); };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }
  /** One serialized transaction. The synchronous transform must never await external work.
   * @param {IDBDatabase} db @param {IDBTransactionMode} mode @param {Function} transform */
  function transact<T>(db:IDBDatabase, mode:IDBTransactionMode, transform:(state:WorkspaceSnapshot)=>T):Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, mode);
      let result:T;
      let failure:unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('transactionFailed'));
      const reads = [requestResult<WorkspaceFolder[]>(tx.objectStore('folders').getAll()),
          requestResult<WorkspaceDocument[]>(tx.objectStore('documents').getAll()),
          requestResult<MetadataRecord[]>(tx.objectStore('workspaceMeta').getAll())] as const;
      Promise.all(reads).then(([folders, documents, meta]) => {
        const state = { folders, documents, meta };
        const before = structuredClone(state);
        result = transform(state);
        if (mode === 'readonly') return;
        for (const [index, key] of (['folders', 'documents', 'meta'] as const).entries()) {
          const store = tx.objectStore(STORES[index]);
          const keyOf = (record:WorkspaceFolder|WorkspaceDocument|MetadataRecord) => 'key' in record ? record.key : record.id;
          const previous = new Map(before[key].map(r => [keyOf(r), JSON.stringify(r)]));
          for (const record of state[key]) {
            const id = keyOf(record);
            if (previous.get(id) !== JSON.stringify(record)) store.put(record);
            previous.delete(id);
          }
          for (const id of previous.keys()) store.delete(id);
        }
      }).catch(error => {
        failure = error;
        try { tx.abort(); }
        catch (abortError) { if (!(abortError instanceof DOMException && abortError.name === 'InvalidStateError')) reject(abortError); }
      });
    });
  }
  const api = { openDatabase, transact };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorkspaceDB = api;
})(globalThis);
