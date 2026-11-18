(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const M:ModelAPI = node ? require('./model') : root.WorkspaceModel;
  const bytes:typeof FileBytes = node ? require('../files') : root.FileBytes;
  const security:Pick<SecurityAdapter,'validDocument'> = node ? require('../security') : root.MarkdownSecurity;
  const MAX_FILE_BYTES = 800000;
  const MAX_BATCH_BYTES = 8 * 1024 * 1024;
  async function read(files:ReadonlyArray<MarkdownFile>):Promise<MarkdownImport[]> {
    if (!files.length || files.length > M.MAX_IMPORT_FILES) return M.fail('markdownBytes');
    const names = files.map(file => {
      if (!/\.md$/i.test(file.name)) return M.fail('markdownType');
      return M.normalizeName(file.name, true);
    });
    const documents:MarkdownImport[] = [];
    let total = 0;
    for (const [index, file] of files.entries()) {
      let data:Uint8Array;
      try { data = await bytes.read(file, {
        maxBytes:Math.min(MAX_FILE_BYTES, MAX_BATCH_BYTES - total), overflowCode:'markdownBytes'
      }); }
      catch (error) {
        if (error instanceof Error && 'code' in error && typeof error.code === 'string') throw error;
        return M.fail('markdownRead');
      }
      total += data.byteLength;
      let content:string;
      try { content = new TextDecoder('utf-8', { fatal:true, ignoreBOM:true }).decode(data); }
      catch { return M.fail('markdownEncoding'); }
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content)) return M.fail('markdownEncoding');
      if (!security.validDocument(content)) return M.fail('documentLimit');
      documents.push({ name:names[index], content });
    }
    return documents;
  }
  const api = { read, MAX_FILE_BYTES, MAX_BATCH_BYTES };
  if (node) module.exports = api;
  else root.MarkdownFiles = api;
})(globalThis);
