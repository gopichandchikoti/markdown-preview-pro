(function (root) {
  'use strict';
  const t:ContentAdapter['t'] = (...args) => root.Content.t(...args);
  function renderTabs({ container, documents, state, statuses, activate, close }:TabsOptions) {
    const focusId = document.activeElement instanceof HTMLElement && container.contains(document.activeElement) ? document.activeElement.dataset.id : null;
    container.replaceChildren();
    const semantics = document.createElement('div'); semantics.setAttribute('role', 'tablist');
    semantics.className = 'tab-semantics'; semantics.setAttribute('aria-label', t('workspace.tabs'));
    semantics.setAttribute('aria-owns', state.tabs.map(id => 'tab-' + id).join(' '));
    if (state.tabs.length) container.append(semantics);
    for (const id of state.tabs) {
      const doc = documents.find(d => d.id === id);
      if (!doc) continue;
      const wrapper = document.createElement('div'); wrapper.className = 'document-tab'; wrapper.setAttribute('role', 'presentation');
      const button = document.createElement('button');
      button.type = 'button'; button.setAttribute('role', 'tab'); button.id = 'tab-' + id;
      button.dataset.id = id; button.setAttribute('aria-controls', 'documentPanel');
      button.setAttribute('aria-selected', String(state.active === id)); button.tabIndex = state.active === id ? 0 : -1;
      button.textContent = doc.name; button.title = doc.name;
      const status = statuses.get(id) || 'saved';
      if (status !== 'saved') button.textContent += t('glyph.status') + t('common.' + status);
      button.addEventListener('click', () => activate(id));
      button.addEventListener('keydown', event => {
        const index = state.tabs.indexOf(id);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? state.tabs.length - 1 :
          event.key === 'ArrowRight' ? (index + 1) % state.tabs.length :
          event.key === 'ArrowLeft' ? (index - 1 + state.tabs.length) % state.tabs.length : -1;
        if (next >= 0) { event.preventDefault(); activate(state.tabs[next], true); }
        if (event.key === 'Delete') { event.preventDefault(); close(id); }
      });
      const x = document.createElement('button'); x.type = 'button'; x.className = 'tab-close';
      x.setAttribute('aria-label', t('workspace.closeTab', { name: doc.name })); x.textContent = t('glyph.close');
      x.addEventListener('click', () => close(id)); wrapper.append(button, x); container.append(wrapper);
    }
    if (focusId) container.querySelector<HTMLButtonElement>(`[data-id="${focusId}"]`)?.focus({ preventScroll: true });
  }
  root.WorkspaceTabs = { renderTabs };
})(globalThis);
