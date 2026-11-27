export {};
/* Boots the real index.html and every script in page order inside JSDOM, backed by fake-indexeddb.
   Tests drive the app through the same buttons a person clicks. */
const { JSDOM } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { after } = require('node:test');
const openApps = new Set<{ close():void }>();
after(() => { for (const app of openApps) { try { app.close(); } catch { /* already closed */ } } });

const ROOT = join(__dirname, '../../..');
type Win = Window & typeof globalThis & Record<string, any>;

function scriptPaths(html:string) {
  return [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
}
function polyfillDialog(window:Win) {
  const proto = window.HTMLDialogElement.prototype as any;
  proto.showModal = function () { this.setAttribute('open', ''); };
  proto.show = proto.showModal;
  proto.close = function (value?:string) { if (value !== undefined) this.returnValue = value; this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
}
async function until(check:()=>boolean, label:string, ms = 4000) {
  const end = Date.now() + ms;
  while (!check()) { if (Date.now() > end) throw new Error('timed out waiting for ' + label); await new Promise(r => setTimeout(r, 10)); }
}
async function bootApp(options:{ narrow?:boolean; storage?:'ok'|'blocked'; legacy?:string; factory?:any; skip?:string[] } = {}) {
  const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
  const dom = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:4175/' });
  const window = dom.window as unknown as Win;
  polyfillDialog(window);
  const errors:string[] = [];
  window.addEventListener('error', event => errors.push(String((event as ErrorEvent).message)));
  window.matchMedia = ((query:string) => ({ matches: !!options.narrow && /max-width/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  window.scrollTo = () => {}; (window as any).structuredClone = structuredClone; (window as any).TextEncoder = TextEncoder; (window as any).TextDecoder = TextDecoder; (window as any).Blob = window.Blob;
  (window.HTMLElement.prototype as any).scrollIntoView = function () {};
  (window as any).indexedDB = options.storage === 'blocked' ? undefined : (options.factory ?? new IDBFactory());
  (window as any).IDBKeyRange = IDBKeyRange;
  (window as any).BroadcastChannel = class { onmessage:any; postMessage() {} close() {} addEventListener() {} };
  const blobs = new Map<string, Blob>(); let blobCount = 0; (window as any).URL.createObjectURL = (blob:Blob) => { const url = 'blob:test/' + (++blobCount); blobs.set(url, blob); return url; }; (window as any).URL.revokeObjectURL = () => {};
  (window as any).print = () => { (window as any).__printed = ((window as any).__printed || 0) + 1; };
  (window as any).__downloads = [];
  const originalClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { if (this.download) (window as any).__downloads.push({ name: this.download, href: this.href }); else originalClick.call(this); };
  (window.Blob.prototype as any).stream = function () { const blob = this as Blob; return new ReadableStream({ async start(controller) {
    const buffer:ArrayBuffer = await new Promise(resolve => { const r = new window.FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.readAsArrayBuffer(blob); });
    controller.enqueue(new Uint8Array(buffer)); controller.close(); } }); };
  let confirmAnswer = true; (window as any).confirm = () => confirmAnswer;
  const written:string[] = [];
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (text:string) => { written.push(text); }, write: async () => {} }, configurable: true });
  if (options.legacy !== undefined) window.localStorage.setItem('md-preview-pro-content', options.legacy);
  for (const src of scriptPaths(html)) {
    if (options.skip?.some(name => src.endsWith(name))) continue;
    const file = src.startsWith('vendor/') ? join(ROOT, 'public', src) : join(ROOT, 'dist', src);
    let code:string;
    try { code = readFileSync(file, 'utf8'); } catch { code = readFileSync(join(ROOT, 'public', src), 'utf8'); }
    const tag = window.document.createElement('script'); tag.textContent = code + '\n//# sourceURL=' + src; window.document.head.appendChild(tag);
  }
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  const app = {
    window, document: window.document, errors, clipboard: written, factory: (window as any).indexedDB,
    $<T extends HTMLElement = HTMLElement>(id:string) { const el = window.document.getElementById(id); if (!el) throw new Error('no #' + id); return el as T; },
    q<T extends HTMLElement = HTMLElement>(selector:string) { const el = window.document.querySelector<T>(selector); if (!el) throw new Error('no ' + selector); return el; },
    click(target:string|Element) { (typeof target === 'string' ? app.$(target) : target).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); },
    key(target:EventTarget, key:string, init:KeyboardEventInit = {}) { target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })); },
    type(text:string) { const ed = app.$<HTMLTextAreaElement>('editor'); ed.value = text; ed.dispatchEvent(new window.Event('input', { bubbles: true })); },
    get w():any { return (window as any).Workspace; },
    get tabs() { return [...window.document.querySelectorAll('#documentTabs [role=tab]')]; },
    async ready() { await until(() => !!(window as any).Workspace || !!(window as any).RawRecovery || window.document.getElementById('workspaceNotice')!.textContent !== '', 'workspace'); await app.settle(); },
    async settle(ms = 60) { await new Promise(r => setTimeout(r, ms)); },
    until,
    transfer() { const data:Record<string,string> = {}; return { data, types: [] as string[], files: [] as File[], items: [] as any[], effectAllowed: '', dropEffect: '', setData(k:string, v:string) { data[k] = v; if (!this.types.includes(k)) this.types.push(k); }, getData(k:string) { return data[k] || ''; } }; },
    fire(target:EventTarget, type:string, dataTransfer:any) { const ev = new window.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'dataTransfer', { value: dataTransfer }); target.dispatchEvent(ev); return ev; },
    drag(source:Element, target:Element) { const dt = app.transfer(); app.fire(source, 'dragstart', dt); app.fire(target, 'dragenter', dt); app.fire(target, 'dragover', dt); app.fire(target, 'drop', dt); app.fire(source, 'dragend', dt); },
    setFiles(input:HTMLInputElement, files:File[]) { Object.defineProperty(input, 'files', { value: files, configurable: true }); input.dispatchEvent(new window.Event('change', { bubbles: true })); },
    downloads():Array<{ name:string; href:string }> { return (window as any).__downloads; },
    readBlob(href:string):Promise<string> { return new Promise((resolve, reject) => { const blob = blobs.get(href); if (!blob) { reject(new Error('no blob ' + href)); return; } const r = new window.FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsText(blob); }); },
    async lastDownloadText() { const d = app.downloads().at(-1); if (!d) throw new Error('nothing downloaded'); return { name: d.name, text: await app.readBlob(d.href) }; },
    toast() { return app.$('toast').textContent || ''; },
    fileOf(name:string, type:string, content:string|Uint8Array) { return new window.File([content as any], name, { type }); },
    setConfirm(value:boolean) { confirmAnswer = value; },
    rows() { return [...window.document.querySelectorAll<HTMLButtonElement>('#explorerTree [role=treeitem]')]; },
    row(name:string) { const r = app.rows().find(x => (x.textContent || '').includes(name)); if (!r) throw new Error('no explorer row ' + name + ' in ' + app.rows().map(x => x.textContent).join('|')); return r; },
    dialogOpen() { return app.$('workspaceDialog').hasAttribute('open'); },
    async answer(value?:string) {
      await until(() => app.dialogOpen(), 'dialog to open');
      const form = app.$('workspaceDialog').querySelector('form')!;
      if (value !== undefined) { const input = form.querySelector<HTMLInputElement|HTMLSelectElement>('#dialogValue'); if (!input) throw new Error('dialog has no field'); input.value = value; }
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await app.settle();
    },
    async cancelDialog() { await until(() => app.dialogOpen(), 'dialog to open'); app.click(app.$('workspaceDialog').querySelector('button[type=button]')!); await app.settle(); },
    names() { return app.w.snapshot.documents.map((d:any) => d.name).sort(); },
    async newFile() { const before = app.w.snapshot.documents.length; app.click('explorerNew'); await until(() => app.w.snapshot.documents.length === before + 1, 'new document'); await app.settle(); },
    close() { window.close(); },
  };
  openApps.add(app);
  return app;
}
module.exports = { bootApp, until };
