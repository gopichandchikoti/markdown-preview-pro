(function (root) {
  'use strict';
  function ask({ title, label, value, choices, message }:DialogOptions):Promise<string|true|null> {
    const dialog = UI.dialog('workspaceDialog');
    if (dialog.open) return Promise.resolve(null);
    const form = dialog.querySelector('form'); if (!form) throw Error('Missing dialog form'); form.replaceChildren();
    const heading = document.createElement('h2'); heading.id = 'dialogTitle'; heading.textContent = title; form.append(heading);
    if (message) { const p = document.createElement('p'); p.textContent = message; form.append(p); }
    let input:HTMLInputElement|HTMLSelectElement|undefined;
    if (label) {
      const element = document.createElement('label'); element.textContent = label;
      input = document.createElement(choices ? 'select' : 'input'); input.id = 'dialogValue';
      element.htmlFor = input.id; form.append(element, input);
      if (choices) for (const option of choices) { const node = document.createElement('option');
        node.value = option.value; node.textContent = option.label; input.append(node); }
      else if (input instanceof HTMLInputElement) { input.value = value || ''; input.required = true; input.maxLength = 100; }
    }
    const cancel = document.createElement('button'); cancel.type = 'button';
    cancel.textContent = root.Content.t('common.cancel'); cancel.onclick = () => dialog.close('cancel');
    const confirm = document.createElement('button'); confirm.type = 'submit';
    confirm.textContent = root.Content.t('common.confirm'); form.append(cancel, confirm);
    const previous = document.activeElement;
    return new Promise(resolve => {
      form.onsubmit = event => { event.preventDefault(); dialog.close('confirm'); };
      dialog.addEventListener('close', () => {
        if (previous instanceof HTMLElement) previous.focus(); resolve(dialog.returnValue === 'confirm' ? input ? input.value : true : null);
      }, { once: true });
      dialog.showModal(); if (input) { input.focus(); if (input instanceof HTMLInputElement) input.select(); } else cancel.focus();
    });
  }
  root.WorkspaceDialog = { ask };
})(globalThis);
