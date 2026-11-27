export {};
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { IDBFactory }:{IDBFactory:new()=>IDBFactory} = require('fake-indexeddb');
const { openDatabase }:DatabaseAPI = require('../src/workspace/db');
const { ImageStore, validData, referencedIds } = require('../src/workspace/images');
const BackupApi:BackupAPI = require('../src/workspace/backup');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const names = { folder: 'My Notes', file: 'Untitled 1.md' };

test('image data URLs accept only bounded base64 raster images', () => {
  assert.equal(validData(PNG), true);
  assert.equal(validData('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(validData('data:text/html;base64,PGI+'), false);
  assert.equal(validData('https://example.com/a.png'), false);
  assert.equal(validData('data:image/png;base64,' + 'A'.repeat(3_000_001)), false);
});

test('store saves, reads, restores and prunes unreferenced images; bad input is rejected', async () => {
  const db = await openDatabase(new IDBFactory()); const store = new ImageStore(db);
  const id = await store.put(PNG);
  assert.equal(await store.get(id), PNG);
  await assert.rejects(store.put('data:image/svg+xml;base64,PHN2Zz4='), /invalidImage/);
  await assert.rejects(store.put(PNG, '../bad'), /invalidImage/);
  await store.putMany([{ id: 'restored-0001', data: PNG }, { id: 'bad id', data: PNG }]);
  assert.equal(await store.get('restored-0001'), PNG); assert.equal(await store.get('bad id'), null);
  await store.prune(new Set(['restored-0001']));
  assert.equal(await store.get(id), null); assert.equal(await store.get('restored-0001'), PNG); db.close();
});

test('referencedIds finds image ids in document text', () => {
  const ids = referencedIds([{ content: 'a ![x](#img-abcd1234) b ![y](#img-ef567890-aa)' }, { content: '#img-short' }]);
  assert.deepEqual([...ids].sort(), ['abcd1234', 'ef567890-aa']);
});

test('backups carry only referenced, valid images and survive validate round trips', () => {
  const now = Date.now();
  const snapshot = { folders: [{ id: 'f1', parentId: null, name: 'My Notes', createdAt: now, updatedAt: now, sortOrder: 0 }],
    documents: [{ id: 'd1', folderId: 'f1', name: 'A.md', titleMode: 'manual' as const, content: '![i](#img-abcd1234)', revision: 'r1', createdAt: now, updatedAt: now, sortOrder: 0 }] };
  const backup = BackupApi.validate(BackupApi.encode(snapshot, [{ id: 'abcd1234', data: PNG }, { id: 'unused001', data: PNG }]));
  assert.deepEqual(backup.images, [{ id: 'abcd1234', data: PNG }]);
  const tampered = JSON.parse(JSON.stringify(backup)); tampered.images.push({ id: 'evilevil', data: 'data:image/svg+xml;base64,PHN2Zz4=' }, { id: 'x', data: PNG });
  assert.equal(BackupApi.validate(tampered).images?.length, 1);
  assert.equal(BackupApi.validate(BackupApi.encode({ folders: snapshot.folders, documents: [] })).images, undefined);
  void names;
});
