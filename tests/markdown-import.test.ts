import { test } from 'node:test';
import assert from 'node:assert/strict';
const { IDBFactory }:{IDBFactory:new()=>IDBFactory} = require('fake-indexeddb');
const { Repository }:typeof WorkspaceRepository = require('../src/workspace/repository');
const { openDatabase }:Pick<DatabaseAPI,'openDatabase'> = require('../src/workspace/db');
const files:typeof MarkdownFiles = require('../src/workspace/markdown-files');

function file(name:string, content:string|Uint8Array<ArrayBuffer>):MarkdownFile {
  const blob = new Blob([content]);
  return { name, size:blob.size, stream:() => blob.stream() };
}
async function fixture() {
  const repository = new Repository(await openDatabase(new IDBFactory()));
  const state = await repository.initialize(() => 'Original');
  return { repository, folder:state.folders[0].id };
}
test('Markdown reader preserves empty bodies, Unicode, BOM and CRLF and normalizes only the extension', async () => {
  const body = '\ufeff# Café 📝\r\n\r\nExact text\r\n';
  assert.deepEqual(await files.read([file('Shared file.MD', body), file('Empty.md', '')]),
    [{ name:'Shared file.md', content:body }, { name:'Empty.md', content:'' }]);
});
test('Markdown reader refuses wrong extensions, unsafe names, invalid UTF-8, binary and parser-limit input', async () => {
  for (const name of ['note.txt', 'note.md.exe', 'folder', ''])
    await assert.rejects(files.read([file(name, 'text')]), /markdownType/);
  for (const name of ['../note.md', 'CON.md'])
    await assert.rejects(files.read([file(name, 'text')]), /invalidName/);
  for (const content of [new Uint8Array([255]), 'binary\0body'])
    await assert.rejects(files.read([file('bad.md', content)]), /markdownEncoding/);
  for (const content of ['x'.repeat(10001), 'x\n'.repeat(10000), ('x'.repeat(9999) + '\n').repeat(21)])
    await assert.rejects(files.read([file('large.md', content)]), /documentLimit/);
});
test('Markdown byte limits precede reads and actual overflow cancels a dishonest stream', async () => {
  await assert.rejects(files.read([]), /markdownBytes/);
  await assert.rejects(files.read(Array.from({length:33}, () => file('note.md', ''))), /markdownBytes/);
  await assert.rejects(files.read([{name:'big.md', size:files.MAX_FILE_BYTES + 1,
    stream() { throw Error('must not open the oversized stream'); }}]), /markdownBytes/);
  let cancelled = false;
  await assert.rejects(files.read([{name:'dishonest.md',size:1,
    stream:() => new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) { controller.enqueue(new Uint8Array(files.MAX_FILE_BYTES));
        controller.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; }
    }) }]), /markdownBytes/);
  assert.equal(cancelled, true);
});
test('Markdown reader bounds aggregate bytes and reports file-read failures without a partial result', async () => {
  const body = ('é'.repeat(9999) + '\n').repeat(20);
  await assert.rejects(files.read(Array.from({length:23}, () => file('note.md',body))), /markdownBytes/);
  await assert.rejects(files.read([file('valid.md','good'), {name:'unreadable.md',size:1,
    stream() { throw new DOMException('denied', 'NotReadableError'); }}]), /markdownRead/);
});
test('transactional Markdown import retains filenames and creates independent IDs with safe collisions', async () => {
  const {repository:r,folder} = await fixture();
  const imported = await r.importDocuments(folder,[{name:'Shared.md',content:'# First'},
    {name:'shared.MD',content:'# Second'}]);
  assert.deepEqual(imported.map(d => d.name),['Shared.md','shared (2).md']);
  assert.ok(imported.every(d => d.titleMode === 'manual')); assert.notEqual(imported[0].id,imported[1].id);
  const concurrent = await Promise.all([r.importDocuments(folder,[{name:'Shared.md',content:'third'}]),
    r.importDocuments(folder,[{name:'Shared.md',content:'fourth'}])]);
  assert.deepEqual(concurrent.map(batch => batch[0].name), ['Shared (3).md','Shared (4).md']);
  assert.equal((await r.snapshot()).documents.find(d => d.name === 'Untitled 1.md')?.content,'Original');
  r.close();
});
test('invalid import rolls back the entire batch, including a newly created fallback folder', async () => {
  const {repository:r,folder} = await fixture();
  const before = await r.snapshot();
  await assert.rejects(r.importDocuments(folder,[{name:'Good.md',content:'good'},
    {name:'Bad.md',content:'x'.repeat(10001)}]), /documentLimit/);
  await assert.rejects(r.importDocuments('missing',[{name:'Good.md',content:'good'}]), /invalidParent/);
  await assert.rejects(r.importDocuments(folder,[]), /markdownBytes/);
  assert.deepEqual(await r.snapshot(), before);
  await r.remove('folders',folder,WorkspaceModelGeneration(before));
  const empty = await r.snapshot();
  await assert.rejects(r.importDocuments(null,[{name:'Good.md',content:'good'},
    {name:'../Bad.md',content:'bad'}]), /invalidName/);
  assert.deepEqual(await r.snapshot(), empty);
  const [created] = await r.importDocuments(null,[{name:'Recovered.md',content:'new folder'}]);
  assert.equal((await r.snapshot()).folders[0].id,created.folderId); r.close();
});
function WorkspaceModelGeneration(state:WorkspaceSnapshot):number {
  const record = state.meta.find(m => m.key === 'generation');
  if (!record) throw Error('Missing generation'); return record.value;
}
