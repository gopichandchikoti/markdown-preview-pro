/* Images pasted into documents are stored here, in their own IndexedDB store, and referenced from Markdown as
   ![alt](#img-ID). Text documents therefore stay small and within the per-line limit. Values are data URLs. */
(function (root) {
  'use strict';
  const STORE = 'images';
  const MAX_IMAGES = 300;
  const MAX_DATA_URL = 3_000_000;
  const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
  const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  function wrap<T>(request:IDBRequest<T>):Promise<T> {
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
  function done(tx:IDBTransaction):Promise<void> {
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  }
  function newId() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
  /** A data URL is accepted only when it is a bounded, base64 image of an allowed type. SVG is never accepted. */
  function validData(value:unknown):value is string {
    if (typeof value !== 'string' || value.length > MAX_DATA_URL) return false;
    const match = /^data:(image\/[a-z]+);base64,[A-Za-z0-9+/]+={0,2}$/.exec(value);
    return Boolean(match && TYPES.includes(match[1]));
  }
  class ImageStore {
    db:IDBDatabase;
    constructor(db:IDBDatabase) { this.db = db; }
    private available() { return this.db.objectStoreNames.contains(STORE); }
    async count():Promise<number> { return this.available() ? wrap(this.db.transaction(STORE).objectStore(STORE).count()) : 0; }
    async put(data:string, id = newId()):Promise<string> {
      if (!this.available() || !validData(data) || !ID_PATTERN.test(id)) throw new Error('invalidImage');
      if (await this.count() >= MAX_IMAGES) throw new Error('imageLimit');
      const tx = this.db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put({ id, data, createdAt: Date.now() });
      await done(tx); return id;
    }
    async get(id:string):Promise<string|null> {
      if (!this.available() || !ID_PATTERN.test(id)) return null;
      const record = await wrap<{ data:string }|undefined>(this.db.transaction(STORE).objectStore(STORE).get(id));
      return record && validData(record.data) ? record.data : null;
    }
    async all():Promise<ImageRecord[]> {
      if (!this.available()) return [];
      return (await wrap<ImageRecord[]>(this.db.transaction(STORE).objectStore(STORE).getAll())).filter(r => ID_PATTERN.test(r.id) && validData(r.data));
    }
    /** Restores images from a backup without replacing ones that already exist under the same id. */
    async putMany(images:ReadonlyArray<ImageRecord>):Promise<void> {
      if (!this.available() || !images.length) return;
      const tx = this.db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE);
      for (const image of images.slice(0, MAX_IMAGES)) if (ID_PATTERN.test(image.id) && validData(image.data)) store.put({ id: image.id, data: image.data, createdAt: image.createdAt || Date.now() });
      await done(tx);
    }
    /** Removes images that no document references. Best effort, run at startup. */
    async prune(referenced:ReadonlySet<string>):Promise<void> {
      if (!this.available()) return;
      try {
        const tx = this.db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE);
        const keys = await wrap<IDBValidKey[]>(store.getAllKeys());
        for (const key of keys) if (typeof key === 'string' && !referenced.has(key)) store.delete(key);
        await done(tx);
      } catch { /* best effort */ }
    }
  }
  function referencedIds(documents:ReadonlyArray<{ content:string }>):Set<string> {
    const ids = new Set<string>();
    for (const doc of documents) for (const match of doc.content.matchAll(/#img-([A-Za-z0-9-]{8,64})/g)) ids.add(match[1]);
    return ids;
  }
  const api = { ImageStore, validData, referencedIds, MAX_IMAGES, MAX_DATA_URL, TYPES, ID_PATTERN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorkspaceImages = api;
})(globalThis);
