/* Bounded local reads shared by workspace backups and Markdown imports. */
(function (root) {
  'use strict';
  interface ReadOptions { maxBytes:number; overflowCode:string }
  async function read(file:Pick<Blob,'size'|'stream'>, options:ReadOptions):Promise<Uint8Array> {
    const { maxBytes, overflowCode } = options;
    const overflow = ():never => { throw Object.assign(new Error(overflowCode), { code:overflowCode }); };
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || file.size > maxBytes) return overflow();
    const reader = file.stream().getReader();
    const chunks:Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > maxBytes - size || chunks.length >= 65536) return overflow();
        if (value.byteLength) { size += value.byteLength; chunks.push(value); }
      }
    } catch (error) {
      try { await reader.cancel(); } catch { /* Preserve the original read/limit failure. */ }
      throw error;
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { read };
  else root.FileBytes = { read };
})(globalThis);
