export {};
const WorkspaceGeneration = (s:WorkspaceSnapshot):number => {
 const record=s.meta.find(m=>m.key==='generation'); if (!record) throw Error('Missing generation'); return record.value;
};
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { IDBFactory }:{IDBFactory:new()=>IDBFactory} = require('fake-indexeddb');
const { Repository }:typeof WorkspaceRepository = require('../src/workspace/repository');
const { openDatabase }:Pick<DatabaseAPI,'openDatabase'> = require('../src/workspace/db');
const B:Pick<BackupAPI,'MAX_BYTES'|'validate'|'decode'|'encode'|'apply'> = require('../src/workspace/backup');
const { readBackup }:{readBackup(file:Pick<Blob,'size'|'stream'>):Promise<Uint8Array>} =
  require('../src/workspace/backup');
const { parseJSON } = require('../src/json');
test('backup round trip preserves structure/content; merge remaps IDs; replace invalidates revisions atomically', async () => {
  const r = new Repository(await openDatabase(new IDBFactory()));
  const initial = await r.initialize(() => 'Exact\r\n🌿');
  const folder = await r.createFolder(initial.folders[0].id, 'Nested');
  await r.createDocument(folder.id, 'Content', 'Nested note');
  const snapshot = await r.snapshot(); const backup = B.encode(snapshot);
  const decoded = B.decode(new TextEncoder().encode(JSON.stringify(backup)));
  assert.deepEqual(decoded, backup);
  const generation = (s:WorkspaceSnapshot) => WorkspaceGeneration(s);
  await r.change(s => B.apply(s, decoded, 'merge', generation(s)));
  assert.equal((await r.snapshot()).documents.length, 4);
  await r.change(s => B.apply(s, decoded, 'replace', generation(s)));
  const restored = await r.snapshot();
  assert.deepEqual(restored.folders, snapshot.folders);
  const withoutRevision = (docs:WorkspaceDocument[]) => docs.map(({ revision, ...rest }) => rest);
  assert.deepEqual(withoutRevision(restored.documents), withoutRevision(snapshot.documents));
  assert.notEqual(restored.documents[0].revision, snapshot.documents[0].revision);
  await assert.rejects(r.change(s => B.apply(s, decoded, 'replace', 1)), /conflict/);
  r.close();
});
test('untrusted backups reject size, invalid UTF-8, bad schema, references, cycles, names and duplicate JSON keys', () => {
  assert.throws(() => B.decode(new Uint8Array(B.MAX_BYTES + 1)), /backupLimit/);
  for (const bytes of [new Uint8Array([255]), new TextEncoder().encode('{"version":1,"version":2}')])
    assert.throws(() => B.decode(bytes));
  assert.throws(() => B.validate({ format: 'md-preview-pro', version: 9 }), /backupLimit/);
  assert.throws(() => parseJSON('{"a":1,"\u0061":2}'), /duplicateKey/);
  assert.throws(() => parseJSON('['.repeat(101) + '0' + ']'.repeat(101)), /invalidData/);
  assert.deepEqual(parseJSON('{"string":"a\\\"{}[]","nested":{"a":1},"array":[{"a":2}]}'),
    { string: 'a"{}[]', nested: { a: 1 }, array: [{ a: 2 }] });
});
test('backup validation rejects every invalid record before a replacement can touch stored data', async () => {
  const r = new Repository(await openDatabase(new IDBFactory()));
  const state = await r.initialize(() => 'original'); const good = B.encode(state);
  const mutations:Array<(b:BackupData)=>void> = [
    b => { b.documents[0].folderId = 'missing'; },
    b => { b.folders[0].parentId = b.folders[0].id; },
    b => { b.documents[0].name = '../escape.md'; },
    b => { Object.assign(b.documents[0],{titleMode:'unknown'}); },
    b => { b.documents[0].revision = ''; },
    b => { Object.assign(b.documents[0],{content:7}); },
    b => { b.documents.push({ ...b.documents[0] }); },
    b => { b.folders[0].updatedAt = Infinity; },
    b => { Object.assign(b.folders[0],{id:null}); },
    b => { Object.assign(b.folders[0], { folderId:b.folders[0].id }); },
    b => { Object.assign(b.documents[0], { parentId:null }); }
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(good); mutate(bad);
    await assert.rejects(r.change(s => B.apply(s, bad, 'replace', WorkspaceGeneration(s))));
    assert.equal((await r.snapshot()).documents[0].content, 'original');
  }
  r.close();
});
test('backup reader bounds actual streamed bytes before retaining chunks and cancels on overflow', async () => {
  const bytes = new TextEncoder().encode('{"safe":true}');
  const valid = await readBackup(new Blob([bytes]));
  assert.deepEqual(valid, bytes);
  let cancelled = false;
  const oversized = { size:1, stream:() => new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) { controller.enqueue(new Uint8Array(B.MAX_BYTES)); controller.enqueue(new Uint8Array(1)); },
    cancel() { cancelled = true; }
  }) };
  await assert.rejects(readBackup(oversized), /backupLimit/);
  assert.equal(cancelled, true);
  await assert.rejects(readBackup({size:B.MAX_BYTES + 1, stream:() => { throw Error('must not read'); }}), /backupLimit/);
});
