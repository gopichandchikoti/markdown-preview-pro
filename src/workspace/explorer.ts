(function (root) {
  'use strict';
  function renderExplorer({ container, snapshot, state, selected, query, select, open, expand, mode, checked, check }:ExplorerOptions) {
    const activeId = document.activeElement instanceof HTMLElement && container.contains(document.activeElement) ? document.activeElement.dataset.id : null;
    const activeCheck = document.activeElement instanceof HTMLInputElement && container.contains(document.activeElement) ? document.activeElement.dataset.checkId : null;
    container.replaceChildren();
    const matches = new Set();
    for (const r of [...snapshot.folders, ...snapshot.documents]) {
      if (!r.name.toLowerCase().includes(query.toLowerCase())) continue;
      matches.add(r.id);
      let parent = 'folderId' in r ? r.folderId : r.parentId;
      while (parent) { matches.add(parent); parent = snapshot.folders.find(f => f.id === parent)?.parentId ?? null; }
    }
    function children(parentId:string|null, group:HTMLElement, depth:number) {
      const records = [...snapshot.folders.filter(f => f.parentId === parentId),
        ...snapshot.documents.filter(d => d.folderId === parentId)];
      for (const r of records) {
        if (query && !matches.has(r.id)) continue;
        const folder = Object.hasOwn(r, 'parentId');
        const item = document.createElement('li'); item.setAttribute('role', 'none');
        const button = document.createElement('button'); button.type = 'button';
        button.setAttribute('role', 'treeitem'); button.setAttribute('aria-level', String(depth));
        button.setAttribute('aria-selected', String(selected?.id === r.id));
        button.dataset.id = r.id; button.style.paddingLeft = (8 + (depth - 1) * 14 + (mode ? 26 : 0)) + 'px';
        button.tabIndex = (activeId || selected?.id || snapshot.folders[0]?.id) === r.id ? 0 : -1;
        const expanded = query || state.expanded.includes(r.id);
        if (folder) button.setAttribute('aria-expanded', String(Boolean(expanded)));
        button.textContent = root.Content.t(folder ? expanded ? 'glyph.expanded' : 'glyph.collapsed' : 'glyph.file') + r.name;
        button.title = r.name;
        button.addEventListener('click', () => {
          select({ id: r.id, kind: folder ? 'folders' : 'documents' });
          if (folder) expand(r.id); else open(r.id);
        });
        if (mode) {
          const box = document.createElement('input'); box.type = 'checkbox'; box.className = 'row-check';
          box.dataset.checkId = r.id; box.checked = checked.has(r.id);
          box.setAttribute('aria-label', root.Content.t('workspace.selectItem', { name: r.name }));
          box.addEventListener('click', event => check(r.id, event.shiftKey)); item.append(box);
        }
        item.append(button); group.append(item);
        if (folder && expanded) {
          const nested = document.createElement('ul'); nested.setAttribute('role', 'group');
          button.setAttribute('aria-owns', 'group-' + r.id); nested.id = 'group-' + r.id;
          children(r.id, nested, depth + 1); item.append(nested);
        }
      }
    }
    children(null, container, 1);
    if (!container.children.length) { const li = document.createElement('li');
      li.textContent = root.Content.t('workspace.noResults'); li.setAttribute('role', 'none'); container.append(li); }
    if (activeId) container.querySelector<HTMLButtonElement>(`[data-id="${activeId}"]`)?.focus({ preventScroll: true });
    if (activeCheck) container.querySelector<HTMLInputElement>(`input[data-check-id="${activeCheck}"]`)?.focus({ preventScroll: true });
  }
  function keyboard(container:HTMLElement, expand:(id:string)=>void, collapse:(id:string)=>void, select:(id:string)=>void) {
    container.addEventListener('keydown', event => {
      const items = [...container.querySelectorAll<HTMLButtonElement>('[role=treeitem]')];
      const index = document.activeElement instanceof HTMLButtonElement ? items.indexOf(document.activeElement) : -1;
      if (index < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
      const item = items[index]; let next = -1;
      if (event.key === 'ArrowDown') next = Math.min(items.length - 1, index + 1);
      if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = items.length - 1;
      if (event.key === 'ArrowRight' && item.hasAttribute('aria-expanded')) expand(item.dataset.id || '');
      if (event.key === 'ArrowLeft') {
        if (item.getAttribute('aria-expanded') === 'true') collapse(item.dataset.id || '');
        else next = items.findIndex(i => i.getAttribute('aria-owns') === item.closest('[role=group]')?.id);
      }
      if (next >= 0) { items.forEach(i => i.tabIndex = -1); items[next].tabIndex = 0;
        items[next].focus(); select(items[next].dataset.id || ''); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowRight', 'ArrowLeft'].includes(event.key)) event.preventDefault();
    });
  }
  root.WorkspaceExplorer = { renderExplorer, keyboard };
})(globalThis);
