(function (root) {
  'use strict';
  const t:ContentAdapter['t'] = (...args) => root.Content.t(...args);
  async function open(files:ReadonlyArray<MarkdownFile>) {
    const w = root.Workspace;
    if (!w) { UI.html('workspaceNotice').textContent = t('common.unavailable'); return; }
    if (w.pendingDocument || UI.dialog('workspaceDialog').open) {
      w.notice(t('error.markdownBusy')); return;
    }
    await w.run(async () => {
      const folder = w.destination(true) || null;
      root.EditorBridge.capture(w);
      w.pendingLabel = 'import.markdown.reading'; w.pendingDocument = true; w.render();
      try {
        const inputs = await root.MarkdownFiles.read(files);
        const documents = await w.repository.importDocuments(folder, inputs);
        await w.refresh();
        for (const document of documents) w.activate(document.id);
        w.broadcast?.();
        w.notice(t('import.markdown.done.' + new Intl.PluralRules(root.Content.locale).select(documents.length),
          { count:new Intl.NumberFormat(root.Content.locale).format(documents.length) }));
      } finally { w.pendingDocument = false; w.render(); UI.area('editor').focus(); }
    });
  }
  function bind() {
    const input = UI.input('markdownFiles');
    UI.button('markdownOpen').onclick = () => input.click();
    input.onchange = () => { const files = Array.from(input.files || []); input.value = ''; if (files.length) void open(files); };
    let depth = 0;
    const overlay = UI.html('markdownDropHint');
    const isFiles = (event:DragEvent) => event.dataTransfer?.types.includes('Files') === true;
    const hide = () => { depth = 0; overlay.hidden = true; };
    document.addEventListener('dragenter', event => {
      if (!isFiles(event)) return;
      event.preventDefault(); depth++; overlay.hidden = false;
    });
    document.addEventListener('dragleave', event => {
      if (isFiles(event) && --depth <= 0) hide();
    });
    document.addEventListener('dragover', event => {
      if (!isFiles(event) || !event.dataTransfer) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('drop', event => {
      if (!isFiles(event) || !event.dataTransfer) return;
      event.preventDefault(); hide();
      if (Array.from(event.dataTransfer.items).some(item => item.webkitGetAsEntry()?.isDirectory)) {
        UI.html('workspaceNotice').textContent = t('error.markdownType'); return;
      }
      void open(Array.from(event.dataTransfer.files));
    });
    document.addEventListener('dragend', hide); window.addEventListener('blur', hide);
  }
  root.WorkspaceMarkdownImport = { bind, open };
})(globalThis);
