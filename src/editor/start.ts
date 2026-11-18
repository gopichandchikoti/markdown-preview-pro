editor.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'b') { e.preventDefault(); insertFormat('**', '**'); }
    if (e.key === 'i') { e.preventDefault(); insertFormat('*', '*'); }
    if (e.key === 's') { e.preventDefault(); exportMarkdown(); }
    if (e.key === 'f') { e.preventDefault(); toggleSearch(); }
  }
  if (e.key === 'Escape') { editor.dataset.leaveWithTab = 'true'; return; }
  if (e.key === 'Tab' && (e.shiftKey || editor.dataset.leaveWithTab === 'true')) {
    delete editor.dataset.leaveWithTab; return;
  }
  delete editor.dataset.leaveWithTab;
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    const start = editor.selectionStart;
    editor.setRangeText('  ', start, start, 'end');
    debouncedRender(); saveContent();
  }
});

editor.addEventListener('input', () => {
  debouncedRender();
  saveContent();
});


const commandHandlers:Record<string,()=>void> = {
  "insertFormat('**','**')": () => insertFormat('**','**'),
  "insertFormat('*','*')": () => insertFormat('*','*'),
  "insertFormat('~~','~~')": () => insertFormat('~~','~~'),
  "insertPrefix('# ')": () => insertPrefix('# '),
  "insertPrefix('## ')": () => insertPrefix('## '),
  "insertPrefix('### ')": () => insertPrefix('### '),
  "insertPrefix('- ')": () => insertPrefix('- '),
  "insertPrefix('1. ')": () => insertPrefix('1. '),
  "insertPrefix('- [ ] ')": () => insertPrefix('- [ ] '),
  "insertPrefix('> ')": () => insertPrefix('> '),
  "insertFormat('`','`')": () => insertFormat('`','`'),
  "insertCodeBlock()": () => insertCodeBlock(),
  "insertTable()": () => insertTable(),
  "insertLink()": () => insertLink(),
  "insertHR()": () => insertHR(),
  "toggleTheme()": () => toggleTheme(),
  "toggleOutline()": () => toggleOutline(),
  "toggleSync()": () => toggleSync(),
  "toggleWrap()": () => toggleWrap(),
  "exportMarkdown()": () => exportMarkdown(),
  "copyHTML()": () => copyHTML(),
  "toggleSearch()": () => toggleSearch(),
  "clearEditor()": () => clearEditor(),

};
document.querySelectorAll<HTMLElement>('[data-command]').forEach(control => {
  const handler = commandHandlers[control.dataset.command || ''];
  if (handler) control.addEventListener('click', handler);
  if (control.dataset.tip) control.setAttribute('aria-label', control.dataset.tip);
});
UI.input('searchInput').addEventListener('input', findInEditor);
UI.html('searchOverlay').addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); toggleSearch(); }
});
preview.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('button.copy-btn') : null;
  if (button instanceof HTMLButtonElement) copyCode(button);
});
preview.addEventListener('change', event => {
  if (event.target instanceof HTMLInputElement && event.target.matches('.task-list input[type="checkbox"]')) toggleTask(event.target);
});
editor.setAttribute('aria-label', Content.t('editor.source'));
UI.input('searchInput').setAttribute('aria-label', Content.t('editor.find'));
UI.html('toast').setAttribute('role', 'status');
editor.disabled = true;
initTheme();
