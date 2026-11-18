(function (root) {
  'use strict';
  function bind(w:WorkspaceInstance) {
    document.addEventListener('keydown', event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || !event.cancelable || event.defaultPrevented ||
        UI.dialog('workspaceDialog').open || event.isComposing) return;
      const key = event.key.toLowerCase(); let handled = false;
      if (/^[1-9]$/.test(key) && !event.shiftKey) {
        const id = key === '9' ? w.state.tabs.at(-1) : w.state.tabs[Number(key) - 1];
        if (id) { w.activate(id, true); handled = true; }
      }
      if (key === 'tab') handled = root.WorkspaceActions.cycle(w, event.shiftKey ? -1 : 1);
      if (key === 'n' && !event.shiftKey) { w.run(() => w.newFile(true)); handled = true; }
      if (key === 'w' && !event.shiftKey && w.state.active) { const id = w.state.active; w.run(() => w.close(id)); handled = true; }
      if (handled) event.preventDefault();
    });
  }
  root.WorkspaceShortcuts = { bind };
})(globalThis);
