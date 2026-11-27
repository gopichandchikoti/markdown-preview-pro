for (const element of document.querySelectorAll<HTMLElement>('[data-text]')) element.textContent = Content.t(element.dataset.text || '');
for (const element of document.querySelectorAll<HTMLElement>('[data-label]')) element.setAttribute('aria-label', Content.t(element.dataset.label || ''));
for (const element of document.querySelectorAll<HTMLElement>('[data-placeholder]')) element.setAttribute('placeholder', Content.t(element.dataset.placeholder || ''));
for (const element of document.querySelectorAll<HTMLElement>('[data-tip-key]')) {
  element.dataset.tip = Content.t(element.dataset.tipKey || '');
  element.setAttribute('aria-label', element.dataset.tip);
}
for (const element of document.querySelectorAll<HTMLElement>('[data-meta]')) element.setAttribute('content', Content.t(element.dataset.meta || ''));
for (const element of document.querySelectorAll<HTMLElement>('[data-asset]')) element.setAttribute('href', Content.t(element.dataset.asset || ''));
document.documentElement.lang = Content.locale;
editor.setAttribute('aria-description', Content.t('editor.escape'));
WorkspaceBackup.bind();
WorkspaceMarkdownImport.bind();
if (matchMedia('(max-width: 768px)').matches) UI.html('workspaceShell').classList.add('sidebar-hidden');
UI.html('explorerToggle').onclick = () => UI.html('workspaceShell').classList.toggle('sidebar-hidden');
UI.html('explorerClose').onclick = () => UI.html('workspaceShell').classList.add('sidebar-hidden');
const requiredGlobals = ['WorkspaceImages', 'enhancePreview', 'openPalette', 'insertImageFiles'];
const notLoaded = requiredGlobals.filter(name => !(name in globalThis));
void WorkspaceController.start().then(() => {
  if (!notLoaded.length) return;
  console.error('These app files did not load:', notLoaded.join(', '));
  UI.html('workspaceNotice').textContent = Content.t('common.partialLoad');
});
