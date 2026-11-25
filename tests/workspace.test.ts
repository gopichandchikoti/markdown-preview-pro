export {};
const WorkspaceGeneration = (s:WorkspaceSnapshot):number => {
 const record=s.meta.find(m=>m.key==='generation'); if (!record) throw Error('Missing generation'); return record.value;
};
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { IDBFactory }:{IDBFactory:new()=>IDBFactory} = require('fake-indexeddb');
const { openDatabase, transact }:DatabaseAPI = require('../src/workspace/db');
const { Repository }:typeof WorkspaceRepository = require('../src/workspace/repository');
const M:ModelAPI = require('../src/workspace/model');
const names = { folder: 'My Notes', file: 'Untitled 1.md' };
async function fixture(legacy:string|null = null) {
  const factory = new IDBFactory();
  const repository = new Repository(await openDatabase(factory));
  const state = await repository.initialize(() => legacy, names);
  return { factory, repository, state };
}
for (const [label, content] of [['absent', null], ['empty', ''], ['normal', '# Exact\r\n café 📝\r\n'],
  ['oversized', 'x'.repeat(200001)]]) {
  test(`migration preserves ${label} byte-for-byte and initializes once across connections`, async () => {
    const { factory, repository, state } = await fixture(content);
    const second = new Repository(await openDatabase(factory));
    await second.initialize(() => { throw Error('must not read legacy again'); }, names);
    const after = await repository.snapshot();
    assert.equal(after.folders.length, 1); assert.equal(after.documents.length, 1);
    assert.equal(after.documents[0].content, content ?? '');
    assert.equal(after.documents[0].id, state.documents[0].id);
    repository.close(); second.close();
  });
}
test('interrupted migration rolls back marker and entities; retry imports original bytes', async () => {
  const repository = new Repository(await openDatabase(new IDBFactory()));
  await assert.rejects(repository.initialize(() => 'legacy', { folder: '../bad', file: names.file }));
  assert.deepEqual((await repository.snapshot()).documents, []);
  await assert.rejects(repository.initialize(() => { throw Error('denied'); }, names), /denied/);
  const state = await repository.initialize(() => 'legacy', names);
  assert.equal(state.documents[0].content, 'legacy'); repository.close();
});
test('simultaneous first launches create only one document', async () => {
  const factory = new IDBFactory();
  const a = new Repository(await openDatabase(factory));
  const b = new Repository(await openDatabase(factory));
  await Promise.all([a.initialize(() => 'a', names), b.initialize(() => 'b', names)]);
  assert.equal((await a.snapshot()).documents.length, 1); a.close(); b.close();
});
test('CRUD retains IDs, checks names and cycles, duplicates with new identity, deletes subtree atomically', async () => {
  const { repository: r, state } = await fixture();
  const parent = state.folders[0];
  const sub = await r.createFolder(parent.id, 'Child');
  const deep = await r.createFolder(sub.id, 'Deep');
  const doc = await r.createDocument(sub.id);
  const renamed = await r.rename('documents', doc.id, 'Project.MD', doc.revision);
  assert.equal(renamed.name, 'Project.md');
  const moved = await r.move('documents', doc.id, deep.id, renamed.revision);
  assert.equal(moved.id, doc.id);
  const copy = await r.duplicate(doc.id); assert.notEqual(copy.id, doc.id);
  assert.equal(copy.name, 'Project (2).md');
  await assert.rejects(r.move('folders', parent.id, deep.id), /folderCycle/);
  await assert.rejects(r.createDocument(deep.id, '', 'project.md'), /duplicateName/);
  await assert.rejects(r.rename('documents', moved.id, '../escape', moved.revision), /invalidName/);
  await r.remove('folders', sub.id, WorkspaceGeneration(await r.snapshot()));
  assert.equal((await r.snapshot()).documents.length, 1); r.close();
});
test('stale/concurrent saves, stale rename and stale delete cannot overwrite data', async () => {
  const { repository: r, state } = await fixture();
  const d = state.documents[0];
  const writes = await Promise.allSettled([r.save(d.id, d.revision, 'first'), r.save(d.id, d.revision, 'second')]);
  assert.equal(writes.filter(w => w.status === 'fulfilled').length, 1);
  assert.equal(writes.filter(w => w.status === 'rejected')[0].reason.code, 'conflict');
  await assert.rejects(r.rename('documents', d.id, 'stale', d.revision), /conflict/);
  await assert.rejects(r.remove('documents', d.id, 1), /conflict/);
  assert.equal((await r.snapshot()).documents[0].content, 'first'); r.close();
});
test('failed transactions never commit partial data; unavailable storage rejects', async () => {
  const { repository: r, state } = await fixture();
  await assert.rejects(transact(r.db, 'readwrite', s => { s.documents.length = 0; throw Error('quota'); }), /quota/);
  assert.equal((await r.snapshot()).documents[0].id, state.documents[0].id);
  await assert.rejects(openDatabase(null), /storageUnavailable/);
  await assert.rejects(r.save(state.documents[0].id, state.documents[0].revision, 'a'.repeat(10001)), /documentLimit/);
  r.close();
});
test('validates record references, bounds, duplicate identities and unsafe names', () => {
  for (const name of ['../foo', 'CON.md', '.', 'a/b', 'a\\b', 'x'.repeat(101), '\0'])
    assert.throws(() => M.normalizeName(name), /invalidName/);
  assert.throws(() => M.validateTree({ folders: [], documents: Array(10001).fill({}) }), /itemLimit/);
});
test('corrupt workspace metadata is rejected without repairing or overwriting original records', async () => {
  const { repository: r, state } = await fixture('Original body');
  await transact(r.db, 'readwrite', s => { const record=s.meta.find(m=>m.key==='generation'); if(record) Object.assign(record,{value:'corrupt'}); });
  await assert.rejects(r.snapshot(), /invalidData/);
  const raw = await transact(r.db, 'readonly', s => s);
  assert.equal(raw.documents[0].content, 'Original body');
  assert.equal(raw.documents[0].id, state.documents[0].id); r.close();
});
test('folder duplication copies a complete subtree with new independent folder/document identities', async () => {
  const { repository:r, state } = await fixture('Root body');
  const root = state.folders[0];
  const child = await r.createFolder(root.id, 'Child');
  const nested = await r.createDocument(child.id, 'Nested body', 'Nested');
  const copy = await r.duplicateFolder(root.id);
  assert.equal(copy.name, 'My Notes (2)'); assert.notEqual(copy.id, root.id);
  const snapshot = await r.snapshot();
  const copiedChild = snapshot.folders.find(folder => folder.parentId === copy.id);
  assert.ok(copiedChild); assert.notEqual(copiedChild.id, child.id);
  const copiedDocument = snapshot.documents.find(document => document.folderId === copiedChild.id);
  assert.ok(copiedDocument); assert.notEqual(copiedDocument.id, nested.id);
  assert.equal(copiedDocument.content, 'Nested body');
  await r.save(copiedDocument.id, copiedDocument.revision, 'Changed copy');
  assert.equal((await r.snapshot()).documents.find(document => document.id === nested.id)?.content, 'Nested body');
  assert.equal((await r.duplicateFolder(root.id)).name, 'My Notes (3)'); r.close();
});
test('removeMany deletes checked files and folder subtrees in one transaction and rejects stale generations', async () => {
  const { repository: r, state } = await fixture();
  const parent = state.folders[0];
  const a = await r.createFolder(parent.id, 'A'); const b = await r.createFolder(a.id, 'B');
  const inA = await r.createDocument(b.id); const keep = await r.createDocument(parent.id, '', 'keep.md');
  const lone = await r.createDocument(parent.id, '', 'lone.md');
  await assert.rejects(r.removeMany([{ kind: 'folders', id: a.id }], 1), /conflict/);
  await r.removeMany([{ kind: 'folders', id: a.id }, { kind: 'documents', id: lone.id }], WorkspaceGeneration(await r.snapshot()));
  const s = await r.snapshot();
  assert.ok(!s.folders.some(f => f.id === a.id || f.id === b.id));
  assert.ok(!s.documents.some(d => d.id === inA.id || d.id === lone.id));
  assert.ok(s.documents.some(d => d.id === keep.id)); r.close();
});
