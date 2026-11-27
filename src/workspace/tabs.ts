(function (root) {
  'use strict';
  const t:ContentAdapter['t'] = (...args) => root.Content.t(...args);
  function renderTabs({ container, documents, state, statuses, activate, close, reorder }:TabsOptions) {
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
      wrapper.draggable = true;
      wrapper.addEventListener('dragstart', event => { event.dataTransfer?.setData('text/x-md-tab', id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; wrapper.classList.add('dragging'); });
      wrapper.addEventListener('dragend', () => { wrapper.classList.remove('dragging'); container.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after')); });
      wrapper.addEventListener('dragover', event => {
        if (!event.dataTransfer?.types.includes('text/x-md-tab')) return;
        event.preventDefault(); const box = wrapper.getBoundingClientRect(); const after = event.clientX > box.left + box.width / 2;
        wrapper.classList.toggle('drop-after', after); wrapper.classList.toggle('drop-before', !after);
      });
      wrapper.addEventListener('dragleave', () => wrapper.classList.remove('drop-before', 'drop-after'));
      wrapper.addEventListener('drop', event => {
        const moving = event.dataTransfer?.getData('text/x-md-tab'); if (!moving || moving === id) return;
        event.preventDefault(); const box = wrapper.getBoundingClientRect(); reorder(moving, id, event.clientX > box.left + box.width / 2);
      });
      button.addEventListener('keydown', event => {
        const index = state.tabs.indexOf(id);
        if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault(); const target = state.tabs[index + (event.key === 'ArrowRight' ? 1 : -1)];
          if (target) reorder(id, target, event.key === 'ArrowRight'); return;
        }
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
