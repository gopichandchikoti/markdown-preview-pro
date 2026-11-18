(function (root) {
  'use strict';
  /** Parse strict JSON, rejecting duplicate object keys and excessive nesting before use. */
  function parseJSON(text:string):unknown {
    const stack:Array<Set<string>|null> = [];
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? new Set() : null);
        if (stack.length > 100) throw Error('invalidData');
      } else if (char === '}' || char === ']') stack.pop();
      else if (char === '"') {
        const start = i++;
        while (i < text.length) {
          if (text[i] === '\\') i += 2;
          else if (text[i] === '"') break;
          else i++;
        }
        let next = i + 1;
        while (/\s/.test(text[next] || '') && next < text.length) next++;
        const keys = stack.at(-1);
        if (text[next] === ':' && keys) {
          const key = JSON.parse(text.slice(start, i + 1));
          if (keys.has(key)) throw Error('duplicateKey');
          keys.add(key);
        }
      }
    }
    return JSON.parse(text);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { parseJSON };
  else root.StrictJSON = { parseJSON };
})(globalThis);
