/* Browser global and CommonJS export share the same security boundary for runtime and tests. */
(function (root) {
  'use strict';
  const MAX_CHARACTERS = 200000;
  function validDocument(source:unknown):source is string {
    return typeof source === 'string' && source.length <= MAX_CHARACTERS &&
      source.split('\n').length <= 10000 && source.split('\n').every(line => line.length <= 10000);
  }

  function safeUrl(value:unknown, imagesOnly = false):string|null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, root.document?.baseURI || 'https://local.invalid/');
      const protocols = imagesOnly ? ['https:', 'http:'] : ['https:', 'http:', 'mailto:'];
      if (!protocols.includes(url.protocol) || url.username || url.password) return null;
      if (imagesOnly && !/^https?:\/\//i.test(value)) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function createSecurity(purifier:typeof import('dompurify')):SecurityAdapter {
    function sanitize(html:string) {
      const fragment = purifier.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img',
          'ul', 'ol', 'li', 'strong', 'em', 'del', 'blockquote', 'pre', 'code', 'span', 'div',
          'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input', 'button'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'type', 'checked'],
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
        SANITIZE_NAMED_PROPS: true,
        RETURN_DOM_FRAGMENT: true,
      });
      for (const link of fragment.querySelectorAll('a')) {
        const href = safeUrl(link.getAttribute('href') || '');
        if (href) link.setAttribute('href', href);
        else link.removeAttribute('href');
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
      for (const image of fragment.querySelectorAll('img')) {
        const url = safeUrl(image.getAttribute('src') || '', true);
        image.removeAttribute('src');
        image.setAttribute('referrerpolicy', 'no-referrer');
        if (url) image.dataset.remoteSrc = url;
      }
      for (const input of fragment.querySelectorAll('input')) {
        if (input.type !== 'checkbox') input.remove();
        else input.setAttribute('aria-label', input.closest('li')?.textContent.trim() || (root.Content ?
          root.Content.t('editor.task') : require('../public/markdown-preview-pro.model.json').locales.en['editor.task']));
      }
      for (const button of fragment.querySelectorAll('button')) button.type = 'button';
      return fragment;
    }
    return { sanitize, validDocument, safeUrl, MAX_CHARACTERS };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createSecurity, validDocument, safeUrl };
  else root.MarkdownSecurity = createSecurity(root.DOMPurify);
})(globalThis);
